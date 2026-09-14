import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  CONTROL_LIMITS_KEY,
  CONTROL_PRESETS,
  CORE_CONTROLS,
  defaultWouldRestrict,
  editorState,
  fetchAllDisplayLimits,
  householdDefaultLimits,
  isControlHidden,
  isDisplayUnlocked,
  isValidControlId,
  normalizeControlLimits,
  saveDisplayLimits,
  saveHouseholdDefaultLimits,
  toggleControl,
} from '../utils/displayControls.js';

/**
 * Control Limits admin form — which parent-facing controls each display offers.
 *
 * Every decision is asked of `utils/displayControls.js`; nothing here re-derives
 * the mode/except inversion and nothing here reads `except`. This file is the
 * form: fetch, render, write, fold the answer back in.
 *
 * Four invariants it has to hold:
 *
 *  - Switches show the CONFIGURED state, never the in-force one. An exempt
 *    display hides nothing in force, but its switches must still show what is
 *    saved so it can be changed — so `editorState`, which cannot see the PIN
 *    status, is the only source of a switch position, and the exemption is
 *    surfaced as a notice rather than by moving switches.
 *  - No display renders until every read has settled, or a configured row reads
 *    "Using household default" before we know whether it is.
 *  - A row we could not read asserts nothing: no positions, no caption, no
 *    preset, and no write (see `requestHouseholdDefault`). `settingsRead: false`
 *    means unknown, and unknown is not a licence to overwrite.
 *  - Busy and error state are per row, and a settled read may not overwrite a row
 *    that was written while it was in flight (see `writeClockRef`, `mergeRead`).
 */

// `busyScopes` and `errorScopes` hold device names, or this sentinel for the
// household default. A colon cannot appear in a device name (see
// DEVICE_NAME_ALLOWED in utils/deviceName.js), so the two can never collide.
const HOUSEHOLD_SCOPE = ':household';

const SELECTABLE_PRESETS = ['fullControl', 'wallDisplay'];

// Sets of scopes, copied only when the membership actually changes so an
// unrelated row does not re-render on every write.
const withScope = (scopes, scope) => {
  if (scopes.has(scope)) return scopes;
  const next = new Set(scopes);
  next.add(scope);
  return next;
};

const withoutScope = (scopes, scope) => {
  if (!scopes.has(scope)) return scopes;
  const next = new Set(scopes);
  next.delete(scope);
  return next;
};

/**
 * Read/write ordering, per display.
 *
 * A read started before a write cannot be allowed to land over that write's
 * answer. The read token alone only orders read-against-read, so the sequence
 * "Refresh starts → admin toggles → PATCH echoes and folds in → the older read
 * resolves" replaced the freshly-written row with the pre-toggle value, and the
 * admin's NEXT toggle then computed from that stale row and silently un-hid the
 * first control on the server.
 *
 * One monotonic counter answers it. A write stamps the clock when it settles; a
 * read remembers the clock it started at. When the read lands, a row is kept
 * from the previous state if a write for it is still open, or if a write for it
 * settled after the read began — both mean the read's copy of that row is older
 * than what we know. Every other row folds in normally, so one busy display
 * does not cost the rest of the table its refresh.
 */
const newWriteClock = () => ({ now: 0, rows: new Map() });

const beginWrite = (clock, name) => {
  clock.now += 1;
  const row = clock.rows.get(name) ?? { open: 0, settledAt: 0 };
  clock.rows.set(name, { open: row.open + 1, settledAt: row.settledAt });
};

const endWrite = (clock, name) => {
  clock.now += 1;
  const row = clock.rows.get(name) ?? { open: 0, settledAt: 0 };
  clock.rows.set(name, { open: Math.max(0, row.open - 1), settledAt: clock.now });
};

const readStartedAt = (clock) => {
  clock.now += 1;
  return clock.now;
};

const writeWonTheRace = (clock, name, startedAt) => {
  const row = clock.rows.get(name);
  if (!row) return false;
  return row.open > 0 || row.settledAt > startedAt;
};

/**
 * Fold a finished read into state, per display rather than by replacing the
 * whole map: `names` is what the read asked for, so a display dropped from the
 * list drops out of state, and a display whose write outranks the read keeps the
 * value we already have.
 */
