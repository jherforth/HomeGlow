import React, { Suspense, lazy, useContext } from 'react';
import { ThemeContext, ambienceFor } from './ThemeContext.js';

// The ambience engine downloads only when the theme has layers for the mode
// on screen, so a Classic display never fetches it.
const AmbienceLayer = lazy(() => import('./AmbienceLayer.jsx'));

export default function ThemeAmbience() {
  const { theme, mode, active } = useContext(ThemeContext);
  if (!active || ambienceFor(theme, mode).length === 0) return null;
  return (
    <Suspense fallback={null}>
      <AmbienceLayer />
    </Suspense>
  );
}
