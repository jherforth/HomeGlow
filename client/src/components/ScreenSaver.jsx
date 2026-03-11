import React, { useState, useEffect, useCallback } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { Close, ChevronLeft, ChevronRight } from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';

const ScreenSaver = ({ mode, slideshowInterval, tabs, onExit, onTabChange }) => {
  const [photos, setPhotos] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentTabIndex, setCurrentTabIndex] = useState(0);

  useEffect(() => {
    if (mode === 'photos') {
      fetchPhotos();
    } else {
      setLoading(false);
    }
  }, [mode]);

  const fetchPhotos = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/photo-items`);
      if (Array.isArray(response.data)) {
        setPhotos(response.data);
      }
    } catch (error) {
      console.error('Error fetching photos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loading) return;

    const interval = setInterval(() => {
      if (mode === 'photos' && photos.length > 0) {
        setCurrentIndex(prev => (prev + 1) % photos.length);
      } else if (mode === 'tabs' && tabs.length > 0) {
        setCurrentTabIndex(prev => {
          const nextIndex = (prev + 1) % tabs.length;
          if (onTabChange) {
            onTabChange(tabs[nextIndex].id);
          }
          return nextIndex;
        });
      }
    }, slideshowInterval * 1000);

    return () => clearInterval(interval);
  }, [mode, photos.length, tabs, slideshowInterval, loading, onTabChange]);

  useEffect(() => {
    if ('wakeLock' in navigator) {
      let wakeLock = null;

      const requestWakeLock = async () => {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
          console.log('Wake Lock error:', err);
        }
      };

      requestWakeLock();

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          requestWakeLock();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        if (wakeLock) {
          wakeLock.release();
        }
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, []);

  const handlePrev = useCallback(() => {
    if (mode === 'photos' && photos.length > 0) {
      setCurrentIndex(prev => (prev - 1 + photos.length) % photos.length);
    } else if (mode === 'tabs' && tabs.length > 0) {
      setCurrentTabIndex(prev => {
        const nextIndex = (prev - 1 + tabs.length) % tabs.length;
        if (onTabChange) {
          onTabChange(tabs[nextIndex].id);
        }
        return nextIndex;
      });
    }
  }, [mode, photos.length, tabs, onTabChange]);

  const handleNext = useCallback(() => {
    if (mode === 'photos' && photos.length > 0) {
      setCurrentIndex(prev => (prev + 1) % photos.length);
    } else if (mode === 'tabs' && tabs.length > 0) {
      setCurrentTabIndex(prev => {
        const nextIndex = (prev + 1) % tabs.length;
        if (onTabChange) {
          onTabChange(tabs[nextIndex].id);
        }
        return nextIndex;
      });
    }
  }, [mode, photos.length, tabs, onTabChange]);

  if (mode === 'tabs') {
    return null;
  }

  if (loading) {
    return (
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#000',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={onExit}
      >
        <Typography variant="h4" color="white">
          Loading...
        </Typography>
      </Box>
    );
  }

  if (mode === 'photos' && photos.length === 0) {
    return (
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#000',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={onExit}
      >
        <Typography variant="h4" color="white">
          No photos available
        </Typography>
      </Box>
    );
  }

  const currentPhoto = photos[currentIndex];

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'none',
        '&:hover .screensaver-controls': {
          opacity: 1,
        },
      }}
      onClick={onExit}
    >
      <Box
        component="img"
        src={`${API_BASE_URL}${currentPhoto?.url}`}
        alt="Slideshow"
        sx={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          animation: 'fadeIn 1s ease-in-out',
          '@keyframes fadeIn': {
            '0%': { opacity: 0 },
            '100%': { opacity: 1 },
          },
        }}
        key={currentIndex}
      />

      <Box
        className="screensaver-controls"
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0,
          transition: 'opacity 0.3s ease',
          pointerEvents: 'none',
        }}
      >
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            onExit();
          }}
          sx={{
            position: 'absolute',
            top: 20,
            right: 20,
            color: 'white',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            pointerEvents: 'auto',
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
            },
          }}
        >
          <Close />
        </IconButton>

        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            handlePrev();
          }}
          sx={{
            position: 'absolute',
            left: 20,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'white',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            pointerEvents: 'auto',
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
            },
          }}
        >
          <ChevronLeft sx={{ fontSize: 40 }} />
        </IconButton>

        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            handleNext();
          }}
          sx={{
            position: 'absolute',
            right: 20,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'white',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            pointerEvents: 'auto',
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
            },
          }}
        >
          <ChevronRight sx={{ fontSize: 40 }} />
        </IconButton>

        <Typography
          sx={{
            position: 'absolute',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'white',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            px: 2,
            py: 1,
            borderRadius: 1,
          }}
        >
          {currentIndex + 1} / {photos.length}
        </Typography>
      </Box>
    </Box>
  );
};

export default ScreenSaver;
