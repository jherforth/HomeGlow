import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import { DragIndicator } from '@mui/icons-material';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';

const DraggableWidget = ({ 
  id, 
  children, 
  defaultPosition = { x: 0, y: 0 },
  defaultSize = { width: 6, height: 4 }, // Grid units (cols x rows)
  minWidth = 3,
  minHeight = 2,
  onPositionChange,
  onSizeChange,
  gridCols = 12,
  rowHeight = 100,
  containerWidth = 1200
}) => {
  const [isSelected, setIsSelected] = useState(false);
  const [layout, setLayout] = useState([]);

  // Load saved layout from localStorage
  useEffect(() => {
    const savedLayout = localStorage.getItem(`widget-layout-${id}`);
    if (savedLayout) {
      const parsed = JSON.parse(savedLayout);
      setLayout([{
        i: id,
        x: parsed.x || defaultPosition.x,
        y: parsed.y || defaultPosition.y,
        w: parsed.w || defaultSize.width,
        h: parsed.h || defaultSize.height,
        minW: minWidth,
        minH: minHeight
      }]);
    } else {
      setLayout([{
        i: id,
        x: defaultPosition.x,
        y: defaultPosition.y,
        w: defaultSize.width,
        h: defaultSize.height,
        minW: minWidth,
        minH: minHeight
      }]);
    }
  }, [id, defaultPosition, defaultSize, minWidth, minHeight]);

  // Save layout to localStorage
  const saveLayout = (newLayout) => {
    if (newLayout && newLayout.length > 0) {
      const item = newLayout[0];
      localStorage.setItem(`widget-layout-${id}`, JSON.stringify({
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h
      }));
      
      if (onPositionChange) {
        onPositionChange({ x: item.x, y: item.y });
      }
      if (onSizeChange) {
        onSizeChange({ width: item.w, height: item.h });
      }
    }
  };

  const handleLayoutChange = (newLayout) => {
    setLayout(newLayout);
    saveLayout(newLayout);
  };

  const handleClick = (e) => {
    // Only select if clicking on the widget itself
    if (e.target === e.currentTarget || e.target.closest('.drag-handle')) {
      setIsSelected(true);
    }
  };

  const handleClickOutside = (e) => {
    if (!e.target.closest(`[data-widget-id="${id}"]`)) {
      setIsSelected(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [id]);

  if (layout.length === 0) {
    return null; // Wait for layout to be initialized
  }

  return (
    <Box
      data-widget-id={id}
      sx={{
        position: 'relative',
        width: '100%',
        '& .react-grid-layout': {
          position: 'relative',
        },
        '& .react-grid-item': {
          transition: isSelected ? 'none' : 'all 200ms ease',
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
          display: isSelected ? 'block' : 'none',
        },
        '& .react-grid-item > .react-resizable-handle-s': {
          bottom: 0,
          left: 0,
          width: '100%',
          height: '40px',
          cursor: 'ns-resize',
        },
        '& .react-grid-item.cssTransforms': {
          transitionProperty: isSelected ? 'none' : 'transform, width, height',
        }
      }}
    >
      <GridLayout
        className="layout"
        layout={layout}
        cols={gridCols}
        rowHeight={rowHeight}
        width={containerWidth}
        onLayoutChange={handleLayoutChange}
        isDraggable={isSelected}
        isResizable={isSelected}
        compactType={null}
        preventCollision={true}
        margin={[16, 16]}
        containerPadding={[0, 0]}
        useCSSTransforms={true}
        draggableHandle=".drag-handle"
        resizeHandles={['s']}
      >
        <Box
          key={id}
          onClick={handleClick}
          sx={{
            width: '100%',
            height: '100%',
            position: 'relative',
            border: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
            borderRadius: 2,
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            boxShadow: isSelected 
              ? '0 8px 32px rgba(158, 127, 255, 0.3)' 
              : '0 2px 8px rgba(0, 0, 0, 0.1)',
            backgroundColor: 'var(--card-bg)',
            overflow: 'hidden',
            '&:hover': {
              border: isSelected 
                ? '3px solid var(--accent)' 
                : '3px solid rgba(158, 127, 255, 0.3)',
              boxShadow: isSelected 
                ? '0 8px 32px rgba(158, 127, 255, 0.3)' 
                : '0 4px 16px rgba(0, 0, 0, 0.15)',
            }
          }}
        >
          {/* Drag Handle - Only visible when selected */}
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


          {/* Grid overlay - Only visible when selected */}
          {isSelected && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundImage: `
                  linear-gradient(to right, rgba(158, 127, 255, 0.1) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(158, 127, 255, 0.1) 1px, transparent 1px)
                `,
                backgroundSize: `${containerWidth / gridCols}px ${rowHeight}px`,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          )}

          {/* Widget Content */}
          <Box
            sx={{
              width: '100%',
              height: '100%',
              overflow: 'auto',
              paddingTop: isSelected ? '40px' : '0',
              pointerEvents: isSelected ? 'none' : 'auto',
            }}
          >
            {children}
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
      </GridLayout>
    </Box>
  );
};

export default DraggableWidget;
