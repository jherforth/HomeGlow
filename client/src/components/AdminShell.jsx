import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  GlobalStyles,
  Typography,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Close,
  ChevronRight,
  ChevronLeft,
  DashboardOutlined,
  PaletteOutlined,
  DesktopWindowsOutlined,
  PeopleOutlined,
  LockOutlined,
  SettingsOutlined,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import useIsMobile from '../hooks/useIsMobile.js';
import { ADMIN_LAYOUT } from '../utils/adminNavigation.js';
import { AdminSlotsContext } from './AdminRows.jsx';

// The panel's size on a display. Fixed, so nothing moves between sections;
// the PIN check and loading states use it too, so the panel doesn't jump when
// they give way to the sections.
export const ADMIN_PANEL_SIZE = {
  width: 'min(1080px, calc(100vw - 64px))',
  height: 'min(820px, calc(100vh - 64px))',
};

const TAB_ICONS = {
  dashboard: DashboardOutlined,
  look: PaletteOutlined,
  displays: DesktopWindowsOutlined,
  family: PeopleOutlined,
  security: LockOutlined,
  system: SettingsOutlined,
};

// Labels for the third level, the ones that used to be a row of tabs inside
// their section. They now sit in the header as one segmented control.
// Buttons in sentence case, like the labels: in the panel and in every dialog
// it opens (add, edit, delete, PIN), which MUI draws outside the panel. Only
// while the panel is open, so the rest of HomeGlow is untouched.
const sentenceCase = (
  <GlobalStyles styles={{ '.MuiDialog-root :is(.MuiButton-root, .MuiToggleButton-root)': { textTransform: 'none' } }} />
);

const SUBSECTION_LABELS = {
  chores: { definitions: 'admin:users.chores', history: 'admin:chores.history', settings: 'admin:chores.settings' },
  routines: { routines: 'chores:routines.heading', steps: 'chores:routines.stepsHeading' },
};

