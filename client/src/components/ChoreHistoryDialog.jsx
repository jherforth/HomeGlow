import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getServerTimezoneSync } from '../utils/timezone.js';
import { formatLoggedAt, getTodayDateString } from '../utils/choreHelpers.js';
import { addDays, choreDays, missesTracked, rowsFor, streakOf, summarize } from '../utils/choreDays.js';
import ChoreDayMark from './ChoreDayMark.jsx';

// Days the grid and the summary cover, and how far back the streak looks.
const GRID_DAYS = 30;
const STREAK_DAYS = 90;
const RECENT_ROWS = 10;

// 'YYYY-MM-DD' as a Date at UTC midnight, for locale labels with timeZone UTC.
const utcDate = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/**
 * One person's record for one chore (long-press a chore → History): a 30-day
 * grid, the streak, and the latest entries. Read-only.
 */
export default function ChoreHistoryDialog({ open, onClose, schedule, user, vacation }) {
  const { t, i18n } = useTranslation(['chores', 'common']);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);
  const today = getTodayDateString();
  const userId = schedule?.user_id;

  useEffect(() => {
    if (!open || !schedule) return undefined;
    let cancelled = false;
    setRows(null);
    setError(false);
    axios.get(`${API_BASE_URL}/api/chore-history`, {
      params: { user_id: userId, date_from: addDays(today, -(STREAK_DAYS - 1)) },
    })
      .then((response) => { if (!cancelled) setRows(response.data || []); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, schedule?.id, userId]);

  const view = useMemo(() => {
    if (!rows || !schedule) return null;
    const timeZone = getServerTimezoneSync();
    const long = choreDays({ rows, schedule, userId, today, count: STREAK_DAYS, vacation, timeZone });
    const days = long.slice(-GRID_DAYS);
    const recent = rowsFor(rows, schedule, userId)
      .filter((r) => r.kind === 'completion' || r.kind === 'missed' || r.kind == null)
      .slice(0, RECENT_ROWS);
    return {
      days,
      streak: streakOf(long),
      summary: summarize(days, rows, schedule, userId),
      recent,
    };
  }, [rows, schedule, userId, today, vacation]);

  const locale = i18n.language;
  const dayLabel = (dateStr) => utcDate(dateStr).toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
  const stateLabel = (state) => t(`chores:history.state.${state}`);

  // The grid runs Sunday to Saturday, so a weekday chore reads as columns.
  const cells = useMemo(() => {
    if (!view) return [];
    const lead = utcDate(view.days[0].date).getUTCDay();
    return [...Array(lead).fill(null), ...view.days];
  }, [view]);
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => (
    // 2026-10-18 is a Sunday.
    utcDate(addDays('2026-10-18', i)).toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'narrow' })
  )), [locale]);

  const tracked = schedule ? missesTracked(schedule) : false;
  const untrackedReason = schedule && (schedule.clam_value || 0) > 0
    ? t('chores:history.untrackedClams')
    : t('chores:history.untrackedOther');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        {schedule?.title}
        <Typography variant="body2" color="text.secondary">{user?.username}</Typography>
      </DialogTitle>
      <DialogContent>
        {error && <Typography color="error">{t('chores:history.loadError')}</Typography>}
        {!error && !view && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
        )}
        {view && (
          <>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              {view.streak.run > 0
                ? t(view.streak.capped ? 'chores:history.streakCapped' : 'chores:history.streak', { count: view.streak.run })
                : t('chores:history.noStreak')}
              {' · '}
              {tracked && view.summary.rate !== null
                ? t('chores:history.doneOfDue', { done: view.summary.doneCount, due: view.summary.doneCount + view.summary.missedCount, rate: view.summary.rate })
                : t('chores:history.doneTimes', { count: view.summary.doneCount })}
              {view.summary.clams > 0 && <>{' · '}{view.summary.clams} 🥟</>}
            </Typography>

            <Typography variant="caption" color="text.secondary">{t('chores:history.lastDays', { count: GRID_DAYS })}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5, mt: 0.5, mb: 1 }}>
              {weekdays.map((w, i) => (
                <Typography key={`w${i}`} variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>{w}</Typography>
              ))}
              {cells.map((cell, i) => (
                <Box
                  key={cell ? cell.date : `pad${i}`}
                  sx={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', py: 0.25,
                    borderRadius: 'var(--hg-radius-sm)',
                    outline: cell?.date === today ? '1px solid var(--accent)' : 'none',
                  }}
                >
                  {cell && (
                    <>
                      <ChoreDayMark state={cell.state} size={20} label={`${dayLabel(cell.date)}: ${stateLabel(cell.state)}`} />
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', lineHeight: 1.2 }}>
                        {Number(cell.date.slice(8))}
                      </Typography>
                    </>
                  )}
                </Box>
              ))}
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 1.5 }}>
              {['done', 'missed', 'open', 'off'].filter((s) => tracked || s !== 'missed').map((s) => (
                <Box key={s} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ChoreDayMark state={s} size={14} label={stateLabel(s)} />
                  <Typography variant="caption" color="text.secondary">{stateLabel(s)}</Typography>
                </Box>
              ))}
            </Box>

            {!tracked && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                {untrackedReason}
              </Typography>
            )}

            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{t('chores:history.recent')}</Typography>
            {view.recent.length === 0 ? (
              <Typography variant="body2" color="text.secondary">{t('chores:history.none')}</Typography>
            ) : (
              <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                {view.recent.map((r) => (
                  <Box component="li" key={r.id ?? `${r.date}-${r.kind}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
                    <ChoreDayMark state={r.kind === 'missed' ? 'missed' : 'done'} size={14} />
                    <Typography variant="body2" sx={{ flex: 1 }}>{dayLabel(r.date)}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {r.kind === 'missed' ? stateLabel('missed') : formatLoggedAt(r.created_at, r.date, locale)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common:actions.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
