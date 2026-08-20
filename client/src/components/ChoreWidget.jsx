import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { Edit, Save, Cancel, Add, Delete, Check, Undo, SwapHoriz, Snooze, Backspace } from '@mui/icons-material';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import LoadingBackdrop from './LoadingBackdrop';
import PinModal from './PinModal';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getDeviceApiBase } from '../utils/deviceName.js';
import { shouldShowChoreToday, getTodayDateString, convertDaysToCrontab, getDueDateStatus, formatDueDate } from '../utils/choreHelpers.js';
import { subscribePluginEvents } from '../utils/pluginEventBridge.js';
import { playSound, soundUrl } from '../utils/choreSound.js';
import { formatTime } from '../utils/dateUtils.js';
import PrizeCelebration from './PrizeCelebration.jsx';
import ChoreCelebration from './ChoreCelebration.jsx';
import ChoreIconPicker from './ChoreIconPicker.jsx';

const USERS_UPDATED_EVENT = 'homeglow:users-updated';

// Format an 'HH:MM' 24h string for display. Goes through the date seam so a
// locale on a 24-hour clock renders '15:00' instead of '3:00 PM'.
const formatDueTime = (dueTime) => {
  if (typeof dueTime !== 'string') return '';
  const match = dueTime.match(/^(\d{2}):(\d{2})$/);
  if (!match) return dueTime;
  const date = new Date();
  date.setHours(parseInt(match[1], 10), parseInt(match[2], 10), 0, 0);
  return formatTime(date);
};

