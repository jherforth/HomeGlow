import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import {
  AcUnit,
  Air,
  Cloud,
  Foggy,
  Grain,
  NightsStay,
  Thunderstorm,
  Umbrella,
  WarningAmber,
  WaterDrop,
  WbCloudy,
  WbSunny,
} from '@mui/icons-material';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { formatTime, getDateLocale } from '../utils/dateUtils.js';
import { usePageVisibility } from '../hooks/useScreenActivity.js';
import {
  addDaysToKey,
  buildAgenda,
  limitAgenda,
  localDateKey,
  pickWeatherSettings,
  weatherRequestParams,
} from '../utils/screensaverOverlay.js';

// Calendar and weather both change slowly, and the server caches weather on
// its own schedule; a quarter hour keeps the corner honest without hammering
// anything while a display sits idle all evening.
const REFRESH_MS = 15 * 60 * 1000;

// Monochrome on purpose (issue #190): outline glyphs that take currentColor,
// not the weather widget's colour emoji.
const CONDITION_ICONS = {
  'clear-night': NightsStay,
  cloudy: Cloud,
  exceptional: WarningAmber,
  fog: Foggy,
  hail: Grain,
  lightning: Thunderstorm,
  'lightning-rainy': Thunderstorm,
  partlycloudy: WbCloudy,
  pouring: Umbrella,
  rainy: WaterDrop,
  snowy: AcUnit,
  'snowy-rainy': AcUnit,
  sunny: WbSunny,
  windy: Air,
  'windy-variant': Air,
};

const capitalize = (text) => (text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text);

// A YYYY-MM-DD key rendered as a weekday. Built at local noon so no zone shift
// can drag it onto the neighbouring day.
const weekdayForKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  try {
    return new Intl.DateTimeFormat(getDateLocale(), { weekday: 'long' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en', { weekday: 'long' }).format(date);
  }
};

// Local midnight at the start of the day `key` names, as an ISO instant.
const startOfKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
};

const textShadow = '0 1px 2px var(--hg-black-90), 0 0 10px var(--hg-black-70), 0 0 22px var(--hg-black-30)';

