import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, IconButton } from '@mui/material';
import { DragIndicator } from '@mui/icons-material';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getDeviceApiBase } from '../utils/deviceName.js';
import CountdownCircle from './CountdownCircle';

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

const WidgetContainer = ({ children, widgets = [], locked = true, onLayoutChange: onLayoutChangeCallback, activeTab = 1, activeTabId = 1 }) => {
  const API_DEVICE_URL = getDeviceApiBase(API_BASE_URL);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [gridCols, setGridCols] = useState(12);
  const [selectedWidget, setSelectedWidget] = useState(null);
  const [layout, setLayout] = useState([]);
  const [isLockTransitioning, setIsLockTransitioning] = useState(false);
  const [refreshKeys, setRefreshKeys] = useState({});
  const containerRef = useRef(null);
  const prevWidgetIdsRef = useRef('');
  const lockedRef = useRef(locked);
  const saveTimerRef = useRef(null);
  const resizeTapGuardRef = useRef(new Map());

  const getTabLayoutCacheKey = useCallback((widgetId) => {
    return `widget-layout-id-${activeTabId}-${widgetId}`;
  }, [activeTabId]);

  const saveLayoutsToApi = useCallback((layoutItems, tabNumber) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const layouts = layoutItems
        .filter(item => resolveWidgetName(item.i))
        .map(item => ({
          widget_name: resolveWidgetName(item.i),
          tabNumber: tabNumber,
          layout_x: item.x,
          layout_y: item.y,
          layout_w: item.w,
          layout_h: item.h,
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
        const width = containerRef.current.offsetWidth;
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
    const currentCacheKey = `${activeTab}:${widgets.map(w => w.id).sort().join(',')}`;
    if (currentCacheKey === prevWidgetIdsRef.current) return;
    prevWidgetIdsRef.current = currentCacheKey;

    const cols = gridCols;
    const placed = [];

    const collides = (x, y, w, h) => {
      return placed.some(p =>
        x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y
      );
    };

    const findFreePosition = (w, h) => {
      for (let row = 0; row < 200; row++) {
        for (let col = 0; col <= cols - w; col++) {
          if (!collides(col, row, w, h)) return { x: col, y: row };
        }
      }
      return { x: 0, y: 0 };
    };

    const initialLayout = widgets.map((widget) => {
      const w = widget.defaultSize.width;
      const h = widget.defaultSize.height;
      let item;

      if (widget.savedLayout) {
        item = {
          i: widget.id,
          x: widget.savedLayout.x ?? widget.defaultPosition.x,
          y: widget.savedLayout.y ?? widget.defaultPosition.y,
          w: widget.savedLayout.w || w,
          h: widget.savedLayout.h || h,
          minW: widget.minWidth || 3,
          minH: widget.minHeight || 2,
          static: lockedRef.current,
        };
      } else {
        const localKey = getTabLayoutCacheKey(widget.id);
        const localLayout = localStorage.getItem(localKey);
        if (localLayout) {
          const parsed = JSON.parse(localLayout);

          item = {
            i: widget.id,
            x: parsed.x ?? widget.defaultPosition.x,
            y: parsed.y ?? widget.defaultPosition.y,
            w: parsed.w || w,
            h: parsed.h || h,
            minW: widget.minWidth || 3,
            minH: widget.minHeight || 2,
            static: lockedRef.current,
          };
        } else {
          const pos = findFreePosition(w, h);
          item = {
            i: widget.id,
            x: pos.x,
            y: pos.y,
            w,
            h,
            minW: widget.minWidth || 3,
            minH: widget.minHeight || 2,
            static: lockedRef.current,
          };
        }
      }

      placed.push({ x: item.x, y: item.y, w: item.w, h: item.h });
      return item;
    });
    setLayout(initialLayout);
  }, [widgets, activeTab, gridCols, getTabLayoutCacheKey]);

  useEffect(() => {
    setIsLockTransitioning(true);

    setLayout((currentLayout) => {
      const updatedLayout = currentLayout.map(item => ({
        ...item,
        static: locked
      }));

      if (locked) {
        updatedLayout.forEach((item) => {
          const layoutData = {
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
          };
          localStorage.setItem(getTabLayoutCacheKey(item.i), JSON.stringify(layoutData));
        });
        saveLayoutsToApi(updatedLayout, activeTab);
      }

      return updatedLayout;
    });

    const timer = setTimeout(() => {
      setIsLockTransitioning(false);
    }, 50);

    return () => clearTimeout(timer);
  }, [locked, activeTab, saveLayoutsToApi, getTabLayoutCacheKey]);

  // Deselect widget when locked
  useEffect(() => {
    if (locked) {
      setSelectedWidget(null);
    }
  }, [locked]);

  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const handleLayoutChange = (newLayout) => {
    if (locked) return;

    const currentLayout = layoutRef.current;
    const currentLayoutById = new Map(currentLayout.map(item => [item.i, item]));
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
      const existing = currentLayout.find(l => l.i === item.i);
      if (!existing) return true;
      return existing.x !== item.x || existing.y !== item.y || existing.w !== item.w || existing.h !== item.h;
    });

    if (!hasChanged) return;

    const updatedLayout = safeLayout.map(item => ({
      ...item,
      static: locked
    }));

    setLayout(updatedLayout);
    layoutRef.current = updatedLayout;

    updatedLayout.forEach((item) => {
      const layoutData = {
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      };
      localStorage.setItem(getTabLayoutCacheKey(item.i), JSON.stringify(layoutData));
    });

    saveLayoutsToApi(updatedLayout, activeTab);

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

          const layoutData = {
            x: updatedItem.x,
            y: updatedItem.y,
            w: updatedItem.w,
            h: updatedItem.h,
          };
          localStorage.setItem(getTabLayoutCacheKey(item.i), JSON.stringify(layoutData));

          return updatedItem;
        }
        return { ...item, static: locked };
      });

      if (onLayoutChangeCallback) {
        onLayoutChangeCallback(newLayout);
      }

      saveLayoutsToApi(newLayout, activeTab);
      layoutRef.current = newLayout;
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

  const getWidgetRefreshInterval = (widgetId) => {
    const widgetSettings = JSON.parse(localStorage.getItem('widgetSettings') || '{}');

    const widgetMap = {
      'chores-widget': 'chores',
      'calendar-widget': 'calendar',
      'photos-widget': 'photos',
      'weather-widget': 'weather',
    };

    const settingsKey = widgetMap[widgetId];
    if (settingsKey && widgetSettings[settingsKey]) {
      return widgetSettings[settingsKey].refreshInterval || 0;
    }

    if (widgetId.startsWith('plugin-')) {
      const filename = widgetId.slice(7);
      const pluginSettings = JSON.parse(localStorage.getItem('pluginSettings') || '{}');
      return pluginSettings[filename]?.refreshInterval || 0;
    }

    return 0;
  };

  const handleWidgetRefresh = (widgetId) => {
    setRefreshKeys(prev => ({
      ...prev,
      [widgetId]: (prev[widgetId] || 0) + 1
    }));
  };

  const resizeButtonBaseStyle = {
    fontSize: '1.5rem',
    userSelect: 'none',
    touchAction: 'none',
    WebkitTouchCallout: 'none',
    filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
    transition: 'transform 0.1s ease, filter 0.1s ease',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: '4px 8px',
    borderRadius: '4px',
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
          borderRadius: '8px',
          zIndex: 2,
          transition: 'all 100ms ease',
        },
      }}
    >
      {layout.length > 0 && (
        <GridLayout
          className="layout"
          layout={layout}
          cols={gridCols}
          rowHeight={100}
          width={containerWidth}
          onLayoutChange={handleLayoutChange}
          isDraggable={!locked}
          isResizable={false}
          compactType={null}
          preventCollision={true}
          margin={[16, 16]}
          containerPadding={[0, 0]}
          useCSSTransforms={true}
          draggableHandle=".drag-handle"
          draggableCancel=".widget-content"
        >
          {widgets.map((widget) => {
            const isSelected = !locked && selectedWidget === widget.id;
            const currentLayout = layout.find(l => l.i === widget.id);
            const fallbackLayout = {
              i: widget.id,
              x: widget.defaultPosition.x,
              y: widget.defaultPosition.y,
              w: widget.defaultSize.width,
              h: widget.defaultSize.height,
              minW: widget.minWidth || 3,
              minH: widget.minHeight || 2,
              static: locked,
            };
            const effectiveLayout = currentLayout || fallbackLayout;
            const canDecreaseWidth = currentLayout && currentLayout.w > currentLayout.minW;
            const canDecreaseHeight = currentLayout && currentLayout.h > currentLayout.minH;
            const canIncreaseWidth = currentLayout && (currentLayout.x + currentLayout.w < gridCols);
            const canIncreaseLeft = currentLayout && currentLayout.x > 0;
            const canIncreaseTop = currentLayout && currentLayout.y > 0;

            return (
              <Box
                key={widget.id}
                className={`widget-wrapper ${isSelected ? 'selected' : ''}`}
                data-grid={{ ...effectiveLayout }}
                onPointerDown={(e) => {
                  if (!locked && !isSelected && !e.target.closest('.drag-handle') && !e.target.closest('.resize-button')) {
                    if (isInteractiveTarget(e.target)) {
                      if (selectedWidget) {
                        setSelectedWidget(null);
                      }
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
                  borderRadius: 2,
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  boxShadow: isSelected
                    ? '0 8px 32px rgba(244, 114, 182, 0.3)'
                    : '0 2px 8px rgba(0, 0, 0, 0.1)',
                  backgroundColor: 'var(--card-bg)',
                  overflow: 'hidden',
                  cursor: locked ? 'default' : (isSelected ? 'move' : 'pointer'),
                  touchAction: locked ? 'auto' : (isSelected ? 'none' : 'manipulation'),
                  '@media (hover: hover) and (pointer: fine)': {
                    '&:hover': {
                      border: locked
                        ? '3px solid transparent'
                        : (isSelected
                          ? '3px solid var(--accent)'
                          : '3px solid rgba(244, 114, 182, 0.3)'),
                      boxShadow: locked
                        ? '0 2px 8px rgba(0, 0, 0, 0.1)'
                        : (isSelected
                          ? '0 8px 32px rgba(244, 114, 182, 0.3)'
                          : '0 4px 16px rgba(0, 0, 0, 0.15)'),
                    }
                  }
                }}
              >
                {/* Resize Buttons - Only visible when selected and unlocked */}
                {isSelected && !locked && (
                  <>
                    {/* Top Resize Buttons */}
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 8,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        gap: 1,
                        zIndex: 1003,
                        pointerEvents: 'auto',
                      }}
                    >
                      <Box
                        className="resize-button"
                        onPointerDown={handleResizePointerDown(widget.id, 'top', true)}
                        sx={{
                          ...resizeButtonBaseStyle,
                          cursor: canDecreaseHeight ? 'pointer' : 'not-allowed',
                          opacity: canDecreaseHeight ? 1 : 0.3,
                          '&:hover': {
                            transform: canDecreaseHeight ? 'scale(1.2)' : 'none',
                            filter: canDecreaseHeight ? 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4))' : 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                          },
                          '&:active': {
                            transform: canDecreaseHeight ? 'scale(1.1)' : 'none',
                          }
                        }}
                      >
                        ➖
                      </Box>
                      <Box
                        className="resize-button"
                        onPointerDown={handleResizePointerDown(widget.id, 'top', false)}
                        sx={{
                          ...resizeButtonBaseStyle,
                          cursor: canIncreaseTop ? 'pointer' : 'not-allowed',
                          opacity: canIncreaseTop ? 1 : 0.3,
                          '&:hover': {
                            transform: canIncreaseTop ? 'scale(1.2)' : 'none',
                            filter: canIncreaseTop ? 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4))' : 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                          },
                          '&:active': {
                            transform: canIncreaseTop ? 'scale(1.1)' : 'none',
                          }
                        }}
                      >
                        ➕
                      </Box>
                    </Box>

                    {/* Right Resize Buttons */}
                    <Box
                      sx={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        zIndex: 1003,
                        pointerEvents: 'auto',
                      }}
                    >
                      <Box
                        className="resize-button"
                        onPointerDown={handleResizePointerDown(widget.id, 'right', true)}
                        sx={{
                          ...resizeButtonBaseStyle,
                          cursor: canDecreaseWidth ? 'pointer' : 'not-allowed',
                          opacity: canDecreaseWidth ? 1 : 0.3,
                          '&:hover': {
                            transform: canDecreaseWidth ? 'scale(1.2)' : 'none',
                            filter: canDecreaseWidth ? 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4))' : 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                          },
                          '&:active': {
                            transform: canDecreaseWidth ? 'scale(1.1)' : 'none',
                          }
                        }}
                      >
                        ➖
                      </Box>
                      <Box
                        className="resize-button"
                        onPointerDown={handleResizePointerDown(widget.id, 'right', false)}
                        sx={{
                          ...resizeButtonBaseStyle,
                          cursor: canIncreaseWidth ? 'pointer' : 'not-allowed',
                          opacity: canIncreaseWidth ? 1 : 0.3,
                          '&:hover': {
                            transform: canIncreaseWidth ? 'scale(1.2)' : 'none',
                            filter: canIncreaseWidth ? 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4))' : 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                          },
                          '&:active': {
                            transform: canIncreaseWidth ? 'scale(1.1)' : 'none',
                          }
                        }}
                      >
                        ➕
                      </Box>
                    </Box>

                    {/* Bottom Resize Buttons */}
                    <Box
                      sx={{
                        position: 'absolute',
                        bottom: 8,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        gap: 1,
                        zIndex: 1003,
                        pointerEvents: 'auto',
                      }}
                    >
                      <Box
                        className="resize-button"
                        onPointerDown={handleResizePointerDown(widget.id, 'bottom', true)}
                        sx={{
                          ...resizeButtonBaseStyle,
                          cursor: canDecreaseHeight ? 'pointer' : 'not-allowed',
                          opacity: canDecreaseHeight ? 1 : 0.3,
                          '&:hover': {
                            transform: canDecreaseHeight ? 'scale(1.2)' : 'none',
                            filter: canDecreaseHeight ? 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4))' : 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                          },
                          '&:active': {
                            transform: canDecreaseHeight ? 'scale(1.1)' : 'none',
                          }
                        }}
                      >
                        ➖
                      </Box>
                      <Box
                        className="resize-button"
                        onPointerDown={handleResizePointerDown(widget.id, 'bottom', false)}
                        sx={{
                          ...resizeButtonBaseStyle,
                          cursor: 'pointer',
                          '&:hover': {
                            transform: 'scale(1.2)',
                            filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4))',
                          },
                          '&:active': {
                            transform: 'scale(1.1)',
                          }
                        }}
                      >
                        ➕
                      </Box>
                    </Box>

                    {/* Left Resize Buttons */}
                    <Box
                      sx={{
                        position: 'absolute',
                        left: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        zIndex: 1003,
                        pointerEvents: 'auto',
                      }}
                    >
                      <Box
                        className="resize-button"
                        onPointerDown={handleResizePointerDown(widget.id, 'left', true)}
                        sx={{
                          ...resizeButtonBaseStyle,
                          cursor: canDecreaseWidth ? 'pointer' : 'not-allowed',
                          opacity: canDecreaseWidth ? 1 : 0.3,
                          '&:hover': {
                            transform: canDecreaseWidth ? 'scale(1.2)' : 'none',
                            filter: canDecreaseWidth ? 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4))' : 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                          },
                          '&:active': {
                            transform: canDecreaseWidth ? 'scale(1.1)' : 'none',
                          }
                        }}
                      >
                        ➖
                      </Box>
                      <Box
                        className="resize-button"
                        onPointerDown={handleResizePointerDown(widget.id, 'left', false)}
                        sx={{
                          ...resizeButtonBaseStyle,
                          cursor: canIncreaseLeft ? 'pointer' : 'not-allowed',
                          opacity: canIncreaseLeft ? 1 : 0.3,
                          '&:hover': {
                            transform: canIncreaseLeft ? 'scale(1.2)' : 'none',
                            filter: canIncreaseLeft ? 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4))' : 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                          },
                          '&:active': {
                            transform: canIncreaseLeft ? 'scale(1.1)' : 'none',
                          }
                        }}
                      >
                        ➕
                      </Box>
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

                {/* Countdown Circle Indicator */}
                <CountdownCircle
                  key={refreshKeys[widget.id] || 0}
                  refreshInterval={getWidgetRefreshInterval(widget.id)}
                  onRefresh={() => handleWidgetRefresh(widget.id)}
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
                  {React.cloneElement(widget.content, {
                    key: refreshKeys[widget.id] || 0
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
