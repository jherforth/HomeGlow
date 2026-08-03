// Dev-only generator for the bundled default profile avatars (issue #132).
//
// Produces flat, self-authored SVG art (no third-party images / no licensing
// concerns) under server/assets/avatars/. The committed .svg output is what
// the server seeds into uploads/users/defaults/ at startup, so runtime never
// depends on this script. Re-run it only to regenerate/tweak the set:
//
//   node server/scripts/generateDefaultAvatars.js
//
// The set: mom / dad / girl / boy in five skin tones each, plus a bank of
// animals and fun characters kids can pick.
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'avatars');

// Five skin tones (light → deep) with a matching shadow + hair color.
const TONES = [
  { skin: '#FFDBAC', shade: '#EFC190', hair: '#D99E3B' },
  { skin: '#F1C27D', shade: '#E0AC69', hair: '#8C5A2B' },
  { skin: '#E0AC69', shade: '#C68642', hair: '#5A3A22' },
  { skin: '#C68642', shade: '#A9713A', hair: '#3B2417' },
  { skin: '#8D5524', shade: '#744318', hair: '#241610' },
];

// Pastel circle backgrounds, cycled by tone so the grid reads varied.
const BGS = ['#EAF4FF', '#E8F7E9', '#FFF2DE', '#F3E9FF', '#FFE9E3'];

const INK = '#33272A';

