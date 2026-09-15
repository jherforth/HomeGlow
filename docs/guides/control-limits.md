# Control Limits

Control limits decide **which parent controls each display offers**. Turn one off
and that button isn't drawn on that display — no button, no prompt.

Every display starts showing everything, so nothing changes until you set
something.

## Setting them

**Admin → Security → Controls on Displays**

1. Set **Default for new displays** to **Wall display**.
2. Set the display you administer from to **Full control**.

Restrict by default, then promote the few screens you run the household from.
That order matters: a new phone, or a browser whose data was cleared, arrives
following your default instead of fully capable.

**Wall display means "hide everything switchable" — as a policy, not a snapshot.**
Install a plugin next month and its management controls are hidden there too,
without you revisiting the screen.

You can limit Add Chore, transferring a chore, snoozing a due date, approving
prize requests, and redeeming clams from a child's profile picture; the
calendar's settings gear (calendars, sync, display options) and its event
editor (add, edit, delete); the photo widget's settings gear (sources and
slideshow); and the weather widget's settings (location and units) — plus
whatever each installed plugin offers.

## Plugin controls

A plugin can declare which of its own controls a display may hide; those appear
under the plugin's name. A plugin that declares none is unaffected — so Wall
display means *everything a plugin offered to hide* is hidden, not that the
plugin shows no management UI at all.

## If nothing seems to change

**A display that remembers the admin PIN ignores its limits and shows
everything.** Your switches still save; they just don't apply there. Clear it
with **Require PIN on all devices again** in the same section.

Otherwise: check whether the display is set individually or marked *Using
household default* — the default only reaches the latter.

## What it isn't

Not access control. HomeGlow's API has no per-device authentication, so a hidden
control is hidden, not forbidden. Limits stick because **Admin sits behind the
PIN** — without a PIN set they're decluttering, which is worth having but isn't a
lock.

Admin itself is never one of the toggles, so a display can't hide the screen that
configures it.
