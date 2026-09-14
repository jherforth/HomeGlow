import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getDeviceName } from '../utils/deviceName.js';
import { subscribePluginEvents } from '../utils/pluginEventBridge.js';
import { acceptPluginDataMessage, emitPluginDataChanged } from '../utils/pluginDataBridge.js';

const PluginWidgetWrapper = ({
  filename,
  name,
  theme,
  transparentBackground = false,
  refreshNonce = 0,
  events = [],
  // Control Limits: this plugin's own hidden control ids, already unprefixed by
  // the dashboard. HomeGlow cannot reach into the iframe, so the plugin is told
  // and does its own hiding — see docs/guides/plugin-development.md.
  hiddenControls = [],
}) => {
  const { i18n } = useTranslation();
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

  // The reverse direction: a plugin that wrote core data through the REST API
  // tells the host, so widgets showing that data can refetch instead of
  // waiting out their own refresh timer.
  //
  // Trust is anchored on the frame, not the payload: the message must come
  // from THIS wrapper's iframe and from the origin its document was loaded
  // from. Any other frame on the page — or an unknown scope — is ignored.
  useEffect(() => {
    const onMessage = (event) => {
      const scope = acceptPluginDataMessage(event, iframeRef.current?.contentWindow, iframeOrigin);
      if (!scope) return;
      emitPluginDataChanged(scope, { filename });
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [iframeOrigin, filename]);

  // Omitted entirely when nothing is hidden: a plugin (and an older dashboard)
  // must read "no hide param" as "hide nothing". Flattened to a string so an
  // unchanged hidden set produces a byte-identical src — changing src navigates
  // the frame, which is what makes a newly hidden control take effect, and is
  // waste when a settings refetch merely handed us an equal array.
  const hideParam = (Array.isArray(hiddenControls) ? hiddenControls : [])
    .map((id) => encodeURIComponent(id))
    .join(',');

  return (
    <Box sx={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* Keying the iframe on refreshNonce reloads the plugin on refresh
          without tearing down the wrapper (plugins have no other refresh
          channel). */}
      <iframe
        ref={iframeRef}
        key={refreshNonce}
        // lang rides the same channel as theme (issue #137) so a plugin that
        // ships translations can follow the display's language; plugins that
        // ignore it are unaffected.
        src={`${API_BASE_URL}/widgets/${filename}?theme=${theme}&device=${encodeURIComponent(deviceName)}&lang=${i18n.language || 'en'}${hideParam ? `&hide=${hideParam}` : ''}`}
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
