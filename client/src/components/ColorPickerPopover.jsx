import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CustomPicker } from 'react-color';
import { Saturation, Hue, EditableInput } from 'react-color/lib/components/common';
import { Box, Typography } from '@mui/material';

const SaturationSlider = ({ hsv, onChange }) => {
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const saturation = Math.round((hsv?.s || 0) * 100);

  const getPositionFromEvent = useCallback((e, container) => {
    const rect = container.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    return x / rect.width;
  }, []);

  const handleChange = useCallback((e) => {
    if (!containerRef.current) return;
    const newSaturation = getPositionFromEvent(e, containerRef.current);
    onChange({ s: newSaturation });
  }, [getPositionFromEvent, onChange]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    handleChange(e);
  }, [handleChange]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e) => handleChange(e);
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleChange]);

  const thumbLeft = `${saturation}%`;

  return (
    <Box sx={{ position: 'relative', height: 12, mt: 2, mb: 1 }}>
      <Box
        ref={containerRef}
        onMouseDown={handleMouseDown}
        sx={{
          position: 'relative',
          height: 8,
          borderRadius: 4,
          background: `linear-gradient(to right, hsl(${hsv?.h || 0}, 0%, ${50 + ((hsv?.v || 1) * 50)}%) 0%, hsl(${hsv?.h || 0}, 100%, ${(hsv?.v || 1) * 50}%) 100%)`,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: thumbLeft,
            transform: 'translate(-50%, -50%)',
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: `hsl(${hsv?.h || 0}, ${saturation}%, ${(hsv?.v || 1) * 50}%)`,
            border: '2px solid white',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 1px 4px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
          }}
        />
      </Box>
    </Box>
  );
};

const ColorPickerInner = ({ hex, hsv, hsl, onChange }) => {
  const handleSaturationChange = ({ s }) => {
    onChange({ ...hsv, s, source: 'hsv' });
  };

  const handleHexChange = (val) => {
    if (typeof val === 'string' && /^#?[0-9A-Fa-f]{6}$/.test(val)) {
      onChange({ hex: val.startsWith('#') ? val : `#${val}`, source: 'hex' });
    }
  };

  return (
    <Box sx={{ width: 220, p: 1.5, userSelect: 'none' }}>
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          paddingBottom: '75%',
          borderRadius: 1,
          overflow: 'hidden',
          mb: 1.5,
        }}
      >
        <Saturation hsl={hsl} hsv={hsv} onChange={onChange} />
      </Box>

      <Box sx={{ position: 'relative', height: 12, mb: 0.5 }}>
        <Hue hsl={hsl} onChange={onChange} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: 1,
            backgroundColor: hex,
            border: '1px solid rgba(0,0,0,0.15)',
            flexShrink: 0,
          }}
        />
        <Box sx={{ flex: 1, position: 'relative' }}>
          <EditableInput
            style={{
              input: {
                width: '100%',
                border: '1px solid rgba(0,0,0,0.2)',
                borderRadius: 4,
                padding: '4px 6px',
                fontSize: 12,
                fontFamily: 'monospace',
                outline: 'none',
                background: 'var(--card-bg, #fff)',
                color: 'var(--text-primary, #000)',
              },
              label: { display: 'none' },
            }}
            value={hex}
            onChange={handleHexChange}
          />
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11 }}>
          HEX
        </Typography>
      </Box>

    </Box>
  );
};

const WrappedPicker = CustomPicker(ColorPickerInner);

const ColorPickerPopover = ({ anchorEl, color, onChange, onClose }) => {
  const popoverRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const popoverWidth = 252;
    const popoverHeight = 320;
    const margin = 8;

    let top = rect.bottom + margin;
    let left = rect.left;

    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    if (top + popoverHeight > window.innerHeight - margin) {
      top = rect.top - popoverHeight - margin;
    }

    setPosition({ top, left });
  }, [anchorEl]);

  useEffect(() => {
    const handleClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        if (anchorEl && !anchorEl.contains(e.target)) {
          onClose();
        }
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose, anchorEl]);

  if (!anchorEl) return null;

  return createPortal(
    <Box
      ref={popoverRef}
      sx={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 99999,
        backgroundColor: 'var(--card-bg, #fff)',
        border: '1px solid var(--card-border, rgba(0,0,0,0.15))',
        borderRadius: 2,
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
      }}
    >
      <WrappedPicker color={color} onChange={onChange} />
    </Box>,
    document.body
  );
};

export default ColorPickerPopover;
