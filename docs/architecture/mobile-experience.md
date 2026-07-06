# Mobile Experience (Phase 2) — Architecture

> **Status: proposed / not yet implemented.** This is the design for
> [issue #118](https://github.com/jherforth/HomeGlow/issues/118) — giving phone
> users a native-feeling HomeGlow experience — building on the completed
> [Phase 1 admin-panel work](../guides/admin-panel-mobile-friendly.md)
> (issue #99). It documents the chosen architecture and a phased checklist so
> the work can be picked up incrementally.

## Motivation & requirements

HomeGlow is a touch-first dashboard designed for a wall-mounted kiosk display.
People also open it on their phones — today they get the kiosk's 12-column
grid squeezed into a phone viewport. Issue #118's requirements, verbatim:

- **Easy calendar**
- **Quick access to chores**
- **No 12 grid squares**
- **No photos**
- **Plug-ins set to screen width**

…and, implicitly: **zero change to the kiosk/desktop experience.**

## Principles

1. **Viewport-gated, kiosk untouched.** Everything keys off
   [`useIsMobile`](../../client/src/hooks/useIsMobile.js) (`max-width:
   599.95px`, MUI's `sm` boundary) — the same primitive and the same
   "pixel-identical at ≥600px" guarantee Phase 1 established. Tablets at
   ≥600px intentionally get the kiosk view.
2. **Reuse, don't fork.** The same widget components (`ChoreWidget`,
   `CalendarWidget`, `WeatherWidget`, `PluginWidgetWrapper`), the same data
   fetching, the same Admin Panel (already mobile-friendly from Phase 1), the
   same server API. Only the **layout shell** differs on mobile.
3. **One fork point.** A single `isMobile ?` branch in `app.jsx` decides which
   shell renders. No scattered conditionals in widget code beyond small,
   explicitly listed adaptations.

## Why this is cheap: the existing seam

[`app.jsx`](../../client/src/app.jsx) already separates *what* to render from
*how* to lay it out:

- `widgets` (a `useMemo` around line 690) assembles the enabled widgets for the
  active tab (via `isWidgetAssignedToTab` / `getWidgetLayoutForTab`), each as a
  self-contained `content` node plus grid metadata.
- `<WidgetContainer>` (line ~836) is the only consumer of the grid metadata —
  it renders the react-grid-layout 12-column grid with drag/resize/lock.

Every widget already fills 100% of whatever container it's given (plugins are
an `<iframe>` at 100% width/height of their wrapper), so rendering the same
`content` nodes in a vertical stack requires no widget rewrites.

## The architecture

### 1. Detection

`useIsMobile()` remains the single source of truth (no user-agent sniffing).
A dev-only override (e.g. `?mobile=1` query param) can be added later for
testing on desktop browsers; it is a nicety, not a requirement.

### 2. The fork: `MobileDashboard`

New component `client/src/components/MobileDashboard.jsx`. In `app.jsx`:

```jsx
{isMobile
  ? <MobileDashboard widgets={mobileWidgets} /* … */ />
  : <WidgetContainer widgets={widgets} /* … */ />}
```

`WidgetContainer` — and with it react-grid-layout, drag/resize handles, the
lock system, and grid persistence — **never mounts on mobile**. This satisfies
"no 12 grid squares" structurally rather than cosmetically.

### 3. Mobile widget assembly

- **Tabs are kept** (decision): the dock's tab switcher works exactly as on
  the kiosk, and each tab renders **its assigned widgets** — the existing
  per-tab assignment model is reused unchanged.
- Within a tab, widgets render as a single vertical, scrollable column in a
  **fixed order: chores → calendar → weather → plugins** ("quick access to
  chores" = chores always first). Grid metadata (x/y/w/h, saved layouts) is
  ignored on mobile; there is no rearranging.
- Each widget renders in a full-width card. Heights: chores/weather natural
  height; calendar a comfortable fixed min-height; **plugins full-width with a
  defined height** (initially ~60vh; per-plugin height can become a setting
  later). This satisfies "plug-ins set to screen width".
- **Photos are excluded on mobile even if enabled** for the device (decision:
  hard exclusion per the issue, not just default-off). The photo widget is a
  kiosk ambient feature; `/photos` upload page is unaffected.

### 4. Chrome (dock)

The floating TabBar dock is reused: tab switching, Settings, theme toggle,
refresh. Mobile-specific tweaks only:

- Hide the **Move/Resize (lock)** menu item — there is no grid to edit.
- The Phase 1 behavior of hiding the dock while the Admin Panel is open on
  mobile stays (the dock overlays dialogs otherwise).

### 5. First-run defaults (the "empty phone" problem)

Each browser is its own device (UUID in `localStorage`; settings live
server-side per device). Today a phone's first visit shows the empty
welcome screen until widgets are enabled via the Admin Panel.

Decision: when `isMobile && isFirstRunClient` (state that already exists in
`app.jsx`), the client seeds that device's settings with **chores + calendar +
weather enabled and assigned to the Home tab**, persisted through the existing
device-settings save path. The user can still adjust everything in Settings
afterward; the kiosk first-run flow is unchanged. **No server changes** — the
per-device settings model already supports this.

### 6. Easy calendar

Decision for the first pass: on mobile, `CalendarWidget` defaults its
`viewMode` to **`week`** when the tab has no explicit view override — the week
view is a single row of day columns that reads well on a phone and was
verified touch-friendly during Phase 1 testing. The existing month/week toggle
remains available. A dedicated agenda/list view is a Phase 2c candidate, not
part of the initial pass.

### 7. Not mounted on mobile

- **Screensaver** and its inactivity timers (phones lock themselves; the
  screensaver is a kiosk ambient feature).
- Grid editing (drag/resize/lock), as above.
- Photo widget, as above.

### 8. Explicitly unchanged

- The entire kiosk path: `WidgetContainer`, grid persistence, screensaver,
  TabBar behavior at ≥600px.
- The Admin Panel (Phase 1 complete) and all shared modals.
- The server API and device-settings model.
- Theming (CSS variables / `data-theme`) — the mobile shell uses the same vars.
- The chore sound scheduler runs as-is on mobile for now; whether phones
  should play chore due-time sounds is a follow-up product question.

## Phasing

- **Phase 2a — the shell (core of issue #118):**
  - [ ] `MobileDashboard.jsx` + the `isMobile` fork in `app.jsx`
  - [ ] Vertical stack per tab with fixed ordering (chores → calendar →
        weather → plugins); pure ordering/filtering helper with unit tests
  - [ ] Photos excluded on mobile
  - [ ] Plugins full-width at fixed height
  - [ ] Mobile first-run defaults (chores/calendar/weather → Home tab)
  - [ ] Dock: hide Move/Resize on mobile
- **Phase 2b — polish:**
  - [ ] Calendar defaults to week view on mobile
  - [ ] Widget card spacing/typography pass at 360px, both themes
  - [ ] Per-plugin mobile height setting (if needed in practice)
- **Phase 2c — later / out of scope for #118:**
  - Agenda/list calendar view
  - Swipe gestures between tabs
  - PWA manifest / install-to-home-screen
  - Mobile chore-sound policy

## Verification strategy

- **Mobile path:** Playwright walk at 360×740 (the workflow already used for
  Phase 1): first visit seeds defaults and renders the stack; chores first;
  tab switching works; plugins fill the width; no photo widget; no resize
  affordances anywhere.
- **Kiosk regression:** at ≥600px the app is pixel-identical — grid, drag/
  resize, screensaver, photos all behave exactly as today.
- **Unit tests:** the mobile ordering/filtering helper (pure function) gets a
  Vitest suite alongside the existing util tests.
