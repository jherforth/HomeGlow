import React, { useEffect, useCallback, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { usePageVisibility } from '../hooks/useScreenActivity.js';

// Vacation-mode screensaver (issue #121): vacation emoji pop up from behind
// the bottom dock like popcorn — random upward velocity, random direction,
// gravity pulls them back down out of view — at a seldom, random rate.
// Mirrors ScreenSaver.jsx's exit (click/touch/Escape), wake lock, and
// z-index conventions.

const VACATION_EMOJI = ['🏖️', '⛱️', '✈️', '⛷️', '🚗', '🎒', '⛺', '🚐'];

// Pop cadence: seldom and irregular, like slow popcorn.
const MIN_POP_DELAY_MS = 900;
const MAX_POP_DELAY_MS = 4200;
const GRAVITY_PX_S2 = 1200;

const randomBetween = (min, max) => min + Math.random() * (max - min);

const VacationScreensaver = ({ onExit }) => {
  const pageVisible = usePageVisibility();
  // Particle ids drive React rendering; positions are advanced with direct
  // style writes in the rAF loop so 60fps motion causes zero re-renders.
  const [particles, setParticles] = useState([]);
  const particleStateRef = useRef(new Map());
  const particleNodesRef = useRef(new Map());
  const nextIdRef = useRef(1);
  const exitTimeoutRef = useRef(null);

  const handleExit = useCallback(() => {
    if (exitTimeoutRef.current) return;
    exitTimeoutRef.current = true;
    onExit();
  }, [onExit]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleExit]);

  // Keep the display awake, exactly like the standard screensaver.
  useEffect(() => {
    if (!('wakeLock' in navigator)) return undefined;

    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.log('Wake Lock error:', err);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (wakeLock) {
        wakeLock.release();
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Spawner: pop a random emoji from behind the dock at a random interval.
  useEffect(() => {
    if (!pageVisible) return undefined;

    let spawnTimeout = null;
    const spawn = () => {
      const id = nextIdRef.current++;
      const width = window.innerWidth;
      const height = window.innerHeight;
      // Launch from behind the dock: bottom-center region of the screen.
      const x = width / 2 + randomBetween(-width * 0.18, width * 0.18);
      // Upward velocity strong enough to clear 35–85% of the screen height,
      // horizontal drift picks the random direction.
      const vy = -Math.sqrt(2 * GRAVITY_PX_S2 * randomBetween(height * 0.35, height * 0.85));
      const vx = randomBetween(-width * 0.25, width * 0.25);
      const spin = randomBetween(-180, 180);

      particleStateRef.current.set(id, { x, y: height + 40, vx, vy, spin, rotation: 0 });
      setParticles((prev) => [
        ...prev,
        { id, emoji: VACATION_EMOJI[Math.floor(Math.random() * VACATION_EMOJI.length)] },
      ]);

      spawnTimeout = setTimeout(spawn, randomBetween(MIN_POP_DELAY_MS, MAX_POP_DELAY_MS));
    };

    spawnTimeout = setTimeout(spawn, randomBetween(300, 1200));
    return () => clearTimeout(spawnTimeout);
  }, [pageVisible]);

  // Physics loop: parabolic flight, remove once fallen back out of view.
  useEffect(() => {
    if (!pageVisible) return undefined;

    let rafId = null;
    let lastTime = performance.now();

    const step = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const height = window.innerHeight;
      const finished = [];

      particleStateRef.current.forEach((p, id) => {
        p.vy += GRAVITY_PX_S2 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.spin * dt;

        if (p.y > height + 80 && p.vy > 0) {
          finished.push(id);
          return;
        }
        const node = particleNodesRef.current.get(id);
        if (node) {
          node.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rotation}deg)`;
        }
      });

      if (finished.length > 0) {
        finished.forEach((id) => {
          particleStateRef.current.delete(id);
          particleNodesRef.current.delete(id);
        });
        setParticles((prev) => prev.filter((particle) => !finished.includes(particle.id)));
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [pageVisible]);

  return (
    <Box
      onClick={handleExit}
      onTouchStart={handleExit}
      aria-label="Vacation screensaver"
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        cursor: 'none',
        overflow: 'hidden',
        background: 'var(--background)',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: '38%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '1.4rem',
          fontWeight: 600,
          color: 'var(--text-color)',
          opacity: 0.35,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        🌴 Vacation Mode 🌴
      </Box>

      {particles.map((particle) => (
        <Box
          key={particle.id}
          ref={(node) => {
            if (node) {
              particleNodesRef.current.set(particle.id, node);
            }
          }}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            fontSize: '4rem',
            lineHeight: 1,
            pointerEvents: 'none',
            userSelect: 'none',
            willChange: 'transform',
            // First paint happens off-screen; the rAF loop takes over.
            transform: 'translate(-100px, 200vh)',
          }}
        >
          {particle.emoji}
        </Box>
      ))}

      <Box
        sx={{
          position: 'absolute',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          color: 'white',
          px: 2,
          py: 0.5,
          borderRadius: 2,
          fontSize: '0.75rem',
          opacity: 0,
          animation: 'fadeInOut 4s ease-in-out',
          '@keyframes fadeInOut': {
            '0%': { opacity: 0 },
            '10%': { opacity: 0.8 },
            '80%': { opacity: 0.8 },
            '100%': { opacity: 0 },
          },
          pointerEvents: 'none',
        }}
      >
        Tap or click anywhere to exit screensaver
      </Box>
    </Box>
  );
};

export default VacationScreensaver;
