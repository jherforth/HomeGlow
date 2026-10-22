import React from 'react';
import { Alert, Button, Stack } from '@mui/material';
import { RestartAlt, Undo } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

// Where a restore stands, shared by Admin → System → Backup (a backup file)
// and the Google Drive backup panel: restarting to apply one, one staged
// and waiting for the restart, or the last one applied (with a rollback).
// `restore` is GET /api/backup/drive/status's `restore`.
const formatDate = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

export default function RestoreStatusAlerts({ restore, restarting, busy, onRestart, onCancel, onRollback }) {
  const { t } = useTranslation(['admin']);
  return (
    <>
      {restarting && (
        <Alert severity="info" sx={{ mb: 2 }}>{t('admin:backup.restarting')}</Alert>
      )}

      {restore?.staged && !restarting && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={(
            <Stack direction="row" spacing={1}>
              <Button color="inherit" size="small" startIcon={<RestartAlt />} onClick={onRestart} disabled={busy}>
                {t('admin:backup.restartNow')}
              </Button>
              <Button color="inherit" size="small" onClick={onCancel} disabled={busy}>
                {t('admin:backup.cancelStaged')}
              </Button>
            </Stack>
          )}
        >
          <strong>{t('admin:backup.stagedLabel')}</strong> {restore.staged.name}
          {restore.staged.legacy ? ` ${t('admin:backup.legacy')}` : ''}
          <br />
          {t('admin:backup.stagedHelp')}
        </Alert>
      )}

      {restore?.lastRestore && !restore.staged && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={restore.rollbackAvailable ? (
            <Button color="inherit" size="small" startIcon={<Undo />} onClick={onRollback} disabled={busy}>
              {t('admin:backup.rollBack')}
            </Button>
          ) : null}
        >
          {t('admin:backup.lastRestore', { name: restore.lastRestore.name, when: formatDate(restore.lastRestore.appliedAt) })}
          {restore.rollbackAvailable ? ` ${t('admin:backup.rollbackKept')}` : ''}
        </Alert>
      )}
    </>
  );
}
