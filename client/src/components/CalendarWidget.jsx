import React, { useState, useEffect } from 'react';
import { Card, Typography, Box, List, ListItem, ListItemText, Dialog, DialogTitle, DialogContent, DialogActions, Button, IconButton, Popover, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { Settings, ViewModule, ViewWeek } from '@mui/icons-material';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import { ChromePicker } from 'react-color';
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
  const [settingsAnchor, setSettingsAnchor] = useState(null);
  const [viewMode, setViewMode] = useState('month'); // 'month' or 'week'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [eventColors, setEventColors] = useState(() => {
    const saved = localStorage.getItem('calendarEventColors');
    return saved ? JSON.parse(saved) : {
      backgroundColor: '#6e44ff',
      textColor: '#ffffff'
    };
  });
  const [showColorPicker, setShowColorPicker] = useState({ background: false, text: false });

  useEffect(() => {
    if (!icsCalendarUrl) {
      console.log('No ICS calendar URL provided');
      setError('No calendar URL configured. Please add your ICS calendar URL in the Admin Panel.');
      setLoading(false);
      return;
    }

    fetchCalendarEvents();
  }, [icsCalendarUrl]);

  // Save event colors to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('calendarEventColors', JSON.stringify(eventColors));
  }, [eventColors]);
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

  const getNext7Days = () => {
    const days = [];
    const today = new Date();
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      
      const dayEvents = events.filter(event => 
        moment(event.start).isSame(moment(date), 'day')
      );
      
      days.push({
        date: date,
        dayName: moment(date).format('ddd'),
        dayNumber: moment(date).format('D'),
        monthName: moment(date).format('MMM'),
        isToday: moment(date).isSame(moment(today), 'day'),
        events: dayEvents
      });
    }
    
    return days;
  };

  const handleSettingsClick = (event) => {
    setSettingsAnchor(event.currentTarget);
  };

  const handleSettingsClose = () => {
    setSettingsAnchor(null);
    setShowColorPicker({ background: false, text: false });
  };

  const handleColorChange = (colorType, color) => {
    setEventColors(prev => ({
      ...prev,
      [colorType === 'background' ? 'backgroundColor' : 'textColor']: color.hex
    }));
  };

  const handleViewModeChange = (event, newViewMode) => {
    if (newViewMode !== null) {
      setViewMode(newViewMode);
    }
  };

  const getCurrentMonthYear = () => {
    return moment(currentDate).format('MMMM YYYY');
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
        <Typography variant="h6">📅 Loading...</Typography>
        <Typography>Loading calendar events...</Typography>
      </Card>
    );
  }

  return (
    <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">📅 {getCurrentMonthYear()}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewModeChange}
            size="small"
          >
            <ToggleButton value="month" aria-label="month view">
              <ViewModule />
            </ToggleButton>
            <ToggleButton value="week" aria-label="week view">
              <ViewWeek />
            </ToggleButton>
          </ToggleButtonGroup>
          <IconButton
            onClick={handleSettingsClick}
            size="small"
            sx={{ color: 'var(--text-color)' }}
          >
            <Settings />
          </IconButton>
        </Box>
      </Box>
      
      {error && (
        <Box sx={{ mb: 2, p: 2, bgcolor: 'rgba(255, 0, 0, 0.1)', borderRadius: 1 }}>
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        </Box>
      )}

      {viewMode === 'month' ? (
        <Box sx={{ height: 500 }}>
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
            onNavigate={(date) => setCurrentDate(date)}
            date={currentDate}
            components={{
              month: {
                header: CustomHeader
              },
              toolbar: () => null // Hide the default toolbar since we moved month/year to title
            }}
            eventPropGetter={(event) => ({
              style: {
                backgroundColor: eventColors.backgroundColor,
                borderRadius: '4px',
                border: 'none',
                color: eventColors.textColor,
                fontSize: '0.8rem',
                cursor: 'pointer'
              }
            })}
          />
        </Box>
      ) : (
        <Box sx={{ height: 500, overflowY: 'auto' }}>
          <Box sx={{ display: 'flex', gap: 1, height: '100%' }}>
            {getNext7Days().map((day, index) => (
              <Box
                key={index}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  border: '1px solid var(--card-border)',
                  borderRadius: 1,
                  p: 1,
                  bgcolor: day.isToday ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <Box sx={{ textAlign: 'center', mb: 1, borderBottom: '1px solid var(--card-border)', pb: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 'bold', color: day.isToday ? 'var(--accent)' : 'inherit' }}>
                    {day.dayName}
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', color: day.isToday ? 'var(--accent)' : 'inherit' }}>
                    {day.dayNumber}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {day.monthName}
                  </Typography>
                </Box>
                
                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                  {day.events.length === 0 ? (
                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', mt: 2 }}>
                      No events
                    </Typography>
                  ) : (
                    day.events.map((event, eventIndex) => (
                      <Box
                        key={eventIndex}
                        onClick={() => handleSelectEvent(event)}
                        sx={{
                          p: 0.5,
                          mb: 0.5,
                          backgroundColor: eventColors.backgroundColor,
                          color: eventColors.textColor,
                          borderRadius: 1,
                          cursor: 'pointer',
                          fontSize: '0.7rem',
                          '&:hover': {
                            filter: 'brightness(1.1)'
                          }
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block' }}>
                          {moment(event.start).format('h:mm A')}
                        </Typography>
                        <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.2 }}>
                          {event.title}
                        </Typography>
                      </Box>
                    ))
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}

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

      {/* Settings Popover */}
      <Popover
        open={Boolean(settingsAnchor)}
        anchorEl={settingsAnchor}
        onClose={handleSettingsClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <Box sx={{ p: 3, minWidth: 300 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Calendar Event Colors</Typography>
          
          {/* Background Color */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Event Background Color</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  backgroundColor: eventColors.backgroundColor,
                  border: '1px solid var(--card-border)',
                  borderRadius: 1,
                  cursor: 'pointer'
                }}
                onClick={() => setShowColorPicker(prev => ({ ...prev, background: !prev.background }))}
              />
              <Typography variant="body2">{eventColors.backgroundColor}</Typography>
            </Box>
            {showColorPicker.background && (
              <Box sx={{ mt: 2 }}>
                <ChromePicker
                  color={eventColors.backgroundColor}
                  onChange={(color) => handleColorChange('background', color)}
                />
              </Box>
            )}
          </Box>

          {/* Text Color */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Event Text Color</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  backgroundColor: eventColors.textColor,
                  border: '1px solid var(--card-border)',
                  borderRadius: 1,
                  cursor: 'pointer'
                }}
                onClick={() => setShowColorPicker(prev => ({ ...prev, text: !prev.text }))}
              />
              <Typography variant="body2">{eventColors.textColor}</Typography>
            </Box>
            {showColorPicker.text && (
              <Box sx={{ mt: 2 }}>
                <ChromePicker
                  color={eventColors.textColor}
                  onChange={(color) => handleColorChange('text', color)}
                />
              </Box>
            )}
          </Box>

          <Button
            variant="outlined"
            fullWidth
            onClick={() => {
              setEventColors({ backgroundColor: '#6e44ff', textColor: '#ffffff' });
              setShowColorPicker({ background: false, text: false });
            }}
            sx={{ mt: 2 }}
          >
            Reset to Default
          </Button>
        </Box>
      </Popover>
    </Card>
  );
};

export default CalendarWidget;