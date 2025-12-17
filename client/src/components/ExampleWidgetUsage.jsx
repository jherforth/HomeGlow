import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';
import WidgetContainer from './WidgetContainer';
import CalendarWidget from './CalendarWidget';
import WeatherWidget from './WeatherWidget';
import ChoreWidget from './ChoreWidget';
import PhotoWidget from './PhotoWidget';

/**
 * Example usage of the DraggableWidget system
 * Shows how to integrate existing widgets into the draggable grid layout
 */
const ExampleWidgetUsage = () => {
  const widgets = [
    {
      id: 'calendar-widget',
      defaultPosition: { x: 0, y: 0 },
      defaultSize: { width: 6, height: 4 }, // 6 columns wide, 4 rows tall
      minWidth: 4,
      minHeight: 3,
      content: (
        <Card sx={{ height: '100%', overflow: 'auto' }}>
          <CardContent>
            <CalendarWidget transparentBackground={false} />
          </CardContent>
        </Card>
      ),
      onPositionChange: (pos) => console.log('Calendar moved to:', pos),
      onSizeChange: (size) => console.log('Calendar resized to:', size),
    },
    {
      id: 'weather-widget',
      defaultPosition: { x: 6, y: 0 },
      defaultSize: { width: 6, height: 4 },
      minWidth: 3,
      minHeight: 2,
      content: (
        <Card sx={{ height: '100%', overflow: 'auto' }}>
          <CardContent>
            <WeatherWidget transparentBackground={false} />
          </CardContent>
        </Card>
      ),
      onPositionChange: (pos) => console.log('Weather moved to:', pos),
      onSizeChange: (size) => console.log('Weather resized to:', size),
    },
    {
      id: 'chores-widget',
      defaultPosition: { x: 0, y: 4 },
      defaultSize: { width: 4, height: 3 },
      minWidth: 3,
      minHeight: 2,
      content: (
        <Card sx={{ height: '100%', overflow: 'auto' }}>
          <CardContent>
            <ChoreWidget transparentBackground={false} />
          </CardContent>
        </Card>
      ),
      onPositionChange: (pos) => console.log('Chores moved to:', pos),
      onSizeChange: (size) => console.log('Chores resized to:', size),
    },
    {
      id: 'photos-widget',
      defaultPosition: { x: 4, y: 4 },
      defaultSize: { width: 8, height: 3 },
      minWidth: 4,
      minHeight: 2,
      content: (
        <Card sx={{ height: '100%', overflow: 'auto' }}>
          <CardContent>
            <PhotoWidget transparentBackground={false} />
          </CardContent>
        </Card>
      ),
      onPositionChange: (pos) => console.log('Photos moved to:', pos),
      onSizeChange: (size) => console.log('Photos resized to:', size),
    },
  ];

  return (
    <Box sx={{ width: '100%', minHeight: '100vh' }}>
      <Box sx={{ padding: 3, textAlign: 'center' }}>
        <Typography variant="h4" gutterBottom>
          HomeGlow Dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Click any widget to select it, then drag to move or resize from corners
        </Typography>
      </Box>
      
      <WidgetContainer widgets={widgets} />
    </Box>
  );
};

export default ExampleWidgetUsage;
