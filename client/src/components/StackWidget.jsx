import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Box, ButtonBase, IconButton, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { FRAME_FLICK_EVENT } from './PluginWidgetWrapper.jsx';
import { flickDirection } from '../utils/widgetStacks.js';
import { ownsSideways } from '../utils/flickTarget.js';

// How long the dots stay after a touch, and how long a page turn takes.
const DOTS_MS = 2500;
const TURN_MS = 380;

const withProps = (element, props) => {
  if (React.isValidElement(element) && element.type === Suspense) {
    return React.cloneElement(element, {}, React.cloneElement(element.props.children, props));
  }
  return React.isValidElement(element) ? React.cloneElement(element, props) : element;
};

const reducedMotion = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

/**
 * A Stack (utils/widgetStacks.js): several widgets in one spot, a quick
 * sideways flick turning between them. Dots show which one is up, then fade.
 * It goes back to its home widget after `returnSeconds` untouched: the one
 * needing attention (`attention`), else `home`. With `rotateSeconds` it
 * turns to the next widget that often instead, while nobody touches it.
 *
 * - items: [{ name, label, content }] in order
 * - home: the member it shows first (the mode can choose), else the first
 * - returnSeconds: 0 never goes back on its own
 * - rotateSeconds: 0 never turns on its own
 * - attention: the member name to show now, or null
 * - isActive, expandSize, widgetSize: from the grid, passed to the widget up
 */
