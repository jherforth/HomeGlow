import React, { useState } from 'react';
import axios from 'axios';
import { Button, IconButton, Tooltip } from '@mui/material';
import { Add, Delete, Edit } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { AdminGroup, AdminNote, AdminRow } from './AdminRows.jsx';
import { API_BASE_URL } from '../utils/apiConfig.js';
import RoutineStepDialog from './RoutineStepDialog.jsx';
import { routineIconBox } from './RoutinesGroup.jsx';

// Admin → Family → Chores: the steps routines are built from, under the
// routines, closed until opened. A step is a name and an icon; it has no
// clams or schedule of its own, which is what keeps it apart from a chore.
export default function RoutineStepsGroup({ steps, routines, onChanged, flash }) {
  const { t } = useTranslation(['chores', 'common']);
  const [stepDialog, setStepDialog] = useState({ open: false, step: null });

  const usedBy = (stepId) => routines.filter((routine) => routine.steps.includes(stepId)).map((routine) => routine.name);
  const openStep = (step = null) => setStepDialog({ open: true, step });

  const removeStep = async (step) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/routine-steps/${step.id}`);
      onChanged();
    } catch (error) {
      const names = error?.response?.data?.usedBy;
      flash('warning', names ? t('chores:routines.stepInUse', { name: step.label, routines: names.join(', ') }) : t('chores:routines.deleteFailed'));
    }
  };

  return (
    <>
      <AdminGroup
        id="admin-routine-steps"
        title={t('chores:routines.stepsHeading')}
        collapseKey="routineSteps"
        defaultCollapsed
        count={steps.length}
        action={(
          <Button startIcon={<Add />} onClick={() => openStep()} variant="outlined" size="small">
            {t('chores:routines.newStep')}
          </Button>
        )}
      >
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
      </AdminGroup>

      <RoutineStepDialog
        open={stepDialog.open}
        step={stepDialog.step}
        onClose={() => setStepDialog({ open: false, step: null })}
        onSaved={() => { setStepDialog({ open: false, step: null }); onChanged(); }}
      />
    </>
  );
}
