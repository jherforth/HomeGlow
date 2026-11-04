import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { TabIcon } from '../components/TabBar.jsx';
import { readGridMetrics } from '../utils/gridMetrics.js';

// Hold a dragged widget over a tab in the dock, or at the side of the screen,
// this long and that tab opens with the widget still in hand.
export const CARRY_DWELL_MS = 500;
// How close to the left or right of the screen counts as "the side". The strip
// starts to show a little further in, so it's there before you reach it.
export const EDGE_PX = 64;
export const EDGE_HINT_PX = 160;
// Around the dock, how far above and below it still counts as on it, and how
// far past a tab's icon still picks that tab.
const DOCK_REACH_Y = 56;
const DOCK_REACH_X = 14;
const PITCH_PX = 116; // utils/gridMetrics.js GRID_PITCH: a row plus its gap
const SLIDE_MS = 280;

const pointOf = (event) => {
  const touch = event?.changedTouches?.[0] || event?.touches?.[0];
  if (touch) return { x: touch.clientX, y: touch.clientY };
  if (event && Number.isFinite(event.clientX)) return { x: event.clientX, y: event.clientY };
  return null;
};

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// The free spot closest to `want`, among the rows down to just below
// everything already there.
export function nearestFreeCell(want, others) {
  const bottom = Math.max(want.y, ...others.map((item) => item.y + item.h));
  let best = null;
  let bestDistance = Infinity;
  for (let y = 0; y <= bottom; y += 1) {
    for (let x = 0; x + want.w <= 12; x += 1) {
      const candidate = { x, y, w: want.w, h: want.h };
      if (others.some((item) => overlaps(item, candidate))) continue;
      const distance = Math.hypot(x - want.x, (y - want.y) * 1.5);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
  }
  return best;
}

/**
 * Which dock button a point picks: anywhere in a band around the dock, the
 * button whose middle is nearest, as long as it's within reach. So a finger
 * doesn't need to be exactly on a small icon. `items` is [{ value, rect }].
 * Pure, for tests.
 */
export function pickDockTarget(x, y, items, reachX = DOCK_REACH_X, reachY = DOCK_REACH_Y) {
  if (!items.length) return null;
  const top = Math.min(...items.map((item) => item.rect.top)) - reachY;
  const bottom = Math.max(...items.map((item) => item.rect.bottom)) + reachY;
  if (y < top || y > bottom) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const item of items) {
    const middle = (item.rect.left + item.rect.right) / 2;
    const half = (item.rect.right - item.rect.left) / 2;
    const distance = Math.abs(x - middle);
    if (distance <= half + reachX && distance < bestDistance) {
      best = item.value;
      bestDistance = distance;
    }
  }
  return best;
}

/** The dock button under a point, by selector: [{ selector, value(el) }]. */
export function dockTargetFrom(kinds) {
  return (x, y) => {
    const items = [];
    for (const kind of kinds) {
      document.querySelectorAll(kind.selector).forEach((el) => {
        items.push({ value: kind.value(el), rect: el.getBoundingClientRect() });
      });
    }
    return pickDockTarget(x, y, items);
  };
}

