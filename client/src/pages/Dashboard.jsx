import React, { useState, useEffect, useMemo } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { Lock, LockOpen } from '@mui/icons-material';
import WidgetContainer from '../components/WidgetContainer';
import CalendarWidget from '../components/CalendarWidget';
import ChoreWidget from '../components/ChoreWidget';
import PhotoWidget from '../components/PhotoWidget';
import WeatherWidget from '../components/WeatherWidget';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getDeviceApiBase } from '../utils/deviceName.js';
import useFetchTabs from '../hooks/useFetchTabs';

const CORE_WIDGET_ID_TO_NAME = {
  'calendar-widget': 'calendar',
  'chores-widget': 'chores',
  'photos-widget': 'photos',
  'weather-widget': 'weather',
};

const getWidgetName = (id) => CORE_WIDGET_ID_TO_NAME[id] || (id.startsWith('plugin-') ? `plugin:${id.slice(7)}` : id);

const getStoredLayout = (config, widgetId) => {
  if (!config) return null;
  const name = getWidgetName(widgetId);
  const entry = (name && config[name]) || config[widgetId];
  if (!entry) return null;
  const x = entry.layout_x ?? entry.x;
  const y = entry.layout_y ?? entry.y;
  const w = entry.layout_w ?? entry.w;
  const h = entry.layout_h ?? entry.h;
  if (w != null && h != null) {
    return {
      x: x ?? 0,
      y: y ?? 0,
      w,
      h,
    };
  }
  return null;
};

const Dashboard = () => {
  const [locked, setLocked] = useState(true);
  const [widgetSizes, setWidgetSizes] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const activeTab = 1;

  const API_DEVICE_URL = getDeviceApiBase(API_BASE_URL);
  const { tabs, setTabs, fetchTabs } = useFetchTabs(API_DEVICE_URL);

  useEffect(() => {
    fetchTabs();
  }, [fetchTabs]);

  const activeTabConfig = useMemo(() => {
    const activeTabObj = tabs.find(t => t.number === activeTab) || tabs[0];
    if (!activeTabObj?.config_json) return {};
    try {
      return typeof activeTabObj.config_json === 'string'
        ? JSON.parse(activeTabObj.config_json)
        : activeTabObj.config_json;
    } catch {
      return {};
    }
  }, [tabs, activeTab]);

  // Sync widgetSizes from activeTabConfig on load or tab update
  useEffect(() => {
    const newSizes = {};
    ['calendar-widget', 'chores-widget', 'photos-widget', 'weather-widget'].forEach(id => {
      const stored = getStoredLayout(activeTabConfig, id);
      if (stored) {
        newSizes[id] = { width: stored.w, height: stored.h };
      }
    });
    if (Object.keys(newSizes).length > 0) {
      setWidgetSizes(prev => ({ ...prev, ...newSizes }));
    }
  }, [activeTabConfig]);

  // Handle layout changes from WidgetContainer
  const handleLayoutChange = (layout) => {
    const newSizes = {};
    layout.forEach(item => {
      newSizes[item.i] = { width: item.w, height: item.h };
    });

    setWidgetSizes(newSizes);

    setTabs(prevTabs => {
      const baseTabs = (!prevTabs || prevTabs.length === 0)
        ? [{ number: activeTab, config_json: '{}' }]
        : prevTabs;
      return baseTabs.map(tab => {
        if (tab.number !== activeTab) return tab;
        let currentConfig = {};
        try {
          currentConfig = typeof tab.config_json === 'string'
            ? JSON.parse(tab.config_json || '{}')
            : (tab.config_json || {});
        } catch {
          currentConfig = {};
        }
        const updatedConfig = { ...currentConfig };
        layout.forEach(item => {
          const widgetName = getWidgetName(item.i);
          if (widgetName) {
            updatedConfig[widgetName] = {
              ...(updatedConfig[widgetName] || {}),
              layout_x: item.x,
              layout_y: item.y,
              layout_w: item.w,
              layout_h: item.h,
            };
          }
        });
        return {
          ...tab,
          config_json: JSON.stringify(updatedConfig),
        };
      });
    });
  };

  // Handle lock toggle - refresh weather widget when locking
  const handleLockToggle = () => {
    const newLockedState = !locked;
    setLocked(newLockedState);

    if (newLockedState) {
      setRefreshKey(prev => prev + 1);
    }
  };

  // Define widgets with their configurations and saved layouts
  const widgetsWithSizes = useMemo(() => {
    const baseWidgets = [
      {
        id: 'calendar-widget',
        defaultPosition: { x: 0, y: 0 },
        defaultSize: { width: 4, height: 4 },
        minWidth: 3,
        minHeight: 3,
        content: <CalendarWidget />
      },
      {
        id: 'chores-widget',
        defaultPosition: { x: 4, y: 0 },
        defaultSize: { width: 4, height: 4 },
        minWidth: 3,
        minHeight: 3,
        content: <ChoreWidget />
      },
      {
        id: 'photos-widget',
        defaultPosition: { x: 8, y: 0 },
        defaultSize: { width: 4, height: 4 },
        minWidth: 3,
        minHeight: 3,
        content: <PhotoWidget />
      },
      {
        id: 'weather-widget',
        defaultPosition: { x: 0, y: 4 },
        defaultSize: { width: 4, height: 4 },
        minWidth: 2,
        minHeight: 2,
        content: <WeatherWidget
          key={refreshKey}
          widgetSize={widgetSizes['weather-widget'] || { width: 4, height: 4 }}
        />
      }
    ];

    return baseWidgets.map(widget => {
      const stored = getStoredLayout(activeTabConfig, widget.id);
      const savedLayout = stored ? {
        x: stored.x,
        y: stored.y,
        w: stored.w,
        h: stored.h,
      } : null;

      const size = widgetSizes[widget.id] || (savedLayout ? { width: savedLayout.w, height: savedLayout.h } : widget.defaultSize);

      let content = widget.content;
      if (widget.id === 'weather-widget') {
        content = (
          <WeatherWidget
            key={refreshKey}
            widgetSize={size}
          />
        );
      }

      return {
        ...widget,
        savedLayout,
        defaultPosition: savedLayout ? { x: savedLayout.x, y: savedLayout.y } : widget.defaultPosition,
        defaultSize: savedLayout ? { width: savedLayout.w, height: savedLayout.h } : widget.defaultSize,
        content,
      };
    });
  }, [activeTabConfig, widgetSizes, refreshKey]);

  return (
    <Box sx={{
      position: 'relative',
      minHeight: '100vh',
      backgroundColor: 'var(--background)'
    }}>
      {/* Lock/Unlock Button */}
      <Box sx={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 1000
      }}>
        <Tooltip title={locked ? 'Unlock to edit layout' : 'Lock layout'}>
          <IconButton
            onClick={handleLockToggle}
            sx={{
              backgroundColor: locked ? 'var(--surface)' : 'var(--accent)',
              color: locked ? 'var(--text)' : 'white',
              '&:hover': {
                backgroundColor: locked ? 'var(--card-border)' : 'var(--secondary)',
              },
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            }}
          >
            {locked ? <Lock /> : <LockOpen />}
          </IconButton>
        </Tooltip>
      </Box>

      <WidgetContainer
        widgets={widgetsWithSizes}
        locked={locked}
        activeTab={activeTab}
        activeTabId={activeTab}
        onLayoutChange={handleLayoutChange}
      />
    </Box>
  );
};

export default Dashboard;
