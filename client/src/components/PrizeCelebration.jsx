import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

// Full-screen confetti celebration for a prize redemption (prize store).
// Pure CSS — ~60 confetti pieces with randomized fall/spin animations — no
// canvas, no dependencies. Auto-dismisses; tap dismisses early.
//
// Rendered through a portal to document.body: the chore widget lives inside a
// react-grid-layout item whose CSS transform creates a stacking context, which
// would trap the overlay's z-index below MUI dialogs and break position:fixed.
const CONFETTI_COLORS = ['#f94144', '#f8961e', '#f9c74f', '#90be6d', '#43aa8b', '#577590', '#b5179e'];
const PIECE_COUNT = 60;
const AUTO_DISMISS_MS = 4500;

const PrizeCelebration = ({ username, prizeName, onDismiss }) => {
  const { t } = useTranslation(['chores']);
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2.2 + Math.random() * 1.8,
        size: 6 + Math.random() * 8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        spin: Math.random() > 0.5 ? 360 : -360,
        sway: (Math.random() - 0.5) * 120,
      })),
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
        '@keyframes confetti-fall': {
          '0%': { transform: 'translateY(-10vh) translateX(0) rotate(0deg)', opacity: 1 },
          '100%': { transform: 'translateY(110vh) translateX(var(--sway)) rotate(var(--spin))', opacity: 0.7 },
        },
        '@keyframes celebration-pop': {
          '0%': { transform: 'scale(0.6)', opacity: 0 },
          '60%': { transform: 'scale(1.06)', opacity: 1 },
          '100%': { transform: 'scale(1)', opacity: 1 },
        },
      }}
    >
      {pieces.map((piece) => (
        <Box
          key={piece.id}
          sx={{
            position: 'absolute',
            top: 0,
            left: `${piece.left}%`,
            width: `${piece.size}px`,
            height: `${piece.size * 0.45}px`,
            backgroundColor: piece.color,
            borderRadius: '1px',
            '--sway': `${piece.sway}px`,
            '--spin': `${piece.spin}deg`,
            animation: `confetti-fall ${piece.duration}s linear ${piece.delay}s both`,
            pointerEvents: 'none',
          }}
        />
      ))}

      <Box
        sx={{
          backgroundColor: 'var(--card-bg)',
          color: 'var(--text-color)',
          border: '1px solid var(--card-border)',
          borderRadius: 3,
          boxShadow: 'var(--shadow)',
          px: 4,
          py: 3,
          textAlign: 'center',
          maxWidth: '80vw',
          animation: 'celebration-pop 0.5s ease-out both',
        }}
      >
        <Typography sx={{ fontSize: '3rem', lineHeight: 1, mb: 1 }}>🎉</Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
          {t('chores:celebration.redeemedAPrize', { name: username })}
        </Typography>
        <Typography variant="h6" sx={{ color: 'var(--accent)', fontWeight: 600 }}>
          {prizeName}
        </Typography>
      </Box>
    </Box>,
    document.body
  );
};

export default PrizeCelebration;
