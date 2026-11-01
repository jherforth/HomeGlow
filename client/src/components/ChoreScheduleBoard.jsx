import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add,
  ChevronLeft,
  ChevronRight,
  ContentCopy,
  Delete,
  DragIndicator,
  EditCalendar,
  MoreVert,
  Settings,
  PushPin,
  Today,
} from '@mui/icons-material';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { adminHeadingRowSx, adminHeadingTextSx } from './AdminRows.jsx';
import useIsMobile from '../hooks/useIsMobile.js';
import { getTodayDateString } from '../utils/choreHelpers.js';
import { getServerTimezoneSync } from '../utils/timezone.js';
import { parseVacationModeSetting } from '../utils/interfaceSettings.js';
import {
  afterTiming,
  everyNTiming,
  groupSchedulesForUser,
  monthlyTiming,
  onceTiming,
  scheduleFieldsForTiming,
  calendarWeek,
  dateKeyOf,
  weekDates,
  weekTiming,
} from '../utils/choreScheduleGroups.js';
import { calendarRoutinesFor } from '../utils/routineSchedules.js';
import { SearchMark } from './ChoresPageBar.jsx';
import ScheduleWizard, { WIZARD_START } from './ScheduleWizard.jsx';
import SchedulePicker, {
  AddModeToggle,
  CustomPanel,
  DAY_ORDER,
  QuickDays,
  TheirSchedules,
  customTiming,
  readAddMode,
  storeAddMode,
  useTimingLabel,
} from './SchedulePicker.jsx';

// "By person" view of Admin → Chores → Schedules: one tab per person (and
// one for the unassigned bonus chores), a week calendar of what they have on
// each day, and their chores grouped by timing. A group is the person's
// schedules that share the same days; nothing is stored about the group
// itself, so history, routines, follow-ups and every per-chore setting carry
// on exactly as before. A chore sits in one group per person: adding it to
// another moves it there.

const BONUS = 'bonus';

// Settings a copied schedule takes from the one it was copied from.
const COPIED_FIELDS = [
  'crontab', 'duration', 'interval', 'due_date', 'due_time', 'expire_minutes', 'sound_enabled',
  'sound', 'reminder_interval_minutes', 'transferable', 'can_snooze', 'visible',
];

// How each calendar entry looks: a mark, and a tint that reads in both themes.
const STATE_MARK = { done: '✓', missed: '✗', notDone: '✗', waiting: '⏳', today: '', planned: '' };
const STATE_SX = {
  done: { bgcolor: 'rgba(46, 160, 67, 0.16)' },
  missed: { bgcolor: 'rgba(211, 47, 47, 0.12)', color: 'text.secondary' },
  notDone: { bgcolor: 'rgba(211, 47, 47, 0.12)', color: 'text.secondary' },
  waiting: { bgcolor: 'rgba(237, 108, 2, 0.14)' },
  today: { bgcolor: 'action.hover', boxShadow: 'inset 0 0 0 1px var(--accent)' },
  planned: { bgcolor: 'action.hover' },
};

const fmtTime = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

