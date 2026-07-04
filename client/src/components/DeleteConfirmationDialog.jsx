import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  Alert,
} from '@mui/material';
import { Warning, Delete } from '@mui/icons-material';
import useIsMobile from '../hooks/useIsMobile.js';

const DeleteConfirmationDialog = ({
  open,
  onClose,
  onConfirm,
  title = 'Delete',
  itemName,
  itemLabel = 'item',
  warningMessage,
  confirmLabel,
  confirmColor = 'error',
  confirmIcon: ConfirmIcon = Delete,
  children,
  isLoading = false,
}) => {
  const isMobile = useIsMobile();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Warning color="error" />
          <Typography variant="h6">{title}</Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          {warningMessage}
        </Alert>
        <Typography>
          Are you sure you want to delete{' '}
          <strong>{itemName}</strong>?
        </Typography>
        {children}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color={confirmColor}
          startIcon={<ConfirmIcon />}
          disabled={isLoading}
        >
          {confirmLabel || `Delete ${itemLabel}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteConfirmationDialog;
