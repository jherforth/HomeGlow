import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Typography, Card } from '@mui/material';

const CalendarWidget = () => {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    axios.get('http://localhost:5000/api/calendar')
      .then(response => setEvents(response.data))
      .catch(error => console.error(error));
  }, []);

  return (
    <Card style={{ padding: '20px', width: '300px' }}>
      <Typography variant="h6">Calendar</Typography>
      {events.map(event => (
        <Typography key={event.id}>{event.summary} - {event.start}</Typography>
      ))}
    </Card>
  );
};

export default CalendarWidget;