// The panel's frame: a sidebar on a display, a list you drill into on a
// phone, and a header that names where you are. Neither moves or resizes as
// you go from section to section, which the old rows of tabs in a dialog
// sized to its content did. The sections themselves are the children.
//
// startOnList: on a phone, open on the list rather than a section. A panel
// opened from the dock starts there; a link to a section opens the section.
export default function AdminShell({ location, navigate, onClose, startOnList = true, children }) {
  const { t } = useTranslation(['admin', 'chores', 'common']);
  const isMobile = useIsMobile();
  const [onList, setOnList] = useState(startOnList);
  // Where a section's header control and save buttons are drawn (AdminRows).
  const [headerSlot, setHeaderSlot] = useState(null);
  const [footerSlot, setFooterSlot] = useState(null);

  // Any move to a section leaves the list, including one from outside, such
  // as the hash being edited while the panel is open.
  const placeKey = `${location.tab}/${location.section}/${location.subsection}`;
  const lastPlace = useRef(placeKey);
  useEffect(() => {
    if (lastPlace.current === placeKey) return;
    lastPlace.current = placeKey;
    setOnList(false);
  }, [placeKey]);

  const layout = ADMIN_LAYOUT.find((entry) => entry.tab === location.tab) || ADMIN_LAYOUT[0];
  const title = location.section
    ? t(`admin:sections.${location.section}`)
    : t(`admin:panelTabs.${location.tab}`);
  const subsections = (location.section && layout.subsections?.[location.section]) || [];

  const go = (next) => {
    navigate(next);
    setOnList(false);
  };

  const closeButton = (
    <IconButton onClick={onClose} aria-label={t('common:actions.close')} sx={{ color: 'text.secondary' }}>
      <Close />
    </IconButton>
  );

  const subsectionControl = subsections.length > 0 && (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={location.subsection}
      onChange={(_, value) => value && navigate({ ...location, subsection: value })}
      sx={{
        width: { xs: '100%', sm: 'auto' },
        '& .MuiToggleButton-root': { flex: { xs: 1, sm: 'none' }, px: 1.75, py: 0.5 },
      }}
    >
      {subsections.map((name) => (
        <ToggleButton key={name} value={name}>
          {t(SUBSECTION_LABELS[location.section]?.[name] || `admin:sections.${name}`)}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );

  const headerActions = <Box ref={setHeaderSlot} sx={{ display: 'flex', alignItems: 'center', gap: 1, '&:empty': { display: 'none' } }} />;

  const body = (
    <>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 2, sm: 3.5 }, py: { xs: 2, sm: 3 } }}>
        <AdminSlotsContext.Provider value={{ header: headerSlot, footer: footerSlot }}>
          {children}
        </AdminSlotsContext.Provider>
      </Box>
      <Box
        ref={setFooterSlot}
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
          gap: 1.25,
          px: { xs: 2, sm: 3.5 },
          py: 1.5,
          borderTop: 1,
          borderColor: 'divider',
          '&:empty': { display: 'none' },
          // On a phone the buttons stack, the main one (last) on top.
        '@media (max-width:599.95px)': { flexDirection: 'column-reverse', '& > .MuiButton-root': { width: '100%' } },
        }}
      />
    </>
  );

  if (isMobile) {
    if (onList) {
      return (
        <Box sx={{ height: '100%', overflowY: 'auto', px: 2, pb: 3, bgcolor: (theme) => alpha(theme.palette.text.primary, 0.03) }}>
          {sentenceCase}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1 }}>{closeButton}</Box>
          <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 2, px: 0.5 }}>
            {t('admin:panelTitle')}
          </Typography>
          {ADMIN_LAYOUT.map(({ tab, sections }) => (
            <Box key={tab} sx={{ mb: 2.5 }}>
              {sections.length > 0 && (
                <Typography variant="overline" component="h3" sx={{ display: 'block', color: 'text.secondary', px: 0.5, lineHeight: 2 }}>
                  {t(`admin:panelTabs.${tab}`)}
                </Typography>
              )}
              <List disablePadding sx={listCardSx}>
                {(sections.length > 0 ? sections : [null]).map((section) => (
                  <ListItemButton key={section || tab} onClick={() => go({ tab, section })} sx={{ minHeight: 48 }}>
                    <ListItemText primary={section ? t(`admin:sections.${section}`) : t(`admin:panelTabs.${tab}`)} />
                    <ChevronRight sx={{ color: 'text.secondary' }} />
                  </ListItemButton>
                ))}
              </List>
            </Box>
          ))}
        </Box>
      );
    }
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {sentenceCase}
        <Box sx={{ px: 2, pt: 1, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <ButtonBack label={t('admin:panelTitle')} onClick={() => setOnList(true)} />
            {closeButton}
          </Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          <Box sx={{ '&:has(> *:not(:empty))': { mt: 1.5 }, '& .MuiToggleButtonGroup-root': { width: '100%' }, '& .MuiToggleButton-root': { flex: 1 } }}>
            {headerActions}
            {subsectionControl}
          </Box>
        </Box>
        {body}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '236px minmax(0, 1fr)',
        ...ADMIN_PANEL_SIZE,
      }}
    >
      {sentenceCase}
      <Box
        component="nav"
        aria-label={t('admin:panelTitle')}
        sx={{
          overflowY: 'auto',
          px: 1.5,
          py: 2.5,
          borderRight: 1,
          borderColor: 'divider',
          bgcolor: (theme) => alpha(theme.palette.text.primary, 0.03),
        }}
      >
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, px: 1.5, mb: 1.5 }}>
          {t('admin:panelTitle')}
        </Typography>
        <List disablePadding>
          {ADMIN_LAYOUT.map(({ tab, sections }) => {
            const Icon = TAB_ICONS[tab];
            const open = location.tab === tab;
            return (
              <React.Fragment key={tab}>
                <ListItemButton
                  selected={open && sections.length === 0}
                  onClick={() => go({ tab })}
                  sx={railItemSx}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>{Icon && <Icon fontSize="small" />}</ListItemIcon>
                  <ListItemText
                    primary={t(`admin:panelTabs.${tab}`)}
                    slotProps={{ primary: { sx: { fontSize: '0.9375rem' } } }}
                  />
                </ListItemButton>
                {open && sections.map((section) => (
                  <ListItemButton
                    key={section}
                    selected={location.section === section}
                    onClick={() => go({ tab, section })}
                    sx={{ ...railItemSx, pl: 6.5, py: 0.6 }}
                  >
                    <ListItemText
                      primary={t(`admin:sections.${section}`)}
                      slotProps={{ primary: { sx: { fontSize: '0.875rem' } } }}
                    />
                  </ListItemButton>
                ))}
              </React.Fragment>
            );
          })}
        </List>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 3.5, py: 1.75, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6" component="h2" sx={{ flex: 1, fontWeight: 600 }}>
            {title}
          </Typography>
          {headerActions}
          {subsectionControl}
          {closeButton}
        </Box>
        {body}
      </Box>
    </Box>
  );
}

function ButtonBack({ label, onClick }) {
  return (
    <ListItemButton onClick={onClick} sx={{ flex: 'none', px: 0.5, py: 0.5, borderRadius: 1, color: 'primary.main' }}>
      <ChevronLeft fontSize="small" />
      <Typography variant="body1">{label}</Typography>
    </ListItemButton>
  );
}

const railItemSx = {
  borderRadius: 2,
  py: 0.9,
  mb: 0.25,
  '&.Mui-selected': {
    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.14),
    '& .MuiListItemText-primary': { fontWeight: 600 },
  },
  '&.Mui-selected:hover': { bgcolor: (theme) => alpha(theme.palette.primary.main, 0.2) },
};

const listCardSx = {
  bgcolor: 'background.paper',
  border: 1,
  borderColor: 'divider',
  borderRadius: 1,
  overflow: 'hidden',
  '& > .MuiListItemButton-root + .MuiListItemButton-root': { borderTop: 1, borderColor: 'divider' },
};
