import React, { useRef } from 'react';
import { Box, Typography, Tooltip, InputBase } from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  CHORE_ICON_GROUPS,
  findChoreIcon,
  CHORE_ICON_MAX_LENGTH,
  extractCustomEmoji,
} from '../utils/choreIcons.js';

// Emoji picker for a chore's icon (issue #141).
//
// Inline rather than a modal: it lives inside the chore form, which is already
// a dialog, and nesting dialogs on a tablet is worse than a short scroll.
//
// "None" is a first-class choice and comes first — most chores will not have an
// icon, and a chore without one keeps its checkmark on the dashboard.
const ChoreIconPicker = ({ value, onChange }) => {
  const { t } = useTranslation(['chores', 'common']);
  const customInputRef = useRef(null);

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
  const isCustom = Boolean(value && !selectedEntry);

  const handleCustomInputChange = (event) => {
    const raw = event.target.value;
    if (!raw) {
      onChange('');
      return;
    }
    const emoji = extractCustomEmoji(raw);
    if (emoji) {
      onChange(emoji);
    }
  };

  return (
    <Box role="radiogroup" aria-label={t('chores:icons.pickerLabel')}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {t('chores:icons.pickerLabel')}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5, alignItems: 'center' }}>
        <Tooltip title={t('chores:icons.none')}>
          <Box
            sx={{
              ...cellSx(!value),
              fontSize: '0.7rem',
              color: 'var(--text)',
              opacity: 0.8,
            }}
            {...cellProps(!value, t('chores:icons.none'), () => onChange(''))}
          >
            {t('chores:icons.noneShort')}
          </Box>
        </Tooltip>

        <Tooltip title={t('chores:icons.custom')}>
          <Box
            sx={{
              ...cellSx(isCustom),
              width: 72,
              cursor: 'text',
              overflow: 'hidden',
              px: 0.5,
              '&:hover': {
                backgroundColor: isCustom
                  ? 'rgba(var(--accent-rgb), 0.24)'
                  : 'rgba(var(--accent-rgb), 0.08)',
                transform: 'none',
              },
              '&:focus-within': {
                border: '2px solid var(--accent)',
              },
            }}
            role="radio"
            aria-checked={isCustom}
            aria-label={t('chores:icons.custom')}
            tabIndex={-1}
            onClick={() => customInputRef.current?.focus()}
          >
            <InputBase
              inputRef={customInputRef}
              value={isCustom ? value : ''}
              onChange={handleCustomInputChange}
              placeholder={t('chores:icons.customPlaceholder')}
              inputProps={{
                'aria-label': t('chores:icons.custom'),
                maxLength: CHORE_ICON_MAX_LENGTH,
              }}
              sx={{
                width: '100%',
                height: '100%',
                color: 'var(--text)',
                '& input': {
                  textAlign: 'center',
                  fontSize: isCustom ? '1.5rem' : '0.75rem',
                  lineHeight: 1,
                  padding: 0,
                  cursor: 'text',
                  outline: 'none',
                },
                '& input::placeholder': {
                  opacity: 0.7,
                  color: 'inherit',
                },
              }}
            />
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
