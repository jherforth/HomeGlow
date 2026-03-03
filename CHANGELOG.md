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
