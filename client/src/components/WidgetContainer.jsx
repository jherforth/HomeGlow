import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import DraggableWidget from './DraggableWidget';

/**
 * Container component that manages multiple draggable widgets
 * Provides a responsive grid system for optimal layout
 */
const WidgetContainer = ({ children, widgets = [] }) => {
  const [containerWidth, setContainerWidth] = useState(1200);
  const [gridCols, setGridCols] = useState(12);
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

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        minHeight: '100vh',
        padding: 2,
        position: 'relative',
        backgroundColor: 'var(--background)',
      }}
    >
      {widgets.map((widget) => (
        <DraggableWidget
          key={widget.id}
          id={widget.id}
          defaultPosition={widget.defaultPosition}
          defaultSize={widget.defaultSize}
          minWidth={widget.minWidth}
          minHeight={widget.minHeight}
          gridCols={gridCols}
          containerWidth={containerWidth}
          rowHeight={100}
          onPositionChange={widget.onPositionChange}
          onSizeChange={widget.onSizeChange}
        >
          {widget.content}
        </DraggableWidget>
      ))}
      {children}
    </Box>
  );
};

export default WidgetContainer;
