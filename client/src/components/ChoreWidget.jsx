import React, { useState, useEffect, useRef } from 'react';
import {
  Typography,
  Button,
  Box,
  Avatar,
  Chip,
  IconButton,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Checkbox,
  FormGroup,
  FormLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Menu,
  ListItemText,
  ListItemIcon,
  List,
  ListItemButton,
  ListItemAvatar,
  Radio,
  RadioGroup
} from '@mui/material';
import { Edit, Save, Cancel, Add, Delete, Check, Undo, SwapHoriz, Snooze } from '@mui/icons-material';
import axios from 'axios';
import LoadingBackdrop from './LoadingBackdrop';
import PinModal from './PinModal';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getDeviceApiBase } from '../utils/deviceName.js';
import { shouldShowChoreToday, getTodayDateString, convertDaysToCrontab, getDueDateStatus, formatDueDate } from '../utils/choreHelpers.js';

const USERS_UPDATED_EVENT = 'homeglow:users-updated';

// Format an 'HH:MM' 24h string as a friendly 12h time (e.g. '3:00 PM').
const formatDueTime = (dueTime) => {
  if (typeof dueTime !== 'string') return '';
  const match = dueTime.match(/^(\d{2}):(\d{2})$/);
  if (!match) return dueTime;
  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${period}`;
};

const ChoreWidget = ({ refreshNonce = 0 }) => {
  const API_DEVICE_URL = getDeviceApiBase(API_BASE_URL);
  const [users, setUsers] = useState([]);
  const [chores, setChores] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [history, setHistory] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [newChore, setNewChore] = useState({
    user_id: '',
    title: '',
    description: '',
    assigned_days_of_week: ['monday'],
    clam_value: 0,
    is_one_time: false
  });
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showPrizesModal, setShowPrizesModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showBonusChores, setShowBonusChores] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [deviceSettingsLoaded, setDeviceSettingsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dailyClamReward, setDailyClamReward] = useState(2);
  // Long-press / right-click chore menu and its follow-up dialogs (issue #122).
  const [choreMenu, setChoreMenu] = useState({ position: null, schedule: null });
  const [transferDialog, setTransferDialog] = useState({ open: false, schedule: null, targetUserId: null, mode: 'keep', bonus: 1 });
  const [snoozeDialog, setSnoozeDialog] = useState({ open: false, schedule: null, until: '' });
  const [pinGate, setPinGate] = useState({ open: false, onSuccess: null });
  const longPressTimerRef = useRef(null);
  const longPressFiredRef = useRef(false);
  const longPressStartRef = useRef(null);
  const choreMenuOpenedAtRef = useRef(0);

  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const loadDeviceWidgetSettings = async () => {
      try {
        const response = await axios.get(`${API_DEVICE_URL}/settings`);
        const choreSettings = response.data?.choreWidgetSettings;
        if (choreSettings && typeof choreSettings.showBonusChores === 'boolean') {
          setShowBonusChores(choreSettings.showBonusChores);
        }
        if (choreSettings && typeof choreSettings.soundEnabled === 'boolean') {
          setSoundEnabled(choreSettings.soundEnabled);
        }
      } catch (error) {
        console.error('Error loading chore widget settings:', error);
      } finally {
        setDeviceSettingsLoaded(true);
      }
    };

    void loadDeviceWidgetSettings();
  }, [API_DEVICE_URL]);

  // Auto/manual refresh: WidgetContainer's countdown ring owns the schedule
  // and bumps refreshNonce; refetch in place instead of remounting.
  const lastRefreshNonceRef = useRef(refreshNonce);
  useEffect(() => {
    if (refreshNonce === lastRefreshNonceRef.current) return;
    lastRefreshNonceRef.current = refreshNonce;
    fetchData();
  }, [refreshNonce]);

  useEffect(() => {
    if (!deviceSettingsLoaded) {
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        await axios.patch(`${API_DEVICE_URL}/settings`, {
          choreWidgetSettings: {
            showBonusChores,
            soundEnabled,
          },
        });
      } catch (error) {
        console.error('Error saving chore widget settings:', error);
      }
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [API_DEVICE_URL, deviceSettingsLoaded, showBonusChores, soundEnabled]);

  useEffect(() => {
    const onUsersUpdated = () => {
      fetchUsers();
    };

    window.addEventListener(USERS_UPDATED_EVENT, onUsersUpdated);
    return () => {
      window.removeEventListener(USERS_UPDATED_EVENT, onUsersUpdated);
    };
  }, []);

  const fetchData = async () => {
    try {
      await Promise.all([
        fetchUsers(),
        fetchChores(),
        fetchSchedules(),
        fetchHistory(),
        fetchPrizes(),
        fetchSettings()
      ]);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/settings`);
      if (response.data.daily_completion_clam_reward) {
        setDailyClamReward(parseInt(response.data.daily_completion_clam_reward, 10));
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/users`);
      setUsers(response.data.filter(user => user.id !== 0));
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchChores = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/chores`);
      setChores(response.data);
    } catch (error) {
      console.error('Error fetching chores:', error);
    }
  };

  const fetchSchedules = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/chore-schedules?usage=chart`);
      setSchedules(response.data);
    } catch (error) {
      console.error('Error fetching schedules:', error);
    }
  };

  const fetchHistory = async () => {
    try {
      const today = getTodayDateString();
      const response = await axios.get(`${API_BASE_URL}/api/chore-history?date=${today}`);
      setHistory(response.data);
    } catch (error) {
      console.error('Error fetching history:', error);
    }
  };

  const fetchPrizes = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/prizes`);
      setPrizes(response.data);
    } catch (error) {
      console.error('Error fetching prizes:', error);
    }
  };

  const toggleChoreCompletion = async (schedule, isCompleted) => {
    try {
      setIsLoading(true);
      const today = getTodayDateString();

      if (isCompleted) {
        await axios.post(`${API_BASE_URL}/api/chores/uncomplete`, {
          chore_schedule_id: schedule.id,
          user_id: schedule.user_id,
          date: today
        });
      } else {
        await axios.post(`${API_BASE_URL}/api/chores/complete`, {
          chore_schedule_id: schedule.id,
          user_id: schedule.user_id,
          date: today
        });
      }

      await fetchData();
    } catch (error) {
      console.error('Error toggling chore completion:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const assignBonusChore = async (scheduleId, userId) => {
    try {
      setIsLoading(true);

      const today = getTodayDateString();

      const userBonusSchedules = schedules.filter(s =>
        s.user_id === userId &&
        s.visible === 1 &&
        s.clam_value > 0
      );

      const hasUncompletedBonusChoreToday = userBonusSchedules.some(schedule => {
        const completedToday = history.some(h =>
          h.chore_schedule_id === schedule.id &&
          h.user_id === userId &&
          h.date === today
        );
        return !completedToday;
      });

      if (hasUncompletedBonusChoreToday) {
        alert('User already has an uncompleted bonus chore. Complete it first!');
        return;
      }

      await axios.patch(`${API_BASE_URL}/api/chore-schedules/${scheduleId}`, {
        user_id: userId,
        visible: 1
      });

      await fetchData();
    } catch (error) {
      console.error('Error assigning bonus chore:', error);
      alert(error.response?.data?.error || 'Failed to assign bonus chore');
    } finally {
      setIsLoading(false);
    }
  };

  const reassignChore = async (scheduleId, newUserId, extraFields = {}) => {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule || schedule.user_id === newUserId) {
      return;
    }

    try {
      setIsLoading(true);
      await axios.patch(`${API_BASE_URL}/api/chore-schedules/${scheduleId}`, {
        user_id: newUserId,
        visible: 1,
        ...extraFields
      });
      await fetchData();
    } catch (error) {
      console.error('Error reassigning chore:', error);
      alert(error.response?.data?.error || 'Failed to reassign chore');
    } finally {
      setIsLoading(false);
    }
  };

  // ---- Long-press / right-click chore menu (issue #122) -------------------
  // Desktop: right-click (native context menu suppressed). Android: long-press
  // fires `contextmenu` natively. iOS: no contextmenu event, so a pointer
  // timer provides the long-press.

  const openChoreMenu = (clientX, clientY, schedule) => {
    if (choreMenu.schedule) return; // already open (Android contextmenu + timer double-fire guard)
    const canTransfer = schedule.transferable !== 0 && users.filter(u => u.id !== 0 && u.id !== schedule.user_id).length > 0;
    const canSnooze = schedule.can_snooze !== 0;
    if (!canTransfer && !canSnooze) return;
    choreMenuOpenedAtRef.current = Date.now();
    setChoreMenu({ position: { top: clientY, left: clientX }, schedule });
  };

  const closeChoreMenu = () => setChoreMenu({ position: null, schedule: null });

  // When a long-press opens the menu while the finger is still down, lifting
  // the finger fires a click that lands on the menu backdrop and would close
  // it instantly. Ignore backdrop clicks that arrive right after opening.
  const handleChoreMenuClose = (event, reason) => {
    if (reason === 'backdropClick' && Date.now() - choreMenuOpenedAtRef.current < 700) {
      return;
    }
    closeChoreMenu();
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleCardPointerDown = (event, schedule) => {
    longPressFiredRef.current = false;
    // Mouse users reach the menu via right-click; the timer is the touch/pen path.
    if (event.pointerType === 'mouse') return;
    longPressStartRef.current = { x: event.clientX, y: event.clientY };
    const { clientX, clientY } = event;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      longPressFiredRef.current = true;
      openChoreMenu(clientX, clientY, schedule);
    }, 600);
  };

  const handleCardPointerMove = (event) => {
    if (!longPressTimerRef.current || !longPressStartRef.current) return;
    const dx = event.clientX - longPressStartRef.current.x;
    const dy = event.clientY - longPressStartRef.current.y;
    if (Math.hypot(dx, dy) > 10) clearLongPressTimer(); // treat as scroll/drag
  };

  const handleCardPointerEnd = () => clearLongPressTimer();

  const handleCardContextMenu = (event, schedule) => {
    // Always suppress the native browser menu on chore cards so right-click
    // (and Android long-press) opens the chore menu instead.
    event.preventDefault();
    // A long-press-generated contextmenu (button 0) is often followed by a
    // synthetic click; swallow it. Desktop right-click (button 2) produces no
    // click, so leave the ref alone there.
    if (event.button !== 2) {
      longPressFiredRef.current = true;
    }
    openChoreMenu(event.clientX, event.clientY, schedule);
  };

  const handleCardClickCapture = (event) => {
    if (longPressFiredRef.current) {
      event.preventDefault();
      event.stopPropagation();
      longPressFiredRef.current = false;
    }
  };

  // Mirrors the server's daily-bonus rule: a user's day is complete when they
  // have at least one regular (zero-clam) chore today and none are open.
  const isUserDayComplete = (userId) => {
    const regular = getUserChoresForToday(userId).filter(c => c.clam_value === 0);
    return regular.length > 0 && regular.every(c => c.completed);
  };

  // Runs `action` immediately when no admin PIN is configured (incl. demo
  // mode); otherwise opens the PIN modal and runs it after verification.
  const requirePin = async (action) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/admin-pin/exists`);
      if (response.data?.exists) {
        setPinGate({ open: true, onSuccess: action });
      } else {
        action();
      }
    } catch (error) {
      console.error('Error checking admin PIN:', error);
      alert('Could not confirm admin PIN status. Please try again.');
    }
  };

  const handlePinVerify = async (pin) => {
    const response = await axios.post(`${API_BASE_URL}/api/admin-pin/verify`, { pin });
    if (!response.data?.valid) {
      throw new Error('Incorrect PIN. Please try again.');
    }
    const action = pinGate.onSuccess;
    setPinGate({ open: false, onSuccess: null });
    if (action) action();
  };

  const openTransferDialog = () => {
    const schedule = choreMenu.schedule;
    closeChoreMenu();
    if (schedule) {
      setTransferDialog({ open: true, schedule, targetUserId: null, mode: 'keep', bonus: 1 });
    }
  };

  const confirmTransfer = () => {
    const { schedule, targetUserId, mode, bonus } = transferDialog;
    if (!schedule || !targetUserId) return;
    const extras = {};
    // The revoke/keep choice only applies when the receiver's day is already
    // complete (and therefore rewarded).
    if (isUserDayComplete(targetUserId)) {
      if (mode === 'revoke') {
        extras.revoke_daily_bonus = true;
      } else {
        extras.transfer_bonus_clams = Math.max(0, parseInt(bonus, 10) || 0);
      }
    }
    setTransferDialog(prev => ({ ...prev, open: false }));
    requirePin(() => reassignChore(schedule.id, targetUserId, extras));
  };

  const toDatetimeLocalString = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const snoozePresetValue = (daysFromNow) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(0, 0, 0, 0);
    return toDatetimeLocalString(d);
  };

  const openSnoozeDialog = () => {
    const schedule = choreMenu.schedule;
    closeChoreMenu();
    if (schedule) {
      setSnoozeDialog({ open: true, schedule, until: snoozePresetValue(1) });
    }
  };

  const confirmSnooze = () => {
    const { schedule, until } = snoozeDialog;
    if (!schedule) return;
    const parsed = new Date(until);
    if (!until || Number.isNaN(parsed.getTime())) {
      alert('Enter a valid date and time to snooze until.');
      return;
    }
    setSnoozeDialog(prev => ({ ...prev, open: false }));
    requirePin(async () => {
      try {
        setIsLoading(true);
        await axios.patch(`${API_BASE_URL}/api/chore-schedules/${schedule.id}`, {
          snoozed_until: parsed.toISOString()
        });
        await fetchData();
      } catch (error) {
        console.error('Error snoozing chore:', error);
        alert(error.response?.data?.error || 'Failed to snooze chore');
      } finally {
        setIsLoading(false);
      }
    });
  };

  const saveChore = async () => {
    try {
      setIsLoading(true);

      const choreResponse = await axios.post(`${API_BASE_URL}/api/chores`, {
        title: newChore.title,
        description: newChore.description,
        clam_value: newChore.clam_value
      });

      const choreId = choreResponse.data.id;
      const crontab = newChore.is_one_time ? null : convertDaysToCrontab(newChore.assigned_days_of_week);

      await axios.post(`${API_BASE_URL}/api/chore-schedules`, {
        chore_id: choreId,
        user_id: newChore.user_id || null,
        crontab: crontab,
        visible: 1
      });

      setNewChore({
        user_id: '',
        title: '',
        description: '',
        assigned_days_of_week: ['monday'],
        clam_value: 0,
        is_one_time: false
      });
      setShowAddDialog(false);
      await fetchData();
    } catch (error) {
      console.error('Error saving chore:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getUserChoresForToday = (userId) => {
    return schedules
      .filter(schedule => {
        if (schedule.user_id !== userId) return false;
        if (!schedule.visible) return false;
        return shouldShowChoreToday(schedule);
      })
      .map(schedule => {
        const today = getTodayDateString();
        const completed = history.some(h =>
          h.chore_schedule_id === schedule.id &&
          h.user_id === userId &&
          h.date === today
        );

        return {
          ...schedule,
          completed,
          id: schedule.id
        };
      });
  };

  const getBonusChores = () => {
    return schedules.filter(schedule => schedule.visible);
  };

  const getAvailableBonusChores = () => {
    return getBonusChores().filter(schedule => schedule.user_id === null || schedule.user_id === 0);
  };

  const renderUserAvatar = (user) => {
    const handleImageError = (e) => {
      console.log(`Profile picture failed to load for user ${user.username}:`, user.profile_picture);
      e.target.style.display = 'none';
      e.target.nextSibling.style.display = 'flex';
    };

    let imageUrl = null;
    if (user.profile_picture) {
      if (user.profile_picture.startsWith('data:')) {
        imageUrl = user.profile_picture;
      } else {
        imageUrl = `${API_BASE_URL}/Uploads/users/${user.profile_picture}`;
      }
    }

    return (
      <Box sx={{ position: 'relative', display: 'inline-block' }}>
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={user.username}
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '3px solid var(--accent)',
                display: 'block'
              }}
              onError={handleImageError}
            />
            <Avatar
              sx={{
                width: 60,
                height: 60,
                bgcolor: 'var(--accent)',
                border: '3px solid var(--accent)',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                display: 'none'
              }}
            >
              {user.username.charAt(0).toUpperCase()}
            </Avatar>
          </>
        ) : (
          <Avatar
            sx={{
              width: 60,
              height: 60,
              bgcolor: 'var(--accent)',
              border: '3px solid var(--accent)',
              fontSize: '1.5rem',
              fontWeight: 'bold'
            }}
          >
            {user.username.charAt(0).toUpperCase()}
          </Avatar>
        )}

        <Chip
          label={`${user.clam_total || 0} 🥟`}
          size="small"
          sx={{
            position: 'absolute',
            top: -8,
            right: -8,
            bgcolor: 'var(--accent)',
            color: 'white',
            fontSize: '0.7rem',
            height: 24,
            '& .MuiChip-label': {
              px: 1
            }
          }}
        />
      </Box>
    );
  };

  const renderChoreItem = (schedule) => {
    const dueStatus = getDueDateStatus(schedule.due_date, getTodayDateString(), schedule.completed);
    const rowBgColor = schedule.completed
      ? 'rgba(0, 255, 0, 0.1)'
      : dueStatus === 'overdue'
        ? 'rgba(244, 67, 54, 0.16)'
        : dueStatus === 'due'
          ? 'rgba(255, 193, 7, 0.20)'
          : 'transparent';

    return (
      <Box
        key={schedule.id}
        className="chore-card"
        data-schedule-id={schedule.id}
        onContextMenu={(e) => handleCardContextMenu(e, schedule)}
        onPointerDown={(e) => handleCardPointerDown(e, schedule)}
        onPointerMove={handleCardPointerMove}
        onPointerUp={handleCardPointerEnd}
        onPointerLeave={handleCardPointerEnd}
        onPointerCancel={handleCardPointerEnd}
        onClickCapture={handleCardClickCapture}
        sx={{
          p: 1.5,
          border: '1px solid var(--card-border)',
          borderRadius: 2,
          mb: 1,
          bgcolor: rowBgColor,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          // Keep long-press from triggering text selection / iOS callout.
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none'
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: schedule.completed ? 'normal' : 'bold', fontSize: '0.85rem' }}>
            {schedule.title}
            {schedule.clam_value > 0 && (
              <Chip
                label={`${schedule.clam_value} 🥟`}
                size="small"
                sx={{ ml: 1, bgcolor: 'var(--accent)', color: 'white' }}
              />
            )}
            {schedule.due_time && (
              <Chip
                label={`${schedule.sound_enabled ? '🔔 ' : '🕑 '}${formatDueTime(schedule.due_time)}`}
                size="small"
                variant="outlined"
                sx={{ ml: 1, fontSize: '0.7rem' }}
              />
            )}
            {schedule.due_date && (
              <Chip
                label={`${dueStatus === 'overdue' ? '⚠️ Overdue' : `Due ${formatDueDate(schedule.due_date)}`}`}
                size="small"
                color={dueStatus === 'overdue' ? 'error' : dueStatus === 'due' ? 'warning' : 'default'}
                variant={dueStatus === 'upcoming' || dueStatus === 'none' ? 'outlined' : 'filled'}
                sx={{ ml: 1, fontSize: '0.7rem' }}
              />
            )}
          </Typography>
          {schedule.description && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              {schedule.description}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton
            color={schedule.completed ? "secondary" : "primary"}
            onClick={() => toggleChoreCompletion(schedule, schedule.completed)}
            size="small"
            sx={{
              minWidth: 'auto',
              width: 32,
              height: 32,
              bgcolor: schedule.completed ? 'transparent' : 'var(--accent)',
              color: schedule.completed ? 'var(--accent)' : 'white',
              '&:hover': {
                bgcolor: schedule.completed ? 'rgba(var(--accent-rgb), 0.1)' : 'var(--accent)',
                filter: 'brightness(1.1)'
              }
            }}
          >
            {schedule.completed ? <Undo fontSize="small" /> : <Check fontSize="small" />}
          </IconButton>
        </Box>
      </Box>
    );
  };

  const handleDayToggle = (day) => {
    setNewChore(prev => ({
      ...prev,
      assigned_days_of_week: prev.assigned_days_of_week.includes(day)
        ? prev.assigned_days_of_week.filter(d => d !== day)
        : [...prev.assigned_days_of_week, day]
    }));
  };

  if (loading) {
    return (
      <Box sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        p: 2
      }}>
        <Typography variant="h6">Loading chores...</Typography>
      </Box>
    );
  }

  const availableBonusChores = getAvailableBonusChores();

  return (
    <>
      <Box sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        p: 2
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">🥟 Daily Chores</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              onClick={() => setShowBonusChores(!showBonusChores)}
              variant={showBonusChores ? "contained" : "outlined"}
              size="small"
              sx={{ minWidth: 'auto', px: 1 }}
              title={showBonusChores ? "Hide Bonus Chores" : "Show Bonus Chores"}
            >
              🥟
            </Button>
            <Button
              onClick={() => setSoundEnabled(!soundEnabled)}
              variant={soundEnabled ? "contained" : "outlined"}
              size="small"
              sx={{ minWidth: 'auto', px: 1 }}
              title={soundEnabled ? "Mute chore sounds on this display" : "Enable chore sounds on this display"}
            >
              {soundEnabled ? '🔔' : '🔕'}
            </Button>
            <Button
              onClick={() => setShowPrizesModal(true)}
              variant="outlined"
              size="small"
              sx={{ minWidth: 'auto', px: 1 }}
            >
              🛍️
            </Button>
            <Button
              startIcon={<Add />}
              onClick={() => setShowAddDialog(true)}
              variant="contained"
              size="small"
            >
              Add Chore
            </Button>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 2 }}>
          <Box sx={{
            display: 'flex',
            gap: 2,
            pb: 2,
            justifyContent: 'space-evenly',
            alignItems: 'flex-start',
            width: '100%'
          }}>
            {users.filter(user => user.id !== 0).map(user => {
              const userChores = getUserChoresForToday(user.id);
              const completedChores = userChores.filter(c => c.completed && c.clam_value === 0).length;
              const totalRegularChores = userChores.filter(c => c.clam_value === 0).length;
              const allRegularChoresCompleted = totalRegularChores > 0 && completedChores === totalRegularChores;

              return (
                <Box
                  key={user.id}
                  sx={{
                    flex: '1 1 0',
                    minWidth: '180px',
                    maxWidth: '250px',
                    border: '2px solid var(--card-border)',
                    borderRadius: 2,
                    p: 2,
                    bgcolor: allRegularChoresCompleted ? 'rgba(0, 255, 0, 0.05)' : 'transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center'
                  }}
                >
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 2 }}>
                    {renderUserAvatar(user)}
                    <Typography variant="subtitle1" sx={{ mt: 1, fontSize: '0.9rem', fontWeight: 'bold' }}>
                      {user.username}
                    </Typography>
                    {allRegularChoresCompleted && (
                      <Chip
                        label={`All Done! +${dailyClamReward} 🥟`}
                        color="success"
                        size="small"
                        sx={{ mt: 1 }}
                      />
                    )}
                  </Box>

                  <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, width: '100%' }}>
                    {userChores.length === 0 ? (
                      <Typography variant="body2" sx={{ textAlign: 'center', py: 1, color: 'var(--text-color)', opacity: 0.6 }}>
                        No chores for today
                      </Typography>
                    ) : (
                      userChores.map(schedule => renderChoreItem(schedule))
                    )}
                  </Box>
                </Box>
              );
            })}

            {showBonusChores && (
              <Box
                sx={{
                  flex: '1 1 0',
                  minWidth: '180px',
                  maxWidth: '250px',
                  border: '2px solid var(--accent)',
                  borderRadius: 2,
                  p: 2,
                  bgcolor: 'rgba(var(--accent-rgb), 0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center'
                }}
              >
                <Typography variant="subtitle1" sx={{ textAlign: 'center', mb: 2, color: 'var(--accent)', fontSize: '0.9rem', fontWeight: 'bold' }}>
                  🥟 Bonus Chores
                </Typography>

                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                  Available:
                </Typography>
                <Box sx={{ flex: 1, overflowY: 'auto', mb: 2, minHeight: 0, width: '100%' }}>
                  {availableBonusChores.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
                      No bonus chores available
                    </Typography>
                  ) : (
                    availableBonusChores.map(schedule => (
                      <Box
                        key={schedule.id}
                        sx={{
                          p: 1,
                          border: '1px solid var(--accent)',
                          borderRadius: 1,
                          mb: 1,
                          bgcolor: 'rgba(var(--accent-rgb), 0.1)'
                        }}
                      >
                        <Typography variant="subtitle2">
                          {schedule.title}
                          <Chip
                            label={`${schedule.clam_value} 🥟`}
                            size="small"
                            sx={{ ml: 1, bgcolor: 'var(--accent)', color: 'white' }}
                          />
                        </Typography>
                        {schedule.description && (
                          <Typography variant="caption" color="text.secondary">
                            {schedule.description}
                          </Typography>
                        )}
                        <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          {users.map(user => (
                            <Button
                              key={user.id}
                              size="small"
                              variant="outlined"
                              onClick={() => assignBonusChore(schedule.id, user.id)}
                              sx={{ fontSize: '0.7rem', minWidth: 'auto', px: 1 }}
                            >
                              {user.username}
                            </Button>
                          ))}
                        </Box>
                      </Box>
                    ))
                  )}
                </Box>
              </Box>
            )}
          </Box>
        </Box>

        <Dialog open={showPrizesModal} onClose={() => setShowPrizesModal(false)} maxWidth="sm" fullWidth>
          <DialogTitle>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              🛍️ Available Prizes
            </Typography>
          </DialogTitle>
          <DialogContent>
            {prizes.length === 0 ? (
              <Typography variant="body1" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                No prizes available. Ask an admin to add some prizes!
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                {prizes.map((prize) => (
                  <Box
                    key={prize.id}
                    sx={{
                      p: 2,
                      border: '1px solid var(--card-border)',
                      borderRadius: 2,
                      bgcolor: 'rgba(var(--accent-rgb), 0.05)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                        {prize.name}
                      </Typography>
                    </Box>
                    <Chip
                      label={`${prize.clam_cost} 🥟`}
                      sx={{
                        bgcolor: 'var(--accent)',
                        color: 'white',
                        fontWeight: 'bold',
                        fontSize: '0.9rem'
                      }}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowPrizesModal(false)} variant="contained">
              Close
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          maxWidth="sm"
          fullWidth
          slotProps={{
            paper: {
              component: 'form',
              onSubmit: (event) => {
                event.preventDefault();
                saveChore();
              },
            }
          }}
        >
          <DialogTitle>Add New Chore</DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              label="Title"
              value={newChore.title}
              onChange={(e) => setNewChore({ ...newChore, title: e.target.value })}
              sx={{ mb: 2, mt: 1 }}
            />
            <TextField
              fullWidth
              label="Description"
              value={newChore.description}
              onChange={(e) => setNewChore({ ...newChore, description: e.target.value })}
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Assign to User</InputLabel>
              <Select
                value={newChore.user_id}
                onChange={(e) => setNewChore({ ...newChore, user_id: e.target.value })}
              >
                <MenuItem value={0}>Bonus Chore (Unassigned)</MenuItem>
                {users.map(user => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.username}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box sx={{ mb: 2 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={newChore.is_one_time}
                    onChange={(e) => setNewChore({
                      ...newChore,
                      is_one_time: e.target.checked,
                      assigned_days_of_week: e.target.checked ? [] : ['monday']
                    })}
                    color="primary"
                  />
                }
                label="One-time chore (no recurrence)"
              />
            </Box>

            {!newChore.is_one_time && (
              <Box sx={{ mb: 2 }}>
                <FormLabel component="legend" sx={{ mb: 1, display: 'block' }}>
                  Select Days (choose one or more):
                </FormLabel>
                <FormGroup row>
                  {daysOfWeek.map(day => (
                    <FormControlLabel
                      key={day}
                      control={
                        <Checkbox
                          checked={newChore.assigned_days_of_week.includes(day)}
                          onChange={() => handleDayToggle(day)}
                          color="primary"
                        />
                      }
                      label={day.charAt(0).toUpperCase() + day.slice(1)}
                    />
                  ))}
                </FormGroup>
              </Box>
            )}

            <TextField
              fullWidth
              type="number"
              label="🥟 Clam Value (0 for regular chore)"
              value={newChore.clam_value}
              onChange={(e) => setNewChore({ ...newChore, clam_value: parseInt(e.target.value) || 0 })}
            />
          </DialogContent>
          <DialogActions>
            <Button type="button" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={!newChore.is_one_time && newChore.assigned_days_of_week.length === 0}
            >
              Add Chore
            </Button>
          </DialogActions>
        </Dialog>

        {/* Long-press / right-click chore menu */}
        <Menu
          open={Boolean(choreMenu.position)}
          onClose={handleChoreMenuClose}
          anchorReference="anchorPosition"
          anchorPosition={choreMenu.position || undefined}
        >
          {choreMenu.schedule?.transferable !== 0 && users.filter(u => u.id !== 0 && u.id !== choreMenu.schedule?.user_id).length > 0 && (
            <MenuItem onClick={openTransferDialog}>
              <ListItemIcon><SwapHoriz fontSize="small" /></ListItemIcon>
              <ListItemText primary="Transfer chore" />
            </MenuItem>
          )}
          {choreMenu.schedule?.can_snooze !== 0 && (
            <MenuItem onClick={openSnoozeDialog}>
              <ListItemIcon><Snooze fontSize="small" /></ListItemIcon>
              <ListItemText primary="Snooze due date" />
            </MenuItem>
          )}
        </Menu>

        {/* Transfer chore dialog */}
        <Dialog
          open={transferDialog.open}
          onClose={() => setTransferDialog(prev => ({ ...prev, open: false }))}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>Transfer "{transferDialog.schedule?.title}"</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Who should take over this chore?
            </Typography>
            <List dense>
              {users
                .filter(user => user.id !== 0 && user.id !== transferDialog.schedule?.user_id)
                .map(user => (
                  <ListItemButton
                    key={user.id}
                    selected={transferDialog.targetUserId === user.id}
                    onClick={() => setTransferDialog(prev => ({ ...prev, targetUserId: user.id }))}
                  >
                    <ListItemAvatar>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: 'var(--accent)' }}>
                        {user.username?.charAt(0).toUpperCase()}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={user.username}
                      secondary={isUserDayComplete(user.id) ? 'All chores done today' : null}
                    />
                  </ListItemButton>
                ))}
            </List>
            {transferDialog.targetUserId && isUserDayComplete(transferDialog.targetUserId) && (
              <Box sx={{ mt: 1, p: 1.5, border: '1px solid var(--card-border)', borderRadius: 2 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  They already finished today's chores and earned the daily reward.
                </Typography>
                <RadioGroup
                  value={transferDialog.mode}
                  onChange={(e) => setTransferDialog(prev => ({ ...prev, mode: e.target.value }))}
                >
                  <FormControlLabel value="revoke" control={<Radio size="small" />} label="Revoke current reward and assign" />
                  <FormControlLabel value="keep" control={<Radio size="small" />} label="Keep current reward and assign" />
                </RadioGroup>
                {transferDialog.mode === 'keep' && (
                  <TextField
                    type="number"
                    size="small"
                    label="🥟 Bonus when completed"
                    value={transferDialog.bonus}
                    onChange={(e) => setTransferDialog(prev => ({ ...prev, bonus: e.target.value }))}
                    inputProps={{ min: 0 }}
                    sx={{ mt: 1 }}
                  />
                )}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setTransferDialog(prev => ({ ...prev, open: false }))}>Cancel</Button>
            <Button variant="contained" disabled={!transferDialog.targetUserId} onClick={confirmTransfer}>
              Transfer
            </Button>
          </DialogActions>
        </Dialog>

        {/* Snooze chore dialog */}
        <Dialog
          open={snoozeDialog.open}
          onClose={() => setSnoozeDialog(prev => ({ ...prev, open: false }))}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>Snooze "{snoozeDialog.schedule?.title}"</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              The chore stays hidden and isn't required for the daily reward until this time.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <Chip label="Tomorrow" size="small" onClick={() => setSnoozeDialog(prev => ({ ...prev, until: snoozePresetValue(1) }))} />
              <Chip label="In 3 days" size="small" onClick={() => setSnoozeDialog(prev => ({ ...prev, until: snoozePresetValue(3) }))} />
              <Chip label="Next week" size="small" onClick={() => setSnoozeDialog(prev => ({ ...prev, until: snoozePresetValue(7) }))} />
            </Box>
            <TextField
              fullWidth
              type="datetime-local"
              label="Snooze until"
              value={snoozeDialog.until}
              onChange={(e) => setSnoozeDialog(prev => ({ ...prev, until: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSnoozeDialog(prev => ({ ...prev, open: false }))}>Cancel</Button>
            <Button variant="contained" onClick={confirmSnooze}>Snooze</Button>
          </DialogActions>
        </Dialog>

        {/* Admin PIN confirmation for transfer/snooze */}
        <PinModal
          open={pinGate.open}
          onClose={() => setPinGate({ open: false, onSuccess: null })}
          onVerify={handlePinVerify}
          title="Confirm with Admin PIN"
        />
      </Box>

      <LoadingBackdrop open={isLoading} />
    </>
  );
};

export default ChoreWidget;
