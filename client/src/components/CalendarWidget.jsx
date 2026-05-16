import React, { useState, useEffect } from 'react';
import { Card, Typography, Box, List, ListItem, ListItemText, Dialog, DialogTitle, DialogContent, DialogActions, Button, IconButton, Popover, ToggleButton, ToggleButtonGroup, TextField, Switch, FormControlLabel, Select, MenuItem, FormControl, InputLabel, Chip, Divider, CircularProgress, Alert, Tooltip } from '@mui/material';
import { Settings, ViewModule, ViewWeek, ChevronLeft, ChevronRight, Add, Delete, Edit, Refresh, Remove, Sync, Schedule } from '@mui/icons-material';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import { SketchPicker } from 'react-color';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getDeviceApiBase } from '../utils/deviceName.js';
import { getEventPillPalette, getPreferredColorMode } from '../utils/colorContrast.js';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import MonthDayCell from './MonthDayCell.jsx';

const localizer = momentLocalizer(moment);

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_OPTIONS = [
  { label: 'Sunday', value: 'sunday' },
  { label: 'Monday', value: 'monday' },
  { label: 'Tuesday', value: 'tuesday' },
  { label: 'Wednesday', value: 'wednesday' },
  { label: 'Thursday', value: 'thursday' },
  { label: 'Friday', value: 'friday' },
  { label: 'Saturday', value: 'saturday' },
];
const WEEKDAY_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const DEFAULT_MONTH_VIEW_DAYS_TO_SHOW = 28;
const DEFAULT_MONTH_VIEW_DAYS_PER_ROW = 7;
const DEFAULT_CALENDAR_EVENT_COLORS = {
  backgroundColor: '#6e44ff',
  textColor: '#ffffff',
};
const DEFAULT_CALENDAR_DISPLAY_SETTINGS = {
  textSize: 12,
  bulletSize: 10,
};
const DEFAULT_CALENDAR_DAY_OF_WEEK_SETTINGS = {
  weekViewStart: 'today',
  monthViewStart: 'sunday',
  monthViewDaysToShow: DEFAULT_MONTH_VIEW_DAYS_TO_SHOW,
  monthViewDaysPerRow: DEFAULT_MONTH_VIEW_DAYS_PER_ROW,
};

const clampInteger = (value, min, max, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
};

const TAB_CALENDAR_VIEW_MODES = new Set(['month', 'week']);

