#!/usr/bin/env node
// Builds assets/places/places.tsv.gz, the offline town list that names where
// a photo was taken (services/placeLookup.js), from two GeoNames files:
//
//   https://download.geonames.org/export/dump/cities1000.zip  (unzip it)
//   https://download.geonames.org/export/dump/admin1CodesASCII.txt
//
//   node scripts/build-places.js <cities1000.txt> <admin1CodesASCII.txt>
//
// Each line of the output is: latitude, longitude, population, town, state or
// region, country code, tab separated. GeoNames data is CC BY 4.0
// (assets/places/README.md).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const [citiesPath, admin1Path] = process.argv.slice(2);
if (!citiesPath || !admin1Path) {
  console.error('usage: node scripts/build-places.js <cities1000.txt> <admin1CodesASCII.txt>');
  process.exit(1);
}

// 'US.NY' -> 'New York'
const regions = new Map();
for (const line of fs.readFileSync(admin1Path, 'utf8').split('\n')) {
  const [code, name] = line.split('\t');
  if (code && name) regions.set(code, name.trim());
}

// Historical, abandoned and destroyed places, and parts of a town (PPLX),
// would name a photo after somewhere that isn't the town it was taken in.
const SKIP_CODES = new Set(['PPLH', 'PPLQ', 'PPLW', 'PPLX', 'PPLCH']);
const clean = (value) => String(value || '').replace(/[\t\r\n]/g, ' ').trim();

const towns = [];
let skipped = 0;
for (const line of fs.readFileSync(citiesPath, 'utf8').split('\n')) {
  const f = line.split('\t');
  if (f.length < 15) continue;
  const lat = Number(f[4]);
  const lon = Number(f[5]);
  const name = clean(f[1]);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || SKIP_CODES.has(f[7])) {
    skipped += 1;
    continue;
  }
  const country = clean(f[8]).toUpperCase();
  towns.push({ lat, lon, name, country, population: Number(f[14]) || 0, region: clean(regions.get(`${country}.${f[10]}`)) });
}

// A numbered district is named for its city: "Paris 16 Passy" is Paris, as
// are Lyon's and Marseille's arrondissements.
const names = new Set(towns.map((town) => `${town.country}|${town.name}`));
let folded = 0;
for (const town of towns) {
  const base = /^(.+?) \d{1,2}(?: .*)?$/.exec(town.name)?.[1];
  if (base && names.has(`${town.country}|${base}`)) {
    town.name = base;
    folded += 1;
  }
}

const rows = towns.map((town) => [town.lat.toFixed(3), town.lon.toFixed(3), town.population, town.name, town.region, town.country].join('\t'));
const out = path.join(__dirname, '..', 'assets', 'places', 'places.tsv.gz');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, zlib.gzipSync(rows.join('\n') + '\n', { level: 9 }));
console.log(`${rows.length} places (${skipped} skipped, ${folded} districts named for their city) -> ${out} (${fs.statSync(out).size} bytes)`);
