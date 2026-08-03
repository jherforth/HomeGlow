# Plugins workspace

This directory is a **local workspace** for developing enhanced HomeGlow
plugins (self-contained `.html` widgets built on the
[plugin platform](../docs/guides/plugin-development.md)).

Everything here except this README is **gitignored** — plugin files are
developed and iterated on in this folder, then copied to the separate
[jherforth/HomeGlowPlugins](https://github.com/jherforth/HomeGlowPlugins)
repo, which is what the Admin Panel's GitHub install tab reads.

## Why not commit plugins here?

- `server/widgets/` is auto-imported into every install by migration 18, so
  plugin sources must stay out of that path.
- Published plugins live in HomeGlowPlugins so users get one-click installs
  and plugin updates don't require an app release.

## Workflow

1. Develop or update a plugin file here (e.g. `chore-metrics.html`).
2. Test it by uploading through **Admin Panel → Custom Widgets** (the same
   flow a HomeGlowPlugins user gets).
3. Copy the finished file into your local clone of HomeGlowPlugins and open
   a PR there.
