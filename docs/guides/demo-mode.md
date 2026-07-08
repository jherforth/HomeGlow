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
| **Sample data** | Empty first-run welcome screen | A demo household is **seeded at boot and re-seeded every 6 hours**; new visitor devices auto-enable the chore + calendar widgets |
| **Abuse-prone routes** | Available | Return `403` (see below) |
| **Client banner** | — | A **"Demo Mode — sample data resets every N hours"** banner is shown |

### Routes disabled in demo mode

Anything that writes to the host, reaches out to the network, or stores
credentials is blocked with a `403 { "error": "This feature is disabled in demo
mode." }`:

- **All uploads** — custom widgets, sounds, user avatars, photos.
- **Widget install/delete** — including GitHub widget installs.
- **The `/api/proxy` CORS proxy** — so it can't be used as an open relay.
- **Google & Apple connection setup** — OAuth config, authorize/callback, account
  delete, CalDAV calendar listing.
- **Calendar test & sync triggers** — visitor-supplied calendar URLs are **never
  fetched**; the calendar sync service stays off entirely and the seeded events
  are shown from cache.

Everyday interactive routes **still work**, so the demo feels live: completing and
un-completing chores, moving and resizing widgets, switching tabs, and adjusting
per-device settings all behave normally (they just reset on the next cycle).

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
- **A week of calendar events** — soccer practice, pizza night, a dentist
  appointment, an overnight trip to Grandma's, a piano recital, and a
  library-books-due reminder. Calendar sync never runs; these come from the event
  cache under a placeholder "Family Calendar" source that is never fetched.

Because the whole set is re-seeded on a timer (every 6 hours by default) and the
database is in-memory, the demo always returns to this known-good state.

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
