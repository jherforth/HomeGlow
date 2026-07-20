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

  // The iframe's document comes from API_BASE_URL, which is NOT this page's
  // origin in dev mode / split-origin deployments — postMessage must target
  // the iframe's actual origin or the browser silently drops the message.
  const iframeOrigin = API_BASE_URL
    ? new URL(API_BASE_URL, window.location.href).origin
    : window.location.origin;

  // Forward core events this plugin declared in its manifest into the iframe
  // (issue #105 Phase 3). Legacy widgets declare nothing and skip the stream.
  // Keyed on the joined event names (not array identity) so plugin-list
  // refetches don't churn the shared SSE subscription.
  const eventsKey = Array.isArray(events) ? events.join(',') : '';
  useEffect(() => {
    if (!eventsKey) return undefined;
    const declared = new Set(eventsKey.split(','));
    return subscribePluginEvents((message) => {
      if (!declared.has(message.event)) return;
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      target.postMessage(
        { type: 'homeglow:event', event: message.event, payload: message.payload, emittedAt: message.emittedAt },
        iframeOrigin
      );
    });
  }, [eventsKey, iframeOrigin]);

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
