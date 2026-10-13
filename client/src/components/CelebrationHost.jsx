import React, { useEffect, useRef, useState } from 'react';
import ChoreCelebration from './ChoreCelebration.jsx';
import { CELEBRATE_EVENT, createCelebrationGate } from '../utils/celebrations.js';

// Plays the board's celebration when the chore widget or a plugin asks
// (utils/celebrations.js). Mounted once, so a celebration is never two
// overlapping bursts, and it plays whether or not the chore widget is on the
// tab. `enabled` is the household's celebration setting (issue #140); the
// chore widget already checks it before asking, and plugins are held to it
// here.
const CelebrationHost = ({ enabled }) => {
  const [burst, setBurst] = useState(null);
  const gateRef = useRef(null);
  if (!gateRef.current) gateRef.current = createCelebrationGate();
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const onCelebrate = (event) => {
      if (!enabledRef.current) return;
      if (!gateRef.current.admit(event.detail?.source)) return;
      setBurst((current) => ({ id: (current?.id ?? 0) + 1 }));
    };
    window.addEventListener(CELEBRATE_EVENT, onCelebrate);
    return () => window.removeEventListener(CELEBRATE_EVENT, onCelebrate);
  }, []);

  if (!burst) return null;
  return (
    <ChoreCelebration
      key={burst.id}
      onDismiss={() => {
        gateRef.current.finished();
        setBurst(null);
      }}
    />
  );
};

export default CelebrationHost;
