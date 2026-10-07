# Theme Development Guide

How to make a HomeGlow theme: a folder of data (a manifest, pictures and
fonts) that recolors and reshapes the dashboard and can animate a scene behind
it. Themes never contain code, so they are safe to share.

Related reading:
- [Theme Architecture](../architecture/theme-architecture.md): the design and
  the rules behind it.
- `client/src/themes/reef/` and `client/src/themes/starship/`: two complete
  themes to copy from.

## 1. The folder

```
client/src/themes/aurora/
  theme.json          the manifest
  assets/             pictures: .svg, .png, .webp or .jpg
  fonts/              .woff2 files, with their license
```

Adding the folder is all it takes: HomeGlow finds it on the next build and
lists the theme under Admin, Interface, Appearance. The folder name must match
the manifest's `id`.

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
| `manifestVersion` | yes | Always `1`. |
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
| `--hg-frame-inset` | lengths | Padding so content clears a thick decoration |
| `--hg-frame-image`, `--hg-frame-overlay` | gradient | A tint under the frame's content, a reflection over it (Reef's glass) |
| `--dock-bg`, `--dock-active-bg`, `--dock-active-image` | color, gradient | The dock |
| `--hg-font-body`, `--hg-font-heading` | font list | Type |
| `--hg-grid-gap` | `0`, `8px`, `16px` or `24px` | The gap between widgets; rows keep their pitch |

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
| `sprites` | Copies of a picture, or a mix of pictures, spread across the screen | `src` or `pictures`, `count`, `height` (vh), `aspect` (width ÷ height), `span` (`[from, to]` %), `base` (distance from the bottom), `lift` (percent of the screen above `base`, drawn per copy), `hue` (degrees to turn each copy's colors), `motion` (`sway`, `bob`, `pulse`, `none`), `angle` (sway degrees) or `distance` (bob px), `seconds`, `tint`, `flip`, `current`, `opacity` |
| `particles` | Many small things | `src` or `colors` (plain dots), `motion` (`rise`, `fall`, `twinkle`), `count`, `size` (px), `seconds`, `drift` (px), `span`, `opacity` |
| `dots` | A still field of dots, painted once | `count`, `colors`, `size`, `opacity`. Each dot's size and opacity follow one brightness, mostly dim, so dim dots are small; the brightest get a halo. |
| `field` | Drifting light (caustics) | `strength` (`soft`, `bright`), `spacing`, `seconds` |
| `streaks` | An occasional streak on a random path | `color`, `length`, `every` (pause, seconds), `seconds`, `burst` (streaks per pass: a meteor storm) |
| `flyby` | Now and then, one picture crossing the screen | `pictures`, `height` (vh), `every` (pause, seconds), `seconds` (to cross), `span` (`[from, to]` % from the top), `tilt` (degrees of climb), `spin` (degrees of tumble per crossing), `opacity`. Draw pictures facing right. |
| `blobs` | Soft color blobs drifting and swelling | `colors`, `count`, `size` (vmin), `seconds`, `opacity` |

`colors` and `tint` take a list, or `{ "color": "#...", "weight": 3 }` entries
for a weighted pick.

Each sprite moves on two periods that don't divide evenly, so its motion never
quite repeats. With `"current": true`, a slow third motion rolls across the
sprites like a passing current.

Limits: 12 layers, 40 particles and 16 sprites per layer, 400 dots, durations of
1 to 120 seconds (a flyby's pause, up to an hour).

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

## 7. Examples

- **Starship** (`themes/starship/`) layers a sometimes-galaxy (`image`, picked
  from three, at a random angle, with a `chance`), a starfield in stellar
  colors (`dots`), up to three planets (`sprites` with `lift` and `hue`),
  twinkles, shooting stars and meteor storms (`streaks` with `burst`), and
  two `flyby` layers: five kinds of ship, and the occasional tumbling alien. Its confetti mixes tinted sparkles, tiny ships and an alien into LCARS-colored streamers; Reef's throws fish, starfish, shells and bubbles.
- **Reef** (`themes/reef/`) uses six layers: `field` caustics, `particles`
  bubbles from `bubble.svg`, a sea floor per mode (`image`), a still `sprites`
  layer scattering eight kinds of coral, swaying tinted kelp with a current,
  and a swaying mix of fans, whips and anemones. Every load is a new reef.
