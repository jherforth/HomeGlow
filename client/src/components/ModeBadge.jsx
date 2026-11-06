import React, { useState } from 'react';
import { Box, ButtonBase, Divider, ListItemIcon, ListItemText, ListSubheader, Menu, MenuItem } from '@mui/material';
import { PushPin, PushPinOutlined } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

/**
 * The mode label on the wall (utils/displayModes.js): which mode is on, and a
 * menu to pin it or switch to another mode.
 *
 * - modes: this display's modes
 * - shownMode: the mode on screen, or null for Normal (no mode)
 * - pinned: whether a pin is holding the current view
 * - onPin(modeId | null), onUnpin()
 */
const ModeBadge = ({ modes, shownMode, pinned, onPin, onUnpin }) => {
  const { t } = useTranslation('common');
  const [anchor, setAnchor] = useState(null);
  const close = () => setAnchor(null);
  const name = shownMode ? shownMode.name : t('modes.normal');
  const others = modes.filter((mode) => mode.id !== shownMode?.id);

  const choose = (fn) => () => {
    close();
    fn();
  };

  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        aria-label={t('modes.menuLabel', { name })}
        sx={{
          // Bottom left, beside the dock: the strip the dock keeps clear, so
          // it never covers a widget's title or buttons.
          position: 'fixed',
          bottom: 20,
          left: 16,
          zIndex: 1200,
          minHeight: 36,
          px: 1.5,
          gap: 0.75,
          borderRadius: 'var(--hg-radius-xl)',
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          color: 'var(--text)',
          fontSize: '0.85rem',
          fontWeight: 700,
          fontFamily: 'inherit',
          boxShadow: 'var(--shadow)',
          backdropFilter: 'var(--backdrop-blur)',
        }}
      >
        <Box
          component="span"
          aria-hidden="true"
          sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: shownMode?.color || 'var(--text-secondary)' }}
        />
        {name}
        {pinned && <PushPin aria-hidden="true" sx={{ fontSize: 16 }} />}
      </ButtonBase>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        slotProps={{ paper: { sx: { minWidth: 260 } } }}
      >
        {pinned ? (
          <MenuItem onClick={choose(onUnpin)}>
            <ListItemIcon><PushPinOutlined fontSize="small" /></ListItemIcon>
            <ListItemText primary={t('modes.unpin')} secondary={t('modes.unpinHelp')} />
          </MenuItem>
        ) : (
          <MenuItem onClick={choose(() => onPin(shownMode?.id ?? null))}>
            <ListItemIcon><PushPin fontSize="small" /></ListItemIcon>
            <ListItemText primary={t('modes.pin', { name })} secondary={t('modes.pinHelp')} />
          </MenuItem>
        )}
        {(others.length > 0 || shownMode) && <Divider />}
        {(others.length > 0 || shownMode) && <ListSubheader sx={{ lineHeight: '32px' }}>{t('modes.switchTo')}</ListSubheader>}
        {shownMode && (
          <MenuItem onClick={choose(() => onPin(null))}>
            <ListItemText inset primary={t('modes.normal')} />
          </MenuItem>
        )}
        {others.map((mode) => (
          <MenuItem key={mode.id} onClick={choose(() => onPin(mode.id))}>
            <ListItemIcon>
              <Box component="span" sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: mode.color, ml: 0.5 }} />
            </ListItemIcon>
            <ListItemText primary={mode.name} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default ModeBadge;
