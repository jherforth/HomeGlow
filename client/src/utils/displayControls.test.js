import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ADMIN_PIN_REMEMBERED_KEY } from './adminPinDevice.js';
import {
  CORE_CONTROLS,
  CONTROL_PRESETS,
  CONTROL_LIMITS_KEY,
  CONTROL_LIMITS_DEFAULT_KEY,
  isValidControlId,
  normalizeControlLimits,
  householdDefaultLimits,
  isDisplayUnlocked,
  resolveHiddenControls,
  isControlHidden,
  isHiddenUnder,
  presetNameFor,
  toggleControl,
  editorState,
  defaultWouldRestrict,
} from './displayControls.js';

const CORE_IDS = CORE_CONTROLS.map((control) => control.id);
const CORE_IDS_SORTED = [...CORE_IDS].sort();
const remembered = { [ADMIN_PIN_REMEMBERED_KEY]: true };

// A stored configuration for a display, as the device settings blob holds it.
const deviceWith = (limits) => ({ [CONTROL_LIMITS_KEY]: limits });
// The household default, as GET /api/settings hands it back once deserialized.
const householdWith = (limits) => ({ [CONTROL_LIMITS_DEFAULT_KEY]: limits });

describe('constants', () => {
  it('ships the documented core catalog with i18n label keys', () => {
    expect(CORE_IDS).toEqual([
      'core:addChore',
      'core:transferChore',
      'core:snoozeChore',
      'core:prizeApproval',
      'core:quickSpend',
    ]);
    for (const control of CORE_CONTROLS) {
      expect(control.labelKey).toMatch(/^admin:controls\.items\.[a-z][a-zA-Z0-9]*$/);
      expect(isValidControlId(control.id)).toBe(true);
    }
  });

  it('ships both presets inert', () => {
    // The feature must do nothing until an admin opts a display in.
    expect(CONTROL_PRESETS.fullControl).toEqual({ mode: 'showAll', except: [] });
    expect(CONTROL_PRESETS.wallDisplay).toEqual({ mode: 'hideAll', except: [] });
    expect(CONTROL_LIMITS_KEY).toBe('controlLimits');
    expect(CONTROL_LIMITS_DEFAULT_KEY).toBe('DISPLAY_CONTROL_LIMITS_DEFAULT');
  });
});

describe('isValidControlId', () => {
  it('accepts core and plugin ids', () => {
    expect(isValidControlId('core:addChore')).toBe(true);
    expect(isValidControlId('core:a')).toBe(true);
    expect(isValidControlId('plugin:tasty-tiles:openEditor')).toBe(true);
    expect(isValidControlId('plugin:polls2:vote')).toBe(true);
  });

  it('rejects everything else', () => {
    for (const id of [
      'addChore', 'core:', 'core:AddChore', 'core:add_chore', 'core:add-chore',
      'core:addChore:extra', 'plugin:addChore', 'plugin::vote',
      'plugin:Tasty:vote', 'plugin:tasty tiles:vote', 'plugin:tasty:',
      'widget:addChore', '', '   ', 'core:addChore ',
      null, undefined, 5, {}, ['core:addChore'], true,
    ]) {
      expect(isValidControlId(id)).toBe(false);
    }
  });
});

describe('normalizeControlLimits', () => {
  it('accepts an object', () => {
    expect(normalizeControlLimits({ mode: 'hideAll', except: ['core:addChore'] }))
      .toEqual({ mode: 'hideAll', except: ['core:addChore'] });
  });

  it('accepts the JSON string form the settings table stores', () => {
    // Settings values are a TEXT column, so the household default arrives as a
    // string whenever it has not been deserialized for us.
    expect(normalizeControlLimits('{"mode":"showAll","except":["core:quickSpend"]}'))
      .toEqual({ mode: 'showAll', except: ['core:quickSpend'] });
  });

  it('drops invalid ids and dedupes into a stable order', () => {
    expect(normalizeControlLimits({
      mode: 'showAll',
      except: ['core:quickSpend', 'bogus', 'core:addChore', 'core:quickSpend', 42, null],
    })).toEqual({ mode: 'showAll', except: ['core:addChore', 'core:quickSpend'] });
  });

  it('orders two equivalent configurations identically', () => {
    const a = normalizeControlLimits({ mode: 'showAll', except: ['core:quickSpend', 'core:addChore'] });
    const b = normalizeControlLimits({ mode: 'showAll', except: ['core:addChore', 'core:quickSpend'] });
    expect(a).toEqual(b);
  });

  // Behavior 8.
  it('distinguishes nothing-stored (null) from explicitly-configured', () => {
    // Both hide nothing today. Only the first follows the household default
    // when that default changes tomorrow, so the two must not collapse.
    expect(normalizeControlLimits(undefined)).toBeNull();
    expect(normalizeControlLimits(null)).toBeNull();
    expect(normalizeControlLimits({ mode: 'showAll', except: [] }))
      .toEqual({ mode: 'showAll', except: [] });
  });

  // Behavior 6.
  it('returns null for every unreadable shape', () => {
    for (const raw of [
      '', 'not json', '{"mode":', '[]', '"showAll"', 'null', '5',
      [], 5, true, () => {}, {},
      { except: ['core:addChore'] },
      { mode: 'hideSome', except: [] },
      { mode: 'showall', except: [] },
      { mode: true },
      { mode: ['hideAll'] },
    ]) {
      expect(normalizeControlLimits(raw)).toBeNull();
    }
  });

  it('survives an except that is not an array', () => {
    // mode is still readable, so the configuration stands with no exceptions.
    expect(normalizeControlLimits({ mode: 'hideAll', except: 'core:addChore' }))
      .toEqual({ mode: 'hideAll', except: [] });
    expect(normalizeControlLimits({ mode: 'hideAll' }))
      .toEqual({ mode: 'hideAll', except: [] });
  });

  it('never hands back the caller\'s array', () => {
    const except = ['core:addChore'];
    const normalized = normalizeControlLimits({ mode: 'showAll', except });
    normalized.except.push('core:quickSpend');
    expect(except).toEqual(['core:addChore']);
  });
});


