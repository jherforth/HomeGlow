import React, { Suspense } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { Close } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

// Room kept clear for the dock at the bottom, and around the sheets.
const DOCK_CLEAR = 92;
const EDGE = 12;
const GAP = 12;
const HEADER = 52;

const LEVEL_COLOR = {
  urgent: 'var(--hg-error, #d32f2f)',
  high: '#E0A030',
  normal: 'var(--accent)',
};

const regionFor = (slot) => {
  const half = `calc((100vh - ${EDGE + DOCK_CLEAR + GAP}px) / 2)`;
  if (slot === 'full') return { top: EDGE, bottom: DOCK_CLEAR };
  if (slot === 'top') return { top: EDGE, height: half };
  return { bottom: DOCK_CLEAR, height: half };
};

// The grid hands widgets their size this way (WidgetContainer); a takeover
// tells them they're shown big, so the calendar shows its month and plugins
// hear 'half' or 'full'.
const withSize = (element, props) => {
  if (React.isValidElement(element) && element.type === Suspense) {
    return React.cloneElement(element, {}, React.cloneElement(element.props.children, props));
  }
  return React.isValidElement(element) ? React.cloneElement(element, props) : element;
};

/**
 * The takeovers on the wall (hooks/useTakeovers.js): each a sheet over part of
 * the page, sliding in from its side, with the widget's name, how urgent it
 * is, and a ✕. The page behind stays usable; the dock stays in view.
 *
 * - slots: { full, top, bottom }, each { key, widget, level } or null
 * - contentFor(widget): the widget's content node, as the grid would draw it
 * - nameFor(widget): its name
 * - onDismiss(key)
 */
const TakeoverLayer = ({ slots, contentFor, nameFor, onDismiss }) => {
  const { t } = useTranslation('common');
  const shown = ['full', 'top', 'bottom'].map((slot) => ({ slot, item: slots[slot] })).filter((entry) => entry.item);
  if (shown.length === 0) return null;

  return (
    <>
      <Box
        aria-hidden="true"
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 1240,
          pointerEvents: 'none',
          backgroundColor: 'var(--hg-black-10)',
          animation: 'hg-takeover-dim 240ms ease-out',
          '@keyframes hg-takeover-dim': { from: { opacity: 0 }, to: { opacity: 1 } },
        }}
      />
      {shown.map(({ slot, item }) => {
        const name = nameFor(item.widget);
        const content = contentFor(item.widget);
        const fromTop = slot === 'top';
        return (
          <Box
            key={`${item.key}:${slot}`}
            role="dialog"
            aria-modal="false"
            aria-label={name}
            sx={{
              position: 'fixed',
              left: EDGE,
              right: EDGE,
              ...regionFor(slot),
              zIndex: 1250,
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '20px',
              overflow: 'hidden',
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              boxShadow: '0 24px 64px var(--hg-black-30), 0 6px 18px var(--hg-black-20)',
              animation: `hg-takeover-in 320ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
              '@keyframes hg-takeover-in': {
                from: { transform: `translateY(${fromTop ? -48 : 48}px)`, opacity: 0 },
                to: { transform: 'translateY(0)', opacity: 1 },
              },
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              ...(item.level === 'urgent' && {
                outline: `3px solid ${LEVEL_COLOR.urgent}`,
                outlineOffset: '-3px',
              }),
            }}
          >
            <Box
              sx={{
                height: HEADER,
                flex: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                pl: 2.25,
                pr: 1,
                borderBottom: '1px solid var(--card-border)',
                color: 'var(--text)',
              }}
            >
              <Box
                aria-hidden="true"
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  flex: 'none',
                  backgroundColor: LEVEL_COLOR[item.level] || LEVEL_COLOR.normal,
                  ...(item.level === 'urgent' && {
                    animation: 'hg-takeover-pulse 1.2s ease-in-out infinite',
                    '@keyframes hg-takeover-pulse': {
                      '0%, 100%': { boxShadow: '0 0 0 0 rgba(211, 47, 47, 0.5)' },
                      '50%': { boxShadow: '0 0 0 6px rgba(211, 47, 47, 0)' },
                    },
                  }),
                }}
              />
              <Typography noWrap sx={{ fontWeight: 700, fontSize: '1.05rem', flex: 1, minWidth: 0 }}>{name}</Typography>
              {item.level !== 'normal' && (
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: LEVEL_COLOR[item.level],
                  }}
                >
                  {t(`takeovers.level.${item.level}`)}
                </Typography>
              )}
              <IconButton
                onClick={() => onDismiss(item.key)}
                aria-label={t('takeovers.close', { name })}
                sx={{ width: 44, height: 44, color: 'var(--text-secondary)' }}
              >
                <Close />
              </IconButton>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, position: 'relative', '& > *': { height: '100%' } }}>
              {content ? withSize(content, { expandSize: slot === 'full' ? 'full' : 'half', isActive: true }) : null}
            </Box>
          </Box>
        );
      })}
    </>
  );
};

export default TakeoverLayer;
