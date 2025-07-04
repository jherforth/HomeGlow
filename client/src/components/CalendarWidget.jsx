// client/src/components/CalendarWidget.jsx
import React, { useState, useEffect } from 'react';
import { Card, Typography, Box } from '@mui/material';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import axios from 'axios'; // Import axios
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../index.css'; // Assuming global styles are here

const localizer = momentLocalizer(moment);

const CalendarWidget = ({ transparentBackground }) => {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('month'); // State to track current view

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        // Fetch events from your new backend endpoint
        const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/calendar-events`);
        
        // Transform events to react-big-calendar format
        const formattedEvents = response.data.map(event => ({
          title: event.title,
          start: new Date(event.start), // Convert string to Date object
          end: new Date(event.end),     // Convert string to Date object
          allDay: false, // Adjust if your events can be all-day
          resource: event, // Keep original event data if needed
        }));
        setEvents(formattedEvents);
        setError(null);
      } catch (err) {
        console.error('Error fetching calendar events:', err);
        setError('Failed to load calendar events. Please check the ICS URL and server.');
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []); // Empty dependency array means this effect runs once on mount

  // Determine height based on current view
  const calendarHeight = currentView === 'agenda' ? 600 : 400; // Taller for agenda view

  return (
    <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`}>
      <Typography variant="h6" gutterBottom>
        Calendar
      </Typography>
      {loading && <Typography>Loading events...</Typography>}
      {error && <Typography color="error">{error}</Typography>}
      {!loading && !error && (
        <Box sx={{ height: calendarHeight }}> {/* Dynamic height */}
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%' }}
            views={['month', 'week', 'day', 'agenda']}
            defaultView="month"
            onView={setCurrentView} // Update currentView state
            className="custom-calendar" // Add a class for custom CSS
            // You can add more props here for customization
            // e.g., eventPropGetter, dayPropGetter, components
          />
        </Box>
      )}
    </Card>
  );
};

export default CalendarWidget;
