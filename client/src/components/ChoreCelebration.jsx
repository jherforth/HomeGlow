import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box } from '@mui/material';

// Confetti for finishing every regular chore for the day (issue #140).
//
// Deliberately wordless. An earlier version put a card naming the person in the
// middle of the screen, which meant a modal-feeling overlay that dimmed the
// whole dashboard for five seconds and sat nowhere near the panel that had just
// turned green. The green panel and the updated clam total already say who and
// what; this only has to say "something good happened".
//
// The motion follows VacationScreensaver: pieces launch from behind the bottom
// dock with a random upward velocity, gravity arcs them back down, and each one
// is removed once it falls out of view. Positions are written straight to the
// nodes inside a rAF loop, so 60fps motion causes no React re-renders.
//
// Nothing here is interactive and there is no backdrop — pointerEvents: none
// throughout — so the dashboard stays usable while it plays.
//
// Rendered through a portal to document.body because the chore widget sits in a
// react-grid-layout item whose transform would otherwise trap position: fixed.

const CONFETTI_COLORS = ['#f94144', '#f3722c', '#f9c74f', '#90be6d', '#43aa8b', '#4d908e', '#577590', '#b5179e'];

const PIECE_COUNT = 70;
const GRAVITY_PX_S2 = 1400;
// Pieces launch over a short window rather than all at once, so it reads as a
// burst rather than a single wall of confetti.
const LAUNCH_WINDOW_MS = 550;
// Hard stop, in case a piece somehow never leaves the viewport.
const MAX_LIFETIME_MS = 7000;

const randomBetween = (min, max) => min + Math.random() * (max - min);

const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const shapeSx = (shape, size, color) => {
  if (shape === 'circle') {
    return { width: size, height: size, borderRadius: '50%', backgroundColor: color };
  }
  if (shape === 'streamer') {
    return { width: Math.max(2, size * 0.3), height: size * 2, borderRadius: '2px', backgroundColor: color };
  }
  return { width: size, height: size * 0.6, borderRadius: '1px', backgroundColor: color };
};

const SHAPES = ['square', 'circle', 'streamer'];

const ChoreCelebration = ({ onDismiss }) => {
  const [pieces, setPieces] = useState([]);
  const pieceStateRef = useRef(new Map());
  const nodesRef = useRef(new Map());
  const doneRef = useRef(false);

  // Launch + physics. One effect owns the whole lifecycle so there is no window
  // where a piece exists in state but has no simulation entry.
  useEffect(() => {
    // With reduced motion there is nothing to show — the whole component is
    // motion — so bow out immediately rather than freezing debris on screen.
    if (prefersReducedMotion()) {
      onDismiss();
      return undefined;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;

    const spawned = [];
    for (let i = 0; i < PIECE_COUNT; i++) {
      const id = i;
      // Launch from behind the bottom dock, spread across the middle of the
      // screen the way the vacation emoji do.
      const x = width / 2 + randomBetween(-width * 0.32, width * 0.32);
      const vy = -Math.sqrt(2 * GRAVITY_PX_S2 * randomBetween(height * 0.45, height * 0.95));
      const vx = randomBetween(-width * 0.22, width * 0.22);

      pieceStateRef.current.set(id, {
        x,
        y: height + 30,
        vx,
        vy,
        rotation: randomBetween(0, 360),
        spin: randomBetween(-260, 260),
        // Staggered launch: until its delay elapses the piece just waits
        // off-screen below the fold.
        delay: randomBetween(0, LAUNCH_WINDOW_MS),
        elapsed: 0,
      });

      spawned.push({
        id,
        shape: SHAPES[i % SHAPES.length],
        size: 7 + Math.random() * 9,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      });
    }
    setPieces(spawned);

    let rafId = null;
    let lastTime = performance.now();
    const startedAt = lastTime;

    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDismiss();
    };

    const step = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const viewportHeight = window.innerHeight;
      const finished = [];

      pieceStateRef.current.forEach((p, id) => {
        p.elapsed += dt * 1000;
        if (p.elapsed < p.delay) return;

        p.vy += GRAVITY_PX_S2 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.spin * dt;

        // Gone once it has fallen back below the fold on the way down.
        if (p.y > viewportHeight + 60 && p.vy > 0) {
          finished.push(id);
          return;
        }

        const node = nodesRef.current.get(id);
        if (node) {
          node.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rotation}deg)`;
        }
      });

      for (const id of finished) {
        pieceStateRef.current.delete(id);
        nodesRef.current.delete(id);
        const node = document.getElementById(`chore-confetti-${id}`);
        if (node) node.style.display = 'none';
      }

      if (pieceStateRef.current.size === 0 || now - startedAt > MAX_LIFETIME_MS) {
        finish();
        return;
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      pieceStateRef.current.clear();
      nodesRef.current.clear();
    };
    // Mount-only: the burst is fired once and runs to completion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (pieces.length === 0) return null;

  return createPortal(
    <Box
      aria-hidden="true"
      className="chore-confetti-layer"
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        overflow: 'hidden',
        // Purely decorative: never intercept a tap meant for the dashboard.
        pointerEvents: 'none',
      }}
    >
      {pieces.map((piece) => (
        <Box
          key={piece.id}
          id={`chore-confetti-${piece.id}`}
          className="chore-confetti-piece"
          ref={(node) => {
            if (node) nodesRef.current.set(piece.id, node);
          }}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            ...shapeSx(piece.shape, piece.size, piece.color),
            pointerEvents: 'none',
            willChange: 'transform',
            // First paint is off-screen; the rAF loop takes over immediately.
            transform: 'translate(-100px, 200vh)',
          }}
        />
      ))}
    </Box>,
    document.body
  );
};

export default ChoreCelebration;
