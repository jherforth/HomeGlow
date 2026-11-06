import React, { useEffect, useState } from 'react';
import {
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  MenuList,
  Popover,
  Typography,
} from '@mui/material';
import {
  Add,
  ArrowBack,
  CallSplit,
  ChevronRight,
  ContentCopy,
  DriveFileMove,
  RemoveCircleOutlined,
  Settings,
  Tune,
  ViewCarouselOutlined,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

// The menu a long press opens on a widget in Move/Resize mode. Built for a
// finger on a wall display: big rows, and a second page (pick a tab)
// in place of submenus that would open off to the side.

const rowSx = { minHeight: 52, px: 2, borderRadius: 'var(--hg-radius-md)', mx: 0.5 };

const WidgetLongPressMenu = ({
  open,
  anchorPosition,
  title,
  tabChoices = [],
  onMoveToTab,
  onDuplicateToTab,
  onNewTab,
  onOpenSettings,
  // A Stack: settings opens the Stack's own, and it can be split back up.
  isStack = false,
  onUnstack,
  // A Stack's widgets [{ name, label }], the one showing now first, and
  // opening one's own settings: onOpenMemberSettings(name).
  members = [],
  onOpenMemberSettings,
  onRemove,
  onClose,
}) => {
  const { t } = useTranslation('common');
  const [view, setView] = useState('main');

  useEffect(() => {
    if (open) setView('main');
  }, [open]);

  const choose = (action) => () => {
    onClose();
    action();
  };

  const tabList = (onPick, mode) => (
    <>
      {tabChoices.map((tab) => (
        <MenuItem
          key={tab.number}
          sx={rowSx}
          disabled={tab.alreadyThere}
          onClick={choose(() => onPick(tab.number))}
        >
          <ListItemText
            primary={tab.label}
            secondary={tab.alreadyThere ? t('widgetMenu.alreadyThere') : null}
          />
        </MenuItem>
      ))}
      <MenuItem sx={rowSx} onClick={choose(() => onNewTab(mode))}>
        <ListItemIcon><Add /></ListItemIcon>
        <ListItemText primary={t('widgetMenu.newTab')} />
      </MenuItem>
    </>
  );

  const header = (label, back) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: back ? 0.5 : 2, pt: 1, pb: 0.5 }}>
      {back && (
        <IconButton size="small" onClick={() => setView('main')} aria-label={t('widgetMenu.back')}>
          <ArrowBack fontSize="small" />
        </IconButton>
      )}
      <Typography variant="overline" sx={{ fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.6 }} noWrap>
        {label}
      </Typography>
    </Box>
  );

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition || { top: 0, left: 0 }}
      anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      // Over the dock (9999) and the drag layer, so it can't open beneath them.
      sx={{ zIndex: 10002 }}
      slotProps={{
        paper: {
          'data-widget-menu': 'true',
          sx: {
            minWidth: 260,
            maxWidth: 340,
            borderRadius: 'var(--hg-radius-lg)',
            border: '1px solid var(--card-border)',
            boxShadow: '0 12px 40px var(--hg-black-30)',
            py: 0.5,
          },
        },
      }}
    >
      {view === 'main' && (
        <>
          {header(title)}
          <MenuList dense={false} autoFocusItem={false} sx={{ py: 0 }}>
            <MenuItem sx={rowSx} onClick={() => setView('move')}>
              <ListItemIcon><DriveFileMove /></ListItemIcon>
              <ListItemText primary={t('widgetMenu.moveToTab')} />
              <ChevronRight fontSize="small" sx={{ color: 'var(--text-secondary)' }} />
            </MenuItem>
            <MenuItem sx={rowSx} onClick={() => setView('duplicate')}>
              <ListItemIcon><ContentCopy /></ListItemIcon>
              <ListItemText primary={t('widgetMenu.duplicateToTab')} secondary={t('widgetMenu.duplicateHint')} />
              <ChevronRight fontSize="small" sx={{ color: 'var(--text-secondary)' }} />
            </MenuItem>
            {isStack && members[0] && (
              <MenuItem sx={rowSx} onClick={choose(() => onOpenMemberSettings(members[0].name))}>
                <ListItemIcon><Settings /></ListItemIcon>
                <ListItemText primary={t('widgetMenu.memberSettings', { name: members[0].label })} secondary={t('widgetMenu.showingNow')} />
              </MenuItem>
            )}
            {isStack && members.length > 1 && (
              <MenuItem sx={rowSx} onClick={() => setView('members')}>
                <ListItemIcon><Tune /></ListItemIcon>
                <ListItemText primary={t('widgetMenu.otherSettings')} />
                <ChevronRight fontSize="small" sx={{ color: 'var(--text-secondary)' }} />
              </MenuItem>
            )}
            <MenuItem sx={rowSx} onClick={choose(onOpenSettings)}>
              <ListItemIcon>{isStack ? <ViewCarouselOutlined /> : <Settings />}</ListItemIcon>
              <ListItemText primary={t(isStack ? 'widgetMenu.stackSettings' : 'widgetMenu.settings')} />
            </MenuItem>
            {isStack && (
              <MenuItem sx={rowSx} onClick={choose(onUnstack)}>
                <ListItemIcon><CallSplit /></ListItemIcon>
                <ListItemText primary={t('widgetMenu.unstack')} secondary={t('widgetMenu.unstackHint')} />
              </MenuItem>
            )}
            <Divider sx={{ my: 0.5 }} />
            <MenuItem sx={{ ...rowSx, color: 'var(--hg-error)' }} onClick={choose(onRemove)}>
              <ListItemIcon sx={{ color: 'inherit' }}><RemoveCircleOutlined /></ListItemIcon>
              <ListItemText primary={t('widgetMenu.remove')} />
            </MenuItem>
          </MenuList>
        </>
      )}

      {view === 'move' && (
        <>
          {header(t('widgetMenu.moveToTab'), true)}
          <MenuList sx={{ py: 0 }}>{tabList(onMoveToTab, 'move')}</MenuList>
        </>
      )}

      {view === 'members' && (
        <>
          {header(t('widgetMenu.otherSettings'), true)}
          <MenuList sx={{ py: 0 }}>
            {members.slice(1).map((member) => (
              <MenuItem key={member.name} sx={rowSx} onClick={choose(() => onOpenMemberSettings(member.name))}>
                <ListItemIcon><Settings /></ListItemIcon>
                <ListItemText primary={member.label} />
              </MenuItem>
            ))}
          </MenuList>
        </>
      )}

      {view === 'duplicate' && (
        <>
          {header(t('widgetMenu.duplicateToTab'), true)}
          <MenuList sx={{ py: 0 }}>{tabList(onDuplicateToTab, 'duplicate')}</MenuList>
        </>
      )}

    </Popover>
  );
};

export default WidgetLongPressMenu;
