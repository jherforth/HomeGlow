import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, Typography, Switch, FormControlLabel, Box } from '@mui/material';

// Define separate localStorage keys for clarity
const ENABLED_WIDGETS_KEY = 'enabledWidgets';
const WIDGET_GALLERY_TRANSPARENT_KEY = 'widgetGalleryTransparent';

const WidgetGallery = ({ theme }) => {
  const [plugins, setPlugins] = useState([]);
  const [enabled, setEnabled] = useState({});
  const [widgetGalleryTransparent, setWidgetGalleryTransparent] = useState(false); // Widget gallery transparency toggle
  const [loading, setLoading] = useState(true);

  // Fetch plugins from server (no changes here)
  useEffect(() => {
    const fetchPlugins = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/widgets`);
        setPlugins(Array.isArray(response.data) ? response.data : []);
      } catch {
        setPlugins([]);
      } finally {
        setLoading(false);
      }
    };
    fetchPlugins();
  }, []);

  // Load enabled and transparent states from localStorage
  useEffect(() => {
    const savedEnabled = localStorage.getItem(ENABLED_WIDGETS_KEY);
    setEnabled(savedEnabled ? JSON.parse(savedEnabled) : {});

    const savedWidgetGalleryTransparent = localStorage.getItem(WIDGET_GALLERY_TRANSPARENT_KEY);
    setWidgetGalleryTransparent(savedWidgetGalleryTransparent === 'true');
  }, []);

  // Save enabled state to localStorage
  useEffect(() => {
    localStorage.setItem(ENABLED_WIDGETS_KEY, JSON.stringify(enabled));
  }, [enabled]);

  // Save widget gallery transparent state to localStorage
  useEffect(() => {
    localStorage.setItem(WIDGET_GALLERY_TRANSPARENT_KEY, widgetGalleryTransparent.toString());
  }, [widgetGalleryTransparent]);

  const handleToggle = (filename) => {
    setEnabled((prev) => ({
      ...prev,
      [filename]: !prev[filename],
    }));
  };

  // Widget gallery transparency toggle handler
  const handleWidgetGalleryTransparencyToggle = () => {
    setWidgetGalleryTransparent(!widgetGalleryTransparent);
  };

  if (plugins.length === 0) {
    return loading ? (
      <Box sx={{ mt: 4, padding: '0 20px', textAlign: 'center' }}>
        <Typography variant="h6">Loading widgets...</Typography>
      </Box>
    ) : null;
  }

  return (
    <Box sx={{ mt: 4, padding: '0 20px' }}>
      
      {/* Widget Transparency Toggle */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
        <FormControlLabel
          control={
            <Switch
              checked={widgetGalleryTransparent}
              onChange={handleWidgetGalleryTransparencyToggle}
              color="secondary"
            />
          }
          label="Make Widget Gallery Transparent"
        />
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
            className={`card ${widgetGalleryTransparent ? 'transparent-card' : ''}`}
            sx={{ 
              flex: '1 1 300px', // Flexible width with minimum of 300px
              maxWidth: '500px', // Maximum width to prevent cards from getting too wide
              minWidth: '300px', // Minimum width to maintain readability
              mb: 0 // Remove bottom margin since we're using gap
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, borderBottom: '1px solid var(--card-border)' }}>
              <Typography variant="h6">{plugin.name}</Typography>
              
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
              <>
              <iframe
                // The iframe src now only includes theme
                src={`${import.meta.env.VITE_REACT_APP_API_URL}/widgets/${plugin.filename}?theme=${theme}`}
                title={plugin.name}
                style={{
                  width: '100%',
                  height: '400px',
                  border: 'none',
                  display: 'block',
                  background: 'transparent', // Iframe itself is always transparent
                }}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                onLoad={(e) => {
                  // Add error handling for iframe content
                  try {
                    const iframe = e.target;
                    iframe.contentWindow.addEventListener('error', (error) => {
                      console.error('Widget error:', error);
                    });
                  } catch (err) {
                    // Cross-origin restrictions might prevent this, which is fine
                  }
                }}
              />
              </>
            )}
          </Card>
        ))}
      </Box>
    </Box>
  );
};

export default WidgetGallery;
