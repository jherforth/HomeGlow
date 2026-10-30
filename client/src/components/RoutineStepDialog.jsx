import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { Save } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import useIsMobile from '../hooks/useIsMobile.js';
import ChoreIconPicker from './ChoreIconPicker.jsx';

// Making or changing one library step: on the Steps tab, and from "Add a
// step" in the routine editor. `step` is { id, label, icon }; no id makes a
// new one. onSaved gets the stored step.
export default function RoutineStepDialog({ open, step, onClose, onSaved }) {
  const { t } = useTranslation(['chores', 'common']);
  const isMobile = useIsMobile();
  const [form, setForm] = useState({ id: null, label: '', icon: '' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ id: step?.id ?? null, label: step?.label || '', icon: step?.icon || '' });
    setError(null);
  }, [open, step]);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const body = { label: form.label, icon: form.icon || null };
      const res = form.id
        ? await axios.patch(`${API_BASE_URL}/api/routine-steps/${form.id}`, body)
        : await axios.post(`${API_BASE_URL}/api/routine-steps`, body);
      onSaved(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || t('chores:routines.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      fullScreen={isMobile}
      // React events cross portals: opened from the routine editor, this
      // form's submit would otherwise reach the editor's form and save it.
      slotProps={{ paper: { component: 'form', onSubmit: (event) => { event.preventDefault(); event.stopPropagation(); save(); } } }}
    >
      <DialogTitle>{form.id ? t('chores:routines.editStep') : t('chores:routines.newStep')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            fullWidth
            size="small"
            required
            autoFocus
            label={t('chores:routines.stepName')}
            placeholder={t('chores:routines.stepPlaceholder')}
            value={form.label}
            onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
          <ChoreIconPicker value={form.icon} onChange={(icon) => setForm((current) => ({ ...current, icon }))} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button type="button" onClick={onClose}>{t('common:actions.cancel')}</Button>
        <Button type="submit" variant="contained" startIcon={<Save />} disabled={saving || !form.label.trim()}>{t('common:actions.save')}</Button>
      </DialogActions>
    </Dialog>
  );
}
