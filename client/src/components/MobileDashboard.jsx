import React from 'react';
import { Box } from '@mui/material';
import { needsFixedMobileHeight } from '../utils/mobileWidgets.js';

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
        gap: 1.5,
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
            borderRadius: 2,
            overflow: 'hidden',
            border: '1px solid var(--card-border)',
            backgroundColor: 'var(--card-bg)',
            boxShadow: 'var(--shadow)',
            ...(needsFixedMobileHeight(widget) ? { height: '60vh', minHeight: 360 } : {}),
          }}
        >
          {widget.content}
        </Box>
      ))}
    </Box>
  );
};

export default MobileDashboard;