describe('isDisplayUnlocked', () => {
  it('unlocks a remembered display while a PIN exists', () => {
    expect(isDisplayUnlocked({ deviceSettings: remembered, pinExists: true })).toBe(true);
  });

  // Behavior 1.
  it('does not unlock once the household PIN is gone', () => {
    // Removing the PIN leaves adminPinRemembered behind on every device it was
    // set on. Honoring it then would exempt every display at once and disable
    // the whole feature household-wide.
    expect(isDisplayUnlocked({ deviceSettings: remembered, pinExists: false })).toBe(false);
  });

  // Behavior 2.
  it('unlocks while the PIN status is still unknown', () => {
    // Controls must not render, vanish, then reappear when the check lands.
    expect(isDisplayUnlocked({ deviceSettings: remembered })).toBe(true);
    expect(isDisplayUnlocked({ deviceSettings: remembered, pinExists: undefined })).toBe(true);
    expect(isDisplayUnlocked({ deviceSettings: remembered, pinExists: null })).toBe(true);
  });

  // Behavior 3.
  it('accepts only a literal true as remembered', () => {
    for (const value of ['true', 1, 'yes', {}, [], 'TRUE']) {
      expect(isDisplayUnlocked({
        deviceSettings: { [ADMIN_PIN_REMEMBERED_KEY]: value },
        pinExists: true,
      })).toBe(false);
    }
  });

  it('does not unlock a display that never remembered the PIN', () => {
    expect(isDisplayUnlocked({ deviceSettings: {}, pinExists: true })).toBe(false);
    expect(isDisplayUnlocked({ pinExists: true })).toBe(false);
    expect(isDisplayUnlocked()).toBe(false);
  });
});

describe('resolveHiddenControls', () => {
  it('hides the listed controls under showAll', () => {
    expect(resolveHiddenControls({
      deviceSettings: deviceWith({ mode: 'showAll', except: ['core:addChore'] }),
      knownControlIds: CORE_IDS,
    })).toEqual(['core:addChore']);
  });

  it('hides everything but the exceptions under hideAll', () => {
    expect(resolveHiddenControls({
      deviceSettings: deviceWith({ mode: 'hideAll', except: ['core:quickSpend'] }),
      knownControlIds: CORE_IDS,
    })).toEqual([...CORE_IDS].filter((id) => id !== 'core:quickSpend').sort());
  });

  // Behavior 10.
  it('hides a control the build has never seen under hideAll', () => {
    // The point of mode-over-snapshot: a plugin installed later is hidden on a
    // wall display without anyone revisiting that display's settings.
    const hidden = resolveHiddenControls({
      deviceSettings: deviceWith(CONTROL_PRESETS.wallDisplay),
      knownControlIds: [...CORE_IDS, 'plugin:installed-later:openEditor'],
    });
    expect(hidden).toContain('plugin:installed-later:openEditor');
    for (const id of CORE_IDS) expect(hidden).toContain(id);
  });

  // Behavior 10.
  it('does not drop a configured id merely for being unknown', () => {
    // A plugin whose manifest has not loaded yet is absent from the catalog;
    // its control still has to stay hidden.
    expect(resolveHiddenControls({
      deviceSettings: deviceWith({ mode: 'showAll', except: ['plugin:not-loaded-yet:vote'] }),
      knownControlIds: CORE_IDS,
    })).toEqual(['plugin:not-loaded-yet:vote']);
  });

  it('still hides the core catalog under hideAll with no catalog supplied', () => {
    expect(resolveHiddenControls({
      deviceSettings: deviceWith(CONTROL_PRESETS.wallDisplay),
    })).toEqual([...CORE_IDS].sort());
  });

  it('inherits the household default when the display stores nothing', () => {
    const household = householdWith('{"mode":"hideAll","except":[]}');
    expect(resolveHiddenControls({
      deviceSettings: {},
      householdSettings: household,
      knownControlIds: CORE_IDS,
    })).toEqual([...CORE_IDS].sort());
    // A literal null is how PATCH retracts the key, so it must inherit too.
    expect(resolveHiddenControls({
      deviceSettings: deviceWith(null),
      householdSettings: household,
      knownControlIds: CORE_IDS,
    })).toEqual([...CORE_IDS].sort());
  });

  it('lets an own configuration win over the household default', () => {
    expect(resolveHiddenControls({
      deviceSettings: deviceWith(CONTROL_PRESETS.fullControl),
      householdSettings: householdWith(CONTROL_PRESETS.wallDisplay),
      knownControlIds: CORE_IDS,
    })).toEqual([]);
  });

  // Behavior 1.
  it('applies limits to a remembered display once the PIN is gone', () => {
    expect(resolveHiddenControls({
      deviceSettings: { ...remembered, ...deviceWith(CONTROL_PRESETS.wallDisplay) },
      pinExists: false,
      knownControlIds: CORE_IDS,
    })).toEqual([...CORE_IDS].sort());
  });

  // Behaviors 2 and 3.
  it('exempts an unlocked display entirely', () => {
    const deviceSettings = { ...remembered, ...deviceWith(CONTROL_PRESETS.wallDisplay) };
    expect(resolveHiddenControls({ deviceSettings, pinExists: true, knownControlIds: CORE_IDS }))
      .toEqual([]);
    expect(resolveHiddenControls({ deviceSettings, knownControlIds: CORE_IDS }))
      .toEqual([]);
    expect(resolveHiddenControls({
      deviceSettings: { [ADMIN_PIN_REMEMBERED_KEY]: 'true', ...deviceWith(CONTROL_PRESETS.wallDisplay) },
      pinExists: true,
      knownControlIds: CORE_IDS,
    })).toEqual([...CORE_IDS].sort());
  });

  // Behavior 6.
  it('hides nothing on every failure path', () => {
    // Unreadable settings must never strip a parent's buttons; there is no
    // security claim here that failing closed would protect.
    const cases = [
      {},
      { deviceSettings: undefined, householdSettings: undefined },
      { deviceSettings: 'not an object', householdSettings: 42 },
      { deviceSettings: deviceWith('{"mode":'), householdSettings: householdWith('garbage') },
      { deviceSettings: deviceWith({ mode: 'hideEverything' }) },
      { deviceSettings: deviceWith([]), householdSettings: householdWith([]) },
      { deviceSettings: {}, householdSettings: householdWith(undefined) },
    ];
    for (const input of cases) {
      expect(resolveHiddenControls({ ...input, knownControlIds: CORE_IDS })).toEqual([]);
    }
    expect(resolveHiddenControls()).toEqual([]);
  });

  it('ignores junk in the supplied catalog', () => {
    expect(resolveHiddenControls({
      deviceSettings: deviceWith(CONTROL_PRESETS.wallDisplay),
      knownControlIds: ['not-an-id', null, 'core:addChore', 'core:addChore'],
    })).toEqual([...CORE_IDS].sort());
  });
});

