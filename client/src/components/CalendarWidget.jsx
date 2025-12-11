import React, { useState, useEffect } from 'react';
import { Card, Typography, Box, List, ListItem, ListItemText, Dialog, DialogTitle, DialogContent, DialogActions, Button, IconButton, Popover, ToggleButton, ToggleButtonGroup, TextField, Switch, FormControlLabel, Select, MenuItem, FormControl, InputLabel, Chip, Divider, CircularProgress, Alert } from '@mui/material';
import { Settings, ViewModule, ViewWeek, ChevronLeft, ChevronRight, Add, Delete, Edit, Refresh, Remove } from '@mui/icons-material';
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
  const [displaySettings, setDisplaySettings] = useState(() => {
    const saved = localStorage.getItem('calendarDisplaySettings');
    return saved ? JSON.parse(saved) : {
      textSize: 12,
      bulletSize: 10
    };
  });
  const [showColorPicker, setShowColorPicker] = useState({ background: false, text: false });
  const [calendarSources, setCalendarSources] = useState([]);
  const [showCalendarDialog, setShowCalendarDialog] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState(null);
  const [calendarForm, setCalendarForm] = useState({
    name: '',
    type: 'ICS',
    url: '',
    username: '',
    password: '',
    color: '#6e44ff'
  });
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [savingCalendar, setSavingCalendar] = useState(false);

  useEffect(() => {
    fetchCalendarSources();
    fetchCalendarEvents();
  }, []);

  // Save event colors to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('calendarEventColors', JSON.stringify(eventColors));
  }, [eventColors]);

  // Save display settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('calendarDisplaySettings', JSON.stringify(displaySettings));

    // Also save to database
    const saveToDatabase = async () => {
      try {
        await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/settings`, {
          key: 'CALENDAR_TEXT_SIZE',
          value: displaySettings.textSize.toString()
        });
        await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/settings`, {
          key: 'CALENDAR_BULLET_SIZE',
          value: displaySettings.bulletSize.toString()
        });
      } catch (error) {
        console.error('Error saving display settings to database:', error);
      }
    };

    const timeoutId = setTimeout(saveToDatabase, 500);
    return () => clearTimeout(timeoutId);
  }, [displaySettings]);

  // Load display settings from database on mount
  useEffect(() => {
    const loadDisplaySettings = async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/settings`);
        const settings = response.data;

        if (settings.CALENDAR_TEXT_SIZE || settings.CALENDAR_BULLET_SIZE) {
          setDisplaySettings({
            textSize: settings.CALENDAR_TEXT_SIZE ? parseInt(settings.CALENDAR_TEXT_SIZE) : 12,
            bulletSize: settings.CALENDAR_BULLET_SIZE ? parseInt(settings.CALENDAR_BULLET_SIZE) : 10
          });
        }
      } catch (error) {
        console.error('Error loading display settings from database:', error);
      }
    };

    loadDisplaySettings();
  }, []);

  const fetchCalendarSources = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/calendar-sources`);
      setCalendarSources(response.data);
    } catch (error) {
      console.error('Error fetching calendar sources:', error);
    }
  };
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
          location: event.location || '',
          source_id: event.source_id,
          source_name: event.source_name,
          source_color: event.source_color
        }));

        setEvents(formattedEvents);

        // Get upcoming events for the next 7 days
        const now = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(now.getDate() + 7);

        const upcoming = formattedEvents
          .filter(event => event.start >= now && event.start <= nextWeek)
          .sort((a, b) => a.start - b.start)
          .slice(0, 5);

        setUpcomingEvents(upcoming);
      } else {
        setEvents([]);
        setUpcomingEvents([]);
      }
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      setError('Failed to load calendar events. Please configure calendars in settings.');
      setEvents([]);
      setUpcomingEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCalendar = () => {
    setEditingCalendar(null);
    setCalendarForm({
      name: '',
      type: 'ICS',
      url: '',
      username: '',
      password: '',
      color: '#6e44ff'
    });
    setTestResult(null);
    setShowCalendarDialog(true);
  };

  const handleEditCalendar = (calendar) => {
    setEditingCalendar(calendar);
    setCalendarForm({
      name: calendar.name,
      type: calendar.type,
      url: calendar.url,
      username: calendar.username || '',
      password: '',
      color: calendar.color
    });
    setTestResult(null);
    setShowCalendarDialog(true);
  };

  const handleToggleCalendar = async (calendarId, enabled) => {
    try {
      await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/calendar-sources/${calendarId}`, {
        enabled: !enabled
      });
      await fetchCalendarSources();
      await fetchCalendarEvents();
    } catch (error) {
      console.error('Error toggling calendar:', error);
    }
  };

  const handleDeleteCalendar = async (calendarId) => {
    if (window.confirm('Are you sure you want to delete this calendar?')) {
      try {
        await axios.delete(`${import.meta.env.VITE_REACT_APP_API_URL}/api/calendar-sources/${calendarId}`);
        await fetchCalendarSources();
        await fetchCalendarEvents();
      } catch (error) {
        console.error('Error deleting calendar:', error);
      }
    }
  };

  const handleTestConnection = async () => {
    if (editingCalendar) {
      setTestingConnection(true);
      try {
        const response = await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/calendar-sources/${editingCalendar.id}/test`);
        setTestResult({ success: true, message: response.data.message });
      } catch (error) {
        setTestResult({ success: false, message: error.response?.data?.error || 'Connection failed' });
      } finally {
        setTestingConnection(false);
      }
    } else {
      setTestResult({ success: false, message: 'Please save the calendar before testing' });
    }
  };

  const handleSaveCalendar = async () => {
    setSavingCalendar(true);
    try {
      if (editingCalendar) {
        await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/calendar-sources/${editingCalendar.id}`, calendarForm);
      } else {
        await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/calendar-sources`, calendarForm);
      }
      await fetchCalendarSources();
      await fetchCalendarEvents();
      setShowCalendarDialog(false);
    } catch (error) {
      console.error('Error saving calendar:', error);
      alert('Failed to save calendar. Please try again.');
    } finally {
      setSavingCalendar(false);
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

  // Add current week class to the appropriate row
  useEffect(() => {
    const highlightCurrentWeek = () => {
      const today = new Date();
      const rows = document.querySelectorAll('.rbc-month-row');

      rows.forEach(row => {
        row.classList.remove('rbc-current-week');
        const dateCells = row.querySelectorAll('.rbc-date-cell');
        dateCells.forEach(cell => {
          const dateElement = cell.querySelector('button');
          if (dateElement) {
            const dateText = dateElement.textContent;
            const date = new Date(currentDate);
            date.setDate(parseInt(dateText));

            if (moment(date).isSame(today, 'week') && moment(date).isSame(currentDate, 'month')) {
              row.classList.add('rbc-current-week');
            }
          }
        });
      });
    };

    const timer = setTimeout(highlightCurrentWeek, 100);
    return () => clearTimeout(timer);
  }, [currentDate, events]);

  const getNext7Days = () => {
    const days = [];
    const startDate = new Date(currentDate); // Use currentDate instead of today for pagination
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      
      const dayEvents = events.filter(event => 
        moment(event.start).isSame(moment(date), 'day')
      );
      
      days.push({
        date: date,
        dayName: moment(date).format('ddd'),
        dayNumber: moment(date).format('D'),
        monthName: moment(date).format('MMM'),
        isToday: moment(date).isSame(moment(new Date()), 'day'), // Compare with actual today
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

  const handlePreviousPeriod = () => {
    if (viewMode === 'month') {
      // Go to previous month
      const newDate = new Date(currentDate);
      newDate.setMonth(newDate.getMonth() - 1);
      setCurrentDate(newDate);
    } else {
      // Go to previous week (7 days back)
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() - 7);
      setCurrentDate(newDate);
    }
  };

  const handleNextPeriod = () => {
    if (viewMode === 'month') {
      // Go to next month
      const newDate = new Date(currentDate);
      newDate.setMonth(newDate.getMonth() + 1);
      setCurrentDate(newDate);
    } else {
      // Go to next week (7 days forward)
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + 7);
      setCurrentDate(newDate);
    }
  };

  const getCurrentPeriodLabel = () => {
    if (viewMode === 'month') {
      return moment(currentDate).format('MMMM YYYY');
    } else {
      // For week view, show the date range
      const startOfWeek = moment(currentDate);
      const endOfWeek = moment(currentDate).add(6, 'days');
      
      if (startOfWeek.month() === endOfWeek.month()) {
        // Same month: "Dec 15-21, 2024"
        return `${startOfWeek.format('MMM D')}-${endOfWeek.format('D, YYYY')}`;
      } else {
        // Different months: "Dec 30 - Jan 5, 2024"
        return `${startOfWeek.format('MMM D')} - ${endOfWeek.format('MMM D, YYYY')}`;
      }
    }
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton
            onClick={handlePreviousPeriod}
            size="small"
            sx={{ color: 'var(--text-color)' }}
            aria-label="Previous period"
          >
            <ChevronLeft />
          </IconButton>
          <Typography variant="h6" sx={{ minWidth: '200px', textAlign: 'center' }}>
            📅 {getCurrentPeriodLabel()}
          </Typography>
          <IconButton
            onClick={handleNextPeriod}
            size="small"
            sx={{ color: 'var(--text-color)' }}
            aria-label="Next period"
          >
            <ChevronRight />
          </IconButton>
        </Box>
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
        <Box sx={{ height: 500, display: 'flex', flexDirection: 'column' }}>
          {/* Day headers */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, mb: 1 }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <Box key={day} sx={{ textAlign: 'center', fontWeight: 'bold', py: 1 }}>
                <Typography variant="caption">{day}</Typography>
              </Box>
            ))}
          </Box>

          {/* Calendar grid */}
          {(() => {
            const monthStart = moment(currentDate).startOf('month');
            const monthEnd = moment(currentDate).endOf('month');
            const startDate = moment(monthStart).startOf('week');
            const endDate = moment(monthEnd).endOf('week');

            const totalDays = endDate.diff(startDate, 'days') + 1;
            const numWeeks = Math.ceil(totalDays / 7);

            const days = [];
            let day = startDate.clone();

            while (day.isSameOrBefore(endDate, 'day')) {
              const dayEvents = events.filter(event =>
                moment(event.start).isSame(day, 'day')
              );

              const isCurrentMonth = day.month() === moment(currentDate).month();
              const isToday = day.isSame(moment(), 'day');
              const dayClone = day.clone();

              days.push(
                <Box
                  key={day.format('YYYY-MM-DD')}
                  onClick={() => handleSelectSlot({ start: dayClone.toDate() })}
                  sx={{
                    border: '1px solid var(--card-border)',
                    borderRadius: 1,
                    p: 1,
                    cursor: 'pointer',
                    bgcolor: isToday ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                    opacity: isCurrentMonth ? 1 : 0.4,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                    overflow: 'hidden',
                    '&:hover': {
                      bgcolor: isToday ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(0, 0, 0, 0.05)'
                    }
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 'bold',
                      color: isToday ? 'var(--accent)' : 'inherit',
                      mb: 0.5,
                      textAlign: 'center'
                    }}
                  >
                    {day.format('D')}
                  </Typography>

                  <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    {dayEvents.slice(0, 3).map((event, eventIndex) => (
                      <Box
                        key={eventIndex}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectEvent(event);
                        }}
                        sx={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 0.5,
                          mb: 0.5,
                          p: 0.3,
                          borderRadius: 0.5,
                          '&:hover': {
                            bgcolor: 'rgba(0, 0, 0, 0.05)'
                          }
                        }}
                      >
                        <Box
                          sx={{
                            width: displaySettings.bulletSize,
                            height: displaySettings.bulletSize,
                            minWidth: displaySettings.bulletSize,
                            minHeight: displaySettings.bulletSize,
                            borderRadius: '50%',
                            backgroundColor: event.source_color || eventColors.backgroundColor,
                            mt: displaySettings.bulletSize * 0.05
                          }}
                        />
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: `${displaySettings.textSize}px`,
                            lineHeight: 1.2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {event.title}
                        </Typography>
                      </Box>
                    ))}
                    {dayEvents.length > 3 && (
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: '0.6rem',
                          color: 'text.secondary',
                          textAlign: 'center',
                          display: 'block',
                          mt: 0.5
                        }}
                      >
                        +{dayEvents.length - 3} more
                      </Typography>
                    )}
                  </Box>
                </Box>
              );

              day.add(1, 'day');
            }

            return (
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gridTemplateRows: `repeat(${numWeeks}, 1fr)`,
                gap: 1,
                flex: 1,
                minHeight: 0
              }}>
                {days}
              </Box>
            );
          })()}
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
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 0.5,
                          minHeight: '36px',
                          '&:hover': {
                            backgroundColor: 'rgba(0, 0, 0, 0.05)'
                          }
                        }}
                      >
                        <Box
                          sx={{
                            width: displaySettings.bulletSize,
                            height: displaySettings.bulletSize,
                            minWidth: displaySettings.bulletSize,
                            minHeight: displaySettings.bulletSize,
                            borderRadius: '50%',
                            backgroundColor: event.source_color || eventColors.backgroundColor,
                            mt: displaySettings.bulletSize * 0.0625
                          }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', fontSize: `${displaySettings.textSize}px` }}>
                            {moment(event.start).format('h:mm A')}
                          </Typography>
                          <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.2, fontSize: `${displaySettings.textSize}px` }}>
                            {event.title}
                          </Typography>
                        </Box>
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
        <Box sx={{ p: 3, minWidth: 350, maxHeight: '80vh', overflowY: 'auto' }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Calendar Sources</Typography>

          <Box sx={{ mb: 3 }}>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleAddCalendar}
              fullWidth
              sx={{ mb: 2 }}
            >
              Add Calendar
            </Button>

            {calendarSources.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                No calendars configured
              </Typography>
            ) : (
              <List sx={{ maxHeight: 300, overflowY: 'auto' }}>
                {calendarSources.map((calendar) => (
                  <ListItem
                    key={calendar.id}
                    sx={{
                      border: '1px solid var(--card-border)',
                      borderRadius: 1,
                      mb: 1,
                      p: 1,
                      flexDirection: 'column',
                      alignItems: 'flex-start'
                    }}
                  >
                    <Box sx={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                        <Box
                          sx={{
                            width: 16,
                            height: 16,
                            backgroundColor: calendar.color,
                            borderRadius: '50%',
                            border: '1px solid var(--card-border)'
                          }}
                        />
                        <Typography variant="body2" sx={{ fontWeight: 'bold', flex: 1 }}>
                          {calendar.name}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Switch
                          size="small"
                          checked={Boolean(calendar.enabled)}
                          onChange={() => handleToggleCalendar(calendar.id, calendar.enabled)}
                        />
                        <IconButton
                          size="small"
                          onClick={() => handleEditCalendar(calendar)}
                        >
                          <Edit fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteCalendar(calendar.id)}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Chip label={calendar.type} size="small" variant="outlined" />
                      <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {calendar.url}
                      </Typography>
                    </Box>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="h6" sx={{ mb: 2 }}>Default Event Colors</Typography>
          
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

          <Divider sx={{ my: 3 }} />

          <Typography variant="h6" sx={{ mb: 2 }}>Display Settings</Typography>

          {/* Text Size Control */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Event Text Size</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton
                size="small"
                onClick={() => setDisplaySettings(prev => ({
                  ...prev,
                  textSize: Math.max(8, prev.textSize - 1)
                }))}
                disabled={displaySettings.textSize <= 8}
              >
                <Remove />
              </IconButton>
              <TextField
                type="number"
                value={displaySettings.textSize}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 8;
                  setDisplaySettings(prev => ({
                    ...prev,
                    textSize: Math.min(24, Math.max(8, value))
                  }));
                }}
                inputProps={{ min: 8, max: 24 }}
                sx={{ width: 100 }}
                size="small"
              />
              <Typography variant="body2" sx={{ minWidth: 30 }}>px</Typography>
              <IconButton
                size="small"
                onClick={() => setDisplaySettings(prev => ({
                  ...prev,
                  textSize: Math.min(24, prev.textSize + 1)
                }))}
                disabled={displaySettings.textSize >= 24}
              >
                <Add />
              </IconButton>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Range: 8-24 px
            </Typography>
          </Box>

          {/* Bullet Size Control */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Event Bullet Size</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton
                size="small"
                onClick={() => setDisplaySettings(prev => ({
                  ...prev,
                  bulletSize: Math.max(4, prev.bulletSize - 1)
                }))}
                disabled={displaySettings.bulletSize <= 4}
              >
                <Remove />
              </IconButton>
              <TextField
                type="number"
                value={displaySettings.bulletSize}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 4;
                  setDisplaySettings(prev => ({
                    ...prev,
                    bulletSize: Math.min(20, Math.max(4, value))
                  }));
                }}
                inputProps={{ min: 4, max: 20 }}
                sx={{ width: 100 }}
                size="small"
              />
              <Typography variant="body2" sx={{ minWidth: 30 }}>px</Typography>
              <IconButton
                size="small"
                onClick={() => setDisplaySettings(prev => ({
                  ...prev,
                  bulletSize: Math.min(20, prev.bulletSize + 1)
                }))}
                disabled={displaySettings.bulletSize >= 20}
              >
                <Add />
              </IconButton>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Range: 4-20 px
            </Typography>
          </Box>

          <Button
            variant="outlined"
            fullWidth
            onClick={() => {
              setDisplaySettings({ textSize: 12, bulletSize: 10 });
            }}
            sx={{ mt: 1 }}
          >
            Reset Display Settings
          </Button>
        </Box>
      </Popover>

      {/* Calendar Dialog */}
      <Dialog
        open={showCalendarDialog}
        onClose={() => setShowCalendarDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingCalendar ? 'Edit Calendar' : 'Add Calendar'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Calendar Name"
              value={calendarForm.name}
              onChange={(e) => setCalendarForm({ ...calendarForm, name: e.target.value })}
              sx={{ mb: 2 }}
              required
            />

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Calendar Type</InputLabel>
              <Select
                value={calendarForm.type}
                label="Calendar Type"
                onChange={(e) => setCalendarForm({ ...calendarForm, type: e.target.value })}
              >
                <MenuItem value="ICS">ICS (Public Calendar Link)</MenuItem>
                <MenuItem value="CalDAV">CalDAV (Private Server)</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="Calendar URL"
              value={calendarForm.url}
              onChange={(e) => setCalendarForm({ ...calendarForm, url: e.target.value })}
              sx={{ mb: 2 }}
              required
              placeholder={calendarForm.type === 'CalDAV' ? 'https://caldav.example.com/calendar/' : 'https://calendar.google.com/calendar/ical/...'}
            />

            {calendarForm.type === 'CalDAV' && (
              <>
                <TextField
                  fullWidth
                  label="Username"
                  value={calendarForm.username}
                  onChange={(e) => setCalendarForm({ ...calendarForm, username: e.target.value })}
                  sx={{ mb: 2 }}
                  required
                />

                <TextField
                  fullWidth
                  label="Password"
                  type="password"
                  value={calendarForm.password}
                  onChange={(e) => setCalendarForm({ ...calendarForm, password: e.target.value })}
                  sx={{ mb: 2 }}
                  required={!editingCalendar}
                  placeholder={editingCalendar ? 'Leave blank to keep current password' : ''}
                />
              </>
            )}

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Calendar Color</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    backgroundColor: calendarForm.color,
                    border: '1px solid var(--card-border)',
                    borderRadius: 1,
                    cursor: 'pointer'
                  }}
                  onClick={() => setShowColorPicker({ ...showColorPicker, calendar: !showColorPicker.calendar })}
                />
                <TextField
                  size="small"
                  value={calendarForm.color}
                  onChange={(e) => setCalendarForm({ ...calendarForm, color: e.target.value })}
                  sx={{ flex: 1 }}
                />
              </Box>
              {showColorPicker.calendar && (
                <Box sx={{ position: 'absolute', zIndex: 1000, mt: 1 }}>
                  <Box
                    sx={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}
                    onClick={() => setShowColorPicker({ ...showColorPicker, calendar: false })}
                  />
                  <ChromePicker
                    color={calendarForm.color}
                    onChange={(color) => setCalendarForm({ ...calendarForm, color: color.hex })}
                  />
                </Box>
              )}
            </Box>

            {editingCalendar && (
              <Button
                variant="outlined"
                onClick={handleTestConnection}
                disabled={testingConnection}
                fullWidth
                sx={{ mb: 2 }}
              >
                {testingConnection ? <CircularProgress size={20} /> : 'Test Connection'}
              </Button>
            )}

            {testResult && (
              <Alert severity={testResult.success ? 'success' : 'error'} sx={{ mb: 2 }}>
                {testResult.message}
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCalendarDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveCalendar}
            disabled={!calendarForm.name || !calendarForm.url || savingCalendar}
          >
            {savingCalendar ? <CircularProgress size={20} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default CalendarWidget;