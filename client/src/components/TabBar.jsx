import React, { useState, useRef, useEffect } from 'react';
import { Box, IconButton, Tooltip, Typography, ClickAwayListener } from '@mui/material';
import { Close, Add } from '@mui/icons-material';

const TabIcon = ({ name, size = 24, color = 'currentColor' }) => {
  const icons = {
    home: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
      </svg>
    ),
    bell: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 01-3.46 0"/>
      </svg>
    ),
    bookmark: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
      </svg>
    ),
    building: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2"/>
        <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/>
      </svg>
    ),
    calendar: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <path d="M16 2v4M8 2v4M3 10h18"/>
        <circle cx="8" cy="15" r="1" fill={color}/>
        <circle cx="12" cy="15" r="1" fill={color}/>
        <circle cx="16" cy="15" r="1" fill={color}/>
      </svg>
    ),
    camera: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
    ),
    chart: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 20V10M12 20V4M6 20v-6"/>
      </svg>
    ),
    clock: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 6v6l4 2"/>
      </svg>
    ),
    chat: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
    clipboard: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>
        <rect x="8" y="2" width="8" height="4" rx="1"/>
      </svg>
    ),
    compass: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill={color} opacity="0.3"/>
      </svg>
    ),
    envelope: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <path d="M22 6l-10 7L2 6"/>
      </svg>
    ),
    file: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <path d="M14 2v6h6"/>
      </svg>
    ),
    folder: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
      </svg>
    ),
    flag: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
        <line x1="4" y1="22" x2="4" y2="15"/>
      </svg>
    ),
    gem: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 9 12 22 22 9"/>
        <path d="M2 9h20M12 2l4 7M12 2l-4 7M12 22l4-13M12 22l-4-13"/>
      </svg>
    ),
    hand: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 11V6a2 2 0 00-4 0M14 10V4a2 2 0 00-4 0v6M10 10V5a2 2 0 00-4 0v9"/>
        <path d="M18 11a2 2 0 014 0v3a8 8 0 01-8 8h-2c-2.5 0-4-1.5-5.5-3L4 15"/>
      </svg>
    ),
    heart: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
      </svg>
    ),
    money: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
      </svg>
    ),
    map: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
        <line x1="8" y1="2" x2="8" y2="18"/>
        <line x1="16" y1="6" x2="16" y2="22"/>
      </svg>
    ),
    lightbulb: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18h6M10 22h4"/>
        <path d="M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z"/>
      </svg>
    ),
    image: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="M21 15l-5-5L5 21"/>
      </svg>
    ),
    star: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
    shovel: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 00-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 007.94-7.94l-3.76 3.76z"/>
      </svg>
    ),
    trashcan: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
      </svg>
    ),
    bucket: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 6l2 14h8l2-14"/>
        <path d="M4 6h16"/>
        <path d="M8 6V4a4 4 0 018 0v2"/>
      </svg>
    ),
    clouds: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>
      </svg>
    ),
  };

  return icons[name] || icons.home;
};

const MenuIcon = ({ name, size = 20, color = 'currentColor' }) => {
  const icons = {
    refresh: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 4v6h-6"/>
        <path d="M1 20v-6h6"/>
        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
      </svg>
    ),
    settings: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
    ),
    move: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <line x1="12" y1="2" x2="12" y2="22"/>
      </svg>
    ),
    darkmode: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
      </svg>
    ),
    lightmode: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    ),
    automode: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <path d="M12 3v18" />
        <path d="M12 3a9 9 0 010 18" fill={color} opacity="0.3"/>
      </svg>
    ),
  };

  return icons[name] || null;
};

