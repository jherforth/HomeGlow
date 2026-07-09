import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Tooltip,
  Divider,
  CircularProgress,
  RadioGroup,
  Radio,
  Grid
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  ContentCopy,
  Save,
  Cancel,
  Refresh,
  Schedule,
  Warning
} from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { CronExpressionParser } from 'cron-parser';
import { getServerTimezoneSync } from '../utils/timezone.js';
import SoundPicker from './SoundPicker.jsx';
import useIsMobile from '../hooks/useIsMobile.js';
import { stackableTableSx } from '../utils/responsiveTable.js';

const DAY_OPTIONS = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 }
];

const CRONTAB_PRESETS = [
  { label: 'Daily', value: '0 0 * * *' },
  { label: 'Every Other Day', value: '0 0 */2 * *' },
  { label: 'Weekdays (Mon–Fri)', value: '0 0 * * 1-5' },
  { label: 'Weekends (Sat–Sun)', value: '0 0 * * 0,6' }
];

function getNextOccurrence(crontab) {
  if (!crontab) return 'One-time';
  try {
    const tz = getServerTimezoneSync();
    const interval = CronExpressionParser.parse(crontab, { tz });
    const next = interval.next().toDate();
    return next.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
  } catch {
    return 'Invalid expression';
  }
}

function validateCrontab(crontab) {
  if (!crontab) return null;
  try {
    CronExpressionParser.parse(crontab);
    return null;
  } catch (e) {
    return e.message;
  }
}

function daysToCrontab(days) {
  const sorted = [...days].sort((a, b) => a - b);
  return `0 0 * * ${sorted.join(',')}`;
}

function formatScheduleInterval(interval) {
  if (!interval || typeof interval !== 'string') {
    return null;
  }

  const match = interval.match(/^(\d+)([dwmy])$/i);
  if (!match) {
    return interval;
  }

  const count = match[1];
  const unit = match[2].toLowerCase();
  const unitLabelMap = {
    d: 'day',
    w: 'week',
    m: 'month',
    y: 'year'
  };
  const unitLabel = unitLabelMap[unit] || unit;
  return `${count} ${unitLabel}${count === '1' ? '' : 's'}`;
}

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(dateString) {
  if (typeof dateString !== 'string' || !DATE_ONLY_REGEX.test(dateString)) {
    return null;
  }
  const [year, month, day] = dateString.split('-').map(Number);
  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null;
  }
  return parsed;
}

function formatDateOnly(dateObj) {
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
}

function toDateOnlyString(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (DATE_ONLY_REGEX.test(trimmed)) {
      return trimmed;
    }
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return match[1];
    }
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateOnly(value);
  }

  return null;
}

function getDueDaysOffset(createdAt, dueDate) {
  const createdAtDateOnly = toDateOnlyString(createdAt);
  const dueDateOnly = toDateOnlyString(dueDate);
  if (!createdAtDateOnly || !dueDateOnly) {
    return '';
  }

  const created = parseDateOnly(createdAtDateOnly);
  const due = parseDateOnly(dueDateOnly);
  if (!created || !due) {
    return '';
  }

  const days = Math.round((due.getTime() - created.getTime()) / (24 * 60 * 60 * 1000));
  return Number.isInteger(days) && days >= 0 ? String(days) : '';
}

function buildDueDateFromOffset(createdAt, dueDays) {
  const parsedDays = Number.parseInt(dueDays, 10);
  if (!Number.isInteger(parsedDays) || parsedDays < 0) {
    return null;
  }

  const baseDateOnly = toDateOnlyString(createdAt) || formatDateOnly(new Date());
  const baseDate = parseDateOnly(baseDateOnly);
  if (!baseDate) {
    return null;
  }

  const target = new Date(baseDate);
  target.setDate(target.getDate() + parsedDays);
  return formatDateOnly(target);
}

const defaultScheduleForm = {
  chore_id: '',
  user_id: '',
  scheduleMode: 'preset',
  selectedPreset: '0 0 * * *',
  selectedDays: [],
  customCrontab: '',
  isOneTime: false,
  duration: 'day-of',
  sleepCount: '',
  sleepUnit: 'd',
  visible: true,
  due_date: '',
  due_days: '',
  due_time: '',
  sound_enabled: false,
  sound: '',
  reminder_interval_minutes: '',
  transferable: true,
  can_snooze: true
};

