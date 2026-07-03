import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  IconButton,
  Paper,
} from '@mui/material';
import { Backspace } from '@mui/icons-material';
import useIsMobile from '../hooks/useIsMobile.js';

const MAX_DIGITS = 6;

const ClamValueModal = ({ open, onClose, onSave, user, isSaving = false }) => {
  const isMobile = useIsMobile();
  const [value, setValue] = useState('');

  // Seed the input with the user's current balance whenever the modal opens.
  useEffect(() => {
    if (open) {
      setValue(String(user?.clam_total ?? 0));
    }
  }, [open, user]);

  const appendDigit = (digit) => {
    if (isSaving) return;
    setValue((prev) => {
      // Replace a lone leading zero so typing "5" gives "5", not "05".
      const base = prev === '0' ? '' : prev;
      if (base.length >= MAX_DIGITS) return prev;
      return base + digit;
    });
  };

  const handleBackspace = () => {
    if (isSaving) return;
    setValue((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (isSaving) return;
    setValue('');
  };

  const handleSubmit = () => {
    if (isSaving) return;
    onSave(parseInt(value, 10) || 0);
  };

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e) => {
      if (isSaving) return;
      if (e.key >= '0' && e.key <= '9') {
        appendDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Enter') {
        handleSubmit();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isSaving, value, onClose]);

  const digitButtonSx = {
    height: 60,
    fontSize: '1.5rem',
    fontWeight: 'bold',
    background: 'linear-gradient(135deg, var(--accent) 0%, var(--secondary) 100%)',
    '&:hover': {
      transform: 'scale(1.05)',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
    },
    transition: 'all 0.2s ease',
  };

  return (
    <Dialog
      open={open}
      onClose={isSaving ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      fullScreen={isMobile}
      slotProps={{
        paper: {
          sx: {
            background: 'var(--card-bg)',
            backdropFilter: 'var(--backdrop-blur)',
            border: isMobile ? 'none' : '2px solid var(--accent)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          },
        },
      }}
    >
      <DialogTitle>
        <Typography variant="h6" component="div" sx={{ fontWeight: 'bold', textAlign: 'center' }}>
          {user?.username ? `Set clams for ${user.username}` : 'Set clams'}
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ py: 1 }}>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              textAlign: 'center',
              color: 'var(--text-muted)',
              mb: 1,
              fontSize: '0.85rem',
            }}
          >
            Use keyboard or touch to enter a new clam total
          </Typography>

          <Typography
            sx={{
              textAlign: 'center',
              fontWeight: 'bold',
              fontSize: '2.5rem',
              lineHeight: 1.2,
              mb: 2,
              color: 'var(--text-color)',
            }}
          >
            {value === '' ? '0' : value} 🥟
          </Typography>

          <Paper
            elevation={0}
            sx={{
              p: 3,
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              borderRadius: 2,
            }}
          >
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <Button
                  key={num}
                  variant="contained"
                  onClick={() => appendDigit(num.toString())}
                  disabled={isSaving}
                  sx={digitButtonSx}
                >
                  {num}
                </Button>
              ))}

              <Button
                variant="outlined"
                onClick={handleClear}
                disabled={isSaving}
                sx={{
                  height: 60,
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  borderColor: 'var(--accent)',
                  color: 'var(--accent)',
                  '&:hover': {
                    borderColor: 'var(--accent)',
                    backgroundColor: 'rgba(158, 127, 255, 0.1)',
                  },
                }}
              >
                Clear
              </Button>

              <Button
                variant="contained"
                onClick={() => appendDigit('0')}
                disabled={isSaving}
                sx={digitButtonSx}
              >
                0
              </Button>

              <IconButton
                onClick={handleBackspace}
                disabled={isSaving}
                sx={{
                  height: 60,
                  borderRadius: 1,
                  border: '2px solid var(--accent)',
                  color: 'var(--accent)',
                  '&:hover': {
                    backgroundColor: 'rgba(158, 127, 255, 0.1)',
                  },
                }}
              >
                <Backspace fontSize="large" />
              </IconButton>
            </Box>
          </Paper>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          type="button"
          onClick={onClose}
          variant="outlined"
          disabled={isSaving}
          sx={{
            borderColor: 'var(--card-border)',
            color: 'var(--text-color)',
            '&:hover': {
              borderColor: 'var(--accent)',
              backgroundColor: 'rgba(158, 127, 255, 0.05)',
            },
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          variant="contained"
          disabled={isSaving}
          sx={{
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--secondary) 100%)',
          }}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ClamValueModal;
