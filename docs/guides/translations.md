# Translations

HomeGlow's interface can run in more than one language (issue #137). This guide
covers adding a language, adding strings, and the rules that keep translation
from breaking things.

## How it fits together

- **Framework**: [i18next](https://www.i18next.com/) + react-i18next, set up in
  `client/src/i18n/index.js`.
- **Strings** live in `client/src/i18n/locales/<lang>/<namespace>.json`.
  Namespaces are per-surface (`common`, `chores`, `admin`, …) so a widget only
  loads what it renders.
- **English is bundled** with the app because it is the fallback. Every other
  language is fetched on demand, so an English household downloads nothing extra.
- **Language is per display.** It is stored in `localStorage` under `language`,
  exactly like theme and screensaver settings — a kitchen tablet and a phone can
  run different languages. A household-wide default can be set via the
  `default_language` server setting; a display that has never chosen follows it.
- **Dates go through `client/src/utils/dateUtils.js`**, not directly through the
  date library. Changing language re-formats every date from that one place.

## Adding a language

1. Copy `client/src/i18n/locales/en/` to a new folder named for the language
   code (`de`, `fr`, `pt`…), then translate the values. Leave the keys alone.
2. Add the language to `SUPPORTED_LANGUAGES` in `client/src/i18n/index.js`.
3. If the date library ships a locale for it, add a loader entry to
   `LOCALE_LOADERS` in `client/src/utils/dateUtils.js`. Without one, the UI
   translates but dates stay in English.
4. Run `npm run check:i18n` in `client/` — it must report 100%.

Machine translation is a fine starting point; fluent speakers can refine it
later. A rough translation that covers every key beats a perfect one that
covers half, because a missing key silently falls back to English mid-sentence.

## Adding or changing a string

Use the `useTranslation` hook and a namespaced key:

```jsx
const { t } = useTranslation(['chores', 'common']);
// ...
<Button>{t('chores:widget.addChore')}</Button>
<Button>{t('common:actions.cancel')}</Button>
```

Then add the key to `locales/en/<namespace>.json` **and every other language**.
CI fails otherwise. In development, a missing key logs a console warning naming
the namespace and key.

For values inside a sentence, interpolate rather than concatenating — word
order differs between languages:

```jsx
t('chores:widget.allDone', { count: dailyClamReward })   // "All Done! +{{count}} 🥟"
```

## Rules worth knowing

**Never translate a machine format.** `dateUtils.js` separates display helpers
(`formatTime`, `formatShortDate`) from machine ones (`toDateKey`,
`toDateTimeInputValue`). The machine formats produce `YYYY-MM-DD` strings used
as map keys, API parameters, and event-matching identifiers. Localizing them
breaks event lookup in ways that are hard to trace.

**Never translate a stored value.** Days of the week are the trap: the UI shows
a translated label while `assigned_days_of_week` and the crontab conversion keep
the English key.

```jsx
label={t(`chores:days.${day}`)}   // display
value={day}                       // 'monday' — what the API stores
```

**User data is not translatable.** Usernames, chore titles, prize names, tab
labels, and calendar event titles are things the family typed or that came from
an external calendar. They render as-is in every language, by design.

**Server errors stay in English.** The API returns diagnostics, not user copy.
Where a failure is shown to a person, translate a message on the client for that
operation rather than displaying the server's text.

## What is translated

Every user-facing surface: the chore, calendar, weather, and photo widgets,
the prize store, the tab icon picker, and the whole Admin Panel including the
chore schedules tab.

Two things are deliberately **not** translated:

- **Server error strings.** The API returns diagnostics, not user copy. Where a
  failure is shown to a person, the client translates a message for that
  operation instead of displaying the server's text.
- **Console logging.** `console.error` calls stay in English so issue reports
  are searchable regardless of the reporter's language.

## Notes for whoever converts the next component

Two mistakes cost real time here, both worth avoiding:

**Do not bulk-edit source files with PowerShell.** `Set-Content` writes
Windows-1252 by default and `-Encoding utf8` adds a BOM; either one mangles
every emoji in the file (`⚠️` becomes `âš ï¸`). Use Node for scripted edits —
it reads and writes UTF-8 correctly. Note that the file uses CRLF, so
multi-line patterns need `\r\n`.

**Check for `prop="{t('key')}"` after any bulk pass.** Replacing a bare text
value that happens to sit inside a quoted JSX prop produces a literal string
containing braces. It builds cleanly and renders the key to the user. Scan for
it with:

```bash
grep -rn '="{t(' client/src
```

## Checking your work

```bash
cd client
npm run check:i18n     # every English key present in every language
npm run build          # locale chunks split per language
```