const parseTabLayoutJson = (layoutJson) => {
  if (!layoutJson) return {};
  if (typeof layoutJson === 'object' && !Array.isArray(layoutJson)) return layoutJson;
  if (typeof layoutJson !== 'string') return {};

  try {
    const parsed = JSON.parse(layoutJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const readCalendarViewModeFromLayoutJson = (layoutJson) => {
  const layoutMap = parseTabLayoutJson(layoutJson);
  const calendarEntry = layoutMap.calendar;
  const candidateViewMode = calendarEntry && typeof calendarEntry === 'object' ? calendarEntry.viewMode : null;
  return TAB_CALENDAR_VIEW_MODES.has(candidateViewMode) ? candidateViewMode : null;
};

const CalendarWidget = ({
  transparentBackground,
  icsCalendarUrl,
  refreshInterval = 0,
  activeTab = 1,
  activeTabLayoutJson = null,
}) => {
  const API_DEVICE_URL = getDeviceApiBase(API_BASE_URL);
  const [events, setEvents] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDateEvents, setSelectedDateEvents] = useState([]);
  const [showDayModal, setShowDayModal] = useState(false);
  const [settingsAnchor, setSettingsAnchor] = useState(null);
  const [viewMode, setViewMode] = useState('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [eventColors, setEventColors] = useState({ ...DEFAULT_CALENDAR_EVENT_COLORS });
  const [displaySettings, setDisplaySettings] = useState({ ...DEFAULT_CALENDAR_DISPLAY_SETTINGS });
  const [dayOfWeekSettings, setDayOfWeekSettings] = useState({ ...DEFAULT_CALENDAR_DAY_OF_WEEK_SETTINGS });
  const [calendarSettingsLoaded, setCalendarSettingsLoaded] = useState(false);
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
  const [calendarFormError, setCalendarFormError] = useState('');
  const [googleCalendars, setGoogleCalendars] = useState([]);
  const [googleCalendarsLoading, setGoogleCalendarsLoading] = useState(false);
  const [googleCalendarsError, setGoogleCalendarsError] = useState('');
  const [googleAccountConnected, setGoogleAccountConnected] = useState(false);
  const [eventDialog, setEventDialog] = useState({ open: false, mode: 'create', event: null, sourceId: '' });
  const [eventForm, setEventForm] = useState({ title: '', description: '', location: '', all_day: false, start: '', end: '' });
  const [eventSaving, setEventSaving] = useState(false);
  const [eventError, setEventError] = useState('');
  const [syncStatus, setSyncStatus] = useState({});
  const [syncIntervals, setSyncIntervals] = useState({});
  const [isSyncing, setIsSyncing] = useState({});
  const monthViewDaysToShow = clampInteger(dayOfWeekSettings.monthViewDaysToShow, 1, 32, DEFAULT_MONTH_VIEW_DAYS_TO_SHOW);
  const monthViewDaysPerRow = clampInteger(dayOfWeekSettings.monthViewDaysPerRow, 1, 14, DEFAULT_MONTH_VIEW_DAYS_PER_ROW);
  const isRollingMonthView = dayOfWeekSettings.monthViewStart === 'today' || dayOfWeekSettings.monthViewStart === 'yesterday';

  const syncIntervalOptions = [
    { label: 'Disabled', value: 0 },
    { label: '5 minutes', value: 5 },
    { label: '15 minutes', value: 15 },
    { label: '30 minutes', value: 30 },
    { label: '1 hour', value: 60 },
    { label: '2 hours', value: 120 },
    { label: '6 hours', value: 360 },
    { label: '12 hours', value: 720 },
    { label: '24 hours', value: 1440 }
  ];

  // Initial data fetch
  useEffect(() => {
    fetchCalendarSources();
    fetchCalendarEvents();
    fetchSyncStatus();
  }, []);

  // Auto-refresh functionality
  useEffect(() => {
    if (refreshInterval > 0) {
      console.log(`CalendarWidget: Auto-refresh enabled (${refreshInterval}ms)`);

      const intervalId = setInterval(() => {
        console.log('CalendarWidget: Auto-refreshing data...');
        fetchCalendarSources();
        fetchCalendarEvents();
      }, refreshInterval);

      return () => {
        console.log('CalendarWidget: Clearing auto-refresh interval');
        clearInterval(intervalId);
      };
    }
  }, [refreshInterval]);

  useEffect(() => {
    const loadCalendarWidgetSettings = async () => {
      try {
        const response = await axios.get(`${API_DEVICE_URL}/settings`);
        const settings = response.data?.calendarWidgetSettings;
        if (!settings || typeof settings !== 'object') {
          setCalendarSettingsLoaded(true);
          return;
        }

        if (settings.eventColors && typeof settings.eventColors === 'object') {
          setEventColors({
            ...DEFAULT_CALENDAR_EVENT_COLORS,
            ...settings.eventColors,
          });
        }

        if (settings.displaySettings && typeof settings.displaySettings === 'object') {
          setDisplaySettings({
            ...DEFAULT_CALENDAR_DISPLAY_SETTINGS,
            ...settings.displaySettings,
          });
        }

        if (settings.dayOfWeekSettings && typeof settings.dayOfWeekSettings === 'object') {
          setDayOfWeekSettings({
            ...DEFAULT_CALENDAR_DAY_OF_WEEK_SETTINGS,
            ...settings.dayOfWeekSettings,
            monthViewDaysToShow: clampInteger(settings.dayOfWeekSettings.monthViewDaysToShow, 1, 32, DEFAULT_MONTH_VIEW_DAYS_TO_SHOW),
            monthViewDaysPerRow: clampInteger(settings.dayOfWeekSettings.monthViewDaysPerRow, 1, 14, DEFAULT_MONTH_VIEW_DAYS_PER_ROW),
          });
        }
      } catch (error) {
        console.error('Error loading calendar widget settings:', error);
      } finally {
        setCalendarSettingsLoaded(true);
      }
    };

    void loadCalendarWidgetSettings();
  }, [API_DEVICE_URL]);

  useEffect(() => {
    if (!calendarSettingsLoaded) {
      return;
    }

    const persistCalendarWidgetSettings = async () => {
      try {
        await axios.patch(`${API_DEVICE_URL}/settings`, {
          calendarWidgetSettings: {
            eventColors,
            displaySettings,
            dayOfWeekSettings: {
              ...dayOfWeekSettings,
              monthViewDaysToShow,
              monthViewDaysPerRow,
            },
          },
        });
      } catch (error) {
        console.error('Error saving calendar widget settings:', error);
      }
    };

    const timeoutId = setTimeout(persistCalendarWidgetSettings, 300);
    return () => clearTimeout(timeoutId);
  }, [
    API_DEVICE_URL,
    calendarSettingsLoaded,
    eventColors,
    displaySettings,
    dayOfWeekSettings,
    monthViewDaysToShow,
    monthViewDaysPerRow,
  ]);

  useEffect(() => {
    const inMemoryViewMode = readCalendarViewModeFromLayoutJson(activeTabLayoutJson);
    setViewMode(inMemoryViewMode || 'month');
  }, [activeTab, activeTabLayoutJson]);

  useEffect(() => {
    let cancelled = false;

    const refreshViewModeFromTabConfig = async () => {
      try {
        const response = await axios.get(`${API_DEVICE_URL}/tabs`);
        const tabs = Array.isArray(response.data) ? response.data : [];
        const activeTabRow = tabs.find((tab) => Number(tab.number) === Number(activeTab));
        const dbViewMode = readCalendarViewModeFromLayoutJson(activeTabRow?.layout_json || null);

        if (!cancelled) {
          setViewMode(dbViewMode || 'month');
        }
      } catch {
        // Best effort only. Keep current UI mode when DB refresh fails.
      }
    };

    void refreshViewModeFromTabConfig();

    return () => {
      cancelled = true;
    };
  }, [API_DEVICE_URL, activeTab]);

  const persistViewModeForTab = async (tabNumber, nextViewMode) => {
    try {
      await axios.patch(`${API_DEVICE_URL}/widget-assignments/layout`, {
        widget_name: 'calendar',
        tabNumber,
        settings: {
          viewMode: nextViewMode,
        },
      });
    } catch (error) {
      // Non-blocking preference persistence.
      console.debug('Calendar tab view mode persistence failed:', error);
    }
  };

  const fetchCalendarSources = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/calendar-sources`);
      setCalendarSources(response.data);
    } catch (error) {
      console.error('Error fetching calendar sources:', error);
    }
  };

  const fetchSyncStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/calendar-sync/status`);
      const statusMap = {};
      const intervalsMap = {};
      if (Array.isArray(response.data)) {
        response.data.forEach(status => {
          statusMap[status.source_id] = status;
          intervalsMap[status.source_id] = status.sync_interval_minutes || 15;
        });
      }
      setSyncStatus(statusMap);
      setSyncIntervals(intervalsMap);
    } catch (error) {
      console.error('Error fetching sync status:', error);
    }
  };

  const handleSyncSource = async (sourceId) => {
    setIsSyncing(prev => ({ ...prev, [sourceId]: true }));
    try {
      await axios.post(`${API_BASE_URL}/api/calendar-sync/${sourceId}`);
      await fetchCalendarEvents();
      await fetchSyncStatus();
    } catch (error) {
      console.error('Error syncing calendar source:', error);
    } finally {
      setIsSyncing(prev => ({ ...prev, [sourceId]: false }));
    }
  };

  const handleSyncAll = async () => {
    setIsSyncing(prev => ({ ...prev, all: true }));
    try {
      await axios.post(`${API_BASE_URL}/api/calendar-sync/all`);
      await fetchCalendarEvents();
      await fetchSyncStatus();
    } catch (error) {
      console.error('Error syncing all calendar sources:', error);
    } finally {
      setIsSyncing(prev => ({ ...prev, all: false }));
    }
  };

  const handleSyncIntervalChange = async (sourceId, intervalMinutes) => {
    try {
      await axios.patch(`${API_BASE_URL}/api/calendar-sync/${sourceId}/interval`, {
        interval_minutes: intervalMinutes
      });
      setSyncIntervals(prev => ({ ...prev, [sourceId]: intervalMinutes }));
    } catch (error) {
      console.error('Error setting sync interval:', error);
    }
  };

  const formatLastSync = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return moment(date).format('MMM D, h:mm A');
  };

  const fetchCalendarEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.get(`${API_BASE_URL}/api/calendar-events`);

      if (Array.isArray(response.data)) {
        const formattedEvents = response.data.map(event => ({
          id: event.id || Math.random().toString(),
          title: event.title || event.summary || 'Untitled Event',
          start: new Date(event.start),
          end: new Date(event.end),
          description: event.description || '',
          location: event.location || '',
          all_day: event.all_day || false,
          source_id: event.source_id,
          source_name: event.source_name,
          source_color: event.source_color
        }));

        setEvents(formattedEvents);

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

  const loadGoogleCalendars = async () => {
    setGoogleCalendarsLoading(true);
    setGoogleCalendarsError('');
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/connections/google/calendars`);
      setGoogleCalendars(Array.isArray(data.calendars) ? data.calendars : []);
      setGoogleAccountConnected(true);
    } catch (err) {
      setGoogleCalendars([]);
      if (err?.response?.status === 404) {
        setGoogleAccountConnected(false);
        setGoogleCalendarsError('No Google account connected. Add one in Admin > Connections.');
      } else {
        setGoogleCalendarsError(err?.response?.data?.error || 'Failed to load Google calendars.');
      }
    } finally {
      setGoogleCalendarsLoading(false);
    }
  };

  const checkGoogleAccount = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/connections/google/status`);
      setGoogleAccountConnected(!!data?.account);
    } catch (_) {
      setGoogleAccountConnected(false);
    }
  };

  useEffect(() => {
    checkGoogleAccount();
  }, []);

  useEffect(() => {
    if (showCalendarDialog && calendarForm.type === 'Google' && googleCalendars.length === 0 && !googleCalendarsLoading) {
      loadGoogleCalendars();
    }
  }, [showCalendarDialog, calendarForm.type]);

  const handleAddCalendar = () => {
    setEditingCalendar(null);
    setCalendarFormError('');
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
    setCalendarFormError('');
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
      await axios.patch(`${API_BASE_URL}/api/calendar-sources/${calendarId}`, {
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
        await axios.delete(`${API_BASE_URL}/api/calendar-sources/${calendarId}`);
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
        const response = await axios.post(`${API_BASE_URL}/api/calendar-sources/${editingCalendar.id}/test`);
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
    const name = (calendarForm.name || '').trim();
    const url = (calendarForm.url || '').trim();
    const username = (calendarForm.username || '').trim();
    const password = (calendarForm.password || '').trim();

    setCalendarFormError('');

    if (!name) {
      setCalendarFormError('Calendar name is required.');
      return;
    }

    if (!url) {
      setCalendarFormError(calendarForm.type === 'Google'
        ? 'Select a Google calendar before saving.'
        : 'Calendar URL is required.');
      return;
    }

    if (calendarForm.type === 'CalDAV' && !username) {
      setCalendarFormError('CalDAV username is required.');
      return;
    }

    if (calendarForm.type === 'CalDAV' && !editingCalendar && !password) {
      setCalendarFormError('CalDAV password is required.');
      return;
    }

    setSavingCalendar(true);

    const payload = {
      ...calendarForm,
      name,
      url,
      username,
    };

    // Google sources are immutable in backend type validation on PATCH.
    if (editingCalendar?.type === 'Google') {
      delete payload.type;
    }

    try {
      if (editingCalendar) {
        await axios.patch(`${API_BASE_URL}/api/calendar-sources/${editingCalendar.id}`, payload);
      } else {
        await axios.post(`${API_BASE_URL}/api/calendar-sources`, payload);
      }
      await fetchCalendarSources();
      await fetchCalendarEvents();
      setShowCalendarDialog(false);
    } catch (error) {
      console.error('Error saving calendar:', error);
      setCalendarFormError(error?.response?.data?.error || 'Failed to save calendar. Please try again.');
    } finally {
      setSavingCalendar(false);
    }
  };

  const formatEventTime = (date) => {
    return moment(date).format('MMM D, h:mm A');
  };

  const getGoogleSources = () => calendarSources.filter((s) => s.type === 'Google' && s.enabled);

  const isGoogleEvent = (event) => {
    if (!event) return false;
    const src = calendarSources.find((s) => s.id === event.source_id);
    return !!src && src.type === 'Google';
  };

  const openCreateEventDialog = () => {
    const googleSources = getGoogleSources();
    if (googleSources.length === 0) return;
    const baseDay = selectedDate ? moment(selectedDate) : moment();
    const start = baseDay.clone().hour(9).minute(0).second(0);
    const end = start.clone().add(1, 'hour');
    setEventForm({
      title: '',
      description: '',
      location: '',
      all_day: false,
      start: start.format('YYYY-MM-DDTHH:mm'),
      end: end.format('YYYY-MM-DDTHH:mm'),
    });
    setEventError('');
    setEventDialog({ open: true, mode: 'create', event: null, sourceId: googleSources[0].id });
  };

  const openEditEventDialog = (event) => {
    const allDay = !!event.all_day;
    const startStr = allDay
      ? moment(event.start).format('YYYY-MM-DD')
      : moment(event.start).format('YYYY-MM-DDTHH:mm');
    const endStr = allDay
      ? moment(event.end).format('YYYY-MM-DD')
      : moment(event.end).format('YYYY-MM-DDTHH:mm');
    setEventForm({
      title: event.title || '',
      description: event.description || '',
      location: event.location || '',
      all_day: allDay,
      start: startStr,
      end: endStr,
    });
    setEventError('');
    setEventDialog({ open: true, mode: 'edit', event, sourceId: event.source_id });
  };

  const closeEventDialog = () => {
    setEventDialog({ open: false, mode: 'create', event: null, sourceId: '' });
    setEventError('');
  };

  const saveEvent = async () => {
    if (!eventDialog.sourceId) return;
    if (!eventForm.title || !eventForm.start || !eventForm.end) {
      setEventError('Title, start, and end are required.');
      return;
    }
    setEventSaving(true);
    setEventError('');
    try {
      const payload = {
        title: eventForm.title,
        description: eventForm.description,
        location: eventForm.location,
        all_day: eventForm.all_day,
        start: eventForm.start,
        end: eventForm.end,
      };
      if (eventDialog.mode === 'create') {
        await axios.post(`${API_BASE_URL}/api/calendar-sources/${eventDialog.sourceId}/events`, payload);
      } else {
        await axios.patch(
          `${API_BASE_URL}/api/calendar-sources/${eventDialog.sourceId}/events/${encodeURIComponent(eventDialog.event.id)}`,
          payload,
        );
      }
      closeEventDialog();
      await fetchCalendarEvents();
      if (selectedDate) {
        const dayDate = moment(selectedDate).startOf('day').toDate();
        setTimeout(() => {
          setSelectedDateEvents((prev) => prev);
        }, 0);
      }
    } catch (err) {
      setEventError(err?.response?.data?.error || 'Failed to save event.');
    } finally {
      setEventSaving(false);
    }
  };

  const deleteEvent = async (event) => {
    if (!isGoogleEvent(event)) return;
    if (!window.confirm('Delete this event from Google Calendar?')) return;
    try {
      await axios.delete(
        `${API_BASE_URL}/api/calendar-sources/${event.source_id}/events/${encodeURIComponent(event.id)}`,
      );
      await fetchCalendarEvents();
      setSelectedDateEvents((prev) => prev.filter((e) => e.id !== event.id));
    } catch (err) {
      alert(err?.response?.data?.error || 'Failed to delete event.');
    }
  };

  const handleSelectSlot = ({ start }) => {
    const selectedDay = moment(start).startOf('day');
    const dayDate = selectedDay.toDate();
    const dayEvents = events
      .filter(event => eventSpansDay(event, dayDate))
      .sort((a, b) => {
        if (a.all_day && !b.all_day) return -1;
        if (!a.all_day && b.all_day) return 1;
        return a.start - b.start;
      });

    setSelectedDate(selectedDay.toDate());
    setSelectedDateEvents(dayEvents);
    setShowDayModal(true);
  };

  const handleSelectEvent = (event) => {
    const selectedDay = moment(event.start).startOf('day');
    const dayDate = selectedDay.toDate();
    const dayEvents = events
      .filter(e => eventSpansDay(e, dayDate))
      .sort((a, b) => {
        if (a.all_day && !b.all_day) return -1;
        if (!a.all_day && b.all_day) return 1;
        return a.start - b.start;
      });

    setSelectedDate(selectedDay.toDate());
    setSelectedDateEvents(dayEvents);
    setShowDayModal(true);
  };

  const getCurrentDayOfWeek = () => {
    return new Date().getDay();
  };

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

  const isMultiDay = (event) => {
    return !event.all_day && !moment(event.start).isSame(moment(event.end), 'day');
  };

  const eventSpansDay = (event, day) => {
    const dayStart = moment(day).startOf('day');
    const dayEnd = moment(day).endOf('day');
    const eventStart = moment(event.start);
    const eventEnd = moment(event.end);
    return eventStart.isSameOrBefore(dayEnd) && eventEnd.isSameOrAfter(dayStart);
  };

  const getMultiDayPosition = (event, day) => {
    const isStart = moment(event.start).isSame(moment(day), 'day');
    const isEnd = moment(event.end).isSame(moment(day), 'day');
    return { isStart, isEnd };
  };

  const getWeekStartDate = () => {
    const baseDate = moment(currentDate).startOf('day');
    let startDate = baseDate.clone();

    if (dayOfWeekSettings.weekViewStart === 'yesterday') {
      startDate = baseDate.clone().subtract(1, 'day');
    } else if (dayOfWeekSettings.weekViewStart !== 'today') {
      const targetDay = WEEKDAY_INDEX[dayOfWeekSettings.weekViewStart];
      if (typeof targetDay === 'number') {
        startDate = baseDate.clone().startOf('week').add(targetDay, 'days');
      }
    }

    return startDate;
  };

  const getNext7Days = () => {
    const startDate = getWeekStartDate();

    const dates = [];
    for (let i = 0; i < 7; i++) {
      dates.push(startDate.clone().add(i, 'days').toDate());
    }

    const weekStart = moment(dates[0]).startOf('day');
    const weekEnd = moment(dates[6]).endOf('day');

    const weekEvents = events.filter(event => {
      const eventStart = moment(event.start);
      const eventEnd = moment(event.end);
      return eventStart.isSameOrBefore(weekEnd) && eventEnd.isSameOrAfter(weekStart);
    });

    const isMultiDaySpanning = (event) => {
      return event.all_day
        ? !moment(event.start).isSame(moment(event.end), 'day')
        : !moment(event.start).isSame(moment(event.end), 'day');
    };

    const multiDayEvents = weekEvents
      .filter(e => isMultiDaySpanning(e))
      .sort((a, b) => {
        const aDur = moment(a.end).diff(moment(a.start), 'days');
        const bDur = moment(b.end).diff(moment(b.start), 'days');
        if (bDur !== aDur) return bDur - aDur;
        return moment(a.start) - moment(b.start);
      });

    const slots = [];
    multiDayEvents.forEach(event => {
      let placed = false;
      for (let s = 0; s < slots.length; s++) {
        const overlaps = slots[s].some(slotEvent => {
          return moment(event.start).isBefore(moment(slotEvent.end)) &&
            moment(event.end).isAfter(moment(slotEvent.start));
        });
        if (!overlaps) {
          slots[s].push(event);
          placed = true;
          break;
        }
      }
      if (!placed) slots.push([event]);
    });

    const multiDaySlotCount = slots.length;

    const getMultiDaySlot = (event) => {
      for (let s = 0; s < slots.length; s++) {
        if (slots[s].includes(event)) return s;
      }
      return -1;
    };

    return dates.map(date => {
      const dayMultiDay = multiDayEvents.filter(e => eventSpansDay(e, date));
      const dayAllDaySingle = weekEvents.filter(e => {
        if (!isMultiDaySpanning(e)) {
          return e.all_day && eventSpansDay(e, date);
        }
        return false;
      });
      const dayTimed = weekEvents.filter(e => {
        return !e.all_day && !isMultiDaySpanning(e) && eventSpansDay(e, date);
      }).sort((a, b) => a.start - b.start);

      const multiDaySlottedRows = Array(multiDaySlotCount).fill(null).map((_, slotIdx) => {
        const event = dayMultiDay.find(e => getMultiDaySlot(e) === slotIdx) || null;
        return event;
      });

      return {
        date,
        dayName: moment(date).format('ddd'),
        dayNumber: moment(date).format('D'),
        monthName: moment(date).format('MMM'),
        isToday: moment(date).isSame(moment(new Date()), 'day'),
        multiDaySlottedRows,
        multiDaySlotCount,
        allDaySingleEvents: dayAllDaySingle,
        timedEvents: dayTimed,
      };
    });
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
    if (newViewMode === null || !TAB_CALENDAR_VIEW_MODES.has(newViewMode)) return;

    // Optimistic UI: switch instantly, then persist in the background.
    setViewMode(newViewMode);
    void persistViewModeForTab(activeTab, newViewMode);
  };

  const getCurrentMonthYear = () => {
    return moment(currentDate).format('MMMM YYYY');
  };

  const handlePreviousPeriod = () => {
    if (viewMode === 'month') {
      const newDate = new Date(currentDate);
      if (isRollingMonthView) {
        newDate.setDate(newDate.getDate() - monthViewDaysToShow);
      } else {
        newDate.setMonth(newDate.getMonth() - 1);
      }
      setCurrentDate(newDate);
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() - 7);
      setCurrentDate(newDate);
    }
  };

  const handleNextPeriod = () => {
    if (viewMode === 'month') {
      const newDate = new Date(currentDate);
      if (isRollingMonthView) {
        newDate.setDate(newDate.getDate() + monthViewDaysToShow);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      setCurrentDate(newDate);
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + 7);
      setCurrentDate(newDate);
    }
  };

  const getCurrentPeriodLabel = () => {
    if (viewMode === 'month') {
      if (isRollingMonthView) {
        const start = dayOfWeekSettings.monthViewStart === 'yesterday'
          ? moment(currentDate).startOf('day').subtract(1, 'day')
          : moment(currentDate).startOf('day');
        const end = start.clone().add(monthViewDaysToShow - 1, 'days');

        if (start.year() !== end.year()) {
          return `${start.format('MMM D, YYYY')} - ${end.format('MMM D, YYYY')}`;
        }

        if (start.month() === end.month()) {
          return `${start.format('MMM D')}-${end.format('D, YYYY')}`;
        }

        return `${start.format('MMM D')} - ${end.format('MMM D, YYYY')}`;
      }

      return moment(currentDate).format('MMMM YYYY');
    } else {
      const startOfWeek = getWeekStartDate();
      const endOfWeek = startOfWeek.clone().add(6, 'days');

      if (startOfWeek.month() === endOfWeek.month()) {
        return `${startOfWeek.format('MMM D')}-${endOfWeek.format('D, YYYY')}`;
      } else {
        return `${startOfWeek.format('MMM D')} - ${endOfWeek.format('MMM D, YYYY')}`;
      }
    }
  };

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

  const colorMode = getPreferredColorMode();
  const eventRowHoverColor = colorMode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

  if (loading) {
    return (
      <Box sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 2,
        p: 3
      }}>
        <CircularProgress />
        <Typography>Loading calendar events...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      p: 2
    }}>
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
            sx={{
              '& .MuiToggleButton-root': { color: 'var(--text-color)', borderColor: 'var(--card-border)' },
              '& .MuiToggleButton-root.Mui-selected': { color: 'var(--text-color)', backgroundColor: 'rgba(var(--accent-rgb), 0.15)' },
            }}
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
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {(() => {
            const monthStart = moment(currentDate).startOf('month');
            const monthEnd = moment(currentDate).endOf('month');
            const isFirstDayOfMonthMode = dayOfWeekSettings.monthViewStart === 'first-day-of-month';
            const monthColumns = isRollingMonthView ? monthViewDaysPerRow : 7;
            const rollingStartDate = dayOfWeekSettings.monthViewStart === 'yesterday'
              ? moment(currentDate).startOf('day').subtract(1, 'day')
              : moment(currentDate).startOf('day');

            const headerLabels = (() => {
              if (isRollingMonthView) {
                return Array.from({ length: monthColumns }, (_, idx) => rollingStartDate.clone().add(idx, 'days').format('ddd'));
              }

              if (isFirstDayOfMonthMode) {
                return Array.from({ length: 7 }, (_, idx) => monthStart.clone().add(idx, 'days').format('ddd'));
              }

              const firstDayIndex = WEEKDAY_INDEX[dayOfWeekSettings.monthViewStart] ?? 0;
              return Array.from({ length: 7 }, (_, idx) => WEEKDAY_LABELS[(firstDayIndex + idx) % 7]);
            })();

            const rows = (() => {
              if (isRollingMonthView) {
                const totalRows = Math.ceil(monthViewDaysToShow / monthColumns);
                return Array.from({ length: totalRows }, (_, rowIdx) => {
                  const rowDates = Array.from({ length: monthColumns }, (_, colIdx) => {
                    const offset = rowIdx * monthColumns + colIdx;
                    if (offset >= monthViewDaysToShow) {
                      return null;
                    }
                    return rollingStartDate.clone().add(offset, 'days');
                  });

                  const firstValidDay = rowDates.find(Boolean);
                  return {
                    rowDates,
                    rowKey: firstValidDay ? firstValidDay.format('YYYY-MM-DD') : `rolling-row-${rowIdx}`,
                  };
                });
              }

              const startDate = (() => {
                if (isFirstDayOfMonthMode) {
                  return monthStart.clone();
                }

                const firstDayIndex = WEEKDAY_INDEX[dayOfWeekSettings.monthViewStart] ?? 0;
                const offset = (monthStart.day() - firstDayIndex + 7) % 7;
                return monthStart.clone().subtract(offset, 'days');
              })();

              const endDate = (() => {
                if (isFirstDayOfMonthMode) {
                  return monthEnd.clone();
                }

                const firstDayIndex = WEEKDAY_INDEX[dayOfWeekSettings.monthViewStart] ?? 0;
                const lastColumnDay = (firstDayIndex + 6) % 7;
                const trailing = (lastColumnDay - monthEnd.day() + 7) % 7;
                return monthEnd.clone().add(trailing, 'days');
              })();

              const totalRows = Math.ceil((endDate.diff(startDate, 'days') + 1) / 7);
              return Array.from({ length: totalRows }, (_, rowIdx) => {
                const rowDates = Array.from({ length: 7 }, (_, colIdx) => {
                  const day = startDate.clone().add(rowIdx * 7 + colIdx, 'days');
                  if (isFirstDayOfMonthMode && day.isAfter(monthEnd, 'day')) {
                    return null;
                  }
                  return day;
                });

                const firstValidDay = rowDates.find(Boolean);
                return {
                  rowDates,
                  rowKey: firstValidDay ? firstValidDay.format('YYYY-MM-DD') : `month-row-${rowIdx}`,
                };
              });
            })();

            const isMultiDaySpanning = (event) => {
              return event.all_day
                ? !moment(event.start).isSame(moment(event.end), 'day')
                : !moment(event.start).isSame(moment(event.end), 'day');
            };

            const allWeekCells = [];
            rows.forEach(({ rowDates, rowKey }) => {
              const validRowDates = rowDates.filter(Boolean);
              const rowStart = validRowDates[0] || rollingStartDate;
              const rowEnd = validRowDates[validRowDates.length - 1] || rowStart;

              const rowMultiDayEvents = events
                .filter(e => isMultiDaySpanning(e) && moment(e.start).isSameOrBefore(rowEnd.clone().endOf('day')) && moment(e.end).isSameOrAfter(rowStart.clone().startOf('day')))
                .sort((a, b) => {
                  const aDur = moment(a.end).diff(moment(a.start), 'days');
                  const bDur = moment(b.end).diff(moment(b.start), 'days');
                  if (bDur !== aDur) return bDur - aDur;
                  return moment(a.start) - moment(b.start);
                });

              const slots = [];
              rowMultiDayEvents.forEach(event => {
                let placed = false;
                for (let s = 0; s < slots.length; s++) {
                  const overlaps = slots[s].some(se =>
                    moment(event.start).isBefore(moment(se.end)) && moment(event.end).isAfter(moment(se.start))
                  );
                  if (!overlaps) {
                    slots[s].push(event);
                    placed = true;
                    break;
                  }
                }
                if (!placed) slots.push([event]);
              });

              const multiDaySlotCount = slots.length;
              const getSlot = (event) => {
                for (let s = 0; s < slots.length; s++) {
                  if (slots[s].includes(event)) {
                    return s;
                  }
                }
                return -1;
              };

              rowDates.forEach((day, dayIdx) => {
                if (!day) {
                  allWeekCells.push(
                    <Box
                      key={`empty-${rowKey}-${dayIdx}`}
                      sx={{
                        border: '1px solid var(--card-border)',
                        borderRadius: 1,
                        backgroundColor: 'transparent',
                      }}
                    />
                  );
                  return;
                }

                const dayDate = day.toDate();
                const isCurrentMonth = isRollingMonthView ? true : day.month() === moment(currentDate).month();
                const isToday = day.isSame(moment(), 'day');

                const dayMultiDay = rowMultiDayEvents.filter(e => eventSpansDay(e, dayDate));
                const multiDaySlottedRows = Array(multiDaySlotCount).fill(null).map((_, slotIdx) =>
                  dayMultiDay.find(e => getSlot(e) === slotIdx) || null
                );

                const dayAllDaySingle = events.filter(e =>
                  !isMultiDaySpanning(e) && e.all_day && eventSpansDay(e, dayDate)
                );
                const dayTimed = events.filter(e =>
                  !e.all_day && !isMultiDaySpanning(e) && eventSpansDay(e, dayDate)
                ).sort((a, b) => a.start - b.start);

                const pillHeight = `${displaySettings.textSize * 1.5}px`;
                const totalEventCount = multiDaySlottedRows.filter(e => e !== null).length + dayAllDaySingle.length + dayTimed.length;

                allWeekCells.push(
                  <MonthDayCell
                    key={day.format('YYYY-MM-DD')}
                    day={day}
                    isCurrentMonth={isCurrentMonth}
                    isToday={isToday}
                    multiDaySlottedRows={multiDaySlottedRows}
                    dayAllDaySingle={dayAllDaySingle}
                    dayTimed={dayTimed}
                    totalEventCount={totalEventCount}
                    pillHeight={pillHeight}
                    displaySettings={displaySettings}
                    eventColors={eventColors}
                    getMultiDayPosition={getMultiDayPosition}
                    onSlotClick={handleSelectSlot}
                    onEventClick={handleSelectEvent}
                  />
                );
              });
            });

            return (
              <>
                <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${monthColumns}, 1fr)`, gap: 1, mb: 1 }}>
                  {headerLabels.map((day, idx) => (
                    <Box key={`${day}-${idx}`} sx={{ textAlign: 'center', fontWeight: 'bold', py: 1 }}>
                      <Typography variant="caption">{day}</Typography>
                    </Box>
                  ))}
                </Box>

                <Box sx={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${monthColumns}, 1fr)`,
                  gridTemplateRows: `repeat(${rows.length}, 1fr)`,
                  gap: 1,
                  flex: 1,
                  minHeight: 0
                }}>
                  {allWeekCells}
                </Box>
              </>
            );
          })()}
        </Box>
      ) : (
        <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <Box sx={{ display: 'flex', gap: 1, height: '100%' }}>
            {getNext7Days().map((day, index) => {
              const getPillPalette = (event) => getEventPillPalette(event.source_color || eventColors.backgroundColor, colorMode);
              const renderPill = (event, key) => {
                if (!event) {
                  return (
                    <Box
                      key={key}
                      sx={{
                        mb: 0.5,
                        height: `${displaySettings.textSize * 2.4}px`,
                        minHeight: `${displaySettings.textSize * 2.4}px`,
                      }}
                    />
                  );
                }
                const { isStart, isEnd } = getMultiDayPosition(event, day.date);
                const palette = getPillPalette(event);
                return (
                  <Box
                    key={key}
                    onClick={() => handleSelectEvent(event)}
                    sx={{
                      mb: 0.5,
                      cursor: 'pointer',
                      height: `${displaySettings.textSize * 2.4}px`,
                      minHeight: `${displaySettings.textSize * 2.4}px`,
                      display: 'flex',
                      alignItems: 'stretch',
                    }}
                  >
                    <Box
                      sx={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: palette.backgroundColor,
                        borderTopLeftRadius: isStart ? '12px' : '0px',
                        borderBottomLeftRadius: isStart ? '12px' : '0px',
                        borderTopRightRadius: isEnd ? '12px' : '0px',
                        borderBottomRightRadius: isEnd ? '12px' : '0px',
                        px: 1,
                        py: 0.125,
                        border: `1px solid ${palette.borderColor}`,
                        borderLeft: !isStart ? 'none' : `1px solid ${palette.borderColor}`,
                        borderRight: !isEnd ? 'none' : `1px solid ${palette.borderColor}`,
                        overflow: 'hidden',
                        '&:hover': { filter: 'brightness(1.1)' }
                      }}
                    >
                      <Typography variant="caption" sx={{
                        fontSize: `${displaySettings.textSize}px`,
                        color: palette.textColor,
                        fontWeight: 500,
                        fontStyle: 'italic',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        opacity: !isStart ? 0.85 : 1,
                      }}>
                        {!isStart ? `← ${event.title}` : event.title}
                      </Typography>
                    </Box>
                  </Box>
                );
              };

              const hasAnyEvents = day.multiDaySlotCount > 0 || day.allDaySingleEvents.length > 0 || day.timedEvents.length > 0;

              return (
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
                    <Typography variant="caption" sx={{ color: 'var(--text-color)', opacity: 0.6 }}>
                      {day.monthName}
                    </Typography>
                  </Box>

                  <Box sx={{ flex: 1, overflowY: 'auto' }}>
                    {day.multiDaySlottedRows.map((event, slotIdx) =>
                      renderPill(event, `multi-${slotIdx}`)
                    )}

                    {day.allDaySingleEvents.map((event, evIdx) => {
                      const palette = getPillPalette(event);
                      return (
                        <Box
                          key={`allday-${evIdx}`}
                          onClick={() => handleSelectEvent(event)}
                          sx={{
                            mb: 0.5,
                            cursor: 'pointer',
                            height: `${displaySettings.textSize * 2.4}px`,
                            minHeight: `${displaySettings.textSize * 2.4}px`,
                            display: 'flex',
                            alignItems: 'stretch',
                          }}
                        >
                          <Box
                            sx={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              backgroundColor: palette.backgroundColor,
                              borderRadius: '12px',
                              px: 1,
                              py: 0.125,
                              border: `1px solid ${palette.borderColor}`,
                              overflow: 'hidden',
                              '&:hover': { filter: 'brightness(1.1)' }
                            }}
                          >
                            <Typography variant="caption" sx={{
                              fontSize: `${displaySettings.textSize}px`,
                              color: palette.textColor,
                              fontWeight: 500,
                              fontStyle: 'italic',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {event.title}
                            </Typography>
                          </Box>
                        </Box>
                      );
                    })}

                    {(day.multiDaySlotCount > 0 || day.allDaySingleEvents.length > 0) && day.timedEvents.length > 0 && (
                      <Box sx={{ borderTop: '1px solid var(--card-border)', mt: 0.5, mb: 0.5 }} />
                    )}

                    {day.timedEvents.map((event, evIdx) => {
                      const palette = getPillPalette(event);
                      return (
                        <Box
                          key={`timed-${evIdx}`}
                          onClick={() => handleSelectEvent(event)}
                          sx={{
                            p: 0.5,
                            mb: 0.5,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 0.5,
                            borderRadius: 0.5,
                            '&:hover': { backgroundColor: eventRowHoverColor }
                          }}
                        >
                          <Box
                            sx={{
                              width: displaySettings.bulletSize,
                              height: displaySettings.bulletSize,
                              minWidth: displaySettings.bulletSize,
                              minHeight: displaySettings.bulletSize,
                              borderRadius: '50%',
                              backgroundColor: palette.backgroundColor,
                              mt: displaySettings.bulletSize * 0.0625,
                              flexShrink: 0
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
                      );
                    })}

                    {!hasAnyEvents && (
                      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', mt: 2 }}>
                        No events
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

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
              {selectedDateEvents.map((event, index) => {
                const eventPalette = getEventPillPalette(event.source_color || eventColors.backgroundColor, colorMode);
                return (
                  <ListItem
                    key={event.id || index}
                    sx={{
                      border: '1px solid var(--card-border)',
                      borderRadius: 1,
                      mb: 1,
                      bgcolor: 'rgba(var(--accent-rgb), 0.05)',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      p: 2,
                      position: 'relative'
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, width: '100%' }}>
                      <Box
                        sx={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          backgroundColor: eventPalette.backgroundColor,
                          flexShrink: 0
                        }}
                      />
                      <Chip
                        label={event.source_name || 'Unknown Calendar'}
                        size="small"
                        sx={{
                          backgroundColor: eventPalette.backgroundColor,
                          color: eventPalette.textColor,
                          fontWeight: 'bold',
                          fontSize: '0.75rem'
                        }}
                      />
                    </Box>
                    {isGoogleEvent(event) && (
                      <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Edit event">
                          <IconButton size="small" onClick={() => openEditEventDialog(event)}>
                            <Edit fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete event">
                          <IconButton size="small" onClick={() => deleteEvent(event)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
                    <ListItemText
                      primary={
                        <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1, fontStyle: event.all_day ? 'italic' : 'normal' }}>
                          {event.title}
                        </Typography>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body1" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5, fontStyle: event.all_day ? 'italic' : 'normal' }}>
                            🕐 {event.all_day ? 'All Day' : `${moment(event.start).format('h:mm A')} - ${moment(event.end).format('h:mm A')}`}
                          </Typography>
                          {event.location && (
                            <Typography variant="body2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              📍 {event.location}
                            </Typography>
                          )}
                          {event.description && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                              {event.description}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                );
              })}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between' }}>
          {getGoogleSources().length > 0 ? (
            <Button
              onClick={openCreateEventDialog}
              startIcon={<Add />}
              variant="outlined"
            >
              Add event
            </Button>
          ) : <Box />}
          <Button onClick={() => setShowDayModal(false)} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={eventDialog.open}
        onClose={closeEventDialog}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: {
            component: 'form',
            onSubmit: (event) => {
              event.preventDefault();
              saveEvent();
            },
          }
        }}
      >
        <DialogTitle>{eventDialog.mode === 'create' ? 'New Event' : 'Edit Event'}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            {eventError && (
              <Alert severity="error" sx={{ mb: 2 }}>{eventError}</Alert>
            )}

            {eventDialog.mode === 'create' && getGoogleSources().length > 1 && (
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Calendar</InputLabel>
                <Select
                  value={eventDialog.sourceId || ''}
                  label="Calendar"
                  onChange={(e) => setEventDialog({ ...eventDialog, sourceId: e.target.value })}
                >
                  {getGoogleSources().map((s) => (
                    <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <TextField
              fullWidth
              label="Title"
              value={eventForm.title}
              onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
              sx={{ mb: 2 }}
              required
            />

            <FormControlLabel
              control={
                <Switch
                  checked={eventForm.all_day}
                  onChange={(e) => {
                    const allDay = e.target.checked;
                    setEventForm((prev) => {
                      if (allDay) {
                        return {
                          ...prev,
                          all_day: true,
                          start: moment(prev.start || new Date()).format('YYYY-MM-DD'),
                          end: moment(prev.end || prev.start || new Date()).format('YYYY-MM-DD'),
                        };
                      }
                      const d = moment(prev.start || new Date());
                      const e2 = moment(prev.end || prev.start || new Date()).add(1, 'hour');
                      return {
                        ...prev,
                        all_day: false,
                        start: d.hour(9).minute(0).format('YYYY-MM-DDTHH:mm'),
                        end: e2.hour(10).minute(0).format('YYYY-MM-DDTHH:mm'),
                      };
                    });
                  }}
                />
              }
              label="All day"
              sx={{ mb: 2 }}
            />

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
              <TextField
                label="Start"
                type={eventForm.all_day ? 'date' : 'datetime-local'}
                value={eventForm.start}
                onChange={(e) => setEventForm({ ...eventForm, start: e.target.value })}
                InputLabelProps={{ shrink: true }}
                required
              />
              <TextField
                label="End"
                type={eventForm.all_day ? 'date' : 'datetime-local'}
                value={eventForm.end}
                onChange={(e) => setEventForm({ ...eventForm, end: e.target.value })}
                InputLabelProps={{ shrink: true }}
                required
              />
            </Box>

            <TextField
              fullWidth
              label="Location"
              value={eventForm.location}
              onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="Description"
              value={eventForm.description}
              onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
              multiline
              minRows={3}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={closeEventDialog}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={eventSaving}>
            {eventSaving ? <CircularProgress size={18} /> : (eventDialog.mode === 'create' ? 'Create' : 'Save')}
          </Button>
        </DialogActions>
      </Dialog>

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
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Chip label={calendar.type} size="small" variant="outlined" />
                      <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {calendar.url}
                      </Typography>
                    </Box>

                    {calendar.enabled && (
                      <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed var(--card-border)', width: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Schedule fontSize="small" sx={{ color: 'text.secondary' }} />
                            <FormControl size="small" sx={{ minWidth: 100 }}>
                              <Select
                                value={syncIntervals[calendar.id] || 15}
                                onChange={(e) => handleSyncIntervalChange(calendar.id, e.target.value)}
                                sx={{ fontSize: '0.75rem' }}
                              >
                                {syncIntervalOptions.map(opt => (
                                  <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.75rem' }}>
                                    {opt.label}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </Box>
                          <Tooltip title="Sync now">
                            <IconButton
                              size="small"
                              onClick={() => handleSyncSource(calendar.id)}
                              disabled={isSyncing[calendar.id]}
                            >
                              {isSyncing[calendar.id] ? (
                                <CircularProgress size={16} />
                              ) : (
                                <Sync fontSize="small" />
                              )}
                            </IconButton>
                          </Tooltip>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            Last sync: {formatLastSync(syncStatus[calendar.id]?.last_sync_at)}
                          </Typography>
                          {syncStatus[calendar.id]?.last_sync_status === 'error' && (
                            <Chip label="Error" size="small" color="error" sx={{ height: 16, fontSize: '0.6rem' }} />
                          )}
                          {syncStatus[calendar.id]?.event_count > 0 && (
                            <Chip
                              label={`${syncStatus[calendar.id].event_count} events`}
                              size="small"
                              sx={{ height: 16, fontSize: '0.6rem' }}
                            />
                          )}
                        </Box>
                      </Box>
                    )}
                  </ListItem>
                ))}
              </List>
            )}

            {calendarSources.length > 0 && (
              <Button
                variant="outlined"
                startIcon={isSyncing.all ? <CircularProgress size={16} /> : <Sync />}
                onClick={handleSyncAll}
                disabled={isSyncing.all}
                fullWidth
                sx={{ mt: 1 }}
              >
                {isSyncing.all ? 'Syncing...' : 'Sync All Calendars'}
              </Button>
            )}
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="h6" sx={{ mb: 2 }}>Days of the week</Typography>

          <Box sx={{ mb: 2 }}>
            <FormControl fullWidth size="small" sx={{ mb: 1 }}>
              <InputLabel>Week View Start</InputLabel>
              <Select
                label="Week View Start"
                value={dayOfWeekSettings.weekViewStart}
                onChange={(e) => setDayOfWeekSettings(prev => ({ ...prev, weekViewStart: e.target.value }))}
              >
                <MenuItem value="today">Today</MenuItem>
                <MenuItem value="yesterday">Yesterday</MenuItem>
                {WEEKDAY_OPTIONS.map(opt => (
                  <MenuItem key={`week-${opt.value}`} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel>Month View Start</InputLabel>
              <Select
                label="Month View Start"
                value={dayOfWeekSettings.monthViewStart}
                onChange={(e) => setDayOfWeekSettings(prev => ({ ...prev, monthViewStart: e.target.value }))}
              >
                {WEEKDAY_OPTIONS.map(opt => (
                  <MenuItem key={`month-${opt.value}`} value={opt.value}>{opt.label}</MenuItem>
                ))}
                <MenuItem value="first-day-of-month">1st day of month</MenuItem>
                <MenuItem value="yesterday">Yesterday</MenuItem>
                <MenuItem value="today">Today</MenuItem>
              </Select>
            </FormControl>

            {(dayOfWeekSettings.monthViewStart === 'today' || dayOfWeekSettings.monthViewStart === 'yesterday') && (
              <>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Days to show"
                  value={monthViewDaysToShow}
                  onChange={(e) => {
                    const nextValue = clampInteger(e.target.value, 1, 32, DEFAULT_MONTH_VIEW_DAYS_TO_SHOW);
                    setDayOfWeekSettings(prev => ({ ...prev, monthViewDaysToShow: nextValue }));
                  }}
                  sx={{ mt: 1 }}
                  slotProps={{
                    htmlInput: {
                      min: 1,
                      max: 32,
                      step: 1,
                    }
                  }}
                  helperText="Range: 1-32"
                />

                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Days per row"
                  value={monthViewDaysPerRow}
                  onChange={(e) => {
                    const nextValue = clampInteger(e.target.value, 1, 14, DEFAULT_MONTH_VIEW_DAYS_PER_ROW);
                    setDayOfWeekSettings(prev => ({ ...prev, monthViewDaysPerRow: nextValue }));
                  }}
                  sx={{ mt: 1 }}
                  slotProps={{
                    htmlInput: {
                      min: 1,
                      max: 14,
                      step: 1,
                    }
                  }}
                  helperText="Range: 1-14"
                />
              </>
            )}
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="h6" sx={{ mb: 2 }}>Default Event Colors</Typography>

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
                <SketchPicker
                  color={eventColors.backgroundColor}
                  onChange={(color) => handleColorChange('background', color)}
                  disableAlpha
                />
              </Box>
            )}
          </Box>

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
                <SketchPicker
                  color={eventColors.textColor}
                  onChange={(color) => handleColorChange('text', color)}
                  disableAlpha
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
                slotProps={{ htmlInput: { min: 8, max: 24 } }}
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
                slotProps={{ htmlInput: { min: 4, max: 20 } }}
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

      <Dialog
        open={showCalendarDialog}
        onClose={() => setShowCalendarDialog(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: {
            component: 'form',
            noValidate: true,
            onSubmit: (event) => {
              event.preventDefault();
              handleSaveCalendar();
            },
          }
        }}
      >
        <DialogTitle>
          {editingCalendar ? 'Edit Calendar' : 'Add Calendar'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            {calendarFormError && (
              <Alert severity="error" sx={{ mb: 2 }}>{calendarFormError}</Alert>
            )}

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
                <MenuItem value="Google" disabled={!googleAccountConnected}>
                  Google Calendar {googleAccountConnected ? '' : '(connect in Admin > Connections)'}
                </MenuItem>
              </Select>
            </FormControl>

            {calendarForm.type === 'Google' ? (
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <FormControl fullWidth>
                    <InputLabel>Google Calendar</InputLabel>
                    <Select
                      value={calendarForm.url || ''}
                      label="Google Calendar"
                      onChange={(e) => {
                        const cal = googleCalendars.find((c) => c.id === e.target.value);
                        setCalendarForm({
                          ...calendarForm,
                          url: e.target.value,
                          name: calendarForm.name || (cal ? (cal.summaryOverride || cal.summary) : ''),
                          color: calendarForm.color && calendarForm.color !== '#6e44ff'
                            ? calendarForm.color
                            : (cal && cal.backgroundColor) || calendarForm.color,
                        });
                      }}
                    >
                      {googleCalendars.length === 0 && (
                        <MenuItem value="" disabled>
                          {googleCalendarsLoading ? 'Loading...' : 'Click Refresh to load your calendars'}
                        </MenuItem>
                      )}
                      {googleCalendars.map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          <Box component="span" sx={{
                            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                            bgcolor: c.backgroundColor || '#888', mr: 1,
                          }} />
                          {(c.summaryOverride || c.summary) + (c.primary ? ' (primary)' : '')}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <IconButton type="button" onClick={loadGoogleCalendars} disabled={googleCalendarsLoading}>
                    {googleCalendarsLoading ? <CircularProgress size={18} /> : <Refresh />}
                  </IconButton>
                </Box>
                {googleCalendarsError && (
                  <Alert severity="warning" sx={{ mb: 1 }}>{googleCalendarsError}</Alert>
                )}
                <Typography variant="caption" color="text.secondary">
                  Events will sync in both directions using your connected Google account.
                </Typography>
              </Box>
            ) : (
              <TextField
                fullWidth
                label="Calendar URL"
                value={calendarForm.url}
                onChange={(e) => setCalendarForm({ ...calendarForm, url: e.target.value })}
                sx={{ mb: 2 }}
                required
                placeholder={calendarForm.type === 'CalDAV' ? 'https://caldav.example.com/calendar/' : 'https://calendar.google.com/calendar/ical/...'}
              />
            )}

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
                  <SketchPicker
                    color={calendarForm.color}
                    onChange={(color) => setCalendarForm({ ...calendarForm, color: color.hex })}
                    disableAlpha
                  />
                </Box>
              )}
            </Box>

            {editingCalendar && (
              <Button
                type="button"
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
          <Button type="button" onClick={() => setShowCalendarDialog(false)}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={savingCalendar}
          >
            {savingCalendar ? <CircularProgress size={20} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CalendarWidget;
