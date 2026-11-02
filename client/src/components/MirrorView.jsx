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
//     viewport below is a native overflow scroll container, so panning a
//     zoomed region is just scrolling — no custom pointer math, and no
//     scroll position ever leaves this browser.
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
// browser's own size, so they stay tappable at any zoom.
import React, { useState, useEffect, useRef } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import WidgetContainer from './WidgetContainer.jsx';
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
  onOpenAdmin,
  onExit,
}) => {
  const { t } = useTranslation('common');
  const [viewport, setViewport] = useState(null);
  const [wrapperWidth, setWrapperWidth] = useState(() =>
    (typeof window !== 'undefined' ? window.innerWidth : MIRROR_FALLBACK_VIEWPORT.width));
  const [zoom, setZoom] = useState(1);
  const [contentHeight, setContentHeight] = useState(800);
  const wrapperRef = useRef(null);
  const scrollRef = useRef(null);
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

  // Keep the view centred on the same region across zoom changes.
  useEffect(() => {
    const prev = prevScaleRef.current;
    prevScaleRef.current = scale;
    const el = scrollRef.current;
    if (!el || prev === null || prev === scale) return;
    const ratio = scale / prev;
    el.scrollLeft = (el.scrollLeft + el.clientWidth / 2) * ratio - el.clientWidth / 2;
    el.scrollTop = (el.scrollTop + el.clientHeight / 2) * ratio - el.clientHeight / 2;
  }, [scale]);

  const dimsLabel = viewport
    ? `${targetWidth}×${viewport.height}${viewport.reported ? '' : ` (${t('mirror.fallbackSize')})`}`
    : '';

  return (
    <Box ref={wrapperRef} sx={{ width: '100%' }}>
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
          padding: '0.5rem', background: 'var(--hg-frame-bg)',
          borderRadius: '8px', marginBottom: '0.5rem',
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: '1 1 auto' }}>
          {t('mirror.mirroring', { name: targetName })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {dimsLabel}{activeTabLabel ? ` · ${t('mirror.tab', { label: activeTabLabel })}` : ''}
        </Typography>
        <Button size="small" variant="outlined" onClick={onToggleLock}>
          {locked ? t('mirror.unlock') : t('mirror.lock')}
        </Button>
        <Button size="small" variant="outlined" onClick={onOpenAdmin}>
          {t('mirror.admin')}
        </Button>
        <Button size="small" variant="contained" onClick={onExit}>
          {t('mirror.exit')}
        </Button>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: '0.5rem' }}>
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

      <Box
        ref={scrollRef}
        sx={{ overflow: 'auto', height: '70dvh', width: '100%' }}
      >
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
    </Box>
  );
};

export default MirrorView;