const ChoreWidget = ({ refreshNonce = 0 }) => {
  const { t } = useTranslation(['chores', 'common']);
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
    icon: '',
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
  // Household toggle for the all-chores-done celebration (issue #140).
  const [celebrationEnabled, setCelebrationEnabled] = useState(true);
  // Long-press / right-click chore menu and its follow-up dialogs (issue #122).
  const [choreMenu, setChoreMenu] = useState({ position: null, schedule: null });
  const [transferDialog, setTransferDialog] = useState({ open: false, schedule: null, targetUserId: null, mode: 'keep', bonus: 1 });
  const [snoozeDialog, setSnoozeDialog] = useState({ open: false, schedule: null, until: '' });
  const [pinGate, setPinGate] = useState({ open: false, onSuccess: null });
  // Prize store (spending mechanism): one-time offers, request queue, and the
  // avatar quick-spend dialog for off-store purchases.
  const [prizeOffers, setPrizeOffers] = useState([]);
  const [quickSpend, setQuickSpend] = useState({ open: false, user: null, amount: '', note: '' });
  const [celebration, setCelebration] = useState(null); // { username, prizeName }
  const [choreCelebration, setChoreCelebration] = useState(null); // { id } — wordless confetti
  // `${userId}:${date}` keys already celebrated, so the local and SSE triggers
  // cannot both fire for the same day. Cleared for a user when their day stops
  // being complete, so an undo/redo celebrates again.
  const celebratedDaysRef = useRef(new Set());
  const celebrationSeededRef = useRef(false);
  // Cost splitting: which offer is in split-select mode and which kids are in.
  const [splitDraft, setSplitDraft] = useState({ offerId: null, userIds: [] });
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

  // Prize redemptions celebrate on every display showing the chore widget:
  // the approval emits prize.redeemed on the server bus, delivered over the
  // same SSE stream the plugin platform uses. Confetti + a chime (chime only
  // when this device's chore sounds are on).
  useEffect(() => {
    return subscribePluginEvents((message) => {
      if (message.event !== 'prize.redeemed') return;
      // Split redemptions celebrate everyone who chipped in.
      const participantNames = (message.payload.participants || [])
        .map((p) => p.username)
        .filter(Boolean);
      const user = users.find((u) => u.id === message.payload.userId);
      setCelebration({
        username: participantNames.length > 1
          ? participantNames.join(' & ')
          : (participantNames[0] || user?.username || 'Someone'),
        prizeName: message.payload.prizeName,
      });
      if (soundEnabled) {
        try {
          playSound(soundUrl('chime.wav'), 0.8);
        } catch { /* sound is best-effort */ }
      }
      // Balances and the store changed server-side.
      void fetchUsers();
      void fetchPrizeOffers();
    });
  }, [users, soundEnabled]);

  // Finishing every regular chore for the day sets off confetti (issue #140).
  //
  // Two things can trigger it, deduplicated by celebratedDaysRef:
  //
  //   1. Local state — the effect below watches for a user's day flipping to
  //      complete. This is what fires on the display that did the tapping, and
  //      it needs nothing from the network beyond the completion request that
  //      just succeeded.
  //   2. The chore.allCompleted SSE event, which is what lets *other* displays
  //      in the house join in.
  //
  // Originally only (2) existed, which made the whole feature dependent on the
  // event stream surviving the deployment's reverse proxy. Everything else the
  // widget shows on completion — the clam total, the panel turning green — is
  // computed locally, so when the stream was blocked the celebration was the
  // only thing that silently did nothing. Reacting locally to a local action is
  // both more robust and more direct.
  const celebrateDayComplete = useCallback((userId) => {
    const key = `${userId}:${getTodayDateString()}`;
    if (celebratedDaysRef.current.has(key)) return;
    celebratedDaysRef.current.add(key);

    setChoreCelebration({ id: key });
    if (soundEnabled) {
      try {
        playSound(soundUrl('chime.wav'), 0.8);
      } catch { /* sound is best-effort */ }
    }
  }, [soundEnabled]);

  useEffect(() => {
    if (!celebrationEnabled) return undefined;

    return subscribePluginEvents((message) => {
      if (message.event !== 'chore.allCompleted') return;
      celebrateDayComplete(message.payload.userId);
      // The daily bonus landed, so balances moved.
      void fetchUsers();
    });
  }, [celebrationEnabled, celebrateDayComplete]);

  // Local trigger: watch for a day transitioning to complete.
  //
  // The first pass after data loads only seeds the ref, so a display opening on
  // an already-finished day does not throw confetti at nobody. Clearing the key
  // when a day stops being complete is what lets an undo/redo celebrate again,
  // matching the daily bonus being revoked and re-earned.
  useEffect(() => {
    if (!celebrationEnabled || loading || users.length === 0) return;

    const today = getTodayDateString();
    const seeding = !celebrationSeededRef.current;

    users.filter((user) => user.id !== 0).forEach((user) => {
      const key = `${user.id}:${today}`;
      if (!isUserDayComplete(user.id)) {
        celebratedDaysRef.current.delete(key);
        return;
      }
      if (seeding) {
        celebratedDaysRef.current.add(key);
        return;
      }
      celebrateDayComplete(user.id);
    });

    celebrationSeededRef.current = true;
  }, [users, schedules, history, celebrationEnabled, loading, celebrateDayComplete]);

  const fetchData = async () => {
    try {
      await Promise.all([
        fetchUsers(),
        fetchChores(),
        fetchSchedules(),
        fetchHistory(),
        fetchPrizes(),
        fetchPrizeOffers(),
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
      // Defaults on: the celebration is the point of the feature, and the
      // setting only exists once a parent has turned it off (issue #140).
      setCelebrationEnabled(response.data.CHORE_CELEBRATION_ENABLED !== 'false'
        && response.data.CHORE_CELEBRATION_ENABLED !== false);
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

  const fetchPrizeOffers = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/prize-offers`);
      setPrizeOffers(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching prize offers:', error);
      setPrizeOffers([]);
    }
  };

  // --- Prize store actions ---
  const requestPrizeOffer = async (offerId, userId, splitUserIds = []) => {
    try {
      const body = { user_id: userId };
      if (splitUserIds.length > 0) body.split_user_ids = splitUserIds;
      await axios.post(`${API_BASE_URL}/api/prize-offers/${offerId}/request`, body);
      setSplitDraft({ offerId: null, userIds: [] });
      await fetchPrizeOffers();
    } catch (error) {
      alert(error?.response?.data?.error || 'Could not request this prize.');
      await fetchPrizeOffers();
    }
  };

  const toggleSplitMode = (offerId) => {
    setSplitDraft((prev) => (prev.offerId === offerId ? { offerId: null, userIds: [] } : { offerId, userIds: [] }));
  };

  const toggleSplitUser = (userId) => {
    setSplitDraft((prev) => ({
      ...prev,
      userIds: prev.userIds.includes(userId)
        ? prev.userIds.filter((id) => id !== userId)
        : [...prev.userIds, userId],
    }));
  };

  const cancelPrizeRequest = async (offerId) => {
    try {
      await axios.post(`${API_BASE_URL}/api/prize-offers/${offerId}/cancel-request`);
    } catch (error) {
      console.error('Error cancelling prize request:', error);
    }
    await fetchPrizeOffers();
  };

  // Parent actions — PIN-gated like transfers when an admin PIN is set.
  const approvePrizeOffer = (offerId) => {
    requirePin(async () => {
      try {
        await axios.post(`${API_BASE_URL}/api/prize-offers/${offerId}/approve`);
        // Celebration + balances arrive via the prize.redeemed event.
        await Promise.all([fetchPrizeOffers(), fetchUsers()]);
      } catch (error) {
        alert(error?.response?.data?.error || 'Could not approve this prize.');
        await fetchPrizeOffers();
      }
    });
  };

  const declinePrizeOffer = (offerId) => {
    requirePin(async () => {
      try {
        await axios.post(`${API_BASE_URL}/api/prize-offers/${offerId}/decline`);
      } catch (error) {
        console.error('Error declining prize request:', error);
      }
      await fetchPrizeOffers();
    });
  };

  // Avatar quick-spend: parent records an off-store purchase ("toy from the
  // store") straight from the kid's profile picture.
  const confirmQuickSpend = () => {
    const { user, amount, note } = quickSpend;
    const parsed = parseInt(amount, 10);
    if (!user || !Number.isFinite(parsed) || parsed <= 0) return;
    requirePin(async () => {
      try {
        await axios.post(`${API_BASE_URL}/api/users/${user.id}/clams/reduce`, {
          amount: parsed,
          title: note.trim() || 'Spent',
        });
        setQuickSpend({ open: false, user: null, amount: '', note: '' });
        await fetchUsers();
      } catch (error) {
        alert(error?.response?.data?.error || t('chores:quickSpend.failed'));
      }
    });
  };

  // On-screen number pad for the quick-spend amount (kiosk touch screens).
  const quickSpendDigit = (digit) => {
    setQuickSpend((prev) => {
      const next = (prev.amount === '0' ? '' : prev.amount) + digit;
      if (next.length > 4) return prev;
      return { ...prev, amount: next };
    });
  };
  const quickSpendBackspace = () => {
    setQuickSpend((prev) => ({ ...prev, amount: prev.amount.slice(0, -1) }));
  };

  // Physical keyboard still works — but not while typing in the note field.
  useEffect(() => {
    if (!quickSpend.open) return;
    const handleKeyDown = (event) => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.key >= '0' && event.key <= '9') {
        quickSpendDigit(event.key);
      } else if (event.key === 'Backspace') {
        quickSpendBackspace();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quickSpend.open]);

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
        alert(t('chores:bonus.alreadyHasBonus'));
        return;
      }

      await axios.patch(`${API_BASE_URL}/api/chore-schedules/${scheduleId}`, {
        user_id: userId,
        visible: 1
      });

      await fetchData();
    } catch (error) {
      console.error('Error assigning bonus chore:', error);
      alert(error.response?.data?.error || t('chores:bonus.assignFailed'));
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
      alert(t('common:pin.statusCheckFailed'));
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
      alert(t('chores:snooze.invalidDate'));
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
        clam_value: newChore.clam_value,
        icon: newChore.icon
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
      <Box
        sx={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
        title={t('chores:widget.redeemClamsFor', { name: user.username })}
        onClick={() => setQuickSpend({ open: true, user, amount: '', note: '' })}
      >
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
                label={dueStatus === 'overdue'
                  ? t('chores:widget.overdue')
                  : t('chores:widget.dueOn', { date: formatDueDate(schedule.due_date) })}
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
          {/* The chore's icon takes the place of the checkmark while the chore
              is pending (issue #141). The per-user column is only 180-250px
              wide, so a separate icon slot would cost 25-35% of the title area;
              reusing this button costs nothing. The filled accent circle still
              carries the "tap me" affordance, and completion still flips to an
              outlined undo, so done-vs-todo reads the same as before. Chores
              with no icon keep the checkmark. */}
          <IconButton
            color={schedule.completed ? "secondary" : "primary"}
            onClick={() => toggleChoreCompletion(schedule, schedule.completed)}
            size="small"
            aria-label={schedule.completed
              ? t('chores:widget.uncompleteAria', { title: schedule.title })
              : t('chores:widget.completeAria', { title: schedule.title })}
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
            {schedule.completed
              ? <Undo fontSize="small" />
              : (schedule.icon
                ? (
                  <Box
                    component="span"
                    aria-hidden="true"
                    sx={{
                      // Matches the optical weight of the 20px checkmark this
                      // replaces; smaller leaves a conspicuous ring of accent
                      // colour around the glyph.
                      fontSize: '1.15rem',
                      lineHeight: 1,
                      // Emoji carry their own colour, so drop the white tint
                      // the checkmark relies on.
                      filter: 'none',
                    }}
                  >
                    {schedule.icon}
                  </Box>
                )
                : <Check fontSize="small" />)}
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
        <Typography variant="h6">{t('chores:widget.loading')}</Typography>
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
          <Typography variant="h6">{t('chores:widget.title')}</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              onClick={() => setShowBonusChores(!showBonusChores)}
              variant={showBonusChores ? "contained" : "outlined"}
              size="small"
              sx={{ minWidth: 'auto', px: 1 }}
              title={showBonusChores ? t('chores:bonus.hide') : t('chores:bonus.show')}
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
              {t('chores:widget.addChore')}
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
                  data-chore-user-id={user.id}
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
                        label={t('chores:widget.allDone', { count: dailyClamReward })}
                        color="success"
                        size="small"
                        sx={{ mt: 1 }}
                      />
                    )}
                  </Box>

                  <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, width: '100%' }}>
                    {userChores.length === 0 ? (
                      <Typography variant="body2" sx={{ textAlign: 'center', py: 1, color: 'var(--text-color)', opacity: 0.6 }}>
                        {t('chores:widget.noChoresToday')}
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
                  {t('chores:bonus.heading')}
                </Typography>

                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                  {t('chores:bonus.available')}
                </Typography>
                <Box sx={{ flex: 1, overflowY: 'auto', mb: 2, minHeight: 0, width: '100%' }}>
                  {availableBonusChores.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
                      {t('chores:bonus.noneAvailable')}
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

        <Dialog
          open={showPrizesModal}
          onClose={() => {
            setShowPrizesModal(false);
            setSplitDraft({ offerId: null, userIds: [] });
          }}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            {/* component="div" because DialogTitle already renders an <h2>;
                without it this nests an <h6> inside it, which React reports as
                a hydration error. ClamValueModal and TabIconModal already do
                this — this one was the odd one out. */}
            <Typography variant="h6" component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {t('chores:prizeStore.title')}
            </Typography>
          </DialogTitle>
          <DialogContent>
            {prizeOffers.length === 0 ? (
              <Typography variant="body1" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                {t('chores:prizeStore.empty')}
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                {prizeOffers.filter((offer) => offer.status === 'requested').length > 0 && (
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', opacity: 0.7 }}>
                    {t('chores:prizeStore.waitingForParent')}
                  </Typography>
                )}
                {prizeOffers.filter((offer) => offer.status === 'requested').map((offer) => (
                  <Box
                    key={offer.id}
                    sx={{
                      p: 2,
                      border: '1px solid var(--accent)',
                      borderRadius: 2,
                      bgcolor: 'rgba(var(--accent-rgb), 0.1)'
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="h6" sx={{ fontWeight: 'bold' }}>{offer.name}</Typography>
                      <Chip label={`${offer.clam_cost} 🥟`} sx={{ bgcolor: 'var(--accent)', color: 'white', fontWeight: 'bold' }} />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {/* Composed from fragments rather than one interpolated
                          string so the names can stay bold. */}
                      {t('chores:prizeStore.requestedByLabel')} <strong>{offer.requested_by_name}</strong>
                      {(offer.split_user_ids || []).length > 0 && (() => {
                        const coNames = offer.split_user_ids
                          .map((id) => users.find((u) => u.id === id)?.username)
                          .filter(Boolean);
                        const share = Math.floor(offer.clam_cost / (offer.split_user_ids.length + 1));
                        return <> {t('chores:prizeStore.splittingWithLabel')} <strong>{coNames.join(', ')}</strong> {t('chores:prizeStore.eachShareSuffix', { share })}</>;
                      })()}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button size="small" variant="contained" startIcon={<Check />} onClick={() => approvePrizeOffer(offer.id)}>
                        {t('chores:prizeStore.approve')}
                      </Button>
                      <Button size="small" variant="outlined" color="error" onClick={() => declinePrizeOffer(offer.id)}>
                        {t('chores:prizeStore.decline')}
                      </Button>
                      <Button size="small" onClick={() => cancelPrizeRequest(offer.id)} sx={{ ml: 'auto', opacity: 0.7 }}>
                        {t('chores:prizeStore.cancelRequest')}
                      </Button>
                    </Box>
                  </Box>
                ))}

                {prizeOffers.filter((offer) => offer.status === 'available').length > 0 && (
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', opacity: 0.7 }}>
                    {t('chores:prizeStore.onTheShelf')}
                  </Typography>
                )}
                {prizeOffers.filter((offer) => offer.status === 'available').map((offer) => (
                  <Box
                    key={offer.id}
                    sx={{
                      p: 2,
                      border: '1px solid var(--card-border)',
                      borderRadius: 2,
                      bgcolor: 'rgba(var(--accent-rgb), 0.05)'
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                        {offer.name}{offer.repeatable ? ' 🔁' : ''}
                      </Typography>
                      <Chip label={`${offer.clam_cost} 🥟`} sx={{ bgcolor: 'var(--accent)', color: 'white', fontWeight: 'bold' }} />
                    </Box>
                    {splitDraft.offerId === offer.id ? (() => {
                      const count = splitDraft.userIds.length;
                      const share = count > 0 ? Math.floor(offer.clam_cost / count) : offer.clam_cost;
                      const discounted = count > 0 ? offer.clam_cost - share * count : 0;
                      return (
                        <>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography variant="body2" color="text.secondary">{t('chores:prizeStore.splittingBetween')}</Typography>
                            {users.map((user) => {
                              const selected = splitDraft.userIds.includes(user.id);
                              return (
                                <Chip
                                  key={user.id}
                                  label={`${user.username} (${user.clam_total || 0})`}
                                  size="small"
                                  color={selected ? 'primary' : 'default'}
                                  variant={selected ? 'filled' : 'outlined'}
                                  onClick={() => toggleSplitUser(user.id)}
                                  sx={{ cursor: 'pointer' }}
                                />
                              );
                            })}
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                            <Button
                              size="small"
                              variant="contained"
                              disabled={count < 2}
                              onClick={() => requestPrizeOffer(offer.id, splitDraft.userIds[0], splitDraft.userIds.slice(1))}
                            >
                              {t('chores:prizeStore.requestSplit')}
                            </Button>
                            <Button size="small" onClick={() => toggleSplitMode(offer.id)} sx={{ opacity: 0.7 }}>
                              {t('common:actions.cancel')}
                            </Button>
                            <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
                              {count < 2
                                ? t('chores:prizeStore.pickTwoKids')
                                : (discounted > 0
                                  ? t('chores:prizeStore.eachShareDiscounted', { share, discounted })
                                  : t('chores:prizeStore.eachShare', { share }))}
                            </Typography>
                          </Box>
                        </>
                      );
                    })() : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body2" color="text.secondary">{t('chores:prizeStore.requestFor')}</Typography>
                        {users.map((user) => (
                          <Chip
                            key={user.id}
                            label={`${user.username} (${user.clam_total || 0})`}
                            size="small"
                            variant={(user.clam_total || 0) >= offer.clam_cost ? 'filled' : 'outlined'}
                            onClick={() => requestPrizeOffer(offer.id, user.id)}
                            sx={{ cursor: 'pointer' }}
                          />
                        ))}
                        {users.length > 1 && (
                          <Button size="small" onClick={() => toggleSplitMode(offer.id)} sx={{ ml: 'auto', whiteSpace: 'nowrap' }}>
                            {t('chores:prizeStore.splitCost')}
                          </Button>
                        )}
                      </Box>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowPrizesModal(false)} variant="contained">
              {t('common:actions.close')}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={quickSpend.open} onClose={() => setQuickSpend({ open: false, user: null, amount: '', note: '' })} maxWidth="xs" fullWidth>
          <DialogTitle>
            {t('chores:quickSpend.title', { name: quickSpend.user?.username || '' })}
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t('chores:quickSpend.balanceLabel')} <strong>{t('chores:quickSpend.clamCount', { count: quickSpend.user?.clam_total || 0 })}</strong>{t('chores:quickSpend.balanceHint')}
            </Typography>

            {(() => {
              const parsed = parseInt(quickSpend.amount, 10) || 0;
              const overspent = parsed > (quickSpend.user?.clam_total || 0);
              return (
                <Typography
                  variant="h3"
                  sx={{
                    textAlign: 'center',
                    fontWeight: 'bold',
                    my: 1,
                    color: overspent ? 'error.main' : (parsed > 0 ? 'var(--accent)' : 'var(--text-muted)'),
                    transition: 'color 0.2s ease',
                  }}
                >
                  {parsed > 0 ? `${quickSpend.amount} 🥟` : '0 🥟'}
                </Typography>
              );
            })()}

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, mb: 2 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <Button
                  key={num}
                  variant="contained"
                  onClick={() => quickSpendDigit(num.toString())}
                  sx={{
                    height: 52,
                    fontSize: '1.4rem',
                    fontWeight: 'bold',
                    background: 'linear-gradient(135deg, var(--accent) 0%, var(--secondary) 100%)',
                  }}
                >
                  {num}
                </Button>
              ))}
              <Button
                variant="outlined"
                onClick={() => setQuickSpend((prev) => ({ ...prev, amount: '' }))}
                sx={{ height: 52, fontWeight: 'bold', borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                {t('common:actions.clear')}
              </Button>
              <Button
                variant="contained"
                onClick={() => quickSpendDigit('0')}
                sx={{
                  height: 52,
                  fontSize: '1.4rem',
                  fontWeight: 'bold',
                  background: 'linear-gradient(135deg, var(--accent) 0%, var(--secondary) 100%)',
                }}
              >
                0
              </Button>
              <IconButton
                onClick={quickSpendBackspace}
                aria-label={t('common:actions.backspace')}
                sx={{
                  height: 52,
                  borderRadius: 1,
                  border: '2px solid var(--accent)',
                  color: 'var(--accent)',
                }}
              >
                <Backspace />
              </IconButton>
            </Box>

            <TextField
              fullWidth
              label={t('chores:quickSpend.whatFor')}
              placeholder={t('chores:quickSpend.whatForPlaceholder')}
              value={quickSpend.note}
              onChange={(e) => setQuickSpend((prev) => ({ ...prev, note: e.target.value }))}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setQuickSpend({ open: false, user: null, amount: '', note: '' })}>{t('common:actions.cancel')}</Button>
            <Button
              variant="contained"
              disabled={
                !quickSpend.amount
                || parseInt(quickSpend.amount, 10) <= 0
                || parseInt(quickSpend.amount, 10) > (quickSpend.user?.clam_total || 0)
              }
              onClick={confirmQuickSpend}
            >
              {t('chores:quickSpend.confirm')}
            </Button>
          </DialogActions>
        </Dialog>

        {celebration && (
          <PrizeCelebration
            username={celebration.username}
            prizeName={celebration.prizeName}
            onDismiss={() => setCelebration(null)}
          />
        )}

        {choreCelebration && (
          <ChoreCelebration
            key={choreCelebration.id}
            onDismiss={() => setChoreCelebration(null)}
          />
        )}

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
          <DialogTitle>{t('chores:add.dialogTitle')}</DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              label={t('common:labels.title')}
              value={newChore.title}
              onChange={(e) => setNewChore({ ...newChore, title: e.target.value })}
              sx={{ mb: 2, mt: 1 }}
            />
            <TextField
              fullWidth
              label={t('common:labels.description')}
              value={newChore.description}
              onChange={(e) => setNewChore({ ...newChore, description: e.target.value })}
              sx={{ mb: 2 }}
            />
            <Box sx={{ mb: 2 }}>
              <ChoreIconPicker
                value={newChore.icon}
                onChange={(icon) => setNewChore({ ...newChore, icon })}
              />
            </Box>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>{t('chores:add.assignToUser')}</InputLabel>
              <Select
                value={newChore.user_id}
                onChange={(e) => setNewChore({ ...newChore, user_id: e.target.value })}
              >
                <MenuItem value={0}>{t('chores:add.bonusChoreUnassigned')}</MenuItem>
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
                label={t('chores:add.oneTime')}
              />
            </Box>

            {!newChore.is_one_time && (
              <Box sx={{ mb: 2 }}>
                <FormLabel component="legend" sx={{ mb: 1, display: 'block' }}>
                  {t('chores:add.selectDays')}
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
                      // Label is translated; `day` stays the English key that
                      // crontab conversion and the API depend on.
                      label={t(`chores:days.${day}`)}
                    />
                  ))}
                </FormGroup>
              </Box>
            )}

            <TextField
              fullWidth
              type="number"
              label={t('chores:add.clamValue')}
              value={newChore.clam_value}
              onChange={(e) => setNewChore({ ...newChore, clam_value: parseInt(e.target.value) || 0 })}
            />
          </DialogContent>
          <DialogActions>
            <Button type="button" onClick={() => setShowAddDialog(false)}>{t('common:actions.cancel')}</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={!newChore.is_one_time && newChore.assigned_days_of_week.length === 0}
            >
              {t('chores:widget.addChore')}
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
              <ListItemText primary={t('chores:transfer.menuItem')} />
            </MenuItem>
          )}
          {choreMenu.schedule?.can_snooze !== 0 && (
            <MenuItem onClick={openSnoozeDialog}>
              <ListItemIcon><Snooze fontSize="small" /></ListItemIcon>
              <ListItemText primary={t('chores:snooze.menuItem')} />
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
              {t('chores:transfer.dialogTitle')}
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
                  {t('chores:transfer.alreadyFinished')}
                </Typography>
                <RadioGroup
                  value={transferDialog.mode}
                  onChange={(e) => setTransferDialog(prev => ({ ...prev, mode: e.target.value }))}
                >
                  <FormControlLabel value="revoke" control={<Radio size="small" />} label={t('chores:transfer.revokeAndAssign')} />
                  <FormControlLabel value="keep" control={<Radio size="small" />} label={t('chores:transfer.keepAndAssign')} />
                </RadioGroup>
                {transferDialog.mode === 'keep' && (
                  <TextField
                    type="number"
                    size="small"
                    label={t('chores:transfer.bonusWhenCompleted')}
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
            <Button onClick={() => setTransferDialog(prev => ({ ...prev, open: false }))}>{t('common:actions.cancel')}</Button>
            <Button variant="contained" disabled={!transferDialog.targetUserId} onClick={confirmTransfer}>
              {t('chores:transfer.confirm')}
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
              {t('chores:snooze.explanation')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <Chip label={t('chores:snooze.tomorrow')} size="small" onClick={() => setSnoozeDialog(prev => ({ ...prev, until: snoozePresetValue(1) }))} />
              <Chip label={t('chores:snooze.inThreeDays')} size="small" onClick={() => setSnoozeDialog(prev => ({ ...prev, until: snoozePresetValue(3) }))} />
              <Chip label={t('chores:snooze.nextWeek')} size="small" onClick={() => setSnoozeDialog(prev => ({ ...prev, until: snoozePresetValue(7) }))} />
            </Box>
            <TextField
              fullWidth
              type="datetime-local"
              label={t('chores:snooze.until')}
              value={snoozeDialog.until}
              onChange={(e) => setSnoozeDialog(prev => ({ ...prev, until: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSnoozeDialog(prev => ({ ...prev, open: false }))}>{t('common:actions.cancel')}</Button>
            <Button variant="contained" onClick={confirmSnooze}>{t('chores:snooze.confirm')}</Button>
          </DialogActions>
        </Dialog>

        {/* Admin PIN confirmation for transfer/snooze */}
        <PinModal
          open={pinGate.open}
          onClose={() => setPinGate({ open: false, onSuccess: null })}
          onVerify={handlePinVerify}
          title={t('common:pin.confirmWithAdminPin')}
        />
      </Box>

      <LoadingBackdrop open={isLoading} />
    </>
  );
};

export default ChoreWidget;
