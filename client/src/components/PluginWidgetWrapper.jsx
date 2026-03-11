import React from 'react';
import { Box } from '@mui/material';
import { API_BASE_URL } from '../utils/apiConfig.js';

const PluginWidgetWrapper = ({ filename, name, theme, transparentBackground = false }) => {
  return (
    <Box sx={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <iframe
        src={`${API_BASE_URL}/widgets/${filename}?theme=${theme}`}
        title={name}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
          background: transparentBackground ? 'transparent' : 'var(--card-bg)',
          overflow: 'hidden',
        }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </Box>
  );
};

export default PluginWidgetWrapper;
