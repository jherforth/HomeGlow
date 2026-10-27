import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Typography,
} from '@mui/material';
import { Delete, Download, DriveFolderUpload, Refresh } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { AdminGroup, AdminNote, AdminRow } from './AdminRows.jsx';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { BUILT_IN_THEMES, NEEDS_NEWER_HOMEGLOW } from '../utils/themes.js';
import { checkThemeFolder, loadInstalledThemes, themeFolderFiles, useThemeRegistry } from '../utils/installedThemes.js';

const BUILT_IN_IDS = new Set(BUILT_IN_THEMES.map((theme) => theme.id));

const errorText = (error, fallback) => error?.response?.data?.problems?.join('; ') || error?.response?.data?.error || fallback;

// Admin → Look: the themes on this HomeGlow, the themes repository, and a
// way to add a theme folder. Chosen in Appearance, above.
export default function ThemeLibrary() {
  const { t } = useTranslation(['admin']);
  const registry = useThemeRegistry();
  const [installed, setInstalled] = useState([]);
  const [store, setStore] = useState({ loading: true, themes: [], unsupported: [], repository: null, error: null });
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const folderInput = useRef(null);

  const refreshInstalled = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/themes`);
      setInstalled(Array.isArray(data?.themes) ? data.themes : []);
    } catch {
      setInstalled([]);
    }
    await loadInstalledThemes();
  }, []);

  const refreshStore = useCallback(async () => {
    setStore((current) => ({ ...current, loading: true, error: null }));
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/themes/store`);
      setStore({ loading: false, themes: data.themes || [], unsupported: data.unsupported || [], repository: data.repository, error: null });
    } catch (error) {
      setStore({ loading: false, themes: [], unsupported: [], repository: null, error: errorText(error, t('admin:themes.storeFailed')) });
    }
  }, [t]);

  useEffect(() => {
    refreshInstalled();
    refreshStore();
  }, [refreshInstalled, refreshStore]);

  const run = async (key, action, success) => {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      await refreshInstalled();
      setMessage({ type: 'success', text: success });
    } catch (error) {
      const data = error?.response?.data;
      setMessage(data?.needsNewer
        ? { type: 'warning', text: t('admin:themes.needsNewer', { name: data.name || t('admin:themes.thisTheme') }) }
        : { type: 'error', text: errorText(error, t('admin:themes.failed')) });
    } finally {
      setBusy(null);
    }
  };

  const install = (theme) => run(
    `install:${theme.id}`,
    () => axios.post(`${API_BASE_URL}/api/themes/store/install`, { id: theme.id }),
    t('admin:themes.installed', { name: theme.name }),
  );

  const remove = (id, name) => {
    if (!window.confirm(t('admin:themes.confirmRemove', { name }))) return;
    run(`remove:${id}`, () => axios.delete(`${API_BASE_URL}/api/themes/${id}`), t('admin:themes.removed', { name }));
  };

  const uploadFolder = async (fileList) => {
    const entries = themeFolderFiles(fileList);
    if (folderInput.current) folderInput.current.value = '';
    if (entries.length === 0) return;
    const { manifest, errors } = await checkThemeFolder(entries);
    if (errors.includes(NEEDS_NEWER_HOMEGLOW)) {
      setMessage({ type: 'warning', text: t('admin:themes.needsNewer', { name: manifest?.name || t('admin:themes.thisTheme') }) });
      return;
    }
    if (errors.length) {
      setMessage({ type: 'error', text: t('admin:themes.folderInvalid', { problems: errors.join('; ') }) });
      return;
    }
    const form = new FormData();
    entries
      .filter((entry) => entry.path === 'theme.json' || /^(assets|fonts)\//.test(entry.path))
      .forEach((entry) => form.append(entry.path, entry.file, entry.file.name));
    run('upload', () => axios.post(`${API_BASE_URL}/api/themes/upload`, form), t('admin:themes.installed', { name: manifest.name }));
  };

  const installedById = new Map(installed.map((entry) => [entry.id, entry]));
  const rejectedById = new Map(registry.rejected.map((entry) => [entry.id, entry]));

  const nameWithVersion = (name, version, chip) => (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      {name}
      {version && <Typography component="span" variant="caption" color="text.secondary">{version}</Typography>}
      {chip}
    </Box>
  );

  return (
    <>
      {message && <Alert severity={message.type} onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message.text}</Alert>}

      <AdminGroup title={t('admin:themes.onThisHomeGlow')}>
        {registry.themes.map((theme) => {
          const entry = installedById.get(theme.id);
          return (
            <AdminRow
              key={theme.id}
              label={nameWithVersion(theme.name, theme.version, !entry && BUILT_IN_IDS.has(theme.id) && <Chip size="small" label={t('admin:themes.builtIn')} />)}
              hint={theme.author ? t('admin:plugins.byAuthor', { author: theme.author }) : null}
              control={entry && (
                <Button size="small" color="error" startIcon={<Delete />} disabled={busy !== null} onClick={() => remove(theme.id, theme.name)}>
                  {t('admin:themes.remove')}
                </Button>
              )}
            />
          );
        })}
        {[...rejectedById.values()].map((entry) => (
          <AdminRow
            key={`rejected-${entry.id}`}
            label={entry.name}
            hint={(
              <Box component="span" sx={{ color: 'error.main' }}>
                {entry.needsNewer ? t('admin:themes.needsNewer', { name: entry.name }) : t('admin:themes.cannotUse', { problem: entry.errors[0] })}
              </Box>
            )}
            control={(
              <Button size="small" color="error" startIcon={<Delete />} disabled={busy !== null} onClick={() => remove(entry.id, entry.name)}>
                {t('admin:themes.remove')}
              </Button>
            )}
          />
        ))}
      </AdminGroup>

      <AdminGroup
        title={t('admin:themes.getMore')}
        action={(
          <Button size="small" startIcon={<Refresh />} onClick={refreshStore} disabled={store.loading}>
            {t('admin:themes.refresh')}
          </Button>
        )}
      >
        <AdminNote>
          {t('admin:themes.subtitle')}
          {store.repository && <><br />{t('admin:themes.fromRepository', { repository: store.repository })}</>}
        </AdminNote>
        {store.loading && <Box sx={{ px: 2, py: 1.5 }}><CircularProgress size={20} /></Box>}
        {store.error && <Box sx={{ px: 2, py: 1.5 }}><Alert severity="warning">{store.error}</Alert></Box>}
        {!store.loading && !store.error && store.themes.length === 0 && store.unsupported.length === 0 && (
          <AdminNote>{t('admin:themes.storeEmpty')}</AdminNote>
        )}
        {store.unsupported.map((theme) => (
          <AdminRow
            key={`newer-${theme.id}`}
            label={nameWithVersion(theme.name, theme.version)}
            hint={t('admin:themes.needsNewer', { name: theme.name })}
          />
        ))}
        {store.themes.map((theme) => {
          const entry = installedById.get(theme.id);
          const current = entry && entry.source === 'store' && entry.ref === theme.ref;
          const label = !entry ? t('admin:themes.install') : current ? t('admin:themes.upToDate') : t('admin:themes.update');
          return (
            <AdminRow
              key={theme.id}
              leading={theme.previewUrl && (
                <Box component="img" src={theme.previewUrl} alt="" sx={{ width: 72, height: 45, objectFit: 'cover', borderRadius: 1 }} />
              )}
              label={nameWithVersion(theme.name, theme.version)}
              hint={[theme.author && t('admin:plugins.byAuthor', { author: theme.author }), theme.description].filter(Boolean).join(' · ') || null}
              control={(
                <Button
                  size="small"
                  variant={entry ? 'text' : 'outlined'}
                  startIcon={busy === `install:${theme.id}` ? <CircularProgress size={14} /> : <Download />}
                  disabled={busy !== null || current}
                  onClick={() => install(theme)}
                >
                  {label}
                </Button>
              )}
            />
          );
        })}
        <AdminRow
          hint={t('admin:themes.addFolderHelp')}
          control={(
            <>
              <input
                ref={folderInput}
                type="file"
                hidden
                multiple
                webkitdirectory=""
                directory=""
                onChange={(event) => uploadFolder(event.target.files)}
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={busy === 'upload' ? <CircularProgress size={14} /> : <DriveFolderUpload />}
                disabled={busy !== null}
                onClick={() => folderInput.current?.click()}
              >
                {t('admin:themes.addFolder')}
              </Button>
            </>
          )}
        />
      </AdminGroup>
    </>
  );
}
