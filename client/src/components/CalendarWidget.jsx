import React, { useState, useEffect } from 'react';
import { Card, Typography, Box, List, ListItem, ListItemText, Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import axios from 'axios';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = momentLocalizer(moment);

const CalendarWidget = ({ transparentBackground, icsCalendarUrl }) => {
  const [events, setEvents] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDateEvents, setSelectedDateEvents] = useState([]);
  const [showDayModal, setShowDayModal] = useState(false);

  useEffect(() => {
    if (!icsCalendarUrl) {
      console.log('No ICS calendar URL provided');
      setError('No calendar URL configured. Please add your ICS calendar URL in the Admin Panel.');
      setLoading(false);
      return;
    }

    fetchCalendarEvents();
  }, [icsCalendarUrl]);

  const fetchCalendarEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/calendar-events`);
      
      if (Array.isArray(response.data)) {
        const formattedEvents = response.data.map(event => ({
          id: event.id || Math.random().toString(),
          title: event.title || event.summary || 'Untitled Event',
          start: new Date(event.start),
          end: new Date(event.end),
          description: event.description || '',
          location: event.location || ''
        }));

        setEvents(formattedEvents);
        
        // Get upcoming events for the next 7 days
        const now = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(now.getDate() + 7);
        
        const upcoming = formattedEvents
          .filter(event => event.start >= now && event.start <= nextWeek)
          .sort((a, b) => a.start - b.start)
          .slice(0, 5); // Show max 5 upcoming events
        
        setUpcomingEvents(upcoming);
      } else {
        setEvents([]);
        setUpcomingEvents([]);
      }
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      setError('Failed to load calendar events. Please check your ICS calendar URL in the Admin Panel.');
      setEvents([]);
      setUpcomingEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const formatEventTime = (date) => {
    return moment(date).format('MMM D, h:mm A');
  };

  const handleSelectSlot = ({ start }) => {
    const selectedDay = moment(start).startOf('day');
    const dayEvents = events.filter(event => 
      moment(event.start).isSame(selectedDay, 'day')
    );
    
    setSelectedDate(selectedDay.toDate());
    setSelectedDateEvents(dayEvents);
    setShowDayModal(true);
  };

  const handleSelectEvent = (event) => {
    const selectedDay = moment(event.start).startOf('day');
    const dayEvents = events.filter(e => 
      moment(e.start).isSame(selectedDay, 'day')
    );
    
    setSelectedDate(selectedDay.toDate());
    setSelectedDateEvents(dayEvents);
    setShowDayModal(true);
  };

  const getCurrentDayOfWeek = () => {
    return new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
  };

  // Custom header component to highlight current day
  const CustomHeader = ({ date, label }) => {
    const today = new Date();
    const isToday = moment(date).isSame(today, 'day');
    const currentDayOfWeek = getCurrentDayOfWeek();
    const headerDayOfWeek = date.getDay();
    const isCurrentDayOfWeek = headerDayOfWeek === currentDayOfWeek;

    return (
      <div className={isCurrentDayOfWeek ? 'rbc-current-day-header' : ''}>
        {label}
      </div>
    );
  };

  if (loading) {
    return (
      <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`}>
        <Typography variant="h6">📅 Calendar</Typography>
        <Typography>Loading calendar events...</Typography>
      </Card>
    );
  }

  return (
    <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`}>
      <Typography variant="h6" sx={{ mb: 2 }}>📅 Calendar</Typography>
      
      {error && (
        <Box sx={{ mb: 2, p: 2, bgcolor: 'rgba(255, 0, 0, 0.1)', borderRadius: 1 }}>
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 2, height: 500 }}>
        {/* Calendar View */}
        <Box sx={{ flex: 2, minHeight: 400 }}>
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%' }}
            views={['month']}
            defaultView="month"
            className="custom-calendar"
            selectable={true}
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            components={{
              month: {
                header: CustomHeader
              }
            }}
            eventPropGetter={(event) => ({
              style: {
                backgroundColor: 'var(--accent)',
                borderRadius: '4px',
                border: 'none',
                color: 'white',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }
            })}
          />
        </Box>

        {/* Upcoming Events List */}
        <Box sx={{ flex: 1, minWidth: 250 }}>
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>
            Upcoming Events
          </Typography>
          
          {upcomingEvents.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No upcoming events in the next 7 days
            </Typography>
          ) : (
            <List dense sx={{ maxHeight: 400, overflowY: 'auto' }}>
              {upcomingEvents.map((event, index) => (
                <ListItem
                  key={event.id || index}
                  sx={{
                    border: '1px solid var(--card-border)',
                    borderRadius: 1,
                    mb: 1,
                    bgcolor: 'rgba(var(--accent-rgb), 0.05)'
                  }}
                >
                  <ListItemText
                    primary={event.title}
                    secondary={
                      <Box>
                        <Typography variant="caption" display="block">
                          {formatEventTime(event.start)}
                        </Typography>
                        {event.location && (
                          <Typography variant="caption" display="block" color="text.secondary">
                            📍 {event.location}
                          </Typography>
                        )}
                        {event.description && (
                          <Typography variant="caption" display="block" color="text.secondary">
                            {event.description.substring(0, 100)}
                            {event.description.length > 100 ? '...' : ''}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Box>

      {/* Day Details Modal */}
      <Dialog 
        open={showDayModal} 
        onClose={() => setShowDayModal(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {selectedDate && (
            <Typography variant="h6">
              📅 {moment(selectedDate).format('dddd, MMMM D, YYYY')}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {selectedDateEvents.length === 0 ? (
            <Typography variant="body1" color="text.secondary" sx={{ py: 2 }}>
              No events scheduled for this day.
            </Typography>
          ) : (
            <List>
              {selectedDateEvents.map((event, index) => (
                <ListItem
                  key={event.id || index}
                  sx={{
                    border: '1px solid var(--card-border)',
                    borderRadius: 1,
                    mb: 1,
                    bgcolor: 'rgba(var(--accent-rgb), 0.05)'
                  }}
                >
                  <ListItemText
                    primary={
                      <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                        {event.title}
                      </Typography>
                    }
                    secondary={
                      <Box>
                        <Typography variant="body1" sx={{ mb: 1 }}>
                          🕐 {moment(event.start).format('h:mm A')} - {moment(event.end).format('h:mm A')}
                        </Typography>
                        {event.location && (
                          <Typography variant="body2" sx={{ mb: 1 }}>
                            📍 {event.location}
                          </Typography>
                        )}
                        {event.description && (
                          <Typography variant="body2" color="text.secondary">
                            {event.description}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDayModal(false)} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default CalendarWidget;