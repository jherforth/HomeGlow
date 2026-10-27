import React, { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Box, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { ArrowDownward, ArrowUpward } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

// The parts a section of the Admin Panel is built from: groups of rows, each
// a label with a line of help on the left and its control on the right, and
// the two places in the frame (AdminShell) a section can reach: the header,
// for a control that applies to the whole section, and the footer, for its
// save buttons, which stay in view however far the section scrolls.

// The frame hands its header and footer elements down through this.
export const AdminSlotsContext = createContext({ header: null, footer: null });

const Slot = ({ name, children }) => {
  const target = useContext(AdminSlotsContext)[name];
  return target ? createPortal(children, target) : null;
};

export const AdminHeaderActions = ({ children }) => <Slot name="header">{children}</Slot>;
export const AdminFooter = ({ children }) => <Slot name="footer">{children}</Slot>;

// The accent's edge and tint, for a group whose first row is a header band.
const accentEdge = 'rgba(var(--accent-rgb), 0.35)';

// A heading, then the group's rows in one bordered block, with the same
// corners as the fields inside it. `action` sits at the right end of the
// heading, for an Add button and such. `accent` draws the block's edge in the
// accent and its first row as a tinted band, so a run of like groups (one per
// installed plugin) don't read as one.
export const AdminGroup = ({ title, action, accent = false, children, sx }) => (
  <Box component="section" sx={{ mb: 3, ...sx }}>
    {(title || action) && (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minHeight: 32, mb: 1, px: 0.5 }}>
        {title && (
          <Typography
            variant="overline"
            component="h3"
            sx={{ color: 'text.secondary', fontWeight: 600, lineHeight: 1.6, letterSpacing: '0.06em' }}
          >
            {title}
          </Typography>
        )}
        {action}
      </Box>
    )}
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        '& > * + *': { borderTop: 1, borderColor: 'divider' },
        ...(accent && {
          borderColor: accentEdge,
          overflow: 'hidden',
          '& > :first-child': { bgcolor: 'rgba(var(--accent-rgb), 0.10)' },
          '& > :first-child + *': { borderColor: accentEdge },
        }),
      }}
    >
      {children}
    </Box>
  </Box>
);

// One setting. The control sits on the right; a `wide` one (a text field, a
// row of swatches) goes under the label instead, as every control does on a
// phone that can't fit beside it. `under` sits below the hint, in the label's
// column (a "Use household" switch); `extra` is anything that belongs to the
// setting but spans the row under it, like a follow-up field. `leading` is a
// picture or icon before the label, for rows that list things. A `fill`
// control (a slider, a dropdown) takes the whole line when it wraps under the
// label on a phone; others keep their own width.
export const AdminRow = ({ label, hint, under, control, leading, wide = false, fill = false, extra, disabled = false }) => (
  <Box sx={{ px: 2, py: 1.5, minHeight: 56 }}>
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: wide ? 'wrap' : { xs: 'wrap', sm: 'nowrap' },
        columnGap: 2.5,
        rowGap: 1.25,
      }}
    >
      {leading && <Box sx={{ flex: 'none', display: 'flex', alignItems: 'center' }}>{leading}</Box>}
      <Box sx={{ flex: '1 1 220px', minWidth: 0, opacity: disabled ? 0.6 : 1 }}>
        {label && <Typography variant="body1" component="div" sx={{ fontWeight: 500 }}>{label}</Typography>}
        {hint && (
          <Typography variant="body2" component="div" color="text.secondary" sx={{ fontSize: '0.8125rem', mt: 0.25 }}>
            {hint}
          </Typography>
        )}
        {under}
      </Box>
      {control && (
        <Box
          sx={{
            flex: wide ? '1 1 100%' : { xs: fill ? '1 1 100%' : '0 0 auto', sm: '0 0 auto' },
            ...(fill && { '@media (max-width:599.95px)': { '& > .MuiFormControl-root, & > .MuiToggleButtonGroup-root': { flex: 1 }, '& .MuiToggleButton-root': { flex: 1 } } }),
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            maxWidth: '100%',
          }}
        >
          {control}
        </Box>
      )}
    </Box>
    {extra && <Box sx={{ mt: 1.5 }}>{extra}</Box>}
  </Box>
);

// A line of text in a group, for a note that isn't a setting.
export const AdminNote = ({ children }) => (
  <Box sx={{ px: 2, py: 1.5 }}>
    <Typography variant="body2" color="text.secondary">{children}</Typography>
  </Box>
);

// Sorting for a list of rows, in place of a table's clickable headers: which
// field, and which way. `sort` is { column, direction }; `onSort(column)`
// picks a field, or flips the direction when it is the current one.
export const AdminSortControl = ({ options, sort, onSort }) => {
  const { t } = useTranslation('common');
  const descending = sort.direction === 'desc';
  const directionLabel = descending ? t('labels.descending') : t('labels.ascending');
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <TextField
        select
        size="small"
        label={t('labels.sortBy')}
        value={sort.column}
        onChange={(e) => onSort(e.target.value)}
        sx={{ minWidth: 150 }}
      >
        {options.map(({ value, label }) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
      </TextField>
      <Tooltip title={directionLabel}>
        <IconButton size="small" aria-label={directionLabel} onClick={() => onSort(sort.column)}>
          {descending ? <ArrowDownward fontSize="small" /> : <ArrowUpward fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Box>
  );
};
