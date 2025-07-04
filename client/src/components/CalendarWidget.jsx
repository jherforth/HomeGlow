// client/src/components/CalendarWidget.jsx
import React, { useState, useEffect } from 'react';
import { Card, Typography, Box, List, ListItem, ListItemText } from '@mui/material'; // Added List, ListItem, ListItemText
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import axios from 'axios';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../index.css'; // Assuming global styles are here

const localizer = momentLocalizer(moment);

const CalendarWidget = ({ transparentBackground }) => {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  // Removed currentView state as we're no longer toggling views

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/calendar-events`);
        
        const formattedEvents = response.data.map(event => ({
          title: event.title,
          start: new Date(event.start),
          end: new Date(event.end),
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

  // Filter events for the next 7 days
  const today = moment().startOf('day');
  const sevenDaysLater = moment().add(7, 'days').endOf('day');

  const upcomingEvents = events.filter(event => {
    const eventStart = moment(event.start);
    // Check if event starts within the next 7 days (inclusive of today and the 7th day)
    return eventStart.isBetween(today, sevenDaysLater, null, '[]');
  }).sort((a, b) => moment(a.start).diff(moment(b.start))); // Sort by start time

  // Group upcoming events by day for display
  const groupedUpcomingEvents = upcomingEvents.reduce((acc, event) => {
    const dateKey = moment(event.start).format('YYYY-MM-DD'); // e.g., "2023-10-27"
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(event);
    return acc;
  }, {});

  // Fixed height for the main calendar (month view)
  const mainCalendarHeight = 400;

  return (
    <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`}>
      <Typography variant="h6" gutterBottom>
        Calendar
      </Typography>
      {loading && <Typography>Loading events...</Typography>}
      {error && <Typography color="error">{error}</Typography>}
      {!loading && !error && (
        <>
          {/* Main Calendar (Month View) */}
          <Box sx={{ height: mainCalendarHeight }}>
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              style={{ height: '100%' }}
              views={['month']} // Only show month view
              defaultView="month"
              className="custom-calendar" // Add a class for custom CSS
            />
          </Box>

          {/* Upcoming Events List (Next 7 Days) */}
          <Box sx={{ mt: 3, p: 2, borderTop: '1px solid var(--card-border)' }}>
            <Typography variant="h6" gutterBottom>
              Upcoming Events (Next 7 Days)
            </Typography>
            {Object.keys(groupedUpcomingEvents).length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No upcoming events in the next 7 days.
              </Typography>
            ) : (
              <Box sx={{ maxHeight: 300, overflowY: 'hidden' }}> {/* Set max height and hide overflow */}
                <List dense>
                  {Object.keys(groupedUpcomingEvents).map(dateKey => (
                    <React.Fragment key={dateKey}>
                      <ListItem>
                        <ListItemText
                          primary={moment(dateKey).format('dddd, MMMM Do') /* e.g., "Friday, October 27th" */}
                          primaryTypographyProps={{ fontWeight: 'bold', color: 'var(--text-color)' }}
                        />
                      </ListItem>
                      {groupedUpcomingEvents[dateKey].map((event, index) => (
                        <ListItem key={event.title + index} sx={{ pl: 4 /* Indent event items */ }}>
                          <ListItemText
                            primary={`${moment(event.start).format('h:mm A')} - ${event.title}`}
                            secondary={event.description || event.location}
                            primaryTypographyProps={{ color: 'var(--text-color)' }}
                            secondaryTypographyProps={{ color: 'var(--text-color-secondary)' }}
                          />
                        </ListItem>
                      ))}
                    </React.Fragment>
                  ))}
                </List>
              </Box>
            )}
          </Box>
        </>
      )}
    </Card>
  );
};

export default CalendarWidget;
