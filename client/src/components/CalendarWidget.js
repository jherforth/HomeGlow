import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, Typography } from '@mui/material';
import '../index.css';

const CalendarWidget = () => {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/calendar`);
        setEvents(response.data);
        setError(null);
      } catch (error) {
        console.error('Error fetching calendar events:', error);
        setError('Cannot connect to calendar service. Please check Nextcloud settings.');
      }
    };
    fetchEvents();
  }, []);

  return (
    <Card className="card">
      <Typography variant="h6">Calendar</Typography>
      {error && <Typography color="error">{error}</Typography>}
      {events.length === 0 && !error && <Typography>No events available</Typography>}
      {events.map((event) => (
        <Typography key={event.id}>{event.summary} - {event.start}</Typography>
      ))}
    </Card>
  );
};

export default CalendarWidget;