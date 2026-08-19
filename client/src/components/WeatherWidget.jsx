import React, { useState, useEffect } from 'react';
import useDataRefresh from '../hooks/useDataRefresh.js';
import {
  Typography,
  Box,
  TextField,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { Settings } from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getDeviceApiBase } from '../utils/deviceName.js';
import { formatTime, formatWeekdayShort } from '../utils/dateUtils.js';

const DEFAULT_LOCATION_QUERY = '14818';
const VALID_LAYOUT_MODES = new Set(['auto', 'compact', 'medium', 'full']);
const WEATHER_CACHE_FALLBACK_REFRESH_MS = 5 * 60 * 1000;
const WEATHER_CACHE = new Map();
const WEATHER_TAB_SETTINGS_OVERRIDES = new Map();

const normalizeWeatherCacheLocation = (rawLocation) => String(rawLocation || '').trim().toLowerCase();

const buildWeatherCacheKey = (locationQuery, tempUnit) => {
  const normalizedUnit = tempUnit === 'C' ? 'C' : 'F';
  return `${normalizeWeatherCacheLocation(locationQuery)}::${normalizedUnit}`;
};

const isValidCoordinates = (candidate) => {
  return !!candidate
    && typeof candidate.lat === 'number'
    && typeof candidate.lon === 'number'
    && Number.isFinite(candidate.lat)
    && Number.isFinite(candidate.lon);
};

