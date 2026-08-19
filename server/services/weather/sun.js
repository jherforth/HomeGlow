// Sunrise/sunset from coordinates, with no network call (issue #57).
//
// Auto dark mode used to hit OpenWeatherMap purely to read sys.sunrise and
// sys.sunset, which meant a household had to hold an OpenWeatherMap API key
// just to have the dashboard go dark at night. Sunrise is a function of date
// and position, so computing it locally removes that dependency: auto dark mode
// now works with Home Assistant, with OpenWeatherMap, or with no weather
// provider configured at all.
//
// This is the standard sunrise equation (the NOAA/Wikipedia formulation),
// accurate to a minute or two — far tighter than a theme switch needs.

const RAD = Math.PI / 180;

// Solar declination at the moment of sunrise/sunset. -0.833° accounts for both
// atmospheric refraction and the sun's apparent radius, which is why sunrise is
// reported slightly before the geometric crossing.
const SUNRISE_ANGLE = -0.833;

const OBLIQUITY = 23.44;

const UNIX_EPOCH_JULIAN_DAY = 2440587.5;
const J2000 = 2451545.0;

const julianDayFromDate = (date) => date.getTime() / 86400000 + UNIX_EPOCH_JULIAN_DAY;
const unixSecondsFromJulianDay = (jd) => Math.round((jd - UNIX_EPOCH_JULIAN_DAY) * 86400);

/**
 * @param {number} lat degrees north
 * @param {number} lon degrees east
 * @param {Date} [date] the day to compute for; defaults to now
 * @returns {{sunrise: number|null, sunset: number|null, alwaysUp: boolean, alwaysDown: boolean}}
 *          unix seconds, or nulls above the polar circles where the sun does
 *          not cross the horizon that day.
 */
function computeSunTimes(lat, lon, date = new Date()) {
    const jd = julianDayFromDate(date);

    // Days since J2000, shifted so the result lands on the local solar day.
    const n = Math.round(jd - J2000 + 0.0008);

    // Mean solar noon at this longitude.
    const meanSolarNoon = n - lon / 360;

    // Solar mean anomaly.
    const M = (357.5291 + 0.98560028 * meanSolarNoon) % 360;
    const Mrad = M * RAD;

    // Equation of the center.
    const C = 1.9148 * Math.sin(Mrad) + 0.02 * Math.sin(2 * Mrad) + 0.0003 * Math.sin(3 * Mrad);

    // Ecliptic longitude.
    const lambda = (M + C + 180 + 102.9372) % 360;
    const lambdaRad = lambda * RAD;

    // Solar transit (local solar noon) as a Julian day.
    const transit = J2000 + meanSolarNoon + 0.0053 * Math.sin(Mrad) - 0.0069 * Math.sin(2 * lambdaRad);

    // Declination of the sun.
    const sinDeclination = Math.sin(lambdaRad) * Math.sin(OBLIQUITY * RAD);
    const cosDeclination = Math.cos(Math.asin(sinDeclination));

    const latRad = lat * RAD;
    const cosHourAngle =
        (Math.sin(SUNRISE_ANGLE * RAD) - Math.sin(latRad) * sinDeclination) /
        (Math.cos(latRad) * cosDeclination);

    // Above the polar circles the sun may not rise or set at all on this date.
    if (cosHourAngle > 1) {
        return { sunrise: null, sunset: null, alwaysUp: false, alwaysDown: true };
    }
    if (cosHourAngle < -1) {
        return { sunrise: null, sunset: null, alwaysUp: true, alwaysDown: false };
    }

    const hourAngle = Math.acos(cosHourAngle) / RAD;

    return {
        sunrise: unixSecondsFromJulianDay(transit - hourAngle / 360),
        sunset: unixSecondsFromJulianDay(transit + hourAngle / 360),
        alwaysUp: false,
        alwaysDown: false,
    };
}

/**
 * Is it daytime at these coordinates right now? Resolves the polar cases so
 * callers get a usable answer everywhere.
 */
function isDaytime(lat, lon, date = new Date()) {
    const { sunrise, sunset, alwaysUp, alwaysDown } = computeSunTimes(lat, lon, date);
    if (alwaysUp) return true;
    if (alwaysDown) return false;
    const nowUnix = Math.floor(date.getTime() / 1000);
    return nowUnix >= sunrise && nowUnix < sunset;
}

module.exports = { computeSunTimes, isDaytime };
