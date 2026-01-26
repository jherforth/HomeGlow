import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, Typography, Switch, FormControlLabel, Box } from '@mui/material';
import CountdownCircle from './CountdownCircle';
import { API_BASE_URL } from '../utils/apiConfig.js';

const ENABLED_WIDGETS_KEY = 'enabledWidgets';

const WidgetGallery = ({ theme, transparentBackground = false }) => {
  const [plugins, setPlugins] = useState([]);
  const [enabled, setEnabled] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch plugins from server
  useEffect(() => {
    const fetchPlugins = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API_BASE_URL}/api/widgets`);
        setPlugins(Array.isArray(response.data) ? response.data : []);
      } catch {
        setPlugins([]);
      } finally {
        setLoading(false);
      }
    };
    fetchPlugins();
  }, []);

  // Load enabled state from localStorage
  useEffect(() => {
    const savedEnabled = localStorage.getItem(ENABLED_WIDGETS_KEY);
    setEnabled(savedEnabled ? JSON.parse(savedEnabled) : {});
  }, []);

  // Save enabled state to localStorage
  useEffect(() => {
    localStorage.setItem(ENABLED_WIDGETS_KEY, JSON.stringify(enabled));
  }, [enabled]);

  const handleToggle = (filename) => {
    setEnabled((prev) => ({
      ...prev,
      [filename]: !prev[filename],
    }));
  };

  const getRefreshInterval = () => {
    const widgetSettings = JSON.parse(localStorage.getItem('widgetSettings') || '{}');
    return widgetSettings.widgetGallery?.refreshInterval || 0;
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  if (plugins.length === 0) {
    return loading ? (
      <Box sx={{ mt: 4, padding: '0 20px', textAlign: 'center' }}>
        <Typography variant="h6">Loading widgets...</Typography>
      </Box>
    ) : null;
  }

  return (
    <Box sx={{ mt: 2, padding: '0 20px', position: 'relative' }}>
      {/* Countdown Circle Indicator */}
      <CountdownCircle
        key={refreshKey}
        refreshInterval={getRefreshInterval()}
        onRefresh={handleRefresh}
      />

      {/* Widget Gallery Header */}
      <Box sx={{ mb: 2, textAlign: 'center' }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'var(--text)', mb: 1 }}>
          🎨 Widget Gallery
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Enable widgets to display them below. Toggle transparency for individual widgets.
        </Typography>
      </Box>
      
      <Box sx={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: 3, 
        justifyContent: 'center',
        alignItems: 'flex-start'
      }}>
        {plugins.map((plugin) => (
          <Card 
            key={plugin.filename} 
            className={`card ${transparentBackground ? 'transparent-card' : ''}`}
            sx={{ 
              flex: '1 1 300px',
              maxWidth: '500px',
              minWidth: '300px',
              mb: 0,
              backgroundColor: transparentBackground ? 'transparent' : 'var(--card-bg)',
              backdropFilter: transparentBackground ? 'blur(10px)' : 'none',
              border: transparentBackground ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid var(--card-border)',
            }}
          >
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              p: 2, 
              borderBottom: '1px solid var(--card-border)',
              backgroundColor: transparentBackground ? 'rgba(0, 0, 0, 0.2)' : 'transparent',
            }}>
              <Typography variant="h6" sx={{ color: 'var(--text)' }}>
                {plugin.name}
              </Typography>
              
              <Box>
                {/* Enabled/Disabled Toggle */}
                <FormControlLabel
                  control={
                    <Switch
                      checked={!!enabled[plugin.filename]}
                      onChange={() => handleToggle(plugin.filename)}
                      color="primary"
                    />
                  }
                  label={enabled[plugin.filename] ? 'Enabled' : 'Disabled'}
                />
              </Box>
            </Box>
            {enabled[plugin.filename] && (
              <iframe
                key={refreshKey}
                src={`${API_BASE_URL}/widgets/${plugin.filename}?theme=${theme}`}
                title={plugin.name}
                style={{
                  width: '100%',
                  height: '400px',
                  border: 'none',
                  display: 'block',
                  background: 'transparent',
                }}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                onLoad={(e) => {
                  try {
                    const iframe = e.target;
                    iframe.contentWindow.addEventListener('error', (error) => {
                      console.error('Widget error:', error);
                    });
                  } catch (err) {
                    // Cross-origin restrictions might prevent this
                  }
                }}
              />
            )}
          </Card>
        ))}
      </Box>
    </Box>
  );
};

export default WidgetGallery;
