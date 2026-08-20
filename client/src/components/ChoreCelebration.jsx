import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

// Full-screen celebration for finishing every regular chore for the day
// (issue #140).
//
// Deliberately a different effect from PrizeCelebration's curtain of falling
// rectangles, so the two read as distinct events at a glance: this one is a
// radial burst — pieces fire outward from the middle of the screen, decelerate,
// then fall away under gravity, the way a firework does. Mixed shapes (squares,
// circles, and thin streamers) rather than one uniform chip.
//
// Pure CSS, no canvas and no dependencies, matching the existing celebration.
// Rendered through a portal to document.body because the chore widget sits
// inside a react-grid-layout item whose CSS transform creates a stacking
// context, which would otherwise trap the overlay beneath MUI dialogs and
// break position: fixed.

const BURST_COLORS = ['#f94144', '#f3722c', '#f9c74f', '#90be6d', '#43aa8b', '#4d908e', '#577590', '#b5179e'];
const PIECE_COUNT = 90;
const AUTO_DISMISS_MS = 5000;

// Three shapes keep the burst from looking like one repeated sprite.
const SHAPES = ['square', 'circle', 'streamer'];

const shapeStyles = (shape, size, color) => {
  if (shape === 'circle') {
    return { width: size, height: size, borderRadius: '50%', backgroundColor: color };
  }
  if (shape === 'streamer') {
    return { width: Math.max(2, size * 0.25), height: size * 1.8, borderRadius: '2px', backgroundColor: color };
  }
  return { width: size, height: size, borderRadius: '2px', backgroundColor: color };
};

// Roughly what the message card measures; used only to keep it on screen when
// it is anchored near an edge. Exact width does not matter, since the card is
// centred on this estimate and then clamped.
const CARD_WIDTH_ESTIMATE = 340;
const VIEWPORT_MARGIN = 12;

// Place the card over the column that just went green, rather than in the
// middle of the screen where it reads as unrelated to what changed. The card is
// wider than a 180-250px column, so it centres on the column and is clamped to
// the viewport; near an edge it shifts in rather than hanging off.
const anchoredCardSx = (anchorRect) => {
  if (!anchorRect) return {};

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : CARD_WIDTH_ESTIMATE;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;

  const desiredLeft = anchorRect.left + anchorRect.width / 2 - CARD_WIDTH_ESTIMATE / 2;
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - CARD_WIDTH_ESTIMATE - VIEWPORT_MARGIN);
  const left = Math.min(Math.max(VIEWPORT_MARGIN, desiredLeft), maxLeft);

  // Sit over the upper third of the column, near the avatar and the "All Done"
  // chip, so the card and the thing it is celebrating are in the same glance.
  const desiredTop = anchorRect.top + Math.min(anchorRect.height * 0.28, 140);
  const top = Math.min(Math.max(VIEWPORT_MARGIN, desiredTop), Math.max(VIEWPORT_MARGIN, viewportHeight - 200));

  return {
    position: 'fixed',
    top,
    left,
    width: CARD_WIDTH_ESTIMATE,
    maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
  };
};

// Where the burst radiates from: the centre of the celebrating user's column
// when we know it, the centre of the screen otherwise.
const burstOriginSx = (anchorRect) => {
  if (!anchorRect) {
    return { position: 'absolute', left: '50%', top: '50%' };
  }
  return {
    position: 'fixed',
    left: anchorRect.left + anchorRect.width / 2,
    top: anchorRect.top + Math.min(anchorRect.height / 2, 220),
  };
};