const ScreensaverOverlay = ({ showCalendar, calendarDays, showWeather, tabs, driftStep = 0 }) => {
  const { t, i18n } = useTranslation(['common', 'calendar', 'weather']);
  const pageVisible = usePageVisibility();
  const [todayKey, setTodayKey] = useState(() => localDateKey(new Date()));
  const [events, setEvents] = useState(null);
  const [weather, setWeather] = useState(null);

  const weatherSettings = useMemo(() => pickWeatherSettings(tabs), [tabs]);

  const load = useCallback(async () => {
    const key = localDateKey(new Date());
    setTodayKey(key);

    if (showCalendar) {
      try {
        const { data } = await axios.get(`${API_BASE_URL}/api/calendar-events`, {
          params: { start: startOfKey(key), end: startOfKey(addDaysToKey(key, calendarDays)) },
        });
        setEvents(Array.isArray(data) ? data : []);
      } catch (error) {
        // A corner that silently omits the agenda beats one that shows an error
        // over someone's photo for the rest of the evening.
        console.warn('Screensaver overlay: calendar unavailable', error?.message);
        setEvents(null);
      }
    }

    if (showWeather) {
      try {
        const { data } = await axios.get(`${API_BASE_URL}/api/weather`, {
          params: weatherRequestParams(weatherSettings, i18n.language),
        });
        setWeather(data?.current ? data : null);
      } catch (error) {
        // Expected on an OpenWeatherMap install with no weather widget
        // configured: there is no location to ask about, and guessing one would
        // show some other town's weather on the wall.
        console.warn('Screensaver overlay: weather unavailable', error?.message);
        setWeather(null);
      }
    }
  }, [showCalendar, calendarDays, showWeather, weatherSettings, i18n.language]);

  useEffect(() => {
    if (!pageVisible) return undefined;
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, pageVisible]);

  const agenda = useMemo(() => {
    if (!showCalendar || !events) return null;
    return limitAgenda(buildAgenda(events, { todayKey, days: calendarDays }));
  }, [showCalendar, events, todayKey, calendarDays]);

  const hasWeather = showWeather && weather?.current;
  if (!hasWeather && !agenda) return null;

  const dayLabel = (key) => {
    if (key === todayKey) return t('common:screensaverOverlay.today');
    if (key === addDaysToKey(todayKey, 1)) return t('common:screensaverOverlay.tomorrow');
    return capitalize(weekdayForKey(key));
  };

  const eventTime = (event) => {
    if (event.all_day) return t('calendar:event.allDay');
    if (event.continued) return t('common:screensaverOverlay.continued');
    return formatTime(event.start);
  };

  // Static text on an always-on display is what screensavers exist to prevent.
  // Nudge the block a few pixels with each photo so no pixel holds the same
  // glyph edge for hours; small enough that nobody sees it move.
  const driftX = (driftStep % 4) * 3;
  const driftY = (Math.floor(driftStep / 4) % 3) * 3;

  const current = hasWeather ? weather.current : null;
  const ConditionIcon = current ? (CONDITION_ICONS[current.condition] || WarningAmber) : null;
  const conditionText = current
    ? capitalize(current.description || t(`weather:conditions.${current.condition}`))
    : '';
  const unit = weather?.units === 'metric' ? 'C' : 'F';

  return (
    <>
      <Box
        data-testid="screensaver-overlay"
        sx={{
          position: 'absolute',
          left: `calc(clamp(20px, 3vw, 48px) + ${driftX}px)`,
          bottom: `calc(clamp(20px, 3vw, 48px) + ${driftY}px)`,
          maxWidth: 'min(460px, 40vw)',
          color: 'var(--hg-on-overlay)',
          textShadow,
          fontSize: 'clamp(14px, 1.3vw, 22px)',
          fontWeight: 300,
          lineHeight: 1.35,
          pointerEvents: 'none',
          zIndex: 2,
          isolation: 'isolate',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.1em',
          transition: 'left 1.2s ease, bottom 1.2s ease',
        }}
      >
        {/* A soft shadow behind the text rather than a card, so a bright photo
            stays legible without being boxed in. It lives inside the block and
            takes its size from it: a fixed corner gradient left the weather
            outside the dark area once a week's agenda made the block tall, and
            white text on snow all but disappeared. */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: '-3.5em -4.5em -3em -4em',
            background: 'radial-gradient(closest-side, var(--hg-black-70) 0%, var(--hg-black-50) 40%, var(--hg-black-20) 70%, transparent 100%)',
            filter: 'blur(6px)',
            pointerEvents: 'none',
            zIndex: -1,
          }}
        />
        {current && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.6em' }}>
            <ConditionIcon sx={{ fontSize: '2.6em', opacity: 0.9, filter: 'drop-shadow(0 1px 3px var(--hg-black-70))' }} />
            <Box>
              <Box sx={{ fontSize: '2.6em', fontWeight: 200, lineHeight: 1, letterSpacing: '-0.02em' }}>
                {Math.round(current.temp)}°{unit}
              </Box>
              <Box sx={{ opacity: 0.92, mt: '0.25em' }}>{conditionText}</Box>
              {weather.resolvedName && (
                <Box sx={{ fontSize: '0.7em', opacity: 0.78, textTransform: 'uppercase', letterSpacing: '0.14em', mt: '0.2em' }}>
                  {weather.resolvedName}
                </Box>
              )}
            </Box>
          </Box>
        )}

        {agenda && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '0.75em' }}>
            {agenda.days.map((day) => (
              <Box key={day.date}>
                <Box sx={{ fontSize: '0.72em', textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.8, mb: '0.3em' }}>
                  {dayLabel(day.date)}
                </Box>
                {day.events.length === 0 ? (
                  <Box sx={{ opacity: 0.6 }}>{t('common:screensaverOverlay.freeDay')}</Box>
                ) : (
                  day.events.map((event) => (
                    <Box key={`${day.date}-${event.id}`} sx={{ display: 'flex', gap: '0.8em', alignItems: 'baseline' }}>
                      <Box sx={{ flex: '0 0 5.2em', opacity: 0.82, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {eventTime(event)}
                      </Box>
                      <Box sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {event.title}
                      </Box>
                    </Box>
                  ))
                )}
              </Box>
            ))}
            {agenda.hidden > 0 && (
              <Box sx={{ fontSize: '0.8em', opacity: 0.6 }}>
                {t('common:screensaverOverlay.more', { count: agenda.hidden })}
              </Box>
            )}
          </Box>
        )}
      </Box>
    </>
  );
};

export default ScreensaverOverlay;