describe('householdDefaultLimits', () => {
  it('reports an unset default as null, not as an empty configuration', () => {
    // null means "no household policy", which a display inherits as hide-nothing.
    // {showAll, except: []} is a deliberate choice with the same effect today, and
    // collapsing the two would make an unset household look configured.
    expect(householdDefaultLimits({})).toBe(null);
    expect(householdDefaultLimits(undefined)).toBe(null);
  });

  it('reads the household key and normalizes what it finds', () => {
    expect(householdDefaultLimits({
      [CONTROL_LIMITS_DEFAULT_KEY]: { mode: 'hideAll', except: ['core:addChore', 'bogus'] },
    })).toEqual({ mode: 'hideAll', except: ['core:addChore'] });
  });

  it('accepts the JSON string the settings table round-trips', () => {
    expect(householdDefaultLimits({
      [CONTROL_LIMITS_DEFAULT_KEY]: '{"mode":"hideAll","except":[]}',
    })).toEqual({ mode: 'hideAll', except: [] });
  });
});

describe('isControlHidden', () => {
  it('answers membership', () => {
    expect(isControlHidden(['core:addChore'], 'core:addChore')).toBe(true);
    expect(isControlHidden(['core:addChore'], 'core:quickSpend')).toBe(false);
  });

  it('says "not hidden" when handed nothing usable', () => {
    expect(isControlHidden(undefined, 'core:addChore')).toBe(false);
    expect(isControlHidden(null, 'core:addChore')).toBe(false);
    expect(isControlHidden([], 'core:addChore')).toBe(false);
    expect(isControlHidden(['core:addChore'], undefined)).toBe(false);
  });
});

describe('isHiddenUnder', () => {
  it('reads except as the hidden list under showAll', () => {
    const limits = { mode: 'showAll', except: ['core:addChore'] };
    expect(isHiddenUnder(limits, 'core:addChore')).toBe(true);
    expect(isHiddenUnder(limits, 'core:quickSpend')).toBe(false);
  });

  it('reads except as the VISIBLE list under hideAll', () => {
    // The inversion lives here and nowhere else, so it is pinned here.
    const limits = { mode: 'hideAll', except: ['core:addChore'] };
    expect(isHiddenUnder(limits, 'core:addChore')).toBe(false);
    expect(isHiddenUnder(limits, 'core:quickSpend')).toBe(true);
  });

  // Behavior 10.
  it('hides a control it has never heard of under hideAll', () => {
    expect(isHiddenUnder(CONTROL_PRESETS.wallDisplay, 'plugin:installed-later:openEditor'))
      .toBe(true);
    expect(isHiddenUnder(CONTROL_PRESETS.fullControl, 'plugin:installed-later:openEditor'))
      .toBe(false);
  });

  it('accepts the JSON string form', () => {
    expect(isHiddenUnder('{"mode":"hideAll","except":[]}', 'core:addChore')).toBe(true);
  });

  // Behavior 6.
  it('hides nothing when nothing is readable', () => {
    for (const limits of [null, undefined, 'garbage', '{"mode":', {}, { mode: 'nope' }, []]) {
      expect(isHiddenUnder(limits, 'core:addChore')).toBe(false);
    }
  });

  it('never reports a malformed id as hidden, even under hideAll', () => {
    // It cannot name a real control, so claiming it is hidden only misleads.
    for (const id of ['bogus', '', 'core:Add', undefined, null, 5]) {
      expect(isHiddenUnder(CONTROL_PRESETS.wallDisplay, id)).toBe(false);
    }
  });

  it('agrees with resolveHiddenControls, which is the contract', () => {
    const ids = [...CORE_IDS, 'plugin:later:openEditor'];
    for (const limits of [
      CONTROL_PRESETS.fullControl,
      CONTROL_PRESETS.wallDisplay,
      { mode: 'showAll', except: ['core:addChore', 'plugin:later:openEditor'] },
      { mode: 'hideAll', except: ['core:quickSpend'] },
    ]) {
      const hidden = resolveHiddenControls({
        deviceSettings: deviceWith(limits),
        knownControlIds: ids,
      });
      for (const id of ids) {
        expect(isControlHidden(hidden, id)).toBe(isHiddenUnder(limits, id));
      }
    }
  });
});

