import React, { createContext, useContext, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { keyframes } from '@emotion/react';

// Ambience: animated or decorative layers behind the widgets, switched on by a
// theme by name. Each effect is a built-in component (never theme-supplied
// code), animates only transform and opacity so the compositor does the work,
// stops for anyone who prefers reduced motion, and is not rendered while
// nobody can see the widgets (the photo screensaver).

export const ThemeContext = createContext({ theme: null, mode: 'light', active: true });

const reducedMotion = { '@media (prefers-reduced-motion: reduce)': { animation: 'none' } };

// Deterministic positions, so every display shows the same scene.
function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const rise = keyframes`
  0% { transform: translate3d(0, 0, 0); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translate3d(var(--drift), -115vh, 0); opacity: 0; }
`;

const BUBBLE_COUNTS = { low: 8, medium: 14, high: 22 };

function Bubbles({ density = 'medium' }) {
  const bubbles = useMemo(() => {
    const random = seeded(7);
    return Array.from({ length: BUBBLE_COUNTS[density] }, (_, index) => ({
      key: index,
      left: `${Math.round(random() * 100)}%`,
      size: 6 + Math.round(random() * 16),
      duration: 16 + Math.round(random() * 18),
      delay: -Math.round(random() * 30),
      drift: `${Math.round((random() - 0.5) * 80)}px`,
    }));
  }, [density]);

  return bubbles.map((b) => (
    <Box
      key={b.key}
      sx={{
        position: 'absolute',
        bottom: -30,
        left: b.left,
        width: b.size,
        height: b.size,
        borderRadius: '50%',
        border: '1px solid rgba(255, 255, 255, 0.4)',
        background: 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.05) 60%)',
        '--drift': b.drift,
        animation: `${rise} ${b.duration}s linear ${b.delay}s infinite`,
        willChange: 'transform, opacity',
        ...reducedMotion,
      }}
    />
  ));
}

const driftA = keyframes`
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-25%, -12%, 0); }
`;
const driftB = keyframes`
  from { transform: translate3d(-20%, -8%, 0); }
  to { transform: translate3d(0, 0, 0); }
`;

// Caustics: two oversized fields of soft light, drifting against each other.
// Plain alpha, not a blend mode: blending a full-screen layer every frame
// costs a slow GPU most of its frame rate.
const causticField = (spacing, alpha) => `radial-gradient(ellipse 60% 40% at 50% 50%, rgba(255, 255, 255, ${alpha}) 0%, rgba(255, 255, 255, 0) 70%) 0 0 / ${spacing}px ${spacing * 0.7}px`;

function Caustics({ strength = 'soft' }) {
  const alpha = strength === 'bright' ? 0.35 : 0.22;
  const layer = (spacing, animation) => ({
    position: 'absolute',
    inset: '-50%',
    background: causticField(spacing, alpha),
    animation,
    willChange: 'transform',
    ...reducedMotion,
  });
  return (
    <Box sx={{ position: 'absolute', inset: 0, opacity: 0.55 }}>
      <Box sx={layer(180, `${driftA} 38s ease-in-out infinite alternate`)} />
      <Box sx={layer(130, `${driftB} 29s ease-in-out infinite alternate`)} />
    </Box>
  );
}

const sway = keyframes`
  from { transform: rotate(var(--sway-from)); }
  to { transform: rotate(var(--sway-to)); }
`;

// The reef scene. Hard corals, rocks and sand are one static picture; every
// moving piece (kelp, sea fans, whips, anemones) is its own small element, so
// the browser rotates a composited layer each frame instead of repainting the
// whole scene.
const SEAFLOOR_PALETTES = {
  sand: {
    far: '#5bb4d0', rock: '#7fa3a3', rockShade: '#5f8585', sand: '#ecdcb0', sandShade: '#d9c592', shell: '#fff4e0',
    brain: '#e9a15a', brainGroove: '#b8702f', staghorn: '#f49ac2', table: '#c9a0dc', tableShade: '#a77cbd',
    pillar: '#e8c872', mushroom: '#ff9f80', tree: '#a26bd6', sponge: '#ffb84d', spongeInner: '#d98a1a',
    kelp: ['#3f8f6b', '#4d9e5a', '#6a9a3f'], fan: '#e2556b', whip: '#ff7a3d', anemone: '#ff8fb1', anemoneTip: '#ffd1e0',
  },
  night: {
    far: '#03223a', rock: '#062c40', rockShade: '#04202f', sand: '#062b3f', sandShade: '#052233', shell: '#0b3d55',
    brain: '#0b3a4e', brainGroove: '#062736', staghorn: '#0c3d52', table: '#0a3548', tableShade: '#072a3a',
    pillar: '#0b394c', mushroom: '#0d4257', tree: '#0a3a52', sponge: '#0c3f54', spongeInner: '#072c3c',
    kelp: ['#06384a', '#073f4f', '#0a4552'], fan: '#0b3c50', whip: '#0c4155', anemone: '#0b3f52', anemoneTip: '#3ee6ff',
  },
};

