# Making the Admin Panel Mobile-Friendly (Design & Implementation Plan)

> **Status: implemented.** The primitives (`hooks/useIsMobile.js`,
> `utils/responsiveTable.js`) and all three patterns below are wired up across the
> Admin Panel, its embedded tabs, and the shared modals. The primitives are the
> app-wide groundwork: any future mobile work (Phase 2) should reuse them.
> Phase 2 — the whole-app mobile experience — is designed in
> [Mobile Experience (Phase 2)](../architecture/mobile-experience.md) (issue #118).

## Motivation

The Admin Panel (the ⚙️ settings hub, [AdminPanel.jsx](../../client/src/components/AdminPanel.jsx))
is effectively unusable on a phone. It opens in a `maxWidth="lg"` MUI `Dialog` that never
goes edge-to-edge, its 8-tab bar and nested sub-tab bars overflow horizontally, ~7 data
tables don't reflow, and its dialogs/keypads keep desktop margins. Because HomeGlow is a
touch-first app that people also administer from their phones, the settings surface should
be first-class on narrow screens.

**Goal:** the entire Admin Panel — shell, embedded tabs, and shared modals — is comfortable
and usable on a ~360px phone, with **zero visual change at ≥600px** (desktop/kiosk).

## Scope & non-goals

HomeGlow is **not** a mobile web app — it is a touch-first dashboard designed for a
wall-mounted / large touchscreen display (Raspberry Pi, kiosk, etc.). This work is
**narrowly about letting an end user administer settings from a phone out of
convenience.** Everything else stays exactly as it is.

**In scope:** the Admin Panel and everything reachable from it — [AdminPanel.jsx](../../client/src/components/AdminPanel.jsx),
the embedded [ChoreSchedulesTab.jsx](../../client/src/components/ChoreSchedulesTab.jsx) /
[ChoreHistoryTab.jsx](../../client/src/components/ChoreHistoryTab.jsx), the shared modals
([PinModal.jsx](../../client/src/components/PinModal.jsx),
[ClamValueModal.jsx](../../client/src/components/ClamValueModal.jsx),
[TabIconModal.jsx](../../client/src/components/TabIconModal.jsx),
[SoundPicker.jsx](../../client/src/components/SoundPicker.jsx)), and the single Admin-Panel
`<Dialog>` in `app.jsx`.

**Explicitly out of scope (do not touch):** the dashboard/widget grid
([WidgetContainer.jsx](../../client/src/components/WidgetContainer.jsx),
[DraggableWidget.jsx](../../client/src/components/DraggableWidget.jsx)), the widgets
themselves (Calendar/Weather/Chore/Photo), the [TabBar](../../client/src/components/TabBar.jsx)
dock, the screensaver, and the overall app layout. These are meant for the large display and
should keep behaving as they do today.

**Why the rest of the app is safe:** every change in this plan is **viewport-gated** behind
`useIsMobile` (`max-width: 599.95px`). On the large kiosk display that query is always
false, so the responsive behavior never activates there — nothing changes on the dashboard,
and even the shared modals (which are also reachable from the main display, e.g. the PIN pad
from the dock or the Tab-icon modal from the TabBar) only go full-screen when opened on a
genuinely small viewport. The only `app.jsx` edit is to the Admin-Panel `<Dialog>` itself;
no dashboard, layout, or widget code is modified.

**Bar for "done":** convenient and operable on a phone — not a pixel-perfect native mobile
experience. Where a full card reflow would be awkward for a given table, a horizontal-scroll
fallback is acceptable.

## Constraints & current state (what the code looks like today)

- **No responsive JS infrastructure exists.** There is no `useMediaQuery`, no `useTheme`,
  and **no `ThemeProvider`/`createTheme`** anywhere in `client/src`. MUI therefore uses its
  default breakpoints (`xs:0, sm:600, md:900, …`). `useTheme()`/`useMediaQuery` still work
  without a provider (they fall back to the default theme), so we can introduce them safely.
- **The established house style for responsiveness** is breakpoint objects in `sx` and MUI
  Grid v2 `size={{ xs, sm }}`. Examples to mirror:
  - [app.jsx:~978](../../client/src/app.jsx) — `px: { xs: 3, sm: 5 }`
  - [AdminPanel.jsx:~2906](../../client/src/components/AdminPanel.jsx) —
    `flexDirection: { xs: 'column', sm: 'row' }`
- **The forms are already fine.** Every `<Grid size={{ xs: 12, sm: 6 }}>` collapses to full
  width on mobile. Leave them alone.

### What breaks on a ~360px screen (priority order)

1. **Outer dialog** — [app.jsx:~996](../../client/src/app.jsx): `maxWidth="lg"` with **no**
   `fullScreen`/`fullWidth`; keeps default 32px side margins. The absolutely-positioned close
   `IconButton` ([app.jsx:~998](../../client/src/app.jsx)) can overlap the title/tabs.
2. **Main Tabs bar** — [AdminPanel.jsx:~1782](../../client/src/components/AdminPanel.jsx): 8
   text tabs, `variant="standard"` (not scrollable) → squash/overflow. Same for nested
   sub-tabs (Widgets sub-tabs ~1793; Chores sub-tabs ~2981).
3. **Non-reflowing tables** (MUI `<Table>` never reflows):

   | File | Table | ~Line | Cols |
   | --- | --- | --- | --- |
   | AdminPanel.jsx | Tabs management | 2226 | 5 |
   | AdminPanel.jsx | Devices | 2329 | 4 |
   | AdminPanel.jsx | Users | 2769 | 6 (email = worst) |
   | AdminPanel.jsx | Per-user Chores modal | 3654 | 6 (crontab/description) |
   | ChoreSchedulesTab.jsx | Chore Definitions | 430 | 5 |
   | ChoreSchedulesTab.jsx | Schedules | 533 | **8 (widest in app)** |
   | ChoreHistoryTab.jsx | History | 91 | 5 |

4. **Dialogs never go full-screen.** The `maxWidth="md"` **per-user Chores modal**
   ([AdminPanel.jsx:~3630](../../client/src/components/AdminPanel.jsx)) wrapping the 6-col
   table is the worst; also the 6 AdminPanel confirm dialogs, the 4 ChoreSchedulesTab dialogs,
   and the shared keypad/icon modals.
5. **A few non-stacking flex rows / hard widths** — e.g. the Prize edit row
   ([AdminPanel.jsx:~3048-3060](../../client/src/components/AdminPanel.jsx)) with a fixed
   `width: 120` field, and hard `width: 120/140` fields elsewhere.

## Chosen approach

**Scope:** comprehensive — AdminPanel shell + embedded `ChoreSchedulesTab` /
`ChoreHistoryTab` + shared modals (`PinModal`, `ClamValueModal`, `TabIconModal`).
**Tables:** full card reflow on mobile (not just horizontal scroll).

The strategy is two small reusable primitives plus three repeated patterns, so the change
is uniform and low-risk rather than a per-screen rewrite.

### Reusable primitives (build once)

1. **`client/src/hooks/useIsMobile.js`**
   ```js
   import useMediaQuery from '@mui/material/useMediaQuery';
   // Matches MUI's `sm` breakpoint (600px) without needing a ThemeProvider.
   export default function useIsMobile() {
     return useMediaQuery('(max-width:599.95px)');
   }
   ```
   One source of truth for the mobile cutoff, imported by `app.jsx`, `AdminPanel.jsx`, the
   embedded tab components, and the shared modals.

2. **`client/src/utils/responsiveTable.js`** — a `stackableTableSx` object implementing the
   CSS "stacked card" pattern, spread into each `<Table sx={{ ...stackableTableSx }}>`:
   ```js
   export const stackableTableSx = {
     '@media (max-width:599.95px)': {
       '& thead': { display: 'none' },
       '& tr': {
         display: 'block',
         mb: 1.5,
         border: '1px solid var(--card-border)',
         borderRadius: 2,
         p: 1,
       },
       '& td': {
         display: 'flex',
         justifyContent: 'space-between',
         alignItems: 'center',
         gap: 2,
         border: 0,
         py: 0.75,
         '&::before': {
           content: 'attr(data-label)',
           fontWeight: 600,
           color: 'var(--text-secondary)',
           marginRight: '12px',
         },
       },
     },
   };
   ```
   **Why this over a data-driven `<ResponsiveTable>` component:** the existing tables carry a
   lot of custom inline behavior (inline edit state, avatar upload, clam-modal triggers,
   visibility toggles, next-occurrence calc). This CSS pattern keeps **all existing cell JSX
   intact** — the only per-table change is adding `data-label="<header>"` to each body
   `<TableCell>` (MUI forwards `data-*` to the `<td>`). It's far less risky than rewriting
   seven tables. If a cell has no sensible label (e.g. the avatar/actions cell), omit
   `data-label` and it renders without a prefix.

### Pattern A — Dialogs full-screen on mobile

In each component: `const isMobile = useIsMobile();` then `fullScreen={isMobile}` (keep
existing `fullWidth`) on **every** `<Dialog>`.
- **Outer Admin dialog** ([app.jsx:~996](../../client/src/app.jsx)): add `fullScreen={isMobile}`
  + `fullWidth`; make `DialogContent` padding responsive (`p: { xs: 1.5, sm: 3 }`); prevent the
  absolute close button from overlapping by giving the AdminPanel title row
  `pr: { xs: 5, sm: 0 }` — or, for polish, render the close button in a small sticky top bar
  when `fullScreen`.
- **AdminPanel.jsx**: the 6 dialogs (delete-tab, copy-device, rename-device, delete-device,
  delete-user, and the `md` per-user Chores modal ~3630).
- **ChoreSchedulesTab.jsx**: the 4 dialogs (Chore, Delete-chore, Schedule form, Delete-schedule).
- **Shared modals**: `PinModal.jsx`, `ClamValueModal.jsx`, `TabIconModal.jsx` — the keypads and
  icon grid benefit most; let `fullScreen` override their glass `slotProps.paper` borders on mobile.

### Pattern B — Scrollable tabs

Add `variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile` to the main Admin
tabs ([AdminPanel.jsx:~1782](../../client/src/components/AdminPanel.jsx)) and the nested
sub-tab bars (~1793, ~2981).

### Pattern C — Tables reflow to cards

For each of the 7 tables in the table above: spread `stackableTableSx` into its `<Table>` and
add `data-label="<header>"` to every body `<TableCell>`. Drop now-pointless fixed cell widths
(`width={60}`, `width={120}`).

### Targeted fixes

- Prize edit row ([AdminPanel.jsx:~3048-3060](../../client/src/components/AdminPanel.jsx)):
  `flexDirection: { xs: 'column', sm: 'row' }` and Clam-Cost field `width: { xs: '100%', sm: 120 }`.
- Hard-width fields (`width: 120/140`, e.g. clam value ~671) → `width: { xs: '100%', sm: N }`.
- `SoundPicker.jsx` inline select `minWidth: 160` → `minWidth: { xs: 120, sm: 160 }`
  ([SoundPicker.jsx:~119](../../client/src/components/SoundPicker.jsx)).

## Implementation checklist

- [x] Add `hooks/useIsMobile.js` and `utils/responsiveTable.js`.
- [x] `app.jsx`: outer dialog `fullScreen`, responsive `DialogContent` padding,
      fix close-button overlap. (`fullWidth` was dropped: `fullScreen` covers mobile and
      `fullWidth` would have stretched the desktop dialog, violating the ≥600px rule.)
- [x] AdminPanel.jsx: scrollable main + sub tabs; `fullScreen` on all 6 dialogs; `stackableTableSx`
      + `data-label` on all 4 tables; Prize-row + hard-width fixes.
- [x] ChoreSchedulesTab.jsx: `fullScreen` on all 4 dialogs; card reflow on both tables.
- [x] ChoreHistoryTab.jsx: card reflow on the history table.
- [x] PinModal / ClamValueModal / TabIconModal: `fullScreen` on mobile.
- [x] SoundPicker: responsive `minWidth`.
- [x] (Found during verification) `app.jsx`: hide the floating dock while the Admin Panel is
      open on mobile — the dock (`z-index: 9999`) renders above MUI dialogs (`z-index: 1300`)
      and covered the bottom action buttons of full-screen dialogs. Gated on `isMobile`, so
      the kiosk/desktop dock is untouched.

## Verification

1. `cd client && npm run build` (compile) and `npm test` (existing suites stay green;
   optionally add a `useIsMobile` unit test that mocks `window.matchMedia`).
2. **Manual responsive pass — the real proof.** Run the app, open the ⚙️ Admin Panel, and in
   browser devtools device mode at **360px** walk every tab:
   - outer dialog is full-screen edge-to-edge; close button clears the title;
   - main + sub tab bars scroll horizontally;
   - each table renders as stacked labelled cards, with all buttons/toggles/inline-edits working;
   - every dialog (confirmations, per-user Chores, Schedule editor, PIN pad, Clam pad, Tab icon)
     fills the screen and is operable.
3. **Regression check:** at ≥600px everything is pixel-identical to today.
4. Verify light **and** dark themes; confirm touch targets stay comfortable (touch-first app).

## Notes / open questions for the implementer

- The **real validation is visual** at narrow width — build/tests can't confirm "looks right
  on a phone." Budget time for the devtools walk-through in both themes.
- If a future refactor wants a proper data-driven `<ResponsiveTable>` component instead of the
  CSS pattern, that's a larger but cleaner option — deferred here to avoid destabilizing the
  tables' existing inline behavior.
- No `ThemeProvider` is introduced; if one is ever added for theming, `useIsMobile` can switch
  to `useMediaQuery(theme.breakpoints.down('sm'))` for consistency.