describe('presetNameFor', () => {
  it('names the two presets', () => {
    expect(presetNameFor(CONTROL_PRESETS.fullControl)).toBe('fullControl');
    expect(presetNameFor(CONTROL_PRESETS.wallDisplay)).toBe('wallDisplay');
    expect(presetNameFor('{"mode":"hideAll","except":[]}')).toBe('wallDisplay');
  });

  // Behavior 7.
  it('reads mode and except, never a length against the catalog', () => {
    // A length comparison shipped once and reported "Wall display" for any
    // configuration that happened to name five controls, because
    // CORE_CONTROLS has five entries.
    const fivePluginIds = [
      'plugin:a:one', 'plugin:b:two', 'plugin:c:three', 'plugin:d:four', 'plugin:e:five',
    ];
    expect(CORE_CONTROLS).toHaveLength(fivePluginIds.length);
    expect(presetNameFor({ mode: 'showAll', except: fivePluginIds })).toBe('custom');
    expect(presetNameFor({ mode: 'showAll', except: CORE_IDS })).toBe('custom');
    expect(presetNameFor({ mode: 'hideAll', except: CORE_IDS })).toBe('custom');
  });

  it('calls a single hidden control custom', () => {
    expect(presetNameFor({ mode: 'showAll', except: ['core:addChore'] })).toBe('custom');
    expect(presetNameFor({ mode: 'hideAll', except: ['core:addChore'] })).toBe('custom');
  });

  it('treats nothing-stored as fullControl so the radio group has a selection', () => {
    expect(presetNameFor(null)).toBe('fullControl');
    expect(presetNameFor(undefined)).toBe('fullControl');
    expect(presetNameFor('garbage')).toBe('fullControl');
  });

  it('ignores invalid ids when deciding, since they are dropped on read', () => {
    expect(presetNameFor({ mode: 'hideAll', except: ['nonsense'] })).toBe('wallDisplay');
  });
});

describe('toggleControl', () => {
  // Behavior 9.
  it('never mutates its input', () => {
    const limits = { mode: 'showAll', except: ['core:addChore'] };
    const frozen = Object.freeze({ mode: 'hideAll', except: Object.freeze(['core:quickSpend']) });
    const next = toggleControl(limits, 'core:quickSpend', true);
    expect(limits).toEqual({ mode: 'showAll', except: ['core:addChore'] });
    expect(next).not.toBe(limits);
    expect(next.except).not.toBe(limits.except);
    expect(() => toggleControl(frozen, 'core:addChore', true)).not.toThrow();
    expect(frozen.except).toEqual(['core:quickSpend']);
    // The shared presets are a frequent starting point and must survive it.
    toggleControl(CONTROL_PRESETS.fullControl, 'core:addChore', true);
    expect(CONTROL_PRESETS.fullControl).toEqual({ mode: 'showAll', except: [] });
  });

  // Behavior 9.
  it('returns a stable order so equivalent configurations compare equal', () => {
    const clickedOneWay = toggleControl(
      toggleControl(CONTROL_PRESETS.fullControl, 'core:quickSpend', true),
      'core:addChore', true,
    );
    const clickedTheOther = toggleControl(
      toggleControl(CONTROL_PRESETS.fullControl, 'core:addChore', true),
      'core:quickSpend', true,
    );
    expect(clickedOneWay).toEqual(clickedTheOther);
    expect(clickedOneWay.except).toEqual(['core:addChore', 'core:quickSpend']);
    // And it keeps reading as Custom rather than flipping to a preset name.
    expect(presetNameFor(clickedOneWay)).toBe('custom');
  });

  it('adds to except when hiding under showAll, removes when showing', () => {
    const hidden = toggleControl({ mode: 'showAll', except: [] }, 'core:addChore', true);
    expect(hidden).toEqual({ mode: 'showAll', except: ['core:addChore'] });
    expect(toggleControl(hidden, 'core:addChore', false))
      .toEqual({ mode: 'showAll', except: [] });
  });

  it('inverts under hideAll, where except lists what stays visible', () => {
    const shown = toggleControl({ mode: 'hideAll', except: [] }, 'core:addChore', false);
    expect(shown).toEqual({ mode: 'hideAll', except: ['core:addChore'] });
    expect(toggleControl(shown, 'core:addChore', true))
      .toEqual({ mode: 'hideAll', except: [] });
  });

  it('agrees with resolveHiddenControls in both modes', () => {
    // The inversion is the bug-prone half, so pin the round trip.
    for (const mode of ['showAll', 'hideAll']) {
      const limits = toggleControl({ mode, except: [] }, 'core:addChore', true);
      expect(resolveHiddenControls({
        deviceSettings: deviceWith(limits),
        knownControlIds: CORE_IDS,
      })).toContain('core:addChore');

      const shown = toggleControl({ mode, except: [] }, 'core:addChore', false);
      expect(resolveHiddenControls({
        deviceSettings: deviceWith(shown),
        knownControlIds: CORE_IDS,
      })).not.toContain('core:addChore');
    }
  });

  it('is idempotent', () => {
    const once = toggleControl({ mode: 'showAll', except: [] }, 'core:addChore', true);
    expect(toggleControl(once, 'core:addChore', true)).toEqual(once);
  });

  it('only hides on a literal true', () => {
    expect(toggleControl({ mode: 'showAll', except: [] }, 'core:addChore', 'true'))
      .toEqual({ mode: 'showAll', except: [] });
  });

  it('ignores an invalid id instead of storing it', () => {
    // A malformed id would sit in except forever, matching nothing.
    expect(toggleControl({ mode: 'showAll', except: ['core:addChore'] }, 'bogus', true))
      .toEqual({ mode: 'showAll', except: ['core:addChore'] });
  });

  it('starts from fullControl when nothing is stored', () => {
    expect(toggleControl(null, 'core:addChore', true))
      .toEqual({ mode: 'showAll', except: ['core:addChore'] });
    expect(toggleControl('garbage', 'core:addChore', true))
      .toEqual({ mode: 'showAll', except: ['core:addChore'] });
  });
});

