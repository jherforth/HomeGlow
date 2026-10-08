import React, { useContext, useMemo } from 'react';
import { Box } from '@mui/material';
import { ThemeContext, ambienceFor } from './ThemeContext.js';
import { LAYERS } from './registry.js';
import { reducedMotion, sceneSeed, seededRandom } from './motion.js';
import { keyframes } from '@emotion/react';

// A new weather scene (#247) fades in over the old look rather than cutting.
const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

// Draws the active theme's ambience for the displayed mode, behind the
// widgets, in the order the theme lists it. Loaded only when a theme has
// ambience (see WidgetContainer), so Classic never downloads the engine.
// Each layer gets its own random source from the scene's seed, so adding a
// layer to a theme doesn't reshuffle the others. Whether a layer with a
// `chance` is in the scene is drawn from a separate source, for the same reason.
export default function AmbienceLayer() {
  const { theme, mode, active } = useContext(ThemeContext);
  const layers = ambienceFor(theme, mode);
  // A weather scene is a scene of its own: its own seed, so each kind of
  // weather varies independently, and its own keys, so it is drawn afresh.
  const scene = theme?.scene ? `${theme.id}:${theme.scene}` : theme?.id;
  const seed = useMemo(() => sceneSeed(theme?.variety, scene), [scene, theme?.variety]);
  const sources = useMemo(
    () => layers.map((_, i) => seededRandom(seed + i * 7919)),
    [seed, layers.length, mode],
  );
  const shown = useMemo(
    () => layers.map((options, i) => options.chance === undefined || seededRandom(seed + i * 7919 + 104729)() < options.chance),
    [seed, layers.length, mode],
  );
  if (!active || layers.length === 0) return null;
  const assets = theme.ambienceAssets || {};
  return (
    // As wide as the window including its scrollbar (100vw), not the space
    // beside it: a dialog hides the scrollbar, and a scene sized to the space
    // would grow by its width and every star would shift.
    <Box
      key={scene}
      aria-hidden="true"
      data-hg-ambience=""
      data-hg-scene={theme.scene || undefined}
      sx={{
        position: 'fixed', top: 0, bottom: 0, left: 0, width: '100vw', overflow: 'hidden', pointerEvents: 'none',
        ...(theme.scene ? { animation: `${fadeIn} 2.5s ease-out`, ...reducedMotion } : {}),
      }}
    >
      {layers.map((options, i) => {
        const Layer = LAYERS[options.layer];
        return Layer && shown[i] ? (
          <Box key={`${scene}-${mode}-${i}`} sx={{ position: 'absolute', inset: 0 }}>
            <Layer options={options} assets={assets} random={sources[i]} mode={mode} />
          </Box>
        ) : null;
      })}
    </Box>
  );
}
