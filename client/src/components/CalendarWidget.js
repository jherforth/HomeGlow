import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, Typography } from '@mui/material';
import '../index.css';

const CalendarWidget = () => {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios
      .get(`${process.env.REACT_APP_API_URL}/api/calendar`)
      .then((response) => {
        setEvents(response.data);
        setError(null);
      })
      .catch((error) => {
        console.error('Error fetching calendar events:', error);
        setError('Failed to load calendar events');
      });
  }, []);

  return (
    <Card className="card">
      <Typography variant="h6">Calendar</Typography>
      {error && <Typography color="error">{error}</Typography>}
      {events.length === 0 && !error && <Typography>No events found</Typography>}
      {events.map((event) => (
        <Typography key={event.id} style={{ marginBottom: '8px' }}>
          {event.summary} - {event.start}
        </Typography>
      ))}
    </Card>
  );
};

export default CalendarWidget;