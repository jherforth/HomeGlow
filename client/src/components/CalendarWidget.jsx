import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, Typography, TextField, Button } from '@mui/material';
import '../index.css';

const CalendarWidget = () => {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [newEvent, setNewEvent] = useState({ summary: '', start: '', end: '', description: '' });

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/calendar`);
        setEvents(response.data);
        setError(null);
      } catch (error) {
        console.error('Error fetching calendar events:', error);
        setError('Cannot connect to calendar service. Please try again.');
      }
    };
    fetchEvents();
  }, []);

  const handleInputChange = (e) => {
    setNewEvent({ ...newEvent, [e.target.name]: e.target.value });
  };

  const handleAddEvent = async () => {
    if (!newEvent.summary.trim() || !newEvent.start.trim()) {
      setError('Event title and start date are required');
      return;
    }
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/calendar`, {
        user_id: 1,
        summary: newEvent.summary,
        start: newEvent.start,
        end: newEvent.end || newEvent.start,
        description: newEvent.description,
      });
      setEvents([...events, { ...newEvent, id: response.data.id }]);
      setNewEvent({ summary: '', start: '', end: '', description: '' });
      setError(null);
    } catch (error) {
      console.error('Error adding event:', error);
      setError('Failed to add event. Please try again.');
    }
  };

  const downloadIcs = async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/calendar/ics`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'homeglow_calendar.ics');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading iCalendar:', error);
      setError('Failed to download calendar. Please try again.');
    }
  };

  return (
    <Card className="card">
      <Typography variant="h6">Calendar</Typography>
      {error && <Typography color="error">{error}</Typography>}
      {events.length === 0 && !error && <Typography>No events available</Typography>}
      {events.map((event) => (
        <Typography key={event.id}>
          {event.summary} - {new Date(event.start).toLocaleString()}
        </Typography>
      ))}
      <TextField
        name="summary"
        value={newEvent.summary}
        onChange={handleInputChange}
        label="Event Title"
        variant="outlined"
        size="small"
        fullWidth
        sx={{ marginBottom: '8px', marginTop: '8px' }}
      />
      <TextField
        name="start"
        value={newEvent.start}
        onChange={handleInputChange}
        label="Start Date (YYYY-MM-DD HH:mm)"
        variant="outlined"
        size="small"
        fullWidth
        sx={{ marginBottom: '8px' }}
      />
      <TextField
        name="end"
        value={newEvent.end}
        onChange={handleInputChange}
        label="End Date (YYYY-MM-DD HH:mm)"
        variant="outlined"
        size="small"
        fullWidth
        sx={{ marginBottom: '8px' }}
      />
      <TextField
        name="description"
        value={newEvent.description}
        onChange={handleInputChange}
        label="Description"
        variant="outlined"
        size="small"
        fullWidth
        sx={{ marginBottom: '8px' }}
      />
      <Button variant="contained" onClick={handleAddEvent}>
        Add Event
      </Button>
      <Button variant="contained" onClick={downloadIcs} sx={{ marginLeft: '8px' }}>
        Download .ics
      </Button>
    </Card>
  );
};

export default CalendarWidget;