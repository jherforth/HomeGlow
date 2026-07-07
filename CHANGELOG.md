# HomeGlow v 1.6 Changelog

## 🎉 Recent Updates

This release focuses on reliability and data efficiency: widgets now refresh on a predictable timestamp-based schedule instead of stacking multiple uncoordinated timers, and pause entirely when nobody can see them. It also brings Apple iCloud calendar support, a richer chores/due-date system, and a demo mode for trying HomeGlow without committing real data.

---

## New Features

### Data Churn Reduction & Refresh Consolidation (#75)
Widgets previously ran their own `setInterval` refresh timer *and* were force-remounted by the countdown ring on the same cadence — meaning every visible widget refetched twice as often as configured, tearing down UI state (open dialogs, scroll position) each time. Refresh is now driven by a single timestamp-based scheduler per widget that refetches in place. Widgets also pause entirely — no ticking, no fetches — while the tab is backgrounded or the photos-mode screensaver is covering the dashboard, and catch up with exactly one refresh when the screen becomes active again. The scheduler is also built to accept future "is anyone watching" signals, such as a Home Assistant presence sensor (#57).

### Calendar Event Deduping (#74)
Events that appear on multiple synced calendars (e.g. shared/subscribed calendars) are now deduplicated instead of showing duplicate entries.

### Apple iCloud Calendar Integration
Added CalDAV support for Apple iCloud calendars, including proper XML/CDATA parsing (fixing crashes on certain calendar feeds) and support for shared/subscribed iCloud calendars that were previously dropped from the listing.

### Chore Due Dates & Sound Chimes (#108)
Chore due-date and chore-schedule tracking were consolidated into a single table, enabling due-time offsets for recurring chores and an optional sound chime that rings when a chore becomes due. Includes a new modal for editing clam values directly (#111) and chore swap improvements.

### Configurable Photo Widget Sizing
The Photos widget now supports an "Auto (fit widget)" sizing mode, set as the new default, alongside the existing fixed-size options.

### Demo Mode
A new opt-in `DEMO_MODE` flag seeds each new device with sample chores and calendar data automatically, and resets on a timer — useful for public demos and trying HomeGlow before committing real data.

### In-App Version Display (#94)
The admin panel now shows the running frontend/backend version, sourced from the Docker build metadata.

### Docker & Platform Improvements
- **arm64 frontend support** (#104): the frontend image now builds for `linux/arm64` alongside `linux/amd64`, matching the backend.
- Image build optimization and dependency hardening in response to `npm audit` findings (#62).
- Proxmox helper script support and documentation for running HomeGlow outside Docker.

### Mobile-Friendly Admin Panel — Phase 1 (#99)
Groundwork and phase-1 implementation for a mobile-responsive admin panel, gated behind device detection. Phase 2 (mobile-friendly main dashboard) is planned as a follow-up.

## 🐛 Bug Fixes

- Immich v3 compatibility: album assets are now fetched via the search/metadata endpoint.
- Widget resize consolidated into a single function with an existence check, preventing errors when resizing a widget that's no longer present in the DOM.
- Various dedup/refactor passes (AdminPanel page routing, Google API fetch helpers, `normalizeWidgetSettings`, calendar multi-day-span detection, prizes endpoint handlers) reducing duplicated logic without changing behavior.

## 📄 Licensing

HomeGlow's license changed from MIT to AGPL v3.0.

---

## Summary
This release trades ad hoc, overlapping refresh timers for a single predictable scheduler that respects screen activity, adds Apple iCloud calendar support and a more capable chores/due-date system, and rounds out platform support with arm64 images and a demo mode.

---

## 📝 Notes

For questions or issues, please visit our [GitHub Issues](https://github.com/jherforth/HomeGlow/issues) page.

---

# HomeGlow v 1.5 Changelog

## 🎉 Recent Updates

This release reworks tab navigation around a new dock-style UI, adds two-way Google Calendar sync and Google/HomeGlow Photos integration, and introduces the project's first automated test suite.

---

## New Features

### New Dock-Style TabBar
Replaced the previous tab bar with a dock-style UI, and made tabs the default navigation model for organizing widgets (#79), including a device widget settings rework (#98) to support per-tab configuration cleanly.

### Calendar Improvements
- **2-Week View** (#90) and a **default calendar view setting** (#96) — choose month, week, or 2-week as your starting view.
- **Non-US location support in the weather widget** (#80) via geocoding, instead of requiring a US ZIP code.

### Day/Night Auto Theme Mode (#60)
The interface can automatically switch between light and dark themes based on time of day / location.

### Google Calendar 2-Way Sync
Events created or edited in HomeGlow can now sync back to Google Calendar, not just pull from it.

### Google Photos & HomeGlow Photos
Added Google Photos Picker integration for the Photos widget, plus a dedicated HomeGlow Photos upload page for hosting your own images without a third-party service.

### Chore Scheduling: "Once Completed" (#82)
Chores can now be scheduled to recur only after they've been marked completed, rather than strictly on a calendar cadence.

### First Automated Test Suite (#93)
Added the project's first tests, plus lazy-loaded widget bundles and package upgrades to improve initial load performance.

## 🐛 Bug Fixes

- Calendar feeds that previously crashed the widget on certain `.ics` files now parse correctly (#92).
- Weather widget no longer bleeds cached data across inactive tabs.
- Settings values now serialize to JSON correctly instead of silently corrupting on save.
- Grid layout no longer renders offset to the right on load (#88).
- Plugin widgets can be moved and resized again (#89).
- Newly created users now immediately appear as assignable when adding a chore (#85).
- Calendar text color no longer becomes unreadable against light custom backgrounds (#91).
- Input forms now save correctly when submitted via Enter.

---

## Summary
This release centers on navigation (dock-style tabs, tabs-by-default) and calendar/photo integrations (Google 2-way sync, Google Photos, HomeGlow Photos), backed by the project's first test suite.

---

## 📝 Notes

For questions or issues, please visit our [GitHub Issues](https://github.com/jherforth/HomeGlow/issues) page.

---

# HomeGlow v 1.4 Changelog

## 🎉 Recent Updates

This release overhauls tab and device management — tabs can now be created and managed dynamically, with widget layouts and settings persisted per device — alongside weather widget improvements and a new calendar view.

---

## New Features

### Dynamic Tab & Device Management
Tabs can now be created, renamed, and managed directly from the UI, with widget assignments and layouts saved per tab. Device-scoped settings replace the previous single-device model, backed by new database migrations for a smoother upgrade path.

### Calendar View (#73)
Added a dedicated calendar month/week view for browsing events beyond the widget's compact display.

### Weather Widget Settings (#76, #77)
Added a Celsius/Fahrenheit toggle and dedicated weather widget settings panel.

### Get Settings by Key (#37)
New API endpoint for fetching individual settings by key, used throughout the admin panel.

## 🐛 Bug Fixes

- Widget drag/resize controls no longer get stuck ("fail to release properly").
- Widgets now correctly use local (in-memory) settings when switching tabs instead of re-fetching stale data.
- Widget positions now save against the correct tab ID instead of leaking across tabs.
- Fixed a bug where completing a bonus chore could also mark an unrelated regular chore complete (#53).
- Docker CI workflow reliability fixes for image builds.

---

## Summary
This release focused on making tabs and devices first-class, dynamically managed concepts, while polishing the weather widget and calendar with a dedicated view and unit toggle.

---

## 📝 Notes

For questions or issues, please visit our [GitHub Issues](https://github.com/jherforth/HomeGlow/issues) page.

---

# HomeGlow v 1.3 Changelog

## 🎉 Recent Updates

Welcome to the latest improvements for HomeGlow! We've been hard at work enhancing your smart home display experience with exciting new features and critical bug fixes.

---

## New Features

### Chores System Overhaul
The chores system has been completely redesigned with a new three-table architecture (chores, chore_schedules, and chore_history) enabling flexible recurring chore scheduling with cron expressions. Users can now have different chore schedules and track completion history for better accountability.

**Related Issues:** #30, #32, #34

### Admin Panel Security
- **PIN Lock Protection** (#29): The admin panel can now be secured with an optional PIN code via environment variable
- **Keyboard PIN Input** (#35): In addition to the on-screen PIN pad, you can now type your PIN directly using your keyboard for faster access

### Chore History Tracking (#39)
A new chore history view in the admin panel displays completed chores from the past 7 days, showing username, chore title, date, and clam value earned. Each entry can be individually deleted for administrative corrections.

### Sticky/Recurring Chores (#38)
Added support for chores that persist until completion (like "Change HVAC filter every 3 months"). These chores will remain visible across multiple days until manually marked as complete, with robust date tracking.

### Bonus Chore Improvements
- **Bonus Chore Expiration** (#33): Bonus chores now properly expire and revert to unassigned status after a set period
- **Single Bonus Chore Limit** (#40): Ensures only one uncompleted bonus chore can be assigned to a user at a time

### Database Optimization
- **Remove Clam Total Field** (#36): Migrated user clam tracking from a denormalized field to the chore_history table with automatic migration for existing balances
- **Prune Old Chores** (#41): Automated daily pruning removes chores with no schedules and completed one-time chores. Manual trigger endpoint available via API.

### Daily Chore Completion Logic (#34)
Completing all daily chores now properly awards bonus clams. The system tracks whether chores are "Regular" (daily tasks) or "Adjustment" (admin allocations) with appropriate database entries.

## 🐛 Bug Fixes

### Calendar Event Improvements
- **Multi-Day Events** (#44): Events spanning multiple days now display correctly across all days, not just the first day
- **All Day Events** (#31): All-day events are now properly marked and distinguished from timed events on the calendar

### Scheduler Timezone Support (#43)
Fixed the node-cron scheduler to respect local timezone via TZ environment variable instead of always running at UTC. Supports Docker timezone passthrough (e.g., `TZ=America/Denver`).

### Regular Chore Daily Bonus Bug (#42)
Fixed issue where one-time regular chores (0 clam value) weren't properly triggering the daily completion bonus.

### Docker CORS Configuration (#22)
Resolved CORS errors that prevented API calls in Docker deployments when using docker-compose with custom network configurations.

---

## Summary
This release focused on improving the chores system with flexible scheduling, better security controls, and more reliable daily task tracking. The new architecture provides better data organization and performance while maintaining all existing functionality.

---

## 📝 Notes

This update includes significant improvements to the chore system and calendar functionality. We recommend upgrading to ensure you get all the latest features and critical bug fixes.

For questions or issues, please visit our [GitHub Issues](https://github.com/jherforth/HomeGlow/issues) page.
