import React from 'react';
import { Backdrop, Box, Typography, CircularProgress } from '@mui/material';

const LoadingBackdrop = ({ open, message = 'Processing...' }) => (
  <Backdrop
    sx={{
      color: '#fff',
      zIndex: (theme) => theme.zIndex.drawer + 1,
      backdropFilter: 'blur(10px)',
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
    }}
    open={open}
  >
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        p: 4,
        borderRadius: 3,
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
      }}
    >
      <Box
        sx={{
          position: 'relative',
          width: 80,
          height: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {[0, 1, 2].map((index) => (
          <Box
            key={index}
            sx={{
              position: 'absolute',
              fontSize: '2rem',
              animation: `clamBounce 1.5s ease-in-out ${index * 0.2}s infinite`,
              '@keyframes clamBounce': {
                '0%, 80%, 100%': {
                  transform: 'scale(0.8) translateY(0)',
                  opacity: 0.6,
                },
                '40%': {
                  transform: 'scale(1.2) translateY(-20px)',
                  opacity: 1,
                },
              },
            }}
          >
            🥟
          </Box>
        ))}
      </Box>

      <Typography
        variant="h6"
        sx={{
          color: 'white',
          fontWeight: 'bold',
          textAlign: 'center',
          textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
        }}
      >
        {message}
      </Typography>

      <CircularProgress
        size={40}
        thickness={2}
        sx={{
          color: 'rgba(255, 255, 255, 0.7)',
          '& .MuiCircularProgress-circle': {
            strokeLinecap: 'round',
          },
        }}
      />
    </Box>
  </Backdrop>
);

export default LoadingBackdrop;
