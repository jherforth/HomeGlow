# Theme Architecture: Self-Contained Theme Folders and a Data-Driven Ambience Engine

> **Status: implemented** (steps 1 and 2 of §6). §2 describes the code as it
> was before; §3 to §7 are now how it works, with the differences listed in §9.
> The author's guide is [Theme Development](../guides/theme-development.md).
> If you are an agent picking this up, read §2.3 (rules to keep) before
> changing anything.

## 1. Problem

Theming works, but it doesn't scale with the number of themes, and animated
themes can only be added as code:

- **One file holds every theme's animation.** `client/src/themes/ambience.jsx`
  (482 lines) contains every animated background as hand-written React: bubbles,
  caustics, the whole Reef coral scene (about 300 lines of SVG and colour
  palettes) and the Starship starfield. Each new animated theme adds its
  components to this file.
- **Every theme touches shared lists** in `client/src/utils/themes.js`:
  - the theme imports and `BUILT_IN_THEMES`;
  - `AMBIENCE_SCHEMA`, the options each effect accepts, kept in step with the
    components by `ambience.test.js`;
  - `FONT_LOADERS`, which hard-codes `@fontsource` imports.
- **Every display downloads every theme's art.** `ambience.jsx` is imported
  statically by `WidgetContainer.jsx` and `MobileDashboard.jsx`, so the Reef art
  is in the 71 KB `app` chunk (measured 2026-10-06), including on Classic
  displays that never show it.
- **#218's central rule is only half met.** "Themes are data, not code, so third
  parties can publish them safely" holds for colours, tokens and fonts. Animation
  is code only, so a community theme can't have its own animated background. The
  maintainer's comment on #218 asks for themes in their own subfolder and for
  animated backgrounds such as morphing "ambient blobs".

### Decisions already made

1. **Anyone can make an animated theme, as data.** Animation is described in
   the theme's manifest, using a fixed set of generic building blocks applied to
   asset files in the theme's own folder. Themes never ship code.
2. **Reef and Starship are re-authored as data** in the new format, so they
   prove the engine and serve as worked examples for theme authors.

## 2. How theming works today

### 2.1 File map

| File | Role |
| --- | --- |
| `client/src/themes/classic.css` | The base stylesheet. It defines every token (`--primary`, `--card-bg`, `--hg-radius-sm`, frame tokens…) for light and dark. `index.css` imports it. |
| `client/src/themes/{classic,starship,reef}.json` | Theme packages: manifest fields, `extends`, `modes`, `colors`, `fonts`, `tokens` (`all`/`light`/`dark`), `mui`, `muiModes`, `ambience`. |
| `client/src/utils/themes.js` | Token registry (`THEME_TOKENS` with a type per token), value validators, `validateThemePackage`, `BUILT_IN_THEMES`, `resolveTheme` (merges `extends`), `themeDisplayMode`, `themeTokens`, `applyThemeTokens`, `FONT_LOADERS` / `loadThemeFonts`, `muiThemeOptions`, `AMBIENCE_SCHEMA`. |
| `client/src/themes/ambience.jsx` | `ThemeContext`, the effect components (`Bubbles`, `Caustics`, `Seafloor`, `Starfield`), and the `EFFECTS` map and `AmbienceLayer` that render a theme's `ambience` list. |
| `client/src/themes/ambience.test.js` | Checks that `AMBIENCE_EFFECT_NAMES` matches `AMBIENCE_SCHEMA`. |
| `client/src/themes/classic.test.js` | No hard-coded translucent black or white outside themes; every `--hg-*` token used is defined in `classic.css`. |
| `client/src/utils/appearance.js` | The appearance cascade (household, then display). `theme` is one field, validated against `BUILT_IN_THEMES` ids. |
| `client/src/components/AppearanceSettings.jsx` | Theme picker; lists `BUILT_IN_THEMES`. |
| `client/src/utils/widgetFrame.js` | The frame decoration layer driven by `--hg-frame-*` tokens. |
| `client/src/app.jsx` | Resolves the active theme, applies its tokens to `document.documentElement`, loads fonts, builds the MUI theme, and provides `ThemeContext`. |

