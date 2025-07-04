// client/src/components/CalendarWidget.jsx
import React, { useState, useEffect } from 'react';
import { Card, Typography, Box, List, ListItem, ListItemText } from '@mui/material';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import axios from 'axios';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../index.css'; // Assuming global styles are here

const localizer = momentLocalizer(moment);

// Custom Header Component for react-big-calendar
const CustomDayHeader = ({ label, date }) => {
  // Check if the day of the week for this header matches the current day of the week
  const todayDayOfWeek = moment().format('ddd'); // e.g., "Mon", "Tue"
  const headerDayOfWeek = moment(date).format('ddd'); // e.g., "Mon", "Tue" for the header's date

  const highlightHeader = todayDayOfWeek === headerDayOfWeek;

  return (
    <div className={`rbc-header ${highlightHeader ? 'rbc-current-day-header' : ''}`}>
      {label}
    </div>
  );
};


const CalendarWidget = ({ transparentBackground }) => {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/calendar-events`);
        
        const formattedEvents = response.data.map(event => ({
          title: event.title,
          start: new Date(event.start),
          end: new Date(event.end),
          allDay: false,
          resource: event,
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
  }, []);

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
              components={{
                header: CustomDayHeader, // Use the custom header component
              }}
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
