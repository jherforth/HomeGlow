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
  Tab,
  Tabs,
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
  SwapHoriz,
  Today,
} from '@mui/icons-material';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getWeekdayLabels, getWeekdayOptions } from '../utils/dateUtils.js';
import { getServerTimezoneSync } from '../utils/timezone.js';
import useIsMobile from '../hooks/useIsMobile.js';
import {
  COMMON_TIMINGS,
  afterTiming,
  everyNTiming,
  groupSchedulesForUser,
  monthlyTiming,
  onceTiming,
  scheduleFieldsForTiming,
  timingFallsOn,
  weekDates,
  weekTiming,
} from '../utils/choreScheduleGroups.js';

// "By person" view of Admin → Chores → Schedules: one tab per person (and
// one for the unassigned bonus chores), a week calendar of what they have on
// each day, and their chores grouped by timing. A group is the person's
// schedules that share the same days; nothing is stored about the group
// itself, so history, routines, follow-ups and every per-chore setting carry
// on exactly as before. A chore sits in one group per person: adding it to
// another moves it there.

const BONUS = 'bonus';
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

// Settings a copied schedule takes from the one it was copied from.
const COPIED_FIELDS = [
  'crontab', 'duration', 'interval', 'due_date', 'due_time', 'expire_minutes', 'sound_enabled',
  'sound', 'reminder_interval_minutes', 'transferable', 'can_snooze', 'visible',
];

