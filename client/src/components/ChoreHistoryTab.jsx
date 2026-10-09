import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  IconButton,
  CircularProgress,
  Alert,
  Chip,
  TextField,
  MenuItem,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import { Delete, Refresh } from '@mui/icons-material';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { compactStackedTableSx } from '../utils/responsiveTable.js';
import { formatLoggedAt } from '../utils/choreHelpers.js';
import {
  HISTORY_CATEGORIES,
  categoryOf,
  filterOptions,
  filterRows,
  groupRows,
  rangeStart,
  sortRows,
} from '../utils/choreHistoryView.js';

// Rows a group shows before "Show all".
const GROUP_PREVIEW = 5;

const KIND_COLOR = { done: 'success', missed: 'warning', bonus: 'primary', adjustment: 'default' };

export default function ChoreHistoryTab() {
  const { t } = useTranslation(['admin', 'common']);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const [range, setRange] = useState('30');
  const [person, setPerson] = useState('');
  const [chore, setChore] = useState('');
  const [categories, setCategories] = useState(HISTORY_CATEGORIES);
  const [showMissed, setShowMissed] = useState(true);
  const [groupBy, setGroupBy] = useState('none');
  const [sort, setSort] = useState({ by: 'date', direction: 'desc' });
  const [expanded, setExpanded] = useState(() => new Set());

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const from = rangeStart(range);
      const response = await axios.get(`${API_BASE_URL}/api/chore-history`, {
        params: from ? { date_from: from } : {},
      });
      setHistory(Array.isArray(response.data) ? response.data : []);
    } catch {
      setError(t('admin:chores.historyView.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [range, t]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleDelete = async (id) => {
    setDeleteError('');
    try {
      await axios.delete(`${API_BASE_URL}/api/chore-history/${id}`);
      setHistory(prev => prev.filter(h => h.id !== id));
    } catch {
      setDeleteError(t('admin:chores.historyView.deleteFailed'));
    }
  };

  const options = useMemo(() => filterOptions(history), [history]);
  const rows = useMemo(
    () => sortRows(filterRows(history, { person, chore, categories, showMissed }), sort),
    [history, person, chore, categories, showMissed, sort],
  );
  const groups = useMemo(() => groupRows(rows, groupBy), [rows, groupBy]);
  // A grouped view names the person or chore once, in the group's heading.
  const showPerson = groupBy !== 'person' && groupBy !== 'personChore';
  const showChore = groupBy !== 'chore' && groupBy !== 'personChore';
  const columns = 5 + (showPerson ? 1 : 0) + (showChore ? 1 : 0);

  const toggleCategory = (category) => {
    setCategories(prev => (prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]));
  };

  const toggleExpanded = (key) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const sortBy = (by) => {
    setSort(prev => (prev.by === by
      ? { by, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      : { by, direction: by === 'date' || by === 'clams' ? 'desc' : 'asc' }));
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const unknown = (
    <span style={{ color: 'var(--hg-black-50)', fontStyle: 'italic' }}>{t('admin:chores.historyView.unknown')}</span>
  );

  const header = (by, label) => (
    <TableCell sx={{ fontWeight: 600 }} sortDirection={sort.by === by ? sort.direction : false}>
      <TableSortLabel
        active={sort.by === by}
        direction={sort.by === by ? sort.direction : 'asc'}
        onClick={() => sortBy(by)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );

  const renderRow = (entry) => {
    const category = categoryOf(entry);
    return (
      <TableRow key={entry.id} hover>
        {showPerson && (
          <TableCell data-label={t('admin:chores.historyView.person')}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>{entry.username || unknown}</Typography>
          </TableCell>
        )}
        {showChore && (
          <TableCell data-label={t('admin:chores.historyView.chore')}>
            <Typography variant="body2">{entry.title || unknown}</Typography>
          </TableCell>
        )}
        <TableCell data-label={t('admin:chores.historyView.kind')}>
          <Chip
            label={t(`admin:chores.historyView.kinds.${entry.kind}`, { defaultValue: entry.kind })}
            size="small"
            color={KIND_COLOR[category]}
            variant={category === 'missed' ? 'outlined' : 'filled'}
          />
        </TableCell>
        <TableCell data-label={t('admin:chores.historyView.date')}>
          <Typography variant="body2">{formatDate(entry.date)}</Typography>
        </TableCell>
        <TableCell data-label={t('admin:chores.historyView.logged')}>
          <Typography variant="body2" color="text.secondary">
            {formatLoggedAt(entry.created_at, entry.date) || '—'}
          </Typography>
        </TableCell>
        <TableCell data-label={t('admin:chores.clams')}>
          {entry.clam_value ? (
            <Chip label={`${entry.clam_value} 🥟`} size="small" color="primary" variant="filled" sx={{ fontWeight: 600 }} />
          ) : (
            <Typography variant="body2" color="text.secondary">0</Typography>
          )}
        </TableCell>
        <TableCell align="right">
          <IconButton
            size="small"
            color="error"
            onClick={() => handleDelete(entry.id)}
            aria-label={t('admin:chores.historyView.deleteEntry')}
          >
            <Delete fontSize="small" />
          </IconButton>
        </TableCell>
      </TableRow>
    );
  };

  const renderGroup = (group) => {
    const open = expanded.has(group.key);
    const shown = open ? group.rows : group.rows.slice(0, GROUP_PREVIEW);
    const title = [group.person, group.chore].filter(v => v !== null).map(v => v || t('admin:chores.historyView.unknown')).join(' · ');
    return (
      <React.Fragment key={group.key}>
        <TableRow sx={{ bgcolor: 'action.hover' }}>
          <TableCell colSpan={columns}>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mr: 1 }}>{title}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('admin:chores.historyView.groupSummary', {
                  done: group.done,
                  missed: group.missed,
                  clams: group.clams,
                  last: formatDate(group.lastDate),
                })}
              </Typography>
            </Box>
          </TableCell>
        </TableRow>
        {shown.map(renderRow)}
        {group.rows.length > GROUP_PREVIEW && (
          <TableRow>
            <TableCell colSpan={columns}>
              <Button size="small" onClick={() => toggleExpanded(group.key)}>
                {open
                  ? t('admin:chores.historyView.showFewer')
                  : t('admin:chores.historyView.showAll', { count: group.rows.length })}
              </Button>
            </TableCell>
          </TableRow>
        )}
      </React.Fragment>
    );
  };

  const filterSx = { minWidth: 150 };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">{t('admin:chores.historyView.title')}</Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Refresh />}
          onClick={fetchHistory}
          disabled={loading}
        >
          {t('admin:chores.historyView.refresh')}
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('admin:chores.historyView.help')}
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 1.5 }}>
        <TextField select size="small" sx={filterSx} label={t('admin:chores.historyView.range')} value={range} onChange={(e) => setRange(e.target.value)}>
          {['7', '30', '90', 'all'].map(value => (
            <MenuItem key={value} value={value}>{t(`admin:chores.historyView.ranges.${value}`)}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" sx={filterSx} label={t('admin:chores.historyView.person')} value={person} onChange={(e) => setPerson(e.target.value)}>
          <MenuItem value="">{t('admin:chores.historyView.everyone')}</MenuItem>
          {options.people.map(option => (
            <MenuItem key={option.key} value={option.key}>{option.label || t('admin:chores.historyView.unknown')}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" sx={filterSx} label={t('admin:chores.historyView.chore')} value={chore} onChange={(e) => setChore(e.target.value)}>
          <MenuItem value="">{t('admin:chores.historyView.allChores')}</MenuItem>
          {options.chores.map(option => (
            <MenuItem key={option.key} value={option.key}>{option.label || t('admin:chores.historyView.unknown')}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" sx={filterSx} label={t('admin:chores.historyView.groupBy')} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
          {['none', 'person', 'chore', 'personChore'].map(value => (
            <MenuItem key={value} value={value}>{t(`admin:chores.historyView.groupings.${value}`)}</MenuItem>
          ))}
        </TextField>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2 }}>
        {HISTORY_CATEGORIES.map(category => (
          <Chip
            key={category}
            label={t(`admin:chores.historyView.categories.${category}`)}
            color={categories.includes(category) ? KIND_COLOR[category] : 'default'}
            variant={categories.includes(category) ? 'filled' : 'outlined'}
            onClick={() => toggleCategory(category)}
            aria-pressed={categories.includes(category)}
          />
        ))}
        <FormControlLabel
          sx={{ ml: 0.5 }}
          control={<Checkbox size="small" checked={showMissed} onChange={(e) => setShowMissed(e.target.checked)} />}
          label={t('admin:chores.historyView.showMissed')}
        />
        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
          {t('admin:chores.historyView.entries', { count: rows.length })}
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {deleteError && <Alert severity="error" sx={{ mb: 2 }}>{deleteError}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={32} />
        </Box>
      ) : rows.length === 0 ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">{t('admin:chores.historyView.empty')}</Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" sx={compactStackedTableSx}>
            <TableHead>
              <TableRow>
                {showPerson && header('person', t('admin:chores.historyView.person'))}
                {showChore && header('chore', t('admin:chores.historyView.chore'))}
                <TableCell sx={{ fontWeight: 600 }}>{t('admin:chores.historyView.kind')}</TableCell>
                {header('date', t('admin:chores.historyView.date'))}
                <TableCell sx={{ fontWeight: 600 }}>{t('admin:chores.historyView.logged')}</TableCell>
                {header('clams', t('admin:chores.clams'))}
                <TableCell align="right" sx={{ fontWeight: 600 }}>{t('admin:chores.historyView.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {groupBy === 'none' ? rows.map(renderRow) : groups.map(renderGroup)}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
