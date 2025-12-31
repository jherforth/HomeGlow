import React, { useState, useEffect } from 'react';
import { Box, IconButton } from '@mui/material';
import { DragIndicator } from '@mui/icons-material';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

/**
 * Container component that manages multiple draggable widgets
 * Provides a responsive grid system for optimal layout
 */
const WidgetContainer = ({ children, widgets = [], locked = true, onLayoutChange: onLayoutChangeCallback }) => {
  const [containerWidth, setContainerWidth] = useState(1200);
  const [gridCols, setGridCols] = useState(12);
  const [selectedWidget, setSelectedWidget] = useState(null);
  const [layout, setLayout] = useState([]);
  const containerRef = React.useRef(null);

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

  // Initialize layout from localStorage or defaults (only on mount or when widgets change)
  useEffect(() => {
    const initialLayout = widgets.map((widget) => {
      const savedLayout = localStorage.getItem(`widget-layout-${widget.id}`);
      if (savedLayout) {
        const parsed = JSON.parse(savedLayout);
        return {
          i: widget.id,
          x: parsed.x || widget.defaultPosition.x,
          y: parsed.y || widget.defaultPosition.y,
          w: parsed.w || widget.defaultSize.width,
          h: parsed.h || widget.defaultSize.height,
          minW: widget.minWidth || 3,
          minH: widget.minHeight || 2,
          static: locked,
        };
      }
      return {
        i: widget.id,
        x: widget.defaultPosition.x,
        y: widget.defaultPosition.y,
        w: widget.defaultSize.width,
        h: widget.defaultSize.height,
        minW: widget.minWidth || 3,
        minH: widget.minHeight || 2,
        static: locked,
      };
    });
    setLayout(initialLayout);
  }, [widgets]);

  // Update static property when lock state changes
  useEffect(() => {
    setLayout((currentLayout) =>
      currentLayout.map(item => ({
        ...item,
        static: locked
      }))
    );
  }, [locked]);

  // Deselect widget when locked
  useEffect(() => {
    if (locked) {
      setSelectedWidget(null);
    }
  }, [locked]);

  // Save layout to localStorage and notify parent
  const handleLayoutChange = (newLayout) => {
    if (locked) return; // Don't save if locked

    // Preserve the static property when updating layout
    const updatedLayout = newLayout.map(item => ({
      ...item,
      static: locked
    }));

    setLayout(updatedLayout);
    newLayout.forEach((item) => {
      const layoutData = {
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      };
      localStorage.setItem(`widget-layout-${item.i}`, JSON.stringify(layoutData));
    });

    // Notify parent component of layout change
    if (onLayoutChangeCallback) {
      onLayoutChangeCallback(newLayout);
    }
  };

  // Handle resize button clicks (both increment and decrement)
  const handleResize = (widgetId, direction, isDecrement = false) => {
    if (locked) {
      return;
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

          // Save to localStorage
          const layoutData = {
            x: updatedItem.x,
            y: updatedItem.y,
            w: updatedItem.w,
            h: updatedItem.h,
          };
          localStorage.setItem(`widget-layout-${item.i}`, JSON.stringify(layoutData));

          return updatedItem;
        }
        return { ...item, static: locked };
      });

      // Notify parent component of layout change
      if (onLayoutChangeCallback) {
        onLayoutChangeCallback(newLayout);
      }

      return newLayout;
    });
  };

  const handleWidgetClick = (widgetId, e) => {
    if (locked) return; // Don't select if locked
    if (e.target.closest('.drag-handle')) return; // Don't re-select when clicking drag handle
    setSelectedWidget(widgetId);
  };

  // Click outside to deselect
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.widget-wrapper')) {
        if (selectedWidget) {
          setSelectedWidget(null);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedWidget]);

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
          transition: selectedWidget ? 'none' : 'all 200ms ease',
          transitionProperty: 'left, top, width, height',
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
          allowOverlap={true}
          margin={[16, 16]}
          containerPadding={[0, 0]}
          useCSSTransforms={true}
          draggableHandle=".drag-handle"
          draggableCancel=".widget-content"
        >
          {widgets.map((widget) => {
            const isSelected = !locked && selectedWidget === widget.id;
            const currentLayout = layout.find(l => l.i === widget.id);
            const canDecreaseWidth = currentLayout && currentLayout.w > currentLayout.minW;
            const canDecreaseHeight = currentLayout && currentLayout.h > currentLayout.minH;
            const canIncreaseWidth = currentLayout && (currentLayout.x + currentLayout.w < gridCols);
            const canIncreaseLeft = currentLayout && currentLayout.x > 0;
            const canIncreaseTop = currentLayout && currentLayout.y > 0;

            return (
              <Box
                key={widget.id}
                className={`widget-wrapper ${isSelected ? 'selected' : ''}`}
                data-grid={{ ...currentLayout }}
                onClick={(e) => handleWidgetClick(widget.id, e)}
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
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleResize(widget.id, 'top', true);
                        }}
                        sx={{
                          fontSize: '1.5rem',
                          cursor: canDecreaseHeight ? 'pointer' : 'not-allowed',
                          opacity: canDecreaseHeight ? 1 : 0.3,
                          userSelect: 'none',
                          filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                          transition: 'transform 0.1s ease, filter 0.1s ease',
                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                          padding: '4px 8px',
                          borderRadius: '4px',
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
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleResize(widget.id, 'top', false);
                        }}
                        sx={{
                          fontSize: '1.5rem',
                          cursor: canIncreaseTop ? 'pointer' : 'not-allowed',
                          opacity: canIncreaseTop ? 1 : 0.3,
                          userSelect: 'none',
                          filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                          transition: 'transform 0.1s ease, filter 0.1s ease',
                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                          padding: '4px 8px',
                          borderRadius: '4px',
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
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleResize(widget.id, 'right', true);
                        }}
                        sx={{
                          fontSize: '1.5rem',
                          cursor: canDecreaseWidth ? 'pointer' : 'not-allowed',
                          opacity: canDecreaseWidth ? 1 : 0.3,
                          userSelect: 'none',
                          filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                          transition: 'transform 0.1s ease, filter 0.1s ease',
                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                          padding: '4px 8px',
                          borderRadius: '4px',
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
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleResize(widget.id, 'right', false);
                        }}
                        sx={{
                          fontSize: '1.5rem',
                          cursor: canIncreaseWidth ? 'pointer' : 'not-allowed',
                          opacity: canIncreaseWidth ? 1 : 0.3,
                          userSelect: 'none',
                          filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                          transition: 'transform 0.1s ease, filter 0.1s ease',
                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                          padding: '4px 8px',
                          borderRadius: '4px',
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
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleResize(widget.id, 'bottom', true);
                        }}
                        sx={{
                          fontSize: '1.5rem',
                          cursor: canDecreaseHeight ? 'pointer' : 'not-allowed',
                          opacity: canDecreaseHeight ? 1 : 0.3,
                          userSelect: 'none',
                          filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                          transition: 'transform 0.1s ease, filter 0.1s ease',
                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                          padding: '4px 8px',
                          borderRadius: '4px',
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
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleResize(widget.id, 'bottom', false);
                        }}
                        sx={{
                          fontSize: '1.5rem',
                          cursor: 'pointer',
                          userSelect: 'none',
                          filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                          transition: 'transform 0.1s ease, filter 0.1s ease',
                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                          padding: '4px 8px',
                          borderRadius: '4px',
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
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleResize(widget.id, 'left', true);
                        }}
                        sx={{
                          fontSize: '1.5rem',
                          cursor: canDecreaseWidth ? 'pointer' : 'not-allowed',
                          opacity: canDecreaseWidth ? 1 : 0.3,
                          userSelect: 'none',
                          filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                          transition: 'transform 0.1s ease, filter 0.1s ease',
                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                          padding: '4px 8px',
                          borderRadius: '4px',
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
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleResize(widget.id, 'left', false);
                        }}
                        sx={{
                          fontSize: '1.5rem',
                          cursor: canIncreaseLeft ? 'pointer' : 'not-allowed',
                          opacity: canIncreaseLeft ? 1 : 0.3,
                          userSelect: 'none',
                          filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                          transition: 'transform 0.1s ease, filter 0.1s ease',
                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                          padding: '4px 8px',
                          borderRadius: '4px',
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

                {/* Widget Content */}
                <Box
                  className="widget-content"
                  sx={{
                    width: '100%',
                    height: '100%',
                    overflow: 'auto',
                    pointerEvents: isSelected ? 'none' : 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {widget.content}
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
