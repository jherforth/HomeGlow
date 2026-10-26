import React, { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { usePageVisibility } from '../hooks/useScreenActivity.js';
import { shuffled } from '../utils/photoCollage.js';
import {
  chooseSpot,
  emptyCoverage,
  markCovered,
  printSize,
  printsToRetire,
  tiltFor,
} from '../utils/coffeeTable.js';
import PhotoDetails from './PhotoDetails.jsx';

// The Coffee Table screensaver: prints dropped one at a time onto a table, as
// if tossed toward the camera. Each lands at a slight angle where the table
// was covered longest ago (utils/coffeeTable.js), so the pile keeps the whole
// screen covered and keeps changing. The oldest prints fade away underneath.
//
// `seconds` is the time between drops. The first few land quickly, so the
// table isn't bare for the first minute.

const OPENING_DROPS = 6;
const OPENING_GAP_MS = 450;
const FADE_MS = 1500;
const LOAD_TIMEOUT_MS = 15000;

const srcOf = (path) => `${API_BASE_URL}${path}`;

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  const timer = setTimeout(() => resolve(null), LOAD_TIMEOUT_MS);
  img.onload = () => { clearTimeout(timer); resolve(img); };
  img.onerror = () => { clearTimeout(timer); resolve(null); };
  img.src = src;
});

// From above the table, close to the camera, to where it lands. The start
// tilt differs from the landing one, so each print turns a little as it falls.
const dropSx = {
  animation: 'coffeeDrop 1.1s cubic-bezier(0.2, 0.7, 0.25, 1) both',
  '@keyframes coffeeDrop': {
    '0%': {
      transform: 'translate(-50%, -50%) rotate(var(--tilt-from)) scale(2.6)',
      opacity: 0,
      filter: 'blur(8px)',
    },
    '35%': { opacity: 1 },
    '75%': {
      transform: 'translate(-50%, -50%) rotate(var(--tilt)) scale(0.985)',
      filter: 'blur(0)',
    },
    '100%': {
      transform: 'translate(-50%, -50%) rotate(var(--tilt)) scale(1)',
      filter: 'blur(0)',
    },
  },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
};

export default function CoffeeTable({ photos, seconds = 4, showDetails = false }) {
  const pageVisible = usePageVisibility();
  const [prints, setPrints] = useState([]);
  const queue = useRef([]);
  const coverage = useRef(emptyCoverage());
  const seq = useRef(0);
  const dropping = useRef(false);
  const alive = useRef(true);

  const nextPhoto = () => {
    if (!queue.current.length) queue.current = shuffled(photos.filter((p) => p?.url));
    return queue.current.shift();
  };

  const dropOne = async () => {
    if (dropping.current) return;
    dropping.current = true;
    try {
      // A photo that won't load is skipped for the next one, a few at most.
      for (let tries = 0; tries < 3; tries += 1) {
        const photo = nextPhoto();
        if (!photo) return;
        const img = await loadImage(srcOf(photo.url));
        if (!alive.current) return;
        if (!img) continue;

        const viewW = window.innerWidth;
        const viewH = window.innerHeight;
        const { width, height } = printSize(viewW, viewH, img.naturalWidth / img.naturalHeight);
        const spot = chooseSpot({ viewW, viewH, width, height, coverage: coverage.current });
        seq.current += 1;
        coverage.current = markCovered(coverage.current, spot.cells, seq.current);
        const tilt = tiltFor();
        const print = {
          key: seq.current,
          photo,
          x: spot.x,
          y: spot.y,
          width,
          height,
          tilt,
          tiltFrom: tilt + (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 10),
          leaving: false,
        };
        setPrints((current) => {
          const next = [...current, print];
          const retire = new Set(printsToRetire(next));
          if (!retire.size) return next;
          setTimeout(() => {
            if (alive.current) setPrints((now) => now.filter((p) => !retire.has(p.key)));
          }, FADE_MS);
          return next.map((p) => (retire.has(p.key) ? { ...p, leaving: true } : p));
        });
        return;
      }
    } finally {
      dropping.current = false;
    }
  };
  const dropRef = useRef(dropOne);
  dropRef.current = dropOne;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // A new photo list starts a fresh table.
  useEffect(() => {
    queue.current = [];
    coverage.current = emptyCoverage();
    setPrints([]);
  }, [photos]);

  // The opening handful, then one every `seconds`; nothing while hidden. The
  // opening keeps going until the table has had that many, whatever stopped
  // it, and waits out a drop still loading its photo rather than be turned
  // away by it.
  useEffect(() => {
    if (!pageVisible || !photos.length) return undefined;
    let cancelled = false;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    (async () => {
      while (!cancelled && seq.current < OPENING_DROPS) {
        while (!cancelled && dropping.current) await sleep(50);
        if (cancelled) return;
        await dropRef.current();
        await sleep(OPENING_GAP_MS);
      }
    })();
    const interval = setInterval(() => dropRef.current(), Math.max(1, seconds) * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pageVisible, photos, seconds]);

  return (
    <Box
      data-testid="coffee-table"
      sx={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        // A dim tabletop under a lamp, for the moments before it's covered.
        background: 'radial-gradient(ellipse at 50% 40%, #2b2622 0%, #15120f 65%, #0b0a09 100%)',
      }}
    >
      {prints.map((print) => {
        const border = Math.max(6, print.width * 0.035);
        return (
          <Box
            key={print.key}
            data-testid="coffee-print"
            style={{ '--tilt': `${print.tilt}deg`, '--tilt-from': `${print.tiltFrom}deg` }}
            sx={{
              position: 'absolute',
              left: `${print.x}px`,
              top: `${print.y}px`,
              zIndex: print.key,
              transform: 'translate(-50%, -50%) rotate(var(--tilt))',
              backgroundColor: '#fbfaf7',
              p: `${border}px`,
              pb: `${border}px`,
              borderRadius: '2px',
              boxShadow: '0 6px 18px var(--hg-black-50), 0 1px 3px var(--hg-black-30)',
              opacity: print.leaving ? 0 : 1,
              transition: `opacity ${FADE_MS}ms ease`,
              ...dropSx,
            }}
          >
            <Box
              component="img"
              src={srcOf(print.photo.url)}
              alt=""
              sx={{ display: 'block', width: `${print.width}px`, height: `${print.height}px`, objectFit: 'cover' }}
            />
            {showDetails && (
              <Box sx={{ width: `${print.width}px` }}>
                <PhotoDetails photo={print.photo} variant="print" />
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