// One swaying piece, anchored at its base.
function Swaying({ left, heightVh, aspect, from, to, seconds, delay, children, viewBox }) {
  return (
    <Box
      component="svg"
      viewBox={viewBox}
      aria-hidden="true"
      sx={{
        position: 'absolute',
        bottom: '4vh',
        left,
        height: `${heightVh}vh`,
        width: `${heightVh * aspect}vh`,
        overflow: 'visible',
        transformOrigin: '50% 100%',
        '--sway-from': from,
        '--sway-to': to,
        animation: `${sway} ${seconds}s ease-in-out ${delay}s infinite alternate`,
        willChange: 'transform',
        ...reducedMotion,
      }}
    >
      {children}
    </Box>
  );
}

function KelpStalk({ color }) {
  // A wavy stalk with blades alternating left and right up its length.
  const blades = [250, 215, 180, 145, 110, 75, 42];
  return (
    <g>
      <path d="M30 300 C 22 240, 40 190, 28 140 S 36 60, 30 8" stroke={color} strokeWidth="5" fill="none" strokeLinecap="round" />
      {blades.map((y, i) => {
        const dir = i % 2 === 0 ? -1 : 1;
        return (
          <path
            key={y}
            d={`M30 ${y} q ${dir * 26} -14 ${dir * 30} -40 q ${dir * -12} 14 ${dir * -30} 40 Z`}
            fill={color}
            opacity="0.9"
          />
        );
      })}
      <ellipse cx="30" cy="8" rx="9" ry="14" fill={color} />
    </g>
  );
}

function SeaFan({ color }) {
  const ribs = [-62, -40, -18, 4, 26, 48, 66];
  return (
    <g fill="none" stroke={color} strokeLinecap="round">
      <path d="M100 200 L100 150" strokeWidth="6" />
      {ribs.map((deg) => {
        const r = (deg * Math.PI) / 180;
        return <path key={deg} d={`M100 150 Q ${100 + Math.sin(r) * 50} ${150 - Math.cos(r) * 60}, ${100 + Math.sin(r) * 92} ${150 - Math.cos(r) * 120}`} strokeWidth="3" />;
      })}
      {[60, 85, 110].map((rad) => (
        <path key={rad} d={`M ${100 - rad * 0.85} ${150 - rad * 0.55} Q 100 ${150 - rad * 1.25}, ${100 + rad * 0.85} ${150 - rad * 0.55}`} strokeWidth="1.5" opacity="0.8" />
      ))}
    </g>
  );
}

function SeaWhips({ color }) {
  return (
    <g fill="none" stroke={color} strokeWidth="4" strokeLinecap="round">
      <path d="M40 200 C 30 150, 50 100, 30 20" />
      <path d="M46 200 C 60 150, 40 90, 62 40" />
      <path d="M52 200 C 70 160, 76 120, 82 70" />
      <path d="M36 200 C 18 160, 12 120, 10 80" />
    </g>
  );
}

function Anemone({ color, tip }) {
  const tentacles = [-70, -50, -30, -12, 6, 24, 42, 60, 76];
  return (
    <g strokeLinecap="round">
      <path d="M30 100 Q 50 70 70 100 Z" fill={color} />
      {tentacles.map((deg) => {
        const r = (deg * Math.PI) / 180;
        const x = 50 + Math.sin(r) * 42;
        const y = 82 - Math.cos(r) * 46;
        return (
          <g key={deg}>
            <path d={`M50 84 Q ${50 + Math.sin(r) * 24} ${70 - Math.cos(r) * 30}, ${x} ${y}`} stroke={color} strokeWidth="5" fill="none" />
            <circle cx={x} cy={y} r="3.5" fill={tip} />
          </g>
        );
      })}
    </g>
  );
}