describe('editorState', () => {
  // Behavior 4.
  it('cannot see the device blob or the PIN, though it may see the catalog', () => {
    // An earlier version reported the in-force answer, so an unlocked display
    // (exempt, hides nothing) drew a form with every toggle off while the
    // writes were landing correctly. The signature is the fix.
    // Structural, not behavioral: the function body must not so much as name
    // the device blob or the PIN, so it cannot grow a dependency on them.
    // Structural, not behavioral: the body must not so much as name the device
    // blob or the PIN, so it cannot grow a dependency on in-force state. A
    // catalog of known ids is not in-force state and is deliberately allowed.
    expect(editorState.toString()).not.toMatch(/deviceSettings|pinExists|adminPinRemembered|isDisplayUnlocked/);
    expect(editorState.toString()).toMatch(/knownControlIds/);
    const withNoise = editorState({
      own: CONTROL_PRESETS.wallDisplay,
      inherited: CONTROL_PRESETS.fullControl,
      deviceSettings: { ...remembered, ...deviceWith(CONTROL_PRESETS.fullControl) },
      pinExists: true,
      knownControlIds: CORE_IDS,
    });
    expect(withNoise).toEqual(editorState({
      own: CONTROL_PRESETS.wallDisplay,
      inherited: CONTROL_PRESETS.fullControl,
      knownControlIds: CORE_IDS,
    }));
    // Configured as a wall display, so that is what the form draws, even though
    // an unlocked display hides nothing in force.
    expect(withNoise.preset).toBe('wallDisplay');
    expect(withNoise.mode).toBe('hideAll');
    expect(withNoise.hiddenIds).toEqual(CORE_IDS_SORTED);
  });

  // Behavior 4.
  it('draws the configured state even where it is not in force', () => {
    const state = editorState({ own: { mode: 'showAll', except: ['core:addChore'] } });
    expect(state).toEqual({
      inheriting: false,
      mode: 'showAll',
      hiddenIds: ['core:addChore'],
      preset: 'custom',
    });
  });

  // Behavior 5.
  it('shows what an inheriting display would inherit, flagged read-only', () => {
    const state = editorState({ own: null, inherited: CONTROL_PRESETS.wallDisplay });
    expect(state.inheriting).toBe(true);
    expect(state.mode).toBe('hideAll');
    expect(state.preset).toBe('wallDisplay');
    expect(state.hiddenIds).toEqual(CORE_IDS_SORTED);
  });

  // Behavior 5.
  it('is not inheriting as soon as the display stores its own configuration', () => {
    expect(editorState({
      own: CONTROL_PRESETS.fullControl,
      inherited: CONTROL_PRESETS.wallDisplay,
    })).toEqual({
      inheriting: true === false, mode: 'showAll', hiddenIds: [], preset: 'fullControl',
    });
  });

  // Behavior 8.
  it('separates nothing-stored from an explicit fullControl', () => {
    // Identical in force, different tomorrow: only the inheriting one follows
    // a household default that changes.
    const inheriting = editorState({ own: null, inherited: CONTROL_PRESETS.fullControl });
    const configured = editorState({ own: CONTROL_PRESETS.fullControl, inherited: CONTROL_PRESETS.fullControl });
    expect(inheriting.inheriting).toBe(true);
    expect(configured.inheriting).toBe(false);
    expect(inheriting.hiddenIds).toEqual(configured.hiddenIds);
  });

  // Behavior 6.
  it('falls back to fullControl when nothing anywhere is readable', () => {
    for (const input of [undefined, {}, { own: 'garbage', inherited: '{"mode":' }, { own: [], inherited: 7 }]) {
      expect(editorState(input)).toEqual({
        inheriting: true, mode: 'showAll', hiddenIds: [], preset: 'fullControl',
      });
    }
  });

  it('names plugin controls in hiddenIds when given the catalog', () => {
    // The whole reason the catalog is a parameter: without it hiddenIds could
    // not describe a plugin row at all, and every caller would have to
    // re-derive the mode/except inversion by hand.
    const knownControlIds = [...CORE_IDS, 'plugin:polls:editPoll', 'plugin:polls:deletePoll'];
    const wall = editorState({ own: CONTROL_PRESETS.wallDisplay, knownControlIds });
    expect(wall.hiddenIds).toContain('plugin:polls:editPoll');
    expect(wall.hiddenIds).toContain('plugin:polls:deletePoll');
    expect(wall.hiddenIds).toEqual([...knownControlIds].sort());

    const oneShown = editorState({
      own: { mode: 'hideAll', except: ['plugin:polls:editPoll'] },
      knownControlIds,
    });
    expect(oneShown.hiddenIds).not.toContain('plugin:polls:editPoll');
    expect(oneShown.hiddenIds).toContain('plugin:polls:deletePoll');
    expect(oneShown.preset).toBe('custom');
  });

  it('keeps a configured id that the catalog does not mention', () => {
    // A plugin whose manifest has not loaded yet must still draw as hidden.
    expect(editorState({
      own: { mode: 'showAll', except: ['plugin:not-loaded-yet:vote'] },
      knownControlIds: CORE_IDS,
    }).hiddenIds).toEqual(['plugin:not-loaded-yet:vote']);
  });

  it('still covers the core catalog with no catalog supplied', () => {
    expect(editorState({ own: CONTROL_PRESETS.wallDisplay }).hiddenIds)
      .toEqual(CORE_IDS_SORTED);
  });

  it('describes the configured state, which resolve then gates', () => {
    // Same configuration, same ids: the only difference between the two is the
    // unlock gate, which editorState must not have.
    const knownControlIds = [...CORE_IDS, 'plugin:polls:editPoll'];
    const own = { mode: 'hideAll', except: ['core:addChore'] };
    expect(editorState({ own, knownControlIds }).hiddenIds).toEqual(
      resolveHiddenControls({ deviceSettings: deviceWith(own), knownControlIds }),
    );
  });

  it('accepts the JSON string form for the inherited value', () => {
    expect(editorState({ own: null, inherited: '{"mode":"hideAll","except":["core:addChore"]}' }))
      .toEqual({
        inheriting: true,
        mode: 'hideAll',
        hiddenIds: CORE_IDS_SORTED.filter((id) => id !== 'core:addChore'),
        preset: 'custom',
      });
  });
});

