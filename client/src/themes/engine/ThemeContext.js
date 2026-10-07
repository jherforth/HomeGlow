import { createContext } from 'react';

// The active theme, the mode it is showing, and whether anyone can see the
// widgets (false while the photo screensaver covers them). Kept apart from the
// engine so app.jsx can provide it without loading the engine.
export const ThemeContext = createContext({ theme: null, mode: 'light', active: true });

/** The theme's ambience layers for a mode (cheap; decides whether to load the engine). */
export function ambienceFor(theme, mode) {
  return (theme?.ambience || []).filter((layer) => !layer.modes || layer.modes.includes(mode));
}
