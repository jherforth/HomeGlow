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
  Checkbox,
  FormGroup,
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
  ToggleButtonGroup,
  ToggleButton,
  RadioGroup,
  Radio
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
  CheckCircle,
  VisibilityOff
} from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { parseExpression } from 'cron-parser';

const DAY_OPTIONS = [
  { label: 'Sun', value: 0, full: 'Sunday' },
  { label: 'Mon', value: 1, full: 'Monday' },
  { label: 'Tue', value: 2, full: 'Tuesday' },
  { label: 'Wed', value: 3, full: 'Wednesday' },
  { label: 'Thu', value: 4, full: 'Thursday' },
  { label: 'Fri', value: 5, full: 'Friday' },
  { label: 'Sat', value: 6, full: 'Saturday' }
];

const CRONTAB_PRESETS = [
  { label: 'Daily', value: '0 0 * * *' },
  { label: 'Every Other Day', value: '0 0 */2 * *' },
  { label: 'Weekdays (Mon-Fri)', value: '0 0 * * 1-5' },
  { label: 'Weekends (Sat-Sun)', value: '0 0 * * 0,6' },
  { label: 'One-time Task', value: '' }
];

const SCHEDULE_MODES = ['preset', 'days', 'custom'];

function getNextOccurrence(crontab) {
  if (!crontab) return 'One-time (runs once)';
  try {
    const interval = parseExpression(crontab, { utc: false });
    const next = interval.next().toDate();
    return next.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Invalid expression';
  }
}

function validateCrontab(crontab) {
  if (!crontab) return null;
  try {
    parseExpression(crontab);
    return null;
  } catch (e) {
    return e.message;
  }
}

function daysToСrontab(days) {
  if (!days || days.length === 0) return '0 0 * * *';
  const sorted = [...days].sort((a, b) => a - b);
  return `0 0 * * ${sorted.join(',')}`;
}

const defaultForm = {
  chore_id: '',
  user_id: '',
  crontab: '0 0 * * *',
  visible: true,
  scheduleMode: 'preset',
  selectedPreset: '0 0 * * *',
  selectedDays: [],
  customCrontab: ''
};