const WeatherWidget = ({
  refreshInterval = 0,
  widgetSize = { width: 4, height: 4 },
  activeTab = 1,
  activeTabConfigJson = null,
  allTabConfigs = [],
  prefetchOnly = false,
  refreshNonce = 0,
  isActive = true,
}) => {
  const { t, i18n } = useTranslation(['weather', 'common']);
  const API_DEVICE_URL = getDeviceApiBase(API_BASE_URL);
  const [weatherData, setWeatherData] = useState(null);
  const [forecastData, setForecastData] = useState([]);
  const [airQualityData, setAirQualityData] = useState(null);
  const [chartData, setChartData] = useState([]);
  // The place name the provider reported, shown under the temperature. Home
  // Assistant reports its entity's friendly name here, OpenWeatherMap the
  // geocoded city.
  const [locationName, setLocationName] = useState('');
  const [locationQuery, setLocationQuery] = useState(DEFAULT_LOCATION_QUERY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chartType, setChartType] = useState('temperature');
  const [tempUnit, setTempUnit] = useState('F');
  const [coordinates, setCoordinates] = useState(null);
  const [layoutMode, setLayoutMode] = useState('auto');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [shouldFetchNow, setShouldFetchNow] = useState(false);
  const [draftLocationQuery, setDraftLocationQuery] = useState(DEFAULT_LOCATION_QUERY);
  const [draftTempUnit, setDraftTempUnit] = useState('F');
  const [draftLayoutMode, setDraftLayoutMode] = useState('auto');

  const unitSymbol = `°${tempUnit}`;

  const getCachedPayloadFor = (targetLocationQuery, targetTempUnit) => {
    const cacheKey = buildWeatherCacheKey(targetLocationQuery, targetTempUnit);
    const entry = WEATHER_CACHE.get(cacheKey);
    return entry && entry.payload ? entry.payload : null;
  };

  const writeCachedPayloadFor = (targetLocationQuery, targetTempUnit, payload) => {
    const cacheKey = buildWeatherCacheKey(targetLocationQuery, targetTempUnit);
    WEATHER_CACHE.set(cacheKey, {
      payload,
      fetchedAt: Date.now(),
      promise: null,
    });
  };

  const normalizeTempUnit = (candidateUnit, fallbackUnit = 'F') => {
    if (candidateUnit === 'C' || candidateUnit === 'F') {
      return candidateUnit;
    }
    if (fallbackUnit === 'C' || fallbackUnit === 'F') {
      return fallbackUnit;
    }
    return 'F';
  };

  const parseTabConfigJson = (configJson) => {
    if (!configJson) return {};
    if (typeof configJson === 'object' && !Array.isArray(configJson)) return configJson;
    if (typeof configJson !== 'string') return {};

    try {
      const parsed = JSON.parse(configJson);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  const readWeatherSettingsFromTabConfig = (configJson) => {
    const layoutMap = parseTabConfigJson(configJson);
    const weatherEntry = layoutMap.weather;
    if (!weatherEntry || typeof weatherEntry !== 'object' || Array.isArray(weatherEntry)) {
      return null;
    }

    const locationQuery = String(weatherEntry.locationQuery || weatherEntry.zipCode || '').trim();
    const coordinates = isValidCoordinates(weatherEntry)
      ? { lat: weatherEntry.lat, lon: weatherEntry.lon }
      : null;

    return {
      locationQuery: locationQuery || DEFAULT_LOCATION_QUERY,
      tempUnit: normalizeTempUnit(weatherEntry.tempUnit, 'F'),
      layoutMode: VALID_LAYOUT_MODES.has(weatherEntry.layoutMode) ? weatherEntry.layoutMode : 'auto',
      coordinates,
      resolvedName: weatherEntry.resolvedName || '',
    };
  };

  const saveInstanceSettingsToTab = async (tabNumber, nextSettings) => {
    await axios.patch(`${API_DEVICE_URL}/widget-assignments/layout`, {
      widget_name: 'weather',
      tabNumber,
      settings: nextSettings,
    });
    WEATHER_TAB_SETTINGS_OVERRIDES.set(Number(tabNumber), { ...nextSettings });
  };

  const getEffectiveWeatherSettingsForTab = (tabNumber, configJson) => {
    const override = WEATHER_TAB_SETTINGS_OVERRIDES.get(Number(tabNumber));
    if (override && typeof override === 'object') {
      return {
        locationQuery: String(override.locationQuery || '').trim() || DEFAULT_LOCATION_QUERY,
        tempUnit: normalizeTempUnit(override.tempUnit, 'F'),
        layoutMode: VALID_LAYOUT_MODES.has(override.layoutMode) ? override.layoutMode : 'auto',
        coordinates: isValidCoordinates(override) ? { lat: override.lat, lon: override.lon } : null,
        resolvedName: override.resolvedName || '',
      };
    }

    return readWeatherSettingsFromTabConfig(configJson);
  };

  const applyWeatherPayloadToState = (payload) => {
    setWeatherData(payload.current || null);
    setForecastData(Array.isArray(payload.forecast) ? payload.forecast : []);
    setAirQualityData(payload.airQuality || null);
    setChartData(Array.isArray(payload.hourly) ? payload.hourly : []);
    setLocationName(payload.resolvedName || '');
  };

  const getWeatherErrorMessage = (requestError) => {
    const status = requestError?.response?.status;
    const serverMessage = requestError?.response?.data?.error;

    if (status === 401) {
      return t('weather:errors.badCredentials');
    }
    if (status === 404) {
      return t('weather:errors.invalidLocation');
    }
    if (status === 503 || status === 504) {
      return t('weather:errors.providerUnreachable');
    }
    if (status) {
      // The server already phrases provider failures usefully (missing API key,
      // unconfigured Home Assistant), so prefer its message over a generic one.
      return serverMessage || t('weather:widget.serviceError', {
        status,
        statusText: requestError.response.statusText || '',
      });
    }

    return t('weather:errors.fetchFailed');
  };

  // One call to our own server, which owns the provider choice and the
  // credentials. The widget no longer knows or cares whether the data came from
  // OpenWeatherMap, Home Assistant, or the demo snapshot.
  const fetchWeatherPayload = async (targetLocationQuery, targetTempUnit, targetCoordinates = null) => {
    const params = {
      units: targetTempUnit === 'F' ? 'imperial' : 'metric',
      lang: i18n.language?.split('-')[0] || 'en',
    };

    // Saved coordinates skip the geocoding round trip, exactly as before.
    if (isValidCoordinates(targetCoordinates)) {
      params.lat = targetCoordinates.lat;
      params.lon = targetCoordinates.lon;
    } else {
      params.location = targetLocationQuery;
    }

    const response = await axios.get(`${API_BASE_URL}/api/weather`, { params });
    return response.data;
  };

  const resolvePayloadFromCacheOrApi = async (
    targetLocationQuery,
    targetTempUnit,
    { forceRefresh = false, targetCoordinates = null } = {}
  ) => {
    const cacheKey = buildWeatherCacheKey(targetLocationQuery, targetTempUnit);
    const existing = WEATHER_CACHE.get(cacheKey);

    if (!forceRefresh && existing?.payload) {
      return existing.payload;
    }

    if (existing?.promise) {
      return await existing.promise;
    }

    const effectiveCoordinates = isValidCoordinates(targetCoordinates)
      ? targetCoordinates
      : (isValidCoordinates(existing?.payload?.coordinates) ? existing.payload.coordinates : null);

    const pendingPromise = (async () => {
      const payload = await fetchWeatherPayload(targetLocationQuery, targetTempUnit, effectiveCoordinates);
      writeCachedPayloadFor(targetLocationQuery, targetTempUnit, payload);
      return payload;
    })();

    WEATHER_CACHE.set(cacheKey, {
      payload: existing?.payload || null,
      fetchedAt: existing?.fetchedAt || 0,
      promise: pendingPromise,
    });

    try {
      return await pendingPromise;
    } finally {
      const latest = WEATHER_CACHE.get(cacheKey);
      if (latest?.promise === pendingPromise) {
        WEATHER_CACHE.set(cacheKey, {
          payload: latest.payload || null,
          fetchedAt: latest.fetchedAt || 0,
          promise: null,
        });
      }
    }
  };

  const refreshCurrentWeather = async () => {
    if (!locationQuery) {
      return;
    }

    try {
      const payload = await resolvePayloadFromCacheOrApi(locationQuery, tempUnit, {
        forceRefresh: true,
        targetCoordinates: coordinates,
      });
      applyWeatherPayloadToState(payload);
      if (isValidCoordinates(payload.coordinates)) {
        setCoordinates(payload.coordinates);
      }
      setError(null);
    } catch (requestError) {
      setError(getWeatherErrorMessage(requestError));
    }
  };

  // Determine layout based on widget size OR manual override
  const getLayoutType = () => {
    if (layoutMode && layoutMode !== 'auto') {
      return layoutMode;
    }

    // Auto-calculate based on size
    const { width: w, height: h } = widgetSize;

    // Compact: Small widgets (2 cols or less, 2 rows or less)
    if (w <= 2 || h <= 2) {
      return 'compact';
    }

    // Medium: Medium-sized widgets (3 cols, 2-4 rows OR 4 cols, 2-3 rows)
    if ((w === 3 && h >= 2 && h <= 4) || (w === 4 && h >= 2 && h <= 3)) {
      return 'medium';
    }

    // Full: Large widgets (4+ cols and 4+ rows)
    if (w >= 4 && h >= 4) {
      return 'full';
    }

    // Default to medium for edge cases
    return 'medium';
  };

  const layoutType = getLayoutType();

  const applyResolvedTabSettings = (resolvedSettings) => {
    const savedLocationQuery = resolvedSettings?.locationQuery || DEFAULT_LOCATION_QUERY;
    const savedTempUnit = resolvedSettings?.tempUnit || 'F';
    const savedLayoutMode = resolvedSettings?.layoutMode || 'auto';
    const savedCoordinates = isValidCoordinates(resolvedSettings?.coordinates)
      ? resolvedSettings.coordinates
      : null;

    const cachedPayload = getCachedPayloadFor(savedLocationQuery, savedTempUnit);
    const shouldAvoidDefaultFetch = prefetchOnly && !resolvedSettings;

    setError(null);
    if (cachedPayload) {
      applyWeatherPayloadToState(cachedPayload);
      setShouldFetchNow(false);
    } else if (shouldAvoidDefaultFetch) {
      setWeatherData(null);
      setForecastData([]);
      setAirQualityData(null);
      setChartData([]);
      setShouldFetchNow(false);
    } else {
      setWeatherData(null);
      setForecastData([]);
      setAirQualityData(null);
      setChartData([]);
      setShouldFetchNow(true);
    }

    setLocationQuery(savedLocationQuery);
    setTempUnit(savedTempUnit);
    setCoordinates(savedCoordinates);
    setLayoutMode(savedLayoutMode);
    setDraftLocationQuery(savedLocationQuery);
    setDraftTempUnit(savedTempUnit);
    setDraftLayoutMode(savedLayoutMode);
    setSettingsLoaded(true);
  };

  const persistActiveTabSettingsIfChanged = async ({
    nextLocationQuery,
    nextTempUnit,
    nextLayoutMode,
    nextCoordinates,
    nextResolvedName = '',
  }) => {
    const current = getEffectiveWeatherSettingsForTab(activeTab, activeTabConfigJson);
    const currentCoords = isValidCoordinates(current?.coordinates) ? current.coordinates : null;
    const nextCoords = isValidCoordinates(nextCoordinates) ? nextCoordinates : null;

    const isSame =
      (current?.locationQuery || DEFAULT_LOCATION_QUERY) === nextLocationQuery
      && (current?.tempUnit || 'F') === nextTempUnit
      && (current?.layoutMode || 'auto') === nextLayoutMode
      && (!currentCoords && !nextCoords
        || (currentCoords && nextCoords && currentCoords.lat === nextCoords.lat && currentCoords.lon === nextCoords.lon))
      && (current?.resolvedName || '') === nextResolvedName;

    if (isSame) {
      return;
    }

    await saveInstanceSettingsToTab(activeTab, {
      locationQuery: nextLocationQuery,
      tempUnit: nextTempUnit,
      layoutMode: nextLayoutMode,
      ...(nextCoords ? { lat: nextCoords.lat, lon: nextCoords.lon } : {}),
      ...(nextResolvedName ? { resolvedName: nextResolvedName } : {}),
    });
  };

  useEffect(() => {
    const tabSettings = getEffectiveWeatherSettingsForTab(activeTab, activeTabConfigJson);
    setSettingsLoaded(false);
    applyResolvedTabSettings(tabSettings);
  }, [activeTab, activeTabConfigJson, refreshNonce]);

  // Demo mode needs no special case any more: the server picks the demo
  // provider behind GET /api/weather, so the widget takes the same path it
  // does with a real provider configured.

  useEffect(() => {
    if (!settingsLoaded || !shouldFetchNow) {
      return;
    }

    if (locationQuery) {
      fetchWeatherData();
      setShouldFetchNow(false);
    }
  }, [locationQuery, tempUnit, settingsLoaded, shouldFetchNow]);

  const collectTargets = () => {
    const targetsByKey = new Map();

    const activeSettings = getEffectiveWeatherSettingsForTab(activeTab, activeTabConfigJson);
    const includeActiveTarget = !!activeSettings?.locationQuery || !prefetchOnly;

    if (includeActiveTarget && locationQuery) {
      const currentKey = buildWeatherCacheKey(locationQuery, tempUnit);
      targetsByKey.set(currentKey, {
        tabNumber: Number(activeTab),
        locationQuery,
        tempUnit,
        layoutMode: layoutMode || 'auto',
        coordinates: isValidCoordinates(coordinates) ? coordinates : null,
      });
    }

    const tabsList = Array.isArray(allTabConfigs) ? allTabConfigs : [];
    for (const tab of tabsList) {
      const weatherSettings = getEffectiveWeatherSettingsForTab(tab?.number, tab?.config_json || null);
      if (!weatherSettings?.locationQuery) {
        continue;
      }
      const key = buildWeatherCacheKey(weatherSettings.locationQuery, weatherSettings.tempUnit);
      targetsByKey.set(key, {
        tabNumber: Number(tab.number),
        locationQuery: weatherSettings.locationQuery,
        tempUnit: weatherSettings.tempUnit,
        layoutMode: weatherSettings.layoutMode || 'auto',
        coordinates: isValidCoordinates(weatherSettings.coordinates) ? weatherSettings.coordinates : null,
      });
    }

    return Array.from(targetsByKey.values());
  };

  const prefetchAllTargets = async () => {
    const targets = collectTargets();
    if (targets.length === 0) {
      return;
    }

    await Promise.all(targets.map(async (target) => {
      try {
        const payload = await resolvePayloadFromCacheOrApi(target.locationQuery, target.tempUnit, {
          forceRefresh: true,
          targetCoordinates: target.coordinates,
        });

        if (
          Number.isFinite(target.tabNumber)
          && !isValidCoordinates(target.coordinates)
          && isValidCoordinates(payload?.coordinates)
        ) {
          await saveInstanceSettingsToTab(target.tabNumber, {
            locationQuery: target.locationQuery,
            tempUnit: target.tempUnit,
            layoutMode: target.layoutMode || 'auto',
            lat: payload.coordinates.lat,
            lon: payload.coordinates.lon,
            ...(payload.resolvedName ? { resolvedName: payload.resolvedName } : {}),
          });
        }
      } catch {
        // Keep prefetch failures non-blocking.
      }
    }));
  };

  // Cache-warming prefetch for every tab with weather configured. Timestamp
  // based: fully paused while the screen is inactive, catches up once on
  // resume instead of stacking missed runs.
  useDataRefresh(
    settingsLoaded
      ? (refreshInterval > 0 ? refreshInterval : WEATHER_CACHE_FALLBACK_REFRESH_MS)
      : 0,
    () => { void prefetchAllTargets(); },
    { isActive, fireImmediately: true }
  );

  // Refresh the displayed weather on the configured cadence, same pause and
  // catch-up semantics.
  useDataRefresh(
    settingsLoaded && refreshInterval > 0 ? refreshInterval : 0,
    () => { void refreshCurrentWeather(); },
    { isActive }
  );

  const fetchWeatherData = async () => {
    // Credentials are the server's business now — if none are configured it
    // says so, and getWeatherErrorMessage surfaces that message verbatim.
    if (!locationQuery) {
      setError(t('weather:errors.enterLocation'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = await resolvePayloadFromCacheOrApi(locationQuery, tempUnit, {
        forceRefresh: false,
        targetCoordinates: coordinates,
      });
      applyWeatherPayloadToState(payload);
      if (isValidCoordinates(payload.coordinates)) {
        setCoordinates(payload.coordinates);

        // Backfill coordinates for existing tabs that were saved before coordinate persistence.
        void persistActiveTabSettingsIfChanged({
          nextLocationQuery: locationQuery,
          nextTempUnit: tempUnit,
          nextLayoutMode: layoutMode,
          nextCoordinates: payload.coordinates,
          nextResolvedName: payload.resolvedName || '',
        }).catch(() => {
          // Keep weather rendering resilient even if backfill persistence fails.
        });
      }
    } catch (error) {
      setError(getWeatherErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const getAirQualityLevel = (aqi) => {
    const levels = {
      1: { key: 'good', color: '#00e400', emoji: '😊' },
      2: { key: 'fair', color: '#ffff00', emoji: '😐' },
      3: { key: 'moderate', color: '#ff7e00', emoji: '😷' },
      4: { key: 'poor', color: '#ff0000', emoji: '😨' },
      5: { key: 'veryPoor', color: '#8f3f97', emoji: '🤢' }
    };
    const level = levels[aqi] || { key: 'unknown', color: '#gray', emoji: '❓' };
    return { ...level, label: t(`weather:airQuality.${level.key}`) };
  };

  const handleOpenSettingsModal = () => {
    setDraftLocationQuery(locationQuery || DEFAULT_LOCATION_QUERY);
    setDraftTempUnit(tempUnit);
    setDraftLayoutMode(layoutMode);
    setSettingsModalOpen(true);
  };

  const handleCloseSettingsModal = () => {
    setSettingsModalOpen(false);
  };

  const handleSaveSettingsModal = async () => {
    const normalizedLocationQuery = (draftLocationQuery || '').trim();
    if (!normalizedLocationQuery) {
      setError(t('weather:errors.enterLocation'));
      return;
    }

    const normalizedTempUnit = draftTempUnit === 'C' ? 'C' : 'F';
    const normalizedLayoutMode = VALID_LAYOUT_MODES.has(draftLayoutMode) ? draftLayoutMode : 'auto';
    const shouldRefreshForDataChange = normalizedLocationQuery !== locationQuery || normalizedTempUnit !== tempUnit;

    const existing = getEffectiveWeatherSettingsForTab(activeTab, activeTabConfigJson);
    let resolvedCoordinates =
      existing
      && existing.locationQuery === normalizedLocationQuery
      && isValidCoordinates(existing.coordinates)
      ? existing.coordinates
      : null;
    let resolvedName = existing?.resolvedName || '';

    if (!resolvedCoordinates) {
      try {
        // Geocoding moved server-side along with the API key.
        const { data } = await axios.get(`${API_BASE_URL}/api/weather/geocode`, {
          params: { q: normalizedLocationQuery },
        });
        resolvedCoordinates = { lat: data.lat, lon: data.lon };
        resolvedName = data.resolvedName || '';
      } catch (error) {
        setError(getWeatherErrorMessage(error));
        return;
      }
    }

    setLocationQuery(normalizedLocationQuery);
    setTempUnit(normalizedTempUnit);
    setCoordinates(resolvedCoordinates);
    setLayoutMode(normalizedLayoutMode);

    if (shouldRefreshForDataChange) {
      setShouldFetchNow(true);
    }

    try {
      await persistActiveTabSettingsIfChanged({
        nextLocationQuery: normalizedLocationQuery,
        nextTempUnit: normalizedTempUnit,
        nextLayoutMode: normalizedLayoutMode,
        nextCoordinates: resolvedCoordinates,
        nextResolvedName: resolvedName,
      });
    } catch (error) {
      console.error('Error saving weather widget settings:', error);
      setError('Failed to save weather settings. Please try again.');
      return;
    }

    setSettingsModalOpen(false);
  };

  // Keyed on the shared condition vocabulary (server/services/weather/payload.js)
  // rather than OpenWeatherMap icon codes, so every provider lights the same
  // icon for the same weather.
  const getWeatherIcon = (condition) => {
    const iconMap = {
      'clear-night': '🌙',
      'cloudy': '☁️',
      'exceptional': '🌤️',
      'fog': '🌫️',
      'hail': '🌨️',
      'lightning': '🌩️',
      'lightning-rainy': '⛈️',
      'partlycloudy': '⛅',
      'pouring': '🌧️',
      'rainy': '🌦️',
      'snowy': '❄️',
      'snowy-rainy': '🌨️',
      'sunny': '☀️',
      'windy': '💨',
      'windy-variant': '💨',
    };
    return iconMap[condition] || '🌤️';
  };

  // OpenWeatherMap returns text already translated by the API; Home Assistant
  // returns only a token, so we translate it ourselves. Preferring the
  // provider's text keeps OpenWeatherMap's richer wording ("light intensity
  // drizzle") where it exists.
  const describeCondition = (entry) => {
    if (entry?.description) return entry.description;
    if (!entry?.condition) return '';
    return t(`weather:conditions.${entry.condition}`);
  };

  // Wind arrives in mph for imperial and m/s for metric, matching the units
  // parameter the server was given. The old code labelled everything "mph".
  const windUnitLabel = t(tempUnit === 'C' ? 'weather:units.metersPerSecond' : 'weather:units.milesPerHour');

  // Forecast dates arrive as YYYY-MM-DD and hourly points as unix seconds, both
  // machine formats. Formatting happens here, in the active locale, so a
  // Spanish display shows "mié" rather than "Wed".
  const forecastDayLabel = (day) => formatWeekdayShort(new Date(`${day.date}T12:00:00`));

  const chartSeries = chartData.map((point) => ({
    time: formatTime(new Date(point.timestamp * 1000)),
    temperature: point.temp === null ? null : Math.round(point.temp),
    precipitation: point.precipitation ?? 0,
  }));

  // Compact Layout - Current weather only
  const renderCompactLayout = () => {
    return (
      <Box sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        p: 1
      }}>
        <Typography variant="h2" sx={{ fontSize: '3rem', mb: 1 }}>
          {getWeatherIcon(weatherData.condition)}
        </Typography>
        <Typography variant="h3" sx={{ fontWeight: 'bold', mb: 0.5 }}>
          {Math.round(weatherData.temp)}{unitSymbol}
        </Typography>
        <Typography variant="h6" sx={{ mb: 1, textAlign: 'center' }}>
          {locationName}
        </Typography>
        <Typography variant="body1" sx={{ textAlign: 'center', textTransform: 'capitalize', mb: 0.5 }}>
          {describeCondition(weatherData)}
        </Typography>
      </Box>
    );
  };

  // Medium Layout - Current weather + 3-day forecast
  const renderMediumLayout = () => {
    return (
      <Box sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        p: 2,
        gap: 2
      }}>
        {/* Current Weather */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h1" sx={{ fontSize: '3rem' }}>
            {getWeatherIcon(weatherData.condition)}
          </Typography>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h3" sx={{ fontWeight: 'bold' }}>
              {Math.round(weatherData.temp)}{unitSymbol}
            </Typography>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {locationName}
            </Typography>
            <Typography variant="body1" sx={{ textTransform: 'capitalize' }}>
              {describeCondition(weatherData)}
            </Typography>
            {/* Home Assistant weather entities often carry no apparent
                temperature, so this line is conditional rather than assumed. */}
            {weatherData.feelsLike !== null && (
              <Typography variant="body2" sx={{ opacity: 0.7 }}>
                {t('weather:widget.feelsLike', {
                  value: `${Math.round(weatherData.feelsLike)}${unitSymbol}`,
                })}
              </Typography>
            )}
          </Box>
        </Box>

        {/* 3-Day Forecast */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
            {t('weather:widget.forecastHeading')}
          </Typography>
          {forecastData.map((day) => (
            <Box
              key={day.date}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                p: 1,
                border: '1px solid var(--card-border)',
                borderRadius: 1,
                bgcolor: 'rgba(var(--accent-rgb), 0.05)'
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 'bold', minWidth: 40 }}>
                {forecastDayLabel(day)}
              </Typography>
              <Typography variant="h6" sx={{ fontSize: '1.5rem' }}>
                {getWeatherIcon(day.condition)}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, minWidth: 80, justifyContent: 'flex-end' }}>
                <Typography variant="body2" sx={{ color: '#ff6b6b', fontWeight: 'bold' }}>
                  {day.high === null ? '—' : `${Math.round(day.high)}°`}
                </Typography>
                <Typography variant="body2" sx={{ color: '#00ddeb' }}>
                  {day.low === null ? '—' : `${Math.round(day.low)}°`}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    );
  };

  // Full Layout - All information
  const renderFullLayout = () => {
    return (
      <Box sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        p: 2
      }}>
        <Box sx={{ display: 'flex', gap: 3, flex: 1, minHeight: 0 }}>
          {/* Current Weather - Left Column */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography variant="h4" sx={{ fontSize: '3rem', mb: 1 }}>
              {getWeatherIcon(weatherData.condition)}
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 'bold', mb: 1 }}>
              {Math.round(weatherData.temp)}{unitSymbol}
            </Typography>
            <Typography variant="h6" sx={{ mb: 1, textAlign: 'center' }}>
              {locationName}
            </Typography>
            <Typography variant="body1" sx={{ mb: 2, textAlign: 'center', textTransform: 'capitalize' }}>
              {describeCondition(weatherData)}
            </Typography>

            {/* Each of these is optional: Home Assistant entities vary in what
                they expose, so a missing reading hides its row rather than
                rendering "NaN". */}
            <Box sx={{ textAlign: 'center' }}>
              {weatherData.feelsLike !== null && (
                <Typography variant="body2">
                  {t('weather:widget.feelsLike', {
                    value: `${Math.round(weatherData.feelsLike)}${unitSymbol}`,
                  })}
                </Typography>
              )}
              {weatherData.humidity !== null && (
                <Typography variant="body2">
                  {t('weather:widget.humidity', { value: weatherData.humidity })}
                </Typography>
              )}
              {weatherData.windSpeed !== null && (
                <Typography variant="body2">
                  {t('weather:widget.wind', {
                    value: `${Math.round(weatherData.windSpeed)} ${windUnitLabel}`,
                  })}
                </Typography>
              )}
            </Box>

            {/* Air Quality Box */}
            {airQualityData && (
              <Box
                sx={{
                  mt: 3,
                  p: 2,
                  width: '90%',
                  alignSelf: 'center',
                  border: '1px solid var(--card-border)',
                  borderRadius: 2,
                  bgcolor: 'rgba(var(--accent-rgb), 0.05)',
                  textAlign: 'center'
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  {t('weather:widget.airQuality')}
                </Typography>
                {(() => {
                  const aqi = airQualityData.aqi;
                  const aqiInfo = getAirQualityLevel(aqi);
                  return (
                    <>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mb: 1 }}>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography variant="h6" sx={{ fontSize: '1.5rem', mb: 0.5 }}>
                            {aqiInfo.emoji}
                          </Typography>
                          <Typography
                            variant="body1"
                            sx={{
                              fontWeight: 'bold',
                              color: aqiInfo.color,
                              mb: 0.5
                            }}
                          >
                            {aqiInfo.label}
                          </Typography>
                          <Typography variant="caption" sx={{ display: 'block' }}>
                            AQI: {aqi}/5
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.75rem' }}>
                          {airQualityData.pm2_5 !== null && (
                            <Typography variant="caption">
                              PM2.5: {Math.round(airQualityData.pm2_5)}
                            </Typography>
                          )}
                          {airQualityData.pm10 !== null && (
                            <Typography variant="caption">
                              PM10: {Math.round(airQualityData.pm10)}
                            </Typography>
                          )}
                          {airQualityData.o3 !== null && (
                            <Typography variant="caption">
                              O₃: {Math.round(airQualityData.o3)}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </>
                  );
                })()}
              </Box>
            )}
          </Box>

          {/* 3-Day Forecast - Middle Column */}
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
              {t('weather:widget.forecastHeading')}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {forecastData.map((day) => (
                <Box
                  key={day.date}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 2,
                    border: '1px solid var(--card-border)',
                    borderRadius: 1,
                    bgcolor: 'rgba(var(--accent-rgb), 0.05)'
                  }}
                >
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#ff6b6b' }}>
                      {day.high === null ? '—' : `${Math.round(day.high)}${unitSymbol}`}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#00ddeb' }}>
                      {day.low === null ? '—' : `${Math.round(day.low)}${unitSymbol}`}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography variant="h5">
                      {getWeatherIcon(day.condition)}
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', textTransform: 'capitalize' }}>
                      {forecastDayLabel(day)} · {describeCondition(day)}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Charts - Right Column */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, justifyContent: 'center' }}>
              <Button
                size="small"
                variant={chartType === 'temperature' ? 'contained' : 'outlined'}
                onClick={() => setChartType('temperature')}
              >
                🌡️
              </Button>
              <Button
                size="small"
                variant={chartType === 'precipitation' ? 'contained' : 'outlined'}
                onClick={() => setChartType('precipitation')}
              >
                🌧️
              </Button>
            </Box>

            <Box sx={{ flex: 1, width: '100%', minWidth: 0, minHeight: 220 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                {chartType === 'temperature' ? (
                  <LineChart data={chartSeries}>
                    <XAxis dataKey="time" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} width={30} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="temperature"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={{ fill: 'var(--accent)' }}
                    />
                  </LineChart>
                ) : (
                  <BarChart data={chartSeries}>
                    <XAxis dataKey="time" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} width={30} />
                    <Tooltip />
                    <Bar dataKey="precipitation" fill="var(--accent)" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  };

  const settingsModal = (
    <Dialog
      open={settingsModalOpen}
      onClose={handleCloseSettingsModal}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          component: 'form',
          onSubmit: (event) => {
            event.preventDefault();
            handleSaveSettingsModal();
          },
        }
      }}
    >
      <DialogTitle>{t('weather:settings.title')}</DialogTitle>
      <DialogContent>
        <Typography variant="caption" sx={{ display: 'block', mb: 2, opacity: 0.8 }}>
          {t('weather:settings.scopeNote')}
        </Typography>

        <TextField
          fullWidth
          label={t('weather:settings.location')}
          value={draftLocationQuery}
          onChange={(e) => setDraftLocationQuery(e.target.value)}
          sx={{ mb: 2 }}
          helperText={t('weather:settings.locationHelp')}
        />

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="weather-temp-unit-label">{t('weather:settings.temperatureUnit')}</InputLabel>
          <Select
            labelId="weather-temp-unit-label"
            label={t('weather:settings.temperatureUnit')}
            value={draftTempUnit}
            onChange={(e) => setDraftTempUnit(e.target.value)}
          >
            <MenuItem value="F">{t('weather:settings.fahrenheit')}</MenuItem>
            <MenuItem value="C">{t('weather:settings.celsius')}</MenuItem>
          </Select>
        </FormControl>

        <FormControl fullWidth>
          <InputLabel id="weather-layout-mode-label">{t('weather:settings.layoutMode')}</InputLabel>
          <Select
            labelId="weather-layout-mode-label"
            label={t('weather:settings.layoutMode')}
            value={draftLayoutMode}
            onChange={(e) => setDraftLayoutMode(e.target.value)}
          >
            <MenuItem value="auto">{t('weather:settings.layoutAuto')}</MenuItem>
            <MenuItem value="compact">{t('weather:settings.layoutCompact')}</MenuItem>
            <MenuItem value="medium">{t('weather:settings.layoutMedium')}</MenuItem>
            <MenuItem value="full">{t('weather:settings.layoutFull')}</MenuItem>
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button type="button" onClick={handleCloseSettingsModal}>{t('common:actions.cancel')}</Button>
        <Button type="submit" variant="contained">{t('common:actions.save')}</Button>
      </DialogActions>
    </Dialog>
  );

  let content = null;

  if (!settingsLoaded || loading) {
    content = (
      <Box sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        p: 2
      }}>
        <Typography variant="h6">🌤️ {t('weather:widget.title')}</Typography>
        <Typography>{settingsLoaded ? t('weather:widget.loadingData') : t('weather:widget.loadingSettings')}</Typography>
      </Box>
    );
  } else if (error) {
    content = (
      <Box sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        p: 2
      }}>
        <Typography variant="h6" sx={{ mb: 2 }}>🌤️ Weather</Typography>
        <Box sx={{ p: 2, bgcolor: 'rgba(255, 0, 0, 0.1)', borderRadius: 1, mb: 2 }}>
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        </Box>
        <Button size="small" variant="outlined" onClick={handleOpenSettingsModal}>
          {t('weather:widget.openSettings')}
        </Button>
      </Box>
    );
  } else if (!weatherData) {
    content = (
      <Box sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        p: 2
      }}>
        <Typography variant="h6">🌤️ {t('weather:widget.title')}</Typography>
        <Typography>{t('weather:widget.noData')}</Typography>
      </Box>
    );
  } else {
    content = (
      <>
        {layoutType !== 'compact' && (
          <Box sx={{ p: 2, pb: 0 }}>
            <Typography variant="h6">🌤️ {t('weather:widget.title')}</Typography>
          </Box>
        )}

        {/* Dynamic Content Based on Layout */}
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {layoutType === 'compact' && renderCompactLayout()}
          {layoutType === 'medium' && renderMediumLayout()}
          {layoutType === 'full' && renderFullLayout()}
        </Box>
      </>
    );
  }

  return (
    <Box sx={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative'
    }}>
      <IconButton
        size="small"
        onClick={handleOpenSettingsModal}
        aria-label={t('weather:widget.openSettingsAria')}
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 10,
          color: 'var(--text-color)',
        }}
      >
        <Settings />
      </IconButton>

      {content}
      {settingsModal}
    </Box>
  );
};

export default WeatherWidget;
