import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, Typography, Switch, FormControlLabel, Box } from '@mui/material';

// Define separate localStorage keys for clarity
const ENABLED_WIDGETS_KEY = 'enabledWidgets';
const TRANSPARENT_WIDGETS_KEY = 'transparentWidgets';

const WidgetGallery = ({ theme }) => {
  const [plugins, setPlugins] = useState([]);
  const [enabled, setEnabled] = useState({});
  const [isTransparent, setIsTransparent] = useState({}); // New state for transparency

  // Fetch plugins from server (no changes here)
  useEffect(() => {
    const fetchPlugins = async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/widgets`);
        setPlugins(Array.isArray(response.data) ? response.data : []);
      } catch {
        setPlugins([]);
      }
    };
    fetchPlugins();
  }, []);

  // Load enabled and transparent states from localStorage
  useEffect(() => {
    const savedEnabled = localStorage.getItem(ENABLED_WIDGETS_KEY);
    setEnabled(savedEnabled ? JSON.parse(savedEnabled) : {});

    const savedTransparent = localStorage.getItem(TRANSPARENT_WIDGETS_KEY);
    setIsTransparent(savedTransparent ? JSON.parse(savedTransparent) : {});
  }, []);

  // Save enabled state to localStorage
  useEffect(() => {
    localStorage.setItem(ENABLED_WIDGETS_KEY, JSON.stringify(enabled));
  }, [enabled]);

  // Save transparent state to localStorage
  useEffect(() => {
    localStorage.setItem(TRANSPARENT_WIDGETS_KEY, JSON.stringify(isTransparent));
  }, [isTransparent]);

  const handleToggle = (filename) => {
    setEnabled((prev) => ({
      ...prev,
      [filename]: !prev[filename],
    }));
  };

  // New handler for the transparency toggle
  const handleTransparencyToggle = (filename) => {
    setIsTransparent((prev) => ({
      ...prev,
      [filename]: !prev[filename],
    }));
  };

  if (plugins.length === 0) {
    return null;
  }

  return (
    <Box sx={{ mt: 4, padding: '0 20px' }}>
      <Typography variant="h5" gutterBottom align="center">
        Widget Gallery
      </Typography>
      {plugins.map((plugin) => (
        <Card key={plugin.filename} className="card" sx={{ maxWidth: 600, margin: '24px auto', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, borderBottom: '1px solid var(--card-border)' }}>
            {/* The widget name title is removed as requested */}
            <Typography variant="h6">{plugin.name}</Typography>
            
            <Box>
              {/* New Transparency Toggle */}
              <FormControlLabel
                control={
                  <Switch
                    checked={!!isTransparent[plugin.filename]}
                    onChange={() => handleTransparencyToggle(plugin.filename)}
                    color="secondary"
                  />
                }
                label="Transparent"
              />
              {/* Existing Enabled/Disabled Toggle */}
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
              // The iframe src now includes both theme and transparency state
              src={`${import.meta.env.VITE_REACT_APP_API_URL}/widgets/${plugin.filename}?theme=${theme}&transparent=${!!isTransparent[plugin.filename]}`}
              title={plugin.name}
              style={{
                width: '100%',
                height: '400px',
                border: 'none',
                display: 'block',
                background: 'transparent', // Iframe itself is always transparent
              }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          )}
        </Card>
      ))}
    </Box>
  );
};

export default WidgetGallery;
