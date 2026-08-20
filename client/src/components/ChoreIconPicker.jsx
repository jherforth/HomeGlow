import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { CHORE_ICON_GROUPS, findChoreIcon } from '../utils/choreIcons.js';

// Emoji picker for a chore's icon (issue #141).
//
// Inline rather than a modal: it lives inside the chore form, which is already
// a dialog, and nesting dialogs on a tablet is worse than a short scroll.
//
// "None" is a first-class choice and comes first — most chores will not have an
// icon, and a chore without one keeps its checkmark on the dashboard.
const ChoreIconPicker = ({ value, onChange }) => {
  const { t } = useTranslation(['chores', 'common']);

  const cellSx = (selected) => ({
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.5rem',
    lineHeight: 1,
    borderRadius: 1.5,
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

  return (
    <Box role="radiogroup" aria-label={t('chores:icons.pickerLabel')}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {t('chores:icons.pickerLabel')}
        </Typography>
        {/* An emoji outside the bank (kept from an older version, or typed by
            hand) still shows here rather than looking unselected. */}
        {value && !selectedEntry && (
          <Typography variant="caption" color="text.secondary">
            {value}
          </Typography>
        )}
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
        <Tooltip title={t('chores:icons.none')}>
          <Box
            sx={{
              ...cellSx(!value),
              fontSize: '0.7rem',
              color: 'var(--text-color)',
              opacity: 0.8,
            }}
            {...cellProps(!value, t('chores:icons.none'), () => onChange(''))}
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
                    {...cellProps(selected, label, () => onChange(icon.emoji))}
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
  );
};

export default ChoreIconPicker;
