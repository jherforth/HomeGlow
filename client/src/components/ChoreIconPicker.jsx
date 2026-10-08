import React, { useId, useState } from 'react';
import { Box, ButtonBase, Collapse, Typography, Tooltip } from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { CHORE_ICON_GROUPS, findChoreIcon } from '../utils/choreIcons.js';

// Emoji picker for a chore's icon (issue #141).
//
// Inline rather than a modal: it lives inside the chore form, which is already
// a dialog, and nesting dialogs on a tablet is worse than a short scroll.
//
// Folded by default: a small button shows the current choice, and the grid of
// groups opens under it on tap and folds away again once one is picked. Open,
// the grid is taller than the rest of the form put together.
//
// "None" is a first-class choice and comes first — most chores will not have an
// icon, and a chore without one keeps its checkmark on the dashboard.
const ChoreIconPicker = ({ value, onChange }) => {
  const { t } = useTranslation(['chores', 'common']);
  const [open, setOpen] = useState(false);
  const gridId = useId();

  const choose = (emoji) => {
    onChange(emoji);
    setOpen(false);
  };

  const cellSx = (selected) => ({
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.5rem',
    lineHeight: 1,
    borderRadius: 'var(--hg-radius-md)',
    cursor: 'pointer',
    userSelect: 'none',
    border: selected ? '2px solid var(--accent)' : '2px solid transparent',
    backgroundColor: selected ? 'rgba(var(--accent-rgb), 0.18)' : 'var(--card-bg)',
    transition: 'transform 0.15s ease, background-color 0.15s ease',
    '&:hover': {
      backgroundColor: selected ? 'rgba(var(--accent-rgb), 0.24)' : 'rgba(var(--accent-rgb), 0.08)',
      transform: 'scale(1.08)',
    },
  });

  // The emoji itself is decorative once the button carries a name, so each cell
  // gets an explicit accessible name and the glyph is hidden from assistive
  // tech rather than read out as "broom broom".
  const cellProps = (selected, label, onSelect) => ({
    role: 'radio',
    'aria-checked': selected,
    'aria-label': label,
    tabIndex: 0,
    onClick: onSelect,
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect();
      }
    },
  });

  const selectedEntry = value ? findChoreIcon(value) : null;
  // What the folded button says: the chosen picture (an emoji outside the bank,
  // kept from an older version, still shows as itself), or "None".
  const currentLabel = value
    ? (selectedEntry ? t(`chores:icons.${selectedEntry.key}`) : value)
    : t('chores:icons.none');

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {t('chores:icons.pickerLabel')}
        </Typography>
        <ButtonBase
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          aria-expanded={open}
          aria-controls={gridId}
          aria-label={`${t('chores:icons.pickerLabel')}: ${currentLabel}`}
          sx={{
            height: 40,
            minWidth: 64,
            px: 1,
            gap: 0.5,
            border: '1px solid var(--card-border)',
            borderRadius: 'var(--hg-radius-sm)',
            color: 'var(--text)',
            '&:hover': { borderColor: 'var(--accent)' },
            '&:focus-visible': { outline: '2px solid var(--accent)', outlineOffset: 2 },
          }}
        >
          {value ? (
            <Box component="span" aria-hidden="true" sx={{ fontSize: '1.4rem', lineHeight: 1 }}>{value}</Box>
          ) : (
            <Typography component="span" variant="caption" sx={{ opacity: 0.75 }}>
              {t('chores:icons.noneShort')}
            </Typography>
          )}
          <ExpandMore
            fontSize="small"
            aria-hidden="true"
            sx={{ opacity: 0.7, transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'none' }}
          />
        </ButtonBase>
      </Box>

      <Collapse in={open} id={gridId} unmountOnExit>
        <Box role="radiogroup" aria-label={t('chores:icons.pickerLabel')} sx={{ pt: 1.5 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
            <Tooltip title={t('chores:icons.none')}>
              <Box
                sx={{
                  ...cellSx(!value),
                  fontSize: '0.7rem',
                  color: 'var(--text)',
                  opacity: 0.8,
                }}
                {...cellProps(!value, t('chores:icons.none'), () => choose(''))}
              >
                {t('chores:icons.noneShort')}
              </Box>
            </Tooltip>
          </Box>

          {CHORE_ICON_GROUPS.map((group) => (
            <Box key={group.key} sx={{ mb: 1.5 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                {t(`chores:iconGroups.${group.key}`)}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {group.icons.map((icon) => {
                  const label = t(`chores:icons.${icon.key}`);
                  const selected = value === icon.emoji;
                  return (
                    <Tooltip key={icon.key} title={label}>
                      <Box
                        sx={cellSx(selected)}
                        {...cellProps(selected, label, () => choose(icon.emoji))}
                      >
                        <span aria-hidden="true">{icon.emoji}</span>
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};

export default ChoreIconPicker;