export default function ChoreScheduleBoard({
  schedules,
  chores,
  users,
  onChanged,
  onEditSchedule,
  onToggleVisible,
  onDeleteSchedule,
  onCreateChore,
  showMessage,
  // A weekday routine's schedule comes in `schedules`, marked `routine`; a
  // calendar routine is listed from here. Either opens onEditRoutine(id).
  routines = [],
  onEditRoutine,
  // Whose chores: a person's id as a string, or 'bonus'. The page's chips pick,
  // and key the board on it, so another person starts from this week.
  tab,
  // The page's search. It filters the rows drawn. A group's Change days, Copy
  // to and Remove act on all of it, hidden rows too, so they wait until it's
  // cleared.
  query = '',
  scheduleMatches = () => true,
  routineMatches = () => true,
  // The step a routine matched on, shown since its row doesn't list them.
  matchedStep = () => null,
}) {
  const { t } = useTranslation(['chores', 'common']);
  const isMobile = useIsMobile();
  const { timingLabel, shortDays } = useTimingLabel();

  const userId = tab === BONUS ? null : Number(tab);
  const personName = tab === BONUS ? t('chores:board.bonusTab') : (users.find((u) => u.id === userId)?.username || '');

  const groups = useMemo(() => groupSchedulesForUser(schedules, userId), [schedules, userId]);
  const groupByKey = useMemo(() => new Map(groups.map((g) => [g.timing.key, g])), [groups]);
  const choresByTitle = useMemo(
    () => [...chores].sort((a, b) => String(a.title).localeCompare(String(b.title))),
    [chores],
  );
  const eventRoutines = useMemo(() => (userId === null ? [] : calendarRoutinesFor(routines, userId)), [routines, userId]);
  const shownEventRoutines = eventRoutines.filter(routineMatches);
  // A group's own chores: what Change days, Copy to and Remove act on. A
  // routine's schedule changes only with its routine.
  const choresOf = (group) => group.schedules.filter((s) => !s.routine);

  const [busy, setBusy] = useState(false);
  const run = async (work, successText) => {
    setBusy(true);
    try {
      await work();
      if (successText) showMessage('success', successText);
    } catch (err) {
      showMessage('error', err.response?.data?.error || t('common:errors.saveFailed'));
    } finally {
      await onChanged();
      setBusy(false);
    }
  };

  // ── Week calendar ─────────────────────────────────────────────────
  const [weekOffset, setWeekOffset] = useState(0);
  const days = useMemo(() => weekDates(new Date(), weekOffset), [weekOffset]);
  const dayKeys = useMemo(() => days.map(dateKeyOf), [days]);
  const today = getTodayDateString();

  // What got done: this person's history for the week shown, and the
  // household's vacation dates. Bonus chores are recorded under whoever took
  // them, so the bonus tab shows the plan only.
  const [history, setHistory] = useState([]);
  const [vacation, setVacation] = useState(null);
  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/settings`)
      .then((res) => setVacation(parseVacationModeSetting(res.data?.vacation_mode)))
      .catch(() => setVacation(null));
  }, []);
  useEffect(() => {
    let current = true;
    if (userId === null || dayKeys[0] > today) { setHistory([]); return undefined; }
    axios.get(`${API_BASE_URL}/api/chore-history`, { params: { user_id: userId, date_from: dayKeys[0], date_to: dayKeys[6] } })
      .then((res) => { if (current) setHistory(Array.isArray(res.data) ? res.data : []); })
      .catch(() => { if (current) setHistory([]); });
    return () => { current = false; };
  }, [userId, dayKeys, today, schedules]);
  // The sticky schedules with a card up now: an any-day chore without one
  // was done earlier in its period (calendarWeek).
  const openCards = useMemo(
    () => new Set(schedules.filter((s) => s.parent_schedule_id && !s.crontab && s.visible).map((s) => s.parent_schedule_id)),
    [schedules],
  );
  const week = useMemo(
    () => calendarWeek({ groups, dates: dayKeys, today, rows: history, vacation, openCards, timeZone: getServerTimezoneSync() }),
    [groups, dayKeys, today, history, vacation, openCards],
  );

  // ── Moving one chore (drag, or Move to…) ──────────────────────────
  const moveSchedule = (schedule, timing) => run(
    () => axios.patch(`${API_BASE_URL}/api/chore-schedules/${schedule.id}`, scheduleFieldsForTiming(timing, schedule)),
    t('chores:board.moved', { title: schedule.title, timing: timingLabel(timing) }),
  );

  // Pointer-based drag, so it works with a finger on the wall display as well
  // as a mouse. The handle captures the pointer; the group under it is found
  // from its data-timing-key.
  const [drag, setDrag] = useState(null); // { schedule, fromKey, x, y, overKey }
  const dragRef = useRef(null);
  const scrollerRef = useRef(null);
  const findScroller = (el) => {
    for (let n = el?.parentElement; n; n = n.parentElement) {
      const { overflowY } = getComputedStyle(n);
      if ((overflowY === 'auto' || overflowY === 'scroll') && n.scrollHeight > n.clientHeight) return n;
    }
    return document.scrollingElement;
  };
  useEffect(() => {
    if (!drag) return undefined;
    // Scroll while a chore is held near the top or bottom edge.
    const timer = setInterval(() => {
      const d = dragRef.current;
      const sc = scrollerRef.current;
      if (!d || !sc) return;
      const rect = sc === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : sc.getBoundingClientRect();
      if (d.y < rect.top + 48) sc.scrollTop -= 14;
      else if (d.y > rect.bottom - 48) sc.scrollTop += 14;
    }, 16);
    return () => clearInterval(timer);
  }, [drag]);
  const overKeyAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-timing-key]')?.getAttribute('data-timing-key') || null;
  const dragHandlers = (schedule, fromKey) => ({
    onPointerDown: (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      scrollerRef.current = findScroller(e.currentTarget);
      const next = { schedule, fromKey, x: e.clientX, y: e.clientY, overKey: fromKey };
      dragRef.current = next;
      setDrag(next);
    },
    onPointerMove: (e) => {
      if (!dragRef.current) return;
      const next = { ...dragRef.current, x: e.clientX, y: e.clientY, overKey: overKeyAt(e.clientX, e.clientY) };
      dragRef.current = next;
      setDrag(next);
    },
    onPointerUp: () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      const target = d && d.overKey && d.overKey !== d.fromKey ? groupByKey.get(d.overKey) : null;
      if (target) moveSchedule(d.schedule, target.timing);
    },
    onPointerCancel: () => { dragRef.current = null; setDrag(null); },
  });

  // ── Add chores ────────────────────────────────────────────────────
  // step: 'timing' → 'chores' (→ 'review' from the wizard).
  const [addDialog, setAddDialog] = useState(null); // { step, timing, picked:Set, date, wizard, keep, fromWizard }
  const openAdd = (timing = null) => setAddDialog({
    step: timing ? 'chores' : 'timing',
    timing,
    picked: new Set(),
    date: timing?.kind === 'once' ? (timing.dueDate || '') : '',
    search: '',
    wizard: WIZARD_START,
    // From the wizard: true "stays until done", false "goes at day's end",
    // null not asked (the chores keep their own setting).
    keep: null,
    fromWizard: false,
  });
  const [addMode, setAddModeState] = useState(readAddMode);
  const setAddMode = (mode) => {
    setAddModeState(mode);
    storeAddMode(mode);
  };
  // A chore made with "New chore" while the dialog is open comes back ticked.
  const knownChoreIds = useRef(new Set(chores.map((c) => c.id)));
  useEffect(() => {
    const fresh = chores.filter((c) => !knownChoreIds.current.has(c.id)).map((c) => c.id);
    knownChoreIds.current = new Set(chores.map((c) => c.id));
    if (fresh.length) {
      setAddDialog((d) => (d && d.step === 'chores' ? { ...d, picked: new Set([...d.picked, ...fresh]) } : d));
    }
  }, [chores]);

  // The timing being added to, with a one-time chore's date as picked.
  const addTiming = addDialog?.timing?.kind === 'once' ? onceTiming(addDialog.date || null) : addDialog?.timing;
  // This person's schedules of each chore (normally one: a chore sits in one group).
  const mineByChore = useMemo(() => {
    const map = new Map();
    for (const g of groups) for (const s of g.schedules) {
      if (!map.has(s.chore_id)) map.set(s.chore_id, []);
      map.get(s.chore_id).push({ s, timing: g.timing });
    }
    return map;
  }, [groups]);

  const pickedNew = addDialog ? [...addDialog.picked].filter((id) => !mineByChore.has(id)) : [];
  const pickedMoves = addDialog ? [...addDialog.picked].filter((id) => mineByChore.has(id)) : [];

  // The wizard's answer to "if it isn't done that day", for both the chores
  // added and the ones moved; the picker doesn't ask.
  const keepFields = (keep) => (keep === null || keep === undefined ? {} : { duration: keep ? 'until-completed' : 'day-of' });
  const saveAdd = () => {
    const timing = addTiming;
    const extra = keepFields(addDialog.keep);
    const fields = { ...scheduleFieldsForTiming(timing), ...extra };
    const moves = pickedMoves.map((id) => mineByChore.get(id)[0].s);
    const created = pickedNew.length;
    setAddDialog(null);
    run(async () => {
      for (const choreId of pickedNew) {
        await axios.post(`${API_BASE_URL}/api/chore-schedules`, { chore_id: choreId, user_id: userId, visible: 1, ...fields });
      }
      for (const s of moves) {
        await axios.patch(`${API_BASE_URL}/api/chore-schedules/${s.id}`, { ...scheduleFieldsForTiming(timing, s), ...extra });
      }
    }, moves.length && !created
      ? t('chores:board.movedCount', { count: moves.length, timing: timingLabel(timing) })
      : moves.length
      ? t('chores:board.addedMoved', { added: created, moved: moves.length, timing: timingLabel(timing) })
      : t('chores:board.added', { count: created, timing: timingLabel(timing) }));
  };

  // ── Change a group's days ─────────────────────────────────────────
  const [editDialog, setEditDialog] = useState(null); // { group, days, n, dom, date, count, unit, rest }
  const openEditDays = (group) => {
    const tm = group.timing;
    const m = String(tm.interval || '').match(/^(\d+)([dwmy])$/i);
    setEditDialog({
      group,
      days: tm.days || [],
      n: tm.n || 2,
      dom: tm.dom || '1',
      date: tm.dueDate || '',
      count: m ? m[1] : '3',
      unit: m ? m[2].toLowerCase() : 'd',
      custom: tm.kind === 'months'
        ? { every: tm.every || 12, from: 'dates', start: `${new Date().getFullYear()}-${String(tm.months[0]).padStart(2, '0')}-${String(tm.dom).padStart(2, '0')}` }
        : null,
    });
  };
  const editedTiming = (d) => {
    if (!d) return null;
    switch (d.group.timing.kind) {
      case 'week': return d.days.length ? weekTiming(d.days) : null;
      case 'everyN': return Number(d.n) >= 2 ? everyNTiming(Number(d.n)) : null;
      case 'monthly': return /^\s*\d{1,2}(\s*,\s*\d{1,2})*\s*$/.test(d.dom) && d.dom.split(',').every((x) => Number(x) >= 1 && Number(x) <= 31)
        ? monthlyTiming(d.dom.replace(/\s+/g, '')) : null;
      case 'once': return onceTiming(d.date || null);
      case 'months': return customTiming(d.custom);
      case 'after': return Number(d.count) >= 1 ? afterTiming(`${Number(d.count)}${d.unit}`) : null;
      default: return null;
    }
  };
  const saveEditDays = () => {
    const timing = editedTiming(editDialog);
    const { group } = editDialog;
    setEditDialog(null);
    if (!timing || timing.key === group.timing.key) return;
    const changed = choresOf(group);
    run(async () => {
      for (const s of changed) {
        await axios.patch(`${API_BASE_URL}/api/chore-schedules/${s.id}`, scheduleFieldsForTiming(timing, s));
      }
    }, t('chores:board.daysChanged', { count: changed.length, timing: timingLabel(timing) }));
  };

  // ── Copy a group to other people ──────────────────────────────────
  const [copyDialog, setCopyDialog] = useState(null); // { group, targets:[] }
  const copyPlan = useMemo(() => {
    if (!copyDialog) return [];
    return copyDialog.targets.map((targetId) => {
      const theirs = new Map();
      for (const g of groupSchedulesForUser(schedules, targetId)) for (const s of g.schedules) theirs.set(s.chore_id, g.timing);
      const own = choresOf(copyDialog.group);
      const add = own.filter((s) => !theirs.has(s.chore_id));
      const skip = own.filter((s) => theirs.has(s.chore_id)).map((s) => ({ s, timing: theirs.get(s.chore_id) }));
      return { targetId, add, skip };
    });
  }, [copyDialog, schedules]);
  const saveCopy = () => {
    const plan = copyPlan;
    setCopyDialog(null);
    const total = plan.reduce((n, p) => n + p.add.length, 0);
    run(async () => {
      for (const p of plan) for (const s of p.add) {
        const body = { chore_id: s.chore_id, user_id: p.targetId };
        for (const f of COPIED_FIELDS) if (s[f] !== undefined) body[f] = s[f];
        // The interval is the gap (again after done) or the period (any day).
        if (body.duration !== 'once-completed' && body.duration !== 'any-day') body.interval = null;
        await axios.post(`${API_BASE_URL}/api/chore-schedules`, body);
      }
    }, t('chores:board.copied', { count: total }));
  };

  // ── Remove a whole group ──────────────────────────────────────────
  const [removeGroup, setRemoveGroup] = useState(null);
  const saveRemoveGroup = () => {
    const removed = choresOf(removeGroup);
    setRemoveGroup(null);
    run(async () => {
      for (const s of removed) await axios.delete(`${API_BASE_URL}/api/chore-schedules/${s.id}`);
    }, t('chores:board.groupRemoved', { count: removed.length }));
  };

  const [groupMenu, setGroupMenu] = useState(null); // { anchor, group }
  const menuEmpty = !!groupMenu && choresOf(groupMenu.group).length === 0;

  // ── Pieces ────────────────────────────────────────────────────────
  const choreChips = (s) => (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
      {s.clam_value > 0 && <Chip size="small" color="primary" label={`+${s.clam_value} 🥟`} />}
      {s.due_time && <Chip size="small" variant="outlined" label={`${s.sound_enabled ? '🔔' : '⏰'} ${fmtTime(s.due_time)}`} />}
      {/* Set in the chore's gear settings; shown here so it's visible at a glance. */}
      {s.crontab && s.duration === 'until-completed' && (
        <Chip size="small" color="warning" variant="outlined" icon={<PushPin sx={{ fontSize: 14 }} />} label={t('chores:board.staysUntilDone')} />
      )}
      {s.triggered_on && <Chip size="small" variant="outlined" label={t('chores:followups.chip')} />}
      {!s.visible && <Chip size="small" label={t('chores:board.hidden')} />}
    </Box>
  );

  const iconBox = (icon) => (
    <Box sx={{ width: 32, height: 32, borderRadius: 2, bgcolor: 'action.hover', display: 'grid', placeItems: 'center', fontSize: 18, flex: 'none' }}>
      {icon}
    </Box>
  );
  const routineChips = (steps, matchText) => (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
      <Chip size="small" color="secondary" variant="outlined" label={t('chores:routines.routineChip', { count: steps })} />
      {matchText !== undefined && <Chip size="small" variant="outlined" label={matchText ? `📅 ${matchText}` : t('chores:routines.needsEvents')} />}
    </Box>
  );

  // A person's calendar routines, once each: their one-date schedules come
  // and go with the calendar, so they aren't grouped by timing.
  const renderEventRoutines = () => (
    <Box
      component="section"
      aria-label={t('chores:routines.onCalendarGroup')}
      sx={{ mb: 2, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper', overflow: 'hidden' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, bgcolor: 'rgba(var(--accent-rgb), 0.10)' }}>
        <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 700 }}>{t('chores:routines.onCalendarGroup')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('chores:board.choreCount', { count: shownEventRoutines.length })}
        </Typography>
      </Box>
      {shownEventRoutines.map((r) => (
        <Box key={r.id} data-routine-row={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.75, borderTop: 1, borderColor: 'divider' }}>
          <Box aria-hidden sx={{ width: 32, flex: 'none' }} />
          {r.icon && iconBox(r.icon)}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body1" sx={{ fontWeight: 500 }}><SearchMark text={r.name} query={query} /></Typography>
            {routineChips(r.steps.length, r.match_text || '')}
            {matchedStep(r.id) && (
              <Typography variant="body2" color="text.secondary">{t('chores:page.stepPrefix')} <SearchMark text={matchedStep(r.id)} query={query} /></Typography>
            )}
          </Box>
          <Tooltip title={t('chores:routines.editInRoutine')}>
            <IconButton size="small" aria-label={`${t('chores:routines.editInRoutine')}: ${r.name}`} onClick={() => onEditRoutine?.(r.id)}>
              <Settings fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ))}
    </Box>
  );

  const renderCalendar = () => (
    <Box sx={{ mb: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t('chores:board.weekOf', { date: days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) })}
        </Typography>
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}>
          <Tooltip title={t('chores:board.prevWeek')}>
            <IconButton size="small" aria-label={t('chores:board.prevWeek')} onClick={() => setWeekOffset((w) => w - 1)}><ChevronLeft /></IconButton>
          </Tooltip>
          <Tooltip title={t('chores:board.thisWeek')}>
            <span>
              <IconButton size="small" aria-label={t('chores:board.thisWeek')} disabled={weekOffset === 0} onClick={() => setWeekOffset(0)}><Today fontSize="small" /></IconButton>
            </span>
          </Tooltip>
          <Tooltip title={t('chores:board.nextWeek')}>
            <IconButton size="small" aria-label={t('chores:board.nextWeek')} onClick={() => setWeekOffset((w) => w + 1)}><ChevronRight /></IconButton>
          </Tooltip>
        </Box>
      </Box>
      <Box sx={{ overflowX: 'auto', pb: 0.5 }}>
        <Box
          role="table"
          aria-label={t('chores:board.calendarAria', { name: personName })}
          sx={{
            display: 'grid',
            // The week fits the panel; only a phone scrolls it sideways.
            gridTemplateColumns: isMobile ? 'repeat(7, minmax(104px, 1fr))' : 'repeat(7, minmax(0, 1fr))',
            // On a phone the grid is as wide as its days, so the box around it
            // scrolls; otherwise the overflow below clips the days past the panel.
            minWidth: isMobile ? 7 * 104 : 0,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            overflow: 'hidden',
            bgcolor: 'background.paper',
          }}
        >
          {days.map((date, i) => {
            const day = week.days[i];
            const isToday = day.date === today;
            return (
              <Box
                key={date.toISOString()}
                role="cell"
                data-testid="board-day"
                sx={{
                  borderLeft: i ? 1 : 0,
                  borderColor: 'divider',
                  minHeight: 132,
                  display: 'flex',
                  flexDirection: 'column',
                  bgcolor: isToday ? 'rgba(var(--accent-rgb), 0.08)' : undefined,
                  // Vacation days: light stripes, nothing counted.
                  ...(day.vacation && { backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 10px, rgba(127,127,127,0.08) 10px 20px)' }),
                }}
              >
                <Box sx={{ px: 1, py: 0.75, display: 'flex', alignItems: 'baseline', gap: 0.75, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'text.secondary' }}>
                    {shortDays[date.getDay()]}
                  </Typography>
                  {day.vacation && <Typography variant="caption" title={t('chores:board.vacation')} aria-label={t('chores:board.vacation')}>🏖️</Typography>}
                  <Box
                    component="span"
                    sx={{
                      ml: 'auto',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      minWidth: 24,
                      height: 24,
                      borderRadius: '50%',
                      display: 'inline-grid',
                      placeItems: 'center',
                      ...(isToday && { bgcolor: 'var(--accent)', color: 'var(--accent-contrast, #fff)' }),
                    }}
                  >
                    {date.getDate()}
                  </Box>
                </Box>
                <Box sx={{ p: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {day.items.length === 0 ? (
                    <Typography variant="caption" color="text.disabled" sx={{ px: 0.25 }}>—</Typography>
                  ) : day.items.map(({ schedule: s, state, late, carriedFrom }) => (
                    <Box
                      key={s.id}
                      data-state={state}
                      data-carried={carriedFrom ? 'true' : undefined}
                      title={`${s.title} · ${t(`chores:board.state.${state}`)}${late ? ` (${t('chores:board.late')})` : ''}`}
                      sx={{
                        fontSize: '0.75rem',
                        lineHeight: 1.3,
                        px: 0.75,
                        py: 0.5,
                        borderRadius: 'var(--hg-radius-sm, 6px)',
                        wordBreak: 'break-word',
                        ...STATE_SX[state],
                      }}
                    >
                      {/* The title clamps at two lines; the "from Mon" line stays under it. */}
                      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {STATE_MARK[state] && <Box component="span" aria-hidden sx={{ fontWeight: 800, mr: 0.5 }}>{STATE_MARK[state]}</Box>}
                        {s.icon ? `${s.icon} ` : ''}{s.title}{late ? ` (${t('chores:board.late')})` : ''}
                      </Box>
                      {carriedFrom && (
                        <Box component="span" sx={{ display: 'block', fontSize: '0.6875rem', opacity: 0.8 }}>
                          {t('chores:board.fromDay', { day: shortDays[new Date(`${carriedFrom}T12:00:00`).getDay()] })}
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1, color: 'text.secondary', fontSize: '0.75rem' }}>
        {['done', 'missed', 'waiting'].map((state) => (
          <Box key={state} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <Box component="span" sx={{ px: 0.5, borderRadius: '4px', fontWeight: 800, ...STATE_SX[state] }}>{STATE_MARK[state]}</Box>
            {t(`chores:board.legend.${state}`)}
          </Box>
        ))}
        <Box component="span">🏖️ {t('chores:board.vacation')}</Box>
      </Box>
      {week.noDay.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t('chores:board.notOnADay')}{' '}
          {week.noDay.map(({ schedule: s, timing }) => `${s.icon ? `${s.icon} ` : ''}${s.title} (${timingLabel(timing)})`).join(', ')}
        </Typography>
      )}
    </Box>
  );

  const renderGroup = (group) => {
    const shown = group.schedules.filter(scheduleMatches);
    if (shown.length === 0) return null;
    const key = group.timing.key;
    const isDropTarget = drag && drag.fromKey !== key;
    const isOver = drag && drag.overKey === key && drag.fromKey !== key;
    return (
      <Box
        key={key}
        data-timing-key={key}
        component="section"
        aria-label={timingLabel(group.timing)}
        sx={{
          mb: 2,
          border: 1,
          borderColor: isOver ? 'var(--accent)' : 'divider',
          outline: isOver ? '2px solid var(--accent)' : 'none',
          borderStyle: isDropTarget && !isOver ? 'dashed' : 'solid',
          borderRadius: 1,
          bgcolor: 'background.paper',
          overflow: 'hidden',
          transition: 'outline-color 120ms',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, bgcolor: 'rgba(var(--accent-rgb), 0.10)' }}>
          <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 700 }}>{timingLabel(group.timing)}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('chores:board.choreCount', { count: shown.length })}
          </Typography>
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Button size="small" startIcon={<Add />} onClick={() => openAdd(group.timing)} disabled={busy}>
              {t('chores:board.addChores')}
            </Button>
            <Tooltip title={t('chores:board.groupMenu')}>
              <span>
                <IconButton size="small" aria-label={t('chores:board.groupMenu')} disabled={Boolean(query.trim())} onClick={(e) => setGroupMenu({ anchor: e.currentTarget, group })}>
                  <MoreVert fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>
        {shown.map((s) => (
          <Box
            key={s.id}
            data-schedule-row={s.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1,
              py: 0.75,
              borderTop: 1,
              borderColor: 'divider',
              opacity: drag?.schedule.id === s.id ? 0.35 : 1,
            }}
          >
            {s.routine ? (
              // A routine moves with its own days, in the routine editor.
              <Box aria-hidden sx={{ width: 32, flex: 'none' }} />
            ) : (
              <Box
                {...dragHandlers(s, key)}
                aria-label={t('chores:board.dragHandle', { title: s.title })}
                role="button"
                tabIndex={-1}
                sx={{ touchAction: 'none', cursor: drag ? 'grabbing' : 'grab', display: 'grid', placeItems: 'center', width: 32, height: 40, color: 'text.secondary', flex: 'none' }}
              >
                <DragIndicator />
              </Box>
            )}
            {/* A chore without an icon starts its title right after the grip. */}
            {s.icon && iconBox(s.icon)}
            <Box sx={{ flex: 1, minWidth: 0, opacity: s.visible ? 1 : 0.6 }}>
              <Typography variant="body1" sx={{ fontWeight: 500 }}><SearchMark text={s.title} query={query} /></Typography>
              {s.routine ? routineChips(s.routine.steps) : choreChips(s)}
              {s.routine && matchedStep(s.routine.id) && (
                <Typography variant="body2" color="text.secondary">{t('chores:page.stepPrefix')} <SearchMark text={matchedStep(s.routine.id)} query={query} /></Typography>
              )}
            </Box>
            {s.routine ? (
              <Tooltip title={t('chores:routines.editInRoutine')}>
                <IconButton size="small" aria-label={`${t('chores:routines.editInRoutine')}: ${s.title}`} onClick={() => onEditRoutine?.(s.routine.id)}>
                  <Settings fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : (
              <>
                <Tooltip title={s.visible ? t('chores:board.hide') : t('chores:board.show')}>
                  <Switch size="small" checked={!!s.visible} onChange={() => onToggleVisible(s)} slotProps={{ input: { 'aria-label': t('chores:schedules.visible') } }} />
                </Tooltip>
                <Tooltip title={t('chores:board.choreSettings')}>
                  <IconButton size="small" aria-label={t('chores:board.choreSettings')} onClick={() => onEditSchedule(s)}>
                    <Settings fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('common:actions.remove')}>
                  <IconButton size="small" color="error" aria-label={t('common:actions.remove')} onClick={() => onDeleteSchedule(s)}>
                    <Delete fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Box>
        ))}
      </Box>
    );
  };

  // ── Add dialog body ───────────────────────────────────────────────
  const renderAddTimingStep = () => {
    // Every common schedule is offered, even ones the person already has:
    // picking one of those adds to it.
    const pick = (timing) => setAddDialog((d) => ({ ...d, step: 'chores', timing, date: timing.kind === 'once' ? (timing.dueDate || '') : '', keep: null, fromWizard: false }));
    const wizardMode = addMode === 'wizard';
    const finishWizard = (timing, keep) => setAddDialog((d) => ({
      ...d, step: 'chores', timing, keep, fromWizard: true, date: timing.kind === 'once' ? (timing.dueDate || '') : '',
    }));
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {wizardMode ? (
          <ScheduleWizard
            value={addDialog.wizard}
            onChange={(wizard) => setAddDialog((d) => ({ ...d, wizard }))}
            onDone={finishWizard}
            timingLabel={timingLabel}
            shortDays={shortDays}
          />
        ) : (
          <SchedulePicker onPick={pick} timingLabel={timingLabel} shortDays={shortDays} />
        )}
        {/* Below the picker or wizard, the person's own schedules: in the
            wizard, on its first step only. */}
        {(!wizardMode || addDialog.wizard.step === 'how') && (
          <TheirSchedules groups={groups} personName={personName} timingLabel={timingLabel} onPick={pick} />
        )}
      </Box>
    );
  };

  // The wizard's last step: what will be added, in a sentence, before Add.
  const renderAddReview = () => {
    const picked = choresByTitle.filter((c) => addDialog.picked.has(c.id));
    const names = picked.map((c) => `${c.icon ? `${c.icon} ` : ''}${c.title}`);
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography variant="caption" color="text.secondary">{t('chores:wizard.stepOf', { step: wizardStepCount(), count: wizardStepCount() })}</Typography>
        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(var(--accent-rgb), 0.06)', borderColor: 'var(--accent)' }}>
          <Typography sx={{ fontWeight: 600 }}>
            {t('chores:wizard.reviewSentence', { name: personName, chores: names.join(', '), timing: timingLabel(addTiming) })}
          </Typography>
          {addDialog.keep === true && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{t('chores:wizard.reviewKeep')}</Typography>}
          {addDialog.keep === false && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{t('chores:wizard.reviewDrop')}</Typography>}
          {addTiming?.kind === 'anyDay' && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{t('chores:wizard.anyDayNote')}</Typography>}
        </Paper>
        {pickedMoves.length > 0 && (
          <Alert severity="info">{t('chores:wizard.reviewMoves', { count: pickedMoves.length })}</Alert>
        )}
      </Box>
    );
  };
  // How many steps the wizard has for the answers given: how, details,
  // (if missed), chores, review.
  const wizardStepCount = () => (['days', 'everyN', 'monthly'].includes(addDialog?.wizard?.how) ? 5 : 4);

  const renderAddChoresStep = () => {
    const search = addDialog.search.trim().toLowerCase();
    const list = choresByTitle.filter((c) => !search || String(c.title).toLowerCase().includes(search));
    const toggle = (id) => setAddDialog((d) => {
      const picked = new Set(d.picked);
      if (picked.has(id)) picked.delete(id); else picked.add(id);
      return { ...d, picked };
    });
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {addDialog.fromWizard && (
          <Typography variant="caption" color="text.secondary">
            {t('chores:wizard.stepOf', { step: wizardStepCount() - 1, count: wizardStepCount() })} · {t('chores:wizard.choresTitle')}
          </Typography>
        )}
        {addDialog.timing.kind === 'anyDay' && !addDialog.fromWizard && <Alert severity="info">{t('chores:wizard.anyDayNote')}</Alert>}
        {addDialog.timing.kind === 'once' && !addDialog.fromWizard && (
          <TextField
            size="small"
            type="date"
            label={t('chores:schedules.dueDateOptional')}
            value={addDialog.date}
            onChange={(e) => setAddDialog((d) => ({ ...d, date: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ maxWidth: 220 }}
          />
        )}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {chores.length > 8 && (
            <TextField
              size="small"
              placeholder={t('chores:board.searchChores')}
              value={addDialog.search}
              onChange={(e) => setAddDialog((d) => ({ ...d, search: e.target.value }))}
              sx={{ flex: 1 }}
            />
          )}
          <Button size="small" startIcon={<Add />} onClick={onCreateChore} sx={{ ml: 'auto', flex: 'none' }}>
            {t('chores:schedules.newChore')}
          </Button>
        </Box>
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: isMobile ? 'none' : 380, overflowY: 'auto' }}>
          {list.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>{t('chores:schedules.noChores')}</Typography>}
          {list.map((c, i) => {
            const mine = mineByChore.get(c.id);
            const here = mine?.some((m) => m.timing.key === addTiming.key);
            const elsewhere = !here && mine ? mine[0].timing : null;
            const checked = here || addDialog.picked.has(c.id);
            let note = null;
            if (here) note = t('chores:board.alreadyHere');
            else if (elsewhere) note = addDialog.picked.has(c.id)
              ? t('chores:board.willMove', { timing: timingLabel(elsewhere) })
              : t('chores:board.inOther', { timing: timingLabel(elsewhere) });
            return (
              <Box key={c.id} sx={{ borderTop: i ? 1 : 0, borderColor: 'divider' }}>
                <FormControlLabel
                  sx={{ m: 0, px: 1, py: 0.25, width: '100%' }}
                  control={<Checkbox checked={checked} disabled={here} onChange={() => toggle(c.id)} />}
                  label={(
                    <ListItemText
                      primary={`${c.icon ? `${c.icon} ` : ''}${c.title}${c.clam_value > 0 ? `  +${c.clam_value} 🥟` : ''}`}
                      secondary={note}
                      slotProps={{ secondary: { sx: { color: elsewhere && addDialog.picked.has(c.id) ? 'warning.main' : 'text.secondary' } } }}
                    />
                  )}
                />
              </Box>
            );
          })}
        </Box>
        {pickedMoves.length > 0 && (
          <Alert severity="info">
            {t('chores:board.moveNote', {
              list: pickedMoves.map((id) => `${chores.find((c) => c.id === id)?.title} (${timingLabel(mineByChore.get(id)[0].timing)})`).join(', '),
            })}
          </Alert>
        )}
      </Box>
    );
  };

  // ── Edit-days dialog body ─────────────────────────────────────────
  const renderEditDays = () => {
    const d = editDialog;
    const kind = d.group.timing.kind;
    const set = (patch) => setEditDialog((x) => ({ ...x, ...patch }));
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {kind === 'week' && <QuickDays onPick={(days) => set({ days })} />}
        {kind === 'week' && (
          <ToggleButtonGroup size="small" value={d.days} onChange={(_, v) => set({ days: v })} aria-label={t('chores:board.pickDays')} sx={{ flexWrap: 'wrap' }}>
            {DAY_ORDER.map((x) => <ToggleButton key={x} value={x} sx={{ minWidth: 44 }}>{shortDays[x]}</ToggleButton>)}
          </ToggleButtonGroup>
        )}
        {kind === 'everyN' && (
          <TextField size="small" type="number" label={t('chores:board.everyHowManyDays')} value={d.n} onChange={(e) => set({ n: e.target.value })} slotProps={{ htmlInput: { min: 2, max: 31 } }} sx={{ maxWidth: 200 }} />
        )}
        {kind === 'monthly' && (
          <TextField size="small" label={t('chores:board.daysOfMonth')} helperText={t('chores:board.daysOfMonthHelp')} value={d.dom} onChange={(e) => set({ dom: e.target.value })} sx={{ maxWidth: 260 }} />
        )}
        {kind === 'once' && (
          <TextField size="small" type="date" label={t('chores:schedules.dueDateOptional')} value={d.date} onChange={(e) => set({ date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: 220 }} />
        )}
        {kind === 'months' && <CustomPanel custom={d.custom} onChange={(custom) => set({ custom: { ...custom, from: 'dates' } })} timingLabel={timingLabel} />}
        {kind === 'after' && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField size="small" type="number" label={t('chores:board.againAfterCount')} value={d.count} onChange={(e) => set({ count: e.target.value })} slotProps={{ htmlInput: { min: 1 } }} sx={{ width: 120 }} />
            <TextField select size="small" label={t('chores:schedules.sleepUnit')} value={d.unit} onChange={(e) => set({ unit: e.target.value })} sx={{ width: 140 }}>
              <MenuItem value="d">{t('chores:schedules.unitDays')}</MenuItem>
              <MenuItem value="w">{t('chores:schedules.unitWeeks')}</MenuItem>
              <MenuItem value="m">{t('chores:schedules.unitMonths')}</MenuItem>
              <MenuItem value="y">{t('chores:schedules.unitYears')}</MenuItem>
            </TextField>
          </Box>
        )}
        {kind === 'custom' && <Alert severity="info">{t('chores:board.customEdit')}</Alert>}
        {kind !== 'custom' && (
          <Alert severity="warning">
            {t('chores:board.changesCount', { count: choresOf(d.group).length, name: personName })}
          </Alert>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ position: 'relative' }}>
      {tab === BONUS && <Alert severity="info" sx={{ mb: 2 }}>{t('chores:board.bonusHelp')}</Alert>}

      {/* While searching, the results come first. */}
      {!query.trim() && renderCalendar()}

      <Box sx={{ ...adminHeadingRowSx, justifyContent: 'flex-start', mb: 1.5 }}>
        <Typography variant="overline" component="h3" sx={adminHeadingTextSx}>
          {t('chores:board.timingsHeading', { name: personName })}
        </Typography>
        {busy && <CircularProgress size={16} />}
        <Button variant="contained" size="small" startIcon={<Add />} onClick={() => openAdd()} sx={{ ml: 'auto' }} disabled={busy}>
          {t('chores:board.add')}
        </Button>
      </Box>

      {query.trim() && !groups.some((g) => g.schedules.some(scheduleMatches)) && shownEventRoutines.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
          {t('chores:page.noMatches')}
        </Typography>
      ) : groups.length === 0 && eventRoutines.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
          {t('chores:board.empty', { name: personName })}
        </Typography>
      ) : groups.map(renderGroup)}
      {shownEventRoutines.length > 0 && renderEventRoutines()}

      {drag && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            left: drag.x + 12,
            top: drag.y - 18,
            px: 1.5,
            py: 1,
            pointerEvents: 'none',
            zIndex: 2000,
            fontWeight: 600,
            maxWidth: 260,
            border: 2,
            borderColor: 'var(--accent)',
          }}
        >
          {drag.schedule.icon ? `${drag.schedule.icon} ` : ''}{drag.schedule.title}
          {drag.overKey && drag.overKey !== drag.fromKey && groupByKey.get(drag.overKey) && (
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
              → {timingLabel(groupByKey.get(drag.overKey).timing)}
            </Typography>
          )}
        </Paper>
      )}

      {/* Group menu */}
      <Menu open={!!groupMenu} anchorEl={groupMenu?.anchor} onClose={() => setGroupMenu(null)}>
        {/* A group of routines only has nothing these can change; a
            once-a-week group has no days to change. */}
        <MenuItem onClick={() => { const g = groupMenu.group; setGroupMenu(null); openEditDays(g); }} disabled={['custom', 'anyDay'].includes(groupMenu?.group.timing.kind) || menuEmpty}>
          <EditCalendar fontSize="small" sx={{ mr: 1.5 }} />{t('chores:board.changeDays')}
        </MenuItem>
        <MenuItem onClick={() => { const g = groupMenu.group; setGroupMenu(null); setCopyDialog({ group: g, targets: [] }); }} disabled={menuEmpty}>
          <ContentCopy fontSize="small" sx={{ mr: 1.5 }} />{t('chores:board.copyTo')}
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { const g = groupMenu.group; setGroupMenu(null); setRemoveGroup(g); }} sx={{ color: 'error.main' }} disabled={menuEmpty}>
          <Delete fontSize="small" sx={{ mr: 1.5 }} />{t('chores:board.removeGroup')}
        </MenuItem>
      </Menu>

      {/* Add chores */}
      <Dialog open={!!addDialog} onClose={() => setAddDialog(null)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        {/* Picker | Wizard sits beside the title, not in it, so it stays
            out of the dialog's name. */}
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1, pr: 3 }}>
          {/* On a phone the toggle gets its own row under the title. */}
          <DialogTitle sx={{ flex: { xs: '1 1 100%', sm: 1 } }}>
            {addDialog?.step === 'review'
              ? t('chores:wizard.reviewTitle')
              : addDialog?.step === 'chores'
                ? t('chores:board.addToTitle', { timing: timingLabel(addTiming), name: personName })
                : t('chores:board.addTitle', { name: personName })}
          </DialogTitle>
          {addDialog?.step === 'timing' && (
            <AddModeToggle value={addMode} onChange={setAddMode} sx={{ ml: { xs: 3, sm: 0 }, mb: { xs: 1.5, sm: 0 } }} />
          )}
        </Box>
        <DialogContent dividers>
          {addDialog && (addDialog.step === 'timing'
            ? renderAddTimingStep()
            : addDialog.step === 'review' ? renderAddReview() : renderAddChoresStep())}
        </DialogContent>
        <DialogActions>
          {addDialog?.step === 'chores' && (
            // Back to the wizard keeps its answers; to the picker, starts over.
            <Button onClick={() => setAddDialog((d) => ({ ...d, step: 'timing', picked: d.fromWizard ? d.picked : new Set() }))} sx={{ mr: 'auto' }}>
              {t('chores:board.back')}
            </Button>
          )}
          {addDialog?.step === 'review' && (
            <Button onClick={() => setAddDialog((d) => ({ ...d, step: 'chores' }))} sx={{ mr: 'auto' }}>
              {t('chores:board.back')}
            </Button>
          )}
          <Button onClick={() => setAddDialog(null)}>{t('common:actions.cancel')}</Button>
          {addDialog?.step === 'chores' && addDialog.fromWizard && (
            <Button variant="contained" onClick={() => setAddDialog((d) => ({ ...d, step: 'review' }))} disabled={!addDialog.picked.size}>
              {t('chores:board.next')}
            </Button>
          )}
          {(addDialog?.step === 'review' || (addDialog?.step === 'chores' && !addDialog.fromWizard)) && (
            <Button variant="contained" onClick={saveAdd} disabled={!addDialog.picked.size}>
              {pickedMoves.length
                ? t('chores:board.addAndMove', { added: pickedNew.length, moved: pickedMoves.length })
                : t('chores:board.addCount', { count: pickedNew.length })}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Change days */}
      <Dialog open={!!editDialog} onClose={() => setEditDialog(null)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>{editDialog && t('chores:board.changeDaysTitle', { timing: timingLabel(editDialog.group.timing) })}</DialogTitle>
        <DialogContent>{editDialog && renderEditDays()}</DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(null)}>{t('common:actions.cancel')}</Button>
          <Button
            variant="contained"
            onClick={saveEditDays}
            disabled={!editedTiming(editDialog) || editedTiming(editDialog)?.key === editDialog?.group.timing.key}
          >
            {t('common:actions.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Copy to another person */}
      <Dialog open={!!copyDialog} onClose={() => setCopyDialog(null)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>{copyDialog && t('chores:board.copyTitle', { timing: timingLabel(copyDialog.group.timing) })}</DialogTitle>
        <DialogContent>
          {copyDialog && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">{t('chores:board.copyHelp')}</Typography>
              {users.filter((u) => u.id !== userId).map((u) => {
                const on = copyDialog.targets.includes(u.id);
                const plan = copyPlan.find((p) => p.targetId === u.id);
                return (
                  <Box key={u.id}>
                    <FormControlLabel
                      control={(
                        <Checkbox
                          checked={on}
                          onChange={() => setCopyDialog((c) => ({ ...c, targets: on ? c.targets.filter((x) => x !== u.id) : [...c.targets, u.id] }))}
                        />
                      )}
                      label={u.username}
                    />
                    {plan && (
                      <Typography variant="body2" color="text.secondary" sx={{ pl: 4, mt: -0.5 }}>
                        {t('chores:board.copyAdds', { count: plan.add.length })}
                        {plan.skip.length > 0 && ` ${t('chores:board.copySkips', {
                          list: plan.skip.map(({ s, timing }) => `${s.title} (${timingLabel(timing)})`).join(', '),
                        })}`}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCopyDialog(null)}>{t('common:actions.cancel')}</Button>
          <Button variant="contained" onClick={saveCopy} disabled={!copyPlan.some((p) => p.add.length)}>
            {t('chores:board.copy')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Remove a group */}
      <Dialog open={!!removeGroup} onClose={() => setRemoveGroup(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{removeGroup && t('chores:board.removeGroupTitle', { timing: timingLabel(removeGroup.timing) })}</DialogTitle>
        <DialogContent>
          {removeGroup && (
            <Alert severity="warning">
              {t('chores:board.removeGroupWarning', { count: choresOf(removeGroup).length, name: personName })}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveGroup(null)}>{t('common:actions.cancel')}</Button>
          <Button variant="contained" color="error" startIcon={<Delete />} onClick={saveRemoveGroup}>{t('common:actions.remove')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
