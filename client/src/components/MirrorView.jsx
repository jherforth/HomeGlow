// Remote-control mirror mode (v1): render ANOTHER device's dashboard — the
// target's WidgetContainer (grid path) — inside a fixed-width container set
// to the target's reported width, scaled to fit this browser.
//
// What this is NOT, by design:
//   - Not live input mirroring: nothing here sends keystrokes, taps, or
//     pointer events to the target. Only PERSISTED writes (layout saves,
//     device settings) reach the target, via the normal API + the
//     household-changes bump, and the target picks them up on its own.
//   - Not scroll sync: scrolling this view scrolls only this browser. The
//     view scrolls as ordinary page scroll — the canvas sits at its full
//     content height in page flow, exactly like the target kiosk's own
//     dashboard scrolls its page. An earlier nested 70dvh scroll container
//     stranded below-fold widgets on phones: the kiosk reaches them by
//     page-scrolling, and the mirror now does the same, so every widget is
//     reachable and a zoomed region pans by scrolling on both axes.
//   - Not tab sync: the active tab is app.jsx's local state. The banner
//     names the tab being edited so a silent edit to a non-visible tab is
//     never a surprise.
//
// Drag math: the canvas is CSS `transform: scale(S)`, which does NOT change
// layout — the grid container still measures its full target width, so it
// keeps the target's column count. RGL's drag math divides screen deltas
// and rects by positionStrategy.scale, so WidgetContainer gets
// gridTransformScale={S} and drags land on the right row/column instead of
// undershooting by S.
//
// The banner and zoom controls sit OUTSIDE the scaled canvas, at this
// browser's own size, in a sticky strip, so they stay tappable at any zoom
// and at any scroll position. The strip sits behind the Admin dialog when
// Admin is open (the dialog carries its own banner above the panel), so
// it never double-banners.
import React, { useState, useEffect, useRef } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import WidgetContainer from './WidgetContainer.jsx';
import MirrorBanner from './MirrorBanner.jsx';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { MIRROR_FALLBACK_VIEWPORT } from '../utils/mirrorMode.js';

const ZOOM_LEVELS = [1, 2, 3];

const MirrorView = ({
  targetName,
  widgets = [],
  locked = true,
  activeTab = 1,
  activeTabId = 1,
  activeTabLabel = null,
  deviceWidgetSettings = {},
  devicePluginSettings = {},
  isActive = true,
  expandSettings = null,
  onExpandedSizeChange,
  onToggleLock,
  onExit,
}) => {
  const { t } = useTranslation('common');
  const [viewport, setViewport] = useState(null);
  const [wrapperWidth, setWrapperWidth] = useState(() =>
    (typeof window !== 'undefined' ? window.innerWidth : MIRROR_FALLBACK_VIEWPORT.width));
  const [zoom, setZoom] = useState(1);
  const [contentHeight, setContentHeight] = useState(800);
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const prevScaleRef = useRef(null);

  // The target's reported size (its dashboard posts it on load/resize).
  // Fetched by explicit name — never through the session override — and a
  // target that never reported gets the documented kiosk fallback size.
  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_BASE_URL}/api/devices/${encodeURIComponent(targetName)}/viewport`)
      .then((response) => {
        if (cancelled) return;
        const reported = response.data?.viewport;
        if (reported && Number.isInteger(reported.width) && reported.width > 0
          && Number.isInteger(reported.height) && reported.height > 0) {
          setViewport({ ...reported, reported: true });
        } else {
          setViewport({ ...MIRROR_FALLBACK_VIEWPORT, reported: false });
        }
      })
      .catch(() => {
        if (!cancelled) setViewport({ ...MIRROR_FALLBACK_VIEWPORT, reported: false });
      });
    return () => { cancelled = true; };
  }, [targetName]);

  useEffect(() => {
    const measure = () => {
      if (wrapperRef.current) setWrapperWidth(wrapperRef.current.clientWidth);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // The canvas's unscaled content height drives the wrapper's scaled height
  // (a transform does not change layout size, so without this the scroll
  // area would be the unscaled size and the view would scroll through
  // empty space).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      setContentHeight(canvas.scrollHeight || 800);
    });
    observer.observe(canvas);
    setContentHeight(canvas.scrollHeight || 800);
    return () => observer.disconnect();
  }, [widgets, activeTab, viewport]);

  const targetWidth = viewport?.width || MIRROR_FALLBACK_VIEWPORT.width;
  const fitScale = wrapperWidth > 0 ? Math.min(1, wrapperWidth / targetWidth) : 1;
  const scale = fitScale * zoom;

  // Keep the view centred on the same region across zoom changes, in page
  // scroll coordinates (the canvas is in page flow; there is no inner
  // scroll element to centre anymore).
  useEffect(() => {
    const prev = prevScaleRef.current;
    prevScaleRef.current = scale;
    if (prev === null || prev === scale) return;
    const ratio = scale / prev;
    const cx = window.scrollX + window.innerWidth / 2;
    const cy = window.scrollY + window.innerHeight / 2;
    window.scrollTo(cx * ratio - window.innerWidth / 2, cy * ratio - window.innerHeight / 2);
  }, [scale]);

  const dimsLabel = viewport
    ? `${targetWidth}×${viewport.height}${viewport.reported ? '' : ` (${t('mirror.fallbackSize')})`}`
    : '';

  return (
    <Box ref={wrapperRef} sx={{ width: '100%' }}>
      {/* Sticky header: banner + zoom stay reachable at any scroll depth.
          Solid page background so canvas content never shows through the
          strip while it scrolls underneath; the zoom row's bottom margin
          moves into the strip's padding for the same reason. */}
      <Box sx={{
        position: 'sticky', top: 0, zIndex: 1100,
        background: 'var(--container-background-override)',
        paddingBottom: '0.5rem',
      }}>
        <MirrorBanner
          targetName={targetName}
          locked={locked}
          onToggleLock={onToggleLock}
          onExit={onExit}
          extra={(
            <Typography variant="body2" color="text.secondary">
              {dimsLabel}{activeTabLabel ? ` · ${t('mirror.tab', { label: activeTabLabel })}` : ''}
            </Typography>
          )}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">{t('mirror.zoom')}:</Typography>
          {ZOOM_LEVELS.map((level) => (
            <Button
              key={level}
              size="small"
              variant={zoom === level ? 'contained' : 'outlined'}
              onClick={() => setZoom(level)}
            >
              {level === 1 ? t('mirror.fit') : `${level}×`}
            </Button>
          ))}
        </Box>
      </Box>

      {/* Full content height in page flow: the page itself is the scroll
          area, so every widget — including below-fold ones — is reachable
          by scrolling, and a zoomed region pans by scrolling both axes. */}
      <Box sx={{ width: `${targetWidth * scale}px`, height: `${contentHeight * scale}px`, position: 'relative' }}>
        <Box
          ref={canvasRef}
          sx={{ width: `${targetWidth}px`, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          <WidgetContainer
            widgets={widgets}
            locked={locked}
            activeTab={activeTab}
            activeTabId={activeTabId}
            deviceWidgetSettings={deviceWidgetSettings}
            devicePluginSettings={devicePluginSettings}
            isActive={isActive}
            expandSettings={expandSettings}
            onExpandedSizeChange={onExpandedSizeChange}
            gridTransformScale={scale}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default MirrorView;
