import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Grid,
  Checkbox,
  ListItemText,
  ListSubheader,
  ToggleButton,
  ToggleButtonGroup
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
import { editWholeNumber, savedWholeNumber } from '../utils/wholeNumberField.js';
import { CronExpressionParser } from 'cron-parser';
import { getServerTimezoneSync } from '../utils/timezone.js';
import SoundPicker from './SoundPicker.jsx';
import ChoreIconPicker from './ChoreIconPicker.jsx';
import { useTranslation } from 'react-i18next';
import { AdminGroup, AdminNote, AdminRow, AdminSortControl, adminHeadingRowSx, adminHeadingTextSx } from './AdminRows.jsx';
import { getWeekdayLabels } from '../utils/dateUtils.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { compareByKey } from '../utils/choreHelpers.js';
import ExpiresSelect from './ExpiresSelect.jsx';
import ChoreScheduleBoard from './ChoreScheduleBoard.jsx';
import RoutinesGroup from './RoutinesGroup.jsx';
import RoutineStepsGroup from './RoutineStepsGroup.jsx';
import RoutineEditorDialog from './RoutineEditorDialog.jsx';
import useRoutines from '../hooks/useRoutines.js';
import { schedulesWithRoutines } from '../utils/routineSchedules.js';

// Which way the schedules section opens: by person (grouped by timing) or the
// full list. Remembered per display; storage may be unavailable.
const SCHEDULE_VIEW_KEY = 'homeglow_choreScheduleView';
const readScheduleView = () => {
  try { return localStorage.getItem(SCHEDULE_VIEW_KEY) === 'list' ? 'list' : 'person'; } catch { return 'person'; }
};

// Day labels come from the locale (index 0 = Sunday, matching crontab).
const getDayOptions = () => getWeekdayLabels(0).map((label, value) => ({ label, value }));

// Values are crontab expressions and never change; only the label is
// translated, at render time.
const CRONTAB_PRESETS = [
  { key: 'daily', value: '0 0 * * *' },
  { key: 'everyOtherDay', value: '0 0 */2 * *' },
  { key: 'weekdays', value: '0 0 * * 1-5' },
  { key: 'weekends', value: '0 0 * * 0,6' }
];

// The date the label is built from, exposed on its own so the Next Occurrence
// column can sort on the instant rather than on the formatted string. Null
// means there is no next occurrence: a one-time task, or an expression that
// does not parse.
function nextOccurrenceAt(crontab) {
  if (!crontab) return null;
  try {
    const tz = getServerTimezoneSync();
    return CronExpressionParser.parse(crontab, { tz }).next().toDate();
  } catch {
    return null;
  }
}

function getNextOccurrence(crontab) {
  if (!crontab) return 'One-time';
  const next = nextOccurrenceAt(crontab);
  if (!next) return 'Invalid expression';
  const tz = getServerTimezoneSync();
  return next.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
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
  // Create mode only: the same schedule for each person picked, one row
  // each. Empty means an unassigned bonus chore, as user_id '' does.
  user_ids: [],
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
  // Minutes after the due time it expires (issue #279); '' = never.
  expire_minutes: '',
  sound_enabled: false,
  sound: '',
  reminder_interval_minutes: '',
  transferable: true,
  can_snooze: true
};

const defaultChoreForm = { title: '', description: '', clam_value: 0, icon: '' };

// Follow-ups (issue #241): "when this is done, give that chore to them".
const MAX_FOLLOWUPS = 3;
const newFollowupRow = () => ({ followup_chore_id: '', user_ids: [], timing: 'now', amount: 1, unit: 'hours' });
// The server stores a delay in minutes; the form shows whole hours when it can.
const followupRowFromRule = (rule) => {
  const minutes = rule.delay_minutes || 0;
  if (!minutes) return { followup_chore_id: rule.followup_chore_id, user_ids: rule.user_ids, timing: 'now', amount: 1, unit: 'hours' };
  const hours = minutes % 60 === 0;
  return {
    followup_chore_id: rule.followup_chore_id,
    user_ids: rule.user_ids,
    timing: 'after',
    amount: hours ? minutes / 60 : minutes,
    unit: hours ? 'hours' : 'minutes',
  };
};
const followupRuleFromRow = (row) => ({
  followup_chore_id: row.followup_chore_id,
  user_ids: row.user_ids,
  delay_minutes: row.timing === 'after' ? Math.round(Number(row.amount) * (row.unit === 'hours' ? 60 : 1)) : 0,
});

// Clicking the active column flips it; clicking a new one starts ascending,
// which is the reading order for names and "soonest first" for dates.
function nextSort(sort, column) {
  if (sort.column !== column) return { column, direction: 'asc' };
  return { column, direction: sort.direction === 'asc' ? 'desc' : 'asc' };
}

