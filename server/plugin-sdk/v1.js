/**
 * HomeGlow Plugin SDK v1 (issue #105).
 *
 * Load from a plugin widget with:
 *   <script src="/plugin-sdk/v1.js"></script>
 *
 * Requires an embedded manifest (the server injects window.__HOMEGLOW_PLUGIN__
 * when serving manifest plugins). Plain HTML widgets can load this file too —
 * HomeGlow.pluginId is just null and storage calls reject.
 */
(function () {
  'use strict';

  var API_BASE = '/api/plugin/v1';
  // The dashboard passes the display's device name on the iframe URL so
  // device-scoped settings resolve correctly.
  var deviceName = new URLSearchParams(window.location.search).get('device');

  // Resolved lazily so the SDK works no matter where its <script> tag sits
  // relative to the server-injected identity script.
  function getPlugin() {
    return window.__HOMEGLOW_PLUGIN__ || null;
  }

  function requirePluginId() {
    var plugin = getPlugin();
    if (!plugin || !plugin.id) {
      throw new Error('HomeGlow SDK: this widget has no plugin manifest, so it has no platform namespace.');
    }
    return plugin.id;
  }

  function withDevice(path) {
    return deviceName ? path + '?device=' + encodeURIComponent(deviceName) : path;
  }

  // Core events (issue #105 Phase 3) arrive as postMessages from the dashboard
  // that embeds this widget. The dashboard and API may be different origins
  // (dev mode, split deployments), so the trust check is "sent by my embedding
  // parent", not an origin string comparison. Only events declared in the
  // plugin manifest are forwarded, so HomeGlow.on() never sees undeclared
  // events.
  var eventHandlers = {};
  window.addEventListener('message', function (messageEvent) {
    if (messageEvent.source !== window.parent) return;
    var data = messageEvent.data;
    if (!data || data.type !== 'homeglow:event' || typeof data.event !== 'string') return;
    var handlers = eventHandlers[data.event];
    if (!handlers) return;
    handlers.slice().forEach(function (handler) {
      try {
        handler(data.payload, { event: data.event, emittedAt: data.emittedAt });
      } catch (error) {
        console.error('HomeGlow SDK: event handler failed for ' + data.event, error);
      }
    });
  });

  function request(method, path, body) {
    var options = { method: method, headers: {} };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    return fetch(API_BASE + path, options).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (e) {
          data = text;
        }
        if (!response.ok) {
          var error = new Error((data && data.error) || ('HomeGlow SDK: HTTP ' + response.status));
          error.status = response.status;
          throw error;
        }
        return data;
      });
    });
  }

  window.HomeGlow = {
    apiVersion: 'v1',
    get pluginId() {
      var plugin = getPlugin();
      return plugin ? plugin.id : null;
    },

    /**
     * Subscribe to a core event declared in the plugin manifest, e.g.
     * HomeGlow.on('clam.withdrawn', (payload) => { ... }).
     * Returns an unsubscribe function.
     */
    on: function (event, handler) {
      (eventHandlers[event] = eventHandlers[event] || []).push(handler);
      var self = this;
      return function () { self.off(event, handler); };
    },

    /** Remove a handler added with on(). */
    off: function (event, handler) {
      var handlers = eventHandlers[event];
      if (!handlers) return;
      var index = handlers.indexOf(handler);
      if (index !== -1) handlers.splice(index, 1);
      if (handlers.length === 0) delete eventHandlers[event];
    },

    storage: {
      /** All keys and values for this plugin: -> Promise<object> */
      list: function () {
        return request('GET', '/storage/' + requirePluginId());
      },
      /** One value, or null if the key does not exist. */
      get: function (key) {
        return request('GET', '/storage/' + requirePluginId() + '/' + encodeURIComponent(key))
          .catch(function (error) {
            if (error.status === 404) return null;
            throw error;
          });
      },
      /** Upsert a JSON value under a key. */
      set: function (key, value) {
        return request('PUT', '/storage/' + requirePluginId() + '/' + encodeURIComponent(key), value);
      },
      /** Delete a key. Resolves false if the key did not exist. */
      remove: function (key) {
        return request('DELETE', '/storage/' + requirePluginId() + '/' + encodeURIComponent(key))
          .then(function () { return true; })
          .catch(function (error) {
            if (error.status === 404) return false;
            throw error;
          });
      },
      /**
       * Atomically add `delta` to the number at dot-separated `path` inside the
       * document stored under `key` (created as {} if missing).
       * -> Promise<{ result, value }> with the new leaf number and full document.
       */
      increment: function (key, path, delta) {
        return request('POST', '/storage/' + requirePluginId() + '/' + encodeURIComponent(key) + '/increment', {
          path: path,
          delta: delta
        });
      }
    },

    settings: {
      /**
       * Effective values for every setting declared in the manifest
       * (manifest default <- stored household value <- stored device value
       * for device-scoped settings). -> Promise<object>
       */
      get: function () {
        return request('GET', withDevice('/settings/' + requirePluginId()));
      },
      /**
       * Write one or more declared settings, e.g. { siphonAmount: 3 }.
       * Values are validated against the manifest schema server-side and
       * routed to their declared scope automatically.
       */
      set: function (values) {
        return request('PUT', withDevice('/settings/' + requirePluginId()), values);
      }
    }
  };
})();