const ChoreCelebration = ({ username, reward, anchorRect = null, onDismiss }) => {
  const { t } = useTranslation(['chores']);
  const originSx = burstOriginSx(anchorRect);

  const pieces = useMemo(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => {
        // Spread evenly around the circle with a little jitter, so the burst
        // looks scattered rather than like spokes on a wheel.
        const angle = (i / PIECE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const velocity = 140 + Math.random() * 260;
        return {
          id: i,
          // Where the piece flies to at the apex of the burst.
          burstX: Math.cos(angle) * velocity,
          burstY: Math.sin(angle) * velocity,
          // Where it ends up after gravity takes over: same horizontal drift,
          // well below the viewport.
          fallY: Math.sin(angle) * velocity + 420 + Math.random() * 320,
          driftX: Math.cos(angle) * velocity + (Math.random() - 0.5) * 90,
          size: 6 + Math.random() * 9,
          color: BURST_COLORS[i % BURST_COLORS.length],
          shape: SHAPES[i % SHAPES.length],
          spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
          delay: Math.random() * 0.25,
          duration: 1.9 + Math.random() * 1.3,
        };
      }),
    []
  );

  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return createPortal(
    <Box
      onClick={onDismiss}
      onTouchStart={onDismiss}
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        cursor: 'pointer',
        // Out fast, then arc down: the 45% keyframe is the apex, which is what
        // gives the burst its firework shape rather than a straight scatter.
        '@keyframes chore-burst': {
          '0%': {
            transform: 'translate(0, 0) rotate(0deg) scale(0.4)',
            opacity: 1,
          },
          '45%': {
            transform: 'translate(var(--burst-x), var(--burst-y)) rotate(calc(var(--spin) * 0.5)) scale(1)',
            opacity: 1,
          },
          '100%': {
            transform: 'translate(var(--drift-x), var(--fall-y)) rotate(var(--spin)) scale(0.9)',
            opacity: 0,
          },
        },
        '@keyframes chore-badge-pop': {
          '0%': { transform: 'scale(0.5) rotate(-6deg)', opacity: 0 },
          '55%': { transform: 'scale(1.08) rotate(2deg)', opacity: 1 },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: 1 },
        },
        // A single expanding ring at the origin sells the "burst" moment.
        '@keyframes chore-shockwave': {
          '0%': { transform: 'scale(0.2)', opacity: 0.55 },
          '100%': { transform: 'scale(2.4)', opacity: 0 },
        },
        // Respect a reduced-motion preference: keep the message, drop the
        // flying debris rather than showing a static clump of coloured squares.
        '@media (prefers-reduced-motion: reduce)': {
          '& .chore-burst-piece': { display: 'none' },
          '& .chore-shockwave': { display: 'none' },
        },
      }}
    >
      {/* Zero-size origin the burst radiates from. Anchoring it to the column
          means the confetti visibly comes out of the panel that just went
          green, rather than from the middle of the screen while the card sits
          somewhere else. */}
      <Box className="chore-burst-origin" sx={{ ...originSx, width: 0, height: 0, pointerEvents: 'none' }}>
        <Box
          className="chore-shockwave"
          sx={{
            position: 'absolute',
            width: 220,
            height: 220,
            marginLeft: '-110px',
            marginTop: '-110px',
            borderRadius: '50%',
            border: '3px solid var(--accent)',
            animation: 'chore-shockwave 0.9s ease-out both',
            pointerEvents: 'none',
          }}
        />

        {pieces.map((piece) => (
          <Box
            key={piece.id}
            className="chore-burst-piece"
            sx={{
              position: 'absolute',
              left: 0,
              top: 0,
              ...shapeStyles(piece.shape, piece.size, piece.color),
              '--burst-x': `${piece.burstX}px`,
              '--burst-y': `${piece.burstY}px`,
              '--drift-x': `${piece.driftX}px`,
              '--fall-y': `${piece.fallY}px`,
              '--spin': `${piece.spin}deg`,
              animation: `chore-burst ${piece.duration}s cubic-bezier(0.15, 0.75, 0.35, 1) ${piece.delay}s both`,
              pointerEvents: 'none',
            }}
          />
        ))}
      </Box>

      <Box
        sx={{
          position: 'relative',
          backgroundColor: 'var(--card-bg)',
          color: 'var(--text-color)',
          border: '1px solid var(--card-border)',
          borderRadius: 3,
          boxShadow: 'var(--shadow)',
          px: 4,
          py: 3,
          textAlign: 'center',
          maxWidth: '80vw',
          animation: 'chore-badge-pop 0.55s ease-out both',
          // Overrides the flex centring above when we know where the
          // celebrating user's column is.
          ...anchoredCardSx(anchorRect),
        }}
      >
        <Typography sx={{ fontSize: '3.25rem', lineHeight: 1, mb: 1 }}>🏆</Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
          {t('chores:celebration.allChoresDone', { name: username })}
        </Typography>
        {reward > 0 && (
          <Typography variant="h6" sx={{ color: 'var(--accent)', fontWeight: 600 }}>
            {t('chores:celebration.bonusEarned', { count: reward })}
          </Typography>
        )}
      </Box>
    </Box>,
    document.body
  );
};

export default ChoreCelebration;