const StackWidget = ({ items, home = null, returnSeconds = 60, rotateSeconds = 0, attention = null, isActive = true, expandSize, widgetSize, refreshNonce }) => {
  const { t } = useTranslation('common');
  const [index, setIndex] = useState(() => Math.max(0, home ? items.findIndex((item) => item.name === home) : 0));
  const [dotsShown, setDotsShown] = useState(false);
  const lastTouchRef = useRef(0);
  const startRef = useRef(null);
  const dotsTimer = useRef(null);
  const rootRef = useRef(null);
  const count = items.length;
  const safeIndex = Math.min(index, Math.max(0, count - 1));
  const safeIndexRef = useRef(safeIndex);
  safeIndexRef.current = safeIndex;

  const showDots = useCallback(() => {
    setDotsShown(true);
    clearTimeout(dotsTimer.current);
    dotsTimer.current = setTimeout(() => setDotsShown(false), DOTS_MS);
  }, []);
  useEffect(() => () => clearTimeout(dotsTimer.current), []);

  const go = useCallback((next, { byHand = true } = {}) => {
    if (count === 0) return;
    const clamped = Math.max(0, Math.min(count - 1, next));
    if (byHand) {
      lastTouchRef.current = Date.now();
      showDots();
    }
    setIndex(clamped);
  }, [count, showDots]);

  const homeIndex = useCallback(() => {
    const i = attention ? items.findIndex((item) => item.name === attention) : -1;
    if (i >= 0) return i;
    const h = home ? items.findIndex((item) => item.name === home) : -1;
    return h >= 0 ? h : 0;
  }, [attention, home, items]);

  // The mode changed what it holds or shows first: go there, unless someone's
  // using it right now.
  const shapeKey = `${home || ''}|${items.map((item) => item.name).join(',')}`;
  const shapeRef = useRef(shapeKey);
  useEffect(() => {
    if (shapeRef.current === shapeKey) return;
    shapeRef.current = shapeKey;
    if (Date.now() - lastTouchRef.current > 15000) setIndex(homeIndex());
  }, [shapeKey, homeIndex]);

  // Turning on its own: the next one every so often, while untouched and
  // nothing needs attention. Back to the start after the last.
  useEffect(() => {
    if (!rotateSeconds || count < 2 || attention) return undefined;
    const timer = setInterval(() => {
      if (Date.now() - lastTouchRef.current < rotateSeconds * 1000) return;
      setIndex((current) => (current + 1) % count);
    }, rotateSeconds * 1000);
    return () => clearInterval(timer);
  }, [rotateSeconds, count, attention]);

  // Something needs attention: show it, unless someone's using the stack.
  // Then as soon as they've left it be (it may never go back on its own, with
  // no return time, so it's checked again then rather than missed).
  useEffect(() => {
    if (!attention) return undefined;
    const quietMs = Math.max(returnSeconds, 15) * 1000;
    let timer = null;
    const check = () => {
      const left = quietMs - (Date.now() - lastTouchRef.current);
      if (left <= 0) setIndex(homeIndex());
      else timer = setTimeout(check, left + 50);
    };
    check();
    return () => clearTimeout(timer);
  }, [attention, homeIndex, returnSeconds]);

  // Back home after a while untouched (not while it's turning on its own).
  useEffect(() => {
    if (!returnSeconds || (rotateSeconds && count > 1 && !attention)) return undefined;
    const timer = setInterval(() => {
      if (Date.now() - lastTouchRef.current < returnSeconds * 1000) return;
      setIndex((current) => {
        const home = homeIndex();
        return current === home ? current : home;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [returnSeconds, homeIndex, rotateSeconds, count, attention]);

  // Flicks: on the page itself, and relayed from inside plugin frames.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const onFrameFlick = (event) => {
      if (event.target?.closest?.('.drag-handle')) return;
      go(safeIndexRef.current + (event.detail?.direction === 1 ? 1 : -1));
    };
    el.addEventListener(FRAME_FLICK_EVENT, onFrameFlick);
    return () => el.removeEventListener(FRAME_FLICK_EVENT, onFrameFlick);
  }, [go]);

  const onPointerDown = (event) => {
    lastTouchRef.current = Date.now();
    // Move/Resize: a selected widget is being dragged, not flicked.
    if (event.target?.closest?.('.drag-handle, .resize-button')) {
      startRef.current = null;
      return;
    }
    // A slider, a sideways list, a graph you scrub: the flick is theirs.
    startRef.current = ownsSideways(event.target, rootRef.current)
      ? null
      : { x: event.clientX, y: event.clientY, t: Date.now() };
    showDots();
  };
  const onPointerUp = (event) => {
    const start = startRef.current;
    startRef.current = null;
    const direction = flickDirection(start, { x: event.clientX, y: event.clientY, t: Date.now() });
    if (direction) go(safeIndex + direction);
  };

  if (count === 0) return null;
  const current = items[safeIndex];
  const motion = reducedMotion() ? 'none' : `transform ${TURN_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;

  return (
    <Box
      ref={rootRef}
      role="group"
      data-stack-current={current.name}
      aria-roledescription={t('stacks.roleDescription')}
      aria-label={t('stacks.label', { name: current.label, position: safeIndex + 1, count })}
      onPointerDownCapture={onPointerDown}
      onPointerUpCapture={onPointerUp}
      onPointerCancelCapture={() => { startRef.current = null; }}
      // pan-y: sideways is ours (a flick), up and down still scroll.
      sx={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', touchAction: 'pan-y' }}
    >
      <Box
        sx={{
          display: 'flex',
          width: `${count * 100}%`,
          height: '100%',
          transform: `translateX(-${(safeIndex * 100) / count}%)`,
          transition: motion,
        }}
      >
        {items.map((item, i) => (
          <Box
            key={item.name}
            aria-hidden={i !== safeIndex}
            inert={i !== safeIndex}
            sx={{ width: `${100 / count}%`, height: '100%', flex: 'none', position: 'relative', overflow: 'hidden' }}
          >
            {withProps(item.content, {
              isActive: isActive && i === safeIndex,
              expandSize,
              widgetSize,
              refreshNonce,
              inStack: true,
            })}
          </Box>
        ))}
      </Box>

      {count > 0 && (
        <>
          {[-1, 1].map((step) => {
            const target = safeIndex + step;
            if (target < 0 || target >= count) return null;
            return (
              <IconButton
                key={step}
                onClick={() => go(target)}
                aria-label={t(step > 0 ? 'stacks.next' : 'stacks.previous', { name: items[target].label })}
                sx={{
                  position: 'absolute',
                  top: '50%',
                  [step > 0 ? 'right' : 'left']: 6,
                  transform: 'translateY(-50%)',
                  width: 40,
                  height: 40,
                  zIndex: 5,
                  backgroundColor: 'var(--card-bg)',
                  border: '1px solid var(--card-border)',
                  boxShadow: 'var(--shadow)',
                  color: 'var(--text)',
                  opacity: dotsShown ? 0.92 : 0,
                  pointerEvents: dotsShown ? 'auto' : 'none',
                  transition: 'opacity 250ms ease',
                  '&:hover': { backgroundColor: 'var(--card-bg)' },
                }}
              >
                {step > 0 ? <ChevronRight /> : <ChevronLeft />}
              </IconButton>
            );
          })}
          <Box
            role="tablist"
            aria-label={t('stacks.pages')}
            sx={{
              position: 'absolute',
              left: '50%',
              bottom: 8,
              transform: 'translateX(-50%)',
              zIndex: 5,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.25,
              py: 0.5,
              borderRadius: 999,
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              boxShadow: 'var(--shadow)',
              opacity: dotsShown ? 1 : 0,
              pointerEvents: dotsShown ? 'auto' : 'none',
              transition: 'opacity 250ms ease',
            }}
          >
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', mr: 0.25, whiteSpace: 'nowrap' }}>
              {current.label}
            </Typography>
            {items.map((item, i) => (
              <ButtonBase
                key={item.name}
                role="tab"
                aria-selected={i === safeIndex}
                aria-label={item.label}
                onClick={() => go(i)}
                sx={{
                  width: i === safeIndex ? 18 : 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: i === safeIndex ? 'var(--accent)' : 'var(--text-secondary)',
                  opacity: i === safeIndex ? 1 : 0.45,
                  transition: 'width 200ms ease, opacity 200ms ease',
                  // A bigger target than the dot itself.
                  '&::after': { content: '""', position: 'absolute', inset: -10 },
                }}
              />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
};

export default StackWidget;
