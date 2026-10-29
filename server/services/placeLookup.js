// The town a photo was taken in, from its GPS position, for the screensaver's
// photo details. Offline: the towns are a list bundled with the server
// (assets/places/, every place of 1,000 people or more, from GeoNames), so a
// photo's location never leaves the server.
//
// A town is one point, so the nearest point alone names a photo taken in
// Midtown Manhattan after the small town across the river. Each town reaches
// further the more people live there, and the town the photo is closest to
// relative to its reach names the place, worded the way Immich's places are
// (utils/photoDetails.js): "City, State" in the US and "City, Country"
// elsewhere. Further than MAX_DISTANCE_KM from any town (at sea, in the
// wilderness) a photo has no place rather than a wrong one.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PLACES_FILE = path.join(__dirname, '..', 'assets', 'places', 'places.tsv.gz');
const MAX_DISTANCE_KM = 50;
const EARTH_RADIUS_KM = 6371;
// Towns are filed by whole degree of latitude and longitude.
const CELL_DEGREES = 1;
// A town's reach in km: 9 km for New York City's 8.8 million, 4 for Paris's
// 2.1 million, never under 1.
const REACH_PER_ROOT_PERSON_KM = 0.003;
const MIN_REACH_KM = 1;
const reachKm = (population) => Math.max(MIN_REACH_KM, REACH_PER_ROOT_PERSON_KM * Math.sqrt(population));

let index = null;

// Cell number for a whole-degree cell: latitude -90..90, longitude -180..179.
const cellOf = (lat, lon) => (Math.floor(lat / CELL_DEGREES) + 90) * 360 + (Math.floor(lon / CELL_DEGREES) + 180);

/**
 * The bundled towns, read once on the first lookup and packed: 160,000 towns
 * as objects held over 100 MB, so their numbers sit in typed arrays, their
 * names in one string, and each cell is a run of the towns sorted by cell.
 */
function loadIndex(file = PLACES_FILE) {
  const lines = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n').filter(Boolean);
  const rows = lines.map((line) => {
    const [lat, lon, population, name, region, country] = line.split('\t');
    return { lat: Number(lat), lon: Number(lon), population: Number(population) || 0, name, region, country };
  });
  rows.forEach((row) => { row.cell = cellOf(row.lat, row.lon); });
  rows.sort((a, b) => a.cell - b.cell);

  const count = rows.length;
  const lats = new Float32Array(count);
  const lons = new Float32Array(count);
  const reaches = new Float32Array(count);
  const regionOf = new Uint16Array(count);
  const countryOf = new Uint16Array(count);
  const nameEnds = new Uint32Array(count);
  const regions = [];
  const countries = [];
  const regionIds = new Map();
  const countryIds = new Map();
  const intern = (ids, list, value) => {
    if (!ids.has(value)) { ids.set(value, list.length); list.push(value); }
    return ids.get(value);
  };
  const cells = new Map();
  let names = '';
  rows.forEach((row, i) => {
    lats[i] = row.lat;
    lons[i] = row.lon;
    reaches[i] = reachKm(row.population);
    regionOf[i] = intern(regionIds, regions, row.region || '');
    countryOf[i] = intern(countryIds, countries, row.country || '');
    names += row.name;
    nameEnds[i] = names.length;
    const run = cells.get(row.cell);
    if (run) run[1] = i + 1;
    else cells.set(row.cell, [i, i + 1]);
  });
  return { lats, lons, reaches, regionOf, countryOf, nameEnds, names, regions, countries, cells };
}

function townAt(i) {
  return {
    name: index.names.slice(i ? index.nameEnds[i - 1] : 0, index.nameEnds[i]),
    region: index.regions[index.regionOf[i]],
    country: index.countries[index.countryOf[i]],
  };
}

const toRadians = (degrees) => (degrees * Math.PI) / 180;

function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * The bundled town a position is nearest to relative to the town's reach,
 * among those within MAX_DISTANCE_KM, or null.
 */
function nearestTown(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  // 0,0 is a camera with no fix, not a photo taken in the Gulf of Guinea.
  if (lat === 0 && lon === 0) return null;
  if (!index) index = loadIndex();

  // The cells within reach: a degree of longitude narrows toward the poles,
  // so more of them, up to the whole circle of latitude.
  const latReach = Math.ceil(MAX_DISTANCE_KM / 111 / CELL_DEGREES);
  const lonDegreeKm = 111 * Math.max(Math.cos(toRadians(lat)), 0.01);
  const lonReach = Math.min(Math.ceil(MAX_DISTANCE_KM / lonDegreeKm / CELL_DEGREES), 180);
  const latCell = Math.floor(lat / CELL_DEGREES);
  const lonCell = Math.floor(lon / CELL_DEGREES);

  let best = -1;
  let bestScore = Infinity;
  for (let dLat = -latReach; dLat <= latReach; dLat += 1) {
    const cellLat = latCell + dLat;
    if (cellLat < -90 || cellLat > 90) continue;
    for (let dLon = -lonReach; dLon <= lonReach; dLon += 1) {
      // Wrap across the date line: cell -181 is cell 179.
      const cellLon = ((lonCell + dLon + 180) % 360 + 360) % 360 - 180;
      const run = index.cells.get((cellLat + 90) * 360 + (cellLon + 180));
      if (!run) continue;
      for (let i = run[0]; i < run[1]; i += 1) {
        const km = distanceKm(lat, lon, index.lats[i], index.lons[i]);
        if (km > MAX_DISTANCE_KM) continue;
        const score = km / index.reaches[i];
        if (score < bestScore) {
          best = i;
          bestScore = score;
        }
      }
    }
  }
  return best < 0 ? null : townAt(best);
}

let countryNames = null;
function countryName(code) {
  try {
    if (!countryNames) countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
    return countryNames.of(code) || code;
  } catch {
    return code;
  }
}

/** "City, State" in the US, "City, Country" elsewhere, or null. */
function placeName(latitude, longitude) {
  const town = nearestTown(latitude, longitude);
  if (!town) return null;
  const second = town.country === 'US' ? town.region : countryName(town.country);
  return [town.name, second].filter((part, i, all) => part && all.indexOf(part) === i).join(', ');
}

module.exports = { placeName, nearestTown, MAX_DISTANCE_KM };