describe('defaultWouldRestrict', () => {
  it('warns for an inheriting display when the next default hides something', () => {
    expect(defaultWouldRestrict({
      deviceSettings: {},
      nextDefault: CONTROL_PRESETS.wallDisplay,
    })).toBe(true);
    expect(defaultWouldRestrict({
      deviceSettings: deviceWith(null),
      nextDefault: { mode: 'showAll', except: ['core:addChore'] },
    })).toBe(true);
  });

  it('does not warn when the next default hides nothing', () => {
    expect(defaultWouldRestrict({
      deviceSettings: {},
      nextDefault: CONTROL_PRESETS.fullControl,
    })).toBe(false);
  });

  it('counts hideAll as restricting even when every known control is excepted', () => {
    // It still covers the plugin installed tomorrow.
    expect(defaultWouldRestrict({
      deviceSettings: {},
      nextDefault: { mode: 'hideAll', except: CORE_IDS },
    })).toBe(true);
  });

  it('does not warn about a display that has its own configuration', () => {
    expect(defaultWouldRestrict({
      deviceSettings: deviceWith(CONTROL_PRESETS.fullControl),
      nextDefault: CONTROL_PRESETS.wallDisplay,
    })).toBe(false);
  });

  // Behaviors 1, 2 and 3.
  it('follows the unlock rules', () => {
    const deviceSettings = { ...remembered };
    expect(defaultWouldRestrict({ deviceSettings, nextDefault: CONTROL_PRESETS.wallDisplay, pinExists: true }))
      .toBe(false);
    expect(defaultWouldRestrict({ deviceSettings, nextDefault: CONTROL_PRESETS.wallDisplay }))
      .toBe(false);
    // Stale flag with no PIN left: this display would be restricted after all.
    expect(defaultWouldRestrict({ deviceSettings, nextDefault: CONTROL_PRESETS.wallDisplay, pinExists: false }))
      .toBe(true);
    expect(defaultWouldRestrict({
      deviceSettings: { [ADMIN_PIN_REMEMBERED_KEY]: 'true' },
      nextDefault: CONTROL_PRESETS.wallDisplay,
      pinExists: true,
    })).toBe(true);
  });

  // Behavior 6.
  it('never warns about an unreadable next default', () => {
    for (const nextDefault of [undefined, null, 'garbage', '{"mode":', {}, { mode: 'nope' }, []]) {
      expect(defaultWouldRestrict({ deviceSettings: {}, nextDefault })).toBe(false);
    }
    expect(defaultWouldRestrict()).toBe(false);
  });
});