export default function ChoreSchedulesTab({ saveMessage, setSaveMessage }) {
  const [schedules, setSchedules] = useState([]);
  const [chores, setChores] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [crontabError, setCrontabError] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSchedule, setDeletingSchedule] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filterUser, setFilterUser] = useState('');
  const [filterChore, setFilterChore] = useState('');

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
      console.error('Error loading schedule data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const computeCrontabFromForm = (f) => {
    if (f.scheduleMode === 'preset') return f.selectedPreset;
    if (f.scheduleMode === 'days') return daysToСrontab(f.selectedDays);
    return f.customCrontab;
  };

  const updateForm = (updates) => {
    setForm(prev => {
      const next = { ...prev, ...updates };
      const cron = computeCrontabFromForm(next);
      setCrontabError(validateCrontab(cron));
      return { ...next, crontab: cron };
    });
  };

  const openCreate = () => {
    setEditingSchedule(null);
    setForm(defaultForm);
    setCrontabError(null);
    setDialogOpen(true);
  };

  const openEdit = (schedule) => {
    setEditingSchedule(schedule);
    let scheduleMode = 'custom';
    let selectedPreset = '';
    let selectedDays = [];
    let customCrontab = schedule.crontab || '';

    if (!schedule.crontab) {
      scheduleMode = 'preset';
      selectedPreset = '';
    } else {
      const preset = CRONTAB_PRESETS.find(p => p.value === schedule.crontab);
      if (preset) {
        scheduleMode = 'preset';
        selectedPreset = preset.value;
      } else {
        const daysMatch = schedule.crontab.match(/^0 0 \* \* ([\d,]+)$/);
        if (daysMatch) {
          scheduleMode = 'days';
          selectedDays = daysMatch[1].split(',').map(Number);
        }
      }
    }

    setForm({
      chore_id: schedule.chore_id,
      user_id: schedule.user_id ?? '',
      crontab: schedule.crontab || '',
      visible: !!schedule.visible,
      scheduleMode,
      selectedPreset,
      selectedDays,
      customCrontab
    });
    setCrontabError(null);
    setDialogOpen(true);
  };

  const openCopy = (schedule) => {
    openEdit({ ...schedule, id: null });
    setEditingSchedule(null);
  };

  const handleSave = async () => {
    const cron = form.crontab;
    const err = validateCrontab(cron);
    if (err) { setCrontabError(err); return; }

    setSaving(true);
    try {
      const payload = {
        chore_id: form.chore_id,
        user_id: form.user_id === '' ? null : form.user_id,
        crontab: cron || null,
        visible: form.visible ? 1 : 0
      };

      if (editingSchedule) {
        await axios.patch(`${API_BASE_URL}/api/chore-schedules/${editingSchedule.id}`, payload);
      } else {
        await axios.post(`${API_BASE_URL}/api/chore-schedules`, payload);
      }

      setDialogOpen(false);
      await fetchAll();
      setSaveMessage({ show: true, type: 'success', text: editingSchedule ? 'Schedule updated.' : 'Schedule created.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (err) {
      setSaveMessage({ show: true, type: 'error', text: err.response?.data?.error || 'Failed to save schedule.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 4000);
    } finally {
      setSaving(false);
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

  const handleDelete = async () => {
    try {
      await axios.delete(`${API_BASE_URL}/api/chore-schedules/${deletingSchedule.id}`);
      setDeleteDialogOpen(false);
      setDeletingSchedule(null);
      await fetchAll();
      setSaveMessage({ show: true, type: 'success', text: 'Schedule deleted.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    } catch (err) {
      setSaveMessage({ show: true, type: 'error', text: 'Failed to delete schedule.' });
      setTimeout(() => setSaveMessage({ show: false, type: '', text: '' }), 3000);
    }
  };

  const getUserName = (userId) => {
    if (userId === null || userId === undefined || userId === 0) return 'Unassigned (Bonus)';
    const user = users.find(u => u.id === userId);
    return user ? user.username : `User #${userId}`;
  };

  const filteredSchedules = schedules.filter(s => {
    if (filterUser && String(s.user_id) !== String(filterUser)) return false;
    if (filterChore && String(s.chore_id) !== String(filterChore)) return false;
    return true;
  });

  const currentCrontab = form.crontab;
  const nextOccurrence = getNextOccurrence(currentCrontab);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Chore Schedules</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<Refresh />} onClick={fetchAll} variant="outlined" size="small">
            Refresh
          </Button>
          <Button startIcon={<Add />} onClick={openCreate} variant="contained" size="small">
            New Schedule
          </Button>
        </Box>
      </Box>

      {saveMessage?.show && (
        <Alert severity={saveMessage.type} sx={{ mb: 2 }}>
          {saveMessage.text}
        </Alert>
      )}

      <Alert severity="info" sx={{ mb: 2 }}>
        Schedules link chore definitions to users and specify when they recur using cron expressions. A chore can have multiple schedules for different users or frequencies.
      </Alert>

      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Filter by User</InputLabel>
          <Select
            value={filterUser}
            label="Filter by User"
            onChange={(e) => setFilterUser(e.target.value)}
          >
            <MenuItem value="">All Users</MenuItem>
            <MenuItem value="0">Unassigned (Bonus)</MenuItem>
            {users.map(u => (
              <MenuItem key={u.id} value={u.id}>{u.username}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Filter by Chore</InputLabel>
          <Select
            value={filterChore}
            label="Filter by Chore"
            onChange={(e) => setFilterChore(e.target.value)}
          >
            <MenuItem value="">All Chores</MenuItem>
            {chores.map(c => (
              <MenuItem key={c.id} value={c.id}>{c.title}</MenuItem>
            ))}
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
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Chore</TableCell>
              <TableCell>Assigned To</TableCell>
              <TableCell>Crontab</TableCell>
              <TableCell>Next Occurrence</TableCell>
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
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">{s.title}</Typography>
                    {s.description && (
                      <Typography variant="caption" color="text.secondary">{s.description}</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={getUserName(s.user_id)}
                      size="small"
                      variant={s.user_id ? 'filled' : 'outlined'}
                      color={s.user_id ? 'primary' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {s.crontab || <em style={{ opacity: 0.6 }}>one-time</em>}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                      {getNextOccurrence(s.crontab)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {s.clam_value > 0 ? (
                      <Chip label={`${s.clam_value} 🥟`} size="small" color="primary" />
                    ) : (
                      <Typography variant="caption" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Tooltip title={s.visible ? 'Click to hide' : 'Click to show'}>
                      <Switch
                        size="small"
                        checked={!!s.visible}
                        onChange={() => handleToggleVisible(s)}
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(s)} color="primary">
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Duplicate">
                        <IconButton size="small" onClick={() => openCopy(s)}>
                          <ContentCopy fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => { setDeletingSchedule(s); setDeleteDialogOpen(true); }}>
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

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingSchedule ? 'Edit Schedule' : 'New Schedule'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <FormControl fullWidth size="small" required>
              <InputLabel>Chore</InputLabel>
              <Select
                value={form.chore_id}
                label="Chore"
                onChange={(e) => updateForm({ chore_id: e.target.value })}
              >
                {chores.map(c => (
                  <MenuItem key={c.id} value={c.id}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <span>{c.title}</span>
                      {c.clam_value > 0 && (
                        <Chip label={`${c.clam_value} 🥟`} size="small" sx={{ ml: 1 }} />
                      )}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel>Assigned To</InputLabel>
              <Select
                value={form.user_id}
                label="Assigned To"
                onChange={(e) => updateForm({ user_id: e.target.value })}
              >
                <MenuItem value="">Unassigned (Bonus chore)</MenuItem>
                {users.map(u => (
                  <MenuItem key={u.id} value={u.id}>{u.username}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Divider />

            <Typography variant="subtitle2" fontWeight="bold">
              Schedule
            </Typography>

            <RadioGroup
              row
              value={form.scheduleMode}
              onChange={(e) => updateForm({ scheduleMode: e.target.value })}
            >
              <FormControlLabel value="preset" control={<Radio size="small" />} label="Preset" />
              <FormControlLabel value="days" control={<Radio size="small" />} label="Days of Week" />
              <FormControlLabel value="custom" control={<Radio size="small" />} label="Custom Crontab" />
            </RadioGroup>

            {form.scheduleMode === 'preset' && (
              <FormControl fullWidth size="small">
                <InputLabel>Schedule Preset</InputLabel>
                <Select
                  value={form.selectedPreset}
                  label="Schedule Preset"
                  onChange={(e) => updateForm({ selectedPreset: e.target.value })}
                >
                  {CRONTAB_PRESETS.map(p => (
                    <MenuItem key={p.label} value={p.value}>
                      <Box>
                        <Typography variant="body2">{p.label}</Typography>
                        {p.value && (
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                            {p.value}
                          </Typography>
                        )}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {form.scheduleMode === 'days' && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Select which days of the week this chore should appear:
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {DAY_OPTIONS.map(day => (
                    <Chip
                      key={day.value}
                      label={day.label}
                      clickable
                      color={form.selectedDays.includes(day.value) ? 'primary' : 'default'}
                      variant={form.selectedDays.includes(day.value) ? 'filled' : 'outlined'}
                      onClick={() => {
                        const next = form.selectedDays.includes(day.value)
                          ? form.selectedDays.filter(d => d !== day.value)
                          : [...form.selectedDays, day.value];
                        updateForm({ selectedDays: next });
                      }}
                      size="small"
                    />
                  ))}
                </Box>
                {form.selectedDays.length > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontFamily: 'monospace' }}>
                    Generated: {daysToСrontab(form.selectedDays)}
                  </Typography>
                )}
              </Box>
            )}

            {form.scheduleMode === 'custom' && (
              <TextField
                fullWidth
                size="small"
                label="Crontab Expression"
                value={form.customCrontab}
                onChange={(e) => updateForm({ customCrontab: e.target.value })}
                placeholder="0 0 * * 1"
                error={!!crontabError}
                helperText={crontabError || 'Format: minute hour day-of-month month day-of-week'}
                InputProps={{ sx: { fontFamily: 'monospace' } }}
              />
            )}

            {currentCrontab !== undefined && !crontabError && (
              <Alert severity="info" icon={<Schedule />} sx={{ py: 0.5 }}>
                <Typography variant="body2">
                  <strong>Next occurrence:</strong> {nextOccurrence}
                </Typography>
                {currentCrontab && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    {currentCrontab}
                  </Typography>
                )}
              </Alert>
            )}

            <FormControlLabel
              control={
                <Switch
                  checked={form.visible}
                  onChange={(e) => updateForm({ visible: e.target.checked })}
                />
              }
              label="Visible (active)"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} startIcon={<Cancel />}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} /> : <Save />}
            disabled={saving || !form.chore_id || !!crontabError || (form.scheduleMode === 'days' && form.selectedDays.length === 0)}
          >
            {saving ? 'Saving...' : editingSchedule ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Schedule</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This will permanently delete this schedule. Completion history is preserved.
          </Alert>
          <Typography variant="body2">
            Delete schedule for <strong>{deletingSchedule?.title}</strong> assigned to{' '}
            <strong>{getUserName(deletingSchedule?.user_id)}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} variant="contained" color="error" startIcon={<Delete />}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
