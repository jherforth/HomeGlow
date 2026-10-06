import React from 'react';
import { Box } from '@mui/material';
import { needsFixedMobileHeight } from '../utils/mobileWidgets.js';
import { frameDecoration } from '../utils/widgetFrame.js';

// Phone layout shell (issue #118): the active tab's widgets as one vertical,
// scrollable column of full-width cards. Replaces WidgetContainer below 600px —
// react-grid-layout, drag/resize, and the lock system never mount here, which
// satisfies "no 12 grid squares" structurally. Ordering/filtering is done by
// buildMobileWidgetList in app.jsx; this component only lays cards out.
//
// Heights: chores/weather size to their content; calendar and plugins size to
// their container, so those cards get a viewport-relative height ("plug-ins
// set to screen width" — full width, defined height).
const MobileDashboard = ({ widgets }) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(var(--hg-grid-gap) * 0.75)',
        px: 1.5,
        pt: 1.5,
        // Clear the floating dock.
        pb: '96px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {widgets.map((widget) => (
        <Box
          key={widget.id}
          data-widget-id={widget.id}
          sx={{
            width: '100%',
            position: 'relative',
            borderRadius: 'var(--hg-frame-radius)',
            overflow: 'hidden',
            border: '1px solid var(--card-border)',
            background: widget.transparent ? 'transparent' : 'var(--hg-frame-bg)',
            boxShadow: widget.transparent ? 'none' : 'var(--shadow)',
            ...(needsFixedMobileHeight(widget) ? { height: '60vh', minHeight: 360 } : {}),
            '&::after': frameDecoration,
          }}
        >
          {widget.content}
        </Box>
      ))}
    </Box>
  );
};

export default MobileDashboard;
