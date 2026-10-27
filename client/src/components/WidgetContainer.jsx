import React, { Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Box, IconButton } from '@mui/material';
import { CloseFullscreen, Fullscreen, OpenInFull } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import GridLayout, { getCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getDeviceApiBase } from '../utils/deviceName.js';
import {
  clampLayoutItem,
  layoutItemFromNormalized,
  layoutToNormalized,
  scaleLayoutItem,
} from '../utils/gridLayout.js';
import CountdownCircle from './CountdownCircle';
import { canCommitResize } from '../utils/resizeGuard';
import { shouldAcceptLayoutChange } from '../utils/layoutSync';
import { buildLayout, savedSourcesById } from '../utils/gridPlacement';
import { resizeButtonMetrics, widgetPixelSize } from '../utils/resizeButtons.js';
import { readGridMetrics } from '../utils/gridMetrics';
import { frameDecoration } from '../utils/widgetFrame';
import FrameOrnaments from './FrameOrnaments';
import ThemeAmbience from '../themes/engine/ThemeAmbience.jsx';
import {
  BUTTON_REVEAL_MS,
  DOUBLE_TAP_MS,
  FRAME_EXPAND_EVENT,
  REPLAYED_CLICK_FLAG,
  createDoubleTapDetector,
  expandIdleTimeoutMs,
  expandedRect,
  isInteractiveElement,
  isWidgetExpandable,
  nextSizeOnDoubleTap,
  normalizeExpandMethod,
  replayClick,
} from '../utils/widgetExpand';

// No auto-compaction; block overlaps (same as compactType={null} + preventCollision).
const GRID_COMPACTOR = getCompactor(null, false, true);

const CORE_WIDGET_ID_TO_NAME = {
  'calendar-widget': 'calendar',
  'chores-widget': 'chores',
  'photos-widget': 'photos',
  'weather-widget': 'weather',
};

const resolveWidgetName = (widgetId) => {
  if (CORE_WIDGET_ID_TO_NAME[widgetId]) return CORE_WIDGET_ID_TO_NAME[widgetId];
  if (widgetId.startsWith('plugin-')) return `plugin:${widgetId.slice(7)}`;
  return null;
};

// The page's visible size, for placing an expanded widget: the width without
// a scrollbar, and the full height.
const readViewport = () => ({
  width: document.documentElement.clientWidth || window.innerWidth,
  height: window.innerHeight,
});

// Expanding and putting back are animated: the widget's box moves and
// resizes between its place on the grid and the top half or the whole page
// (never scaled, so its contents never look stretched), and the page behind
// dims in and out alongside it. Not for people who ask their system for
// reduced motion.
const EXPAND_MS = 280;
const EXPAND_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
// Two frames: the browser paints the starting box before the change, so the
// change is animated rather than jumped to.
const afterPaint = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));

// Above every widget and the page's badges (1200), below MUI's dialogs and
// menus (1300), so a dialog the widget opens still shows over it. The dock
// sits higher still; the dashboard hides it while a widget fills the page.
const EXPANDED_Z = 1250;
const EXPAND_BACKDROP_Z = 1240;

// Core widgets arrive Suspense-wrapped (they're lazy-loaded). Props cloned
// onto a Suspense boundary are silently dropped, so inject them into the
// widget element itself.
const injectWidgetProps = (element, props) => {
  if (React.isValidElement(element) && element.type === Suspense) {
    return React.cloneElement(element, {}, React.cloneElement(element.props.children, props));
  }
  return React.cloneElement(element, props);
};

