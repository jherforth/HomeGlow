import React, { useState, useEffect } from 'react';
import { Card, Typography, Box, List, ListItem, ListItemText } from '@mui/material';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import axios from 'axios';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = momentLocalizer(moment);

const CalendarWidget = ({ transparentBackground, icsCalendarUrl }) => {
  const [events, setEvents] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    const fetchEvents = async () => {
      if (!icsCalendarUrl) {
        console.log('No ICS calendar URL provided');
        return;
      }

      try {
        const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/calendar-events`);
        const fetchedEvents = response.data.map(event => ({
          id: event.id || Math.random(),
          title: event.title || event.summary,
          start: new Date(event.start),
          end: new Date(event.end),
          description: event.description,
          location: event.location,
        }));
        
        setEvents(fetchedEvents);
        
        // Filter upcoming events (next 7 days)
        const now = new Date();
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const upcoming = fetchedEvents
          .filter(event => event.start >= now && event.start <= nextWeek)
          .sort((a, b) => a.start - b.start)
          .slice(0, 10); // Limit to 10 events that fit in the height
        
        setUpcomingEvents(upcoming);
      } catch (error) {
        console.error('Error fetching calendar events:', error);
      }
    };

    fetchEvents();
  }, [icsCalendarUrl]);

  const formatEventTime = (date) => {
    return moment(date).format('MMM DD, h:mm A');
  };

  const getDayOfWeek = () => {
    return moment().format('dddd');
  };

  return (
    <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`} sx={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
        📅 Calendar
      </Typography>
      
      <Box sx={{ display: 'flex', height: '100%', gap: 2 }}>
        {/* Left Column - Calendar (2/3 width) */}
        <Box sx={{ flex: 2, minHeight: 0 }}>
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%', fontSize: '0.8rem' }}
            views={['month']}
            defaultView="month"
            date={currentDate}
            onNavigate={setCurrentDate}
            className="custom-calendar"
            dayPropGetter={(date) => {
              const today = moment().format('dddd').toLowerCase();
              const dayName = moment(date).format('dddd').toLowerCase();
              
              if (dayName === today) {
                return {
                  className: 'rbc-current-day-header',
                };
              }
              return {};
            }}
            eventPropGetter={() => ({
              style: {
                backgroundColor: 'var(--accent)',
                borderRadius: '4px',
                border: 'none',
                color: 'white',
                fontSize: '0.75rem',
                padding: '2px 4px',
              },
            })}
            components={{
              toolbar: ({ label, onNavigate }) => (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, p: 1 }}>
                  <button onClick={() => onNavigate('PREV')} style={{ fontSize: '0.8rem', padding: '4px 8px' }}>‹</button>
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>{label}</Typography>
                  <button onClick={() => onNavigate('NEXT')} style={{ fontSize: '0.8rem', padding: '4px 8px' }}>›</button>
                </Box>
              ),
            }}
          />
        </Box>

        {/* Right Column - Upcoming Events (1/3 width) */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold', color: 'var(--accent)' }}>
            Upcoming Events (Next 7 Days)
          </Typography>
          
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            {upcomingEvents.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', textAlign: 'center', mt: 4 }}>
                No upcoming events
              </Typography>
            ) : (
              <List sx={{ p: 0, overflow: 'auto', height: '100%' }}>
                {upcomingEvents.map((event, index) => (
                  <ListItem key={event.id || index} sx={{ px: 0, py: 0.5, borderBottom: '1px solid var(--card-border)' }}>
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: '0.85rem', lineHeight: 1.2 }}>
                          {event.title}
                        </Typography>
                      }
                      secondary={
                        <Box>
                          <Typography variant="caption" sx={{ color: 'var(--accent)', fontSize: '0.75rem' }}>
                            {formatEventTime(event.start)}
                          </Typography>
                          {event.location && (
                            <Typography variant="caption" sx={{ display: 'block', fontSize: '0.7rem', opacity: 0.7 }}>
                              📍 {event.location}
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
      </Box>
    </Card>
  );
};

export default CalendarWidget;