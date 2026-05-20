import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import AutorenewIcon from '@mui/icons-material/Autorenew';

const CountdownCircle = ({ refreshInterval, onRefresh }) => {
  const [progress, setProgress] = useState(0);
  const [cycleKey, setCycleKey] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!refreshInterval || refreshInterval === 0) {
      return;
    }

    const startTime = Date.now();

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const progressPercent = (elapsed / refreshInterval) * 100;

      setProgress(Math.min(progressPercent, 100));

      if (progressPercent >= 100) {
        if (onRefresh) {
          onRefresh();
        }
        setCycleKey(prev => prev + 1);
      }
    };

    updateProgress();
    const intervalId = setInterval(updateProgress, 100);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshInterval, onRefresh, cycleKey]);

  if (!refreshInterval || refreshInterval === 0) {
    return null;
  }

  const size = 32;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const handleManualRefresh = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (onRefresh) {
      onRefresh();
    }

    // Restart the countdown immediately after manual refresh.
    setCycleKey(prev => prev + 1);
  };

  return (
    <Box
      component="button"
      type="button"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleManualRefresh}
      aria-label="Refresh widget now"
      title="Refresh now"
      sx={{
        position: 'absolute',
        bottom: 8,
        left: 8,
        zIndex: 1002,
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        pointerEvents: 'auto',
        background: 'transparent',
        border: 'none',
        padding: 0,
        margin: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        style={{
          transform: 'rotate(-90deg)',
        }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.1s linear',
            filter: 'drop-shadow(0 0 4px rgba(158, 127, 255, 0.5))',
          }}
        />
      </svg>

      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          backgroundColor: 'rgba(0, 0, 0, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 0.15s ease',
          pointerEvents: 'none',
        }}
      >
        <AutorenewIcon sx={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 18 }} />
      </Box>
    </Box>
  );
};

export default CountdownCircle;