const WidgetContainer = ({
  children,
  widgets = [],
  locked = true,
  onLayoutChange: onLayoutChangeCallback,
  activeTab = 1,
  activeTabId = 1,
  deviceWidgetSettings = {},
  devicePluginSettings = {},
  isActive = true,
  // This display's screensaver settings, which carry the expand settings
  // (utils/widgetExpand.js). Null leaves expanding off.
  expandSettings = null,
  // Told 'normal', 'half' or 'full' whenever the expanded size changes.
  onExpandedSizeChange,
}) => {
  const { t } = useTranslation('common');
  const API_DEVICE_URL = getDeviceApiBase(API_BASE_URL);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [gridCols, setGridCols] = useState(12);
  // The theme's gap between widgets, read once from --hg-grid-gap.
  const [gridMetrics] = useState(readGridMetrics);
  const [selectedWidget, setSelectedWidget] = useState(null);
  const [layout, setLayout] = useState([]);
  const [isLockTransitioning, setIsLockTransitioning] = useState(false);
  const [refreshKeys, setRefreshKeys] = useState({});
  const containerRef = useRef(null);
  const prevWidgetIdsRef = useRef('');
  const prevGridColsRef = useRef(null);
  const lockedRef = useRef(locked);
  const prevLockedRef = useRef(locked);
  const hasInitializedLockEffectRef = useRef(false);
  const saveTimerRef = useRef(null);
  // Which tab the current `layout` state was built for. Null until the first
  // rebuild lands. Guards against saving a layout mid tab change — see
  // shouldAcceptLayoutChange.
  const layoutTabRef = useRef(null);
  const resizeTapGuardRef = useRef(new Map());
  // The widgets of the latest render, whose savedLayout describes the active
  // tab. Read when a save is requested, not when the debounced save fires.
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;

  const saveLayoutsToApi = useCallback((layoutItems, tabNumber, cols) => {
    // Every widget is saved, but against what it was loaded from: one nobody
    // moved keeps its stored 12-col values exactly instead of being re-rounded
    // through the live column count (see layoutToNormalized).
    const savedSources = savedSourcesById(widgetsRef.current);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      // Persist in normalized (12-col) units so layouts round-trip across breakpoints.
      const layouts = layoutToNormalized(layoutItems, cols, savedSources)
        .filter(stored => resolveWidgetName(stored.i))
        .map(stored => ({
          widget_name: resolveWidgetName(stored.i),
          tabNumber: tabNumber,
          layout_x: stored.x,
          layout_y: stored.y,
          layout_w: stored.w,
          layout_h: stored.h,
        }));

      if (layouts.length > 0) {
        axios.patch(`${API_DEVICE_URL}/widget-assignments/layout/bulk`, { layouts }).catch(() => { });
      }
    }, 500);
  }, []);

  // Update container width and grid columns based on screen size
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const computed = window.getComputedStyle(containerRef.current);
        const paddingLeft = parseFloat(computed.paddingLeft) || 0;
        const paddingRight = parseFloat(computed.paddingRight) || 0;
        const width = Math.max(0, containerRef.current.clientWidth - paddingLeft - paddingRight);
        setContainerWidth(width);

        // Responsive grid columns
        if (width < 600) {
          setGridCols(4); // Mobile: 4 columns
        } else if (width < 960) {
          setGridCols(8); // Tablet: 8 columns
        } else {
          setGridCols(12); // Desktop: 12 columns
        }
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    // Saved layouts are part of the key, so one changed elsewhere (a Home
    // Assistant panel resized in the builder) is drawn without a tab change.
    const savedKey = (w) => (w.savedLayout ? `@${w.savedLayout.x},${w.savedLayout.y},${w.savedLayout.w},${w.savedLayout.h}` : '');
    const currentCacheKey = `${activeTab}:${widgets.map(w => w.id + savedKey(w)).sort().join(',')}`;
    const widgetsChanged = currentCacheKey !== prevWidgetIdsRef.current;
    const prevCols = prevGridColsRef.current;
    const colsChanged = prevCols != null && prevCols !== gridCols;

    // First paint / widget-set changes rebuild from saved (12-col) layouts.
    // Column-only changes rescale the live layout so resize affordances stay correct.
    if (!widgetsChanged && !colsChanged) {
      prevGridColsRef.current = gridCols;
      return;
    }

    if (widgetsChanged) {
      prevWidgetIdsRef.current = currentCacheKey;

      const initialLayout = buildLayout(widgets, gridCols, lockedRef.current);
      setLayout(initialLayout);
      layoutTabRef.current = activeTab;
    } else if (colsChanged) {
      setLayout((currentLayout) => {
        // Through the stored 12-col values rather than column to column: a
        // phone turning between 4 and 8 columns would otherwise re-round every
        // widget through the coarse grid, and the next save would keep it.
        const stored = layoutToNormalized(currentLayout, prevCols, savedSourcesById(widgets));
        const nextLayout = currentLayout.map((item, index) => {
          const scaled = scaleLayoutItem(item, prevCols, gridCols);
          const { x, w } = layoutItemFromNormalized(stored[index], gridCols);
          return {
            ...clampLayoutItem({ ...scaled, x, w }, gridCols),
            static: lockedRef.current,
          };
        });
        return nextLayout;
      });
      layoutTabRef.current = activeTab;
    }

    prevGridColsRef.current = gridCols;
  }, [widgets, activeTab, gridCols]);

  useEffect(() => {
    const wasLocked = prevLockedRef.current;
    prevLockedRef.current = locked;

    setIsLockTransitioning(true);

    setLayout((currentLayout) => {
      const updatedLayout = currentLayout.map(item => ({
        ...item,
        static: locked
      }));

      // Same invariant as handleLayoutChange: only persist when the layout state
      // and the active tab agree. Locking mid tab change would otherwise write
      // the previous tab's arrangement under the new tab's number by this path
      // instead.
      const shouldPersistLockedLayouts = hasInitializedLockEffectRef.current
        && !wasLocked
        && locked
        && layoutTabRef.current === activeTab;
      if (shouldPersistLockedLayouts) {
        saveLayoutsToApi(updatedLayout, activeTab, gridCols);
      }

      return updatedLayout;
    });

    if (!hasInitializedLockEffectRef.current) {
      hasInitializedLockEffectRef.current = true;
    }

    const timer = setTimeout(() => {
      setIsLockTransitioning(false);
    }, 50);

    return () => clearTimeout(timer);
  }, [locked, saveLayoutsToApi, activeTab]);

  // Deselect widget when locked
  useEffect(() => {
    if (locked) {
      setSelectedWidget(null);
    }
  }, [locked]);

  const handleLayoutChange = (newLayout) => {
    // Not just `locked`: the grid also emits during a tab change, before the
    // rebuild for the new tab has landed. Saving then writes the previous tab's
    // arrangement under the new tab's number.
    if (!shouldAcceptLayoutChange({
      locked,
      layoutTab: layoutTabRef.current,
      activeTab,
    })) {
      return;
    }

    const currentLayoutById = new Map(layout.map(item => [item.i, item]));
    const safeLayout = newLayout.map((item) => {
      const existing = currentLayoutById.get(item.i);
      const minW = existing?.minW ?? item.minW ?? 2;
      const minH = existing?.minH ?? item.minH ?? 2;
      return {
        ...item,
        minW,
        minH,
        w: Math.max(item.w, minW),
        h: Math.max(item.h, minH),
      };
    });

    const hasChanged = safeLayout.some(item => {
      const existing = currentLayoutById.get(item.i);
      if (!existing) return true;
      return existing.x !== item.x || existing.y !== item.y || existing.w !== item.w || existing.h !== item.h;
    });

    if (!hasChanged) return;

    const updatedLayout = safeLayout.map(item => ({
      ...item,
      static: locked
    }));

    setLayout(updatedLayout);

    saveLayoutsToApi(updatedLayout, activeTab, gridCols);

    if (onLayoutChangeCallback) {
      onLayoutChangeCallback(updatedLayout);
    }
  };

  // Handle resize button clicks (both increment and decrement)
  const handleResize = (widgetId, direction, isDecrement = false, e) => {
    if (locked) {
      return;
    }

    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    setLayout((currentLayout) => {
      const newLayout = currentLayout.map((item) => {
        if (item.i === widgetId) {
          const updatedItem = { ...item, static: locked };
          const delta = isDecrement ? -1 : 1;

          switch (direction) {
            case 'right':
              if (isDecrement) {
                if (item.w > item.minW) {
                  updatedItem.w = item.w - 1;
                }
              } else {
                if (item.x + item.w < gridCols) {
                  updatedItem.w = item.w + 1;
                }
              }
              break;
            case 'left':
              if (isDecrement) {
                if (item.w > item.minW) {
                  updatedItem.x = item.x + 1;
                  updatedItem.w = item.w - 1;
                }
              } else {
                if (item.x > 0) {
                  updatedItem.x = item.x - 1;
                  updatedItem.w = item.w + 1;
                }
              }
              break;
            case 'bottom':
              if (isDecrement) {
                if (item.h > item.minH) {
                  updatedItem.h = item.h - 1;
                }
              } else {
                updatedItem.h = item.h + 1;
              }
              break;
            case 'top':
              if (isDecrement) {
                if (item.h > item.minH) {
                  updatedItem.y = item.y + 1;
                  updatedItem.h = item.h - 1;
                }
              } else {
                if (item.y > 0) {
                  updatedItem.y = item.y - 1;
                  updatedItem.h = item.h + 1;
                }
              }
              break;
          }

          return updatedItem;
        }
        return { ...item, static: locked };
      });

      const before = currentLayout.find((item) => item.i === widgetId);
      const after = newLayout.find((item) => item.i === widgetId);

      // The grid refuses a DRAG that would land on another widget
      // (compactType null + preventCollision). The resize buttons bypass that
      // path entirely, so a widget could be grown over its neighbour and the
      // overlap persisted. Apply the same rule here: abandon the resize and
      // keep the layout untouched, so nothing is saved either.
      if (!canCommitResize(currentLayout, before, after)) {
        return currentLayout;
      }

      if (onLayoutChangeCallback) {
        onLayoutChangeCallback(newLayout);
      }

      saveLayoutsToApi(newLayout, activeTab, gridCols);
      return newLayout;
    });
  };

  const handleResizePointerDown = (widgetId, direction, isDecrement = false) => (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Guard against duplicate touch-generated activation bursts on some Android devices.
    const pointerType = e.pointerType || 'unknown';
    const guardKey = `${widgetId}:${direction}:${isDecrement ? 'dec' : 'inc'}:${pointerType}`;
    const now = Date.now();
    const lastTap = resizeTapGuardRef.current.get(guardKey) || 0;

    if (now - lastTap < 160) {
      return;
    }

    resizeTapGuardRef.current.set(guardKey, now);
    handleResize(widgetId, direction, isDecrement, e);
  };

  const handleWidgetClick = (widgetId, e) => {
    if (locked) return;
    if (e.target.closest('.drag-handle')) return;
    if (e.target.closest('.resize-button')) return;
    e.stopPropagation();
    setSelectedWidget(widgetId);
  };

  const handleWidgetTouch = (widgetId, e) => {
    if (locked) return;
    if (e.target.closest('.drag-handle')) return;
    if (e.target.closest('.resize-button')) return;
    e.stopPropagation();
    setSelectedWidget(widgetId);
  };

  const isInteractiveTarget = (target) => {
    if (!target?.closest) return false;
    return Boolean(
      target.closest(
        'button, a, input, textarea, select, [role="button"], [contenteditable="true"], .MuiButtonBase-root, .MuiInputBase-root, .MuiSwitch-root, .MuiToggleButton-root'
      )
    );
  };

  // Click/Touch outside to deselect
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.widget-wrapper')) {
        if (selectedWidget) {
          setSelectedWidget(null);
        }
      }
    };

    document.addEventListener('pointerdown', handleClickOutside);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, [selectedWidget]);

  // Safety net: if selection state and rendered controls drift out of sync, clear selection.
  useEffect(() => {
    if (locked || !selectedWidget) return;

    const rafId = window.requestAnimationFrame(() => {
      const selectedElement = containerRef.current?.querySelector('.widget-wrapper.selected');
      if (!selectedElement) {
        setSelectedWidget(null);
        return;
      }

      const hasResizeControls = selectedElement.querySelector('.resize-button');
      if (!hasResizeControls) {
        setSelectedWidget(null);
      }
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [locked, selectedWidget, layout]);

  // --- Expanding a widget (utils/widgetExpand.js) ---
  // Only while the board is locked: unlocked, a tap selects a widget to move.
  const expandOn = locked && expandSettings?.expandWidgets === true;
  const expandMethod = normalizeExpandMethod(expandSettings?.expandMethod);
  const expandIdleMs = expandIdleTimeoutMs(expandSettings?.expandIdleMinutes);
  // The expanded widget: { id, size: 'half' | 'full', phase, home }.
  // phase: 'from' (lifted out, still over its grid place, about to grow),
  // 'open', 'closing' (shrinking back over its grid place), 'settle' (back in
  // the grid, one frame without the grid's own transitions). home is its grid
  // place in page coordinates, where it grows from and shrinks back to.
  const [expanded, setExpanded] = useState(null);
  const closeTimerRef = useRef(null);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const [viewport, setViewport] = useState(readViewport);
  // Button mode: the expand buttons show for a while after a touch.
  const [expandButtonsShown, setExpandButtonsShown] = useState(false);
  const tapDetectorsRef = useRef(new Map());
  // A single tap held back in double-tap mode: { target, clientX, clientY, timer }.
  const heldClickRef = useRef(null);

  const canExpand = useCallback((widget) => Boolean(widget) && expandOn && isWidgetExpandable({
    settings: expandSettings,
    widgetName: resolveWidgetName(widget.id),
    manifestExpand: widget.expandable === false ? false : undefined,
  }), [expandOn, expandSettings]);

  const tapDetectorFor = (widgetId) => {
    let detector = tapDetectorsRef.current.get(widgetId);
    if (!detector) {
      detector = createDoubleTapDetector();
      tapDetectorsRef.current.set(widgetId, detector);
    }
    return detector;
  };

  const dropHeldClick = useCallback(() => {
    if (heldClickRef.current) {
      clearTimeout(heldClickRef.current.timer);
      heldClickRef.current = null;
    }
  }, []);

  // Let a held tap through now, rather than at the end of its wait.
  const flushHeldClick = useCallback(() => {
    const held = heldClickRef.current;
    dropHeldClick();
    if (held) replayClick(held.target, held);
  }, [dropHeldClick]);

  // Back in the grid: one frame with the grid's transitions off, so the
  // widget doesn't slide in from the page corner as its grid transform returns.
  const settleWidget = useCallback((widgetId) => {
    setExpanded(widgetId ? { id: widgetId, phase: 'settle' } : null);
    if (!widgetId) return;
    afterPaint(() => setExpanded((prev) => (prev && prev.phase === 'settle' && prev.id === widgetId ? null : prev)));
  }, []);

  // size: 'half', 'full' or 'normal'. animate: false puts it back at once (a
  // tab change, the setting turned off).
  const setWidgetSize = useCallback((widgetId, size, { animate = true } = {}) => {
    dropHeldClick();
    tapDetectorsRef.current.forEach((detector) => detector.reset());
    clearTimeout(closeTimerRef.current);
    const current = expandedRef.current;
    const live = current && current.phase !== 'settle' ? current : null;
    const instant = !animate || prefersReducedMotion();

    if (size === 'half' || size === 'full') {
      // Already lifted out (open, or shrinking back): change size from where
      // it is now.
      if (live && live.id === widgetId) {
        setExpanded({ ...live, size, phase: 'open' });
        return;
      }
      const element = containerRef.current?.querySelector(`[data-widget-id="${CSS.escape(widgetId)}"]`);
      const box = element?.getBoundingClientRect();
      const home = box
        ? { top: box.top + window.scrollY, left: box.left + window.scrollX, width: box.width, height: box.height }
        : null;
      if (instant || !home) {
        setExpanded({ id: widgetId, size, phase: 'open', home });
        return;
      }
      setExpanded({ id: widgetId, size, phase: 'from', home });
      afterPaint(() => setExpanded((prev) => (prev && prev.id === widgetId && prev.phase === 'from' ? { ...prev, phase: 'open' } : prev)));
      return;
    }

    if (!live) return;
    if (instant || !live.home || live.phase === 'from') {
      settleWidget(live.id);
      return;
    }
    setExpanded({ ...live, phase: 'closing' });
    closeTimerRef.current = setTimeout(() => settleWidget(live.id), EXPAND_MS + 40);
  }, [dropHeldClick, settleWidget]);

  const widgetsForExpandRef = useRef(widgets);
  widgetsForExpandRef.current = widgets;
  const handleDoubleTap = useCallback((widgetId) => {
    if (expandMethod !== 'doubleTap') return;
    const widget = widgetsForExpandRef.current.find((w) => w.id === widgetId);
    if (!canExpand(widget)) return;
    const current = expandedRef.current;
    const isOpen = current && current.id === widgetId && (current.phase === 'open' || current.phase === 'from');
    setWidgetSize(widgetId, nextSizeOnDoubleTap(isOpen ? current.size : 'normal'));
  }, [expandMethod, canExpand, setWidgetSize]);
  const handleDoubleTapRef = useRef(handleDoubleTap);
  handleDoubleTapRef.current = handleDoubleTap;

  // Double-tap mode: a tap on a widget's plain area waits DOUBLE_TAP_MS, so
  // that a second tap can make it a double-tap instead. Buttons, fields and
  // keyboard clicks go through at once and never count.
  const handleExpandClickCapture = (widget, e) => {
    if (expandMethod !== 'doubleTap' || !canExpand(widget)) return;
    if (e.nativeEvent?.[REPLAYED_CLICK_FLAG] || e.detail === 0) return;
    // A dialog the widget opened lives elsewhere on the page; React still
    // routes its clicks through here.
    if (!e.currentTarget.contains(e.target)) return;
    if (isInteractiveElement(e.target)) {
      tapDetectorFor(widget.id).reset();
      flushHeldClick();
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    const result = tapDetectorFor(widget.id).tap({ x: e.clientX, y: e.clientY, at: Date.now() });
    if (result === 'double') {
      dropHeldClick();
      handleDoubleTap(widget.id);
      return;
    }
    flushHeldClick();
    const held = { target: e.target, clientX: e.clientX, clientY: e.clientY };
    held.timer = setTimeout(() => {
      if (heldClickRef.current === held) heldClickRef.current = null;
      replayClick(held.target, held);
    }, DOUBLE_TAP_MS);
    heldClickRef.current = held;
  };

  // A mouse double-click would select a word as well; not on a widget that
  // expands by double-tap.
  const handleExpandMouseDownCapture = (widget, e) => {
    if (e.detail < 2 || expandMethod !== 'doubleTap' || !canExpand(widget)) return;
    if (isInteractiveElement(e.target)) return;
    e.preventDefault();
  };

  // Back to normal on a tab change, when the board is unlocked or expanding
  // is turned off, and when the expanded widget leaves the board.
  useEffect(() => {
    setWidgetSize(null, 'normal', { animate: false });
  }, [activeTab, setWidgetSize]);
  useEffect(() => {
    if (!expandOn) setWidgetSize(null, 'normal', { animate: false });
  }, [expandOn, setWidgetSize]);
  useEffect(() => {
    if (expanded && expanded.phase !== 'settle' && !canExpand(widgets.find((w) => w.id === expanded.id))) {
      setWidgetSize(null, 'normal', { animate: false });
    }
  }, [expanded, widgets, canExpand, setWidgetSize]);
  useEffect(() => () => {
    dropHeldClick();
    clearTimeout(closeTimerRef.current);
  }, [dropHeldClick]);

  // Shrinking back counts as normal already: the dock comes back and the
  // calendar returns to its own view as the widget shrinks.
  const isOpenPhase = expanded?.phase === 'from' || expanded?.phase === 'open';
  const expandedSize = isOpenPhase ? expanded.size : 'normal';
  const onExpandedSizeChangeRef = useRef(onExpandedSizeChange);
  onExpandedSizeChangeRef.current = onExpandedSizeChange;
  useEffect(() => {
    onExpandedSizeChangeRef.current?.(expandedSize);
  }, [expandedSize]);
  // A tab with no widgets unmounts the grid; nothing is expanded then.
  useEffect(() => () => onExpandedSizeChangeRef.current?.('normal'), []);

  // Follow the window while a widget is expanded.
  const isAnyExpanded = isOpenPhase;
  useEffect(() => {
    if (!isAnyExpanded) return undefined;
    const update = () => setViewport(readViewport());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [isAnyExpanded]);

  // Escape puts it back, for a display with a keyboard.
  useEffect(() => {
    if (!isAnyExpanded) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setWidgetSize(null, 'normal');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAnyExpanded, setWidgetSize]);

  // Auto-return: back to normal after this long with no touch, anywhere,
  // including inside plugin frames (which report their touches).
  useEffect(() => {
    if (!isOpenPhase || !expandIdleMs) return undefined;
    let timer = null;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setWidgetSize(null, 'normal'), expandIdleMs);
    };
    arm();
    const events = ['pointerdown', 'keydown', 'wheel'];
    events.forEach((type) => window.addEventListener(type, arm, { capture: true, passive: true }));
    window.addEventListener(FRAME_EXPAND_EVENT, arm);
    return () => {
      clearTimeout(timer);
      events.forEach((type) => window.removeEventListener(type, arm, { capture: true }));
      window.removeEventListener(FRAME_EXPAND_EVENT, arm);
    };
  }, [isOpenPhase, expanded?.id, expanded?.size, expandIdleMs, setWidgetSize]);

  // Button mode: show the expand buttons for a while after any touch.
  useEffect(() => {
    if (!expandOn || expandMethod !== 'button') {
      setExpandButtonsShown(false);
      return undefined;
    }
    let timer = null;
    const show = () => {
      setExpandButtonsShown(true);
      clearTimeout(timer);
      timer = setTimeout(() => setExpandButtonsShown(false), BUTTON_REVEAL_MS);
    };
    const onFrame = (e) => {
      if (e.detail?.kind === 'activity') show();
    };
    window.addEventListener('pointerdown', show, { capture: true, passive: true });
    window.addEventListener(FRAME_EXPAND_EVENT, onFrame);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', show, { capture: true });
      window.removeEventListener(FRAME_EXPAND_EVENT, onFrame);
    };
  }, [expandOn, expandMethod]);

  // Double-taps inside a plugin's frame, reported by its touch script and
  // raised on the frame element by its wrapper.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const onFrame = (e) => {
      if (e.detail?.kind !== 'doubleTap') return;
      const wrapper = e.target?.closest?.('[data-widget-id]');
      if (wrapper) handleDoubleTapRef.current(wrapper.getAttribute('data-widget-id'));
    };
    element.addEventListener(FRAME_EXPAND_EVENT, onFrame);
    return () => element.removeEventListener(FRAME_EXPAND_EVENT, onFrame);
  }, []);

  const renderExpandButton = ({ label, icon, onClick }) => (
    <IconButton
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      sx={{
        width: 44,
        height: 44,
        color: 'var(--text)',
        backgroundColor: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        boxShadow: '0 2px 8px var(--hg-black-30)',
        '&:hover': { backgroundColor: 'var(--card-bg)', filter: 'brightness(1.05)' },
      }}
    >
      {icon}
    </IconButton>
  );

  const getWidgetRefreshInterval = (widgetId) => {
    const widgetMap = {
      'chores-widget': 'chores',
      'calendar-widget': 'calendar',
      'photos-widget': 'photos',
      'weather-widget': 'weather',
    };

    const settingsKey = widgetMap[widgetId];
    if (settingsKey && deviceWidgetSettings[settingsKey]) {
      return deviceWidgetSettings[settingsKey].refreshInterval || 0;
    }

    if (widgetId.startsWith('plugin-')) {
      const filename = widgetId.slice(7);
      return devicePluginSettings[filename]?.refreshInterval || 0;
    }

    return 0;
  };

  // Bumping the nonce tells the widget to refetch in place. It must NOT be
  // used as a React key — that force-remounts the widget, re-running its
  // mount fetch and restarting its timers (the churn bug in issue #75).
  const handleWidgetRefresh = useCallback((widgetId) => {
    setRefreshKeys(prev => ({
      ...prev,
      [widgetId]: (prev[widgetId] || 0) + 1
    }));
  }, []);

  // The layout handed to the grid must describe exactly the children being
  // rendered — one entry each, no more.
  //
  // `layout` state is rebuilt by an effect, so during a tab change it still
  // describes the previous tab while the children are already the new tab's.
  // Passing it raw gives the grid entries whose `i` matches no child, and
  // children with no entry; it then synthesizes placements and, with
  // preventCollision, shuffles non-static items around until they fit. That is
  // the visible scramble, and it only appears unlocked because static items are
  // pinned and excluded from collision movement.
  //
  // Deriving it per render closes the window: the grid never sees one tab's
  // items alongside another tab's children.
  // The layout handed to the grid must describe exactly the children being
  // rendered. `layout` state is rebuilt by an effect, so during a tab change it
  // still describes the previous tab — passing it raw gives the grid entries
  // matching no child and children with no entry, and it shuffles non-static
  // items around hunting for a fit. That is the visible scramble, and it only
  // appears unlocked because static items are pinned.
  //
  // Built from `widgets`, whose savedLayout is already scoped to the active tab,
  // so it is correct even mid-transition. Once the rebuild has landed for this
  // tab, live state wins so a drag in progress is not thrown away.
  const gridLayout = useMemo(() => {
    const built = buildLayout(widgets, gridCols, locked);
    if (layoutTabRef.current !== activeTab) return built;
    return built.map((item) => layout.find((l) => l.i === item.i) || item);
  }, [widgets, layout, gridCols, locked, activeTab]);

  const resizeButtonBaseStyle = {
    fontSize: '1.5rem',
    userSelect: 'none',
    touchAction: 'none',
    WebkitTouchCallout: 'none',
    filter: 'drop-shadow(0 2px 4px var(--hg-black-30))',
    transition: 'transform 0.1s ease, filter 0.1s ease',
    backgroundColor: 'var(--hg-black-50)',
    padding: '4px 8px',
    borderRadius: 'var(--hg-radius-sm)',
  };

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        minHeight: '100vh',
        padding: 2,
        position: 'relative',
        backgroundColor: 'var(--background)',
        // A theme's page image (Classic: none), pinned like the body's.
        backgroundImage: 'var(--hg-page-image)',
        backgroundSize: 'var(--hg-page-image-size)',
        backgroundPosition: 'var(--hg-page-image-position)',
        backgroundAttachment: 'fixed',
        '& .react-grid-item': {
          transition: (selectedWidget || isLockTransitioning) ? 'none !important' : 'all 200ms ease',
          transitionProperty: 'left, top, width, height',
        },
        '& .react-grid-item.cssTransforms': {
          transitionProperty: (selectedWidget || isLockTransitioning) ? 'none !important' : 'transform, width, height',
        },
        '& .react-grid-item.react-grid-placeholder': {
          background: 'var(--accent)',
          opacity: 0.2,
          borderRadius: 'var(--hg-radius-md)',
          zIndex: 2,
          transition: 'all 100ms ease',
        },
      }}
    >
      <ThemeAmbience />
      {/* The dimmed page behind an expanded widget. A tap on it puts the
          widget back. */}
      {expanded && expanded.phase !== 'settle' && (
        <Box
          className={`expand-backdrop ${expanded.phase === 'open' ? 'shown' : ''}`}
          aria-hidden="true"
          onClick={() => setWidgetSize(null, 'normal')}
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: EXPAND_BACKDROP_Z,
            backgroundColor: 'var(--hg-black-50)',
            opacity: expanded.phase === 'open' ? 1 : 0,
            pointerEvents: expanded.phase === 'closing' ? 'none' : 'auto',
            transition: prefersReducedMotion() ? 'none' : `opacity ${EXPAND_MS}ms ${EXPAND_EASING}`,
          }}
        />
      )}
      {layout.length > 0 && (
        <GridLayout
          className="layout"
          width={containerWidth}
          layout={gridLayout}
          gridConfig={{
            cols: gridCols,
            rowHeight: gridMetrics.rowHeight,
            margin: [gridMetrics.gap, gridMetrics.gap],
            containerPadding: [0, 0],
          }}
          dragConfig={{
            enabled: !locked,
            handle: '.drag-handle',
            cancel: '.widget-content',
          }}
          resizeConfig={{ enabled: false }}
          compactor={GRID_COMPACTOR}
          onLayoutChange={handleLayoutChange}
        >
          {widgets.map((widget) => {
            const isSelected = !locked && selectedWidget === widget.id;
            // A transparent widget shows the page background through its box: no
            // card color and no resting shadow, which would otherwise draw the
            // rectangle the setting is meant to remove. The selection border stays.
            const restingShadow = widget.transparent ? 'none' : 'var(--hg-frame-shadow)';
            const expandable = canExpand(widget);
            const expandState = expandable && expanded?.id === widget.id ? expanded : null;
            const widgetExpandSize = expandState && (expandState.phase === 'from' || expandState.phase === 'open')
              ? expandState.size
              : 'normal';
            const isExpanded = widgetExpandSize !== 'normal';
            // Where the lifted-out box is drawn: its grid place while it is
            // about to grow or shrinking back, the top half or whole page
            // while open.
            let expandRect = null;
            if (expandState && expandState.phase === 'open') {
              expandRect = expandedRect(expandState.size, { ...viewport, gap: gridMetrics.gap });
            } else if (expandState && expandState.home && (expandState.phase === 'from' || expandState.phase === 'closing')) {
              expandRect = {
                top: expandState.home.top - window.scrollY,
                left: expandState.home.left - window.scrollX,
                width: expandState.home.width,
                height: expandState.home.height,
              };
            }
            const settling = expandState?.phase === 'settle';
            // The expand buttons: in button mode, for a while after a touch;
            // in either mode, always while the widget is expanded.
            const expandButtonsVisible = expandable && (isExpanded || (expandMethod === 'button' && expandButtonsShown));
            const currentLayout = layout.find(l => l.i === widget.id);
            const fallbackLayout = {
              i: widget.id,
              ...layoutItemFromNormalized(
                {
                  x: widget.defaultPosition.x,
                  y: widget.defaultPosition.y,
                  w: widget.defaultSize.width,
                  h: widget.defaultSize.height,
                  minW: widget.minWidth || 3,
                  minH: widget.minHeight || 2,
                },
                gridCols
              ),
              static: locked,
            };
            const effectiveLayout = currentLayout || fallbackLayout;
            // The ➖/➕ buttons shrink on a small widget so they never pile up.
            const rb = resizeButtonMetrics(widgetPixelSize(effectiveLayout, {
              containerWidth, cols: gridCols, rowHeight: gridMetrics.rowHeight, gap: gridMetrics.gap,
            }));
            const canDecreaseWidth = currentLayout && currentLayout.w > currentLayout.minW;
            const canDecreaseHeight = currentLayout && currentLayout.h > currentLayout.minH;
            const canIncreaseWidth = currentLayout && (currentLayout.x + currentLayout.w < gridCols);
            const canIncreaseLeft = currentLayout && currentLayout.x > 0;
            const canIncreaseTop = currentLayout && currentLayout.y > 0;

            // One resize handle: a ➖/➕ box that dispatches a resize on pointer-down.
            // `enabled` gates the affordance — grayed out and not-allowed when the
            // widget can't resize further in that direction.
            const renderResizeButton = ({ direction, decrement, enabled, symbol }) => (
              <Box
                className="resize-button"
                onPointerDown={handleResizePointerDown(widget.id, direction, decrement)}
                sx={{
                  ...resizeButtonBaseStyle,
                  width: rb.box,
                  height: rb.box,
                  fontSize: rb.font,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                  cursor: enabled ? 'pointer' : 'not-allowed',
                  opacity: enabled ? 1 : 0.3,
                  '&:hover': {
                    transform: enabled ? 'scale(1.2)' : 'none',
                    filter: enabled
                      ? 'drop-shadow(0 4px 8px var(--hg-black-50))'
                      : 'drop-shadow(0 2px 4px var(--hg-black-30))',
                  },
                  '&:active': {
                    transform: enabled ? 'scale(1.1)' : 'none',
                  },
                }}
              >
                {symbol}
              </Box>
            );

            return (
              <Box
                key={widget.id}
                data-widget-id={widget.id}
                className={`widget-wrapper ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''}`}
                onClickCapture={(e) => handleExpandClickCapture(widget, e)}
                onMouseDownCapture={(e) => handleExpandMouseDownCapture(widget, e)}
                onPointerDownCapture={(e) => {
                  if (!locked && !isSelected && !e.target.closest('.drag-handle') && !e.target.closest('.resize-button')) {
                    if (isInteractiveTarget(e.target)) {
                      // Select on interactive taps too so edit affordances (drag/resize) remain reachable.
                      setSelectedWidget(widget.id);
                      return;
                    }

                    e.stopPropagation();
                    handleWidgetTouch(widget.id, e);
                  }
                }}
                sx={{
                  width: '100%',
                  height: '100%',
                  position: 'relative',
                  border: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                  borderRadius: 'var(--hg-frame-radius)',
                  padding: 'var(--hg-frame-inset)',
                  backdropFilter: 'var(--hg-frame-backdrop)',
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  boxShadow: isSelected
                    ? '0 8px 32px rgba(var(--accent-rgb), 0.3)'
                    : restingShadow,
                  background: widget.transparent ? 'transparent' : 'var(--hg-frame-bg)',
                  backgroundImage: widget.transparent ? 'none' : 'var(--hg-frame-image)',
                  overflow: 'hidden',
                  cursor: locked ? 'default' : (isSelected ? 'move' : 'pointer'),
                  // In double-tap mode the browser's own double-tap zoom is
                  // stopped on the widget, so the double-tap is ours.
                  touchAction: locked
                    ? (expandable && expandMethod === 'doubleTap' ? 'manipulation' : 'auto')
                    : (isSelected ? 'none' : 'manipulation'),
                  '@media (hover: hover) and (pointer: fine)': {
                    '&:hover': {
                      border: locked
                        ? '3px solid transparent'
                        : (isSelected
                          ? '3px solid var(--accent)'
                          : '3px solid rgba(var(--accent-rgb), 0.3)'),
                      boxShadow: locked
                        ? restingShadow
                        : (isSelected
                          ? '0 8px 32px rgba(var(--accent-rgb), 0.3)'
                          : 'var(--hg-frame-shadow-hover)'),
                    }
                  },
                  '&::after': frameDecoration,
                  // Expanded: lifted out of the grid to the top half or the
                  // whole page. The grid still holds its place, and this is
                  // the same element, so the widget is not reloaded.
                  ...(expandRect && {
                    position: 'fixed !important',
                    top: `${expandRect.top}px !important`,
                    left: `${expandRect.left}px !important`,
                    width: `${expandRect.width}px !important`,
                    height: `${expandRect.height}px !important`,
                    transform: 'none !important',
                    transition: prefersReducedMotion()
                      ? 'none !important'
                      : ['top', 'left', 'width', 'height', 'box-shadow']
                        .map((property) => `${property} ${EXPAND_MS}ms ${EXPAND_EASING}`)
                        .join(', ') + ' !important',
                    zIndex: EXPANDED_Z,
                    boxShadow: expandState.phase === 'open' ? '0 16px 48px var(--hg-black-50)' : restingShadow,
                    background: 'var(--hg-frame-bg)',
                    backgroundImage: 'var(--hg-frame-image)',
                  }),
                  ...(settling && { transition: 'none !important' }),
                }}
              >
                <FrameOrnaments />
                {expandable && (
                  <Box
                    className="expand-controls"
                    sx={{
                      position: 'absolute',
                      right: 8,
                      bottom: 8,
                      zIndex: 1004,
                      display: 'flex',
                      gap: 1,
                      opacity: expandButtonsVisible ? 1 : 0,
                      visibility: expandButtonsVisible ? 'visible' : 'hidden',
                      transition: expandButtonsVisible
                        ? 'opacity 150ms ease'
                        : 'opacity 400ms ease, visibility 0s linear 400ms',
                    }}
                  >
                    {!isExpanded && renderExpandButton({
                      label: t('expand.expand'),
                      icon: <OpenInFull />,
                      onClick: () => setWidgetSize(widget.id, 'half'),
                    })}
                    {widgetExpandSize === 'half' && renderExpandButton({
                      label: t('expand.fullPage'),
                      icon: <Fullscreen />,
                      onClick: () => setWidgetSize(widget.id, 'full'),
                    })}
                    {isExpanded && renderExpandButton({
                      label: t('expand.shrink'),
                      icon: <CloseFullscreen />,
                      onClick: () => setWidgetSize(widget.id, 'normal'),
                    })}
                  </Box>
                )}
                {!locked && !isSelected && (
                  <Box
                    className="selection-overlay"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedWidget(widget.id);
                    }}
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      cursor: 'pointer',
                      zIndex: 1000,
                      pointerEvents: 'auto',
                      touchAction: 'manipulation',
                      userSelect: 'none',
                    }}
                  />
                )}

                {/* Resize Buttons - Only visible when selected and unlocked */}
                {isSelected && !locked && (
                  <>
                    {/* Top Resize Buttons */}
                    <Box
                      sx={{
                        position: 'absolute',
                        top: rb.inset,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        gap: `${rb.gap}px`,
                        zIndex: 1003,
                        pointerEvents: 'auto',
                      }}
                    >
                      {renderResizeButton({ direction: 'top', decrement: true, enabled: canDecreaseHeight, symbol: '➖' })}
                      {renderResizeButton({ direction: 'top', decrement: false, enabled: canIncreaseTop, symbol: '➕' })}
                    </Box>

                    {/* Right Resize Buttons */}
                    <Box
                      sx={{
                        position: 'absolute',
                        right: rb.inset,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: `${rb.gap}px`,
                        zIndex: 1003,
                        pointerEvents: 'auto',
                      }}
                    >
                      {renderResizeButton({ direction: 'right', decrement: true, enabled: canDecreaseWidth, symbol: '➖' })}
                      {renderResizeButton({ direction: 'right', decrement: false, enabled: canIncreaseWidth, symbol: '➕' })}
                    </Box>

                    {/* Bottom Resize Buttons */}
                    <Box
                      sx={{
                        position: 'absolute',
                        bottom: rb.inset,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        gap: `${rb.gap}px`,
                        zIndex: 1003,
                        pointerEvents: 'auto',
                      }}
                    >
                      {renderResizeButton({ direction: 'bottom', decrement: true, enabled: canDecreaseHeight, symbol: '➖' })}
                      {renderResizeButton({ direction: 'bottom', decrement: false, enabled: true, symbol: '➕' })}
                    </Box>

                    {/* Left Resize Buttons */}
                    <Box
                      sx={{
                        position: 'absolute',
                        left: rb.inset,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: `${rb.gap}px`,
                        zIndex: 1003,
                        pointerEvents: 'auto',
                      }}
                    >
                      {renderResizeButton({ direction: 'left', decrement: true, enabled: canDecreaseWidth, symbol: '➖' })}
                      {renderResizeButton({ direction: 'left', decrement: false, enabled: canIncreaseLeft, symbol: '➕' })}
                    </Box>

                    {/* Invisible Drag Handle - Covers entire widget when selected and unlocked */}
                    <Box
                      className="drag-handle"
                      sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        cursor: 'move',
                        zIndex: 1001,
                        userSelect: 'none',
                        pointerEvents: locked ? 'none' : 'auto',
                      }}
                    />

                  </>
                )}

                {/* Countdown ring: the per-widget refresh scheduler. Paused
                    (no ticking, no refreshes) while the screen is inactive;
                    fires an immediate catch-up refresh on resume if overdue. */}
                <CountdownCircle
                  refreshInterval={getWidgetRefreshInterval(widget.id)}
                  onRefresh={() => handleWidgetRefresh(widget.id)}
                  isActive={isActive}
                />

                {/* Widget Content */}
                <Box
                  className="widget-content"
                  sx={{
                    width: '100%',
                    height: '100%',
                    overflow: 'auto',
                    pointerEvents: (locked || !isSelected) ? 'auto' : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {injectWidgetProps(widget.content, {
                    widgetId: widget.id,
                    refreshNonce: refreshKeys[widget.id] || 0,
                    isActive,
                    activeTabId,
                    widgetSize: {
                      width: effectiveLayout.w,
                      height: effectiveLayout.h,
                    },
                    // 'normal', 'half' or 'full'; the calendar shows its month
                    // view when expanded, and plugins are told.
                    expandSize: widgetExpandSize,
                    expandMode: expandable ? expandMethod : false,
                  })}
                </Box>
              </Box>
            );
          })}
        </GridLayout>
      )}
      {children}
    </Box>
  );
};

export default WidgetContainer;