const svgOpen = (bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">\n` +
  `<defs><clipPath id="c"><circle cx="64" cy="64" r="64"/></clipPath></defs>\n` +
  `<g clip-path="url(#c)">\n<circle cx="64" cy="64" r="64" fill="${bg}"/>\n`;
const svgClose = `</g>\n</svg>\n`;

const face = () =>
  `<circle cx="55" cy="63" r="3" fill="${INK}"/>\n` +
  `<circle cx="73" cy="63" r="3" fill="${INK}"/>\n` +
  `<path d="M56 72 Q64 80 72 72" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>\n` +
  `<circle cx="49" cy="70" r="4.5" fill="#FF8FA3" opacity="0.4"/>\n` +
  `<circle cx="79" cy="70" r="4.5" fill="#FF8FA3" opacity="0.4"/>\n`;

// Shared person scaffold: neck + shoulders + head, with per-style hair layers
// slotted behind (backHair) and in front of (frontHair) the head.
function person({ tone, shirt, bg, backHair = '', frontHair = '', extras = '' }) {
  return (
    svgOpen(bg) +
    backHair +
    `<rect x="56" y="80" width="16" height="20" rx="6" fill="${tone.shade}"/>\n` +
    `<ellipse cx="64" cy="118" rx="32" ry="22" fill="${shirt}"/>\n` +
    `<circle cx="64" cy="64" r="26" fill="${tone.skin}"/>\n` +
    frontHair +
    face() +
    extras +
    svgClose
  );
}

// Hair cap: the top of the head circle closed with a shallow fringe curve, so
// it always hugs the head outline; styles differ in band depth and add-ons.
const cap = (tone, y) =>
  `<path d="M38.5 ${y} A26 26 0 0 1 89.5 ${y} Q64 ${y - 9} 38.5 ${y} Z" fill="${tone.hair}"/>\n`;

function momAvatar(tone, i) {
  const backHair =
    `<rect x="33" y="38" width="62" height="66" rx="27" fill="${tone.hair}"/>\n`;
  const frontHair = cap(tone, 58);
  return person({ tone, shirt: '#E85D75', bg: BGS[i], backHair, frontHair });
}

function dadAvatar(tone, i) {
  const frontHair =
    cap(tone, 54) +
    `<rect x="38" y="50" width="5" height="14" rx="2.5" fill="${tone.hair}"/>\n` +
    `<rect x="85" y="50" width="5" height="14" rx="2.5" fill="${tone.hair}"/>\n`;
  return person({ tone, shirt: '#2F8F83', bg: BGS[i], frontHair });
}

function girlAvatar(tone, i) {
  const backHair =
    `<circle cx="31" cy="66" r="11" fill="${tone.hair}"/>\n` +
    `<circle cx="97" cy="66" r="11" fill="${tone.hair}"/>\n` +
    `<circle cx="37" cy="57" r="4" fill="#FF5D8F"/>\n` +
    `<circle cx="91" cy="57" r="4" fill="#FF5D8F"/>\n`;
  const frontHair = cap(tone, 56);
  return person({ tone, shirt: '#8E6FD8', bg: BGS[i], backHair, frontHair });
}

function boyAvatar(tone, i) {
  const backHair =
    `<polygon points="50,40 54,26 60,38" fill="${tone.hair}"/>\n` +
    `<polygon points="60,37 66,24 72,37" fill="${tone.hair}"/>\n` +
    `<polygon points="70,38 76,27 80,41" fill="${tone.hair}"/>\n`;
  const frontHair = cap(tone, 52);
  return person({ tone, shirt: '#4C9F4F', bg: BGS[i], backHair, frontHair });
}

// --- Animals & fun characters -----------------------------------------------

const dot = (x, y, r = 3) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/>\n`;
const smile = (x1, x2, y, dip = 8) =>
  `<path d="M${x1} ${y} Q${(x1 + x2) / 2} ${y + dip} ${x2} ${y}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>\n`;

const catAvatar = () =>
  svgOpen('#FFF2DE') +
  `<polygon points="38,52 33,22 60,40" fill="#8E97A8"/>\n` +
  `<polygon points="90,52 95,22 68,40" fill="#8E97A8"/>\n` +
  `<polygon points="41,47 38,29 55,41" fill="#F5B8C4"/>\n` +
  `<polygon points="87,47 90,29 73,41" fill="#F5B8C4"/>\n` +
  `<circle cx="64" cy="70" r="30" fill="#9AA2B1"/>\n` +
  dot(53, 64) + dot(75, 64) +
  `<polygon points="60,73 68,73 64,78" fill="#F08599"/>\n` +
  `<path d="M64 78 Q60 84 55 81 M64 78 Q68 84 73 81" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>\n` +
  `<g stroke="#6F7684" stroke-width="2" stroke-linecap="round">\n` +
  `<line x1="24" y1="66" x2="42" y2="68"/><line x1="24" y1="76" x2="42" y2="74"/>\n` +
  `<line x1="104" y1="66" x2="86" y2="68"/><line x1="104" y1="76" x2="86" y2="74"/>\n</g>\n` +
  svgClose;

const dogAvatar = () =>
  svgOpen('#EAF4FF') +
  `<ellipse cx="34" cy="58" rx="11" ry="19" fill="#8A5A33" transform="rotate(14 34 58)"/>\n` +
  `<ellipse cx="94" cy="58" rx="11" ry="19" fill="#8A5A33" transform="rotate(-14 94 58)"/>\n` +
  `<circle cx="64" cy="68" r="30" fill="#C89B6C"/>\n` +
  dot(53, 60) + dot(75, 60) +
  `<ellipse cx="64" cy="80" rx="15" ry="11" fill="#EBD8BC"/>\n` +
  `<circle cx="64" cy="75" r="4.5" fill="#3A2B20"/>\n` +
  `<path d="M64 79 L64 84 M64 84 Q58 88 55 84 M64 84 Q70 88 73 84" fill="none" stroke="#3A2B20" stroke-width="2.2" stroke-linecap="round"/>\n` +
  `<rect x="60" y="88" width="8" height="9" rx="4" fill="#F08599"/>\n` +
  svgClose;

const fishAvatar = () =>
  svgOpen('#DDF1FF') +
  `<polygon points="82,68 104,50 104,86" fill="#E56F1F"/>\n` +
  `<ellipse cx="58" cy="68" rx="28" ry="20" fill="#FF8A3C"/>\n` +
  `<path d="M52 48 Q60 38 70 46 L64 52 Z" fill="#E56F1F"/>\n` +
  `<path d="M66 52 Q76 60 74 82 Q68 84 64 82" fill="#FFB877" opacity="0.7"/>\n` +
  `<circle cx="44" cy="62" r="6" fill="#fff"/>\n` +
  `<circle cx="45" cy="63" r="3" fill="${INK}"/>\n` +
  `<path d="M36 74 Q40 78 44 75" fill="none" stroke="#98421B" stroke-width="2.2" stroke-linecap="round"/>\n` +
  `<circle cx="92" cy="36" r="4" fill="none" stroke="#8FC6E8" stroke-width="2"/>\n` +
  `<circle cx="100" cy="26" r="2.5" fill="none" stroke="#8FC6E8" stroke-width="2"/>\n` +
  svgClose;

const alpacaAvatar = () =>
  svgOpen('#E8F7E9') +
  `<polygon points="52,38 48,20 60,32" fill="#E4D2BC"/>\n` +
  `<polygon points="76,38 80,20 68,32" fill="#E4D2BC"/>\n` +
  `<rect x="52" y="52" width="24" height="48" rx="11" fill="#F2E6D8"/>\n` +
  `<circle cx="46" cy="104" r="11" fill="#F2E6D8"/>\n` +
  `<circle cx="64" cy="108" r="12" fill="#F2E6D8"/>\n` +
  `<circle cx="82" cy="104" r="11" fill="#F2E6D8"/>\n` +
  `<ellipse cx="64" cy="52" rx="18" ry="16" fill="#F2E6D8"/>\n` +
  `<circle cx="52" cy="36" r="8" fill="#F2E6D8"/>\n` +
  `<circle cx="64" cy="32" r="9" fill="#F2E6D8"/>\n` +
  `<circle cx="76" cy="36" r="8" fill="#F2E6D8"/>\n` +
  dot(56, 50, 2.6) + dot(72, 50, 2.6) +
  `<ellipse cx="64" cy="60" rx="8" ry="6" fill="#E4CDB4"/>\n` +
  `<path d="M60 60 Q64 64 68 60" fill="none" stroke="#8A6B4D" stroke-width="2" stroke-linecap="round"/>\n` +
  `<circle cx="50" cy="56" r="3.5" fill="#FF8FA3" opacity="0.45"/>\n` +
  `<circle cx="78" cy="56" r="3.5" fill="#FF8FA3" opacity="0.45"/>\n` +
  svgClose;

const chickenAvatar = () =>
  svgOpen('#FFF3C4') +
  `<circle cx="54" cy="36" r="7" fill="#E2574C"/>\n` +
  `<circle cx="64" cy="31" r="8" fill="#E2574C"/>\n` +
  `<circle cx="74" cy="36" r="7" fill="#E2574C"/>\n` +
  `<circle cx="64" cy="72" r="30" fill="#FAF6EF"/>\n` +
  dot(53, 64) + dot(75, 64) +
  `<polygon points="56,72 64,68 72,72 64,80" fill="#F5A623"/>\n` +
  `<ellipse cx="64" cy="86" rx="5" ry="6" fill="#E2574C"/>\n` +
  `<path d="M40 96 Q46 90 52 96 M76 96 Q82 90 88 96" fill="none" stroke="#E8DFC9" stroke-width="3" stroke-linecap="round"/>\n` +
  svgClose;

const dinoAvatar = () =>
  svgOpen('#E8F7E9') +
  `<polygon points="42,44 50,22 58,42" fill="#4E9A44"/>\n` +
  `<polygon points="60,40 68,18 76,40" fill="#4E9A44"/>\n` +
  `<polygon points="78,44 86,26 92,48" fill="#4E9A44"/>\n` +
  `<circle cx="64" cy="70" r="30" fill="#6BBF59"/>\n` +
  `<circle cx="52" cy="62" r="8" fill="#fff"/>\n` +
  `<circle cx="54" cy="63" r="3.5" fill="${INK}"/>\n` +
  `<circle cx="76" cy="62" r="8" fill="#fff"/>\n` +
  `<circle cx="74" cy="63" r="3.5" fill="${INK}"/>\n` +
  dot(58, 80, 2) + dot(70, 80, 2) +
  smile(52, 76, 86, 7) +
  svgClose;

const robotAvatar = () =>
  svgOpen('#E3EDF6') +
  `<line x1="64" y1="44" x2="64" y2="28" stroke="#6F8296" stroke-width="3"/>\n` +
  `<circle cx="64" cy="24" r="5" fill="#E2574C"/>\n` +
  `<rect x="30" y="56" width="8" height="16" rx="3" fill="#6F8296"/>\n` +
  `<rect x="90" y="56" width="8" height="16" rx="3" fill="#6F8296"/>\n` +
  `<rect x="36" y="42" width="56" height="48" rx="11" fill="#9FB4C7"/>\n` +
  `<circle cx="52" cy="62" r="6.5" fill="#2E3D4D"/>\n` +
  `<circle cx="54" cy="60" r="2" fill="#BDE3FF"/>\n` +
  `<circle cx="76" cy="62" r="6.5" fill="#2E3D4D"/>\n` +
  `<circle cx="78" cy="60" r="2" fill="#BDE3FF"/>\n` +
  `<rect x="52" y="76" width="24" height="5" rx="2.5" fill="#2E3D4D"/>\n` +
  `<rect x="44" y="96" width="40" height="14" rx="6" fill="#7E93A8"/>\n` +
  svgClose;

const unicornAvatar = () =>
  svgOpen('#F6E3FF') +
  `<polygon points="64,14 57,44 71,44" fill="#F2C14E"/>\n` +
  `<line x1="60" y1="30" x2="69" y2="26" stroke="#D9A62E" stroke-width="2"/>\n` +
  `<line x1="58" y1="38" x2="70" y2="34" stroke="#D9A62E" stroke-width="2"/>\n` +
  `<polygon points="44,50 40,30 56,42" fill="#FDF7FA"/>\n` +
  `<polygon points="84,50 88,30 72,42" fill="#FDF7FA"/>\n` +
  `<circle cx="42" cy="52" r="9" fill="#D98BD1"/>\n` +
  `<circle cx="36" cy="66" r="8" fill="#B77FE0"/>\n` +
  `<circle cx="34" cy="80" r="7" fill="#8FB8F0"/>\n` +
  `<circle cx="64" cy="70" r="27" fill="#FDF7FA"/>\n` +
  dot(56, 64, 2.8) + dot(76, 64, 2.8) +
  smile(58, 74, 76, 7) +
  `<circle cx="52" cy="72" r="4" fill="#FF8FA3" opacity="0.4"/>\n` +
  `<circle cx="80" cy="72" r="4" fill="#FF8FA3" opacity="0.4"/>\n` +
  svgClose;

const frogAvatar = () =>
  svgOpen('#FFF2DE') +
  `<circle cx="46" cy="46" r="12" fill="#58B368"/>\n` +
  `<circle cx="46" cy="44" r="7" fill="#fff"/>\n` +
  `<circle cx="46" cy="45" r="3.2" fill="${INK}"/>\n` +
  `<circle cx="82" cy="46" r="12" fill="#58B368"/>\n` +
  `<circle cx="82" cy="44" r="7" fill="#fff"/>\n` +
  `<circle cx="82" cy="45" r="3.2" fill="${INK}"/>\n` +
  `<ellipse cx="64" cy="76" rx="32" ry="26" fill="#58B368"/>\n` +
  dot(56, 70, 2) + dot(72, 70, 2) +
  smile(48, 80, 80, 10) +
  `<circle cx="46" cy="80" r="4.5" fill="#FF8FA3" opacity="0.45"/>\n` +
  `<circle cx="82" cy="80" r="4.5" fill="#FF8FA3" opacity="0.45"/>\n` +
  svgClose;

// -----------------------------------------------------------------------------

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = {};

  TONES.forEach((tone, i) => {
    files[`mom-${i + 1}.svg`] = momAvatar(tone, i);
    files[`dad-${i + 1}.svg`] = dadAvatar(tone, i);
    files[`girl-${i + 1}.svg`] = girlAvatar(tone, i);
    files[`boy-${i + 1}.svg`] = boyAvatar(tone, i);
  });

  files['cat.svg'] = catAvatar();
  files['dog.svg'] = dogAvatar();
  files['fish.svg'] = fishAvatar();
  files['alpaca.svg'] = alpacaAvatar();
  files['chicken.svg'] = chickenAvatar();
  files['dino.svg'] = dinoAvatar();
  files['robot.svg'] = robotAvatar();
  files['unicorn.svg'] = unicornAvatar();
  files['frog.svg'] = frogAvatar();

  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(OUT_DIR, name), content);
  }
  console.log(`Wrote ${Object.keys(files).length} avatars to ${OUT_DIR}`);
}

main();
