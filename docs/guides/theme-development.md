# Theme Development Guide

How to make a HomeGlow theme: a folder of data (a manifest, pictures and
fonts) that recolors and reshapes the dashboard and can animate a scene behind
it. Themes never contain code, so they are safe to share.

Related reading:
- [Theme Architecture](../architecture/theme-architecture.md): the design and
  the rules behind it.
- `reef/` and `starship/` in
  [jherforth/HomeGlowThemes](https://github.com/jherforth/HomeGlowThemes):
  two complete themes to copy from.

## 1. The folder

```
aurora/
  theme.json          the manifest
  assets/             pictures: .svg, .png, .webp or .jpg
  fonts/              .woff2 files, with their license
```

Install the folder with **Add a theme folder** (§7) and choose the theme
under Admin → Look → Appearance. To build a theme into the app instead, put
the folder in `client/src/themes/`; HomeGlow finds it on the next build. The
folder name must match the manifest's `id`.

## 2. The manifest

```json
{
  "manifestVersion": 1,
  "id": "aurora",
  "name": "Aurora",
  "version": "1.0.0",
  "author": "Your name",
  "description": "Northern lights over a dark sky.",
  "extends": "classic",
  "modes": ["dark"],
  "variety": "load",
  "colors": { "primary": "#05070f", "secondary": "#7ff5c8", "accent": "#7ff5c8" },
  "fonts": [{ "family": "Aurora Sans", "weight": 400, "src": "fonts/aurora-400.woff2" }],
  "tokens": { "all": {}, "light": {}, "dark": {} },
  "mui": {},
  "ambience": []
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `manifestVersion` | yes | `1`; `2` for a theme that uses `ornaments`, the meter tokens or `clumps`; `3` for one that uses the button tokens or curved flybys; `4` for one with `weather` scenes or a `flash` layer; `5` for one that uses orbits. A HomeGlow older than the version refuses the theme. |
| `id` | yes | Lowercase slug (a-z, 0-9, hyphens), the same as the folder name. |
| `name` | yes | Shown in the theme picker. |
| `version`, `author`, `description` | | As in a plugin manifest. The author shows as "by ...". |
| `extends` | | Another theme's id. Its tokens, colors and MUI options apply first, then yours. Most themes extend `classic`. |
| `modes` | | `["light", "dark"]` by default. A dark-only theme lists `["dark"]` and shows dark whatever the display's mode. |
| `variety` | | How often the scene behind the widgets changes: `load` (each page load, the default), `day` (every display shows the same scene, and it changes daily) or `fixed`. |
| `colors` | | `primary`, `secondary` and `accent` as hex. Plugins are told these. |
| `fonts` | | `.woff2` files in your `fonts/` folder: `family`, `weight` (100 to 900), optional `style` (`normal` or `italic`), `src`. A font downloads only when text uses it. |
| `tokens` | | Values for the CSS custom properties, in `all`, `light` and `dark`. See §3. |
| `mui`, `muiModes` | | Options for buttons, inputs, dialogs and sliders; `muiModes.light` and `.dark` override per mode. See `utils/themes.js`, `MUI_TYPES`. |
| `ambience` | | Layers drawn behind the widgets. See §4. |
| `ornaments` | | Pictures drawn on every widget frame. See §4a. |
| `weather` | | Scenes that follow the weather outside. See §4b. |
| `confetti` | | The theme's own celebration confetti: `colors` (a list, or per mode), `shapes` (some of `square`, `circle`, `streamer`), `pictures` (as in a `sprites` layer, `height` in px) and `mix` (the share of pieces that are pictures, 0 to 1). Without it, a theme gets Classic's confetti. |

## 3. Tokens

Every token has a type, and a value that doesn't fit is rejected. Values may
never contain `;`, braces, `url(` or similar, so a theme can't inject a
stylesheet. The full list is `THEME_TOKENS` in `client/src/utils/themes.js`;
the most useful:

| Token | Type | What it sets |
| --- | --- | --- |
| `--background`, `--surface`, `--text`, `--text-secondary`, `--border` | color | The page and its text |
| `--accent`, `--accent-rgb` | color, `r, g, b` | Highlights |
| `--hg-page-image` | gradient | An image over the page background |
| `--hg-frame-bg`, `--hg-frame-radius`, `--hg-frame-shadow` | color, lengths, shadow | Each widget's frame |
| `--hg-frame-decoration-width`, `-style`, `-color` | lengths, keyword, up to four colors | A border drawn over the frame's edge (Starship's elbows) |
| `--hg-frame-inset` | 0 to `24px` a side | Room inside the frame for its decoration and ornaments; widget content, plugins included, sits inside it |
| `--hg-frame-image`, `--hg-frame-overlay` | gradient | A tint under the frame's content, a reflection over it (Reef's glass) |
| `--dock-bg`, `--dock-active-bg`, `--dock-active-image` | color, gradient | The dock |
| `--hg-font-body`, `--hg-font-heading` | font list | Type |
| `--hg-grid-gap` | `0`, `8px`, `16px` or `24px` | The gap between widgets; rows keep their pitch |
| `--hg-meter-track`, `--hg-meter-fill` | color | The empty and filled parts of anything showing a level or progress |
| `--hg-meter-thickness`, `--hg-meter-cap` | `1px` to `12px`; `round`, `square` or `butt` | A meter's line and its ends |
| `--hg-button-bg`, `--hg-button-text` | color or gradient; color | A plugin's main buttons. Keep the text readable on the fill |
| `--hg-button-radius`, `--hg-button-weight` | length; `100` to `900` | Their corners (`999px` for pills) and type weight |
| `--hg-button-quiet-border` | color | The outline of a plugin's small, quiet buttons |

Themes never change spacing, font size or line height: widget heights are
fixed, and content must still fit.

## 4. Ambience: a scene behind the widgets

`ambience` is a list of layers, drawn in order (later ones on top). Each
names a building block in `layer`, may limit itself to `modes`, and sets that
block's options. Numbers may be a range, `[low, high]`: HomeGlow picks a value
for each item, so with `variety` set to `load` or `day` the scene varies.

Pictures (`src`) are files in your `assets/` folder. A picture can differ by
mode, `{ "light": "assets/a-day.svg", "dark": "assets/a-night.svg" }`, and so can
a `tint`. A one-color silhouette can be recolored with `tint`, so one file
serves both modes; give multi-color pictures one file per mode.

A `sprites` layer can mix kinds of thing with `pictures`: a list of
`{ src, aspect, height, tint, weight }`. Each copy picks one, by weight, and
taller copies are drawn behind shorter ones. Reef scatters eight kinds of coral
this way, still (`"motion": "none"`) and randomly mirrored (`"flip": true`), so
every load is a different reef.

Any layer can also set `chance`, from 0 to 1: how likely it is to be in a
scene at all. Starship's planets have a chance of 0.75 and its galaxies 0.6, so
some nights there is a ringed planet and the Milky Way, and some nights only
stars.

| Layer | Draws | Options |
| --- | --- | --- |
| `image` | A still picture, or one of a list | `src` (a picture or a list), `anchor` (`bottom`, `top`, `center`, `fill`), `height` (e.g. `"42vh"`), `angle` (turns it, growing it to cover the screen), `flip`, `opacity` |
| `sprites` | Copies of a picture, or a mix of pictures, spread across the screen | `src` or `pictures`, `count`, `height` (vh), `aspect` (width ÷ height), `span` (`[from, to]` %), `base` (distance from the bottom), `clumps` and `clumpWidth` (gather copies into that many patches, each that many percent wide, with open ground between, as plants grow), `lift` (percent of the screen above `base`, drawn per copy), `hue` (degrees to turn each copy's colors), `motion` (`sway`, `bob`, `pulse`, `none`), `angle` (sway degrees) or `distance` (bob px), `seconds`, `tint`, `flip`, `current`, `opacity` |
| `particles` | Many small things | `src` or `colors` (plain dots), `motion` (`rise`, `fall`, `twinkle`), `count`, `size` (px), `seconds`, `drift` (px), `span`, `opacity` |
| `dots` | A still field of dots, painted once | `count`, `colors`, `size`, `opacity`. Each dot's size and opacity follow one brightness, mostly dim, so dim dots are small; the brightest get a halo. |
| `field` | Drifting light (caustics) | `strength` (`soft`, `bright`), `spacing`, `seconds` |
| `streaks` | An occasional streak on a random path | `color`, `length`, `every` (pause, seconds), `seconds`, `burst` (streaks per pass: a meteor storm) |
| `flyby` | Now and then, one picture crossing the screen | `pictures`, `height` (vh), `every` (pause, seconds), `seconds` (to cross), `span` (`[from, to]` % from the top), `tilt` (degrees of climb), `spin` (degrees of tumble per crossing), `opacity`. Draw pictures facing right. |
| `blobs` | Soft color blobs drifting and swelling | `colors`, `count`, `size` (vmin), `seconds`, `opacity` |
| `flash` | Now and then, lightning: a glow from the top of the sky that brightens and fades (manifest version 4) | `color`, `every` (seconds between strikes, at least 4), `strength` (0.05 to 0.5), `double` (a second, weaker flicker; on by default). Kept gentle for anyone sensitive to flashing light, and still under reduced motion. |

`colors` and `tint` take a list, or `{ "color": "#...", "weight": 3 }` entries
for a weighted pick.

A `flyby` can follow a curve instead of a straight line (manifest version 3):

| Option | What it does |
| --- | --- |
| `path` | `line` (the default), `arc` (a slice of a long parabola, mostly off screen, so the visible part is a gentle curve) or `wander` (a meander) |
| `bend` | An arc's rise or fall across the screen, in vh |
| `wander` | How far a meander drifts up and down, in vh |
| `facing` | `path` (tilts to follow the curve) or `fixed` (stays level). Arcs default to `fixed`, meanders to `path` |
| `pitch` | The most a picture tilts when facing the path, in degrees |
| `glide` | 0 to 0.8: how much the speed rises and falls along the way |
| `turn` | 0 to 1: the chance a meander swims partway in, turns around and leaves the way it came |
| `count` | How many travel at once, each on its own loop |
| `begin` | `underway` puts the first of each partway along its path when the page loads, so the scene does not start empty |
| `hue` | Degrees of hue shift, drawn per picture, to vary colors |
| `angle` | A fixed tilt for the whole crossing, in degrees, either way: a ringed planet's ring at a slant |

A flyby can also orbit (manifest version 5). With `path: orbit`, every picture
in the layer circles one focus, picked once per page load, and they all go the
same way round. Each gets its own ellipse through a point within `span`, and
moves quicker nearer the focus.

| Option | What it does |
| --- | --- |
| `focusX`, `focusY` | Where the shared focus may fall, in vw and vh. Keep it off screen; the default is below the screen, so orbits arch across the sky |
| `eccentricity` | 0 (a circle) to 0.9: how oval each orbit is |
| `direction` | `clockwise`, `counterclockwise` or `either` (the default: picked once per page load) |

Starship's planets orbit slowly across the sky. A `wander` path with `turn`
suits fish: they face where they swim and sometimes turn back.

A picture can animate itself: an SVG with its own CSS animation, or an animated
WebP or PNG. The engine draws it like any other picture. Keep such loops small
and slow, and stop an SVG's own animation under
`@media (prefers-reduced-motion: reduce)`, since the engine cannot reach inside a
picture. Starship's turning planets do this.

Each sprite moves on two periods that don't divide evenly, so its motion never
quite repeats. With `"current": true`, a slow third motion rolls across the
sprites like a passing current.

Limits: 12 layers, 40 particles and 16 sprites per layer, 400 dots, durations of
1 to 120 seconds (a flyby's pause, up to an hour).

## 4a. Ornaments: pictures on every frame

`ornaments` is a list (at most 8) of pictures from your `assets/` folder, drawn
on every widget frame, native and plugin alike, above the frame and under its
decoration. They are still, take no pointer events, and are clipped to the
frame's shape.

| Option | Meaning |
| --- | --- |
| `src` | A picture, or `{ "light", "dark" }` pictures |
| `anchor` | `top-left`, `top`, `top-right`, `right`, `bottom-right`, `bottom`, `bottom-left`, `left`, `center`, or `corners`: one picture drawn for the top-left corner, mirrored into all four |
| `size` | Height of the picture (an edge picture's thickness), e.g. `"28px"`; default `24px` |
| `aspect` | Width ÷ height, default 1 |
| `stretch` | For an edge: run the picture along the whole edge |
| `tint` | Recolor a one-color silhouette, as for sprites; may differ by mode |
| `opacity` | 0 to 1 |

Ornaments take no space. Make room for them with `--hg-frame-inset`, at most
24px a side, since every pixel comes out of a fixed-height widget. Keep each
ornament inside that room, or it will sit over the widget's content.

```json
"ornaments": [
  { "src": "assets/bezel.svg", "anchor": "corners", "size": "26px", "tint": { "light": ["#0b6e8a"], "dark": ["#4fe3d6"] } }
]
```

## 4b. Weather scenes

A theme can change with the weather (manifest version 4). `weather` holds a
`default` scene and a scene per condition; HomeGlow shows the one for the
weather outside and checks again every 10 minutes. To the household it is
still one theme in the picker.

```json
"weather": {
  "default": { "ambience": [{ "layer": "blobs", "colors": ["#9fc5ff"] }] },
  "scenes": {
    "sunny": { "colors": { "accent": "#f2a900" }, "ambience": [ ... ] },
    "rainy": {
      "tokens": { "light": { "--background": "#dfe5ec" }, "dark": { "--background": "#0b1119" } },
      "ambience": [{ "layer": "particles", "src": "assets/drop.svg", "motion": "fall", "count": 36, "seconds": [1.2, 2.2] }]
    },
    "lightning": { "ambience": [ ..., { "layer": "flash", "every": [8, 30] }] }
  }
}
```

- **A scene sets** `colors`, `tokens` (`all`, `light`, `dark`), `ambience` and
  `confetti`. Its colors and tokens go over the theme's own; its ambience and
  confetti replace the theme's. Anything it leaves out is the theme's.
- **The scenes** are named for the weather: `sunny`, `partlycloudy`, `cloudy`,
  `fog`, `windy`, `windy-variant`, `rainy`, `pouring`, `snowy`, `snowy-rainy`,
  `hail`, `lightning` and `lightning-rainy`. `default` is shown when the
  weather is something else, or can't be read.
- **Night is the dark mode.** There are no night scenes: a scene's dark look
  (`tokens.dark`, layers with `"modes": ["dark"]`) is its night. A clear night
  shows `sunny` in dark mode. On Auto mode, dark follows sunset.
- **Start small.** A missing scene falls back to a related one, then to
  `default`: `pouring` shows `rainy`; `lightning-rainy` shows `lightning`, then
  `rainy`; `hail` shows `snowy-rainy`, then `snowy`; `snowy-rainy` shows
  `snowy`; `windy-variant` shows `windy`; `partlycloudy` shows `cloudy`. Four
  scenes (sunny, cloudy, rainy, snowy) cover most days.
- **Pictures** come from the theme's `assets/` folder, as everywhere else. A
  scene's pictures download only while it is showing.
- **Trying it:** Admin → Look → Appearance shows the weather outside and the
  scene it picks, and can preview each scene on that display for 10 minutes.
  The dock's mode button shows a scene's night look. The display needs the
  location there (the one Auto mode uses), and a weather provider under
  System → Connections; Home Assistant needs no location.

## 5. Performance rules

A wall display can be a Raspberry Pi. The engine keeps every layer to these
rules, and a theme should not fight them:

- Only `transform` and `opacity` animate.
- Nothing animates for someone who prefers reduced motion, and nothing renders
  while the photo screensaver covers the dashboard.
- No live blur (`backdrop-filter`) over a moving scene, and no full-screen blend
  modes: either one costs a slow GPU most of its frames. Reef's glass is a
  still tint and highlight instead.
- Check your theme in Chromium with the CPU slowed 4× (DevTools, Performance,
  CPU throttling). It should hold about 60 frames a second.

## 6. Checking a theme

`validateThemePackage(manifest, { assets })` in `client/src/utils/themes.js`
reports every problem as a readable sentence, and `npm test` runs it over every
theme folder. Then pick the theme in Admin and look at it in light and dark,
on a desktop and a phone width.

## 7. Installing and sharing a theme

HomeGlow builds in only Classic. Other themes are installed in Admin → Look →
Themes:

- **Get themes** lists the themes repository
  ([jherforth/HomeGlowThemes](https://github.com/jherforth/HomeGlowThemes)),
  one folder per theme at its root, named by the theme's `id`. A
  `preview.png` beside `theme.json` shows in the list.
- **Add a theme folder** installs a folder from your computer. The admin page
  runs `validateThemePackage` before sending it, and shows what's wrong.

Installed themes are kept by the server and offered to every display. Each
display runs the same check before using one, so a theme that fails is listed
as unusable and never partly applied. Files other than `theme.json`,
`assets/` and `fonts/` (a README, a preview) are ignored. SVGs may not carry
script. A theme may hold 64 files, 2 MB each, 8 MB in all.

An installed theme with a built-in theme's id replaces it, except Classic.
To share a theme, open a pull request adding its folder to the themes
repository.

## 8. Examples

Both are in the themes repository.

- **Starship** (`starship/`) layers a sometimes-galaxy (`image`, picked
  from three, at a random angle, with a `chance`), a starfield in stellar
  colors (`dots`), up to three planets (`sprites` with `lift` and `hue`),
  twinkles, shooting stars and meteor storms (`streaks` with `burst`), and
  two `flyby` layers: five kinds of ship, and the occasional tumbling alien. Its confetti mixes tinted sparkles, tiny ships and an alien into LCARS-colored streamers; Reef's throws fish, starfish, shells and bubbles.
- **Reef** (`reef/`) uses six layers: `field` caustics, `particles`
  bubbles from `bubble.svg`, a sea floor per mode (`image`), a still `sprites`
  layer scattering eight kinds of coral, swaying tinted kelp with a current,
  and a swaying mix of fans, whips and anemones. Every load is a new reef.
