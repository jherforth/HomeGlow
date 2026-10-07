import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@mui/material';
import { Delete, Download, DriveFolderUpload, Refresh } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import AdminFormSection from './AdminFormSection';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { BUILT_IN_THEMES } from '../utils/themes.js';
import { checkThemeFolder, loadInstalledThemes, themeFolderFiles, useThemeRegistry } from '../utils/installedThemes.js';

const BUILT_IN_IDS = new Set(BUILT_IN_THEMES.map((theme) => theme.id));

const errorText = (error, fallback) => error?.response?.data?.problems?.join('; ') || error?.response?.data?.error || fallback;

// Admin → Look: the themes on this HomeGlow, the themes repository, and a
// way to add a theme folder. Chosen in Appearance, above.
export default function ThemeLibrary() {
  const { t } = useTranslation(['admin']);
  const registry = useThemeRegistry();
  const [installed, setInstalled] = useState([]);
  const [store, setStore] = useState({ loading: true, themes: [], repository: null, error: null });
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
      setStore({ loading: false, themes: data.themes || [], repository: data.repository, error: null });
    } catch (error) {
      setStore({ loading: false, themes: [], repository: null, error: errorText(error, t('admin:themes.storeFailed')) });
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
      setMessage({ type: 'error', text: errorText(error, t('admin:themes.failed')) });
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

  return (
    <AdminFormSection
      title={t('admin:themes.heading')}
      subtitle={t('admin:themes.subtitle')}
    >
      {message && <Alert severity={message.type} onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message.text}</Alert>}

      <Typography variant="subtitle2">{t('admin:themes.onThisHomeGlow')}</Typography>
      <List dense sx={{ mb: 2 }}>
        {registry.themes.map((theme) => {
          const entry = installedById.get(theme.id);
          return (
            <ListItem
              key={theme.id}
              secondaryAction={entry && (
                <Button size="small" color="error" startIcon={<Delete />} disabled={busy !== null} onClick={() => remove(theme.id, theme.name)}>
                  {t('admin:themes.remove')}
                </Button>
              )}
            >
              <ListItemText
                primary={(
                  <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    {theme.name}
                    {theme.version && <Typography component="span" variant="caption" color="text.secondary">{theme.version}</Typography>}
                    {!entry && BUILT_IN_IDS.has(theme.id) && <Chip size="small" label={t('admin:themes.builtIn')} />}
                  </Box>
                )}
                secondary={theme.author ? t('admin:plugins.byAuthor', { author: theme.author }) : null}
              />
            </ListItem>
          );
        })}
        {[...rejectedById.values()].map((entry) => (
          <ListItem
            key={`rejected-${entry.id}`}
            secondaryAction={(
              <Button size="small" color="error" startIcon={<Delete />} disabled={busy !== null} onClick={() => remove(entry.id, entry.name)}>
                {t('admin:themes.remove')}
              </Button>
            )}
          >
            <ListItemText
              primary={entry.name}
              secondary={t('admin:themes.cannotUse', { problem: entry.errors[0] })}
              slotProps={{ secondary: { color: 'error' } }}
            />
          </ListItem>
        ))}
      </List>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle2">{t('admin:themes.getMore')}</Typography>
        <Button size="small" startIcon={<Refresh />} onClick={refreshStore} disabled={store.loading}>
          {t('admin:themes.refresh')}
        </Button>
      </Box>
      {store.repository && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {t('admin:themes.fromRepository', { repository: store.repository })}
        </Typography>
      )}
      {store.loading && <CircularProgress size={20} sx={{ my: 1 }} />}
      {store.error && <Alert severity="warning" sx={{ my: 1 }}>{store.error}</Alert>}
      {!store.loading && !store.error && store.themes.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>{t('admin:themes.storeEmpty')}</Typography>
      )}
      <List dense sx={{ mb: 2 }}>
        {store.themes.map((theme) => {
          const entry = installedById.get(theme.id);
          const current = entry && entry.source === 'store' && entry.ref === theme.ref;
          const label = !entry ? t('admin:themes.install') : current ? t('admin:themes.upToDate') : t('admin:themes.update');
          return (
            <ListItem
              key={theme.id}
              secondaryAction={(
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
            >
              {theme.previewUrl && (
                <Box component="img" src={theme.previewUrl} alt="" sx={{ width: 72, height: 45, objectFit: 'cover', borderRadius: 1, mr: 2, flexShrink: 0 }} />
              )}
              <ListItemText
                primary={(
                  <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    {theme.name}
                    {theme.version && <Typography component="span" variant="caption" color="text.secondary">{theme.version}</Typography>}
                  </Box>
                )}
                secondary={[theme.author && t('admin:plugins.byAuthor', { author: theme.author }), theme.description].filter(Boolean).join(' · ') || null}
                sx={{ pr: 12 }}
              />
            </ListItem>
          );
        })}
      </List>

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
        startIcon={busy === 'upload' ? <CircularProgress size={14} /> : <DriveFolderUpload />}
        disabled={busy !== null}
        onClick={() => folderInput.current?.click()}
      >
        {t('admin:themes.addFolder')}
      </Button>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {t('admin:themes.addFolderHelp')}
      </Typography>
    </AdminFormSection>
  );
}