const defaultChoreForm = { title: '', description: '', clam_value: 0 };

export default function ChoreSchedulesTab({ saveMessage, setSaveMessage }) {
  const isMobile = useIsMobile();
  const [schedules, setSchedules] = useState([]);
  const [chores, setChores] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [scheduleForm, setScheduleForm] = useState(defaultScheduleForm);
  const [crontabError, setCrontabError] = useState(null);
  const [deleteScheduleDialog, setDeleteScheduleDialog] = useState({ open: false, schedule: null });
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [choreDialogOpen, setChoreDialogOpen] = useState(false);
  const [editingChore, setEditingChore] = useState(null);
  const [choreForm, setChoreForm] = useState(defaultChoreForm);
  const [deleteChoreDialog, setDeleteChoreDialog] = useState({ open: false, chore: null });
  const [savingChore, setSavingChore] = useState(false);

  const [filterUser, setFilterUser] = useState('');
  const [filterChore, setFilterChore] = useState('');

  const showMessage = (type, text) => {
    setSaveMessage({ show: true, type, text });
    setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3500);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [schedulesRes, choresRes, usersRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/chore-schedules`),
        axios.get(`${API_BASE_URL}/api/chores`),
        axios.get(`${API_BASE_URL}/api/users`)
      ]);
      setSchedules(Array.isArray(schedulesRes.data) ? schedulesRes.data : []);
      setChores(Array.isArray(choresRes.data) ? choresRes.data : []);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data.filter(u => u.id !== 0) : []);
    } catch (err) {
      console.error('Error loading chore data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const computeCrontab = (f) => {
    if (f.isOneTime) return '';
    if (f.scheduleMode === 'preset') return f.selectedPreset;
    if (f.scheduleMode === 'days') return f.selectedDays.length > 0 ? daysToCrontab(f.selectedDays) : '';
    return f.customCrontab;
  };

  const updateScheduleForm = (updates) => {
    setScheduleForm(prev => {
      const next = { ...prev, ...updates };
      const cron = computeCrontab(next);
      setCrontabError(next.isOneTime ? null : validateCrontab(cron));
      return next;
    });
  };

  const openCreateSchedule = () => {
    setEditingSchedule(null);
    setScheduleForm(defaultScheduleForm);
    setCrontabError(null);
    setScheduleDialogOpen(true);
  };

  const openEditSchedule = (schedule) => {
    setEditingSchedule(schedule);
    const isOneTime = !schedule.crontab;
    let scheduleMode = 'preset';
    let selectedPreset = '0 0 * * *';
    let selectedDays = [];
    let customCrontab = '';

    if (!isOneTime) {
      const preset = CRONTAB_PRESETS.find(p => p.value === schedule.crontab);
      if (preset) {
        scheduleMode = 'preset';
        selectedPreset = preset.value;
      } else {
        const daysMatch = schedule.crontab.match(/^0 0 \* \* ([\d,]+)$/);
        if (daysMatch) {
          scheduleMode = 'days';
          selectedDays = daysMatch[1].split(',').map(Number);
        } else {
          scheduleMode = 'custom';
          customCrontab = schedule.crontab;
        }
      }
    }

    setScheduleForm({
      chore_id: schedule.chore_id,
      user_id: schedule.user_id ?? '',
      scheduleMode,
      selectedPreset,
      selectedDays,
      customCrontab,
      isOneTime,
      duration: schedule.duration || 'day-of',
      sleepCount: schedule.interval ? (schedule.interval.match(/^(\d+)/)?.[1] || '') : '',
      sleepUnit: schedule.interval ? (schedule.interval.match(/[dwmy]$/i)?.[0].toLowerCase() || 'd') : 'd',
      visible: !!schedule.visible,
      due_date: schedule.due_date || '',
      due_days: !isOneTime ? getDueDaysOffset(schedule.created_at, schedule.due_date) : '',
      due_time: schedule.due_time || '',
      sound_enabled: !!schedule.sound_enabled,
      sound: schedule.sound || '',
      reminder_interval_minutes: schedule.reminder_interval_minutes ? String(schedule.reminder_interval_minutes) : '',
      // Pre-migration rows may lack these columns; treat missing as enabled.
      transferable: schedule.transferable === undefined ? true : !!schedule.transferable,
      can_snooze: schedule.can_snooze === undefined ? true : !!schedule.can_snooze
    });
    setCrontabError(null);
    setScheduleDialogOpen(true);
  };

  const openCopySchedule = (schedule) => {
    openEditSchedule({ ...schedule });
    setEditingSchedule(null);
  };

  const handleSaveSchedule = async () => {
    const cron = computeCrontab(scheduleForm);
    const err = scheduleForm.isOneTime ? null : validateCrontab(cron);
    if (err) { setCrontabError(err); return; }

    setSavingSchedule(true);
    try {
      const normalizedInterval = !scheduleForm.isOneTime && scheduleForm.duration === 'once-completed'
        ? `${scheduleForm.sleepCount}${scheduleForm.sleepUnit}`
        : null;

      const normalizedDueDate = scheduleForm.isOneTime
        ? (scheduleForm.due_date || null)
        : (scheduleForm.due_days === ''
          ? null
          : buildDueDateFromOffset(editingSchedule?.created_at || new Date(), scheduleForm.due_days));

      if (!scheduleForm.isOneTime && scheduleForm.due_days !== '' && !normalizedDueDate) {
        showMessage('error', 'Days until due must be a non-negative whole number.');
        return;
      }

      const payload = {
        chore_id: scheduleForm.chore_id,
        user_id: scheduleForm.user_id === '' ? null : scheduleForm.user_id,
        crontab: cron || null,
        duration: !scheduleForm.isOneTime ? scheduleForm.duration : 'day-of',
        interval: normalizedInterval,
        visible: scheduleForm.visible ? 1 : 0,
        due_date: normalizedDueDate,
        due_time: scheduleForm.due_time || null,
        sound_enabled: scheduleForm.sound_enabled ? 1 : 0,
        sound: scheduleForm.sound_enabled ? (scheduleForm.sound || null) : null,
        reminder_interval_minutes: scheduleForm.sound_enabled && scheduleForm.reminder_interval_minutes
          ? parseInt(scheduleForm.reminder_interval_minutes, 10)
          : null,
        transferable: scheduleForm.transferable ? 1 : 0,
        can_snooze: scheduleForm.can_snooze ? 1 : 0
      };

      if (editingSchedule) {
        await axios.patch(`${API_BASE_URL}/api/chore-schedules/${editingSchedule.id}`, payload);
        showMessage('success', 'Schedule updated.');
      } else {
        await axios.post(`${API_BASE_URL}/api/chore-schedules`, payload);
        showMessage('success', 'Schedule created.');
      }
      setScheduleDialogOpen(false);
      await fetchAll();
    } catch (err) {
      showMessage('error', err.response?.data?.error || 'Failed to save schedule.');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleToggleVisible = async (schedule) => {
    try {
      await axios.patch(`${API_BASE_URL}/api/chore-schedules/${schedule.id}`, {
        visible: schedule.visible ? 0 : 1
      });
      await fetchAll();
    } catch (err) {
      console.error('Error toggling visibility:', err);
    }
  };

  const handleDeleteSchedule = async () => {
    const s = deleteScheduleDialog.schedule;
    try {
      await axios.delete(`${API_BASE_URL}/api/chore-schedules/${s.id}`);
      setDeleteScheduleDialog({ open: false, schedule: null });
      await fetchAll();
      showMessage('success', 'Schedule deleted.');
    } catch {
      showMessage('error', 'Failed to delete schedule.');
    }
  };

  const openCreateChore = () => {
    setEditingChore(null);
    setChoreForm(defaultChoreForm);
    setChoreDialogOpen(true);
  };

  const openEditChore = (chore) => {
    setEditingChore(chore);
    setChoreForm({ title: chore.title, description: chore.description || '', clam_value: chore.clam_value || 0 });
    setChoreDialogOpen(true);
  };

  const handleSaveChore = async () => {
    if (!choreForm.title.trim()) return;
    setSavingChore(true);
    try {
      if (editingChore) {
        await axios.patch(`${API_BASE_URL}/api/chores/${editingChore.id}`, choreForm);
        showMessage('success', 'Chore updated.');
      } else {
        await axios.post(`${API_BASE_URL}/api/chores`, choreForm);
        showMessage('success', 'Chore created.');
      }
      setChoreDialogOpen(false);
      await fetchAll();
    } catch (err) {
      showMessage('error', err.response?.data?.error || 'Failed to save chore.');
    } finally {
      setSavingChore(false);
    }
  };

  const handleDeleteChore = async () => {
    const c = deleteChoreDialog.chore;
    try {
      await axios.delete(`${API_BASE_URL}/api/chores/${c.id}`);
      setDeleteChoreDialog({ open: false, chore: null });
      await fetchAll();
      showMessage('success', 'Chore and its schedules deleted.');
    } catch {
      showMessage('error', 'Failed to delete chore.');
    }
  };

  const getUserName = (userId) => {
    if (userId === null || userId === undefined || userId === 0) return 'Unassigned';
    const user = users.find(u => u.id === userId);
    return user ? user.username : `User #${userId}`;
  };

  const getScheduleCountForChore = (choreId) =>
    schedules.filter(s => s.chore_id === choreId).length;

  const filteredSchedules = schedules.filter(s => {
    if (filterUser && String(s.user_id) !== String(filterUser)) return false;
    if (filterChore && String(s.chore_id) !== String(filterChore)) return false;
    return true;
  });

  const currentCrontab = computeCrontab(scheduleForm);
  const nextOccurrence = getNextOccurrence(currentCrontab);
  const isOnceCompletedMissingInterval = !scheduleForm.isOneTime
    && scheduleForm.duration === 'once-completed'
    && !(Number.isInteger(Number.parseInt(scheduleForm.sleepCount, 10)) && Number.parseInt(scheduleForm.sleepCount, 10) > 0);

  const parsedDueDays = Number.parseInt(scheduleForm.due_days, 10);
  const hasInvalidDueDays = !scheduleForm.isOneTime
    && scheduleForm.due_days !== ''
    && (!Number.isInteger(parsedDueDays) || parsedDueDays < 0);

  const isScheduleSaveDisabled = savingSchedule
    || !scheduleForm.chore_id
    || (!scheduleForm.isOneTime && !!crontabError)
    || (!scheduleForm.isOneTime && scheduleForm.scheduleMode === 'custom' && !scheduleForm.customCrontab.trim())
    || isOnceCompletedMissingInterval
    || hasInvalidDueDays;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {saveMessage?.show && (
        <Alert severity={saveMessage.type} sx={{ mb: 2 }}>
          {saveMessage.text}
        </Alert>
      )}

      {/* ── CHORE DEFINITIONS ────────────────────────────── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="h6">Chore Definitions</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<Refresh />} onClick={fetchAll} variant="outlined" size="small">
            Refresh
          </Button>
          <Button startIcon={<Add />} onClick={openCreateChore} variant="contained" size="small">
            New Chore
          </Button>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        Chore definitions hold the title, description, and clam value. Add schedules below to assign them to users with a recurrence pattern.
      </Alert>

      <TableContainer component={Paper} sx={{ mb: 4 }}>
        <Table size="small" sx={stackableTableSx}>
          <TableHead>
            <TableRow>
              <TableCell>Title</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Clams</TableCell>
              <TableCell>Schedules</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {chores.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                  <Typography color="text.secondary">No chores defined yet.</Typography>
                </TableCell>
              </TableRow>
            ) : (
              chores.map(c => (
                <TableRow key={c.id}>
                  <TableCell data-label="Title">
                    <Typography variant="body2" fontWeight="bold">{c.title}</Typography>
                  </TableCell>
                  <TableCell data-label="Description">
                    <Typography variant="body2" color="text.secondary">
                      {c.description || <em style={{ opacity: 0.5 }}>No description</em>}
                    </Typography>
                  </TableCell>
                  <TableCell data-label="Clams">
                    {c.clam_value > 0
                      ? <Chip label={`${c.clam_value} 🥟`} size="small" color="primary" />
                      : <Typography variant="caption" color="text.secondary">—</Typography>}
                  </TableCell>
                  <TableCell data-label="Schedules">
                    <Chip
                      label={`${getScheduleCountForChore(c.id)} schedule${getScheduleCountForChore(c.id) !== 1 ? 's' : ''}`}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Edit chore">
                        <IconButton size="small" color="primary" onClick={() => openEditChore(c)}>
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete chore and all its schedules">
                        <IconButton size="small" color="error" onClick={() => setDeleteChoreDialog({ open: true, chore: c })}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ── SCHEDULES ────────────────────────────────────── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="h6">Schedules</Typography>
        <Button startIcon={<Add />} onClick={openCreateSchedule} variant="contained" size="small">
          New Schedule
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        Schedules link chores to users and specify when they recur. A chore can have multiple schedules for different users or frequencies.
      </Alert>

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Filter by User</InputLabel>
          <Select value={filterUser} label="Filter by User" onChange={(e) => setFilterUser(e.target.value)}>
            <MenuItem value="">All Users</MenuItem>
            <MenuItem value="0">Unassigned (Bonus)</MenuItem>
            {users.map(u => <MenuItem key={u.id} value={u.id}>{u.username}</MenuItem>)}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Filter by Chore</InputLabel>
          <Select value={filterChore} label="Filter by Chore" onChange={(e) => setFilterChore(e.target.value)}>
            <MenuItem value="">All Chores</MenuItem>
            {chores.map(c => <MenuItem key={c.id} value={c.id}>{c.title}</MenuItem>)}
          </Select>
        </FormControl>

        {(filterUser || filterChore) && (
          <Button size="small" onClick={() => { setFilterUser(''); setFilterChore(''); }}>
            Clear Filters
          </Button>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center', ml: 'auto' }}>
          {filteredSchedules.length} schedule{filteredSchedules.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small" sx={stackableTableSx}>
          <TableHead>
            <TableRow>
              <TableCell>Chore</TableCell>
              <TableCell>Assigned To</TableCell>
              <TableCell>Next Occurrence</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>Clams</TableCell>
              <TableCell>Visible</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredSchedules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">No schedules found.</Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredSchedules.map((s) => (
                <TableRow key={s.id} sx={{ opacity: s.visible ? 1 : 0.5 }}>
                  <TableCell data-label="Chore">
                    <Box>
                      <Typography variant="body2" fontWeight="bold">{s.title}</Typography>
                      {s.description && (
                        <Typography variant="caption" color="text.secondary">{s.description}</Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell data-label="Assigned To">
                    <Chip
                      label={getUserName(s.user_id)}
                      size="small"
                      variant={s.user_id ? 'filled' : 'outlined'}
                      color={s.user_id ? 'primary' : 'default'}
                    />
                  </TableCell>
                  {/* Crontab column removed (issue #122): the raw expression is
                      redundant next to Next Occurrence and still visible when
                      editing the schedule. */}
                  <TableCell data-label="Next Occurrence">
                    <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                      {getNextOccurrence(s.crontab)}
                    </Typography>
                  </TableCell>
                  <TableCell data-label="Duration">
                    {s.crontab && s.duration === 'until-completed' ? (
                      <Chip label="Until Completed" size="small" color="warning" />
                    ) : s.crontab && s.duration === 'once-completed' ? (
                      <Chip label={`Once Completed${s.interval ? ` (${formatScheduleInterval(s.interval)})` : ''}`} size="small" color="secondary" />
                    ) : s.crontab ? (
                      <Chip label="Day Of" size="small" variant="outlined" />
                    ) : (
                      <Typography variant="caption" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell data-label="Clams">
                    {s.clam_value > 0
                      ? <Chip label={`${s.clam_value} 🥟`} size="small" color="primary" />
                      : <Typography variant="caption" color="text.secondary">—</Typography>}
                  </TableCell>
                  <TableCell data-label="Visible">
                    <Tooltip title={s.visible ? 'Click to hide' : 'Click to show'}>
                      <Switch size="small" checked={!!s.visible} onChange={() => handleToggleVisible(s)} />
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Edit">
                        <IconButton size="small" color="primary" onClick={() => openEditSchedule(s)}>
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Duplicate">
                        <IconButton size="small" onClick={() => openCopySchedule(s)}>
                          <ContentCopy fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => setDeleteScheduleDialog({ open: true, schedule: s })}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ── CHORE DIALOG ─────────────────────────────────── */}
      <Dialog
        open={choreDialogOpen}
        onClose={() => setChoreDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        slotProps={{
          paper: {
            component: 'form',
            onSubmit: (event) => {
              event.preventDefault();
              handleSaveChore();
            },
          }
        }}
      >
        <DialogTitle>{editingChore ? 'Edit Chore' : 'New Chore'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              fullWidth
              size="small"
              label="Title"
              value={choreForm.title}
              onChange={(e) => setChoreForm(f => ({ ...f, title: e.target.value }))}
              required
            />
            <TextField
              fullWidth
              size="small"
              label="Description"
              value={choreForm.description}
              onChange={(e) => setChoreForm(f => ({ ...f, description: e.target.value }))}
              multiline
              rows={2}
            />
            <TextField
              size="small"
              label="Clam Value"
              type="number"
              value={choreForm.clam_value}
              onChange={(e) => setChoreForm(f => ({ ...f, clam_value: parseInt(e.target.value) || 0 }))}
              slotProps={{ htmlInput: { min: 0 } }}
              sx={{ width: { xs: '100%', sm: 140 } }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={() => setChoreDialogOpen(false)} startIcon={<Cancel />}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            startIcon={savingChore ? <CircularProgress size={16} /> : <Save />}
            disabled={savingChore || !choreForm.title.trim()}
          >
            {savingChore ? 'Saving...' : editingChore ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── DELETE CHORE DIALOG ───────────────────────────── */}
      <Dialog open={deleteChoreDialog.open} onClose={() => setDeleteChoreDialog({ open: false, chore: null })} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warning color="error" />
            Delete Chore
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This will permanently delete the chore and all {getScheduleCountForChore(deleteChoreDialog.chore?.id)} schedule(s) linked to it. Completion history is preserved.
          </Alert>
          <Typography variant="body2">
            Delete <strong>{deleteChoreDialog.chore?.title}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteChoreDialog({ open: false, chore: null })}>Cancel</Button>
          <Button onClick={handleDeleteChore} variant="contained" color="error" startIcon={<Delete />}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── SCHEDULE DIALOG ───────────────────────────────── */}
      <Dialog
        open={scheduleDialogOpen}
        onClose={() => setScheduleDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        slotProps={{
          paper: {
            component: 'form',
            onSubmit: (event) => {
              event.preventDefault();
              handleSaveSchedule();
            },
          }
        }}
      >
        <DialogTitle>{editingSchedule ? 'Edit Schedule' : 'New Schedule'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <FormControl fullWidth size="small" required>
              <InputLabel>Chore</InputLabel>
              <Select
                value={scheduleForm.chore_id}
                label="Chore"
                onChange={(e) => updateScheduleForm({ chore_id: e.target.value })}
              >
                {chores.map(c => (
                  <MenuItem key={c.id} value={c.id}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <span>{c.title}</span>
                      {c.clam_value > 0 && <Chip label={`${c.clam_value} 🥟`} size="small" sx={{ ml: 1 }} />}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel>Assigned To</InputLabel>
              <Select
                value={scheduleForm.user_id}
                label="Assigned To"
                onChange={(e) => updateScheduleForm({ user_id: e.target.value })}
              >
                <MenuItem value="">Unassigned (Bonus chore)</MenuItem>
                {users.map(u => <MenuItem key={u.id} value={u.id}>{u.username}</MenuItem>)}
              </Select>
            </FormControl>

            <Divider />

            <FormControlLabel
              control={
                <Switch
                  checked={scheduleForm.isOneTime}
                  onChange={(e) => updateScheduleForm({ isOneTime: e.target.checked })}
                />
              }
              label="One-time task (no recurrence)"
            />

            {!scheduleForm.isOneTime && (
              <>
                <RadioGroup
                  row
                  value={scheduleForm.scheduleMode}
                  onChange={(e) => updateScheduleForm({ scheduleMode: e.target.value })}
                >
                  <FormControlLabel value="preset" control={<Radio size="small" />} label="Preset" />
                  <FormControlLabel value="days" control={<Radio size="small" />} label="Days of Week" />
                  <FormControlLabel value="custom" control={<Radio size="small" />} label="Custom Crontab" />
                </RadioGroup>

                <FormControl fullWidth size="small">
                  <InputLabel>Duration</InputLabel>
                  <Select
                    value={scheduleForm.duration}
                    label="Duration"
                    onChange={(e) => updateScheduleForm({ duration: e.target.value })}
                  >
                    <MenuItem value="day-of">Day Of</MenuItem>
                    <MenuItem value="until-completed">Until Completed</MenuItem>
                    <MenuItem value="once-completed">Once Completed</MenuItem>
                  </Select>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
                    {scheduleForm.duration === 'until-completed'
                      ? 'This chore will appear daily until completed'
                      : scheduleForm.duration === 'once-completed'
                        ? 'This chore appears after a delay each time it is completed'
                        : 'This chore will only appear on the day it is scheduled'}
                  </Typography>
                </FormControl>

                {scheduleForm.duration === 'once-completed' && (
                  <Grid container spacing={2}>
                    <Grid size={6}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Sleep Count"
                        value={scheduleForm.sleepCount}
                        onChange={(e) => {
                          const digitsOnly = e.target.value.replace(/\D/g, '');
                          updateScheduleForm({ sleepCount: digitsOnly });
                        }}
                        slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*', min: 1 } }}
                        error={isOnceCompletedMissingInterval}
                        helperText={isOnceCompletedMissingInterval ? 'Required. Use digits only.' : 'Number of time units to wait.'}
                      />
                    </Grid>
                    <Grid size={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Sleep Unit</InputLabel>
                        <Select
                          value={scheduleForm.sleepUnit}
                          label="Sleep Unit"
                          onChange={(e) => updateScheduleForm({ sleepUnit: e.target.value })}
                        >
                          <MenuItem value="d">Days</MenuItem>
                          <MenuItem value="w">Weeks</MenuItem>
                          <MenuItem value="m">Months</MenuItem>
                          <MenuItem value="y">Years</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                )}

                {scheduleForm.scheduleMode === 'preset' && (
                  <FormControl fullWidth size="small">
                    <InputLabel>Schedule Preset</InputLabel>
                    <Select
                      value={scheduleForm.selectedPreset}
                      label="Schedule Preset"
                      onChange={(e) => updateScheduleForm({ selectedPreset: e.target.value })}
                    >
                      {CRONTAB_PRESETS.map(p => (
                        <MenuItem key={p.label} value={p.value}>
                          <Box>
                            <Typography variant="body2">{p.label}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                              {p.value}
                            </Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}

                {scheduleForm.scheduleMode === 'days' && (
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Select which days this chore should appear:
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {DAY_OPTIONS.map(day => (
                        <Chip
                          key={day.value}
                          label={day.label}
                          clickable
                          color={scheduleForm.selectedDays.includes(day.value) ? 'primary' : 'default'}
                          variant={scheduleForm.selectedDays.includes(day.value) ? 'filled' : 'outlined'}
                          onClick={() => {
                            const next = scheduleForm.selectedDays.includes(day.value)
                              ? scheduleForm.selectedDays.filter(d => d !== day.value)
                              : [...scheduleForm.selectedDays, day.value];
                            updateScheduleForm({ selectedDays: next });
                          }}
                          size="small"
                        />
                      ))}
                    </Box>
                    {scheduleForm.selectedDays.length > 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontFamily: 'monospace' }}>
                        Generated: {daysToCrontab(scheduleForm.selectedDays)}
                      </Typography>
                    )}
                    {scheduleForm.selectedDays.length === 0 && (
                      <Alert severity="warning" sx={{ mt: 1 }}>
                        Select at least one day, or use the "One-time task" toggle above.
                      </Alert>
                    )}
                  </Box>
                )}

                {scheduleForm.scheduleMode === 'custom' && (
                  <TextField
                    fullWidth
                    size="small"
                    label="Crontab Expression"
                    value={scheduleForm.customCrontab}
                    onChange={(e) => updateScheduleForm({ customCrontab: e.target.value })}
                    placeholder="0 0 * * 1"
                    error={!!crontabError}
                    helperText={crontabError || 'Format: minute hour day-of-month month day-of-week'}
                    InputProps={{ sx: { fontFamily: 'monospace' } }}
                  />
                )}
              </>
            )}

            {!crontabError && (
              <Alert severity={scheduleForm.isOneTime ? 'warning' : 'info'} icon={<Schedule />} sx={{ py: 0.5 }}>
                <Typography variant="body2">
                  <strong>{scheduleForm.isOneTime ? 'One-time task' : `Next occurrence: ${nextOccurrence}`}</strong>
                </Typography>
                {!scheduleForm.isOneTime && currentCrontab && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    {currentCrontab}
                  </Typography>
                )}
                {scheduleForm.isOneTime && (
                  <Typography variant="caption" color="text.secondary">
                    This chore will appear once and hide itself after completion.
                  </Typography>
                )}
              </Alert>
            )}

            <Divider />

            {scheduleForm.isOneTime ? (
              <TextField
                label="Due date (optional)"
                type="date"
                size="small"
                value={scheduleForm.due_date}
                onChange={(e) => updateScheduleForm({ due_date: e.target.value })}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { placeholder: '' }
                }}
                helperText="Calendar deadline. The chore turns yellow when due, red when overdue."
                sx={{
                  maxWidth: 260,
                  '& input[type="date"]:not(:focus):invalid::-webkit-datetime-edit': {
                    color: 'transparent'
                  }
                }}
              />
            ) : (
              <TextField
                label="Days until chore is due"
                type="number"
                size="small"
                value={scheduleForm.due_days}
                onChange={(e) => {
                  const nextValue = e.target.value.replace(/\D/g, '');
                  updateScheduleForm({ due_days: nextValue });
                }}
                helperText="Leave blank for no due date. This sets a relative due-date offset for recurring chores."
                error={hasInvalidDueDays}
                slotProps={{ htmlInput: { min: 0, step: 1, inputMode: 'numeric', pattern: '[0-9]*' } }}
                sx={{ maxWidth: 280 }}
              />
            )}

            <TextField
              label="Due time (optional)"
              type="time"
              size="small"
              value={scheduleForm.due_time}
              onChange={(e) => updateScheduleForm({ due_time: e.target.value })}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { placeholder: '' }
              }}
              helperText="Time of day this chore is due. Required to play a sound."
              sx={{
                maxWidth: 220,
                '& input[type="time"]:not(:focus):invalid::-webkit-datetime-edit': {
                  color: 'transparent'
                }
              }}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={scheduleForm.sound_enabled}
                  onChange={(e) => updateScheduleForm({ sound_enabled: e.target.checked })}
                  disabled={!scheduleForm.due_time}
                />
              }
              label="Play sound when due"
            />

            {scheduleForm.sound_enabled && scheduleForm.due_time && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pl: 1 }}>
                <SoundPicker
                  label="Sound"
                  value={scheduleForm.sound}
                  onChange={(sound) => updateScheduleForm({ sound })}
                  includeNoneOption
                  noneLabel="Use default sound"
                  hideEmptyDisplay
                  allowDelete
                />
                <TextField
                  label="Repeat reminder every (minutes)"
                  type="number"
                  size="small"
                  value={scheduleForm.reminder_interval_minutes}
                  onChange={(e) => updateScheduleForm({ reminder_interval_minutes: e.target.value })}
                  helperText="Leave blank to ring once. Reminders repeat until the chore is completed."
                  inputProps={{ min: 0 }}
                  sx={{ maxWidth: 280 }}
                />
              </Box>
            )}

            <Divider />

            {/* Gates for the dashboard long-press menu (issue #122). */}
            <FormControlLabel
              control={
                <Switch
                  checked={scheduleForm.transferable}
                  onChange={(e) => updateScheduleForm({ transferable: e.target.checked })}
                />
              }
              label="Transferable"
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5, ml: 6 }}>
              Allows reassignment from the dashboard.
            </Typography>

            <FormControlLabel
              control={
                <Switch
                  checked={scheduleForm.can_snooze}
                  onChange={(e) => updateScheduleForm({ can_snooze: e.target.checked })}
                />
              }
              label="Can snooze/defer"
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5, ml: 6 }}>
              Allows the scheduled time to be deferred by a set time.
            </Typography>

            <Divider />

            <FormControlLabel
              control={
                <Switch
                  checked={scheduleForm.visible}
                  onChange={(e) => updateScheduleForm({ visible: e.target.checked })}
                />
              }
              label="Visible (active)"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={() => setScheduleDialogOpen(false)} startIcon={<Cancel />}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            startIcon={savingSchedule ? <CircularProgress size={16} /> : <Save />}
            disabled={isScheduleSaveDisabled}
          >
            {savingSchedule ? 'Saving...' : editingSchedule ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── DELETE SCHEDULE DIALOG ────────────────────────── */}
      <Dialog open={deleteScheduleDialog.open} onClose={() => setDeleteScheduleDialog({ open: false, schedule: null })} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>Delete Schedule</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This will permanently delete this schedule. Completion history is preserved.
          </Alert>
          <Typography variant="body2">
            Delete schedule for <strong>{deleteScheduleDialog.schedule?.title}</strong> assigned to{' '}
            <strong>{getUserName(deleteScheduleDialog.schedule?.user_id)}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteScheduleDialog({ open: false, schedule: null })}>Cancel</Button>
          <Button onClick={handleDeleteSchedule} variant="contained" color="error" startIcon={<Delete />}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
