import React, { useState, useEffect } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { Lock, LockOpen } from '@mui/icons-material';
import WidgetContainer from '../components/WidgetContainer';
import CalendarWidget from '../components/CalendarWidget';
import ChoreWidget from '../components/ChoreWidget';
import PhotoWidget from '../components/PhotoWidget';
import WeatherWidget from '../components/WeatherWidget';

const Dashboard = () => {
  const [locked, setLocked] = useState(true);
  const [weatherApiKey, setWeatherApiKey] = useState('');
  const [widgetSizes, setWidgetSizes] = useState({});

  useEffect(() => {
    // Load weather API key from localStorage
    const settings = JSON.parse(localStorage.getItem('widgetSettings') || '{}');
    if (settings.weather?.apiKey) {
      setWeatherApiKey(settings.weather.apiKey);
    }
  }, []);

  // Load saved layouts and initialize widget sizes
  useEffect(() => {
    console.log('Dashboard: Initializing widget sizes from localStorage');
    const sizes = {};
    
    // Define default widgets
    const defaultWidgets = [
      { id: 'calendar', defaultSize: { width: 4, height: 4 } },
      { id: 'chores', defaultSize: { width: 4, height: 4 } },
      { id: 'photos', defaultSize: { width: 4, height: 4 } },
      { id: 'weather', defaultSize: { width: 4, height: 4 } }
    ];

    defaultWidgets.forEach(widget => {
      const savedLayout = localStorage.getItem(`widget-layout-${widget.id}`);
      if (savedLayout) {
        const parsed = JSON.parse(savedLayout);
        sizes[widget.id] = { width: parsed.w, height: parsed.h };
        console.log(`Dashboard: Loaded size for ${widget.id}:`, sizes[widget.id]);
      } else {
        sizes[widget.id] = widget.defaultSize;
        console.log(`Dashboard: Using default size for ${widget.id}:`, sizes[widget.id]);
      }
    });
    
    setWidgetSizes(sizes);
  }, []);

  // Handle layout changes from WidgetContainer
  const handleLayoutChange = (layout) => {
    console.log('Dashboard: Layout changed:', layout);
    
    const newSizes = {};
    layout.forEach(item => {
      newSizes[item.i] = { width: item.w, height: item.h };
      console.log(`Dashboard: Updated size for ${item.i}:`, newSizes[item.i]);
    });
    
    setWidgetSizes(newSizes);
  };

  // Define widgets with their configurations
  const widgets = [
    {
      id: 'calendar',
      defaultPosition: { x: 0, y: 0 },
      defaultSize: { width: 4, height: 4 },
      minWidth: 3,
      minHeight: 3,
      content: <CalendarWidget />
    },
    {
      id: 'chores',
      defaultPosition: { x: 4, y: 0 },
      defaultSize: { width: 4, height: 4 },
      minWidth: 3,
      minHeight: 3,
      content: <ChoreWidget />
    },
    {
      id: 'photos',
      defaultPosition: { x: 8, y: 0 },
      defaultSize: { width: 4, height: 4 },
      minWidth: 3,
      minHeight: 3,
      content: <PhotoWidget />
    },
    {
      id: 'weather',
      defaultPosition: { x: 0, y: 4 },
      defaultSize: { width: 4, height: 4 },
      minWidth: 2,
      minHeight: 2,
      content: <WeatherWidget 
        weatherApiKey={weatherApiKey}
        widgetSize={widgetSizes['weather'] || { width: 4, height: 4 }}
      />
    }
  ];

  // Update widgets with dynamic sizes
  const widgetsWithSizes = widgets.map(widget => {
    const size = widgetSizes[widget.id] || widget.defaultSize;
    
    // Special handling for weather widget to pass size prop
    if (widget.id === 'weather') {
      console.log('Dashboard: Rendering weather widget with size:', size);
      return {
        ...widget,
        content: <WeatherWidget 
          weatherApiKey={weatherApiKey}
          widgetSize={size}
        />
      };
    }
    
    return widget;
  });

  console.log('Dashboard: Current widget sizes:', widgetSizes);

  return (
    <Box sx={{ 
      position: 'relative',
      minHeight: '100vh',
      backgroundColor: 'var(--background)'
    }}>
      {/* Lock/Unlock Button */}
      <Box sx={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 1000
      }}>
        <Tooltip title={locked ? 'Unlock to edit layout' : 'Lock layout'}>
          <IconButton
            onClick={() => setLocked(!locked)}
            sx={{
              backgroundColor: locked ? 'var(--surface)' : 'var(--accent)',
              color: locked ? 'var(--text)' : 'white',
              '&:hover': {
                backgroundColor: locked ? 'var(--card-border)' : 'var(--secondary)',
              },
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            }}
          >
            {locked ? <Lock /> : <LockOpen />}
          </IconButton>
        </Tooltip>
      </Box>

      <WidgetContainer 
        widgets={widgetsWithSizes} 
        locked={locked}
        onLayoutChange={handleLayoutChange}
      />
    </Box>
  );
};

export default Dashboard;
