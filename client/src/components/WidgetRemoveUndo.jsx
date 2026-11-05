import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  SnackbarContent,
  Typography,
} from '@mui/material';
import { RemoveCircleOutlined } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

// Removing a widget from a tab: asked first, then undoable for a few seconds.
// It only takes the widget off this tab; the widget (or plugin) stays
// installed and can be put back from Settings any time.

export const UNDO_MS = 8000;

const WidgetRemoveUndo = ({
  confirm,
  onConfirm,
  onCancel,
  undo,
  onUndo,
  onUndoClose,
}) => {
  const { t } = useTranslation('common');
  return (
    <>
      <Dialog open={Boolean(confirm)} onClose={onCancel} maxWidth="xs" fullWidth sx={{ zIndex: 10003 }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <RemoveCircleOutlined color="error" />
          {t('widgetMenu.removeTitle', { name: confirm?.title || '' })}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {t('widgetMenu.removeBody', { name: confirm?.title || '', tab: confirm?.tabLabel || '' })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel} variant="outlined">{t('widgetMenu.cancel')}</Button>
          <Button onClick={onConfirm} variant="contained" color="error" autoFocus>
            {t('widgetMenu.removeConfirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Keyed per notice: one that comes up (or back) gets its full time. */}
      <Snackbar
        key={undo?.key ?? 'none'}
        open={Boolean(undo)}
        autoHideDuration={UNDO_MS}
        onClose={(event, reason) => {
          // A tap elsewhere shouldn't take Undo away early.
          if (reason === 'clickaway') return;
          onUndoClose(undo?.key);
        }}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ zIndex: 10003 }}
      >
        <SnackbarContent
          message={undo?.message || ''}
          sx={{ backgroundColor: 'var(--card-bg)', color: 'var(--text)', border: '1px solid var(--card-border)', fontSize: '1rem' }}
          action={undo?.canUndo === false ? null : (
            <Button onClick={onUndo} sx={{ fontWeight: 700, color: 'var(--accent)' }}>
              {t('widgetMenu.undo')}
            </Button>
          )}
        />
      </Snackbar>
    </>
  );
};

export default WidgetRemoveUndo;
