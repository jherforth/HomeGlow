import React from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { Close } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

// A chore (or routine) past its expiry was tapped (issue #279): the child is
// sent for a parent. No closes it and changes nothing; Yes goes on to the
// parent's PIN (when one is set), and the chore is done as approved late.
export default function LateApprovalDialog({ open, name, onNo, onYes }) {
  const { t } = useTranslation(['chores']);
  return (
    <Dialog open={open} onClose={onNo} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            component="span"
            aria-hidden="true"
            sx={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'var(--hg-error)', color: 'white' }}
          >
            <Close fontSize="small" />
          </Box>
          {t('chores:expiry.dialogTitle')}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 1.5 }}>{t('chores:expiry.dialogBody', { name })}</Typography>
        <Typography variant="body2" color="text.secondary">{t('chores:expiry.dialogQuestion')}</Typography>
      </DialogContent>
      {/* Big buttons: this is answered on a touch screen. */}
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onNo} variant="outlined" size="large" sx={{ flex: 1 }}>{t('chores:expiry.no')}</Button>
        <Button onClick={onYes} variant="contained" size="large" sx={{ flex: 1 }}>{t('chores:expiry.yes')}</Button>
      </DialogActions>
    </Dialog>
  );
}
