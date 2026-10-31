import React, { useEffect, useRef, useState } from 'react';
import { Box, Chip, IconButton, InputAdornment, Tab, Tabs, TextField } from '@mui/material';
import { Close, Search } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import useIsMobile from '../hooks/useIsMobile.js';
import { splitMatch } from '../utils/choresPageSearch.js';

// The header that stays in view on Admin → Family → Chores: the sections as
// tabs, the search, which adds to a tab what it leaves there (`count`, for a
// tab that knows), and under them `children` (the person chips). On a phone the
// search is an icon that opens its own line, so the tabs stay in sight.
export function ChoresPageBar({ sections, section, onSection, query, onQuery, searchable = true, children }) {
  const { t } = useTranslation(['chores', 'common']);
  const isMobile = useIsMobile();
  const [searching, setSearching] = useState(false);
  const input = useRef(null);
  useEffect(() => { if (searching) input.current?.focus(); }, [searching]);
  // Each tab starts at its top, not wherever the last one was scrolled to.
  const top = useRef(null);
  useEffect(() => { top.current?.scrollIntoView({ block: 'start' }); }, [section]);

  const clear = () => { onQuery(''); setSearching(false); };
  const showField = searchable && (!isMobile || searching || Boolean(query));
  const filtering = query.trim() !== '';
  const field = showField && (
    <TextField
      size="small"
      type="text"
      value={query}
      inputRef={input}
      onChange={(event) => onQuery(event.target.value)}
      // Escape leaves the search, not the Admin Panel around it.
      onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); clear(); } }}
      placeholder={t('chores:page.search')}
      sx={isMobile ? { width: '100%', mb: 1 } : { flex: '1 1 200px', maxWidth: 280, ml: 'auto', mb: 0.5 }}
      slotProps={{
        htmlInput: { 'aria-label': t('chores:page.searchAria') },
        input: {
          startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>,
          endAdornment: (query || (isMobile && searching)) && (
            <InputAdornment position="end">
              <IconButton size="small" edge="end" onClick={clear} aria-label={t('chores:page.clearSearch')}><Close fontSize="small" /></IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
  return (
    <>
    <Box ref={top} />
    {/* Out over the pane's padding (AdminShell) once stuck, so it meets the title
        above and both sides, and nothing shows around it on the way past. */}
    <Box
      sx={{
        position: 'sticky',
        top: { xs: -16, sm: -24 },
        zIndex: 3,
        mx: { xs: -2, sm: -3.5 },
        mb: 2,
        px: { xs: 2, sm: 3.5 },
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {/* The search drops to its own line when a narrow pane can't hold both. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1 }}>
        <Tabs
          value={section}
          onChange={(_, value) => onSection(value)}
          variant="scrollable"
          scrollButtons={false}
          sx={{ flex: '0 1 auto', minWidth: 0, maxWidth: '100%' }}
        >
          {sections.map(({ key, label, count }) => (
            <Tab key={key} value={key} id={`chores-tab-${key}`} aria-controls={`chores-panel-${key}`} label={filtering && count !== undefined ? `${label} (${count})` : label} sx={{ minWidth: 0, px: { xs: 1, sm: 1.5 } }} />
          ))}
        </Tabs>
        {!isMobile && field}
      </Box>
      {isMobile && field}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
        {isMobile && searchable && !showField && (
          <IconButton onClick={() => setSearching(true)} aria-label={t('chores:page.searchAria')} sx={{ flex: 'none' }}>
            <Search />
          </IconButton>
        )}
      </Box>
    </Box>
    </>
  );
}

// All, each person, and the bonus chores. Every tab but Settings follows them.
export function ChoresPersonChips({ users, person, onPerson }) {
  const { t } = useTranslation(['chores']);
  const chips = [
    { value: 'all', label: t('chores:page.all') },
    ...users.map((user) => ({ value: String(user.id), label: user.username })),
    { value: 'bonus', label: t('chores:page.bonus') },
  ];
  return (
    <Box role="group" aria-label={t('chores:page.personAria')} sx={{ display: 'flex', flexWrap: { xs: 'nowrap', sm: 'wrap' }, overflowX: 'auto', gap: 0.75, py: 1 }}>
      {chips.map((chip) => (
        <Chip
          key={chip.value}
          sx={{ flex: 'none' }}
          label={chip.label}
          clickable
          aria-pressed={person === chip.value}
          color={person === chip.value ? 'primary' : 'default'}
          variant={person === chip.value ? 'filled' : 'outlined'}
          onClick={() => onPerson(chip.value)}
        />
      ))}
    </Box>
  );
}

// Text with what the search matched marked.
export function SearchMark({ text, query }) {
  const { before, match, after } = splitMatch(text, query);
  if (!match) return <>{text}</>;
  return (
    <>
      {before}
      <Box component="mark" sx={{ bgcolor: 'rgba(var(--accent-rgb), 0.28)', color: 'inherit', borderRadius: 0.5 }}>{match}</Box>
      {after}
    </>
  );
}
