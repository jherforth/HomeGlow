import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, Typography, Button, Box } from '@mui/material';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../index.css';

const localizer = momentLocalizer(moment);

const CalendarWidget = () => {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/calendar`);
        const formattedEvents = response.data.map(event => ({
          ...event,
          start: new Date(event.start),
          end: new Date(event.end),
        }));
        setEvents(formattedEvents);
        setError(null);
      } catch (error) {
        console.error('Error fetching events:', error);
        setError('Cannot connect to calendar service. Please try again later.');
      }
    };
    fetchEvents();
  }, []);

  const handleDownloadIcs = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/calendar/ics`, {
        responseType: 'blob', // Important for downloading files
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'calendar.ics');
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      setError(null);
    } catch (error) {
      console.error('Error downloading ICS:', error);
      setError('Failed to download calendar. Please try again.');
    }
  };

  return (
    <Card className="card">
      <Typography variant="h6">Calendar</Typography>
      {error && <Typography color="error">{error}</Typography>}
      <Box sx={{ height: 400, mt: 2 }}>
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
        />
      </Box>
      <Button variant="contained" onClick={handleDownloadIcs} sx={{ mt: 2 }}>
        Download ICS
      </Button>
    </Card>
  );
};

export default CalendarWidget;