The server doesn't know theme IDs or validate theme packages; all theme logic is
client-side.

### 2.2 Data flow

1. The appearance cascade gives a theme ID, and `resolveTheme(id)` merges it
   with its `extends` chain (tokens, colours and MUI options from the parent
   first). An unknown ID falls back to Classic.
2. `themeDisplayMode` picks the mode the theme supports; Starship is dark only.
3. `app.jsx` sets `data-theme`, then `applyThemeTokens` writes the theme's
   tokens as inline custom properties on the root, removing any the previous
   theme set. If the theme has `colors`, those replace the household's interface
   colours, plugins included.
4. `loadThemeFonts` dynamic-imports the `@fontsource` CSS for each named font.
5. `muiThemeOptions` feeds a `ThemeProvider`, which is always present (Classic
   gets MUI's defaults), so switching themes never remounts the app.
6. `AmbienceLayer`, rendered by `WidgetContainer` and `MobileDashboard`, reads
   `ThemeContext` and renders the effects listed for the current mode, unless
   `active` is false (the photo screensaver is covering the dashboard).

### 2.3 Rules any change must keep

- **Classic renders exactly as the stylesheet defines it.** Classic is the empty
  package.
- **Themes are data.** Token values are typed and validated; `;`, `{}`, `<>`,
  `\`, `@`, `url(`, `expression` and `javascript:` are refused, so a theme can't
  inject CSS.
- **Themes never change layout metrics** (spacing, font size, line height),
  because widget heights are fixed.
- **Animated effects:**
  - animate only `transform` and `opacity`;
  - stop under `prefers-reduced-motion`;
  - don't render while the dashboard is hidden;
  - use no live `backdrop-filter` over animation and no full-screen blend modes
    (#226 measured both costing a slow GPU most of its frames).
- **Fonts are bundled, never fetched from a CDN.**
- **The manifest follows the plugin manifest's rules:** `manifestVersion` 1,
  `id` slug, `name`, `version`, `description`, `author`.
- **Switching themes never remounts the app,** and it clears the previous
  theme's tokens.

## 3. Proposed architecture

### 3.1 One folder per theme

```
client/src/themes/
  classic.css                    unchanged: the base token stylesheet
  classic/theme.json
  reef/
    theme.json
    assets/  reef-day.svg  reef-night.svg  kelp.svg  fan.svg  whips.svg
             anemone-day.svg  anemone-night.svg  bubble.svg
    fonts/   nunito-400.woff2  nunito-600.woff2  nunito-700.woff2  OFL.txt
  starship/
    theme.json
    fonts/   antonio-400.woff2  antonio-600.woff2  antonio-700.woff2  OFL.txt
  engine/
    ThemeContext.js              moved out of ambience.jsx; tiny, imported by app.jsx
    AmbienceLayer.jsx            renders a theme's layers; lazy-loaded
    registry.js                  discovers layers/*.jsx
    motion.js                    shared keyframes, seeded RNG, reduced-motion rule
    layers/  image.jsx  sprites.jsx  particles.jsx  dots.jsx  field.jsx  streaks.jsx  blobs.jsx
```

**Adding a theme means adding a folder;** no shared file changes. Adding a
building block means adding one file under `engine/layers/`. `ambience.jsx`,
`ambience.test.js`, `AMBIENCE_SCHEMA` and `FONT_LOADERS` are removed.

### 3.2 Discovery

`utils/themes.js` builds its lists from the folders:

```js
const manifests = import.meta.glob('../themes/*/theme.json', { eager: true, import: 'default' });
const files = import.meta.glob('../themes/*/{assets,fonts}/*', { eager: true, query: '?url', import: 'default' });
```

- `BUILT_IN_THEMES` is the manifests, Classic first and then sorted by `name`.
- A per-theme map turns relative paths (`assets/kelp.svg`) into hashed URLs.
  Those are only strings; no file is downloaded until a theme uses it.
- `appearance.js` and `AppearanceSettings.jsx` already read `BUILT_IN_THEMES`,
  so they don't change.

### 3.3 Fonts in the folder

```json
"fonts": [
  { "family": "Antonio", "weight": 400, "src": "fonts/antonio-400.woff2" },
  { "family": "Antonio", "weight": 700, "src": "fonts/antonio-700.woff2" }
]
```

- `loadThemeFonts` loads each one with the `FontFace` API
  (`new FontFace(family, url, { weight, style })` and `document.fonts.add`).
  Tokens such as `--hg-font-heading` then name the family as they do now.
- The Latin `.woff2` files for the weights in use come from `@fontsource/antonio`
  and `@fontsource/nunito`, with their `OFL.txt`. Both packages are then removed
  from `client/package.json`.
- Validation: `family` must be a plain name, `weight` 100 to 900, `style`
  `normal` or `italic`, and `src` a `.woff2` file present in the theme folder.

### 3.4 Ambience as data

A theme's `ambience` is a list of **layers**. Each layer names a building block
(`layer`), the modes it shows in, and that block's options. Example from the
re-authored Reef:

```json
"ambience": [
  { "layer": "field", "modes": ["light"], "strength": "soft" },
  { "layer": "particles", "src": "assets/bubble.svg", "motion": "rise", "count": 14, "size": [6, 22], "seconds": [16, 34], "drift": 40 },
  { "layer": "image", "modes": ["light"], "src": "assets/reef-day.svg", "anchor": "bottom", "height": "42vh" },
  { "layer": "image", "modes": ["dark"], "src": "assets/reef-night.svg", "anchor": "bottom", "height": "42vh" },
  { "layer": "sprites", "modes": ["light"], "src": "assets/kelp.svg", "motion": "sway", "angle": 4, "aspect": 0.2,
    "at": [
      { "x": "2%", "height": 30, "seconds": 7, "delay": 0, "tint": "#3f8f6b" },
      { "x": "22%", "height": 26, "seconds": 8, "delay": -5, "tint": "#4d9e5a" }
    ] }
]
```

**Building blocks.** Each one is generic, so other themes reuse it:

| Layer | Draws | Main options | Replaces |
| --- | --- | --- | --- |
| `image` | A static asset | `src`, `anchor` (bottom, top, center, fill), `height`, `opacity` | Reef's static coral scene, one per mode |
| `sprites` | Copies of one asset at listed positions, each moving | `src`, `motion` (sway, bob, pulse), `angle`/`distance`, `aspect`, `at[]` (x, height, seconds, delay, optional `tint`) | kelp, sea fans, sea whips, anemones |
| `particles` | N seeded copies of an asset or a plain dot | `src` or `dot` colour, `motion` (rise, fall, twinkle), `count`, `size`, `seconds`, `drift`, `colors` | bubbles, twinkling stars |
| `dots` | A still, procedural speckle field | `count`, `colors` (a weighted list), `size`, `opacity` | the still starfield |
| `field` | Two oversized light patterns drifting against each other | `strength`, `spacing`, `seconds` | caustics |
| `streaks` | An occasional streak on a random path | `color`, `length`, `every` (pause range), `seconds` | shooting star |
| `blobs` | Soft colour blobs drifting and scaling (radial gradients) | `colors`, `count`, `seconds`, `opacity` | new: #218's "ambient blobs" |

- **Tinting** is how one asset serves both modes and many colours. A `sprites`
  entry with `tint` is drawn with CSS `mask-image: url(asset)` over that colour,
  so a one-colour silhouette (kelp, fan, whips) can be any colour. Multi-colour
  assets (anemones) are drawn as plain images, with one file per mode.
- **Each layer module exports `{ name, schema, Component }`.** `schema` declares
  every option's type and limits (enum, number range, colour, asset path,
  position list), and `validateThemePackage` checks entries against it. That
  replaces `AMBIENCE_SCHEMA` and the test that kept it in step with the effects.
- **Engine-wide limits:**
  - 12 layers per theme;
  - 40 particles per layer, 16 sprite positions, 400 dots;
  - durations between 1 and 120 seconds.
- **Engine-wide rules** are written once in `motion.js` and enforced for every
  layer: only `transform` and `opacity` animate, reduced motion stops animation,
  nothing renders while inactive, no blend modes or `backdrop-filter`, and
  positions are seeded so every display shows the same scene.

### 3.5 Why assets are safe

Theme assets are never run:
- They are drawn only through `<img src>` or a CSS `mask-image` /
  `background-image` URL. In both, an SVG's scripts don't execute and its
  external references aren't loaded.
- `src` must be a relative path to an `.svg`, `.png`, `.webp` or `.jpg` file
  inside the theme's own folder.
- Token values stay as strict as today. `url()` is still refused in tokens;
  assets come in only through `src`, which the engine resolves.

### 3.6 Loading

- `AmbienceLayer` is loaded with `React.lazy` from `WidgetContainer.jsx` and
  `MobileDashboard.jsx`, and only rendered when the theme has layers for the
  current mode. A Classic display never downloads the engine.
- `ThemeContext` moves to `engine/ThemeContext.js`, so `app.jsx` doesn't pull
  the engine in.
- Asset files download only when a layer that uses them renders.

### 3.7 Validation

`validateThemePackage(pkg, { assets })` takes the theme's file list:
- It checks fonts and `src` paths against the files present, and checks each
  layer against its building block's `schema`.
- Token, MUI and manifest-field checks are unchanged.
- The function is pure and has no browser dependency, so a future theme store
  can run the same check on the server.

## 4. Re-authoring Reef and Starship

- **Generate the assets from today's components** with a one-off script using
  `react-dom/server`'s `renderToStaticMarkup`, so the shapes come out exactly
  the same:
  - `ReefBase` rendered with the `sand` palette gives `reef-day.svg`, and with
    the `night` palette `reef-night.svg`;
  - `KelpStalk`, `SeaFan` and `SeaWhips` drawn in a single colour give the
    tintable silhouettes;
  - `Anemone` with each palette gives the two-colour files;
  - the bubble is drawn as `bubble.svg`.
- **Move the numbers into the manifests.** Positions, heights, sway angles,
  durations and delays come from `Seafloor`; counts and ranges from `Bubbles`
  and `Starfield`; the stellar colour list from `Starfield`; the caustic
  spacing and alpha from `Caustics`. They go into `reef/theme.json` and
  `starship/theme.json`, mode by mode.
- Delete `themes/ambience.jsx` and `themes/ambience.test.js`.

## 5. Manifest version

No theme packages exist outside this repository yet, so the `fonts` and
`ambience` shapes can change under `manifestVersion` 1. Once community themes
can be installed, any further change to these shapes needs a version bump.

Version history:
- **1:** tokens, fonts, ambience, confetti.
- **2:** ornaments, the meter roles (`--hg-meter-*`) and clumped sprites
  (`clumps`, `clumpWidth`). A theme that uses them declares
  `manifestVersion: 2`. A core accepts versions up to its own
  (`MANIFEST_VERSION` in `utils/themes.js` and `services/themeStore.js`), refuses
  newer ones at install, and its store lists them apart as needing a newer
  HomeGlow.
- **3:** the button roles (`--hg-button-*`), which plugins draw their buttons
  with, and curved flyby crossings (`path`, `count`, `begin` and the options
  that go with them).
- **4:** weather scenes (`weather`: a `default` scene and `scenes` keyed by
  condition, each with colors, tokens, ambience and confetti over the
  theme's), and the `flash` layer for lightning (issue #247). `resolveTheme`
  takes the scene to show; `app.jsx` picks it from the condition at the
  appearance location (`utils/weatherScenes.js`, `utils/useWeatherCondition.js`).
- **5:** orbits (`path: orbit` with `focusX`, `focusY`, `eccentricity` and
  `direction`): every picture in a layer circles one focus, the same way round.

## 6. Implementation order

1. **PR 1, no visual change:** theme folders and discovery (§3.1 to §3.2) and
   fonts in folders (§3.3). Classic, Starship and Reef should look the same.
2. **PR 2:** the engine and building blocks (§3.4 to §3.7), Reef and Starship
   re-authored (§4), `ambience.jsx` deleted, and a theme author's guide at
   `docs/guides/theme-development.md`: folder layout, manifest, token types,
   each layer and its options, assets and fonts, the performance rules, and
   Reef and Starship as examples.

## 7. Verification

- **Unit tests (vitest):**
  - every built-in theme folder passes `validateThemePackage` with its own file
    list;
  - every layer's schema rejects bad options and any `src` that is missing or
    outside the folder;
  - discovery puts Classic first;
  - a fake theme folder appears without editing any other file;
  - font entries are validated;
  - `utils/themes.test.js` and `utils/appearance.test.js` still pass.
- **Visual parity:**
  - capture Playwright screenshots of Reef (light and dark) and Starship at
    1280×800 and 390×844 before and after, with animations frozen
    (`animation-play-state: paused` and a fixed time), and compare;
  - Classic must be pixel-identical.
- **Frame rate:** in Chromium with 4× CPU throttling (CDP
  `Emulation.setCPUThrottlingRate`), count `requestAnimationFrame` frames over
  10 seconds. Reef and Starship should hold about 60 fps, as #226 measured.
- **Reduced motion:** with `prefers-reduced-motion: reduce` emulated, nothing
  animates.
- **Bundle:**
  - the `app` chunk no longer contains the Reef art;
  - a Classic display requests no engine chunk;
  - a Reef display requests only Reef's assets.
- **Suites:** client and server tests, `npm run check:i18n` and
  `npm run build` all pass.

## 8. Out of scope, and open questions

- **Installing community themes**, as plugins are installed from
  `jherforth/HomeGlowPlugins`, is out of scope. The folder format is what such a
  store would serve, and the server would run the same validator. Still open:
  whether themes live in the plugins repository (`themes/`) or a repository of
  their own.
- **A canvas building block** for effects CSS can't do well, such as true shape
  morphing, would be one more layer type behind the same registry and schema.
  Blobs start as CSS transforms.
- **Recolouring multi-colour SVGs** (palette substitution) is deferred. For now,
  multi-colour assets ship one file per mode, and one-colour silhouettes use
  `tint`.

## 9. As built

Differences from §3, each for a reason found while building it:

- **Layer schemas live in `engine/schemas.js`**, as data, not in each layer
  module. Validation runs in the main bundle, and importing the layer modules
  there would pull the engine into every display, defeating §3.6.
  `engine.test.js` keeps the schemas and `engine/layers/` in step.
- **Scenes vary.** Numbers in a layer may be ranges (`[low, high]`), sprites are
  placed by `count` and `span` rather than a fixed `at` list, and a manifest's
  `variety` picks the seed: `load` (default, a new scene each page load), `day`
  (shared by every display, new each day) or `fixed`. Each sprite moves on two
  uneven periods so its motion never repeats, and `current` adds a slow wave
  across a group. Section 7's screenshot parity is replaced by visual review,
  because a varying scene has no fixed frame to compare.
- **`sprites` takes `base`**, its distance from the bottom of the screen, so a
  theme can place things other than at the floor.
- **`sprites` can mix pictures.** `pictures` lists `{ src, aspect, height,
  tint, weight }` and each copy picks one; `motion` may be `none`, and `flip`
  mirrors copies at random. Any `src` or `tint` may differ by mode
  (`{ light, dark }`). Reef's coral scene is scattered this way instead of
  being one fixed picture, which also brings Reef to six layers from twelve.
- **Scenes vary in what is in them, not only where.** Any layer may set
  `chance` (0 to 1), drawn from its own seed so it never reshuffles the rest.
  `image` may pick its `src` from a list and turn it by a drawn `angle`.
  `sprites` take `lift` (placed anywhere, not only along a floor) and `hue` (a
  still filter, painted once). `streaks` take `burst` (a shower per pass). A
  new block, `flyby`, sends one picture across the screen every so often, with
  a drawn picture, side, height, climb, speed and tumble. Starship uses all of
  these: a sometimes-galaxy, up to three planets, ships, meteor storms and the
  odd drifting alien, at 60 fps with the CPU throttled 4x.

- **Reef and Starship live in the themes repository**, not the app.
  HomeGlow builds in only Classic, and installs other themes from
  [jherforth/HomeGlowThemes](https://github.com/jherforth/HomeGlowThemes) or
  a folder (Admin → Look → Themes). Offline, Classic is the normal mode.

Also as built: theme files are imported with `?no-inline`, because Vite inlines
small SVGs as data URLs, which put every theme's art in a chunk every display
loads.

