import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { API_BASE_URL } from '../utils/apiConfig.js';
import {
  MIN_COLLAGE_PHOTOS,
  chooseTemplate,
  countOrientations,
  fillTemplate,
  orientationOf,
  pickReplacementIndex,
  shuffled,
  templatesForScreen,
} from '../utils/photoCollage.js';

// The photo list carries no dimensions, so each photo's shape is read by
// loading its thumbnail. Only a window of photos ahead of the wall is measured
// at a time: for sources whose thumbnail is the full image, measuring a whole
// library up front would download all of it before the first tile appeared.
const MEASURE_AHEAD = 16;
const MEASURE_CONCURRENCY = 4;
const FIRST_LAYOUT_AT = 10;
const LOAD_TIMEOUT_MS = 15000;
// Half the gap between neighbouring tiles.
const TILE_INSET = 4;

const srcOf = (path) => `${API_BASE_URL}${path}`;

// Resolves with the loaded image, or null if it failed or took too long. A
// photo that cannot load is dropped from the wall rather than shown broken.
const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  let settled = false;
  const finish = (value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve(value);
  };
  const timer = setTimeout(() => finish(null), LOAD_TIMEOUT_MS);
  img.onload = () => finish(img);
  img.onerror = () => finish(null);
  img.src = src;
});

const isPortraitScreen = () => window.innerHeight > window.innerWidth;

const fadeIn = {
  animation: 'collageFadeIn 1.2s ease-in-out',
  '@keyframes collageFadeIn': {
    '0%': { opacity: 0 },
    '100%': { opacity: 1 },
  },
};

const tileImageSx = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  // Faces sit in the upper part of most photos; cropping from the middle
  // takes the tops of heads first.
  objectPosition: 'center 35%',
};

/**
 * Several photos tiled across the screen, matched to slots of their own shape.
 * One tile changes per `step`, crossfading over the photo it replaces; every
 * few rounds the whole arrangement changes.
 *
 * Calls `onUnavailable` if fewer than MIN_COLLAGE_PHOTOS photos can be loaded,
 * so the caller can fall back to a single photo.
 */