export default function ChoreSchedulesTab({ setSaveMessage }) {
  const { t } = useTranslation(['chores', 'common']);
  const isMobile = useIsMobile();
  // Every chore and schedule, routines' included (they carry routine_id).
  const [allSchedules, setAllSchedules] = useState([]);
  const [allChores, setAllChores] = useState([]);
  const [users, setUsers] = useState([]);
  const routineData = useRoutines({ onError: () => showMessage('error', t('chores:routines.loadFailed')) });
  const { routines } = routineData;
  // The definitions list a routine's chore under Routines, not here. The
  // schedule views show a weekday routine's own schedule, marked, and a
  // calendar routine once (utils/routineSchedules.js).
  const chores = useMemo(() => allChores.filter((c) => !c.routine_id), [allChores]);
  const schedules = useMemo(() => schedulesWithRoutines(allSchedules, routines), [allSchedules, routines]);
  const [routineEditor, setRoutineEditor] = useState({ open: false, routine: null });
  // The chore dialog's follow-ups, as form rows (issue #241).
  const [followupRows, setFollowupRows] = useState([]);
  const [followupError, setFollowupError] = useState('');
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
  // Chores ticked for deleting together.
  const [selectedChoreIds, setSelectedChoreIds] = useState(new Set());
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [savingChore, setSavingChore] = useState(false);

  const [scheduleView, setScheduleViewState] = useState(readScheduleView);
  const setScheduleView = (view) => {
    setScheduleViewState(view);
    try { localStorage.setItem(SCHEDULE_VIEW_KEY, view); } catch { /* per-display convenience only */ }
  };

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

  // The spinner is for the first load only: a reload after a change keeps the
  // section on screen, so the person tab, week and scroll stay where they were.
  const loadedOnce = useRef(false);
  const fetchAll = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true);
    try {
      const [schedulesRes, choresRes, usersRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/chore-schedules`),
        axios.get(`${API_BASE_URL}/api/chores`),
        axios.get(`${API_BASE_URL}/api/users`)
      ]);
      setAllSchedules(Array.isArray(schedulesRes.data) ? schedulesRes.data : []);
      setAllChores(Array.isArray(choresRes.data) ? choresRes.data : []);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data.filter(u => u.id !== 0) : []);
    } catch (err) {
      console.error('Error loading chore data:', err);
    } finally {
      loadedOnce.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // A routine's write changes its chore and schedules too.
  const reloadRoutines = useCallback(
    () => Promise.all([routineData.reload(), fetchAll()]),
    [routineData.reload, fetchAll],
  );
  // The schedule views name a routine by id.
  const openRoutineById = (id) => {
    const routine = routines.find((r) => r.id === id);
    if (routine) setRoutineEditor({ open: true, routine });
  };

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

  const openCreateSchedule = (choreId) => {
    setEditingSchedule(null);
    setScheduleForm(choreId ? { ...defaultScheduleForm, chore_id: choreId } : defaultScheduleForm);
    setCrontabError(null);
    setScheduleDialogOpen(true);
  };

  // The schedules count chip in each definition row is a shortcut, not a
  // statistic: with schedules it filters the schedules table below to that
  // chore (clearing the user filter, which could otherwise hide them) and
  // scrolls it into view; with none it opens the new-schedule dialog with
  // the chore already picked, since there is nothing to scroll to.
  const schedulesSectionRef = useRef(null);
  const handleScheduleCountClick = (chore) => {
    if (getScheduleCountForChore(chore.id) === 0) {
      openCreateSchedule(chore.id);
      return;
    }
    setFilterUser('');
    setFilterChore(chore.id);
    // The filter belongs to the list view, so the shortcut opens it there.
    setScheduleView('list');
    schedulesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      // A duplicate opens in create mode with this person picked, so the
      // same chore can go to the others in one step.
      user_ids: schedule.user_id ? [schedule.user_id] : [],
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
      expire_minutes: schedule.expire_minutes ?? '',
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
    // A repeating chore needs a schedule: an empty one would be saved as a
    // one-time chore, without a word (no days ticked, an empty custom field).
    const err = scheduleForm.isOneTime ? null : (cron ? validateCrontab(cron) : t('chores:schedules.crontabRequired'));
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

      // Editing changes one schedule, so one person. Creating can pick several:
      // two or more go as user_ids, one schedule each.
      const pickedUserIds = editingSchedule ? [] : scheduleForm.user_ids;
      const assignee = editingSchedule
        ? { user_id: scheduleForm.user_id === '' ? null : scheduleForm.user_id }
        : pickedUserIds.length > 1
          ? { user_ids: pickedUserIds }
          : { user_id: pickedUserIds[0] ?? null };

      const payload = {
        chore_id: scheduleForm.chore_id,
        ...assignee,
        crontab: cron || null,
        duration: !scheduleForm.isOneTime ? scheduleForm.duration : 'day-of',
        interval: normalizedInterval,
        visible: scheduleForm.visible ? 1 : 0,
        due_date: normalizedDueDate,
        due_time: scheduleForm.due_time || null,
        // An expiry needs a due time; without one it's cleared.
        expire_minutes: scheduleForm.due_time && scheduleForm.expire_minutes !== '' ? scheduleForm.expire_minutes : null,
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
        showMessage('success', pickedUserIds.length > 1
          ? t('chores:schedules.createdForEach', { count: pickedUserIds.length })
          : 'Schedule created.');
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
    setFollowupRows([]);
    setFollowupError('');
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
    setFollowupRows([]);
    setFollowupError('');
    setChoreDialogOpen(true);
    axios.get(`${API_BASE_URL}/api/chores/${chore.id}/followups`)
      .then((res) => setFollowupRows((res.data || []).map(followupRowFromRule)))
      .catch(() => setFollowupRows([]));
  };

  const updateFollowupRow = (index, changes) => {
    setFollowupError('');
    setFollowupRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));
  };

  // What the form can check before anything is saved; the server checks the
  // rest (loops, people who no longer exist).
  const followupFormError = () => {
    for (const [index, row] of followupRows.entries()) {
      const n = index + 1;
      if (!row.followup_chore_id) return t('chores:followups.errorChore', { n });
      if (!row.user_ids.length) return t('chores:followups.errorPeople', { n });
      const minutes = followupRuleFromRow(row).delay_minutes;
      if (row.timing === 'after' && (!(minutes > 0) || minutes > 7 * 24 * 60)) return t('chores:followups.errorDelay', { n });
    }
    return '';
  };

  const handleSaveChore = async () => {
    if (!choreForm.title.trim()) return;
    const formError = followupFormError();
    if (formError) { setFollowupError(formError); return; }
    setSavingChore(true);
    // A cleared clam field edits as ''; the server gets 0 for it, as before.
    const chorePayload = { ...choreForm, clam_value: savedWholeNumber(choreForm.clam_value) };
    let choreId = editingChore?.id;
    try {
      if (editingChore) {
        await axios.patch(`${API_BASE_URL}/api/chores/${editingChore.id}`, chorePayload);
      } else {
        const res = await axios.post(`${API_BASE_URL}/api/chores`, chorePayload);
        choreId = res.data?.id;
        // Saved: from here on this dialog is editing it, so a follow-up
        // problem below can be fixed and saved again without a duplicate.
        if (choreId) setEditingChore({ id: choreId, ...chorePayload });
      }
    } catch (err) {
      showMessage('error', err.response?.data?.error || 'Failed to save chore.');
      setSavingChore(false);
      return;
    }
    try {
      if (choreId && (editingChore || followupRows.length)) {
        await axios.put(`${API_BASE_URL}/api/chores/${choreId}/followups`, {
          followups: followupRows.map(followupRuleFromRow),
        });
      }
      showMessage('success', editingChore ? 'Chore updated.' : 'Chore created.');
      setChoreDialogOpen(false);
      await fetchAll();
    } catch (err) {
      // The chore itself is saved; the dialog stays open on the follow-ups.
      setFollowupError(err.response?.data?.error || t('chores:followups.errorSave'));
      await fetchAll();
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

  const handleBulkDeleteChores = async () => {
    // One request at a time: a second tap would only delete nothing, and say so.
    if (bulkDeleting) return;
    const ids = [...selectedChoreIds];
    setBulkDeleting(true);
    try {
      const res = await axios.delete(`${API_BASE_URL}/api/chores/bulk`, { data: { ids } });
      const deleted = res.data?.deleted ?? ids.length;
      setSelectedChoreIds(new Set());
      setBulkDeleteDialog(false);
      await fetchAll();
      showMessage('success', t('chores:schedules.bulkDeleteSuccess', { count: deleted }));
    } catch {
      showMessage('error', t('chores:schedules.bulkDeleteError'));
    } finally {
      setBulkDeleting(false);
    }
  };

  // A chore deleted since it was ticked (here or from another display) leaves
  // the selection, so the count and "select all" stay true.
  useEffect(() => {
    setSelectedChoreIds((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(chores.map((c) => c.id));
      const kept = [...prev].filter((id) => present.has(id));
      return kept.length === prev.size ? prev : new Set(kept);
    });
  }, [chores]);

  const toggleChoreSelection = (id) => {
    setSelectedChoreIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllChores = () => {
    if (selectedChoreIds.size === sortedChores.length) {
      setSelectedChoreIds(new Set());
    } else {
      setSelectedChoreIds(new Set(sortedChores.map(c => c.id)));
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
  // is a date behind a localized label.
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
    nextOccurrence: s => nextOccurrenceAt(s?.crontab)?.getTime() ?? null,
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

  // Routines in the chore filter, by name and person (each person has their own).
  const routineFilterOptions = [...routines].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  // A calendar routine has no schedule of its own to list; it gets one row.
  const listedCalendarRoutines = routineFilterOptions.filter((r) => r.trigger === 'calendar'
    && (!filterUser || String(r.user_id) === String(filterUser))
    && (!filterChore || String(r.chore_id) === String(filterChore)));
  const listedCount = filteredSchedules.length + listedCalendarRoutines.length;

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
    || (!scheduleForm.isOneTime && scheduleForm.scheduleMode === 'days' && scheduleForm.selectedDays.length === 0)
    || isOnceCompletedMissingInterval
    || hasInvalidDueDays;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  const scheduleCount = (choreId) => getScheduleCountForChore(choreId);

  return (
    <Box>
      {/* Messages from here show in the Admin Panel's one message area
          under its tab bars (#230), so this tab no longer draws its own. */}

      {/* ── CHORE DEFINITIONS ────────────────────────────── */}
      <AdminGroup
        title={t('chores:schedules.definitionsHeading')}
        collapseKey="choreDefinitions"
        defaultCollapsed
        count={chores.length}
        action={(
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title={t('common:actions.refresh')}>
              <IconButton size="small" onClick={reloadRoutines} aria-label={t('common:actions.refresh')}>
                <Refresh fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button startIcon={<Add />} onClick={openCreateChore} variant="contained" size="small">
              {t('chores:schedules.newChore')}
            </Button>
          </Box>
        )}
      >
        <AdminNote>{t('chores:schedules.definitionsHelp')}</AdminNote>
        {chores.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', px: 1, py: 1, bgcolor: selectedChoreIds.size > 0 ? 'action.hover' : undefined }}>
            <Checkbox
              size="small"
              checked={sortedChores.length > 0 && selectedChoreIds.size === sortedChores.length}
              indeterminate={selectedChoreIds.size > 0 && selectedChoreIds.size < sortedChores.length}
              onChange={toggleSelectAllChores}
              slotProps={{ input: { 'aria-label': t('chores:schedules.selectAllChores') } }}
            />
            {selectedChoreIds.size > 0 ? (
              <>
                <Typography variant="body2">
                  {t('chores:schedules.selectedCount', { count: selectedChoreIds.size })}
                </Typography>
                <Button size="small" variant="contained" color="error" startIcon={<Delete />} onClick={() => setBulkDeleteDialog(true)}>
                  {t('chores:schedules.deleteSelected')}
                </Button>
                <Button size="small" onClick={() => setSelectedChoreIds(new Set())}>
                  {t('common:actions.clear')}
                </Button>
              </>
            ) : (
              <Box sx={{ ml: 'auto' }}>
                <AdminSortControl
                  sort={choreSort}
                  onSort={sortChores}
                  options={[
                    { value: 'title', label: t('common:labels.title') },
                    { value: 'clams', label: t('chores:schedules.clams') },
                    { value: 'schedules', label: t('chores:schedules.schedulesColumn') },
                  ]}
                />
              </Box>
            )}
          </Box>
        )}
        {chores.length === 0 ? (
          <AdminNote>{t('chores:schedules.noChores')}</AdminNote>
        ) : sortedChores.map((c) => (
          <AdminRow
            key={c.id}
            leading={(
              <>
                <Checkbox
                  size="small"
                  checked={selectedChoreIds.has(c.id)}
                  slotProps={{ input: { 'aria-label': t('chores:schedules.selectChore', { title: c.title }) } }}
                  onChange={() => toggleChoreSelection(c.id)}
                  sx={{ ml: -1 }}
                />
                <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: c.icon ? 'action.hover' : 'transparent', display: 'grid', placeItems: 'center', fontSize: 18 }}>
                  {c.icon || ''}
                </Box>
              </>
            )}
            label={c.title}
            hint={c.description || <em style={{ opacity: 0.7 }}>{t('chores:schedules.noDescription')}</em>}
            extra={c.followups?.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', pl: { xs: 0, sm: 9 } }}>
                {c.followups.map((f) => (
                  <Chip key={f.id} size="small" variant="outlined" label={`↪ ${f.title}`} />
                ))}
              </Box>
            )}
            control={(
              <>
                {c.clam_value > 0 && <Chip label={`${c.clam_value} 🥟`} size="small" color="primary" />}
                <Tooltip describeChild title={scheduleCount(c.id) === 0 ? t('chores:schedules.addScheduleForChore') : t('chores:schedules.viewSchedules')}>
                  <Chip
                    label={`${scheduleCount(c.id)} schedule${scheduleCount(c.id) !== 1 ? 's' : ''}`}
                    size="small"
                    variant="outlined"
                    onClick={() => handleScheduleCountClick(c)}
                  />
                </Tooltip>
                <Tooltip title={t('chores:schedules.editChore')}>
                  <IconButton size="small" onClick={() => openEditChore(c)} aria-label={t('chores:schedules.editChore')}>
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('chores:schedules.deleteChoreAndSchedules')}>
                  <IconButton size="small" color="error" onClick={() => setDeleteChoreDialog({ open: true, chore: c })} aria-label={t('chores:schedules.deleteChoreAndSchedules')}>
                    <Delete fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
          />
        ))}
      </AdminGroup>

      {/* ── ROUTINES AND THEIR STEPS ─────────────────────── */}
      <RoutinesGroup
        routines={routines}
        users={users}
        imported={routineData.imported}
        onDismissImported={routineData.dismissImported}
        onNew={() => setRoutineEditor({ open: true, routine: null })}
        onEdit={(routine) => setRoutineEditor({ open: true, routine })}
        onChanged={reloadRoutines}
        flash={showMessage}
      />
      <RoutineStepsGroup
        steps={routineData.steps}
        routines={routines}
        onChanged={routineData.reload}
        flash={showMessage}
      />

      {/* ── SCHEDULES ────────────────────────────────────── */}
      <Box ref={schedulesSectionRef} sx={{ scrollMarginTop: 8 }}>
        <Box sx={adminHeadingRowSx}>
          <Typography variant="overline" component="h3" sx={adminHeadingTextSx}>
            {t('chores:schedules.schedulesColumn')}
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={scheduleView}
            onChange={(_, view) => view && setScheduleView(view)}
            aria-label={t('chores:board.viewLabel')}
          >
            <ToggleButton value="person" sx={{ textTransform: 'none', px: 1.5 }}>{t('chores:board.viewByPerson')}</ToggleButton>
            <ToggleButton value="list" sx={{ textTransform: 'none', px: 1.5 }}>{t('chores:board.viewList')}</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        {scheduleView === 'person' ? (
          <ChoreScheduleBoard
            schedules={schedules}
            chores={chores}
            users={users}
            onChanged={fetchAll}
            onEditSchedule={openEditSchedule}
            onToggleVisible={handleToggleVisible}
            onDeleteSchedule={(s) => setDeleteScheduleDialog({ open: true, schedule: s })}
            onCreateChore={openCreateChore}
            showMessage={showMessage}
            routines={routines}
            onEditRoutine={openRoutineById}
          />
        ) : (
        <AdminGroup
          action={(
            <Button startIcon={<Add />} onClick={() => openCreateSchedule()} variant="contained" size="small">
              {t('chores:schedules.newSchedule')}
            </Button>
          )}
        >
          <AdminNote>{t('chores:schedules.schedulesHelp')}</AdminNote>
          <Box sx={{ display: 'flex', gap: 1.5, px: 2, py: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 150, flex: { xs: 1, sm: 'none' } }}>
              <InputLabel id="schedule-filter-by-user-label">{t('chores:schedules.filterByUser')}</InputLabel>
              <Select labelId="schedule-filter-by-user-label" value={filterUser} label={t('chores:schedules.filterByUser')} onChange={(e) => setFilterUser(e.target.value)}>
                <MenuItem value="">{t('chores:schedules.allUsers')}</MenuItem>
                <MenuItem value="0">{t('chores:schedules.unassignedBonus')}</MenuItem>
                {users.map(u => <MenuItem key={u.id} value={u.id}>{u.username}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 170, flex: { xs: 1, sm: 'none' } }}>
              <InputLabel id="schedule-filter-by-chore-label">{t('chores:schedules.filterByChore')}</InputLabel>
              <Select labelId="schedule-filter-by-chore-label" value={filterChore} label={t('chores:schedules.filterByChore')} onChange={(e) => setFilterChore(e.target.value)}>
                <MenuItem value="">{t('chores:schedules.allChores')}</MenuItem>
                {choresByTitle.map(c => <MenuItem key={c.id} value={c.id}>{c.title}</MenuItem>)}
                {routineFilterOptions.length > 0 && <ListSubheader>{t('chores:routines.heading')}</ListSubheader>}
                {routineFilterOptions.map(r => (
                  <MenuItem key={`routine-${r.id}`} value={r.chore_id}>{`${r.icon ? `${r.icon} ` : ''}${r.name} · ${getUserName(r.user_id)}`}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {(filterUser || filterChore) && (
              <Button size="small" onClick={() => { setFilterUser(''); setFilterChore(''); }}>
                {t('chores:schedules.clearFilters')}
              </Button>
            )}
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="body2" color="text.secondary">
                {listedCount} schedule{listedCount !== 1 ? 's' : ''}
              </Typography>
              <AdminSortControl
                sort={scheduleSort}
                onSort={sortSchedules}
                options={[
                  { value: 'chore', label: t('chores:schedules.chore') },
                  { value: 'assignedTo', label: t('chores:schedules.assignedTo') },
                  { value: 'nextOccurrence', label: t('chores:schedules.nextOccurrence') },
                  { value: 'clams', label: t('chores:schedules.clams') },
                ]}
              />
            </Box>
          </Box>
          {listedCount === 0 ? (
            <AdminNote>{t('chores:schedules.noSchedules')}</AdminNote>
          ) : (<>{filteredSchedules.map((s) => (
            <AdminRow
              key={s.id}
              disabled={!s.visible}
              label={(
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  {s.routine && s.icon ? `${s.icon} ` : ''}{s.title}
                  {s.routine && <Chip label={t('chores:routines.routineChip', { count: s.routine.steps })} size="small" color="secondary" variant="outlined" />}
                  {s.triggered_on && <Chip label={t('chores:followups.chip')} size="small" variant="outlined" />}
                </Box>
              )}
              hint={(
                <>
                  {s.followup_of && <Box component="span" sx={{ display: 'block' }}>{t('chores:widget.followupOf', { title: s.followup_of })}</Box>}
                  {s.description && <Box component="span" sx={{ display: 'block' }}>{s.description}</Box>}
                  <Box component="span" sx={{ display: 'block' }}>
                    {`${t('chores:schedules.nextOccurrence')}: ${getNextOccurrence(s.crontab)}`}
                  </Box>
                </>
              )}
              extra={(
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Chip
                    label={getUserName(s.user_id)}
                    size="small"
                    variant={s.user_id ? 'filled' : 'outlined'}
                    color={s.user_id ? 'primary' : 'default'}
                  />
                  {s.crontab && s.duration === 'until-completed' ? (
                    <Chip label={t('chores:schedules.untilCompleted')} size="small" color="warning" />
                  ) : s.crontab && s.duration === 'once-completed' ? (
                    <Chip label={s.interval
                        ? t('chores:schedules.onceCompletedWithInterval', { interval: formatScheduleInterval(s.interval) })
                        : t('chores:schedules.onceCompleted')} size="small" color="secondary" />
                  ) : s.crontab ? (
                    <Chip label={t('chores:schedules.dayOf')} size="small" variant="outlined" />
                  ) : null}
                  {s.clam_value > 0 && <Chip label={`${s.clam_value} 🥟`} size="small" color="primary" />}
                </Box>
              )}
              control={s.routine ? (
                // A routine's schedule changes with its routine.
                <Tooltip title={t('chores:routines.editInRoutine')}>
                  <IconButton size="small" onClick={() => openRoutineById(s.routine.id)} aria-label={`${t('chores:routines.editInRoutine')}: ${s.title}`}>
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : (
                <>
                  <Tooltip title={s.visible ? 'Click to hide' : 'Click to show'}>
                    <Switch
                      size="small"
                      checked={!!s.visible}
                      onChange={() => handleToggleVisible(s)}
                      slotProps={{ input: { 'aria-label': t('chores:schedules.visible') } }}
                    />
                  </Tooltip>
                  <Tooltip title={t('common:actions.edit')}>
                    <IconButton size="small" onClick={() => openEditSchedule(s)} aria-label={t('common:actions.edit')}>
                      <Edit fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('common:actions.duplicate')}>
                    <IconButton size="small" onClick={() => openCopySchedule(s)} aria-label={t('common:actions.duplicate')}>
                      <ContentCopy fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('common:actions.delete')}>
                    <IconButton size="small" color="error" onClick={() => setDeleteScheduleDialog({ open: true, schedule: s })} aria-label={t('common:actions.delete')}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            />
          ))}
          {listedCalendarRoutines.map((r) => (
            <AdminRow
              key={`routine-${r.id}`}
              label={(
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  {r.icon ? `${r.icon} ` : ''}{r.name}
                  <Chip label={t('chores:routines.routineChip', { count: r.steps.length })} size="small" color="secondary" variant="outlined" />
                </Box>
              )}
              hint={r.match_text ? `📅 ${r.match_text}` : t('chores:routines.needsEvents')}
              extra={<Chip label={getUserName(r.user_id)} size="small" color="primary" />}
              control={(
                <Tooltip title={t('chores:routines.editInRoutine')}>
                  <IconButton size="small" onClick={() => openRoutineById(r.id)} aria-label={`${t('chores:routines.editInRoutine')}: ${r.name}`}>
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            />
          ))}</>)}
        </AdminGroup>
        )}
      </Box>

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
        <DialogTitle>{editingChore ? t('chores:schedules.editChore') : t('chores:schedules.newChore')}</DialogTitle>
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
              onChange={(e) => setChoreForm(f => ({ ...f, clam_value: editWholeNumber(e.target.value) }))}
              slotProps={{ htmlInput: { min: 0 } }}
              sx={{ width: { xs: '100%', sm: 140 } }}
            />
            {/* The icon belongs to the chore, not the schedule, so it is picked
                here and every schedule of this chore inherits it (issue #141). */}
            <ChoreIconPicker
              value={choreForm.icon}
              onChange={(icon) => setChoreForm(f => ({ ...f, icon }))}
            />

            {/* Follow-ups (issue #241). Nothing but one button until used. */}
            <Divider />
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {t('chores:followups.heading')}{' '}
                <Typography component="span" variant="caption" color="text.secondary">{t('chores:followups.optional')}</Typography>
              </Typography>
              {followupRows.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {t('chores:followups.help')}
                </Typography>
              )}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1.5 }}>
                {followupRows.map((row, index) => (
                  <Box
                    key={index}
                    sx={{ border: '1px solid var(--card-border)', borderRadius: 'var(--hg-radius-sm)', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}
                  >
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <FormControl fullWidth size="small">
                        <InputLabel id={`followup-${index}-give-label`}>{t('chores:followups.give')}</InputLabel>
                        <Select
                          labelId={`followup-${index}-give-label`}
                          value={row.followup_chore_id}
                          label={t('chores:followups.give')}
                          onChange={(e) => updateFollowupRow(index, { followup_chore_id: e.target.value })}
                        >
                          {chores.filter((c) => c.id !== editingChore?.id).map((c) => (
                            <MenuItem key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.title}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Tooltip title={t('chores:followups.remove')}>
                        <IconButton
                          size="small"
                          color="error"
                          aria-label={t('chores:followups.remove')}
                          onClick={() => { setFollowupError(''); setFollowupRows((rows) => rows.filter((_, i) => i !== index)); }}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <FormControl fullWidth size="small">
                      <InputLabel id={`followup-${index}-to-label`}>{t('chores:followups.to')}</InputLabel>
                      <Select
                        labelId={`followup-${index}-to-label`}
                        multiple
                        value={row.user_ids}
                        label={t('chores:followups.to')}
                        onChange={(e) => updateFollowupRow(index, { user_ids: e.target.value })}
                        renderValue={(ids) => ids.map(getUserName).join(', ')}
                      >
                        {users.filter((u) => u.id > 0).map((u) => (
                          <MenuItem key={u.id} value={u.id}>
                            <Checkbox size="small" checked={row.user_ids.includes(u.id)} sx={{ p: 0.5, mr: 1 }} />
                            <ListItemText primary={u.username} />
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <FormControl size="small" sx={{ minWidth: 150 }}>
                        <InputLabel id={`followup-${index}-when-label`}>{t('chores:followups.when')}</InputLabel>
                        <Select
                          labelId={`followup-${index}-when-label`}
                          value={row.timing}
                          label={t('chores:followups.when')}
                          onChange={(e) => updateFollowupRow(index, { timing: e.target.value })}
                        >
                          <MenuItem value="now">{t('chores:followups.rightAway')}</MenuItem>
                          <MenuItem value="after">{t('chores:followups.after')}</MenuItem>
                        </Select>
                      </FormControl>
                      {row.timing === 'after' && (
                        <>
                          <TextField
                            size="small"
                            type="number"
                            value={row.amount}
                            onChange={(e) => updateFollowupRow(index, { amount: e.target.value })}
                            slotProps={{ htmlInput: { min: 1, 'aria-label': t('chores:followups.amount') } }}
                            sx={{ width: 90 }}
                          />
                          <FormControl size="small" sx={{ minWidth: 110 }}>
                            <Select
                              value={row.unit}
                              onChange={(e) => updateFollowupRow(index, { unit: e.target.value })}
                              inputProps={{ 'aria-label': t('chores:followups.unit') }}
                            >
                              <MenuItem value="minutes">{t('chores:followups.minutes')}</MenuItem>
                              <MenuItem value="hours">{t('chores:followups.hours')}</MenuItem>
                            </Select>
                          </FormControl>
                        </>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
              {followupError && <Alert severity="error" sx={{ mt: 1.5 }}>{followupError}</Alert>}
              {followupRows.length < MAX_FOLLOWUPS && (
                <Button
                  type="button"
                  size="small"
                  startIcon={<Add />}
                  sx={{ mt: 1 }}
                  onClick={() => { setFollowupError(''); setFollowupRows((rows) => [...rows, newFollowupRow()]); }}
                >
                  {t('chores:followups.add')}
                </Button>
              )}
            </Box>
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

      {/* ── BULK DELETE DIALOG ────────────────────────────── */}
      <Dialog open={bulkDeleteDialog} onClose={() => setBulkDeleteDialog(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warning color="error" />
            {t('chores:schedules.bulkDeleteTitle', { count: selectedChoreIds.size })}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('chores:schedules.bulkDeleteWarning')}
          </Alert>
          <Typography variant="body2">
            {t('chores:schedules.bulkDeletePrompt', { count: selectedChoreIds.size })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDeleteDialog(false)}>{t('common:actions.cancel')}</Button>
          <Button onClick={handleBulkDeleteChores} variant="contained" color="error" startIcon={<Delete />} disabled={bulkDeleting}>
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
        <DialogTitle>{editingSchedule ? t('chores:schedules.editSchedule') : t('chores:schedules.newSchedule')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <FormControl fullWidth size="small" required>
              <InputLabel id="schedule-chore-label">{t('chores:schedules.chore')}</InputLabel>
              <Select
                labelId="schedule-chore-label"
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

            {editingSchedule ? (
              <FormControl fullWidth size="small">
                <InputLabel id="schedule-assigned-to-label">{t('chores:schedules.assignedTo')}</InputLabel>
                <Select
                  labelId="schedule-assigned-to-label"
                  value={scheduleForm.user_id}
                  label={t('chores:schedules.assignedTo')}
                  onChange={(e) => updateScheduleForm({ user_id: e.target.value })}
                >
                  <MenuItem value="">{t('chores:schedules.unassignedBonusChore')}</MenuItem>
                  {users.map(u => <MenuItem key={u.id} value={u.id}>{u.username}</MenuItem>)}
                </Select>
              </FormControl>
            ) : (
              // New schedules can go to several people at once: one schedule
              // each, exactly as if added one at a time. None picked is an
              // unassigned bonus chore, as before.
              <FormControl fullWidth size="small">
                <InputLabel shrink id="schedule-assigned-to-label">{t('chores:schedules.assignedTo')}</InputLabel>
                <Select
                  labelId="schedule-assigned-to-label"
                  multiple
                  displayEmpty
                  notched
                  value={scheduleForm.user_ids}
                  label={t('chores:schedules.assignedTo')}
                  onChange={(e) => updateScheduleForm({ user_ids: e.target.value })}
                  renderValue={(selected) => (selected.length === 0
                    ? <Box component="span" sx={{ color: 'text.secondary' }}>{t('chores:schedules.unassignedBonusChore')}</Box>
                    : selected.map(getUserName).join(', '))}
                >
                  {users.map(u => (
                    <MenuItem key={u.id} value={u.id}>
                      <Checkbox size="small" checked={scheduleForm.user_ids.includes(u.id)} sx={{ p: 0.5, mr: 1 }} />
                      <ListItemText primary={u.username} />
                    </MenuItem>
                  ))}
                </Select>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                    {scheduleForm.user_ids.length > 1
                      ? t('chores:schedules.assignManyHelp', { count: scheduleForm.user_ids.length })
                      : t('chores:schedules.assignHelp')}
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => updateScheduleForm({ user_ids: users.map(u => u.id) })}
                    disabled={users.length === 0 || scheduleForm.user_ids.length === users.length}
                  >
                    {t('chores:schedules.assignEveryone')}
                  </Button>
                  <Button
                    size="small"
                    onClick={() => updateScheduleForm({ user_ids: [] })}
                    disabled={scheduleForm.user_ids.length === 0}
                  >
                    {t('common:actions.clear')}
                  </Button>
                </Box>
              </FormControl>
            )}

            <Divider />

            <FormControlLabel
              control={
                <Switch
                  checked={scheduleForm.isOneTime}
                  onChange={(e) => updateScheduleForm({ isOneTime: e.target.checked })}
                />
              }
              label={t('chores:schedules.oneTimeTask')}
            />

            {!scheduleForm.isOneTime && (
              <>
                <RadioGroup
                  row
                  value={scheduleForm.scheduleMode}
                  onChange={(e) => updateScheduleForm({ scheduleMode: e.target.value })}
                >
                  <FormControlLabel value="preset" control={<Radio size="small" />} label={t('chores:schedules.modePreset')} />
                  <FormControlLabel value="days" control={<Radio size="small" />} label={t('chores:schedules.modeDaysOfWeek')} />
                  <FormControlLabel value="custom" control={<Radio size="small" />} label={t('chores:schedules.modeCustomCrontab')} />
                </RadioGroup>

                <FormControl fullWidth size="small">
                  <InputLabel id="schedule-duration-label">{t('chores:schedules.duration')}</InputLabel>
                  <Select
                    labelId="schedule-duration-label"
                    value={scheduleForm.duration}
                    label={t('chores:schedules.duration')}
                    onChange={(e) => updateScheduleForm({ duration: e.target.value })}
                  >
                    <MenuItem value="day-of">{t('chores:schedules.dayOf')}</MenuItem>
                    <MenuItem value="until-completed">{t('chores:schedules.untilCompleted')}</MenuItem>
                    <MenuItem value="once-completed">{t('chores:schedules.onceCompleted')}</MenuItem>
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
                        label={t('chores:schedules.sleepCount')}
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
                        <InputLabel id="schedule-sleep-unit-label">{t('chores:schedules.sleepUnit')}</InputLabel>
                        <Select
                          labelId="schedule-sleep-unit-label"
                          value={scheduleForm.sleepUnit}
                          label={t('chores:schedules.sleepUnit')}
                          onChange={(e) => updateScheduleForm({ sleepUnit: e.target.value })}
                        >
                          <MenuItem value="d">{t('chores:schedules.unitDays')}</MenuItem>
                          <MenuItem value="w">{t('chores:schedules.unitWeeks')}</MenuItem>
                          <MenuItem value="m">{t('chores:schedules.unitMonths')}</MenuItem>
                          <MenuItem value="y">{t('chores:schedules.unitYears')}</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                )}

                {scheduleForm.scheduleMode === 'preset' && (
                  <FormControl fullWidth size="small">
                    <InputLabel id="schedule-schedule-preset-label">{t('chores:schedules.schedulePreset')}</InputLabel>
                    <Select
                      labelId="schedule-schedule-preset-label"
                      value={scheduleForm.selectedPreset}
                      label={t('chores:schedules.schedulePreset')}
                      onChange={(e) => updateScheduleForm({ selectedPreset: e.target.value })}
                    >
                      {CRONTAB_PRESETS.map(p => (
                        <MenuItem key={p.key} value={p.value}>
                          <Box>
                            <Typography variant="body2">{t(`chores:presets.${p.key}`)}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'var(--hg-font-mono)' }}>
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
                      {t('chores:schedules.selectDays')}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {getDayOptions().map(day => (
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
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontFamily: 'var(--hg-font-mono)' }}>
                        Generated: {daysToCrontab(scheduleForm.selectedDays)}
                      </Typography>
                    )}
                    {scheduleForm.selectedDays.length === 0 && (
                      <Alert severity="warning" sx={{ mt: 1 }}>
                        {t('chores:schedules.selectAtLeastOneDay')}
                      </Alert>
                    )}
                  </Box>
                )}

                {scheduleForm.scheduleMode === 'custom' && (
                  <TextField
                    fullWidth
                    size="small"
                    label={t('chores:schedules.crontabExpression')}
                    value={scheduleForm.customCrontab}
                    onChange={(e) => updateScheduleForm({ customCrontab: e.target.value })}
                    placeholder="0 0 * * 1"
                    error={!!crontabError}
                    helperText={crontabError || (scheduleForm.customCrontab.trim() ? 'Format: minute hour day-of-month month day-of-week' : t('chores:schedules.crontabRequired'))}
                    slotProps={{ input: { sx: { fontFamily: 'var(--hg-font-mono)' } } }}
                  />
                )}
              </>
            )}

            {!crontabError && (
              <Alert severity={scheduleForm.isOneTime ? 'warning' : 'info'} icon={<Schedule />} sx={{ py: 0.5 }}>
                <Typography variant="body2">
                  <strong>{scheduleForm.isOneTime
                    ? t('chores:schedules.oneTimeTaskShort')
                    : t('chores:schedules.nextOccurrenceIs', { when: nextOccurrence })}</strong>
                </Typography>
                {!scheduleForm.isOneTime && currentCrontab && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'var(--hg-font-mono)' }}>
                    {currentCrontab}
                  </Typography>
                )}
                {scheduleForm.isOneTime && (
                  <Typography variant="caption" color="text.secondary">
                    {t('chores:schedules.appearsOnce')}
                  </Typography>
                )}
              </Alert>
            )}

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

            <ExpiresSelect
              id="schedule-expires"
              value={scheduleForm.expire_minutes}
              onChange={(expire_minutes) => updateScheduleForm({ expire_minutes })}
              disabled={!scheduleForm.due_time}
              helperText={scheduleForm.due_time ? t('chores:expiry.help') : t('chores:expiry.needsDueTime')}
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
                  slotProps={{ htmlInput: { min: 0 } }}
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

      {/* ── ROUTINE EDITOR (from Routines and the schedule views) ── */}
      <RoutineEditorDialog
        open={routineEditor.open}
        routine={routineEditor.routine}
        steps={routineData.steps}
        users={users}
        sources={routineData.sources}
        onClose={() => setRoutineEditor({ open: false, routine: null })}
        onStepAdded={routineData.addStep}
        onSaved={(saved) => {
          setRoutineEditor({ open: false, routine: null });
          showMessage('success', Array.isArray(saved.routines)
            ? t('chores:routines.savedMany', { name: saved.routines[0]?.name || '', count: saved.routines.length })
            : t('chores:routines.saved', { name: saved.name }));
          reloadRoutines();
        }}
      />
    </Box>
  );
}
