# Demo Mode

Demo mode turns a HomeGlow install into a **public, throwaway showcase**. It boots
with a believable sample household already on screen, disables anything a stranger
could abuse, and wipes itself clean on a timer so one visitor's poking never
lingers for the next. It's how the hosted demo at
**[demo.homeglow.dev](https://demo.homeglow.dev)** runs, and you can run the exact
same thing yourself with a single environment variable.

> **Not for your real dashboard.** Demo mode uses an in-memory database — **all
> data is discarded when the container stops.** Never point a household you care
> about at `DEMO_MODE=true`.

## Turning it on

Set one variable in the **backend** environment and restart:

```env
DEMO_MODE=true
```

That's the whole switch. `DEMO_MODE` defaults to `false` everywhere, so normal
installs are never affected. With Docker Compose, add it under the backend
service:

```yaml
services:
  backend:
    image: ghcr.io/jherforth/homeglow-backend:latest
    environment:
      - DEMO_MODE=true
```

On boot you'll see a log line confirming it:

```
DEMO MODE enabled: in-memory database, PIN disabled, sample data resets every 6h
```

## What changes in demo mode

| Area | Normal install | Demo mode |
| --- | --- | --- |
| **Database** | SQLite file at `server/data/tasks.db` (persistent) | **In-memory** — wiped when the container stops; `DB_PATH` is ignored |
| **Admin PIN** | Optional PIN gate on the Admin Panel | **Disabled** — panel opens freely; PIN set/verify/delete return `403` so no visitor can lock others out |
| **Sample data** | Empty first-run welcome screen | A demo household is **seeded at boot and re-seeded every 6 hours**; new visitor devices auto-enable the chore, calendar, and weather widgets |
| **Calendar sync** | Syncs whatever sources you configure | Runs **only for the curated demo feeds** seeded at boot; source add/edit/delete routes are blocked so visitor URLs are never fetched |
| **Weather** | Live data from your chosen provider, for the place you set | **Live data from Open-Meteo (no key), always for New York City (ZIP 10001)**, whatever location a visitor sets; a static snapshot if Open-Meteo can't be reached |
| **Abuse-prone routes** | Available | Return `403` (see below) |
| **Client banner** | — | A **"Demo Mode — sample data resets every N hours"** banner is shown |

### Routes disabled in demo mode

Anything that writes to the host, reaches out to the network, or stores
credentials is blocked with a `403 { "error": "This feature is disabled in demo
mode." }`:

- **Uploads that touch the host filesystem** — sounds, user avatars, photos.
- **The `/api/proxy` CORS proxy** — so it can't be used as an open relay.
- **Google & Apple connection setup** — OAuth config, authorize/callback, account
  delete, CalDAV calendar listing.
- **Calendar source management and manual sync triggers** — adding, editing, or
  deleting calendar sources is blocked, as are the test/sync endpoints. The sync
  service *does* run in demo mode, but only ever fetches the curated feeds
  seeded below — a visitor-supplied URL can never reach it (SSRF guard).

Everyday interactive routes **still work**, so the demo feels live: completing and
un-completing chores, moving and resizing widgets, switching tabs, and adjusting
per-device settings all behave normally (they just reset on the next cycle).

**Plugins work in demo mode too** — upload, GitHub install, delete, and the full
plugin platform (storage, settings, events, reactions) are deliberately *not*
blocked, so visitors can try the plugin system end-to-end. This is safe because
the plugin store lives in the database (issue #105 Phase 0), which in demo mode
is in-memory and wiped on every reset cycle — a visitor-installed plugin never
touches the host filesystem and disappears within hours.

## What gets seeded

The sample data lives in [`server/utils/demoSeed.js`](../../server/utils/demoSeed.js)
and is designed to make an empty dashboard feel like a real family command center:

- **Three family members** — Emma, Liam, and Noah.
- **A mix of chores that shows off how clams work:**
  - **Reward chores** worth clams — Dishes (5), Vacuum living room (10), Take out
    trash (3), Fold laundry (5), Walk the dog (4), Water the plants (2), and a
    weekend "Wash the car" (15) bonus.
  - **Routine chores with _no_ clam value** — Make your bed, Brush teeth, Tidy
    your room, Homework. These demonstrate that clams are **optional per chore**:
    a chore can be a tracked responsibility without paying out any reward.
  - **Unassigned bonus chores** anyone can grab (the weekend vacuum and car wash).
  - A spread of schedules (daily, weekdays, specific days) and durations
    (`day-of`, `until-completed`) so the different scheduling modes are visible.
- **A few days of completion history** so clam totals look lived-in — reward
  chores post clams, routine chores post zero.
- **Prizes** to spend clams on — Movie night pick (50), Ice cream trip (30),
  30 min extra screen time (15).
- **A week of family calendar events** — soccer practice, pizza night, a dentist
  appointment, an overnight trip to Grandma's, a piano recital, and a
  library-books-due reminder. These are baked into the event cache under a
  placeholder "Family Calendar" source (a reserved `.invalid` URL the sync
  service knows to skip), so they're on screen the instant the demo boots.
- **Four live public calendar feeds**, synced for real by the calendar sync
  service so the demo shows genuine multi-calendar behavior:
  - **US Federal Holidays** (OPM)
  - **Arizona Diamondbacks** (MLB schedule)
  - **Town of Chili — Calendar** and **Town of Chili — Community Events** — two
    overlapping town feeds, which double as a live demonstration of
    cross-calendar event deduplication.
- **Live weather for New York City** — the server fetches it from Open-Meteo,
  which needs no key, behind the normal `GET /api/weather`. The place is fixed
  at ZIP 10001 whatever a visitor asks for: every weather request and every
  location lookup (`GET /api/weather/geocode`) answers with New York. So all
  visitors share one cached reading per unit system, a forced refresh reuses
  it, and a visitor's text is never sent to a geocoder. That's at most a couple
  of upstream calls every 10 minutes. Open-Meteo has no air quality, so that
  section is hidden.

  If Open-Meteo can't be reached, the widget shows a static real-conditions
  snapshot of Chili, NY instead of an error (current temp, 3-day outlook,
  hourly chart, air quality), with forecast dates generated relative to today.

Because the whole set is re-seeded on a timer (every 6 hours by default) and the
database is in-memory, the demo always returns to this known-good state; each
reset also restarts the feed sync jobs and refetches the live calendars.

## How the reset works

At boot the server seeds the sample data once, then schedules a repeating reset on
an unref'd timer. Each reset wipes the visitor-modifiable **domain** tables
(chores, schedules, history, prizes, calendars, photos, tabs, devices, the admin
PIN) and re-seeds them — while deliberately leaving the `settings` table (schema
version and migration bookkeeping) untouched. The system "bonus" user (id 0) that
migrations create is also preserved.

The client learns it's in demo mode from `GET /api/demo`, which returns
`{ "demo": true, "resetHours": 6 }`, and shows the banner accordingly.

## Related

- [Deployment → Running a public demo instance](deployment.md#running-a-public-demo-instance-demo-mode) — the short ops-focused version of this switch.
- [Configuration](../reference/configuration.md) — the full environment-variable reference, including `DEMO_MODE`.
- [Features & Domains](../reference/features.md) — how chores, clams, calendars, and the other widgets work outside the demo.