const TabBar = ({
  tabs,
  activeTab,
  onTabChange,
  widgetsLocked,
  onAddTab,
  onDeleteTab,
  onToggleTheme,
  onToggleLock,
  onOpenSettings,
  onRefresh,
  theme,
  themeMode,
  screensaverCountdown,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnchorRef = useRef(null);

  const defaultHomeTab = {
    id: 1,
    number: 1,
    label: 'Home',
    icon: 'home',
    show_label: 0,
    index: 0,
  };

  const displayTabs = tabs && tabs.length > 0 ? tabs : [defaultHomeTab];

  const getThemeIconName = () => {
    if (themeMode === 'auto') return 'automode';
    return theme === 'dark' ? 'darkmode' : 'lightmode';
  };

  const getThemeLabel = () => {
    if (themeMode === 'auto') return 'Auto Mode';
    return theme === 'dark' ? 'Dark Mode' : 'Light Mode';
  };

  const menuItems = [
    { id: 'refresh', icon: 'refresh', label: 'Refresh', action: onRefresh },
    { id: 'settings', icon: 'settings', label: 'Settings', action: onOpenSettings },
    { id: 'lock', icon: 'move', label: widgetsLocked ? 'Move/Resize' : 'Lock Layout', action: onToggleLock },
    { id: 'theme', icon: getThemeIconName(), label: getThemeLabel(), action: onToggleTheme },
  ];

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        pointerEvents: 'none',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 2,
          py: 1,
          borderRadius: '24px',
          backgroundColor: 'var(--dock-bg)',
          border: '1px solid var(--dock-border)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2)',
          pointerEvents: 'auto',
        }}
      >
        {/* HomeGlow Logo with Menu */}
        <Box sx={{ position: 'relative' }} ref={menuAnchorRef}>
          <ClickAwayListener onClickAway={() => setMenuOpen(false)}>
            <Box>
              <Tooltip title="Menu" placement="top">
                <Box
                  onClick={() => setMenuOpen(!menuOpen)}
                  sx={{
                    width: 44,
                    height: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    borderRadius: '12px',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      transform: 'scale(1.05)',
                    },
                    '&:active': {
                      transform: 'scale(0.95)',
                    },
                  }}
                >
                  <img
                    src="/HomeGlowLogo.svg"
                    alt="HomeGlow"
                    style={{
                      height: '32px',
                      width: 'auto',
                      objectFit: 'contain',
                    }}
                  />
                </Box>
              </Tooltip>

              {/* Popup Menu */}
              {menuOpen && (
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    mb: 1.5,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5,
                    p: 1,
                    borderRadius: '16px',
                    backgroundColor: 'var(--dock-bg)',
                    border: '1px solid var(--dock-border)',
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2)',
                    minWidth: 180,
                    animation: 'menuSlideUp 0.2s ease-out',
                  }}
                >
                  {menuItems.map((item) => (
                    <Box
                      key={item.id}
                      onClick={() => {
                        item.action();
                        setMenuOpen(false);
                      }}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        px: 2,
                        py: 1.25,
                        borderRadius: '10px',
                        cursor: 'pointer',
                        color: 'var(--text)',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        },
                      }}
                    >
                      <MenuIcon name={item.icon} size={18} color="var(--text)" />
                      <Typography
                        sx={{
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          color: 'var(--text)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.label}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </ClickAwayListener>
        </Box>

        {/* Separator */}
        <Box
          sx={{
            width: '1px',
            height: '28px',
            backgroundColor: 'var(--dock-separator)',
            mx: 0.5,
          }}
        />

        {/* Tab Icons */}
        {displayTabs.map((tab) => {
          const tabNumber = tab.number ?? tab.id;
          const isActive = activeTab === tabNumber;

          return (
            <Box
              key={tab.id ?? tabNumber}
              sx={{ position: 'relative' }}
            >
              {!widgetsLocked && tabNumber !== 1 && (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTab(tabNumber);
                  }}
                  sx={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    width: 16,
                    height: 16,
                    minWidth: 0,
                    padding: 0,
                    backgroundColor: '#ff4444',
                    color: 'white',
                    zIndex: 10,
                    '&:hover': {
                      backgroundColor: '#cc0000',
                    },
                  }}
                >
                  <Close sx={{ fontSize: 10 }} />
                </IconButton>
              )}
              <Tooltip title={tab.label || `Tab ${tabNumber}`} placement="top">
                <Box
                  onClick={() => onTabChange(tabNumber)}
                  sx={{
                    width: 44,
                    height: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    borderRadius: '12px',
                    position: 'relative',
                    transition: 'all 0.2s ease',
                    backgroundColor: isActive ? 'var(--dock-active-bg)' : 'transparent',
                    border: isActive ? '1.5px solid var(--dock-active-border)' : '1.5px solid transparent',
                    boxShadow: isActive ? '0 2px 8px rgba(0, 0, 0, 0.2)' : 'none',
                    '&:hover': {
                      backgroundColor: isActive ? 'var(--dock-active-bg)' : 'rgba(255, 255, 255, 0.08)',
                      transform: 'translateY(-2px)',
                    },
                    '&:active': {
                      transform: 'scale(0.95)',
                    },
                  }}
                >
                  <TabIcon
                    name={tab.icon}
                    size={22}
                    color={isActive ? 'var(--dock-active-icon)' : 'var(--dock-icon)'}
                  />
                  {isActive && (
                    <Box
                      sx={{
                        position: 'absolute',
                        bottom: 2,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        backgroundColor: 'var(--dock-active-icon)',
                      }}
                    />
                  )}
                </Box>
              </Tooltip>
            </Box>
          );
        })}

        {/* Add Tab Button (only in edit mode) */}
        {!widgetsLocked && (
          <>
            <Box
              sx={{
                width: '1px',
                height: '28px',
                backgroundColor: 'var(--dock-separator)',
                mx: 0.5,
              }}
            />
            <Tooltip title="Add new tab" placement="top">
              <Box
                onClick={onAddTab}
                sx={{
                  width: 44,
                  height: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  borderRadius: '12px',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                <Add sx={{ fontSize: 20, color: 'var(--dock-icon)' }} />
              </Box>
            </Tooltip>
          </>
        )}

        {/* Separator before screensaver */}
        {screensaverCountdown && (
          <>
            <Box
              sx={{
                width: '1px',
                height: '28px',
                backgroundColor: 'var(--dock-separator)',
                mx: 0.5,
              }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', px: 0.5 }}>
              {screensaverCountdown}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

export default TabBar;