const mergeRead = (prev, next, names, keepPrevious) => {
  if (!prev) return next;
  const merged = { ...next };
  for (const name of names) {
    if (keepPrevious(name) && Object.prototype.hasOwnProperty.call(prev, name)) {
      merged[name] = prev[name];
    }
  }
  return merged;
};

/**
 * Plugin manifests are author-supplied JSON and the server does not validate
 * `hideableControls` at all, so every value taken out of one is a value that can
 * be any JSON type. An object reaching JSX throws "Objects are not valid as a
 * React child", and with no error boundary anywhere in this client that unmounts
 * the whole admin tree — including the only UI for uninstalling the plugin that
 * did it. A non-string is therefore not rendered; it falls back.
 */
const asText = (value, fallback) => (
  typeof value === 'string' && value.trim() !== '' ? value : fallback
);

/**
 * One group of switches. ON means the control is SHOWN — storage is the inverse,
 * but the label has to read the way a parent thinks, so the inversion happens
 * here at the edge and only here.
 *
 * `titleId` ties the group's heading to the switches inside it. Without it a
 * screen reader reads "Edit the menu, switch, on" with nothing saying which
 * plugin, and two plugins whose authors picked the same control label are
 * indistinguishable.
 */
const ControlSwitchGroup = ({ title, titleId, items, hiddenIds, disabled, onToggle }) => (
  <Box sx={{ mt: 1.5 }}>
    <Typography
      id={titleId}
      variant="caption"
      color="text.secondary"
      sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
    >
      {title}
    </Typography>
    <FormGroup role="group" aria-labelledby={titleId}>
      {items.map((item) => (
        <FormControlLabel
          key={item.id}
          control={(
            <Switch
              size="small"
              checked={!isControlHidden(hiddenIds, item.id)}
              disabled={disabled}
              onChange={(event) => onToggle(item.id, event.target.checked)}
            />
          )}
          label={item.label}
        />
      ))}
    </FormGroup>
  </Box>
);