/** Slide a tab's content in from one side: direction 1 from the right. */
export function slideIn(el, direction) {
  if (!el?.animate || !direction) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
  el.animate(
    [
      { transform: `translateX(${direction * 72}px)`, opacity: 0.35 },
      { transform: 'translateX(0)', opacity: 1 },
    ],
    { duration: SLIDE_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
  );
}

// The widget, copied for the card that follows the finger. Plugins draw in
// frames, which can't be copied, so a frame becomes a plain panel.
function snapshotOf(el, scale = 1) {
  if (!el) return null;
  const copy = el.cloneNode(true);
  copy.removeAttribute('data-widget-name');
  copy.querySelectorAll('[data-widget-name]').forEach((node) => node.removeAttribute('data-widget-name'));
  copy.querySelectorAll('iframe').forEach((frame) => {
    const panel = document.createElement('div');
    panel.style.cssText = 'width:100%;height:100%;background:var(--hg-frame-bg, var(--card-bg));';
    frame.replaceWith(panel);
  });
  copy.querySelectorAll('.resize-button, .drag-handle, .expand-controls').forEach((node) => node.remove());
  // The grid places its items with a transform on this same element.
  copy.classList.remove('react-grid-item', 'react-draggable', 'react-draggable-dragging', 'cssTransforms');
  copy.style.transform = 'none';
  copy.style.position = 'relative';
  copy.style.left = '0';
  copy.style.top = '0';
  // Drawn at full size and shrunk like the grid it came from.
  copy.style.width = `${100 / scale}%`;
  copy.style.height = `${100 / scale}%`;
  copy.style.transform = scale !== 1 ? `scale(${scale})` : 'none';
  copy.style.transformOrigin = 'top left';
  copy.style.margin = '0';
  return copy;
}

/**
 * Carrying a widget to another tab while dragging it, like moving an app on a
 * phone (Move/Resize). Hold it over a tab in the
 * dock, or at the side of the screen, and that tab opens with the widget in
 * hand: a lifted copy follows the finger and an outline shows where it will
 * land. Letting go over a tab without waiting still sends it there.
 *
 * - tabs, activeTab, setTab(number)
 * - dockTargetAt(x, y): the tab number under a point in the dock, 'add' for
 *   the + button, or null (dockTargetFrom builds one)
 * - sizeOf(name): the widget's size in grid units, { w, h }
 * - placedOn(): the active tab's widgets as { name: {x,y,w,h} }
 * - gridRoot(): the element holding the grid
 * - scale: how much the grid is shown scaled
 * - onDrop({ name, fromTab, toTab, cell }): cell {x,y,w,h}, or null for
 *   "anywhere it fits"
 * - onDropAdd({ name, fromTab }): let go over the + button
 *
 * Returns { dragging, carrying, hoverTarget, pending, carryKey, onDrag,
 * onDragStop, overlay }. `pending` is the tab about to open (show it filling),
 * `dragging` is true for the whole drag (lift the dock). Leave the carried
 * widget out of the grid, and remount the grid when `carryKey` changes.
 * Render `overlay` once, above the page.
 */
export default function useCarryToTab({
  tabs,
  activeTab,
  setTab,
  dockTargetAt,
  sizeOf,
  placedOn,
  gridRoot,
  scale = 1,
  onDrop,
  onDropAdd,
}) {
  const [dragging, setDragging] = useState(false);
  const [carrying, setCarrying] = useState(null);
  const [hoverTarget, setHoverTarget] = useState(null);
  const [pending, setPending] = useState(null);
  const [edge, setEdge] = useState(null);
  const [point, setPoint] = useState(null);
  const [landing, setLanding] = useState(null);
  const [carryKey, setCarryKey] = useState(0);
  const [bounce, setBounce] = useState(0);
  const dwellRef = useRef({ target: null, timer: null });
  const dragRef = useRef({ name: null, point: null });
  const snapshotRef = useRef(null);
  const ghostHostRef = useRef(null);
  const live = useRef({});
  live.current = { tabs, activeTab, setTab, dockTargetAt, sizeOf, placedOn, gridRoot, scale, onDrop, onDropAdd, carrying };

  const tabAfter = useCallback((direction) => {
    const numbers = live.current.tabs.map((tab) => tab.number);
    const index = numbers.indexOf(live.current.activeTab);
    if (index < 0) return null;
    return numbers[index + direction] ?? null;
  }, []);

  // What a point is over: a tab in the dock, the + button, or a side of the
  // screen (the tab before or after the open one).
  const targetAt = useCallback((x, y) => {
    const overDock = live.current.dockTargetAt(x, y);
    if (overDock != null) return { target: overDock, side: null };
    if (x <= EDGE_PX) return { target: tabAfter(-1), side: 'left' };
    if (x >= window.innerWidth - EDGE_PX) return { target: tabAfter(1), side: 'right' };
    return { target: null, side: null };
  }, [tabAfter]);

  // The strip at a side shows as the finger comes near, filling once it's in.
  const edgeFor = useCallback((x) => {
    const left = x <= EDGE_HINT_PX ? tabAfter(-1) : null;
    const right = x >= window.innerWidth - EDGE_HINT_PX ? tabAfter(1) : null;
    if (left != null) return { side: 'left', tab: left, armed: x <= EDGE_PX };
    if (right != null) return { side: 'right', tab: right, armed: x >= window.innerWidth - EDGE_PX };
    return null;
  }, [tabAfter]);

  const clearDwell = useCallback(() => {
    clearTimeout(dwellRef.current.timer);
    dwellRef.current = { target: null, timer: null };
    setPending(null);
  }, []);

  // The cell under the card on the open tab (nearest free one), and where
  // that is on screen, or null when the tab has no grid.
  const landingAt = useCallback((x, y, carry) => {
    const root = live.current.gridRoot?.();
    const grid = root?.querySelector?.('.react-grid-layout');
    if (!grid || !carry) return null;
    const r = grid.getBoundingClientRect();
    const s = live.current.scale || 1;
    const { gap } = readGridMetrics();
    const g = gap * s;
    const colWidth = (r.width - g * 11) / 12;
    const w = Math.min(12, carry.size.w);
    const want = {
      x: Math.min(12 - w, Math.max(0, Math.round((x - carry.grab.x - r.left) / (colWidth + g)))),
      y: Math.max(0, Math.round((y - carry.grab.y - r.top) / (PITCH_PX * s))),
      w,
      h: carry.size.h,
    };
    const others = Object.entries(live.current.placedOn() || {})
      .filter(([other]) => other !== carry.name)
      .map(([, item]) => item);
    const cell = nearestFreeCell(want, others);
    if (!cell) return null;
    return {
      cell,
      rect: {
        left: r.left + cell.x * (colWidth + g),
        top: r.top + cell.y * PITCH_PX * s,
        width: cell.w * colWidth + (cell.w - 1) * g,
        height: cell.h * PITCH_PX * s - g,
      },
    };
  }, []);

  // Pick up the widget being dragged: it leaves the grid and a lifted copy
  // follows the finger.
  const startCarry = useCallback(() => {
    const { name, point: at } = dragRef.current;
    if (!name || !at || live.current.carrying) return null;
    const el = document.querySelector(`[data-widget-name="${CSS.escape(name)}"]`);
    const rect = el?.getBoundingClientRect();
    const width = rect?.width || 300;
    const height = rect?.height || 200;
    const grab = rect ? { x: at.x - rect.left, y: at.y - rect.top } : { x: width / 2, y: 24 };
    snapshotRef.current = snapshotOf(el, live.current.scale || 1);
    const carry = { name, fromTab: live.current.activeTab, size: live.current.sizeOf(name) || { w: 4, h: 3 }, width, height, grab };
    setCarrying(carry);
    setCarryKey((key) => key + 1);
    return carry;
  }, []);

  // Open a tab with the widget in hand: a little bounce, then the page slides.
  const openTab = useCallback((target) => {
    const from = live.current.tabs.findIndex((tab) => tab.number === live.current.activeTab);
    const to = live.current.tabs.findIndex((tab) => tab.number === target);
    if (!live.current.carrying) startCarry();
    setBounce((n) => n + 1);
    navigator.vibrate?.(12);
    live.current.setTab(target);
    const direction = to > from ? 1 : -1;
    requestAnimationFrame(() => requestAnimationFrame(() => slideIn(live.current.gridRoot?.(), direction)));
  }, [startCarry]);

  // Start (or keep) the countdown for the tab under the finger. It runs on a
  // timer, so holding still on a tab opens it.
  const aim = useCallback((target) => {
    const valid = Number.isInteger(target) && target !== live.current.activeTab;
    if (!valid) {
      if (dwellRef.current.target != null) clearDwell();
      return;
    }
    if (dwellRef.current.target === target) return;
    clearTimeout(dwellRef.current.timer);
    setPending(target);
    dwellRef.current = {
      target,
      timer: setTimeout(() => {
        dwellRef.current = { target: null, timer: null };
        setPending(null);
        openTab(target);
      }, CARRY_DWELL_MS),
    };
  }, [clearDwell, openTab]);

  const track = useCallback((x, y) => {
    dragRef.current.point = { x, y };
    const { target } = targetAt(x, y);
    setHoverTarget((current) => (current === target ? current : target));
    const nextEdge = edgeFor(x);
    setEdge((current) => (
      current?.side === nextEdge?.side && current?.armed === nextEdge?.armed && current?.tab === nextEdge?.tab ? current : nextEdge
    ));
    aim(target);
  }, [targetAt, edgeFor, aim]);

  // A drag in the grid.
  const onDrag = useCallback((name, x, y) => {
    if (!name || live.current.carrying) return;
    dragRef.current.name = name;
    setDragging(true);
    track(x, y);
  }, [track]);

  const reset = useCallback(() => {
    clearDwell();
    setDragging(false);
    setHoverTarget(null);
    setEdge(null);
    setLanding(null);
    setPoint(null);
    dragRef.current = { name: null, point: null };
  }, [clearDwell]);

  // Let go in the grid: over a tab in the dock, it goes there at once.
  // Returns true when the widget left this tab, so the grid doesn't save the
  // drag's last position for it.
  const onDragStop = useCallback((name, x, y) => {
    if (live.current.carrying) return false;
    reset();
    if (!name) return false;
    const target = live.current.dockTargetAt(x, y);
    const fromTab = live.current.activeTab;
    if (target === 'add') {
      live.current.onDropAdd?.({ name, fromTab });
      return false;
    }
    if (Number.isInteger(target) && target !== fromTab) {
      live.current.onDrop({ name, fromTab, toTab: target, cell: null });
      return true;
    }
    return false;
  }, [reset]);

  // While carrying: the copy follows the pointer, the landing outline follows
  // the grid, pauses switch tabs, and letting go places the widget.
  useEffect(() => {
    if (!carrying) return undefined;
    const move = (event) => {
      const at = pointOf(event);
      if (!at) return;
      setPoint(at);
      track(at.x, at.y);
      const overDock = live.current.dockTargetAt(at.x, at.y) != null;
      setLanding(overDock ? null : landingAt(at.x, at.y, live.current.carrying));
    };
    const finish = (event) => {
      const at = pointOf(event) || dragRef.current.point || { x: -1, y: -1 };
      const carry = live.current.carrying;
      setCarrying(null);
      snapshotRef.current = null;
      reset();
      if (!carry) return;
      const over = live.current.dockTargetAt(at.x, at.y);
      if (over === 'add') {
        live.current.onDropAdd?.({ name: carry.name, fromTab: carry.fromTab });
        return;
      }
      const toTab = Number.isInteger(over) ? over : live.current.activeTab;
      const cell = Number.isInteger(over) ? null : landingAt(at.x, at.y, carry)?.cell || null;
      live.current.onDrop({ name: carry.name, fromTab: carry.fromTab, toTab, cell });
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('touchmove', move, true);
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
    window.addEventListener('touchend', finish, true);
    window.addEventListener('mouseup', finish, true);
    return () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('touchmove', move, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
      window.removeEventListener('touchend', finish, true);
      window.removeEventListener('mouseup', finish, true);
    };
  }, [carrying, track, landingAt, reset]);

  // The new tab's grid draws after the switch; place the outline then too.
  useEffect(() => {
    if (!carrying) return undefined;
    const timer = setTimeout(() => {
      const at = dragRef.current.point;
      if (at && live.current.dockTargetAt(at.x, at.y) == null) setLanding(landingAt(at.x, at.y, live.current.carrying));
    }, SLIDE_MS + 40);
    return () => clearTimeout(timer);
  }, [carrying, activeTab, landingAt]);

  useEffect(() => () => clearTimeout(dwellRef.current.timer), []);

  // Put the copied widget into the lifted card.
  useLayoutEffect(() => {
    const host = ghostHostRef.current;
    if (!host) return;
    host.replaceChildren();
    if (snapshotRef.current) host.appendChild(snapshotRef.current);
  }, [carrying, bounce]);

  const at = point || dragRef.current.point;
  const edgeTab = edge ? tabs.find((tab) => tab.number === edge.tab) : null;

  // On the page itself, above everything (the dragged widget included).
  const overlay = createPortal(
    <>
      {edge && edgeTab && (
        <Box
          key={`${edge.side}-${edge.tab}`}
          aria-hidden="true"
          sx={{
            position: 'fixed',
            top: 0,
            bottom: 0,
            [edge.side]: 0,
            width: EDGE_PX,
            zIndex: 19999,
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            color: 'var(--accent)',
            // Solid, so the page doesn't show through it.
            background: `linear-gradient(rgba(var(--accent-rgb), ${edge.armed ? 0.16 : 0.08}), rgba(var(--accent-rgb), ${edge.armed ? 0.16 : 0.08})), var(--card-bg)`,
            borderLeft: edge.side === 'right' ? '2px solid rgba(var(--accent-rgb), 0.6)' : 'none',
            borderRight: edge.side === 'left' ? '2px solid rgba(var(--accent-rgb), 0.6)' : 'none',
            boxShadow: `${edge.side === 'left' ? 8 : -8}px 0 24px var(--hg-black-20)`,
            opacity: edge.armed ? 1 : 0.85,
            transition: 'opacity 150ms ease, background 150ms ease',
            animation: 'hg-edge-in 160ms ease-out',
            '@keyframes hg-edge-in': {
              from: { transform: `translateX(${edge.side === 'left' ? -24 : 24}px)`, opacity: 0 },
              to: { transform: 'translateX(0)' },
            },
          }}
        >
          {/* Fills from the bottom while the finger waits. */}
          {edge.armed && (
            <Box
              sx={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: '100%',
                transformOrigin: 'bottom',
                background: 'rgba(var(--accent-rgb), 0.22)',
                animation: `hg-edge-fill ${CARRY_DWELL_MS}ms linear forwards`,
                '@keyframes hg-edge-fill': { from: { transform: 'scaleY(0)' }, to: { transform: 'scaleY(1)' } },
              }}
            />
          )}
          <Box
            sx={{
              position: 'relative',
              width: 44,
              height: 44,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--card-bg)',
              boxShadow: '0 4px 16px var(--hg-black-20)',
            }}
          >
            <TabIcon name={edgeTab.icon} size={22} color="var(--accent)" />
          </Box>
          {edge.side === 'left'
            ? <ChevronLeft sx={{ position: 'relative', fontSize: 36 }} />
            : <ChevronRight sx={{ position: 'relative', fontSize: 36 }} />}
          {edgeTab.label && (
            <Typography
              sx={{
                position: 'relative',
                writingMode: 'vertical-rl',
                transform: edge.side === 'left' ? 'rotate(180deg)' : 'none',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text)',
              }}
            >
              {edgeTab.label}
            </Typography>
          )}
        </Box>
      )}

      {carrying && landing && (
        <Box
          aria-hidden="true"
          sx={{
            position: 'fixed',
            ...landing.rect,
            zIndex: 19998,
            pointerEvents: 'none',
            borderRadius: 'var(--hg-frame-radius, 12px)',
            border: '2px dashed var(--accent)',
            backgroundColor: 'rgba(var(--accent-rgb), 0.10)',
            transition: 'left 90ms ease, top 90ms ease',
          }}
        />
      )}

      {carrying && at && (
        <Box
          key={bounce}
          aria-hidden="true"
          sx={{
            position: 'fixed',
            left: at.x - carrying.grab.x,
            top: at.y - carrying.grab.y,
            width: carrying.width,
            height: carrying.height,
            zIndex: 20000,
            pointerEvents: 'none',
            transformOrigin: `${carrying.grab.x}px ${carrying.grab.y}px`,
            animation: bounce ? 'hg-carry-bounce 320ms ease-out' : 'hg-carry-lift 160ms ease-out forwards',
            transform: 'scale(0.92) rotate(-1deg)',
            '@keyframes hg-carry-lift': {
              from: { transform: 'scale(1)' },
              to: { transform: 'scale(0.92) rotate(-1deg)' },
            },
            '@keyframes hg-carry-bounce': {
              '0%': { transform: 'scale(0.92) rotate(-1deg)' },
              '35%': { transform: 'scale(0.84) rotate(-1deg)' },
              '70%': { transform: 'scale(0.95) rotate(-1deg)' },
              '100%': { transform: 'scale(0.92) rotate(-1deg)' },
            },
          }}
        >
          <Box
            ref={ghostHostRef}
            sx={{
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              borderRadius: 'var(--hg-frame-radius, 12px)',
              outline: '3px solid var(--accent)',
              boxShadow: '0 24px 64px var(--hg-black-30), 0 6px 18px var(--hg-black-20)',
              opacity: 0.94,
              background: 'var(--hg-frame-bg, var(--card-bg))',
            }}
          />
        </Box>
      )}
    </>,
    document.body
  );

  return { dragging: dragging || Boolean(carrying), carrying, hoverTarget, pending, carryKey, onDrag, onDragStop, overlay };
}
