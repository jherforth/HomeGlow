import React, { useState, useEffect, useRef } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { Nightlight } from '@mui/icons-material';

const ScreensaverCountdown = ({ enabled, timeoutMinutes, lastActivityRef, screensaverActive }) => {
  const [remaining, setRemaining] = useState(timeoutMinutes * 60);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!enabled || screensaverActive) {
      setRemaining(timeoutMinutes * 60);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - lastActivityRef.current) / 1000;
      const left = Math.max(0, (timeoutMinutes * 60) - elapsed);
      setRemaining(Math.ceil(left));
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, timeoutMinutes, screensaverActive, lastActivityRef]);

  if (!enabled || screensaverActive) return null;

  const totalSeconds = timeoutMinutes * 60;
  const progress = remaining / totalSeconds;
  const size = 28;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) return `${m}:${s.toString().padStart(2, '0')}`;
    return `${s}s`;
  };

  return (
    <Tooltip title={`Screensaver in ${formatTime(remaining)}`} placement="top">
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          cursor: 'default',
          opacity: remaining < 30 ? 1 : 0.5,
          transition: 'opacity 0.3s ease',
        }}
      >
        <Box sx={{ position: 'relative', width: size, height: size }}>
          <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              opacity={0.15}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={remaining < 30 ? 'var(--accent)' : 'currentColor'}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <Nightlight sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 14,
            color: remaining < 30 ? 'var(--accent)' : 'inherit',
          }} />
        </Box>
        {remaining < 60 && (
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.65rem',
              fontWeight: 'bold',
              color: 'var(--accent)',
              minWidth: 20,
            }}
          >
            {remaining}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
};

export default ScreensaverCountdown;
