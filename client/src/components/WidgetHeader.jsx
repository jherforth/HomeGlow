import React from 'react';
import { Box, Typography } from '@mui/material';

// The header every core widget shares: an icon in the accent, the title, then
// the widget's actions at the right end as quiet icon buttons, with at most
// one labeled main action. Plugins draw the same thing inside their frames
// with the .hg-widget-header classes in index.css.
//
// `title` is text, or a node when the title is itself a control (the
// calendar's period label, which also goes to today). `afterTitle` sits right
// after it, for controls that belong to the title (the calendar's arrows).
export default function WidgetHeader({ icon, title, afterTitle, children, sx }) {
  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        columnGap: 1,
        rowGap: 0.5,
        minHeight: 40,
        mb: 1.5,
        ...sx,
      }}
    >
      {icon && (
        <Box aria-hidden sx={{ display: 'flex', color: 'var(--accent)', '& svg': { fontSize: 22 } }}>
          {icon}
        </Box>
      )}
      {typeof title === 'string'
        ? <Typography variant="h6" component="h2" sx={widgetHeaderTitleSx}>{title}</Typography>
        : title}
      {afterTitle}
      <Box sx={{ flex: 1 }} />
      {children && (
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
          {children}
        </Box>
      )}
    </Box>
  );
}

// The title's type, for a widget whose title is a control rather than text.
export const widgetHeaderTitleSx = {
  fontSize: '1.125rem',
  fontWeight: 600,
  lineHeight: 1.3,
  whiteSpace: 'nowrap',
};

// An icon action in the header: quiet until hovered, and in the accent while
// pressed (a toggle's aria-pressed).
export const headerIconButtonSx = {
  color: 'var(--text-secondary)',
  borderRadius: 'var(--hg-radius-md)',
  '&:hover': { color: 'var(--text)', backgroundColor: 'rgba(var(--accent-rgb), 0.08)' },
  '&[aria-pressed="true"]': { color: 'var(--accent)', backgroundColor: 'rgba(var(--accent-rgb), 0.14)' },
};

// The one labeled main action a header may have (Add chore): tinted rather
// than solid, so it doesn't outshout the widget's content.
export const headerMainButtonSx = {
  // The accent mixed toward the text color, so a light accent still reads.
  color: 'color-mix(in srgb, var(--accent) 70%, var(--text))',
  backgroundColor: 'rgba(var(--accent-rgb), 0.14)',
  fontWeight: 600,
  boxShadow: 'none',
  '&:hover': { backgroundColor: 'rgba(var(--accent-rgb), 0.22)', boxShadow: 'none' },
};
