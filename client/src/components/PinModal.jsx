import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  Button,
  IconButton,
  Paper,
  Alert
} from '@mui/material';
import { Lock, Backspace } from '@mui/icons-material';

const PinModal = ({ open, onClose, onVerify, mode = 'verify', title }) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState('enter');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setPin('');
      setConfirmPin('');
      setStep('enter');
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e) => {
      if (isLoading) return;
      if (e.key >= '0' && e.key <= '9') {
        const currentPin = step === 'confirm' ? confirmPin : pin;
        if (currentPin.length < 8) {
          if (step === 'confirm') {
            setConfirmPin(prev => prev + e.key);
          } else {
            setPin(prev => prev + e.key);
          }
          setError('');
        }
      } else if (e.key === 'Backspace') {
        if (step === 'confirm') {
          setConfirmPin(prev => prev.slice(0, -1));
        } else {
          setPin(prev => prev.slice(0, -1));
        }
        setError('');
      } else if (e.key === 'Enter') {
        const cur = step === 'confirm' ? confirmPin : pin;
        if (cur.length >= 4 && cur.length <= 8) {
          document.activeElement?.blur();
          const submitBtn = document.querySelector('[data-pin-submit]');
          if (submitBtn) submitBtn.click();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isLoading, step, pin, confirmPin, onClose]);

  const handleNumberClick = (num) => {
    if (isLoading) return;

    const currentPin = step === 'confirm' ? confirmPin : pin;

    if (currentPin.length < 8) {
      if (step === 'confirm') {
        setConfirmPin(currentPin + num);
      } else {
        setPin(currentPin + num);
      }
      setError('');
    }
  };

  const handleBackspace = () => {
    if (isLoading) return;

    if (step === 'confirm') {
      setConfirmPin(confirmPin.slice(0, -1));
    } else {
      setPin(pin.slice(0, -1));
    }
    setError('');
  };

  const handleClear = () => {
    if (isLoading) return;

    if (step === 'confirm') {
      setConfirmPin('');
    } else {
      setPin('');
    }
    setError('');
  };

  const handleSubmit = async () => {
    if (isLoading) return;

    if (mode === 'set' && step === 'enter') {
      if (pin.length < 4 || pin.length > 8) {
        setError('PIN must be between 4 and 8 digits');
        return;
      }
      setStep('confirm');
      return;
    }

    if (mode === 'set' && step === 'confirm') {
      if (pin !== confirmPin) {
        setError('PINs do not match. Please try again.');
        setConfirmPin('');
        setStep('enter');
        setPin('');
        return;
      }
    }

    const pinToVerify = mode === 'set' ? pin : pin;

    if (pinToVerify.length < 4 || pinToVerify.length > 8) {
      setError('PIN must be between 4 and 8 digits');
      return;
    }

    setIsLoading(true);
    try {
      await onVerify(pinToVerify);
    } catch (err) {
      setError(err.message || 'Invalid PIN. Please try again.');
      setPin('');
      setConfirmPin('');
      setStep('enter');
    } finally {
      setIsLoading(false);
    }
  };

  const renderPinDots = (pinValue) => {
    return (
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mb: 3 }}>
        {[...Array(8)].map((_, index) => (
          <Box
            key={index}
            sx={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              backgroundColor: index < pinValue.length ? 'var(--accent)' : 'transparent',
              border: '2px solid var(--accent)',
              transition: 'all 0.2s ease'
            }}
          />
        ))}
      </Box>
    );
  };

  const currentPin = step === 'confirm' ? confirmPin : pin;
  const canSubmit = currentPin.length >= 4 && currentPin.length <= 8;

  return (
    <Dialog
      open={open}
      onClose={isLoading ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          background: 'var(--card-bg)',
          backdropFilter: 'var(--backdrop-blur)',
          border: '2px solid var(--accent)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
        }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
          <Lock sx={{ color: 'var(--accent)', fontSize: 32 }} />
          <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
            {title || (mode === 'set'
              ? (step === 'enter' ? 'Set Admin PIN' : 'Confirm PIN')
              : 'Enter Admin PIN')}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ py: 2 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {mode === 'set' && step === 'enter' && (
            <Alert severity="info" sx={{ mb: 3 }}>
              Create a PIN between 4-8 digits (numbers only)
            </Alert>
          )}

          {mode === 'set' && step === 'confirm' && (
            <Alert severity="info" sx={{ mb: 3 }}>
              Re-enter your PIN to confirm
            </Alert>
          )}

          {renderPinDots(currentPin)}

          <Paper
            elevation={0}
            sx={{
              p: 3,
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              borderRadius: 2
            }}
          >
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <Button
                  key={num}
                  variant="contained"
                  onClick={() => handleNumberClick(num.toString())}
                  disabled={isLoading}
                  sx={{
                    height: 60,
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    background: 'linear-gradient(135deg, var(--accent) 0%, var(--secondary) 100%)',
                    '&:hover': {
                      transform: 'scale(1.05)',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
                    },
                    transition: 'all 0.2s ease'
                  }}
                >
                  {num}
                </Button>
              ))}

              <Button
                variant="outlined"
                onClick={handleClear}
                disabled={isLoading}
                sx={{
                  height: 60,
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  borderColor: 'var(--accent)',
                  color: 'var(--accent)',
                  '&:hover': {
                    borderColor: 'var(--accent)',
                    backgroundColor: 'rgba(158, 127, 255, 0.1)'
                  }
                }}
              >
                Clear
              </Button>

              <Button
                variant="contained"
                onClick={() => handleNumberClick('0')}
                disabled={isLoading}
                sx={{
                  height: 60,
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  background: 'linear-gradient(135deg, var(--accent) 0%, var(--secondary) 100%)',
                  '&:hover': {
                    transform: 'scale(1.05)',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
                  },
                  transition: 'all 0.2s ease'
                }}
              >
                0
              </Button>

              <IconButton
                onClick={handleBackspace}
                disabled={isLoading}
                sx={{
                  height: 60,
                  borderRadius: 1,
                  border: '2px solid var(--accent)',
                  color: 'var(--accent)',
                  '&:hover': {
                    backgroundColor: 'rgba(158, 127, 255, 0.1)'
                  }
                }}
              >
                <Backspace fontSize="large" />
              </IconButton>
            </Box>

            <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
              <Button
                fullWidth
                variant="outlined"
                onClick={onClose}
                disabled={isLoading}
                sx={{
                  py: 1.5,
                  borderColor: 'var(--card-border)',
                  color: 'var(--text-color)',
                  '&:hover': {
                    borderColor: 'var(--accent)',
                    backgroundColor: 'rgba(158, 127, 255, 0.05)'
                  }
                }}
              >
                Cancel
              </Button>

              <Button
                fullWidth
                variant="contained"
                onClick={handleSubmit}
                data-pin-submit
                disabled={!canSubmit || isLoading}
                sx={{
                  py: 1.5,
                  background: canSubmit
                    ? 'linear-gradient(135deg, var(--accent) 0%, var(--secondary) 100%)'
                    : 'var(--card-border)',
                  fontWeight: 'bold',
                  '&:hover': {
                    transform: canSubmit ? 'translateY(-2px)' : 'none',
                    boxShadow: canSubmit ? '0 4px 20px rgba(0, 0, 0, 0.3)' : 'none'
                  },
                  transition: 'all 0.2s ease'
                }}
              >
                {isLoading ? 'Verifying...' : (mode === 'set' && step === 'enter' ? 'Next' : 'Submit')}
              </Button>
            </Box>
          </Paper>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default PinModal;