function ReefBase({ c }) {
  // Static: far reef, rocks, hard corals, sponges, soft tree coral, sand.
  return (
    <Box
      component="svg"
      viewBox="0 0 1200 300"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
    >
      <path d="M0 200 Q 120 150 240 185 T 480 170 T 720 180 T 960 160 T 1200 185 V300 H0Z" fill={c.far} opacity="0.55" />
      {/* Rocks */}
      <path d="M60 300 Q 70 230 140 225 Q 210 230 220 300 Z" fill={c.rock} />
      <path d="M140 225 Q 200 232 214 290" stroke={c.rockShade} strokeWidth="10" fill="none" opacity="0.6" />
      <path d="M880 300 Q 900 240 980 236 Q 1050 245 1060 300 Z" fill={c.rock} />
      {/* Table coral: tiered plates on a stem */}
      <path d="M432 300 L436 238 L446 238 L450 300 Z" fill={c.tableShade} />
      <ellipse cx="441" cy="238" rx="78" ry="12" fill={c.table} />
      <ellipse cx="441" cy="242" rx="78" ry="8" fill={c.tableShade} opacity="0.7" />
      <ellipse cx="441" cy="212" rx="52" ry="9" fill={c.table} />
      <path d="M438 238 L438 212" stroke={c.tableShade} strokeWidth="6" />
      {/* Brain coral */}
      <ellipse cx="300" cy="282" rx="56" ry="40" fill={c.brain} />
      <path d="M258 280 q 10 -22 22 -6 t 22 -4 t 22 6 t 18 -8 M262 296 q 14 -14 26 0 t 24 -2 t 26 4 M270 264 q 12 -16 26 -2 t 24 0 t 18 -6" stroke={c.brainGroove} strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* Staghorn coral: branching antlers */}
      <g stroke={c.staghorn} strokeWidth="9" strokeLinecap="round" fill="none">
        <path d="M640 300 L640 250 L620 214 L612 182" />
        <path d="M640 250 L664 212 L684 186" />
        <path d="M620 214 L598 198" />
        <path d="M664 212 L668 178" />
        <path d="M690 300 L692 262 L712 236 L724 206" />
        <path d="M692 262 L676 236" />
        <path d="M712 236 L736 230" />
      </g>
      {/* Pillar coral: rounded columns */}
      <g fill={c.pillar}>
        <rect x="1094" y="196" width="22" height="104" rx="11" />
        <rect x="1120" y="172" width="24" height="128" rx="12" />
        <rect x="1148" y="214" width="20" height="86" rx="10" />
      </g>
      {/* Tube sponges */}
      <g>
        <rect x="960" y="226" width="26" height="74" rx="9" fill={c.sponge} />
        <ellipse cx="973" cy="228" rx="11" ry="5" fill={c.spongeInner} />
        <rect x="990" y="246" width="22" height="54" rx="8" fill={c.sponge} />
        <ellipse cx="1001" cy="248" rx="9" ry="4" fill={c.spongeInner} />
      </g>
      {/* Soft tree coral: a bush of rounded lobes */}
      <g fill={c.tree}>
        <path d="M168 300 L176 262 L184 300 Z" />
        {[[176, 252, 16], [158, 262, 12], [194, 260, 13], [168, 236, 12], [188, 238, 11], [178, 222, 10]].map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />
        ))}
      </g>
      {/* Mushroom corals */}
      <ellipse cx="800" cy="292" rx="22" ry="9" fill={c.mushroom} />
      <ellipse cx="540" cy="294" rx="16" ry="7" fill={c.mushroom} />
      {/* Sand with ripples and shells */}
      <path d="M0 282 Q 150 268 300 280 T 600 276 T 900 282 T 1200 272 V300 H0Z" fill={c.sand} />
      <path d="M40 292 q 30 -6 60 0 M380 294 q 40 -6 80 0 M760 295 q 30 -5 60 0 M1040 292 q 40 -6 80 0" stroke={c.sandShade} strokeWidth="2" fill="none" />
      <circle cx="350" cy="292" r="3" fill={c.shell} />
      <circle cx="870" cy="294" r="2.5" fill={c.shell} />
      <path d="M600 294 q 6 -8 12 0 Z" fill={c.shell} />
    </Box>
  );
}

