import React from 'react';
import homeGlowLogo from '../../public/HomeGlowLogo.png';
import { Box, IconButton, Tooltip } from '@mui/material';
import {
  Home,
  Notifications,
  Bookmark,
  Business,
  CalendarToday,
  CameraAlt,
  BarChart,
  Schedule,
  ChatBubble,
  Assignment,
  Explore,
  Email,
  InsertDriveFile,
  Folder,
  Flag,
  Diamond,
  PanTool,
  Favorite,
  AttachMoney,
  Map,
  Lightbulb,
  Image,
  Star,
  Add,
  Close,
  Construction,
  Delete,
  LocalDrink,
  Cloud
} from '@mui/icons-material';

const iconMap = {
  home: Home,
  bell: Notifications,
  bookmark: Bookmark,
  building: Business,
  calendar: CalendarToday,
  camera: CameraAlt,
  chart: BarChart,
  clock: Schedule,
  chat: ChatBubble,
  clipboard: Assignment,
  compass: Explore,
  envelope: Email,
  file: InsertDriveFile,
  folder: Folder,
  flag: Flag,
  gem: Diamond,
  hand: PanTool,
  heart: Favorite,
  money: AttachMoney,
  map: Map,
  lightbulb: Lightbulb,
  image: Image,
  star: Star,
  shovel: Construction,
  trashcan: Delete,
  bucket: LocalDrink,
  clouds: Cloud,
};

const TabBar = ({ tabs, activeTab, onTabChange, widgetsLocked, onAddTab, onDeleteTab }) => {
  const getIconComponent = (iconName) => {
    const IconComponent = iconMap[iconName] || Home;
    return IconComponent;
  };

  const defaultHomeTab = {
    id: 1,
    number: 1,
    label: 'Home',
    icon: 'home',
    show_label: 1,
    index: 0
  };

  const displayTabs = tabs && tabs.length > 0 ? tabs : [defaultHomeTab];

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        height: '100%',
        gap: 0,
        flexWrap: 'nowrap',
        overflow: 'auto',
        maxWidth: '60%',
        '&::-webkit-scrollbar': {
          height: '4px',
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: 'var(--card-border)',
          borderRadius: '2px',
        },
      }}
    >
      {displayTabs.map((tab, index) => {
        const IconComponent = getIconComponent(tab.icon);
        const tabNumber = tab.number ?? tab.id;
        const isActive = activeTab === tabNumber;
        const isHomeTab = tabNumber === 1;

        return (
          <React.Fragment key={tab.id ?? tabNumber}>
            <Box
              sx={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1.5,
                py: 0.5,
                cursor: 'pointer',
                backgroundColor: isActive ? 'rgba(158, 127, 255, 0.25)' : 'transparent',
                borderRadius: '6px',
                transition: 'all 0.2s ease',
                border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
                '&:hover': {
                  backgroundColor: isActive ? 'rgba(158, 127, 255, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                },
              }}
              onClick={() => onTabChange(tabNumber)}
            >
              {!widgetsLocked && !isHomeTab && (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTab(tabNumber);
                  }}
                  sx={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    width: 20,
                    height: 20,
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
                  <Close sx={{ fontSize: 14 }} />
                </IconButton>
              )}

              {isHomeTab ? (
                <img
                  src={homeGlowLogo}
                  alt="Home"
                  style={{
                    height: '30px',
                    width: 'auto',
                    objectFit: 'contain'
                  }}
                />
              ) : (
                <>
                  <IconComponent
                    sx={{
                      fontSize: 20,
                      color: isActive ? 'var(--accent)' : 'inherit',
                    }}
                  />
                  {Boolean(tab.show_label) && (
                    <Box
                      component="span"
                      sx={{
                        fontSize: '0.875rem',
                        fontWeight: isActive ? 600 : 400,
                        whiteSpace: 'nowrap',
                        color: isActive ? 'var(--accent)' : 'inherit',
                      }}
                    >
                      {tab.label}
                    </Box>
                  )}
                </>
              )}
            </Box>

            {index < displayTabs.length - 1 && (
              <Box
                sx={{
                  width: '2px',
                  height: '28px',
                  backgroundColor: 'rgba(255, 255, 255, 0.3)',
                  mx: 0.5,
                  borderRadius: '1px',
                }}
              />
            )}
          </React.Fragment>
        );
      })}

      {!widgetsLocked && (
        <>
          <Box
            sx={{
              width: '2px',
              height: '28px',
              backgroundColor: 'rgba(255, 255, 255, 0.3)',
              mx: 0.5,
              borderRadius: '1px',
            }}
          />
          <Tooltip title="Add new tab">
            <IconButton
              size="small"
              onClick={onAddTab}
              sx={{
                ml: 0.5,
                color: 'var(--accent)',
                '&:hover': {
                  backgroundColor: 'rgba(158, 127, 255, 0.1)',
                },
              }}
            >
              <Add sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        </>
      )}
    </Box>
  );
};

export default TabBar;
