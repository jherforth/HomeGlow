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
const WidgetContainer = ({ children, widgets = [] }) => {
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

  // Initialize layout from localStorage or defaults
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
      };
    });
    setLayout(initialLayout);
  }, [widgets]);

  // Save layout to localStorage
  const handleLayoutChange = (newLayout) => {
    setLayout(newLayout);
    newLayout.forEach((item) => {
      localStorage.setItem(`widget-layout-${item.i}`, JSON.stringify({
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      }));
    });
  };

  // Handle resize button clicks (both increment and decrement)
  const handleResize = (widgetId, direction, isDecrement = false) => {
    setLayout((currentLayout) => {
      const newLayout = currentLayout.map((item) => {
        if (item.i === widgetId) {
          const updatedItem = { ...item };
          const delta = isDecrement ? -1 : 1;

          switch (direction) {
            case 'right':
              if (isDecrement) {
                // Decrease width by 1, but respect minimum width
                if (item.w > item.minW) {
                  updatedItem.w = item.w - 1;
                }
              } else {
                // Increase width by 1, but don't exceed grid columns
                if (item.x + item.w < gridCols) {
                  updatedItem.w = item.w + 1;
                }
              }
              break;
            case 'left':
              if (isDecrement) {
                // Decrease width by 1 and move right
                if (item.w > item.minW) {
                  updatedItem.x = item.x + 1;
                  updatedItem.w = item.w - 1;
                }
              } else {
                // Increase width by 1 and move left
                if (item.x > 0) {
                  updatedItem.x = item.x - 1;
                  updatedItem.w = item.w + 1;
                }
              }
              break;
            case 'bottom':
              if (isDecrement) {
                // Decrease height by 1, but respect minimum height
                if (item.h > item.minH) {
                  updatedItem.h = item.h - 1;
                }
              } else {
                // Increase height by 1
                updatedItem.h = item.h + 1;
              }
              break;
            case 'top':
              if (isDecrement) {
                // Decrease height by 1 and move down
                if (item.h > item.minH) {
                  updatedItem.y = item.y + 1;
                  updatedItem.h = item.h - 1;
                }
              } else {
                // Increase height by 1 and move up
                if (item.y > 0) {
                  updatedItem.y = item.y - 1;
                  updatedItem.h = item.h + 1;
                }
              }
              break;
          }

          // Save to localStorage
          localStorage.setItem(`widget-layout-${item.i}`, JSON.stringify({
            x: updatedItem.x,
            y: updatedItem.y,
            w: updatedItem.w,
            h: updatedItem.h,
          }));

          return updatedItem;
        }
        return item;
      });
      return newLayout;
    });
  };

  const handleWidgetClick = (widgetId, e) => {
    // Select widget when clicking anywhere on it
    setSelectedWidget(widgetId);
  };

  // Click outside to deselect
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.widget-wrapper')) {
        setSelectedWidget(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
          isDraggable={true}
          isResizable={false}
          compactType={null}
          preventCollision={true}
          margin={[16, 16]}
          containerPadding={[0, 0]}
          useCSSTransforms={true}
          draggableHandle=".drag-handle"
        >
          {widgets.map((widget) => {
            const isSelected = selectedWidget === widget.id;
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
                  '&:hover': {
                    border: isSelected
                      ? '3px solid var(--accent)'
                      : '3px solid rgba(244, 114, 182, 0.3)',
                    boxShadow: isSelected
                      ? '0 8px 32px rgba(244, 114, 182, 0.3)'
                      : '0 4px 16px rgba(0, 0, 0, 0.15)',
                  }
                }}
              >
                {/* Drag Handle - Always visible when selected */}
                {isSelected && (
                  <Box
                    className="drag-handle"
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      backgroundColor: 'var(--accent)',
                      color: 'white',
                      padding: '8px 16px',
                      cursor: 'move',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                      zIndex: 1001,
                      userSelect: 'none',
                      borderRadius: '8px 8px 0 0',
                      '&:hover': {
                        filter: 'brightness(1.1)',
                      }
                    }}
                  >
                    <DragIndicator />
                    <Box sx={{ fontSize: '0.875rem', fontWeight: 'bold' }}>
                      Drag to Move Widget
                    </Box>
                  </Box>
                )}

                {/* Resize Buttons - Only visible when selected */}
                {isSelected && (
                  <>
                    {/* Top Resize Buttons */}
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 0,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        gap: 1,
                        zIndex: 1002,
                      }}
                    >
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResize(widget.id, 'top', true);
                        }}
                        disabled={!canDecreaseHeight}
                        sx={{
                          backgroundColor: 'var(--error)',
                          color: 'white',
                          width: 32,
                          height: 32,
                          fontSize: '1.25rem',
                          opacity: canDecreaseHeight ? 1 : 0.3,
                          '&:hover': {
                            backgroundColor: 'var(--error)',
                            filter: canDecreaseHeight ? 'brightness(1.2)' : 'none',
                          },
                          '&:disabled': {
                            backgroundColor: 'var(--error)',
                            color: 'white',
                            cursor: 'not-allowed',
                          },
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                        }}
                      >
                        ➖
                      </IconButton>
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResize(widget.id, 'top', false);
                        }}
                        disabled={!canIncreaseTop}
                        sx={{
                          backgroundColor: 'var(--accent)',
                          color: 'white',
                          width: 32,
                          height: 32,
                          fontSize: '1.25rem',
                          opacity: canIncreaseTop ? 1 : 0.3,
                          '&:hover': {
                            backgroundColor: 'var(--accent)',
                            filter: canIncreaseTop ? 'brightness(1.2)' : 'none',
                          },
                          '&:disabled': {
                            backgroundColor: 'var(--accent)',
                            color: 'white',
                            cursor: 'not-allowed',
                          },
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                        }}
                      >
                        ➕
                      </IconButton>
                    </Box>

                    {/* Right Resize Buttons */}
                    <Box
                      sx={{
                        position: 'absolute',
                        right: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        zIndex: 1002,
                      }}
                    >
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResize(widget.id, 'right', true);
                        }}
                        disabled={!canDecreaseWidth}
                        sx={{
                          backgroundColor: 'var(--error)',
                          color: 'white',
                          width: 32,
                          height: 32,
                          fontSize: '1.25rem',
                          opacity: canDecreaseWidth ? 1 : 0.3,
                          '&:hover': {
                            backgroundColor: 'var(--error)',
                            filter: canDecreaseWidth ? 'brightness(1.2)' : 'none',
                          },
                          '&:disabled': {
                            backgroundColor: 'var(--error)',
                            color: 'white',
                            cursor: 'not-allowed',
                          },
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                        }}
                      >
                        ➖
                      </IconButton>
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResize(widget.id, 'right', false);
                        }}
                        disabled={!canIncreaseWidth}
                        sx={{
                          backgroundColor: 'var(--accent)',
                          color: 'white',
                          width: 32,
                          height: 32,
                          fontSize: '1.25rem',
                          opacity: canIncreaseWidth ? 1 : 0.3,
                          '&:hover': {
                            backgroundColor: 'var(--accent)',
                            filter: canIncreaseWidth ? 'brightness(1.2)' : 'none',
                          },
                          '&:disabled': {
                            backgroundColor: 'var(--accent)',
                            color: 'white',
                            cursor: 'not-allowed',
                          },
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                        }}
                      >
                        ➕
                      </IconButton>
                    </Box>

                    {/* Bottom Resize Buttons */}
                    <Box
                      sx={{
                        position: 'absolute',
                        bottom: 0,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        gap: 1,
                        zIndex: 1002,
                      }}
                    >
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResize(widget.id, 'bottom', true);
                        }}
                        disabled={!canDecreaseHeight}
                        sx={{
                          backgroundColor: 'var(--error)',
                          color: 'white',
                          width: 32,
                          height: 32,
                          fontSize: '1.25rem',
                          opacity: canDecreaseHeight ? 1 : 0.3,
                          '&:hover': {
                            backgroundColor: 'var(--error)',
                            filter: canDecreaseHeight ? 'brightness(1.2)' : 'none',
                          },
                          '&:disabled': {
                            backgroundColor: 'var(--error)',
                            color: 'white',
                            cursor: 'not-allowed',
                          },
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                        }}
                      >
                        ➖
                      </IconButton>
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResize(widget.id, 'bottom', false);
                        }}
                        sx={{
                          backgroundColor: 'var(--accent)',
                          color: 'white',
                          width: 32,
                          height: 32,
                          fontSize: '1.25rem',
                          '&:hover': {
                            backgroundColor: 'var(--accent)',
                            filter: 'brightness(1.2)',
                          },
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                        }}
                      >
                        ➕
                      </IconButton>
                    </Box>

                    {/* Left Resize Buttons */}
                    <Box
                      sx={{
                        position: 'absolute',
                        left: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        zIndex: 1002,
                      }}
                    >
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResize(widget.id, 'left', true);
                        }}
                        disabled={!canDecreaseWidth}
                        sx={{
                          backgroundColor: 'var(--error)',
                          color: 'white',
                          width: 32,
                          height: 32,
                          fontSize: '1.25rem',
                          opacity: canDecreaseWidth ? 1 : 0.3,
                          '&:hover': {
                            backgroundColor: 'var(--error)',
                            filter: canDecreaseWidth ? 'brightness(1.2)' : 'none',
                          },
                          '&:disabled': {
                            backgroundColor: 'var(--error)',
                            color: 'white',
                            cursor: 'not-allowed',
                          },
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                        }}
                      >
                        ➖
                      </IconButton>
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResize(widget.id, 'left', false);
                        }}
                        disabled={!canIncreaseLeft}
                        sx={{
                          backgroundColor: 'var(--accent)',
                          color: 'white',
                          width: 32,
                          height: 32,
                          fontSize: '1.25rem',
                          opacity: canIncreaseLeft ? 1 : 0.3,
                          '&:hover': {
                            backgroundColor: 'var(--accent)',
                            filter: canIncreaseLeft ? 'brightness(1.2)' : 'none',
                          },
                          '&:disabled': {
                            backgroundColor: 'var(--accent)',
                            color: 'white',
                            cursor: 'not-allowed',
                          },
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                        }}
                      >
                        ➕
                      </IconButton>
                    </Box>
                  </>
                )}

                {/* Widget Content */}
                <Box
                  className="widget-content"
                  sx={{
                    width: '100%',
                    height: '100%',
                    overflow: 'auto',
                    paddingTop: isSelected ? '48px' : '0',
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
