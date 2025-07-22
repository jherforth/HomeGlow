import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, Typography, Switch, FormControlLabel, Box } from '@mui/material';

const LOCAL_STORAGE_KEY = 'enabledWidgets';

const WidgetGallery = () => {
  const [plugins, setPlugins] = useState([]);
  const [enabled, setEnabled] = useState({});

  // Fetch plugins from server
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

  // Load enabled state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    setEnabled(saved ? JSON.parse(saved) : {});
  }, []);

  // Save enabled state to localStorage
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(enabled));
  }, [enabled]);

  const handleToggle = (filename) => {
    setEnabled((prev) => ({
      ...prev,
      [filename]: !prev[filename],
    }));
  };

  // If there are no plugins to display, render nothing.
  if (plugins.length === 0) {
    return null;
  }

  // Otherwise, render the gallery.
  return (
    <Box sx={{ mt: 4, padding: '0 20px' }}>
      <Typography variant="h5" gutterBottom align="center">
        Widget Gallery
      </Typography>
      {plugins.map((plugin) => (
        <Card key={plugin.filename} className="card" sx={{ maxWidth: 600, margin: '24px auto', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, borderBottom: '1px solid var(--card-border)' }}>
            <Typography variant="h6">{plugin.name}</Typography>
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
          {enabled[plugin.filename] && (
            <iframe
              src={`${import.meta.env.VITE_REACT_APP_API_URL}/widgets/${plugin.filename}`}
              title={plugin.name}
              style={{
                width: '100%',
                height: '400px',
                border: 'none',
                display: 'block', // Ensures the iframe is a block element
                background: 'transparent',
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