const dateLabel = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
}) {
  const { t } = useTranslation(['chores', 'common']);
  const isMobile = useIsMobile();
  const shortDays = useMemo(() => getWeekdayLabels(0), []);
  const longDays = useMemo(() => getWeekdayOptions().map((o) => o.label), []);
  const tz = getServerTimezoneSync();

  const [tab, setTab] = useState(() => (users[0] ? String(users[0].id) : BONUS));
  // A person removed since the tab was picked falls back to the first one.
  useEffect(() => {
    if (tab !== BONUS && !users.some((u) => String(u.id) === tab)) {
      setTab(users[0] ? String(users[0].id) : BONUS);
    }
  }, [users, tab]);
  const userId = tab === BONUS ? null : Number(tab);
  const personName = tab === BONUS ? t('chores:board.bonusTab') : (users.find((u) => u.id === userId)?.username || '');

  const groups = useMemo(() => groupSchedulesForUser(schedules, userId), [schedules, userId]);
  const groupByKey = useMemo(() => new Map(groups.map((g) => [g.timing.key, g])), [groups]);
  const choresByTitle = useMemo(
    () => [...chores].sort((a, b) => String(a.title).localeCompare(String(b.title))),
    [chores],
  );
  const countFor = (id) => groupSchedulesForUser(schedules, id).reduce((n, g) => n + g.schedules.length, 0);

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

  // ── Names for timings ─────────────────────────────────────────────
  const intervalText = (interval) => {
    const m = String(interval || '').match(/^(\d+)([dwmy])$/i);
    if (!m) return interval || '';
    return t(`chores:board.unit_${m[2].toLowerCase()}`, { count: Number(m[1]) });
  };
  const timingLabel = (timing) => {
    switch (timing.kind) {
      case 'week': {
        const d = timing.days;
        if (d.length === 7) return t('chores:board.timing.everyDay');
        if (d.join() === '1,2,3,4,5') return t('chores:board.timing.weekdays');
        if (d.join() === '0,6') return t('chores:board.timing.weekends');
        if (d.length === 1) return t('chores:board.timing.everyDayName', { day: longDays[d[0]] });
        return MON_FIRST.filter((x) => d.includes(x)).map((x) => shortDays[x]).join(' · ');
      }
      case 'everyN':
        return timing.n === 2 ? t('chores:board.timing.everyOtherDay') : t('chores:board.timing.everyNDays', { count: timing.n });
      case 'monthly':
        return t('chores:board.timing.monthly', { days: timing.dom.split(',').join(', ') });
      case 'once':
        return timing.dueDate ? t('chores:board.timing.oneTimeOn', { date: dateLabel(timing.dueDate) }) : t('chores:board.timing.oneTime');
      case 'after':
        return t('chores:board.timing.againAfter', { interval: intervalText(timing.interval) });
      default:
        return t('chores:board.timing.custom', { expr: timing.rest });
    }
  };

  // ── Week calendar ─────────────────────────────────────────────────
  const [weekOffset, setWeekOffset] = useState(0);
  const days = useMemo(() => weekDates(new Date(), weekOffset), [weekOffset]);
  const todayKey = new Date().toDateString();
  const { byDay, noDay } = useMemo(() => {
    const perDay = days.map(() => []);
    const unplaced = [];
    for (const g of groups) {
      for (const s of g.schedules) {
        if (!s.visible) continue;
        let placed = false;
        let unknown = false;
        days.forEach((date, i) => {
          const falls = timingFallsOn(g.timing, date, { schedule: s, tz });
          if (falls === null) unknown = true;
          if (falls) { perDay[i].push(s); placed = true; }
        });
        if (unknown && !placed) unplaced.push({ s, timing: g.timing });
      }
    }
    perDay.forEach((list) => list.sort((a, b) => String(a.title).localeCompare(String(b.title))));
    return { byDay: perDay, noDay: unplaced };
  }, [groups, days, tz]);

  // ── Moving one chore (drag, or Move to…) ──────────────────────────
  const moveSchedule = (schedule, timing) => run(
    () => axios.patch(`${API_BASE_URL}/api/chore-schedules/${schedule.id}`, scheduleFieldsForTiming(timing, schedule)),
    t('chores:board.moved', { title: schedule.title, timing: timingLabel(timing) }),
  );

  const [moveMenu, setMoveMenu] = useState(null); // { anchor, schedule, fromKey }

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
  const [addDialog, setAddDialog] = useState(null); // { step, timing, picked:Set, days:[], date }
  const openAdd = (timing = null) => setAddDialog({
    step: timing ? 'chores' : 'timing',
    timing,
    picked: new Set(),
    days: [],
    date: timing?.kind === 'once' ? (timing.dueDate || '') : '',
    search: '',
  });
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

  const saveAdd = () => {
    const timing = addTiming;
    const fields = scheduleFieldsForTiming(timing);
    const moves = pickedMoves.map((id) => mineByChore.get(id)[0].s);
    const created = pickedNew.length;
    setAddDialog(null);
    run(async () => {
      for (const choreId of pickedNew) {
        await axios.post(`${API_BASE_URL}/api/chore-schedules`, { chore_id: choreId, user_id: userId, visible: 1, ...fields });
      }
      for (const s of moves) {
        await axios.patch(`${API_BASE_URL}/api/chore-schedules/${s.id}`, scheduleFieldsForTiming(timing, s));
      }
    }, moves.length
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
      case 'after': return Number(d.count) >= 1 ? afterTiming(`${Number(d.count)}${d.unit}`) : null;
      default: return null;
    }
  };
  const saveEditDays = () => {
    const timing = editedTiming(editDialog);
    const { group } = editDialog;
    setEditDialog(null);
    if (!timing || timing.key === group.timing.key) return;
    run(async () => {
      for (const s of group.schedules) {
        await axios.patch(`${API_BASE_URL}/api/chore-schedules/${s.id}`, scheduleFieldsForTiming(timing, s));
      }
    }, t('chores:board.daysChanged', { count: group.schedules.length, timing: timingLabel(timing) }));
  };

  // ── Copy a group to other people ──────────────────────────────────
  const [copyDialog, setCopyDialog] = useState(null); // { group, targets:[] }
  const copyPlan = useMemo(() => {
    if (!copyDialog) return [];
    return copyDialog.targets.map((targetId) => {
      const theirs = new Map();
      for (const g of groupSchedulesForUser(schedules, targetId)) for (const s of g.schedules) theirs.set(s.chore_id, g.timing);
      const add = copyDialog.group.schedules.filter((s) => !theirs.has(s.chore_id));
      const skip = copyDialog.group.schedules.filter((s) => theirs.has(s.chore_id)).map((s) => ({ s, timing: theirs.get(s.chore_id) }));
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
        if (body.duration !== 'once-completed') body.interval = null;
        await axios.post(`${API_BASE_URL}/api/chore-schedules`, body);
      }
    }, t('chores:board.copied', { count: total }));
  };

  // ── Remove a whole group ──────────────────────────────────────────
  const [removeGroup, setRemoveGroup] = useState(null);
  const saveRemoveGroup = () => {
    const group = removeGroup;
    setRemoveGroup(null);
    run(async () => {
      for (const s of group.schedules) await axios.delete(`${API_BASE_URL}/api/chore-schedules/${s.id}`);
    }, t('chores:board.groupRemoved', { count: group.schedules.length }));
  };

  const [groupMenu, setGroupMenu] = useState(null); // { anchor, group }

  // ── Pieces ────────────────────────────────────────────────────────
  const choreChips = (s) => (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
      {s.clam_value > 0 && <Chip size="small" color="primary" label={`+${s.clam_value} 🥟`} />}
      {s.due_time && <Chip size="small" variant="outlined" label={`${s.sound_enabled ? '🔔' : '⏰'} ${fmtTime(s.due_time)}`} />}
      {s.crontab && s.duration === 'until-completed' && <Chip size="small" color="warning" variant="outlined" label={t('chores:board.staysUntilDone')} />}
      {s.triggered_on && <Chip size="small" variant="outlined" label={t('chores:followups.chip')} />}
      {!s.visible && <Chip size="small" label={t('chores:board.hidden')} />}
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
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            overflow: 'hidden',
            bgcolor: 'background.paper',
          }}
        >
          {days.map((date, i) => {
            const isToday = date.toDateString() === todayKey;
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
                }}
              >
                <Box sx={{ px: 1, py: 0.75, display: 'flex', alignItems: 'baseline', gap: 0.75, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'text.secondary' }}>
                    {shortDays[date.getDay()]}
                  </Typography>
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
                  {byDay[i].length === 0 ? (
                    <Typography variant="caption" color="text.disabled" sx={{ px: 0.25 }}>—</Typography>
                  ) : byDay[i].map((s) => (
                    <Box
                      key={s.id}
                      title={s.title}
                      sx={{
                        fontSize: '0.75rem',
                        lineHeight: 1.3,
                        px: 0.75,
                        py: 0.5,
                        borderRadius: 'var(--hg-radius-sm, 6px)',
                        bgcolor: 'action.hover',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        wordBreak: 'break-word',
                      }}
                    >
                      {s.icon ? `${s.icon} ` : ''}{s.title}
                    </Box>
                  ))}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
      {noDay.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t('chores:board.notOnADay')}{' '}
          {noDay.map(({ s, timing }) => `${s.icon ? `${s.icon} ` : ''}${s.title} (${timingLabel(timing)})`).join(', ')}
        </Typography>
      )}
    </Box>
  );

  const renderGroup = (group) => {
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
            {t('chores:board.choreCount', { count: group.schedules.length })}
          </Typography>
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Button size="small" startIcon={<Add />} onClick={() => openAdd(group.timing)} disabled={busy}>
              {t('chores:board.addChores')}
            </Button>
            <Tooltip title={t('chores:board.groupMenu')}>
              <IconButton size="small" aria-label={t('chores:board.groupMenu')} onClick={(e) => setGroupMenu({ anchor: e.currentTarget, group })}>
                <MoreVert fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        {group.schedules.map((s) => (
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
            <Box
              {...dragHandlers(s, key)}
              aria-label={t('chores:board.dragHandle', { title: s.title })}
              role="button"
              tabIndex={-1}
              sx={{ touchAction: 'none', cursor: drag ? 'grabbing' : 'grab', display: 'grid', placeItems: 'center', width: 32, height: 40, color: 'text.secondary', flex: 'none' }}
            >
              <DragIndicator />
            </Box>
            {/* A chore without an icon starts its title right after the grip. */}
            {s.icon && (
              <Box sx={{ width: 32, height: 32, borderRadius: 2, bgcolor: 'action.hover', display: 'grid', placeItems: 'center', fontSize: 18, flex: 'none' }}>
                {s.icon}
              </Box>
            )}
            <Box sx={{ flex: 1, minWidth: 0, opacity: s.visible ? 1 : 0.6 }}>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>{s.title}</Typography>
              {choreChips(s)}
            </Box>
            <Tooltip title={s.visible ? t('chores:board.hide') : t('chores:board.show')}>
              <Switch size="small" checked={!!s.visible} onChange={() => onToggleVisible(s)} slotProps={{ input: { 'aria-label': t('chores:schedules.visible') } }} />
            </Tooltip>
            <Tooltip title={t('chores:board.moveTo')}>
              <IconButton size="small" aria-label={t('chores:board.moveTo')} onClick={(e) => setMoveMenu({ anchor: e.currentTarget, schedule: s, fromKey: key })}>
                <SwapHoriz fontSize="small" />
              </IconButton>
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
          </Box>
        ))}
      </Box>
    );
  };

  // ── Add dialog body ───────────────────────────────────────────────
  const renderAddTimingStep = () => {
    const theirKeys = new Set(groups.map((g) => g.timing.key));
    const others = COMMON_TIMINGS.filter((tm) => !theirKeys.has(tm.key));
    const pick = (timing) => setAddDialog((d) => ({ ...d, step: 'chores', timing, date: timing.kind === 'once' ? (timing.dueDate || '') : '' }));
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {groups.length > 0 && (
          <Box>
            <Typography variant="overline" color="text.secondary">{t('chores:board.theirTimings', { name: personName })}</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {groups.map((g) => (
                <Paper
                  key={g.timing.key}
                  variant="outlined"
                  component="button"
                  type="button"
                  onClick={() => pick(g.timing)}
                  sx={{ textAlign: 'left', p: 1.5, cursor: 'pointer', bgcolor: 'background.paper', color: 'text.primary', font: 'inherit', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <Typography sx={{ fontWeight: 700 }}>{timingLabel(g.timing)}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {g.schedules.map((s) => `${s.icon ? `${s.icon} ` : ''}${s.title}`).join(', ')}
                  </Typography>
                </Paper>
              ))}
            </Box>
          </Box>
        )}
        <Box>
          <Typography variant="overline" color="text.secondary">{t('chores:board.otherTimings')}</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {others.map((tm) => (
              <Chip key={tm.key} label={timingLabel(tm)} onClick={() => pick(tm)} variant="outlined" sx={{ fontSize: '0.875rem', height: 36 }} />
            ))}
          </Box>
        </Box>
        <Box>
          <Typography variant="overline" color="text.secondary">{t('chores:board.pickDays')}</Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <ToggleButtonGroup
              size="small"
              value={addDialog.days}
              onChange={(_, v) => setAddDialog((d) => ({ ...d, days: v }))}
              aria-label={t('chores:board.pickDays')}
            >
              {MON_FIRST.map((d) => <ToggleButton key={d} value={d} sx={{ minWidth: 44 }}>{shortDays[d]}</ToggleButton>)}
            </ToggleButtonGroup>
            <Button variant="contained" size="small" disabled={!addDialog.days.length} onClick={() => pick(weekTiming(addDialog.days))}>
              {t('chores:board.next')}
            </Button>
          </Box>
        </Box>
      </Box>
    );
  };

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
        {addDialog.timing.kind === 'once' && (
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
        {kind === 'week' && (
          <ToggleButtonGroup size="small" value={d.days} onChange={(_, v) => set({ days: v })} aria-label={t('chores:board.pickDays')} sx={{ flexWrap: 'wrap' }}>
            {MON_FIRST.map((x) => <ToggleButton key={x} value={x} sx={{ minWidth: 44 }}>{shortDays[x]}</ToggleButton>)}
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
            {t('chores:board.changesCount', { count: d.group.schedules.length, name: personName })}
          </Alert>
        )}
      </Box>
    );
  };

  const moveTargets = moveMenu ? groups.filter((g) => g.timing.key !== moveMenu.fromKey) : [];

  return (
    <Box sx={{ position: 'relative' }}>
      <Tabs
        value={tab}
        onChange={(_, v) => { setTab(v); setWeekOffset(0); }}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {users.map((u) => (
          <Tab key={u.id} value={String(u.id)} label={`${u.username} (${countFor(u.id)})`} sx={{ textTransform: 'none', fontWeight: 600 }} />
        ))}
        <Tab value={BONUS} label={`${t('chores:board.bonusTab')} (${countFor(null)})`} sx={{ textTransform: 'none', fontWeight: 600 }} />
      </Tabs>

      {tab === BONUS && <Alert severity="info" sx={{ mb: 2 }}>{t('chores:board.bonusHelp')}</Alert>}

      {renderCalendar()}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="overline" component="h3" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.06em' }}>
          {t('chores:board.timingsHeading', { name: personName })}
        </Typography>
        {busy && <CircularProgress size={16} />}
        <Button variant="contained" size="small" startIcon={<Add />} onClick={() => openAdd()} sx={{ ml: 'auto' }} disabled={busy}>
          {t('chores:board.add')}
        </Button>
      </Box>

      {groups.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
          {t('chores:board.empty', { name: personName })}
        </Typography>
      ) : groups.map(renderGroup)}

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

      {/* Move to… */}
      <Menu open={!!moveMenu} anchorEl={moveMenu?.anchor} onClose={() => setMoveMenu(null)}>
        <MenuItem disabled sx={{ opacity: '1 !important' }}>
          <Typography variant="caption" color="text.secondary">{t('chores:board.moveTitle', { title: moveMenu?.schedule.title })}</Typography>
        </MenuItem>
        {moveTargets.length === 0 && <MenuItem disabled>{t('chores:board.noOtherGroups')}</MenuItem>}
        {moveTargets.map((g) => (
          <MenuItem key={g.timing.key} onClick={() => { const s = moveMenu.schedule; setMoveMenu(null); moveSchedule(s, g.timing); }}>
            {timingLabel(g.timing)}
          </MenuItem>
        ))}
      </Menu>

      {/* Group menu */}
      <Menu open={!!groupMenu} anchorEl={groupMenu?.anchor} onClose={() => setGroupMenu(null)}>
        <MenuItem onClick={() => { const g = groupMenu.group; setGroupMenu(null); openEditDays(g); }} disabled={groupMenu?.group.timing.kind === 'custom'}>
          <EditCalendar fontSize="small" sx={{ mr: 1.5 }} />{t('chores:board.changeDays')}
        </MenuItem>
        <MenuItem onClick={() => { const g = groupMenu.group; setGroupMenu(null); setCopyDialog({ group: g, targets: [] }); }}>
          <ContentCopy fontSize="small" sx={{ mr: 1.5 }} />{t('chores:board.copyTo')}
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { const g = groupMenu.group; setGroupMenu(null); setRemoveGroup(g); }} sx={{ color: 'error.main' }}>
          <Delete fontSize="small" sx={{ mr: 1.5 }} />{t('chores:board.removeGroup')}
        </MenuItem>
      </Menu>

      {/* Add chores */}
      <Dialog open={!!addDialog} onClose={() => setAddDialog(null)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          {addDialog?.step === 'chores'
            ? t('chores:board.addToTitle', { timing: timingLabel(addTiming), name: personName })
            : t('chores:board.addTitle', { name: personName })}
        </DialogTitle>
        <DialogContent dividers>
          {addDialog && (addDialog.step === 'timing' ? renderAddTimingStep() : renderAddChoresStep())}
        </DialogContent>
        <DialogActions>
          {addDialog?.step === 'chores' && (
            <Button onClick={() => setAddDialog((d) => ({ ...d, step: 'timing', picked: new Set() }))} sx={{ mr: 'auto' }}>
              {t('chores:board.back')}
            </Button>
          )}
          <Button onClick={() => setAddDialog(null)}>{t('common:actions.cancel')}</Button>
          {addDialog?.step === 'chores' && (
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
              {t('chores:board.removeGroupWarning', { count: removeGroup.schedules.length, name: personName })}
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
