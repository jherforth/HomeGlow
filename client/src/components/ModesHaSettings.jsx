import React, { useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { CheckCircle, HomeOutlined, LinkOff } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { AdminGroup, AdminRow } from './AdminRows.jsx';
import HaEntityPicker from './HaEntityPicker.jsx';
import { HELPER_AUTOMATIC, HELPER_NORMAL } from '../utils/displayModes.js';

const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 };

// The sensor the server posts the showing mode to (services/displayModesHa.js).
const sensorIdFor = (helper) => {
  if (!helper) return null;
  const base = helper.split('.')[1].replace(/_mode$/, '');
  return `sensor.${base.startsWith('homeglow') ? base : `homeglow_${base}`}_showing`;
};

/**
 * Admin → Displays → Modes → Home Assistant: this display's mode helper (made
 * here in one tap, or an existing dropdown), the sensor that tells Home
 * Assistant which mode is showing, and who wakes the screen by coming home.
 *
 * - modes: this display's modes settings (normalized)
 * - connection: { configured, live, reachable, states } (null while loading)
 * - entities: Home Assistant's entities for the pickers
 * - apiDeviceUrl, onChanged(text): saved; reload and say so
 * - onSaveHa(patch, text): save fields of `ha` in the modes settings
 * - onOpenConnections(): go to System → Connections
 */
const ModesHaSettings = ({ modes, connection, entities, entitiesLoading, apiDeviceUrl, onChanged, onSaveHa, onOpenConnections }) => {
  const { t } = useTranslation(['admin']);
  const [title, setTitle] = useState(t('admin:modes.ha.defaultTitle'));
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const ha = modes.ha;

  const run = async (body, text) => {
    setBusy(true);
    setProblem(null);
    try {
      await axios.post(`${apiDeviceUrl}/modes/ha/helper`, body);
      setChoosing(false);
      await onChanged(text);
    } catch (error) {
      setProblem(error?.response?.data?.error || t('admin:modes.ha.failed'));
    } finally {
      setBusy(false);
    }
  };

  if (!connection) return null;

  if (!connection.configured) {
    return (
      <AdminGroup title={t('admin:modes.ha.heading')}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, flexWrap: 'wrap' }}>
          <HomeOutlined color="disabled" sx={{ fontSize: 32 }} />
          <Box sx={{ flex: '1 1 260px' }}>
            <Typography sx={{ fontWeight: 600 }}>{t('admin:modes.ha.notConnected')}</Typography>
            <Typography variant="body2" color="text.secondary">{t('admin:modes.ha.notConnectedHelp')}</Typography>
          </Box>
          <Button variant="outlined" onClick={onOpenConnections}>{t('admin:modes.ha.openConnections')}</Button>
        </Box>
      </AdminGroup>
    );
  }

  const helperState = ha.helper ? connection.states?.[ha.helper] : null;
  const options = [HELPER_AUTOMATIC, HELPER_NORMAL, ...modes.modes.map((mode) => mode.name)];
  const unreachable = connection.reachable === false;

  return (
    <AdminGroup title={t('admin:modes.ha.heading')}>
      {unreachable && (
        <Box sx={{ px: 2, pt: 2 }}>
          <Alert severity="warning">{t('admin:modes.ha.unreachable')}</Alert>
        </Box>
      )}
      {problem && (
        <Box sx={{ px: 2, pt: 2 }}>
          <Alert severity="error" onClose={() => setProblem(null)}>{problem}</Alert>
        </Box>
      )}

      {/* The mode helper */}
      {ha.helper ? (
        <Box sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <CheckCircle color="success" sx={{ mt: 0.25 }} />
          <Box sx={{ flex: '1 1 300px', minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700 }}>
              {helperState?.attributes?.friendly_name || ha.title || t('admin:modes.ha.helperFallback')}
            </Typography>
            <Typography color="text.secondary" sx={mono}>{ha.helper}</Typography>
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
              <Chip
                size="small"
                color={helperState ? 'primary' : 'default'}
                label={helperState ? t('admin:modes.ha.now', { option: helperState.state }) : t('admin:modes.ha.missing')}
              />
              {options.map((option) => (
                <Chip key={option} size="small" variant="outlined" label={option} />
              ))}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>
              {t('admin:modes.ha.helperHow')}
            </Typography>
          </Box>
          <Button
            color="inherit"
            startIcon={<LinkOff />}
            disabled={busy}
            onClick={() => {
              if (window.confirm(t('admin:modes.ha.confirmDisconnect'))) void run({ entity_id: null }, t('admin:modes.ha.disconnected'));
            }}
          >
            {t('admin:modes.ha.disconnect')}
          </Button>
        </Box>
      ) : (
        <Box sx={{ p: 2 }}>
          <Typography sx={{ fontWeight: 700 }}>{t('admin:modes.ha.letHaSwitch')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('admin:modes.ha.letHaSwitchHelp')}</Typography>
          {!choosing ? (
            <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField
                size="small"
                label={t('admin:modes.ha.helperName')}
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 60))}
                sx={{ flex: '1 1 240px' }}
              />
              <Button
                variant="contained"
                disabled={busy || !title.trim()}
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
                onClick={() => run({ title: title.trim() }, t('admin:modes.ha.created'))}
              >
                {t('admin:modes.ha.create')}
              </Button>
              <Button onClick={() => setChoosing(true)} disabled={busy}>{t('admin:modes.ha.useExisting')}</Button>
            </Stack>
          ) : (
            <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <HaEntityPicker
                entities={entities}
                loading={entitiesLoading}
                kind="helper"
                value={null}
                label={t('admin:modes.ha.pickHelper')}
                helperText={t('admin:modes.ha.pickHelperHelp')}
                onChange={(id) => { if (id) void run({ entity_id: id }, t('admin:modes.ha.connectedTo', { id })); }}
                sx={{ flex: '1 1 300px' }}
              />
              <Button onClick={() => setChoosing(false)} disabled={busy} sx={{ mt: 1 }}>{t('admin:modes.cancel')}</Button>
            </Stack>
          )}
        </Box>
      )}

      {ha.helper && (
        <AdminRow
          label={t('admin:modes.ha.report')}
          hint={(
            <>
              {t('admin:modes.ha.reportHelp')}
              {' '}
              <Box component="span" sx={mono}>{sensorIdFor(ha.helper)}</Box>
            </>
          )}
          control={(
            <Switch
              checked={ha.report}
              onChange={(e) => onSaveHa({ report: e.target.checked }, t('admin:modes.savedBehavior'))}
              slotProps={{ input: { 'aria-label': t('admin:modes.ha.report') } }}
            />
          )}
        />
      )}

      <AdminRow
        label={t('admin:modes.ha.wake')}
        hint={t('admin:modes.ha.wakeHelp')}
        wide
        control={(
          <HaEntityPicker
            multiple
            entities={entities}
            loading={entitiesLoading}
            kind="people"
            value={ha.wake}
            placeholder={ha.wake.length ? '' : t('admin:modes.ha.wakeNobody')}
            onChange={(ids) => onSaveHa({ wake: ids }, t('admin:modes.savedBehavior'))}
            sx={{ flex: 1, minWidth: 260 }}
          />
        )}
      />
    </AdminGroup>
  );
};

export default ModesHaSettings;