describe('axios helpers', () => {
  const API = 'http://localhost:5000';
  let axiosMock;
  let displayControls;

  beforeEach(async () => {
    axiosMock = {
      get: vi.fn(),
      patch: vi.fn().mockResolvedValue({ data: {} }),
      post: vi.fn().mockResolvedValue({ data: { success: true } }),
    };
    vi.resetModules();
    vi.doMock('axios', () => ({ default: axiosMock }));
    displayControls = await import('./displayControls.js');
  });

  afterEach(() => {
    vi.doUnmock('axios');
    vi.resetModules();
  });

  describe('saveDisplayLimits', () => {
    it('PATCHes the device settings route with the limits under controlLimits', async () => {
      const limits = { mode: 'hideAll', except: ['core:addChore'] };
      await displayControls.saveDisplayLimits(API, 'Kitchen Display', limits);
      expect(axiosMock.patch).toHaveBeenCalledTimes(1);
      expect(axiosMock.patch).toHaveBeenCalledWith(
        `${API}/api/devices/Kitchen%20Display/settings`,
        { controlLimits: limits },
      );
    });

    it('sends a literal null to retract', async () => {
      // PATCH merges, so null is the only retraction — there is no delete route.
      await displayControls.saveDisplayLimits(API, 'kiosk', null);
      const [, payload] = axiosMock.patch.mock.calls[0];
      expect(payload).toEqual({ controlLimits: null });
      expect(payload.controlLimits).toBeNull();
      expect('controlLimits' in payload).toBe(true);
    });

    it('encodes a device name with URL-hostile characters', async () => {
      await displayControls.saveDisplayLimits(API, 'Ram\'s iPad/2?', null);
      expect(axiosMock.patch.mock.calls[0][0])
        .toBe(`${API}/api/devices/Ram's%20iPad%2F2%3F/settings`);
    });

    it('returns the merged blob the route echoes back', async () => {
      // So a caller never has to re-read to learn what the display now stores.
      const merged = { controlLimits: { mode: 'hideAll', except: [] }, adminPinRemembered: true };
      axiosMock.patch.mockResolvedValue({ data: merged });
      await expect(displayControls.saveDisplayLimits(API, 'kiosk', CONTROL_PRESETS.wallDisplay))
        .resolves.toEqual(merged);
    });

    it('returns {} when the response carries no object', async () => {
      for (const data of [undefined, null, '', 'ok', []]) {
        axiosMock.patch.mockResolvedValue({ data });
        await expect(displayControls.saveDisplayLimits(API, 'kiosk', null)).resolves.toEqual({});
      }
    });

    it('propagates a failed write rather than reporting success', async () => {
      axiosMock.patch.mockRejectedValue(new Error('boom'));
      await expect(displayControls.saveDisplayLimits(API, 'kiosk', null)).rejects.toThrow('boom');
    });
  });

  describe('saveHouseholdDefaultLimits', () => {
    it('POSTs the key with a JSON STRING value', async () => {
      // Settings values are a TEXT column; better-sqlite3 cannot bind an object,
      // so an object here fails at the driver rather than at validation.
      await displayControls.saveHouseholdDefaultLimits(API, CONTROL_PRESETS.wallDisplay);
      expect(axiosMock.post).toHaveBeenCalledTimes(1);
      const [url, body] = axiosMock.post.mock.calls[0];
      expect(url).toBe(`${API}/api/settings`);
      expect(body.key).toBe(CONTROL_LIMITS_DEFAULT_KEY);
      expect(typeof body.value).toBe('string');
      expect(body.value).toBe('{"mode":"hideAll","except":[]}');
      expect(JSON.parse(body.value)).toEqual(CONTROL_PRESETS.wallDisplay);
    });

    it('still sends a string when clearing the default', async () => {
      // POST /api/settings rejects an undefined value with a 400.
      await displayControls.saveHouseholdDefaultLimits(API, null);
      const [, body] = axiosMock.post.mock.calls[0];
      expect(body.value).toBe('null');
      expect(typeof body.value).toBe('string');
    });

    it('resolves to the normalized value it wrote', async () => {
      // Symmetry with saveDisplayLimits: the caller never has to re-read to
      // learn what displays will now inherit.
      await expect(displayControls.saveHouseholdDefaultLimits(API, {
        mode: 'hideAll',
        except: ['core:quickSpend', 'bogus', 'core:addChore', 'core:quickSpend'],
      })).resolves.toEqual({
        mode: 'hideAll',
        except: ['core:addChore', 'core:quickSpend'],
      });
    });

    it('resolves to null when the default is cleared or unwritable', async () => {
      await expect(displayControls.saveHouseholdDefaultLimits(API, null)).resolves.toBeNull();
      await expect(displayControls.saveHouseholdDefaultLimits(API, 'garbage')).resolves.toBeNull();
    });

    it('propagates a failed write rather than reporting what it meant to write', async () => {
      axiosMock.post.mockRejectedValue(new Error('boom'));
      await expect(displayControls.saveHouseholdDefaultLimits(API, CONTROL_PRESETS.wallDisplay))
        .rejects.toThrow('boom');
    });
  });

  describe('fetchAllDisplayLimits', () => {
    it('GETs each display once and keys the map by name', async () => {
      axiosMock.get.mockImplementation((url) => {
        if (url.includes('kitchen')) {
          return Promise.resolve({ data: { controlLimits: { mode: 'hideAll', except: [] } } });
        }
        return Promise.resolve({ data: {} });
      });

      await expect(displayControls.fetchAllDisplayLimits(API, ['kitchen', 'hallway']))
        .resolves.toEqual({
          kitchen: {
            limits: { mode: 'hideAll', except: [] },
            settingsRead: true,
            settings: { controlLimits: { mode: 'hideAll', except: [] } },
          },
          hallway: { limits: null, settingsRead: true, settings: {} },
        });
      expect(axiosMock.get).toHaveBeenCalledTimes(2);
      expect(axiosMock.get).toHaveBeenCalledWith(`${API}/api/devices/kitchen/settings`);
      expect(axiosMock.get).toHaveBeenCalledWith(`${API}/api/devices/hallway/settings`);
    });

    it('distinguishes a failed read from unconfigured', async () => {
      // Both carry limits: null, but only one is a statement about what the
      // display stores. Rendering a dead kiosk as "Inheriting" is a claim about
      // configuration we just failed to read, and an admin would act on it.
      axiosMock.get.mockImplementation((url) => (url.includes('down')
        ? Promise.reject(new Error('ECONNREFUSED'))
        : Promise.resolve({ data: {} })));

      const map = await displayControls.fetchAllDisplayLimits(API, ['down', 'inheriting']);
      expect(map.down).toEqual({ limits: null, settingsRead: false, settings: null });
      expect(map.inheriting).toEqual({ limits: null, settingsRead: true, settings: {} });
      expect(map.down.settingsRead).not.toBe(map.inheriting.settingsRead);
    });

    it('does not let one display whose settings could not be read cost the whole table', async () => {
      axiosMock.get.mockImplementation((url) => (url.includes('down')
        ? Promise.reject(new Error('ECONNREFUSED'))
        : Promise.resolve({ data: { controlLimits: { mode: 'showAll', except: ['core:addChore'] } } })));

      const map = await displayControls.fetchAllDisplayLimits(API, ['down', 'up']);
      expect(map.down).toEqual({ limits: null, settingsRead: false, settings: null });
      expect(map.up).toEqual({
        limits: { mode: 'showAll', except: ['core:addChore'] },
        settingsRead: true,
        settings: { controlLimits: { mode: 'showAll', except: ['core:addChore'] } },
      });
    });

    it('reports an unreadable stored value as settingsRead but unconfigured', async () => {
      // We reached the display; what it stores is just not usable.
      axiosMock.get.mockResolvedValue({ data: { controlLimits: '{"mode":' } });
      await expect(displayControls.fetchAllDisplayLimits(API, ['one'])).resolves.toEqual({
        one: { limits: null, settingsRead: true, settings: { controlLimits: '{"mode":' } },
      });
    });

    it('normalizes what each display stored', async () => {
      axiosMock.get.mockResolvedValue({
        data: { controlLimits: { mode: 'showAll', except: ['core:quickSpend', 'bogus', 'core:addChore'] } },
      });
      await expect(displayControls.fetchAllDisplayLimits(API, ['one'])).resolves.toEqual({
        one: {
          limits: { mode: 'showAll', except: ['core:addChore', 'core:quickSpend'] },
          settingsRead: true,
          settings: { controlLimits: { mode: 'showAll', except: ['core:quickSpend', 'bogus', 'core:addChore'] } },
        },
      });
    });

    it('returns the whole blob, not just the controlLimits key', async () => {
      // The caller needs it for isDisplayUnlocked: a remote display that
      // remembers the PIN is exempt, so its saved configuration is not in
      // effect and the form has to be able to say so. The alternative was a
      // second GET per display.
      const blob = {
        controlLimits: { mode: 'hideAll', except: [] },
        [ADMIN_PIN_REMEMBERED_KEY]: true,
        choreWidgetSettings: { soundEnabled: true, hiddenUserIds: [1, 2] },
        wakeLock: false,
      };
      axiosMock.get.mockResolvedValue({ data: blob });

      const map = await displayControls.fetchAllDisplayLimits(API, ['kiosk']);
      expect(map.kiosk.settings).toEqual(blob);
      // The point of carrying it: this is answerable for a remote display now.
      expect(isDisplayUnlocked({ deviceSettings: map.kiosk.settings, pinExists: true })).toBe(true);
      expect(map.kiosk.limits).toEqual({ mode: 'hideAll', except: [] });
    });

    it('returns {} for settings when the response body is not an object', async () => {
      // Keeps the type honest for a caller that spreads it.
      for (const data of [undefined, null, '', 'ok', [], 7]) {
        axiosMock.get.mockResolvedValue({ data });
        const map = await displayControls.fetchAllDisplayLimits(API, ['one']);
        expect(map.one).toEqual({ limits: null, settingsRead: true, settings: {} });
      }
    });

    it('returns null for settings on a failed read, not {}', async () => {
      // "Reached and empty" and "could not read" are different facts — the same
      // distinction settingsRead exists for. An empty blob would make the display
      // look unlocked-by-omission rather than unknown.
      axiosMock.get.mockRejectedValue(new Error('ECONNREFUSED'));
      const map = await displayControls.fetchAllDisplayLimits(API, ['down']);
      expect(map.down.settings).toBeNull();
      expect(map.down.settings).not.toEqual({});
      expect(isDisplayUnlocked({ deviceSettings: map.down.settings, pinExists: true })).toBe(false);
    });

    it('encodes device names and handles an empty list', async () => {
      await expect(displayControls.fetchAllDisplayLimits(API, [])).resolves.toEqual({});
      await expect(displayControls.fetchAllDisplayLimits(API, undefined)).resolves.toEqual({});
      expect(axiosMock.get).not.toHaveBeenCalled();

      axiosMock.get.mockResolvedValue({ data: {} });
      await displayControls.fetchAllDisplayLimits(API, ['Play Room']);
      expect(axiosMock.get).toHaveBeenCalledWith(`${API}/api/devices/Play%20Room/settings`);
    });
  });
});