function Seafloor({ palette = 'sand' }) {
  const c = SEAFLOOR_PALETTES[palette];
  const kelp = [
    ['2%', 30, 0], ['6%', 22, -3], ['22%', 26, -5], ['35%', 18, -2],
    ['58%', 24, -6], ['77%', 34, -1], ['82%', 26, -4], ['95%', 30, -2],
  ];
  return (
    <Box aria-hidden="true" sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '42vh', opacity: 0.95 }}>
      <ReefBase c={c} />
      {kelp.map(([left, h, delay], i) => (
        <Swaying key={left} left={left} heightVh={h} aspect={0.2} viewBox="0 0 60 300" from="-4deg" to="4deg" seconds={7 + (i % 3)} delay={delay}>
          <KelpStalk color={c.kelp[i % c.kelp.length]} />
        </Swaying>
      ))}
      <Swaying left="49%" heightVh={15} aspect={1} viewBox="0 0 200 200" from="-2deg" to="2deg" seconds={9} delay={-3}>
        <SeaFan color={c.fan} />
      </Swaying>
      <Swaying left="70%" heightVh={11} aspect={1} viewBox="0 0 200 200" from="2deg" to="-2deg" seconds={10} delay={-1}>
        <SeaFan color={c.fan} />
      </Swaying>
      <Swaying left="13%" heightVh={14} aspect={0.5} viewBox="0 0 100 200" from="-5deg" to="5deg" seconds={6} delay={-2}>
        <SeaWhips color={c.whip} />
      </Swaying>
      <Swaying left="88%" heightVh={10} aspect={0.5} viewBox="0 0 100 200" from="4deg" to="-4deg" seconds={6.5} delay={-4}>
        <SeaWhips color={c.whip} />
      </Swaying>
      <Swaying left="28%" heightVh={6} aspect={1} viewBox="0 0 100 100" from="-6deg" to="6deg" seconds={4.5} delay={-1}>
        <Anemone color={c.anemone} tip={c.anemoneTip} />
      </Swaying>
      <Swaying left="64%" heightVh={5} aspect={1} viewBox="0 0 100 100" from="6deg" to="-6deg" seconds={5} delay={-2}>
        <Anemone color={c.anemone} tip={c.anemoneTip} />
      </Swaying>
    </Box>
  );
}

const twinkle = keyframes`
  from { opacity: 0.15; transform: scale(0.7); }
  to { opacity: 1; transform: scale(1); }
`;

// One pass of a shooting star: placed at its start, turned to its heading,
// then carried forward along that heading. The streak is drawn tail-first,
// so the tail always points straight back along the path.
const shoot = keyframes`
  0% { opacity: 0; transform: translate(var(--x0), var(--y0)) rotate(var(--heading)) translateX(0); }
  12% { opacity: 1; }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--x0), var(--y0)) rotate(var(--heading)) translateX(var(--travel)); }
`;

// A new path each pass: a random start near the top, a heading that carries
// it into the screen, a length and a speed, then a random pause.
function nextPass() {
  const fromLeft = Math.random() < 0.5;
  const heading = fromLeft ? 15 + Math.random() * 55 : 110 + Math.random() * 55;
  return {
    id: Math.random(),
    x0: `${Math.round((fromLeft ? -5 : 45) + Math.random() * 60)}vw`,
    y0: `${Math.round(-5 + Math.random() * 45)}vh`,
    heading: `${Math.round(heading)}deg`,
    travel: `${Math.round(30 + Math.random() * 35)}vw`,
    length: Math.round(90 + Math.random() * 110),
    seconds: (1 + Math.random() * 1.4).toFixed(2),
    pause: (10 + Math.random() * 20).toFixed(1),
  };
}

