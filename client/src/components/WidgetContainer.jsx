import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';
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
        '& .react-grid-item > .react-resizable-handle': {
          display: 'none',
        },
        '& .react-grid-item:has(.selected) > .react-resizable-handle-s': {
          display: 'block',
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          height: '40px',
          cursor: 'ns-resize',
          zIndex: 1001,
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
          isResizable={true}
          resizeHandles={['s']}
          compactType={null}
          preventCollision={true}
          margin={[16, 16]}
          containerPadding={[0, 0]}
          useCSSTransforms={true}
          draggableHandle=".drag-handle"
        >
          {widgets.map((widget) => {
            const isSelected = selectedWidget === widget.id;
            return (
              <Box
                key={widget.id}
                className={`widget-wrapper ${isSelected ? 'selected' : ''}`}
                data-grid={{ ...layout.find(l => l.i === widget.id) }}
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
                {/* Drag Handle - Always visible */}
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


                {/* Widget Content */}
                <Box
                  className="widget-content"
                  sx={{
                    width: '100%',
                    height: '100%',
                    overflow: 'auto',
                    paddingTop: isSelected ? '48px' : '0',
                    paddingBottom: isSelected ? '48px' : '0',
                    pointerEvents: isSelected ? 'none' : 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {widget.content}
                </Box>

                {/* Resize handle bar - Only visible when selected */}
                {isSelected && (
                  <Box
                    className="react-resizable-handle react-resizable-handle-s"
                    sx={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      backgroundColor: 'var(--accent)',
                      color: 'white',
                      padding: '8px 16px',
                      fontSize: '0.75rem',
                      textAlign: 'center',
                      boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.2)',
                      zIndex: 1001,
                      userSelect: 'none',
                      borderRadius: '0 0 8px 8px',
                      cursor: 'ns-resize',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1,
                      '&:hover': {
                        filter: 'brightness(1.1)',
                      },
                      '&::before': {
                        content: '"⇕"',
                        fontSize: '1rem',
                        marginRight: '8px',
                      }
                    }}
                  >
                    Drag to Resize Height • Click outside to deselect
                  </Box>
                )}
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