const ControlsOnDisplay = ({
  apiBaseUrl,
  devices,
  currentDeviceName,
  pinExists,
  householdSettings,
  plugins,
  onHouseholdDefaultSaved,
  onDisplayLimitsSaved,
}) => {
  const { t } = useTranslation(['admin', 'common']);

  const [limitsByDevice, setLimitsByDevice] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Scoped to the rows being written, never global, and a SET rather than one
  // name: a ten-display household flipping one switch must not freeze the other
  // nine, and `kitchen`'s write finishing must not re-enable `hallway`'s
  // switches while `hallway`'s own PATCH is still in flight.
  const [busyScopes, setBusyScopes] = useState(() => new Set());
  // Which rows last failed to save, not their messages. Holding the translated
  // string would freeze it in the language it was produced in, and would drag
  // `t` into the dependencies of the fetch callback below. A set for the same
  // reason as above: one row's write must not erase an error the admin has not
  // read on another row.
  const [errorScopes, setErrorScopes] = useState(() => new Set());
  // A household-default change that is waiting on the "restrict this display
  // too?" question. Holds the limits object the admin asked for, and is kept
  // until the write actually lands — see the dialog at the bottom.
  const [pendingDefault, setPendingDefault] = useState(null);
  // null | 'writing' | 'failed' for that dialog's own two-step write. The
  // dialog is where the admin is looking, so it is where its progress and its
  // failure belong.
  const [defaultStatus, setDefaultStatus] = useState(null);
  // A preset choice that would throw away individually-set controls, waiting on
  // confirmation. `{scope, deviceName, limits, preset, count}` — the preset NAME,
  // not its translated label, so the dialog re-renders in the current language.
  const [pendingPreset, setPendingPreset] = useState(null);

  // Stringified so the fetch effect and its callback depend on the *names*, not
  // on the identity of a freshly-mapped array. The names are read back out of
  // the key, so there is no second copy to drift.
  const deviceNamesKey = useMemo(() => JSON.stringify(
    (devices || []).map((device) => device?.name).filter((name) => typeof name === 'string' && name.length > 0),
  ), [devices]);
  const deviceNames = useMemo(() => JSON.parse(deviceNamesKey), [deviceNamesKey]);

  // Plugin-contributed controls. Labels are author-supplied and deliberately not
  // translated, matching how declared plugin settings already render
  // (`setting.label || setting.key`) — but they are type-checked on the way in,
  // because a manifest is not a trusted source of React children.
  //
  // Ids that `isValidControlId` rejects are dropped rather than rendered: they
  // cannot be stored, so a switch for one would move and then do nothing. A
  // non-string id is dropped for the same reason — interpolating one produces
  // `plugin:x:undefined`, which the id regex happens to accept.
  const pluginGroups = useMemo(() => (plugins || []).map((plugin) => {
    const pluginId = asText(plugin?.manifest?.id, asText(plugin?.pluginId, null));
    const declared = Array.isArray(plugin?.manifest?.hideableControls) ? plugin.manifest.hideableControls : [];
    if (!pluginId || declared.length === 0) return null;

    const seen = new Set();
    const items = declared
      .map((control) => {
        const controlId = control?.id;
        if (typeof controlId !== 'string') return null;
        return { id: `plugin:${pluginId}:${controlId}`, label: asText(control?.label, controlId) };
      })
      .filter((item) => item !== null && isValidControlId(item.id))
      // A manifest may name the same control twice; two switches writing one id
      // would also collide as React keys.
      .filter((item) => (seen.has(item.id) ? false : seen.add(item.id)));

    if (items.length === 0) return null;
    const title = asText(plugin?.manifest?.name, asText(plugin?.name, pluginId));
    return { key: pluginId, title, items };
  }).filter(Boolean), [plugins]);

  const groups = useMemo(() => [
    {
      key: 'core',
      title: t('admin:controls.coreGroup'),
      items: CORE_CONTROLS.map((control) => ({ id: control.id, label: t(control.labelKey) })),
    },
    ...pluginGroups,
  ], [pluginGroups, t]);

  // The live catalog. `editorState` needs it to name a plugin control at all;
  // it is a source of candidates, never a filter.
  const knownControlIds = useMemo(
    () => groups.flatMap((group) => group.items.map((item) => item.id)),
    [groups],
  );

  const householdDefault = useMemo(() => householdDefaultLimits(householdSettings), [householdSettings]);

  /**
   * How many of the switches on screen would move if `next` replaced `own`.
   *
   * Asked of `editorState` and `isControlHidden` rather than counting `except`,
   * which is private to the module, and restricted to the rendered catalog so
   * the number names something the admin can actually see and check.
   */
  const countMovedSwitches = useCallback((own, next, inherited) => {
    const before = editorState({ own, inherited, knownControlIds }).hiddenIds;
    const after = editorState({ own: next, inherited, knownControlIds }).hiddenIds;
    return knownControlIds.filter(
      (id) => isControlHidden(before, id) !== isControlHidden(after, id),
    ).length;
  }, [knownControlIds]);

  // Only the newest read may land. Two reads can be in flight — the device list
  // arriving while the first is running, or an admin pressing Refresh — and the
  // slower one finishing last would otherwise overwrite the newer answer.
  const readTokenRef = useRef(0);
  // Read-against-write ordering, per display. See newWriteClock above.
  const writeClockRef = useRef(newWriteClock());

  const loadLimits = useCallback(async () => {
    const names = JSON.parse(deviceNamesKey);
    readTokenRef.current += 1;
    const token = readTokenRef.current;
    const startedAt = readStartedAt(writeClockRef.current);
    const keepPrevious = (name) => writeWonTheRace(writeClockRef.current, name, startedAt);
    try {
      const next = await fetchAllDisplayLimits(apiBaseUrl, names);
      if (token !== readTokenRef.current) return;
      setLimitsByDevice((prev) => mergeRead(prev, next, names, keepPrevious));
      setLoadFailed(false);
    } catch (error) {
      // fetchAllDisplayLimits settles rather than races, so this is close to
      // unread — but an empty map is the honest fallback: every row then
      // says "could not read", which is exactly what happened. Rows with a
      // fresher write are still kept: that value came from the server's own
      // echo, and throwing it away would report "could not read" about a
      // display we just successfully wrote.
      console.error('Error reading display control limits:', error);
      if (token !== readTokenRef.current) return;
      setLimitsByDevice((prev) => mergeRead(prev, {}, names, keepPrevious));
      setLoadFailed(true);
    }
  }, [apiBaseUrl, deviceNamesKey]);

  useEffect(() => {
    void loadLimits();
  }, [loadLimits]);

  /**
   * Write one display and fold the echoed blob into local state.
   *
   * Deliberately does NOT re-read every display afterwards: the PATCH route
   * echoes the merged settings, so the answer is already in hand. Re-reading was
   * eleven requests per switch on a ten-display household.
   *
   * A failure re-reads on purpose. A local copy that may have diverged from the
   * server is worse for an admin than one extra round trip.
   */
  const writeDisplay = useCallback(async (deviceName, limits) => {
    beginWrite(writeClockRef.current, deviceName);
    setBusyScopes((prev) => withScope(prev, deviceName));
    setErrorScopes((prev) => withoutScope(prev, deviceName));
    try {
      let blob;
      try {
        blob = await saveDisplayLimits(apiBaseUrl, deviceName, limits);
      } finally {
        // Closed the instant the PATCH settles, which is before the corrective
        // re-read below: the read merge must not protect the one row that read
        // exists to resync.
        endWrite(writeClockRef.current, deviceName);
      }
      // Key presence, not truthiness: a retraction legitimately echoes null.
      // A response that omits the key entirely is not an answer, so fall back
      // to what we just sent rather than recording "inheriting".
      const echoed = Object.prototype.hasOwnProperty.call(blob, CONTROL_LIMITS_KEY)
        ? blob[CONTROL_LIMITS_KEY]
        : limits;
      // `settings` carries `echoed` explicitly so the two halves of the entry
      // cannot disagree: `isDisplayUnlocked` and `defaultWouldRestrict` read the
      // blob, `editorState` reads `limits`, and a blob missing the key would
      // otherwise report "inheriting" to one and "configured" to the other.
      setLimitsByDevice((prev) => ({
        ...(prev || {}),
        [deviceName]: {
          limits: normalizeControlLimits(echoed),
          settingsRead: true,
          settings: { ...blob, [CONTROL_LIMITS_KEY]: echoed },
        },
      }));
      if (onDisplayLimitsSaved) onDisplayLimitsSaved(deviceName, blob);
      return true;
    } catch (error) {
      console.error(`Error saving control limits for display ${deviceName}:`, error);
      setErrorScopes((prev) => withScope(prev, deviceName));
      await loadLimits();
      return false;
    } finally {
      setBusyScopes((prev) => withoutScope(prev, deviceName));
    }
  }, [apiBaseUrl, loadLimits, onDisplayLimitsSaved]);

  const writeHouseholdDefault = useCallback(async (limits) => {
    setBusyScopes((prev) => withScope(prev, HOUSEHOLD_SCOPE));
    setErrorScopes((prev) => withoutScope(prev, HOUSEHOLD_SCOPE));
    try {
      const written = await saveHouseholdDefaultLimits(apiBaseUrl, limits);
      if (onHouseholdDefaultSaved) onHouseholdDefaultSaved(written);
      return true;
    } catch (error) {
      console.error('Error saving the household control-limits default:', error);
      // No re-read: the household default is only folded into state on success,
      // so a failure leaves nothing to diverge.
      setErrorScopes((prev) => withScope(prev, HOUSEHOLD_SCOPE));
      return false;
    } finally {
      setBusyScopes((prev) => withoutScope(prev, HOUSEHOLD_SCOPE));
    }
  }, [apiBaseUrl, onHouseholdDefaultSaved]);

  // The display the admin is holding, and whether we actually read it. Every
  // decision about that display is gated on the second, never on the first
  // being merely present.
  const currentEntry = currentDeviceName ? limitsByDevice?.[currentDeviceName] : undefined;
  const currentReadable = currentEntry?.settingsRead === true;

  /**
   * Ask before a household-default change takes controls away from the display
   * the admin is holding. `defaultWouldRestrict` is the whole decision: a
   * display with its own configuration, or an exempt one, is unaffected.
   *
   * Gated on `settingsRead`, not on the entry existing. A failed read stores
   * `settings: null` precisely so it is distinguishable from "reached, stores
   * nothing" — and `defaultWouldRestrict(null)` reports "inherits, will be
   * restricted", which opened the dialog whose "Keep full control here" then
   * PATCHes `{showAll, except: []}` over a configuration we never managed to
   * read. Unknown is not a licence to overwrite, so an unreadable current
   * display gets the household write it asked for and a notice saying we could
   * not check it, rather than a dialog offering to overwrite it.
   */
  const requestHouseholdDefault = useCallback((nextDefault) => {
    const shouldAsk = currentReadable && defaultWouldRestrict({
      deviceSettings: currentEntry.settings,
      nextDefault,
      pinExists,
    });
    if (shouldAsk) {
      setDefaultStatus(null);
      setPendingDefault(nextDefault);
      return;
    }
    void writeHouseholdDefault(nextDefault);
  }, [currentEntry, currentReadable, pinExists, writeHouseholdDefault]);

  const closeDefaultDialog = useCallback(() => {
    setPendingDefault(null);
    setDefaultStatus(null);
  }, []);

  // Unset default edits as Full control: `householdDefaultLimits` returns null
  // when nothing is stored, and null through editorState would report
  // `inheriting` — there is nothing for the household to inherit from, and the
  // switches must work.
  const householdBase = householdDefault ?? CONTROL_PRESETS.fullControl;
  const householdEditor = editorState({ own: householdBase, knownControlIds });
  const householdBusy = busyScopes.has(HOUSEHOLD_SCOPE);
  // Locked until the displays have been read: `defaultWouldRestrict` cannot say
  // whether this change takes controls away from the screen in the admin's hands
  // until we know what that screen stores, and asking before then either prompts
  // for nothing or skips a prompt that was warranted. Locked while either
  // dialog is holding a household change too, so the two cannot be stacked.
  const householdLocked = householdBusy
    || pendingDefault !== null
    || pendingPreset?.scope === HOUSEHOLD_SCOPE
    || limitsByDevice === null;

  // Disabled options are still rendered because MUI takes the selected label
  // from its children: without them a "Custom" or unreadable row would hand
  // Select an out-of-range value and render blank.
  const renderPresetOptions = (perDisplay) => [
    ...(perDisplay
      ? [<MenuItem key="householdDefault" value="householdDefault">{t('admin:controls.presets.householdDefault')}</MenuItem>]
      : []),
    ...SELECTABLE_PRESETS.map((name) => (
      <MenuItem key={name} value={name}>{t(`admin:controls.presets.${name}`)}</MenuItem>
    )),
    // Custom is a state, not an action: it is what the select reads when the
    // switches do not match a preset. Selectable it would mean nothing.
    <MenuItem key="custom" value="custom" disabled>{t('admin:controls.presets.custom')}</MenuItem>,
    ...(perDisplay
      ? [<MenuItem key="unknown" value="unknown" disabled>{t('admin:controls.presets.unknown')}</MenuItem>]
      : []),
  ];

  const renderDisplayCard = (deviceName, index) => {
    const entry = limitsByDevice?.[deviceName] ?? { limits: null, settingsRead: false, settings: null };
    // Null, not an editorState, for a row we could not read. Every position,
    // preset and mode caption below is a claim about stored configuration, and
    // we have none — feeding it `inherited: householdDefault` drew the switches
    // as what the display WOULD inherit, which is a claim about a configuration
    // the read just failed to fetch.
    const state = entry.settingsRead
      ? editorState({ own: entry.limits, inherited: householdDefault, knownControlIds })
      : null;
    const isCurrent = deviceName === currentDeviceName;
    const busy = busyScopes.has(deviceName);
    // A confirmation holding a write for this row locks it too, so a second
    // choice cannot be queued behind the dialog.
    const locked = busy || pendingPreset?.scope === deviceName;
    // Gated on `settingsRead` as well as the module's answer. `settings: null` from
    // a failed read already reports "not unlocked", but an unreadable row must
    // keep its own treatment no matter what: the two claims are about different
    // things, and only one of them can be true of a row we could not read.
    const unlocked = entry.settingsRead && isDisplayUnlocked({ deviceSettings: entry.settings, pinExists });

    // Inheriting rows are read-only: editing a switch there would quietly give
    // the display its own configuration, which is not what clicking a switch
    // looks like it does.
    const editable = state !== null && !state.inheriting && !locked;
    const selectValue = state === null
      ? 'unknown'
      : (state.inheriting ? 'householdDefault' : state.preset);

    return (
      <Paper key={deviceName} variant="outlined" aria-busy={busy} sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{deviceName}</Typography>
          {isCurrent && <Chip size="small" color="primary" label={t('admin:devices.current')} />}
          <Chip
            size="small"
            color={state === null ? 'warning' : 'default'}
            label={state === null
              ? t('admin:controls.status.unreadable')
              : (state.inheriting
                ? t('admin:controls.status.inheriting')
                : t(`admin:controls.presets.${state.preset}`))}
          />
          {busy && <CircularProgress size={16} aria-label={t('admin:controls.saving')} />}
        </Box>

        {state === null && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>{t('admin:controls.unreadableHelp')}</Alert>
        )}

        {unlocked && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            {t('admin:controls.unlockedNotice', { action: t('admin:pin.forgetDevices') })}
          </Alert>
        )}

        {/* A live region that is always in the DOM, not an Alert that appears in
            one. Every switch here writes immediately and a failure is the only
            thing that tells the admin it did not take, so it has to be
            announced rather than merely drawn — and a message inserted into a
            region that was already there is announced far more reliably than
            one carried in by a freshly mounted role="alert".
            The Alert drops that role for exactly that reason: two overlapping
            live regions for one message is worse than one. */}
        <Box aria-live="polite">
          {errorScopes.has(deviceName) && (
            <Alert severity="error" role="presentation" sx={{ mb: 1.5 }}>
              {t('admin:controls.saveFailed')}
            </Alert>
          )}
        </Box>

        <FormControl fullWidth size="small" sx={{ maxWidth: 320 }}>
          {/* Indexed, not named: a device name may contain spaces, and a DOM id
              with a space breaks the aria-labelledby token list. */}
          <InputLabel id={`controls-preset-${index}`}>{t('admin:controls.presetLabel')}</InputLabel>
          <Select
            labelId={`controls-preset-${index}`}
            label={t('admin:controls.presetLabel')}
            value={selectValue}
            disabled={state === null || locked}
            onChange={(event) => {
              // Unreachable while the Select is disabled for an unreadable row,
              // but a row we could not read must never be written from here.
              if (state === null) return;
              const choice = event.target.value;
              // `householdDefault` retracts; a named preset replaces. Anything
              // else is one of the disabled, unselectable states.
              const next = choice === 'householdDefault' ? null : (CONTROL_PRESETS[choice] ?? undefined);
              if (next === undefined) return;
              // Every preset carries `except: []`, and retracting discards the
              // display's configuration outright, so either one applied over a
              // row whose controls were set individually throws that work away
              // — an arbitrary amount of it, in one click, with no undo. This
              // is the only write in the form that is not a single-switch
              // increment, so it is the only one that asks first.
              if (state.preset === 'custom' && !state.inheriting) {
                setPendingPreset({
                  scope: deviceName,
                  deviceName,
                  limits: next,
                  preset: choice,
                  count: countMovedSwitches(entry.limits, next, householdDefault),
                });
                return;
              }
              void writeDisplay(deviceName, next);
            }}
          >
            {renderPresetOptions(true)}
          </Select>
        </FormControl>

        {/* Nothing below this line is rendered for a row we could not read:
            switch positions, the inherit hint and the mode caption are all
            assertions about stored configuration. */}
        {state !== null && (
          <>
            {state.inheriting && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                {t('admin:controls.inheritingHelp')}
              </Typography>
            )}

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {t('admin:controls.switchHint')}
            </Typography>

            {/* The mode is the only thing distinguishing two configurations that
                look identical in the switches: "hideAll with everything switched on"
                and "showAll with nothing switched off" hide nothing today, and
                disagree about a control added tomorrow. Without this line the preset
                reads "Custom" for no visible reason. Worded as on/off to match the
                switches it sits under, rather than introducing hidden/shown as a
                second vocabulary for the same thing. */}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {t(state.mode === 'hideAll'
                ? 'admin:controls.futureDefaultOff'
                : 'admin:controls.futureDefaultOn')}
            </Typography>

            {groups.map((group) => (
              <ControlSwitchGroup
                key={group.key}
                title={group.title}
                titleId={`controls-group-${index}-${group.key}`}
                items={group.items}
                hiddenIds={state.hiddenIds}
                disabled={!editable}
                onToggle={(controlId, shown) => {
                  void writeDisplay(deviceName, toggleControl(entry.limits, controlId, !shown));
                }}
              />
            ))}
          </>
        )}
      </Paper>
    );
  };

  return (
    <Box sx={{ mt: 3, p: 3, border: '1px solid var(--card-border)', borderRadius: 2 }}>
      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>
        {t('admin:controls.heading')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('admin:controls.help')}
      </Typography>

      {/* Household default */}
      <Paper variant="outlined" aria-busy={householdBusy} sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {t('admin:controls.defaultHeading')}
          </Typography>
          {householdBusy && <CircularProgress size={16} aria-label={t('admin:controls.saving')} />}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {t('admin:controls.defaultHelp')}
        </Typography>

        {/* Said once, here, rather than inferred: with the current display
            unreadable we cannot tell whether a change here takes controls away
            from the screen in the admin's hands, and the honest move is to say
            so instead of guessing in either direction. */}
        {limitsByDevice !== null && currentDeviceName && !currentReadable && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>{t('admin:controls.currentUnknownHelp')}</Alert>
        )}

        <Box aria-live="polite">
          {errorScopes.has(HOUSEHOLD_SCOPE) && (
            <Alert severity="error" role="presentation" sx={{ mb: 1.5 }}>
              {t('admin:controls.saveFailed')}
            </Alert>
          )}
        </Box>

        <FormControl fullWidth size="small" sx={{ maxWidth: 320 }}>
          <InputLabel id="controls-preset-household">{t('admin:controls.presetLabel')}</InputLabel>
          <Select
            labelId="controls-preset-household"
            label={t('admin:controls.presetLabel')}
            value={householdEditor.preset}
            disabled={householdLocked}
            onChange={(event) => {
              const choice = event.target.value;
              const next = CONTROL_PRESETS[choice];
              if (!next) return;
              // Worse here than on one display: the default is inherited, so
              // the discarded exceptions go for every display following it.
              if (householdEditor.preset === 'custom') {
                setPendingPreset({
                  scope: HOUSEHOLD_SCOPE,
                  deviceName: null,
                  limits: next,
                  preset: choice,
                  count: countMovedSwitches(householdBase, next, undefined),
                });
                return;
              }
              requestHouseholdDefault(next);
            }}
          >
            {renderPresetOptions(false)}
          </Select>
        </FormControl>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {t('admin:controls.switchHint')}
        </Typography>

        {/* The mode is the only thing distinguishing two configurations that
            look identical in the switches: "hideAll with everything switched on"
            and "showAll with nothing switched off" hide nothing today, and
            disagree about a control added tomorrow. Without this line the preset
            reads "Custom" for no visible reason. Worded as on/off to match the
            switches it sits under, rather than introducing hidden/shown as a
            second vocabulary for the same thing. */}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {t(householdEditor.mode === 'hideAll'
            ? 'admin:controls.futureDefaultOff'
            : 'admin:controls.futureDefaultOn')}
        </Typography>

        {groups.map((group) => (
          <ControlSwitchGroup
            key={group.key}
            title={group.title}
            titleId={`controls-group-household-${group.key}`}
            items={group.items}
            hiddenIds={householdEditor.hiddenIds}
            disabled={householdLocked}
            onToggle={(controlId, shown) => {
              requestHouseholdDefault(toggleControl(householdBase, controlId, !shown));
            }}
          />
        ))}
      </Paper>

      {/* One card per display */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {t('admin:controls.displaysHeading')}
        </Typography>
        <Button size="small" onClick={() => { void loadLimits(); }} disabled={busyScopes.size > 0}>
          {t('common:actions.refresh')}
        </Button>
      </Box>

      <Box aria-live="polite">
        {loadFailed && (
          <Alert severity="error" role="presentation" sx={{ mb: 2 }}>
            {t('admin:controls.loadFailed')}
          </Alert>
        )}
      </Box>

      {limitsByDevice === null ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
          <CircularProgress size={18} aria-label={t('admin:controls.loading')} />
          <Typography variant="body2" color="text.secondary">{t('admin:controls.loading')}</Typography>
        </Box>
      ) : (
        <>
          {deviceNames.length === 0 && (
            <Typography variant="body2" color="text.secondary">{t('admin:controls.noDisplays')}</Typography>
          )}
          {deviceNames.map((name, index) => renderDisplayCard(name, index))}
        </>
      )}

      {/* Individually-set controls are about to be replaced wholesale. */}
      <Dialog open={pendingPreset !== null} onClose={() => setPendingPreset(null)}>
        <DialogTitle>{t('admin:controls.clearExceptions.title')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {pendingPreset && t(
              pendingPreset.scope === HOUSEHOLD_SCOPE
                ? 'admin:controls.clearExceptions.household'
                : 'admin:controls.clearExceptions.display',
              {
                count: pendingPreset.count,
                device: pendingPreset.deviceName,
                preset: t(`admin:controls.presets.${pendingPreset.preset}`),
              },
            )}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap' }}>
          <Button onClick={() => setPendingPreset(null)}>{t('common:actions.cancel')}</Button>
          <Button
            variant="contained"
            onClick={() => {
              const pending = pendingPreset;
              setPendingPreset(null);
              if (!pending) return;
              if (pending.scope === HOUSEHOLD_SCOPE) requestHouseholdDefault(pending.limits);
              else void writeDisplay(pending.deviceName, pending.limits);
            }}
          >
            {t('admin:controls.clearExceptions.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* The household change is held here until it actually lands. Clearing it
          before the write meant a failed "Keep full control here" threw the
          admin's household change away and reported the failure inside a display
          card that may be scrolled off screen — or, when that display was not in
          the device list at all, nowhere. */}
      <Dialog
        open={pendingDefault !== null}
        onClose={() => { if (defaultStatus !== 'writing') closeDefaultDialog(); }}
      >
        <DialogTitle>{t('admin:controls.confirm.title')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t('admin:controls.confirm.body', { device: currentDeviceName })}
          </Typography>
          <Box aria-live="polite">
            {defaultStatus === 'failed' && (
              <Alert severity="error" role="presentation" sx={{ mt: 1.5 }}>
                {t('admin:controls.confirm.failed')}
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap' }}>
          <Button disabled={defaultStatus === 'writing'} onClick={closeDefaultDialog}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            disabled={defaultStatus === 'writing'}
            onClick={async () => {
              const next = pendingDefault;
              setDefaultStatus('writing');
              // The default goes in second on purpose: if this display's own
              // "Full control" write fails, the default is left alone rather
              // than restricting the screen in the admin's hands. Either
              // failure keeps the dialog open with the request intact, so the
              // admin can retry or cancel instead of watching the household
              // switch snap back unexplained.
              const displaySaved = await writeDisplay(currentDeviceName, CONTROL_PRESETS.fullControl);
              const saved = displaySaved && await writeHouseholdDefault(next);
              if (saved) closeDefaultDialog();
              else setDefaultStatus('failed');
            }}
          >
            {t('admin:controls.confirm.keepFull')}
          </Button>
          <Button
            variant="contained"
            disabled={defaultStatus === 'writing'}
            onClick={async () => {
              const next = pendingDefault;
              setDefaultStatus('writing');
              const saved = await writeHouseholdDefault(next);
              if (saved) closeDefaultDialog();
              else setDefaultStatus('failed');
            }}
          >
            {t('admin:controls.confirm.applyHere')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ControlsOnDisplay;