const prefersReducedMotion = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function ShootingStar() {
  const [pass, setPass] = useState(nextPass);
  const [still] = useState(prefersReducedMotion);
  if (still) return null;
  return (
    <Box
      key={pass.id}
      onAnimationEnd={() => setPass(nextPass())}
      sx={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: pass.length,
        height: 2,
        marginLeft: `-${pass.length}px`,
        transformOrigin: '100% 50%',
        borderRadius: 2,
        background: 'linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(220, 235, 255, 0.55) 70%, #ffffff)',
        boxShadow: '0 0 6px rgba(200, 220, 255, 0.6)',
        opacity: 0,
        '--x0': pass.x0,
        '--y0': pass.y0,
        '--heading': pass.heading,
        '--travel': pass.travel,
        animation: `${shoot} ${pass.seconds}s ease-in ${pass.pause}s 1 both`,
        willChange: 'transform, opacity',
      }}
    />
  );
}

const STAR_COUNTS = { low: 120, medium: 220, high: 360 };

// Starfield: a still field painted once (no animation), a few bright stars
// that twinkle, and now and then a shooting star. A drifting field would
// need large moving layers, which a small GPU pays for in memory.
function Starfield({ density = 'medium' }) {
  const { stars, bright } = useMemo(() => {
    const random = seeded(11);
    // Stellar colors, hottest to coolest (O/B, A, F, G, K, M), weighted
    // roughly as they appear to the eye: mostly white and pale, some blue,
    // some yellow, a few orange and red.
    const tints = [
      '#9bb0ff', '#aabfff', '#cad7ff', '#cad7ff', '#f8f7ff', '#f8f7ff', '#f8f7ff', '#ffffff',
      '#fff4ea', '#fff4ea', '#ffe9c4', '#ffd2a1', '#ffd2a1', '#ffb56c', '#ff9b5e',
    ];
    const pick = () => tints[Math.floor(random() * tints.length)];
    return {
      stars: Array.from({ length: STAR_COUNTS[density] }, (_, key) => ({
        key,
        x: Math.round(random() * 1000),
        y: Math.round(random() * 600),
        r: (random() < 0.85 ? 0.6 : 1.1) + random() * 0.4,
        o: 0.35 + random() * 0.6,
        fill: pick(),
      })),
      bright: Array.from({ length: 16 }, (_, key) => ({
        key,
        left: `${Math.round(random() * 100)}%`,
        top: `${Math.round(random() * 85)}%`,
        size: 2 + Math.round(random() * 2),
        duration: 2 + random() * 4,
        delay: -random() * 6,
        color: pick(),
      })),
    };
  }, [density]);

  return (
    <>
      <Box
        component="svg"
        viewBox="0 0 1000 600"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        {stars.map((s) => <circle key={s.key} cx={s.x} cy={s.y} r={s.r} fill={s.fill} opacity={s.o} />)}
      </Box>
      {bright.map((s) => (
        <Box
          key={s.key}
          sx={{
            position: 'absolute',
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            borderRadius: '50%',
            background: s.color,
            boxShadow: `0 0 6px 2px ${s.color}`,
            animation: `${twinkle} ${s.duration}s ease-in-out ${s.delay}s infinite alternate`,
            willChange: 'transform, opacity',
            ...reducedMotion,
          }}
        />
      ))}
      <ShootingStar />
    </>
  );
}

const EFFECTS = { bubbles: Bubbles, caustics: Caustics, seafloor: Seafloor, starfield: Starfield };

// Pinned to AMBIENCE_SCHEMA by ambience.test.js: every effect a theme may
// name has a component, and nothing else does.
export const AMBIENCE_EFFECT_NAMES = Object.keys(EFFECTS);

/** The active theme's ambience for the displayed mode, behind the widgets. */
export function AmbienceLayer() {
  const { theme, mode, active } = useContext(ThemeContext);
  const effects = (theme?.ambience || []).filter((entry) => !entry.modes || entry.modes.includes(mode));
  if (!active || effects.length === 0) return null;
  return (
    <Box
      aria-hidden="true"
      data-hg-ambience=""
      sx={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      {effects.map((entry, index) => {
        const Effect = EFFECTS[entry.effect];
        return Effect ? <Effect key={`${entry.effect}-${index}`} {...entry.options} /> : null;
      })}
    </Box>
  );
}
