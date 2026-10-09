import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Alert, Autocomplete, Box, Button, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControl, FormControlLabel, IconButton, InputLabel, Menu, MenuItem, Select, Switch, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import {
  Add, ArrowDownward, ArrowUpward, ContentCopy, Delete, Edit, ExpandLess, ExpandMore, FileUpload, Home, Save,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import AdminFormSection from './AdminFormSection';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { ThemeContext } from '../themes/engine/ThemeContext.js';
import { buildPluginThemeMessage, readRoleTokens } from '../utils/pluginThemeBridge.js';
import {
  COLUMN_CHOICES, MAX_TILES, TILE_SIZES, addTiles, blankRecipe, domainOf, exportRecipe, moveTile, parseImport,
  recipeFromArea, suggestedStates, tileTitle, unknownEntities,
} from '../utils/haPanelBuilder.js';

const PREVIEW_SIZES = { small: [300, 220], medium: [460, 340], large: [720, 480] };
const previewOrigin = () => new URL(API_BASE_URL || '/', window.location.href).origin;
const readColor = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Admin → Dashboard → Home Assistant (issue #252): build panels of Home
// Assistant tiles. A panel is a recipe the server keeps and a built-in
// template draws; saving one makes it a plugin like any other.
const HomeAssistantPanels = ({ onNavigate }) => {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const { mode } = useContext(ThemeContext);
  const [info, setInfo] = useState(null);
  const [entities, setEntities] = useState([]);
  const [areas, setAreas] = useState([]);
  const [entitiesError, setEntitiesError] = useState(null);
  const [draft, setDraft] = useState(null); // { id, recipe }
  const [message, setMessage] = useState(null);
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [areaMenu, setAreaMenu] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [importState, setImportState] = useState(null); // { text, recipe, unknown, replacements, error }
  const [history, setHistory] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [previewSize, setPreviewSize] = useState('medium');
  const frameRef = useRef(null);

  const entitiesById = useMemo(() => new Map(entities.map((entity) => [entity.entity_id, entity])), [entities]);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/ha-panels`);
      setInfo(data);
      return data;
    } catch (error) {
      setMessage({ type: 'error', text: error?.response?.data?.error || t('admin:haPanels.loadFailed') });
      return null;
    }
  }, [t]);

  const loadEntities = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/ha-panels/entities`);
      setEntities(data.entities || []);
      setAreas(data.areas || []);
      setEntitiesError(null);
    } catch (error) {
      setEntitiesError(error?.response?.data?.error || error.message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const data = await load();
      if (data?.configured && !data.demo) loadEntities();
    })();
  }, [load, loadEntities]);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/ha-panels/history`, { params: { limit: 50 } });
      setHistory(data.actions || []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => { if (showHistory) loadHistory(); }, [showHistory, loadHistory]);

  // --- The preview -----------------------------------------------------------

  const postPreview = useCallback(() => {
    const frame = frameRef.current?.contentWindow;
    if (!frame || !draft) return;
    const origin = previewOrigin();
    const colors = { primary: readColor('--primary'), secondary: readColor('--secondary'), accent: readColor('--accent') };
    frame.postMessage(buildPluginThemeMessage(mode, colors, { tokens: readRoleTokens(document.documentElement) }), origin);
    frame.postMessage({ type: 'homeglow:ha-preview', recipe: draft.recipe }, origin);
  }, [draft, mode]);

  useEffect(() => {
    const timer = setTimeout(postPreview, 250);
    return () => clearTimeout(timer);
  }, [postPreview]);

  // --- Editing ---------------------------------------------------------------

  const updateRecipe = (patch) => setDraft((prev) => ({ ...prev, recipe: { ...prev.recipe, ...patch } }));
  const updateTile = (index, patch) => setDraft((prev) => ({
    ...prev,
    recipe: { ...prev.recipe, tiles: prev.recipe.tiles.map((tile, i) => (i === index ? { ...tile, ...patch } : tile)) },
  }));
  const removeTile = (index) => setDraft((prev) => ({ ...prev, recipe: { ...prev.recipe, tiles: prev.recipe.tiles.filter((_, i) => i !== index) } }));

  const startNew = (recipe = blankRecipe(t('admin:haPanels.defaultName'))) => {
    setErrors([]);
    setMessage(null);
    setDraft({ id: null, recipe });
  };

  const save = async () => {
    setSaving(true);
    setErrors([]);
    try {
      const payload = { recipe: draft.recipe };
      const { data } = draft.id
        ? await axios.put(`${API_BASE_URL}/api/ha-panels/${draft.id}`, payload)
        : await axios.post(`${API_BASE_URL}/api/ha-panels`, payload);
      const isNew = !draft.id;
      setDraft(null);
      await load();
      setMessage({ type: 'success', text: isNew ? t('admin:haPanels.savedNew', { name: data.panel.name }) : t('admin:haPanels.saved'), placeIt: isNew });
    } catch (error) {
      const body = error?.response?.data;
      setErrors(body?.errors || [body?.error || error.message]);
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async (panel) => {
    try {
      await axios.post(`${API_BASE_URL}/api/ha-panels/${panel.id}/duplicate`);
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error?.response?.data?.error || error.message });
    }
  };

  const remove = async () => {
    const panel = confirmDelete;
    setConfirmDelete(null);
    try {
      await axios.delete(`${API_BASE_URL}/api/ha-panels/${panel.id}`);
      await load();
      setMessage({ type: 'success', text: t('admin:haPanels.deleted', { name: panel.name }) });
    } catch (error) {
      setMessage({ type: 'error', text: error?.response?.data?.error || error.message });
    }
  };

  const copyRecipe = async (panel) => {
    const text = exportRecipe(panel.recipe);
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ type: 'success', text: t('admin:haPanels.exported', { name: panel.name }) });
    } catch {
      setImportState({ text, exportOnly: true });
    }
  };

  const setPinProtection = async (on) => {
    try {
      await axios.put(`${API_BASE_URL}/api/ha-panels/settings`, { pinProtection: on });
      setInfo((prev) => ({ ...prev, settings: { ...prev.settings, pinProtection: on } }));
    } catch (error) {
      setMessage({ type: 'error', text: error?.response?.data?.error || error.message });
    }
  };

  // --- Import ------------------------------------------------------------------

  const readImport = () => {
    const parsed = parseImport(importState.text || '');
    if (parsed.error) {
      setImportState((prev) => ({ ...prev, error: t(`admin:haPanels.import.${parsed.error}`) }));
      return;
    }
    const unknown = unknownEntities(parsed.recipe, entities.map((entity) => entity.entity_id));
    setImportState((prev) => ({ ...prev, error: null, recipe: parsed.recipe, unknown, replacements: {} }));
  };

  const finishImport = async () => {
    try {
      const { data } = await axios.post(`${API_BASE_URL}/api/ha-panels/import`, {
        recipe: importState.recipe,
        replacements: importState.replacements,
      });
      setImportState(null);
      await load();
      setMessage({
        type: data.missing?.length ? 'warning' : 'success',
        text: data.missing?.length
          ? t('admin:haPanels.import.doneMissing', { name: data.panel.name, count: data.missing.length })
          : t('admin:haPanels.import.done', { name: data.panel.name }),
      });
    } catch (error) {
      const body = error?.response?.data;
      setImportState((prev) => ({ ...prev, error: (body?.errors || [body?.error || error.message]).join(' ') }));
    }
  };

  // --- Drawing -------------------------------------------------------------------

  if (!info) return message ? <Alert severity={message.type}>{message.text}</Alert> : null;

  if (info.demo) {
    return (
      <AdminFormSection title={t('admin:haPanels.title')} subtitle={t('admin:haPanels.subtitle')}>
        <Alert severity="info">{t('admin:haPanels.demo')}</Alert>
      </AdminFormSection>
    );
  }

  if (!info.configured) {
    return (
      <AdminFormSection title={t('admin:haPanels.title')} subtitle={t('admin:haPanels.subtitle')}>
        <Alert
          severity="info"
          action={<Button color="inherit" size="small" onClick={() => onNavigate?.({ tab: 'system', section: 'connections' })}>{t('admin:haPanels.openConnections')}</Button>}
        >
          {t('admin:haPanels.notConnected')}
        </Alert>
      </AdminFormSection>
    );
  }

  const entityOption = (id) => entitiesById.get(id) || { entity_id: id, name: id, domain: domainOf(id), area: null, missing: true };
  const sortedOptions = [...entities].sort((a, b) => (a.area || '￿').localeCompare(b.area || '￿') || a.name.localeCompare(b.name));
  const noArea = t('admin:haPanels.noArea');

  // "Show only when…" starts from someone being home, the commonest case, or
  // from the tile's own entity in a home with no people in Home Assistant.
  const defaultCondition = (tile) => {
    const person = sortedOptions.find((entity) => entity.domain === 'person');
    const entityId = person ? person.entity_id : tile.entities[0];
    return { entity: entityId, states: suggestedStates(domainOf(entityId)).slice(0, 1) };
  };

  const renderTileEditor = (tile, index) => {
    const first = entityOption(tile.entities[0]);
    const sameKind = sortedOptions.filter((entity) => entity.domain === domainOf(tile.entities[0]));
    const conditionEntity = tile.when ? entityOption(tile.when.entity) : null;
    return (
      <Box key={tile.id} sx={{ p: 1.5, mb: 1, border: '1px solid var(--card-border)', borderRadius: 'var(--hg-radius-sm)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 600, flex: '1 1 160px', minWidth: 0 }} noWrap>
            {tileTitle(tile, entitiesById)}
          </Typography>
          {first.missing && <Chip size="small" color="warning" label={t('admin:haPanels.missingEntity')} />}
          {first.sensitive && <Chip size="small" label={t('admin:haPanels.sensitive')} />}
          <Tooltip title={t('admin:haPanels.moveUp')}><span><IconButton size="small" disabled={index === 0} onClick={() => updateRecipe({ tiles: moveTile(draft.recipe.tiles, index, index - 1) })} aria-label={t('admin:haPanels.moveUp')}><ArrowUpward fontSize="small" /></IconButton></span></Tooltip>
          <Tooltip title={t('admin:haPanels.moveDown')}><span><IconButton size="small" disabled={index === draft.recipe.tiles.length - 1} onClick={() => updateRecipe({ tiles: moveTile(draft.recipe.tiles, index, index + 1) })} aria-label={t('admin:haPanels.moveDown')}><ArrowDownward fontSize="small" /></IconButton></span></Tooltip>
          <Tooltip title={t('admin:haPanels.remove')}><IconButton size="small" onClick={() => removeTile(index)} aria-label={t('admin:haPanels.remove')}><Delete fontSize="small" /></IconButton></Tooltip>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1fr' }, gap: 1, mt: 1 }}>
          <TextField
            size="small"
            label={t('admin:haPanels.label')}
            placeholder={first.name}
            value={tile.label || ''}
            slotProps={{ htmlInput: { maxLength: 40 } }}
            onChange={(e) => updateTile(index, { label: e.target.value })}
          />
          <Autocomplete
            size="small"
            freeSolo
            options={info.icons || []}
            value={tile.icon || ''}
            // MUI reports the text again on every render; only a real change is stored.
            onInputChange={(_, value) => { if ((tile.icon || '') !== value) updateTile(index, { icon: value }); }}
            renderInput={(params) => <TextField {...params} label={t('admin:haPanels.icon')} placeholder={t('admin:haPanels.iconPlaceholder')} />}
          />
          <FormControl size="small">
            <InputLabel>{t('admin:haPanels.size')}</InputLabel>
            <Select label={t('admin:haPanels.size')} value={tile.size || '1x1'} onChange={(e) => updateTile(index, { size: e.target.value })}>
              {TILE_SIZES.map((size) => <MenuItem key={size} value={size}>{size.replace('x', '×')}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
        <Autocomplete
          multiple
          size="small"
          sx={{ mt: 1 }}
          options={sameKind.map((entity) => entity.entity_id)}
          value={tile.entities}
          getOptionLabel={(id) => entityOption(id).name}
          onChange={(_, value) => value.length && updateTile(index, { entities: value.slice(0, 8) })}
          renderInput={(params) => <TextField {...params} label={t('admin:haPanels.entities')} helperText={tile.entities.length > 1 ? t('admin:haPanels.entitiesTogether') : t('admin:haPanels.entitiesHelp')} />}
        />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, mt: 0.5 }}>
          <FormControlLabel control={<Switch size="small" checked={!!tile.view} onChange={(e) => updateTile(index, { view: e.target.checked })} />} label={t('admin:haPanels.viewOnly')} />
          <FormControlLabel
            control={<Switch size="small" checked={!!tile.hold || !!first.sensitive} disabled={!!first.sensitive} onChange={(e) => updateTile(index, { hold: e.target.checked })} />}
            label={first.sensitive ? t('admin:haPanels.holdAlways') : t('admin:haPanels.hold')}
          />
          <FormControlLabel control={<Switch size="small" checked={tile.showState !== false} onChange={(e) => updateTile(index, { showState: e.target.checked })} />} label={t('admin:haPanels.showState')} />
          <FormControlLabel
            control={<Switch size="small" checked={!!tile.when} onChange={(e) => updateTile(index, { when: e.target.checked ? defaultCondition(tile) : undefined })} />}
            label={t('admin:haPanels.onlyWhen')}
          />
        </Box>
        {tile.when && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr auto' }, gap: 1, mt: 1, alignItems: 'center' }}>
            <Autocomplete
              size="small"
              options={sortedOptions.map((entity) => entity.entity_id)}
              value={tile.when.entity}
              getOptionLabel={(id) => entityOption(id).name}
              onChange={(_, value) => value && updateTile(index, { when: { ...tile.when, entity: value, states: suggestedStates(domainOf(value)).slice(0, 1) } })}
              renderInput={(params) => <TextField {...params} label={t('admin:haPanels.onlyWhenEntity')} />}
            />
            <Autocomplete
              multiple
              freeSolo
              size="small"
              options={suggestedStates(conditionEntity?.domain)}
              value={tile.when.states}
              onChange={(_, value) => updateTile(index, { when: { ...tile.when, states: value.slice(0, 8) } })}
              renderInput={(params) => <TextField {...params} label={t('admin:haPanels.onlyWhenStates')} helperText={conditionEntity && !conditionEntity.missing ? t('admin:haPanels.nowState', { state: conditionEntity.state }) : ''} />}
            />
            <FormControlLabel control={<Switch size="small" checked={!!tile.when.not} onChange={(e) => updateTile(index, { when: { ...tile.when, not: e.target.checked } })} />} label={t('admin:haPanels.onlyWhenNot')} />
          </Box>
        )}
      </Box>
    );
  };

  const [previewWidth, previewHeight] = PREVIEW_SIZES[previewSize];

  return (
    <AdminFormSection title={t('admin:haPanels.title')} subtitle={t('admin:haPanels.subtitle')}>
      {message && (
        <Alert
          severity={message.type}
          onClose={() => setMessage(null)}
          sx={{ mb: 2 }}
          action={message.placeIt ? <Button color="inherit" size="small" onClick={() => onNavigate?.({ tab: 'dashboard', section: 'plugins' })}>{t('admin:haPanels.openPlugins')}</Button> : undefined}
        >
          {message.text}
        </Alert>
      )}
      {info.live?.authError && <Alert severity="error" sx={{ mb: 2 }}>{t('admin:haPanels.tokenRejected')}</Alert>}
      {entitiesError && <Alert severity="warning" sx={{ mb: 2 }}>{t('admin:haPanels.entitiesFailed', { reason: entitiesError })}</Alert>}

      {!draft && (
        <>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            <Button variant="contained" startIcon={<Add />} onClick={() => startNew()}>{t('admin:haPanels.newPanel')}</Button>
            <Button variant="outlined" startIcon={<Home />} disabled={!areas.length} onClick={(e) => setAreaMenu(e.currentTarget)}>{t('admin:haPanels.fromArea')}</Button>
            <Button variant="outlined" startIcon={<FileUpload />} onClick={() => setImportState({ text: '' })}>{t('admin:haPanels.import.button')}</Button>
          </Box>
          <Menu anchorEl={areaMenu} open={!!areaMenu} onClose={() => setAreaMenu(null)}>
            {areas.map((area) => {
              const count = entities.filter((entity) => entity.areaId === area.id).length;
              return (
                <MenuItem key={area.id} disabled={!count} onClick={() => { setAreaMenu(null); startNew(recipeFromArea(area, entities)); }}>
                  {area.name} ({count})
                </MenuItem>
              );
            })}
          </Menu>

          {info.panels.length === 0 ? (
            <Typography color="text.secondary" sx={{ mb: 2 }}>{t('admin:haPanels.noPanels')}</Typography>
          ) : (
            <Box sx={{ mb: 2 }}>
              {info.panels.map((panel) => (
                <Box key={panel.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, borderBottom: '1px solid var(--card-border)' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }} noWrap>{panel.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{t('admin:haPanels.tileCount', { count: panel.recipe.tiles.length })}</Typography>
                  </Box>
                  <Tooltip title={t('admin:haPanels.edit')}><IconButton onClick={() => { setErrors([]); setDraft({ id: panel.id, recipe: panel.recipe }); }} aria-label={t('admin:haPanels.edit')}><Edit /></IconButton></Tooltip>
                  <Tooltip title={t('admin:haPanels.duplicate')}><IconButton onClick={() => duplicate(panel)} aria-label={t('admin:haPanels.duplicate')}><ContentCopy /></IconButton></Tooltip>
                  <Tooltip title={t('admin:haPanels.export')}><IconButton onClick={() => copyRecipe(panel)} aria-label={t('admin:haPanels.export')}><FileUpload sx={{ transform: 'rotate(180deg)' }} /></IconButton></Tooltip>
                  <Tooltip title={t('admin:haPanels.delete')}><IconButton onClick={() => setConfirmDelete(panel)} aria-label={t('admin:haPanels.delete')}><Delete /></IconButton></Tooltip>
                </Box>
              ))}
            </Box>
          )}

          <Divider sx={{ my: 2 }} />
          <FormControlLabel
            control={<Switch checked={info.settings.pinProtection} onChange={(e) => setPinProtection(e.target.checked)} />}
            label={t('admin:haPanels.pinProtection')}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {info.pinExists ? t('admin:haPanels.pinProtectionHelp') : t('admin:haPanels.pinProtectionNoPin')}
          </Typography>

          <Button size="small" onClick={() => setShowHistory((v) => !v)} endIcon={showHistory ? <ExpandLess /> : <ExpandMore />}>
            {t('admin:haPanels.history.title')}
          </Button>
          <Collapse in={showHistory}>
            {history && history.length === 0 && <Typography color="text.secondary" sx={{ mt: 1 }}>{t('admin:haPanels.history.empty')}</Typography>}
            {history && history.length > 0 && (
              <Box sx={{ overflowX: 'auto', mt: 1 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('admin:haPanels.history.when')}</TableCell>
                      <TableCell>{t('admin:haPanels.history.panel')}</TableCell>
                      <TableCell>{t('admin:haPanels.history.display')}</TableCell>
                      <TableCell>{t('admin:haPanels.history.what')}</TableCell>
                      <TableCell>{t('admin:haPanels.history.result')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {history.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{new Date(`${row.at.replace(' ', 'T')}Z`).toLocaleString(i18n.language)}</TableCell>
                        <TableCell>{row.panel}</TableCell>
                        <TableCell>{row.device || '—'}</TableCell>
                        <TableCell>{`${entityOption(row.entity).name}: ${row.action}`}</TableCell>
                        <TableCell>{row.ok ? t('admin:haPanels.history.ok') : row.error}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Collapse>
        </>
      )}

      {draft && (
        <Box>
          {errors.length > 0 && <Alert severity="error" sx={{ mb: 2 }}>{errors.join(' ')}</Alert>}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1fr' }, gap: 1, mb: 2 }}>
            <TextField label={t('admin:haPanels.name')} value={draft.recipe.name} slotProps={{ htmlInput: { maxLength: 40 } }} onChange={(e) => updateRecipe({ name: e.target.value })} required />
            <FormControl>
              <InputLabel>{t('admin:haPanels.layout')}</InputLabel>
              <Select label={t('admin:haPanels.layout')} value={draft.recipe.layout || 'grid'} onChange={(e) => updateRecipe({ layout: e.target.value })}>
                <MenuItem value="grid">{t('admin:haPanels.layoutGrid')}</MenuItem>
                <MenuItem value="list">{t('admin:haPanels.layoutList')}</MenuItem>
              </Select>
            </FormControl>
            <FormControl>
              <InputLabel>{t('admin:haPanels.columns')}</InputLabel>
              <Select label={t('admin:haPanels.columns')} value={draft.recipe.columns ?? 'auto'} onChange={(e) => updateRecipe({ columns: e.target.value })}>
                {COLUMN_CHOICES.map((choice) => <MenuItem key={choice} value={choice}>{choice === 'auto' ? t('admin:haPanels.columnsAuto') : choice}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>

          <Autocomplete
            multiple
            options={sortedOptions.map((entity) => entity.entity_id)}
            groupBy={(id) => entityOption(id).area || noArea}
            getOptionLabel={(id) => entityOption(id).name}
            renderOption={(props, id) => {
              const entity = entityOption(id);
              return (
                <li {...props} key={id}>
                  <Box>
                    <Typography variant="body2">{entity.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{`${id} · ${entity.state}`}</Typography>
                  </Box>
                </li>
              );
            }}
            value={[]}
            disabled={draft.recipe.tiles.length >= MAX_TILES}
            onChange={(_, value) => updateRecipe({ tiles: addTiles(draft.recipe.tiles, value) })}
            renderInput={(params) => <TextField {...params} label={t('admin:haPanels.addEntities')} helperText={t('admin:haPanels.addEntitiesHelp')} />}
            sx={{ mb: 2 }}
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) auto' }, gap: 2, alignItems: 'start' }}>
            <Box>
              {draft.recipe.tiles.length === 0 && <Typography color="text.secondary">{t('admin:haPanels.noTiles')}</Typography>}
              {draft.recipe.tiles.map(renderTileEditor)}
            </Box>
            <Box sx={{ position: { lg: 'sticky' }, top: 8 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="subtitle2" sx={{ flex: 1 }}>{t('admin:haPanels.preview')}</Typography>
                <ToggleButtonGroup size="small" exclusive value={previewSize} onChange={(_, value) => value && setPreviewSize(value)}>
                  {Object.keys(PREVIEW_SIZES).map((size) => <ToggleButton key={size} value={size}>{t(`admin:haPanels.previewSizes.${size}`)}</ToggleButton>)}
                </ToggleButtonGroup>
              </Box>
              <Box sx={{ width: previewWidth, maxWidth: '100%', height: previewHeight, border: '1px solid var(--card-border)', borderRadius: 'var(--hg-frame-radius, 16px)', background: 'var(--hg-frame-bg, var(--card-bg))', overflow: 'hidden' }}>
                <iframe
                  ref={frameRef}
                  title={t('admin:haPanels.preview')}
                  src={`${API_BASE_URL}/ha-panels/preview?lang=${encodeURIComponent(i18n.language || 'en')}`}
                  onLoad={postPreview}
                  style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, maxWidth: previewWidth }}>{t('admin:haPanels.previewHelp')}</Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <Button variant="contained" startIcon={<Save />} disabled={saving || !draft.recipe.name.trim() || draft.recipe.tiles.length === 0} onClick={save}>
              {t('admin:haPanels.save')}
            </Button>
            <Button onClick={() => setDraft(null)}>{t('common:actions.cancel')}</Button>
          </Box>
        </Box>
      )}

      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        <DialogTitle>{t('admin:haPanels.deleteTitle', { name: confirmDelete?.name })}</DialogTitle>
        <DialogContent><Typography>{t('admin:haPanels.deleteHelp')}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>{t('common:actions.cancel')}</Button>
          <Button color="error" onClick={remove}>{t('admin:haPanels.delete')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!importState} onClose={() => setImportState(null)} fullWidth maxWidth="sm">
        <DialogTitle>{importState?.exportOnly ? t('admin:haPanels.export') : t('admin:haPanels.import.title')}</DialogTitle>
        <DialogContent>
          {importState?.error && <Alert severity="error" sx={{ mb: 1 }}>{importState.error}</Alert>}
          {!importState?.recipe && (
            <TextField
              multiline
              minRows={8}
              fullWidth
              sx={{ mt: 1 }}
              label={importState?.exportOnly ? t('admin:haPanels.import.copyThis') : t('admin:haPanels.import.paste')}
              value={importState?.text || ''}
              InputProps={{ readOnly: !!importState?.exportOnly }}
              onChange={(e) => setImportState((prev) => ({ ...prev, text: e.target.value }))}
            />
          )}
          {importState?.recipe && (
            <>
              <Typography sx={{ mb: 1 }}>{importState.unknown.length ? t('admin:haPanels.import.replaceHelp') : t('admin:haPanels.import.allKnown', { name: importState.recipe.name })}</Typography>
              {importState.unknown.map((id) => (
                <Autocomplete
                  key={id}
                  size="small"
                  sx={{ mb: 1 }}
                  options={sortedOptions.filter((entity) => entity.domain === domainOf(id)).map((entity) => entity.entity_id)}
                  getOptionLabel={(option) => entityOption(option).name}
                  value={importState.replacements[id] || null}
                  onChange={(_, value) => setImportState((prev) => ({ ...prev, replacements: { ...prev.replacements, [id]: value || undefined } }))}
                  renderInput={(params) => <TextField {...params} label={id} placeholder={t('admin:haPanels.import.keep')} />}
                />
              ))}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportState(null)}>{importState?.exportOnly ? t('admin:haPanels.close') : t('common:actions.cancel')}</Button>
          {!importState?.exportOnly && !importState?.recipe && <Button variant="contained" onClick={readImport} disabled={!importState?.text?.trim()}>{t('admin:haPanels.import.read')}</Button>}
          {importState?.recipe && <Button variant="contained" onClick={finishImport}>{t('admin:haPanels.import.create')}</Button>}
        </DialogActions>
      </Dialog>
    </AdminFormSection>
  );
};

export default HomeAssistantPanels;
