import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { Close, ChevronLeft, ChevronRight } from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { usePageVisibility } from '../hooks/useScreenActivity.js';
import ScreensaverOverlay from './ScreensaverOverlay.jsx';
import PhotoCollage from './PhotoCollage.jsx';
import { MIN_COLLAGE_PHOTOS } from '../utils/photoCollage.js';

const ScreenSaver = ({ mode, slideshowInterval, tabs, onExit, onTabChange, keepScreenAwake, overlay, photoLayout = 'fit' }) => {
  const pageVisible = usePageVisibility();
  const [photos, setPhotos] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Counts slideshow ticks without wrapping; the collage swaps a tile on each.
  const [step, setStep] = useState(0);
  const [collageUnavailable, setCollageUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentTabIndex, setCurrentTabIndex] = useState(0);
  const exitTimeoutRef = useRef(null);

  useEffect(() => {
    if (mode === 'photos') {
      fetchPhotos();
    } else {
      setLoading(false);
      if (mode === 'tabs' && tabs.length > 0 && onTabChange) {
        onTabChange(tabs[0].number);
      }
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

  // Advance timer — frozen while the page is hidden so a backgrounded kiosk
  // doesn't keep cycling photos, or worse, cycling tabs (each tab switch
  // mounts that tab's widgets and triggers their fetches).
  useEffect(() => {
    if (loading || !pageVisible) return;

    const interval = setInterval(() => {
      if (mode === 'photos' && photos.length > 0) {
        setCurrentIndex(prev => (prev + 1) % photos.length);
        setStep(prev => prev + 1);
      } else if (mode === 'tabs' && tabs.length > 0) {
        setCurrentTabIndex(prev => {
          const nextIndex = (prev + 1) % tabs.length;
          if (onTabChange) {
            onTabChange(tabs[nextIndex].number);
          }
          return nextIndex;
        });
      }
    }, slideshowInterval * 1000);

    return () => clearInterval(interval);
  }, [mode, photos.length, tabs, slideshowInterval, loading, onTabChange, pageVisible]);

  useEffect(() => {
    if (!('wakeLock' in navigator)) return undefined;

    let wakeLock = null;

    const requestWakeLock = async () => {
      if (!keepScreenAwake) return;
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
  }, [keepScreenAwake]);

  const handleExit = useCallback(() => {
    if (exitTimeoutRef.current) return;
    exitTimeoutRef.current = true;
    onExit();
  }, [onExit]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleExit]);

  if (mode === 'tabs') {
    return (
      <Box
        onClick={handleExit}
        onTouchStart={handleExit}
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          cursor: 'none',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'var(--hg-black-70)',
            color: 'white',
            px: 2,
            py: 0.5,
            borderRadius: 'var(--hg-radius-md)',
            fontSize: '0.75rem',
            opacity: 0,
            animation: 'fadeInOut 4s ease-in-out',
            '@keyframes fadeInOut': {
              '0%': { opacity: 0 },
              '10%': { opacity: 0.8 },
              '80%': { opacity: 0.8 },
              '100%': { opacity: 0 },
            },
            pointerEvents: 'none',
          }}
        >
          Tap or click anywhere to exit screensaver
        </Box>
      </Box>
    );
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
        onClick={handleExit}
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
        onClick={handleExit}
      >
        <Typography variant="h4" color="white">
          No photos available
        </Typography>
      </Box>
    );
  }

  const currentPhoto = photos[currentIndex];

  // Too few photos for a collage falls back to the ambient single photo, which
  // still fills the bars.
  const collage = photoLayout === 'collage' && !collageUnavailable && photos.length >= MIN_COLLAGE_PHOTOS;
  const ambient = photoLayout === 'ambient' || (photoLayout === 'collage' && !collage);

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
        overflow: 'hidden',
        cursor: 'none',
        '&:hover .screensaver-controls': {
          opacity: 1,
        },
      }}
      onClick={handleExit}
    >
      {collage ? (
        <PhotoCollage
          photos={photos}
          step={step}
          onUnavailable={() => setCollageUnavailable(true)}
        />
      ) : (
        <>
          {/* Ambient: the same photo, blurred and dimmed, fills the bars the
              contained photo leaves. The thumbnail is plenty for something
              this blurred, and saves a second full download. */}
          {ambient && (
            <Box
              component="img"
              key={`ambient-${currentIndex}`}
              src={`${API_BASE_URL}${currentPhoto?.thumbnail || currentPhoto?.url}`}
              alt=""
              aria-hidden
              sx={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'blur(40px) brightness(0.5) saturate(1.15)',
                // Blur fades toward transparent at the edges; overscan hides it.
                transform: 'scale(1.2)',
                animation: 'sssFadeIn 1s ease-in-out',
              }}
            />
          )}
          <Box
            component="img"
            src={`${API_BASE_URL}${currentPhoto?.url}`}
            alt="Slideshow"
            sx={{
              position: 'relative',
              zIndex: 1,
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              ...(ambient ? { boxShadow: '0 0 60px 10px var(--hg-black-50)' } : {}),
              animation: 'sssFadeIn 1s ease-in-out',
              '@keyframes sssFadeIn': {
                '0%': { opacity: 0 },
                '100%': { opacity: 1 },
              },
            }}
            key={currentIndex}
          />
        </>
      )}

      {/* Calendar and weather in the corner (issue #190). Pointer events pass
          straight through, so a tap anywhere still exits. */}
      {(overlay?.calendar || overlay?.weather) && (
        <ScreensaverOverlay
          showCalendar={!!overlay.calendar}
          calendarDays={overlay.calendarDays}
          showWeather={!!overlay.weather}
          tabs={tabs}
          driftStep={collage ? step : currentIndex}
        />
      )}

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
          // Above the overlay, so the hover controls are never drawn under it.
          zIndex: 3,
        }}
      >
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            handleExit();
          }}
          sx={{
            position: 'absolute',
            top: 20,
            right: 20,
            color: 'white',
            backgroundColor: 'var(--hg-black-50)',
            pointerEvents: 'auto',
            '&:hover': {
              backgroundColor: 'var(--hg-black-70)',
            },
          }}
        >
          <Close />
        </IconButton>

        {/* Stepping one photo back or forward means nothing on a wall of them. */}
        {!collage && (
          <>
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(prev => (prev - 1 + photos.length) % photos.length);
              }}
              sx={{
                position: 'absolute',
                left: 20,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'white',
                backgroundColor: 'var(--hg-black-50)',
                pointerEvents: 'auto',
                '&:hover': {
                  backgroundColor: 'var(--hg-black-70)',
                },
              }}
            >
              <ChevronLeft sx={{ fontSize: 40 }} />
            </IconButton>

            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(prev => (prev + 1) % photos.length);
              }}
              sx={{
                position: 'absolute',
                right: 20,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'white',
                backgroundColor: 'var(--hg-black-50)',
                pointerEvents: 'auto',
                '&:hover': {
                  backgroundColor: 'var(--hg-black-70)',
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
                backgroundColor: 'var(--hg-black-50)',
                px: 2,
                py: 1,
                borderRadius: 'var(--hg-radius-sm)',
              }}
            >
              {currentIndex + 1} / {photos.length}
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
};

export default ScreenSaver;
