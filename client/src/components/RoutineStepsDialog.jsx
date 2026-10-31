import React, { useState } from 'react';
import axios from 'axios';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip } from '@mui/material';
import { Add, Delete, Edit } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { AdminNote, AdminRow } from './AdminRows.jsx';
import { API_BASE_URL } from '../utils/apiConfig.js';
import useIsMobile from '../hooks/useIsMobile.js';
import RoutineStepDialog from './RoutineStepDialog.jsx';
import { routineIconBox } from './RoutinesGroup.jsx';

// Admin → Family → Chores: the steps routines are built from, opened from the
// Routines heading. A step is a name and an icon; it has no clams or schedule
// of its own, which is what keeps it apart from a chore. Steps are mostly made
// from the routine editor, so this list is for the odd rename or tidy-up.
export default function RoutineStepsDialog({ open, onClose, steps, routines, onChanged }) {
  const { t } = useTranslation(['chores', 'common']);
  const isMobile = useIsMobile();
  const [stepDialog, setStepDialog] = useState({ open: false, step: null });
  // Said here, as the panel's message area sits behind this dialog.
  const [error, setError] = useState('');

  const usedBy = (stepId) => routines.filter((routine) => routine.steps.includes(stepId)).map((routine) => routine.name);
  const openStep = (step = null) => setStepDialog({ open: true, step });

  const removeStep = async (step) => {
    try {
      setError('');
      await axios.delete(`${API_BASE_URL}/api/routine-steps/${step.id}`);
      onChanged();
    } catch (error) {
      const names = error?.response?.data?.usedBy;
      setError(names ? t('chores:routines.stepInUse', { name: step.label, routines: names.join(', ') }) : t('chores:routines.deleteFailed'));
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>{`${t('chores:routines.stepsHeading')} (${steps.length})`}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="warning" onClose={() => setError('')} sx={{ mb: 1.5 }}>{error}</Alert>}
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, '& > * + *': { borderTop: 1, borderColor: 'divider' } }}>
        <AdminNote>{t('chores:routines.stepsIntro')}</AdminNote>
        {steps.length === 0 ? (
          <AdminNote>{t('chores:routines.noSteps')}</AdminNote>
        ) : steps.map((step) => {
          const names = usedBy(step.id);
          return (
            <AdminRow
              key={step.id}
              leading={routineIconBox(step.icon)}
              label={step.label}
              hint={names.length ? `${t('chores:routines.usedBy')}: ${names.join(', ')}` : null}
              control={(
                <>
                  <Tooltip title={t('common:actions.edit')}>
                    <IconButton size="small" onClick={() => openStep(step)} aria-label={`${t('common:actions.edit')} ${step.label}`}>
                      <Edit fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={names.length ? t('chores:routines.stepInUseShort') : t('common:actions.delete')}>
                    <span>
                      <IconButton size="small" color="error" disabled={names.length > 0} onClick={() => removeStep(step)} aria-label={`${t('common:actions.delete')} ${step.label}`}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </>
              )}
            />
          );
        })}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button startIcon={<Add />} onClick={() => openStep()}>{t('chores:routines.newStep')}</Button>
          <Button onClick={onClose}>{t('common:actions.close')}</Button>
        </DialogActions>
      </Dialog>

      <RoutineStepDialog
        open={stepDialog.open}
        step={stepDialog.step}
        onClose={() => setStepDialog({ open: false, step: null })}
        onSaved={() => { setStepDialog({ open: false, step: null }); onChanged(); }}
      />
    </>
  );
}
