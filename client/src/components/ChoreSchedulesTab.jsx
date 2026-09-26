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
  TableSortLabel,
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
, Checkbox, ListItemText } from "@mui/material";
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
import SoundPicker from './SoundPicker.jsx';
import ChoreIconPicker from './ChoreIconPicker.jsx';
import ChoreScheduleFields from './ChoreScheduleFields.jsx';
import { useTranslation } from 'react-i18next';
import useIsMobile from '../hooks/useIsMobile.js';
import { stackableTableSx } from '../utils/responsiveTable.js';
import {
  CRONTAB_PRESETS,
  DEFAULT_SCHEDULE_FIELDS,
  getNextOccurrence,
  nextOccurrenceAt,
  validateCrontab,
  formatScheduleInterval,
  computeCrontab,
  updateScheduleFormHelper,
  isScheduleFormInvalid
} from '../utils/choreScheduleUtils.js';
import { compareByKey } from '../utils/choreHelpers.js';

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

// A header cell that re-sorts its table. `sortDirection` on the cell is what
// puts `aria-sort` on the <th>, so the state is announced without a second
// visually-hidden copy of it.
function SortableHeader({ column, sort, onSort, children }) {
  const active = sort.column === column;
  return (
    <TableCell sortDirection={active ? sort.direction : false}>
      <TableSortLabel
        active={active}
        direction={active ? sort.direction : 'asc'}
        onClick={() => onSort(column)}
      >
        {children}
      </TableSortLabel>
    </TableCell>
  );
}

// Clicking the active column flips it; clicking a new one starts ascending,
// which is the reading order for names and "soonest first" for dates.
function nextSort(sort, column) {
  if (sort.column !== column) return { column, direction: 'asc' };
  return { column, direction: sort.direction === 'asc' ? 'desc' : 'asc' };
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
  user_id: '', user_ids: [],
  ...DEFAULT_SCHEDULE_FIELDS,
  visible: true,
  due_date: '',
  due_days: '',
  due_time: '',
  sound_enabled: false,
  sound: '',
  reminder_interval_minutes: '',
  transferable: true,
  can_snooze: true,
};

const defaultChoreForm = { title: '', description: '', clam_value: 0, icon: '' };

