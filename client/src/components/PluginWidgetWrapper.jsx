import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getDeviceName } from '../utils/deviceName.js';
import { subscribePluginEvents } from '../utils/pluginEventBridge.js';

const PluginWidgetWrapper = ({ filename, name, theme, transparentBackground = false, refreshNonce = 0, events = [] }) => {
  // Manifest plugins need the display's device name so device-scoped settings
  // resolve via the plugin SDK (issue #105 Phase 2).
  const deviceName = getDeviceName();
  const iframeRef = useRef(null);

  // Forward core events this plugin declared in its manifest into the iframe
  // (issue #105 Phase 3). Legacy widgets declare nothing and skip the stream.
  useEffect(() => {
    if (!Array.isArray(events) || events.length === 0) return undefined;
    const declared = new Set(events);
    return subscribePluginEvents((message) => {
      if (!declared.has(message.event)) return;
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      target.postMessage(
        { type: 'homeglow:event', event: message.event, payload: message.payload, emittedAt: message.emittedAt },
        window.location.origin
      );
    });
  }, [events]);

  return (
    <Box sx={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* Keying the iframe on refreshNonce reloads the plugin on refresh
          without tearing down the wrapper (plugins have no other refresh
          channel). */}
      <iframe
        ref={iframeRef}
        key={refreshNonce}
        src={`${API_BASE_URL}/widgets/${filename}?theme=${theme}&device=${encodeURIComponent(deviceName)}`}
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
