import React from 'react';
import { Button } from '@mui/material';
import { Save } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

// The way out of Move/Resize (issue #333). Leaving it used to mean going back
// into the dock for "Lock Layout", which people new to HomeGlow didn't find.
// While the layout is unlocked this sits in the bottom-right corner, pulsing
// gently so it's noticed, and locks the layout when tapped. The layout itself
// is saved as widgets move (WidgetContainer), and once more on locking.
export default function SaveLayoutButton({ onSave }) {
  const { t } = useTranslation('common');
  return (
    <Button
      variant="contained"
      size="large"
      startIcon={<Save />}
      onClick={onSave}
      sx={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        // Above the widgets and the dock (9999). It isn't shown while the
        // Admin Panel or the screensaver is up (app.jsx).
        zIndex: 10000,
        borderRadius: 'var(--hg-radius-xl, 999px)',
        px: 3,
        backgroundColor: 'var(--accent)',
        color: '#fff',
        fontWeight: 700,
        boxShadow: 'var(--shadow)',
        '&:hover': { backgroundColor: 'var(--accent)', filter: 'brightness(1.08)' },
        '@keyframes saveLayoutPulse': {
          '0%': { boxShadow: '0 0 0 0 rgba(var(--accent-rgb), 0.55)', transform: 'scale(1)' },
          '50%': { transform: 'scale(1.04)' },
          '70%': { boxShadow: '0 0 0 14px rgba(var(--accent-rgb), 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(var(--accent-rgb), 0)', transform: 'scale(1)' },
        },
        animation: 'saveLayoutPulse 1.8s ease-out infinite',
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    >
      {t('layout.save')}
    </Button>
  );
}