export default function ChoreSchedulesTab({ saveMessage, setSaveMessage }) {
  const { t } = useTranslation(['chores', 'common']);
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

  const [choreSort, setChoreSort] = useState({ column: 'title', direction: 'asc' });
  const [scheduleSort, setScheduleSort] = useState({ column: 'chore', direction: 'asc' });
  const sortChores = column => setChoreSort(prev => nextSort(prev, column));
  const sortSchedules = column => setScheduleSort(prev => nextSort(prev, column));

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

  const updateScheduleForm = (updates) => {
    setScheduleForm(prev => {
      const { next, crontabError: err } = updateScheduleFormHelper(prev, updates);
      setCrontabError(err);
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
    const isCalendar = !!schedule.calendar_match;
    const isOneTime = !schedule.crontab && !isCalendar;
    const isOnceCompleted = schedule.duration === 'once-completed';
    let scheduleMode = isCalendar ? 'calendar' : 'preset';
    let selectedPreset = '0 0 * * *';
    let selectedDays = [];
    let customCrontab = '';

    if (isCalendar) {
      scheduleMode = 'calendar';
    } else if (isOnceCompleted) {
      scheduleMode = 'after-completion';
      customCrontab = schedule.crontab || '0 0 * * *';
    } else if (!isOneTime && schedule.crontab) {
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
      user_ids: [],
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
      can_snooze: schedule.can_snooze === undefined ? true : !!schedule.can_snooze,
      calendar_match: schedule.calendar_match || ''
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
    const isCalendarMode = !scheduleForm.isOneTime && scheduleForm.scheduleMode === 'calendar';
    const isAfterCompletionMode = !scheduleForm.isOneTime && scheduleForm.scheduleMode === 'after-completion';
    const err = (scheduleForm.isOneTime || isCalendarMode || isAfterCompletionMode) ? null : validateCrontab(cron);
    if (err) { setCrontabError(err); return; }

    setSavingSchedule(true);
    try {
      const isIntervalSchedule = !scheduleForm.isOneTime && (isAfterCompletionMode || scheduleForm.duration === 'once-completed');
      const normalizedInterval = isIntervalSchedule
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

      const isMultiCreate = !editingSchedule && Array.isArray(scheduleForm.user_ids) && scheduleForm.user_ids.length > 0;
      const durationValue = !scheduleForm.isOneTime
        ? (isAfterCompletionMode ? 'once-completed' : scheduleForm.duration)
        : 'day-of';

      const payload = {
        chore_id: scheduleForm.chore_id,
        ...(isMultiCreate ? { user_ids: scheduleForm.user_ids } : { user_id: scheduleForm.user_id === '' ? null : scheduleForm.user_id }),
        crontab: (scheduleForm.duration === 'once-completed' || scheduleForm.isOneTime || isCalendarMode) ? null : (cron || null),
        duration: durationValue,
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
        can_snooze: scheduleForm.can_snooze ? 1 : 0,
        calendar_match: isCalendarMode ? (scheduleForm.calendar_match?.trim() || null) : null
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
    setChoreForm({
      title: chore.title,
      description: chore.description || '',
      clam_value: chore.clam_value || 0,
      icon: chore.icon || '',
    });
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
    return user ? user.username : t('chores:schedules.unknownUser', { id: userId });
  };

  const getScheduleCountForChore = (choreId) =>
    schedules.filter(s => s.chore_id === choreId).length;

  // What each sortable column orders by, which is not what the cell draws:
  // clams and the schedule count are numbers behind chips, and Next Occurrence
  // is a date behind a localized label (or a calendar pill behind "today").
  //
  // A column is here only if ordering by it answers a question someone asks.
  // Description is free text and usually blank; Duration is four modes with no
  // natural order rather than a length; Visible is a live Switch, so sorting by
  // it would slide the row out from under the click that toggled it.
  const choreSortKeys = {
    title: c => String(c?.title ?? ''),
    clams: c => Number(c?.clam_value ?? 0),
    schedules: c => getScheduleCountForChore(c?.id),
  };

  const scheduleSortKeys = {
    chore: s => String(s?.title ?? ''),
    assignedTo: s => getUserName(s?.user_id),
    nextOccurrence: s => nextOccurrenceAt(s?.crontab, s)?.getTime() ?? null,
    clams: s => Number(s?.clam_value ?? 0),
  };

  // Both admin tables list alphabetically by default. The APIs return insertion
  // order, which is unscannable once a household has more than a few chores.
  //
  // Each row's key is computed once rather than inside the comparator, which
  // would re-parse a crontab on every one of the O(n log n) comparisons.
  const sortRows = (rows, keys, sort) => {
    // The first key is the column the table opens on, and the fallback for a
    // state that somehow names a column this table does not have.
    const keyOf = keys[sort.column] ?? Object.values(keys)[0];
    const keyed = new Map(rows.map(r => [r.id, keyOf(r)]));
    return [...rows].sort((a, b) => compareByKey(a, b, r => keyed.get(r.id), sort.direction));
  };

  const sortedChores = sortRows(chores, choreSortKeys, choreSort);

  // The pickers stay alphabetical whatever the table above is sorted by: a
  // dropdown you hunt through by name should not reorder because someone
  // sorted the definitions table by clam value.
  const choresByTitle = sortRows(chores, choreSortKeys, { column: 'title', direction: 'asc' });

  const filteredSchedules = sortRows(schedules.filter(s => {
    if (filterUser && String(s.user_id) !== String(filterUser)) return false;
    if (filterChore && String(s.chore_id) !== String(filterChore)) return false;
    return true;
  }), scheduleSortKeys, scheduleSort);

  const parsedDueDays = Number.parseInt(scheduleForm.due_days, 10);
  const hasInvalidDueDays = !scheduleForm.isOneTime
    && scheduleForm.due_days !== ''
    && (!Number.isInteger(parsedDueDays) || parsedDueDays < 0);

  const isScheduleSaveDisabled = savingSchedule
    || !scheduleForm.chore_id
    || isScheduleFormInvalid(scheduleForm, crontabError)
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
        <Typography variant="h6">{t('chores:schedules.definitionsHeading')}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<Refresh />} onClick={fetchAll} variant="outlined" size="small">
            {t('common:actions.refresh')}
          </Button>
          <Button startIcon={<Add />} onClick={openCreateChore} variant="contained" size="small">
            {t('chores:schedules.newChore')}
          </Button>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        {t('chores:schedules.definitionsHelp')}
      </Alert>

      <TableContainer component={Paper} sx={{ mb: 4 }}>
        <Table size="small" sx={stackableTableSx}>
          <TableHead>
            <TableRow>
              <SortableHeader column="title" sort={choreSort} onSort={sortChores}>
                {t('common:labels.title')}
              </SortableHeader>
              <TableCell>{t('common:labels.description')}</TableCell>
              <SortableHeader column="clams" sort={choreSort} onSort={sortChores}>
                {t('chores:schedules.clams')}
              </SortableHeader>
              <SortableHeader column="schedules" sort={choreSort} onSort={sortChores}>
                {t('chores:schedules.schedulesColumn')}
              </SortableHeader>
              <TableCell>{t('common:labels.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {chores.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                  <Typography color="text.secondary">{t('chores:schedules.noChores')}</Typography>
                </TableCell>
              </TableRow>
            ) : (
              sortedChores.map(c => (
                <TableRow key={c.id}>
                  <TableCell data-label={t('common:labels.title')}>
                    <Typography variant="body2" fontWeight="bold">
                      {/* Inline rather than its own column: this table stacks
                          into rows on mobile, and an icon-only column would
                          become a near-empty labelled row down there. */}
                      {c.icon && <Box component="span" sx={{ mr: 0.75 }}>{c.icon}</Box>}
                      {c.title}
                    </Typography>
                  </TableCell>
                  <TableCell data-label={t('common:labels.description')}>
                    <Typography variant="body2" color="text.secondary">
                      <Box component="span" sx={{ whiteSpace: "pre-line" }}>{c.description || <em style={{ opacity: 0.5 }}>{t('chores:schedules.noDescription')}</em>}</Box>
                    </Typography>
                  </TableCell>
                  <TableCell data-label={t('chores:schedules.clams')}>
                    {c.clam_value > 0
                      ? <Chip label={`${c.clam_value} 🥟`} size="small" color="primary" />
                      : <Typography variant="caption" color="text.secondary">—</Typography>}
                  </TableCell>
                  <TableCell data-label={t('chores:schedules.schedulesColumn')}>
                    <Chip
                      label={`${getScheduleCountForChore(c.id)} schedule${getScheduleCountForChore(c.id) !== 1 ? 's' : ''}`}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title={t('chores:schedules.editChore')}>
                        <IconButton size="small" color="primary" onClick={() => openEditChore(c)}>
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('chores:schedules.deleteChoreAndSchedules')}>
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
        <Typography variant="h6">{t('chores:schedules.schedulesColumn')}</Typography>
        <Button startIcon={<Add />} onClick={openCreateSchedule} variant="contained" size="small">
          {t('chores:schedules.newSchedule')}
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        {t('chores:schedules.schedulesHelp')}
      </Alert>

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>{t('chores:schedules.filterByUser')}</InputLabel>
          <Select value={filterUser} label={t('chores:schedules.filterByUser')} onChange={(e) => setFilterUser(e.target.value)}>
            <MenuItem value="">{t('chores:schedules.allUsers')}</MenuItem>
            <MenuItem value="0">{t('chores:schedules.unassignedBonus')}</MenuItem>
            {users.map(u => <MenuItem key={u.id} value={u.id}>{u.username}</MenuItem>)}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>{t('chores:schedules.filterByChore')}</InputLabel>
          <Select value={filterChore} label={t('chores:schedules.filterByChore')} onChange={(e) => setFilterChore(e.target.value)}>
            <MenuItem value="">{t('chores:schedules.allChores')}</MenuItem>
            {choresByTitle.map(c => <MenuItem key={c.id} value={c.id}>{c.title}</MenuItem>)}
          </Select>
        </FormControl>

        {(filterUser || filterChore) && (
          <Button size="small" onClick={() => { setFilterUser(''); setFilterChore(''); }}>
            {t('chores:schedules.clearFilters')}
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
              <SortableHeader column="chore" sort={scheduleSort} onSort={sortSchedules}>
                {t('chores:schedules.chore')}
              </SortableHeader>
              <SortableHeader column="assignedTo" sort={scheduleSort} onSort={sortSchedules}>
                {t('chores:schedules.assignedTo')}
              </SortableHeader>
              <SortableHeader column="nextOccurrence" sort={scheduleSort} onSort={sortSchedules}>
                {t('chores:schedules.nextOccurrence')}
              </SortableHeader>
              <TableCell>{t('chores:schedules.duration')}</TableCell>
              <SortableHeader column="clams" sort={scheduleSort} onSort={sortSchedules}>
                {t('chores:schedules.clams')}
              </SortableHeader>
              <TableCell>{t('chores:schedules.visible')}</TableCell>
              <TableCell>{t('common:labels.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredSchedules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">{t('chores:schedules.noSchedules')}</Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredSchedules.map((s) => (
                <TableRow key={s.id} sx={{ opacity: s.visible ? 1 : 0.5 }}>
                  <TableCell data-label={t('chores:schedules.chore')}>
                    <Box>
                      <Typography variant="body2" fontWeight="bold">{s.title}</Typography>
                      {s.description && (
                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "pre-line" }}>{s.description}</Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell data-label={t('chores:schedules.assignedTo')}>
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
                  <TableCell data-label={t('chores:schedules.nextOccurrence')}>
                    <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                      {s.calendar_match ? (
                      <Chip
                        label={`📅 On: "${s.calendar_match}" ${s.calendar_matched_today ? '✓' : '✗'}`}
                        size="small"
                        color={s.calendar_matched_today ? "success" : "default"}
                        variant="outlined"
                        title={s.calendar_matched_today
                          ? 'Matches a calendar event today'
                          : 'No calendar event matches this keyword today — check the spelling against the event title'}
                      />
                    ) : getNextOccurrence(s.crontab, s)}
                    </Typography>
                  </TableCell>
                  <TableCell data-label={t('chores:schedules.duration')}>
                    {(s.crontab || s.calendar_match) && s.duration === 'until-completed' ? (
                      <Chip label={t('chores:schedules.untilCompleted')} size="small" color="warning" />
                    ) : (s.crontab || s.calendar_match) && s.duration === 'once-completed' ? (
                      <Chip label={s.interval
                          ? t('chores:schedules.onceCompletedWithInterval', { interval: formatScheduleInterval(s.interval) })
                          : t('chores:schedules.onceCompleted')} size="small" color="secondary" />
                    ) : (s.crontab || s.calendar_match) ? (
                      <Chip label={t('chores:schedules.dayOf')} size="small" variant="outlined" />
                    ) : (
                      <Typography variant="caption" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell data-label={t('chores:schedules.clams')}>
                    {s.clam_value > 0
                      ? <Chip label={`${s.clam_value} 🥟`} size="small" color="primary" />
                      : <Typography variant="caption" color="text.secondary">—</Typography>}
                  </TableCell>
                  <TableCell data-label={t('chores:schedules.visible')}>
                    <Tooltip title={s.visible ? 'Click to hide' : 'Click to show'}>
                      <Switch size="small" checked={!!s.visible} onChange={() => handleToggleVisible(s)} />
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title={t('common:actions.edit')}>
                        <IconButton size="small" color="primary" onClick={() => openEditSchedule(s)}>
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('common:actions.duplicate')}>
                        <IconButton size="small" onClick={() => openCopySchedule(s)}>
                          <ContentCopy fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('common:actions.delete')}>
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
              label={t('common:labels.title')}
              value={choreForm.title}
              onChange={(e) => setChoreForm(f => ({ ...f, title: e.target.value }))}
              required
            />
            <TextField
              fullWidth
              size="small"
              label={t('common:labels.description')}
              value={choreForm.description}
              onChange={(e) => setChoreForm(f => ({ ...f, description: e.target.value }))}
              multiline
              rows={2}
            />
            <TextField
              size="small"
              label={t('chores:schedules.clamValue')}
              type="number"
              value={choreForm.clam_value}
              onChange={(e) => setChoreForm(f => ({ ...f, clam_value: parseInt(e.target.value) || 0 }))}
              slotProps={{ htmlInput: { min: 0 } }}
              sx={{ width: { xs: '100%', sm: 140 } }}
            />
            {/* The icon belongs to the chore, not the schedule, so it is picked
                here and every schedule of this chore inherits it (issue #141). */}
            <ChoreIconPicker
              value={choreForm.icon}
              onChange={(icon) => setChoreForm(f => ({ ...f, icon }))}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={() => setChoreDialogOpen(false)} startIcon={<Cancel />}>{t('common:actions.cancel')}</Button>
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
            {t('chores:schedules.deleteChore')}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('chores:schedules.deleteChoreWarning', { count: getScheduleCountForChore(deleteChoreDialog.chore?.id) })}
          </Alert>
          <Typography variant="body2">
            {/* Composed so the chore's own title stays bold and untranslated. */}
            {t('chores:schedules.deleteChorePrompt')} <strong>{deleteChoreDialog.chore?.title}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteChoreDialog({ open: false, chore: null })}>{t('common:actions.cancel')}</Button>
          <Button onClick={handleDeleteChore} variant="contained" color="error" startIcon={<Delete />}>
            {t('common:actions.delete')}
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
              <InputLabel>{t('chores:schedules.chore')}</InputLabel>
              <Select
                value={scheduleForm.chore_id}
                label={t('chores:schedules.chore')}
                onChange={(e) => updateScheduleForm({ chore_id: e.target.value })}
              >
                {choresByTitle.map(c => (
                  <MenuItem key={c.id} value={c.id}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <span>{c.title}</span>
                      {c.clam_value > 0 && <Chip label={`${c.clam_value} 🥟`} size="small" sx={{ ml: 1 }} />}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {!editingSchedule ? (
              <Box>
                <FormControl fullWidth size="small">
                  <InputLabel id="multi-user-label">Assign to Users</InputLabel>
                  <Select
                    labelId="multi-user-label"
                    multiple
                    value={scheduleForm.user_ids}
                    onChange={(e) => {
                      const val = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value;
                      setScheduleForm({ ...scheduleForm, user_ids: val });
                    }}
                    label="Assign to Users"
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((uid) => {
                          const u = users.find(user => user.id === uid);
                          return <Chip key={uid} size="small" label={u ? u.username : uid} />;
                        })}
                      </Box>
                    )}
                  >
                    {users.map((u) => (
                      <MenuItem key={u.id} value={u.id}>
                        <Checkbox checked={scheduleForm.user_ids.indexOf(u.id) > -1} />
                        <ListItemText primary={u.username} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 0.5 }}>
                  <Button
                    size="small"
                    sx={{ fontSize: '0.75rem', py: 0 }}
                    onClick={() => setScheduleForm({ ...scheduleForm, user_ids: users.map(u => u.id) })}
                  >
                    Select All
                  </Button>
                  <Button
                    size="small"
                    sx={{ fontSize: '0.75rem', py: 0 }}
                    onClick={() => setScheduleForm({ ...scheduleForm, user_ids: [] })}
                  >
                    Clear
                  </Button>
                </Box>
              </Box>
            ) : (
              <FormControl fullWidth size="small">
                <InputLabel>{t('chores:schedules.user')}</InputLabel>
                <Select
                  value={scheduleForm.user_id}
                  label={t('chores:schedules.user')}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, user_id: e.target.value })}
                >
                  <MenuItem value=""><em>{t('chores:schedules.unassigned')}</em></MenuItem>
                  {users.map(u => (
                    <MenuItem key={u.id} value={u.id}>{u.username}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <Divider />

            <ChoreScheduleFields
              form={scheduleForm}
              onChange={updateScheduleForm}
              crontabError={crontabError}
            />

            <Divider />

            {scheduleForm.isOneTime ? (
              <TextField
                label={t('chores:schedules.dueDateOptional')}
                type="date"
                size="small"
                value={scheduleForm.due_date}
                onChange={(e) => updateScheduleForm({ due_date: e.target.value })}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { placeholder: '' }
                }}
                helperText={t('chores:schedules.dueDateHelp')}
                sx={{
                  maxWidth: 260,
                  '& input[type="date"]:not(:focus):invalid::-webkit-datetime-edit': {
                    color: 'transparent'
                  }
                }}
              />
            ) : (
              <TextField
                label={t('chores:schedules.daysUntilDue')}
                type="number"
                size="small"
                value={scheduleForm.due_days}
                onChange={(e) => {
                  const nextValue = e.target.value.replace(/\D/g, '');
                  updateScheduleForm({ due_days: nextValue });
                }}
                helperText={t('chores:schedules.daysUntilDueHelp')}
                error={hasInvalidDueDays}
                slotProps={{ htmlInput: { min: 0, step: 1, inputMode: 'numeric', pattern: '[0-9]*' } }}
                sx={{ maxWidth: 280 }}
              />
            )}

            <TextField
              label={t('chores:schedules.dueTimeOptional')}
              type="time"
              size="small"
              value={scheduleForm.due_time}
              onChange={(e) => updateScheduleForm({ due_time: e.target.value })}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { placeholder: '' }
              }}
              helperText={t('chores:schedules.dueTimeHelp')}
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
              label={t('chores:schedules.playSoundWhenDue')}
            />

            {scheduleForm.sound_enabled && scheduleForm.due_time && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pl: 1 }}>
                <SoundPicker
                  label={t('chores:schedules.sound')}
                  value={scheduleForm.sound}
                  onChange={(sound) => updateScheduleForm({ sound })}
                  includeNoneOption
                  noneLabel="Use default sound"
                  hideEmptyDisplay
                  allowDelete
                />
                <TextField
                  label={t('chores:schedules.repeatReminder')}
                  type="number"
                  size="small"
                  value={scheduleForm.reminder_interval_minutes}
                  onChange={(e) => updateScheduleForm({ reminder_interval_minutes: e.target.value })}
                  helperText={t('chores:schedules.repeatReminderHelp')}
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
              label={t('chores:schedules.transferable')}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5, ml: 6 }}>
              {t('chores:schedules.transferableHelp')}
            </Typography>

            <FormControlLabel
              control={
                <Switch
                  checked={scheduleForm.can_snooze}
                  onChange={(e) => updateScheduleForm({ can_snooze: e.target.checked })}
                />
              }
              label={t('chores:schedules.canSnooze')}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5, ml: 6 }}>
              {t('chores:schedules.canSnoozeHelp')}
            </Typography>

            <Divider />

            <FormControlLabel
              control={
                <Switch
                  checked={scheduleForm.visible}
                  onChange={(e) => updateScheduleForm({ visible: e.target.checked })}
                />
              }
              label={t('chores:schedules.visibleActive')}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={() => setScheduleDialogOpen(false)} startIcon={<Cancel />}>{t('common:actions.cancel')}</Button>
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
        <DialogTitle>{t('chores:schedules.deleteSchedule')}</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('chores:schedules.deleteScheduleWarning')}
          </Alert>
          <Typography variant="body2">
            {t('chores:schedules.deleteScheduleFor')} <strong>{deleteScheduleDialog.schedule?.title}</strong> assigned to{' '}
            <strong>{getUserName(deleteScheduleDialog.schedule?.user_id)}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteScheduleDialog({ open: false, schedule: null })}>{t('common:actions.cancel')}</Button>
          <Button onClick={handleDeleteSchedule} variant="contained" color="error" startIcon={<Delete />}>
            {t('common:actions.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
