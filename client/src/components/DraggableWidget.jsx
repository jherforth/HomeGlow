import React, { useState, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { Box, IconButton } from '@mui/material';
import { DragIndicator } from '@mui/icons-material';

const DraggableWidget = ({ 
  id, 
  children, 
  defaultPosition = { x: 0, y: 0 },
  defaultSize = { width: 600, height: 400 },
  minWidth = 300,
  minHeight = 200,
  onPositionChange,
  onSizeChange
}) => {
  const [isSelected, setIsSelected] = useState(false);
  const [position, setPosition] = useState(defaultPosition);
  const [size, setSize] = useState(defaultSize);

  // Load saved position and size from localStorage
  useEffect(() => {
    const savedLayout = localStorage.getItem(`widget-layout-${id}`);
    if (savedLayout) {
      const { position: savedPos, size: savedSize } = JSON.parse(savedLayout);
      setPosition(savedPos);
      setSize(savedSize);
    }
  }, [id]);

  // Save position and size to localStorage
  const saveLayout = (newPosition, newSize) => {
    localStorage.setItem(`widget-layout-${id}`, JSON.stringify({
      position: newPosition,
      size: newSize
    }));
  };

  const handleDragStop = (e, d) => {
    const newPosition = { x: d.x, y: d.y };
    setPosition(newPosition);
    saveLayout(newPosition, size);
    if (onPositionChange) {
      onPositionChange(newPosition);
    }
  };

  const handleResizeStop = (e, direction, ref, delta, position) => {
    const newSize = {
      width: ref.style.width,
      height: ref.style.height
    };
    const newPosition = { x: position.x, y: position.y };
    
    setSize(newSize);
    setPosition(newPosition);
    saveLayout(newPosition, newSize);
    
    if (onSizeChange) {
      onSizeChange(newSize);
    }
  };

  const handleClick = (e) => {
    // Only select if clicking on the widget itself, not its children
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
  }, []);

  return (
    <Rnd
      data-widget-id={id}
      position={position}
      size={size}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      minWidth={minWidth}
      minHeight={minHeight}
      bounds="parent"
      dragHandleClassName="drag-handle"
      enableResizing={isSelected}
      disableDragging={!isSelected}
      style={{
        zIndex: isSelected ? 1000 : 1,
      }}
    >
      <Box
        onClick={handleClick}
        sx={{
          width: '100%',
          height: '100%',
          position: 'relative',
          border: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
          borderRadius: 2,
          transition: 'border-color 0.2s ease',
          boxShadow: isSelected ? '0 8px 32px rgba(var(--accent-rgb), 0.3)' : 'none',
          '&:hover': {
            border: isSelected ? '3px solid var(--accent)' : '3px solid rgba(var(--accent-rgb), 0.3)',
          }
        }}
      >
        {/* Drag Handle - Only visible when selected */}
        {isSelected && (
          <Box
            className="drag-handle"
            sx={{
              position: 'absolute',
              top: -40,
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'var(--accent)',
              color: 'white',
              padding: '8px 24px',
              borderRadius: '8px 8px 0 0',
              cursor: 'move',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
              zIndex: 1001,
              userSelect: 'none',
              '&:hover': {
                backgroundColor: 'var(--accent)',
                filter: 'brightness(1.1)',
              }
            }}
          >
            <DragIndicator />
            <Box sx={{ fontSize: '0.875rem', fontWeight: 'bold' }}>
              Drag to Move
            </Box>
          </Box>
        )}

        {/* Resize Indicators - Only visible when selected */}
        {isSelected && (
          <>
            {/* Corner resize indicators */}
            <Box
              sx={{
                position: 'absolute',
                top: -8,
                left: -8,
                width: 16,
                height: 16,
                backgroundColor: 'var(--accent)',
                borderRadius: '50%',
                border: '2px solid white',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                pointerEvents: 'none',
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                top: -8,
                right: -8,
                width: 16,
                height: 16,
                backgroundColor: 'var(--accent)',
                borderRadius: '50%',
                border: '2px solid white',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                pointerEvents: 'none',
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                bottom: -8,
                left: -8,
                width: 16,
                height: 16,
                backgroundColor: 'var(--accent)',
                borderRadius: '50%',
                border: '2px solid white',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                pointerEvents: 'none',
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                bottom: -8,
                right: -8,
                width: 16,
                height: 16,
                backgroundColor: 'var(--accent)',
                borderRadius: '50%',
                border: '2px solid white',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                pointerEvents: 'none',
              }}
            />
          </>
        )}

        {/* Widget Content */}
        <Box
          sx={{
            width: '100%',
            height: '100%',
            overflow: 'auto',
            pointerEvents: isSelected ? 'none' : 'auto', // Disable interaction when selected for dragging
          }}
        >
          {children}
        </Box>

        {/* Click instruction overlay when selected */}
        {isSelected && (
          <Box
            sx={{
              position: 'absolute',
              bottom: -40,
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'var(--accent)',
              color: 'white',
              padding: '6px 16px',
              borderRadius: '0 0 8px 8px',
              fontSize: '0.75rem',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
              zIndex: 1001,
              userSelect: 'none',
            }}
          >
            Drag corners to resize • Click outside to deselect
          </Box>
        )}
      </Box>
    </Rnd>
  );
};

export default DraggableWidget;
