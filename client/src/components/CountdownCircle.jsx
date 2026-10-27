import React, { useState, useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import AutorenewIcon from '@mui/icons-material/Autorenew';

// How the ring sits between refreshes, and how long it shows after one.
const IDLE_OPACITY = 0.3;
const FLASH_MS = 1500;

const CountdownCircle = ({ refreshInterval, onRefresh, isActive = true }) => {
  const [progress, setProgress] = useState(0);
  const [cycleKey, setCycleKey] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  // Shown at full strength for a moment when a refresh fires; faint the rest
  // of the time, so a board of widgets isn't a row of ticking rings.
  const [justRefreshed, setJustRefreshed] = useState(false);
  const flashTimerRef = useRef(null);
  const flash = () => {
    setJustRefreshed(true);
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setJustRefreshed(false), FLASH_MS);
  };
  useEffect(() => () => clearTimeout(flashTimerRef.current), []);

  // The cycle clock lives in refs so pausing (isActive false) stops the
  // ticking without resetting elapsed time — wall-clock time keeps counting,
  // which is what makes the overdue catch-up on resume work.
  const cycleStartRef = useRef(Date.now());
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    cycleStartRef.current = Date.now();
    setProgress(0);
  }, [cycleKey]);

  useEffect(() => {
    if (!refreshInterval || refreshInterval === 0 || !isActive) {
      return;
    }

    const updateProgress = () => {
      const elapsed = Date.now() - cycleStartRef.current;
      const progressPercent = (elapsed / refreshInterval) * 100;

      setProgress(Math.min(progressPercent, 100));

      if (progressPercent >= 100) {
        if (onRefreshRef.current) {
          onRefreshRef.current();
        }
        flash();
        setCycleKey(prev => prev + 1);
      }
    };

    // Runs immediately so a cycle that became overdue while paused fires its
    // refresh as soon as the widget is active again.
    updateProgress();
    const intervalId = setInterval(updateProgress, 100);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshInterval, cycleKey, isActive]);

  if (!refreshInterval || refreshInterval === 0) {
    return null;
  }

  const size = 32;
  // The ring is sized for Classic's 3px meter. A theme's thicker meter
  // (--hg-meter-thickness, up to 12px) draws past the box rather than
  // shrinking the ring, so Classic stays exactly as it was.
  const radius = (size - 3) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const handleManualRefresh = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (onRefresh) {
      onRefresh();
    }
    flash();

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
        opacity: isHovered || justRefreshed ? 1 : IDLE_OPACITY,
        transition: 'opacity 0.3s ease',
        '&:focus-visible': { opacity: 1 },
      }}
    >
      <svg
        width={size}
        height={size}
        style={{
          transform: 'rotate(-90deg)',
          overflow: 'visible',
        }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          style={{ stroke: 'var(--hg-meter-track)', strokeWidth: 'var(--hg-meter-thickness)' }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            stroke: 'var(--hg-meter-fill)',
            strokeWidth: 'var(--hg-meter-thickness)',
            strokeLinecap: 'var(--hg-meter-cap)',
            transition: 'stroke-dashoffset 0.1s linear',
            filter: isHovered || justRefreshed ? 'drop-shadow(0 0 4px rgba(var(--accent-rgb), 0.5))' : 'none',
          }}
        />
      </svg>

      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          backgroundColor: 'var(--hg-black-30)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 0.15s ease',
          pointerEvents: 'none',
        }}
      >
        <AutorenewIcon sx={{ color: 'var(--hg-white-90)', fontSize: 18 }} />
      </Box>
    </Box>
  );
};

export default CountdownCircle;