const PhotoCollage = ({ photos, step, onUnavailable }) => {
  const [portraitScreen, setPortraitScreen] = useState(isPortraitScreen);
  const [view, setView] = useState(null); // { layout, previousLayout }

  // Bumped on every (re)start and on unmount. Async work checks it still
  // belongs to the current run: under StrictMode the effect runs twice, and a
  // plain "still mounted" flag let the first run's thumbnails land in the
  // second run's queue, putting the same photo on the wall twice.
  const generation = useRef(0);
  const order = useRef([]); // every photo, shuffled, in measuring order
  const nextToMeasure = useRef(0);
  const inFlight = useRef(0);
  const fresh = useRef([]); // measured, not yet shown this cycle
  const seen = useRef([]); // shown this cycle, waiting for the next
  const layoutRef = useRef(null); // { id, template, tiles: [{ photo, previous }] }
  const swapOrder = useRef([]);
  const swapsSinceRebuild = useRef(0);
  const layoutSeq = useRef(0);
  const building = useRef(false);
  const portraitRef = useRef(portraitScreen);
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  const exhausted = () => nextToMeasure.current >= order.current.length;

  // Start the next cycle once every photo has been through the wall.
  const recycle = () => {
    if (!exhausted() || !seen.current.length) return false;
    fresh.current.push(...shuffled(seen.current));
    seen.current = [];
    return true;
  };

  const commit = (layout) => {
    const previousLayout = layoutRef.current;
    layoutRef.current = layout;
    setView({ layout, previousLayout: previousLayout && previousLayout.id !== layout.id ? previousLayout : null });
  };

  const buildLayout = useCallback(async () => {
    if (building.current) return;
    building.current = true;
    try {
      await arrange();
    } finally {
      building.current = false;
    }
  }, []);

  const arrange = async () => {
    const run = generation.current;
    const outgoing = layoutRef.current;
    const onScreen = outgoing ? outgoing.tiles.map((t) => t.photo) : [];
    const templates = templatesForScreen(portraitRef.current ? 1 : 2, portraitRef.current ? 2 : 1);

    let template = chooseTemplate(templates, countOrientations(fresh.current), outgoing?.template.id);
    if (!template && recycle()) {
      template = chooseTemplate(templates, countOrientations(fresh.current), outgoing?.template.id);
    }
    if (!template) {
      // Not enough fresh photos of the right shapes yet: borrow the ones on
      // screen rather than stall, so a small library still rearranges.
      const pool = [...fresh.current, ...onScreen];
      template = chooseTemplate(templates, countOrientations(pool), outgoing?.template.id);
      if (!template) {
        // A handful of photos in shapes no arrangement takes — two portraits
        // and a landscape, say. With nothing on screen yet and nothing left to
        // measure, it never will fit: hand back to the single photo rather
        // than leave the screen black.
        if (!outgoing && exhausted() && inFlight.current === 0) onUnavailableRef.current?.();
        return;
      }
      fresh.current = pool;
      onScreen.length = 0; // they are in the pool now, not bound for `seen`
    }

    const { assigned, rest } = fillTemplate(template, fresh.current);
    fresh.current = rest;

    // Load every tile before showing any, so the new arrangement fades in
    // whole instead of tile by tile over black.
    const loaded = await Promise.all(assigned.map((photo) => (photo ? loadImage(srcOf(photo.url)) : null)));
    if (run !== generation.current) return;

    const tiles = [];
    let missing = false;
    assigned.forEach((photo, i) => {
      if (photo && loaded[i]) tiles.push({ photo, previous: null });
      else missing = true;
    });
    if (missing) {
      // A photo failed to load, or the queue ran short. Put the good ones back
      // and try again on the next step rather than leave a hole in the wall.
      assigned.forEach((photo, i) => { if (photo && loaded[i]) fresh.current.unshift(photo); });
      return;
    }

    seen.current.push(...onScreen);
    swapOrder.current = [];
    swapsSinceRebuild.current = 0;
    layoutSeq.current += 1;
    commit({ id: layoutSeq.current, template, tiles });
  };

  const swapOne = useCallback(async () => {
    const run = generation.current;
    const layout = layoutRef.current;
    if (!layout) return;
    if (!swapOrder.current.length) swapOrder.current = shuffled(layout.tiles.map((_, i) => i));
    const slotIndex = swapOrder.current.shift();
    const slot = layout.template.slots[slotIndex];
    const onScreenIds = layout.tiles.map((t) => t.photo.id);

    // A photo of the slot's shape: an unseen one if possible, else one already
    // shown this cycle. With neither, the slot keeps its photo until the next
    // rearrangement rather than crop the wrong shape into it.
    let source = fresh.current;
    let index = pickReplacementIndex(slot.want, source, onScreenIds);
    if (index === -1 && recycle()) index = pickReplacementIndex(slot.want, source, onScreenIds);
    if (index === -1) {
      source = seen.current;
      index = pickReplacementIndex(slot.want, source, onScreenIds);
    }
    if (index === -1) return;
    const [photo] = source.splice(index, 1);

    const img = await loadImage(srcOf(photo.url));
    // The arrangement may have changed while the photo loaded.
    if (run !== generation.current || layoutRef.current !== layout) {
      if (img) fresh.current.unshift(photo);
      return;
    }
    if (!img) return;

    const old = layout.tiles[slotIndex].photo;
    seen.current.push(old);
    const tiles = layout.tiles.slice();
    tiles[slotIndex] = { photo, previous: old };
    commit({ ...layout, tiles });
  }, []);

  // Measure photos a few at a time, keeping a window of them ready ahead of
  // the wall. Settles the first layout once enough are in.
  const pump = useCallback(() => {
    const run = generation.current;
    while (
      inFlight.current < MEASURE_CONCURRENCY
      && !exhausted()
      && fresh.current.length + inFlight.current < MEASURE_AHEAD
    ) {
      const photo = order.current[nextToMeasure.current];
      nextToMeasure.current += 1;
      inFlight.current += 1;
      loadImage(srcOf(photo.thumbnail || photo.url)).then((img) => {
        if (run !== generation.current) return;
        inFlight.current -= 1;
        if (img) {
          fresh.current.push({
            ...photo,
            // Two sources can number their photos the same way; the URL is
            // what actually distinguishes them.
            id: photo.url,
            orientation: orientationOf(img.naturalWidth, img.naturalHeight),
          });
        }
        const allMeasured = exhausted() && inFlight.current === 0;
        if (!layoutRef.current && (fresh.current.length >= FIRST_LAYOUT_AT || allMeasured)) {
          if (allMeasured && fresh.current.length < MIN_COLLAGE_PHOTOS) {
            onUnavailableRef.current?.();
            return;
          }
          if (!layoutRef.current) buildLayout();
        }
        pump();
      });
    }
  }, [buildLayout]);

  useEffect(() => {
    generation.current += 1;
    order.current = shuffled(photos.filter((p) => p?.url));
    nextToMeasure.current = 0;
    inFlight.current = 0;
    building.current = false;
    fresh.current = [];
    seen.current = [];
    layoutRef.current = null;
    setView(null);
    if (order.current.length < MIN_COLLAGE_PHOTOS) {
      onUnavailableRef.current?.();
    } else {
      pump();
    }
    return () => { generation.current += 1; };
  }, [photos, pump]);

  // A wall display rotated to portrait needs the templates turned too.
  useEffect(() => {
    const onResize = () => setPortraitScreen(isPortraitScreen());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (portraitRef.current === portraitScreen) return;
    portraitRef.current = portraitScreen;
    if (layoutRef.current) buildLayout();
  }, [portraitScreen, buildLayout]);

  // One tile per step; a new arrangement once every tile has changed about
  // twice, so the wall never settles into a fixed pattern.
  const firstStep = useRef(step);
  useEffect(() => {
    if (step === firstStep.current || !layoutRef.current) return;
    swapsSinceRebuild.current += 1;
    if (swapsSinceRebuild.current > layoutRef.current.tiles.length * 2) {
      buildLayout();
    } else {
      swapOne();
    }
    pump();
  }, [step, buildLayout, swapOne, pump]);

  if (!view) return null;

  const renderLayout = (layout, animate) => (
    <Box
      key={layout.id}
      aria-hidden={!animate}
      sx={{ position: 'absolute', inset: `${TILE_INSET}px`, ...(animate ? fadeIn : {}) }}
    >
      {layout.tiles.map((tile, i) => {
        const slot = layout.template.slots[i];
        return (
          <Box
            key={i}
            sx={{
              position: 'absolute',
              left: `${slot.x * 100}%`,
              top: `${slot.y * 100}%`,
              width: `${slot.w * 100}%`,
              height: `${slot.h * 100}%`,
              p: `${TILE_INSET}px`,
            }}
          >
            <Box sx={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: 'var(--hg-radius-md)', backgroundColor: '#0b0b0b' }}>
              {/* The outgoing photo stays underneath while the new one fades
                  in over it, so a swap never flashes through to black. */}
              {tile.previous && (
                <Box component="img" key={tile.previous.id} src={srcOf(tile.previous.url)} alt="" sx={tileImageSx} />
              )}
              <Box
                component="img"
                key={tile.photo.id}
                src={srcOf(tile.photo.url)}
                alt=""
                sx={{ ...tileImageSx, ...(tile.previous ? fadeIn : {}) }}
              />
            </Box>
          </Box>
        );
      })}
    </Box>
  );

  return (
    <Box data-testid="photo-collage" sx={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {view.previousLayout && renderLayout(view.previousLayout, false)}
      {renderLayout(view.layout, true)}
    </Box>
  );
};

export default PhotoCollage;
