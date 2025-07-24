// client/src/components/CalendarWidget.jsx
import React, { useState, useEffect } from 'react';
import { Card, Typography, Box, List, ListItem, ListItemText, Dialog, DialogTitle, DialogContent, DialogActions, Button, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
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
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDateEvents, setSelectedDateEvents] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);

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

  // Handle day click to show modal
  const handleSelectSlot = ({ start, end, slots }) => {
    const clickedDate = moment(start).startOf('day');
    const dayEvents = events.filter(event => {
      const eventStart = moment(event.start).startOf('day');
      return eventStart.isSame(clickedDate, 'day');
    });

    setSelectedDate(clickedDate);
    setSelectedDateEvents(dayEvents);
    setModalOpen(true);
  };

  // Handle event click
  const handleSelectEvent = (event) => {
    const eventDate = moment(event.start).startOf('day');
    const dayEvents = events.filter(e => {
      const eStart = moment(e.start).startOf('day');
      return eStart.isSame(eventDate, 'day');
    });

    setSelectedDate(eventDate);
    setSelectedDateEvents(dayEvents);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedDate(null);
    setSelectedDateEvents([]);
  };

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

  // Enhanced height for the main calendar (month view)
  const mainCalendarHeight = 500;

  // Custom calendar styles
  const calendarStyle = {
    height: '100%',
    fontFamily: 'Inter, sans-serif',
  };

  // Custom event style function
  const eventStyleGetter = (event, start, end, isSelected) => {
    return {
      style: {
        backgroundColor: 'var(--accent)',
        borderRadius: '6px',
        opacity: 0.9,
        color: 'white',
        border: 'none',
        fontSize: '0.85rem',
        fontWeight: '500',
        padding: '2px 6px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }
    };
  };

  return (
    <Card 
      className={`card ${transparentBackground ? 'transparent-card' : ''}`}
      sx={{ 
        width: '100%', 
        maxWidth: '800px', // Increased from default
        minWidth: '600px', // Ensure minimum width
        margin: '0 auto' // Center the card
      }}
    >
      <Typography 
        variant="h6" 
        gutterBottom 
        sx={{ 
          fontWeight: 600,
          fontSize: '1.25rem',
          marginBottom: '1rem',
          color: 'var(--text-color)'
        }}
      >
        Calendar
      </Typography>
      
      {loading && (
        <Typography sx={{ color: 'var(--text-color)', textAlign: 'center', py: 2 }}>
          Loading events...
        </Typography>
      )}
      
      {error && (
        <Typography 
          color="error" 
          sx={{ 
            textAlign: 'center', 
            py: 2,
            backgroundColor: 'rgba(255, 0, 0, 0.1)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px'
          }}
        >
          {error}
        </Typography>
      )}
      
      {!loading && !error && (
        <>
          {/* Enhanced Main Calendar (Month View) */}
          <Box 
            sx={{ 
              height: mainCalendarHeight,
              marginBottom: '2rem',
              '& .rbc-calendar': {
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1px solid var(--card-border)',
                backgroundColor: 'transparent',
              },
              '& .rbc-toolbar': {
                backgroundColor: 'var(--card-bg)',
                borderBottom: '1px solid var(--card-border)',
                padding: '12px 16px',
                marginBottom: 0,
              },
              '& .rbc-toolbar button': {
                color: 'var(--text-color)',
                border: '1px solid var(--card-border)',
                borderRadius: '6px',
                padding: '6px 12px',
                backgroundColor: 'transparent',
                fontSize: '0.875rem',
                fontWeight: '500',
                transition: 'all 0.2s ease',
              },
              '& .rbc-toolbar button:hover': {
                backgroundColor: 'var(--accent)',
                borderColor: 'var(--accent)',
                color: 'white',
              },
              '& .rbc-toolbar button.rbc-active': {
                backgroundColor: 'var(--accent)',
                borderColor: 'var(--accent)',
                color: 'white',
              },
              '& .rbc-toolbar-label': {
                color: 'var(--text-color)',
                fontSize: '1.1rem',
                fontWeight: '600',
              },
              '& .rbc-header': {
                backgroundColor: 'transparent',
                borderBottom: '1px solid var(--card-border)',
                padding: '12px 8px',
                color: 'var(--text-color)',
                fontSize: '0.875rem',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              },
              '& .rbc-day-bg': {
                border: 'none',
                borderRight: '1px solid var(--card-border)',
                borderBottom: '1px solid var(--card-border)',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
              },
              '& .rbc-day-bg:hover': {
                backgroundColor: 'rgba(var(--accent-rgb), 0.05)',
              },
              '& .rbc-date-cell': {
                padding: '8px',
                color: 'var(--text-color)',
                fontSize: '0.875rem',
                fontWeight: '500',
              },
              '& .rbc-today': {
                backgroundColor: 'rgba(var(--accent-rgb), 0.1)',
              },
              '& .rbc-off-range-bg': {
                backgroundColor: 'rgba(var(--text-color-rgb), 0.02)',
              },
              '& .rbc-off-range .rbc-date-cell': {
                color: 'rgba(var(--text-color-rgb), 0.4)',
              },
              '& .rbc-event': {
                borderRadius: '6px',
                border: 'none',
                fontSize: '0.75rem',
                fontWeight: '500',
                padding: '2px 6px',
                cursor: 'pointer',
              },
              '& .rbc-month-view': {
                border: 'none',
                backgroundColor: 'transparent',
              },
            }}
          >
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              style={calendarStyle}
              views={['month']} // Only show month view
              defaultView="month"
              className="modern-calendar"
              components={{
                header: CustomDayHeader,
              }}
              eventPropGetter={eventStyleGetter}
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectEvent}
              selectable={true}
            />
          </Box>

          {/* Upcoming Events List (Next 7 Days) */}
          <Box 
            sx={{ 
              borderTop: '1px solid var(--card-border)',
              paddingTop: '1.5rem'
            }}
          >
            <Typography 
              variant="h6" 
              gutterBottom
              sx={{ 
                fontSize: '1.1rem',
                fontWeight: '600',
                color: 'var(--text-color)',
                marginBottom: '1rem'
              }}
            >
              Upcoming Events (Next 7 Days)
            </Typography>
            
            {Object.keys(groupedUpcomingEvents).length === 0 ? (
              <Typography 
                variant="body2" 
                sx={{ 
                  color: 'rgba(var(--text-color-rgb), 0.6)',
                  textAlign: 'center',
                  padding: '2rem',
                  fontStyle: 'italic'
                }}
              >
                No upcoming events in the next 7 days.
              </Typography>
            ) : (
              <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
                <List dense sx={{ padding: 0 }}>
                  {Object.keys(groupedUpcomingEvents).map(dateKey => (
                    <React.Fragment key={dateKey}>
                      <ListItem sx={{ paddingLeft: 0, paddingRight: 0 }}>
                        <ListItemText
                          primary={moment(dateKey).format('dddd, MMMM Do')}
                          primaryTypographyProps={{ 
                            fontWeight: '600', 
                            color: 'var(--text-color)',
                            fontSize: '0.95rem'
                          }}
                        />
                      </ListItem>
                      {groupedUpcomingEvents[dateKey].map((event, index) => (
                        <ListItem 
                          key={event.title + index} 
                          sx={{ 
                            paddingLeft: '2rem',
                            paddingRight: 0,
                            paddingTop: '4px',
                            paddingBottom: '4px'
                          }}
                        >
                          <ListItemText
                            primary={`${moment(event.start).format('h:mm A')} - ${event.title}`}
                            secondary={event.description || event.location}
                            primaryTypographyProps={{ 
                              color: 'var(--text-color)',
                              fontSize: '0.875rem'
                            }}
                            secondaryTypographyProps={{ 
                              color: 'rgba(var(--text-color-rgb), 0.7)',
                              fontSize: '0.8rem'
                            }}
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

      {/* Day Detail Modal */}
      <Dialog 
        open={modalOpen} 
        onClose={handleCloseModal}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: '16px',
            backdropFilter: 'var(--backdrop-blur)',
          }
        }}
      >
        <DialogTitle 
          sx={{ 
            color: 'var(--text-color)',
            fontSize: '1.25rem',
            fontWeight: '600',
            paddingBottom: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          {selectedDate && selectedDate.format('dddd, MMMM Do, YYYY')}
          <IconButton 
            onClick={handleCloseModal}
            sx={{ 
              color: 'var(--text-color)',
              '&:hover': {
                backgroundColor: 'rgba(var(--text-color-rgb), 0.1)'
              }
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent sx={{ paddingTop: '8px' }}>
          {selectedDateEvents.length === 0 ? (
            <Typography 
              sx={{ 
                color: 'rgba(var(--text-color-rgb), 0.6)',
                textAlign: 'center',
                padding: '2rem',
                fontStyle: 'italic'
              }}
            >
              No events scheduled for this day.
            </Typography>
          ) : (
            <List sx={{ padding: 0 }}>
              {selectedDateEvents.map((event, index) => (
                <ListItem 
                  key={index}
                  sx={{ 
                    paddingLeft: 0,
                    paddingRight: 0,
                    marginBottom: '12px',
                    backgroundColor: 'rgba(var(--accent-rgb), 0.05)',
                    borderRadius: '8px',
                    border: '1px solid rgba(var(--accent-rgb), 0.2)'
                  }}
                >
                  <ListItemText
                    primary={event.title}
                    secondary={
                      <Box>
                        <Typography variant="body2" sx={{ color: 'var(--text-color)', fontWeight: '500' }}>
                          {moment(event.start).format('h:mm A')} - {moment(event.end).format('h:mm A')}
                        </Typography>
                        {(event.resource?.description || event.resource?.location) && (
                          <Typography variant="body2" sx={{ color: 'rgba(var(--text-color-rgb), 0.7)', marginTop: '4px' }}>
                            {event.resource.description || event.resource.location}
                          </Typography>
                        )}
                      </Box>
                    }
                    primaryTypographyProps={{
                      color: 'var(--text-color)',
                      fontSize: '1rem',
                      fontWeight: '600'
                    }}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        
        <DialogActions sx={{ padding: '16px 24px' }}>
          <Button 
            onClick={handleCloseModal}
            sx={{
              color: 'var(--text-color)',
              borderColor: 'var(--card-border)',
              '&:hover': {
                backgroundColor: 'rgba(var(--text-color-rgb), 0.1)',
                borderColor: 'var(--accent)'
              }
            }}
            variant="outlined"
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default CalendarWidget;