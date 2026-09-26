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
import { isControlHidden } from '../utils/displayControls.js';

const DEFAULT_LOCATION_QUERY = '98199';
const VALID_LAYOUT_MODES = new Set(['auto', 'compact', 'medium', 'full']);
const WEATHER_CACHE_FALLBACK_REFRESH_MS = 5 * 60 * 1000;
const WEATHER_CACHE = new Map();
const WEATHER_TAB_SETTINGS_OVERRIDES = new Map();

const normalizeWeatherCacheLocation = (rawLocation) => String(rawLocation || '').trim().toLowerCase();

const buildWeatherCacheKey = (locationQuery, tempUnit) => {
  const normalizedUnit = tempUnit === 'C' ? 'C' : 'F';
  return `${normalizeWeatherCacheLocation(locationQuery)}::${normalizedUnit}`;
};

const normalizeTempUnit = (candidateUnit, fallbackUnit = 'F') => {
  if (candidateUnit === 'C' || candidateUnit === 'F') return candidateUnit;
  if (fallbackUnit === 'C' || fallbackUnit === 'F') return fallbackUnit;
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

const isValidCoordinates = (candidate) => {
  return !!candidate && typeof candidate.lat === 'number' && typeof candidate.lon === 'number' && Number.isFinite(candidate.lat) && Number.isFinite(candidate.lon);
};

const readWeatherSettingsFromTabConfig = (configJson) => {
  const layoutMap = parseTabConfigJson(configJson);
  const weatherEntry = layoutMap.weather || (layoutMap.settings && layoutMap.settings.weather);
  if (!weatherEntry || typeof weatherEntry !== 'object' || Array.isArray(weatherEntry)) {
    return null;
  }

  const s = weatherEntry.settings || weatherEntry;
  const locationQuery = String(s.locationQuery || s.zipCode || s.location || '').trim();
  const coordinates = isValidCoordinates(s)
    ? { lat: s.lat, lon: s.lon }
    : (isValidCoordinates(weatherEntry) ? { lat: weatherEntry.lat, lon: weatherEntry.lon } : null);

  return {
    locationQuery: locationQuery || DEFAULT_LOCATION_QUERY,
    tempUnit: normalizeTempUnit(s.tempUnit, 'F'),
    layoutMode: VALID_LAYOUT_MODES.has(s.layoutMode) ? s.layoutMode : 'auto',
    coordinates,
    resolvedName: s.resolvedName || weatherEntry.resolvedName || '',
  };
};

const saveInstanceSettingsToTab = async (tabNumber, nextSettings) => {
  const API_DEVICE_URL = getDeviceApiBase(API_BASE_URL);
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

const WeatherWidget = ({
  refreshInterval = 0,
  widgetSize = { width: 4, height: 4 },
  activeTab = 1,
  activeTabConfigJson = null,
  allTabConfigs = [],
  prefetchOnly = false,
  refreshNonce = 0,
  isActive = true,
  hiddenControls = [],
}) => {
  const { t, i18n } = useTranslation(['weather', 'common']);
  const [weatherData, setWeatherData] = useState(null);
  const [forecastData, setForecastData] = useState([]);
  const [airQualityData, setAirQualityData] = useState(null);
  const [chartData, setChartData] = useState([]);
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
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState(null);

  const hideWeatherSettings = isControlHidden(hiddenControls, 'core:weatherSettings');
  useEffect(() => {
    if (hideWeatherSettings) {
      setSettingsModalOpen((prev) => (prev ? false : prev));
    }
  }, [hideWeatherSettings]);

  const [shouldFetchNow, setShouldFetchNow] = useState(false);
  const [draftLocationQuery, setDraftLocationQuery] = useState(DEFAULT_LOCATION_QUERY);
  const [draftTempUnit, setDraftTempUnit] = useState('F');
  const [draftLayoutMode, setDraftLayoutMode] = useState('auto');

  const unitSymbol = `°${tempUnit}`;
  const windUnitLabel = t(tempUnit === 'C' ? 'weather:units.metersPerSecond' : 'weather:units.milesPerHour');

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
    if (status === 401) return t('weather:errors.badCredentials');
    if (status === 404 || status === 400) return t('weather:errors.invalidLocation');
    if (status === 502 || status === 503) return t('weather:errors.providerUnreachable');
    if (serverMessage) return serverMessage;
    return t('weather:errors.fetchFailed');
  };

  const fetchWeatherPayload = async (targetLocationQuery, targetTempUnit, targetCoordinates = null) => {
    const params = {
      units: targetTempUnit === 'F' ? 'imperial' : 'metric',
      lang: i18n.language?.split('-')[0] || 'en',
    };
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

    if (!forceRefresh && existing?.payload) return existing.payload;
    if (existing?.promise) return await existing.promise;

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

  const fetchWeatherData = async () => {
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
      }
    } catch (err) {
      setError(getWeatherErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const refreshCurrentWeather = async () => {
    if (!locationQuery) return;
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

  const getLayoutType = () => {
    if (layoutMode && layoutMode !== 'auto') return layoutMode;
    const { width: w, height: h } = widgetSize;
    if (w <= 2 || h <= 2) return 'compact';
    if ((w === 3 && h >= 2 && h <= 4) || (w === 4 && h >= 2 && h <= 3)) return 'medium';
    if (w >= 4 && h >= 4) return 'full';
    return 'medium';
  };

  const layoutType = getLayoutType();

  const applyResolvedTabSettings = (resolvedSettings) => {
    const savedLocationQuery = resolvedSettings?.locationQuery || DEFAULT_LOCATION_QUERY;
    const savedTempUnit = resolvedSettings?.tempUnit || 'F';
    const savedLayoutMode = resolvedSettings?.layoutMode || 'auto';
    const savedCoordinates = isValidCoordinates(resolvedSettings?.coordinates) ? resolvedSettings.coordinates : null;

    const cachedPayload = getCachedPayloadFor(savedLocationQuery, savedTempUnit);
    setError(null);
    if (cachedPayload) {
      applyWeatherPayloadToState(cachedPayload);
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

  useEffect(() => {
    const tabSettings = getEffectiveWeatherSettingsForTab(activeTab, activeTabConfigJson);
    setSettingsLoaded(false);
    applyResolvedTabSettings(tabSettings);
  }, [activeTab, activeTabConfigJson, refreshNonce]);

  useEffect(() => {
    if (!settingsLoaded || !shouldFetchNow) return;
    if (locationQuery) {
      fetchWeatherData();
      setShouldFetchNow(false);
    }
  }, [settingsLoaded, shouldFetchNow, locationQuery, tempUnit, coordinates]);

  useDataRefresh(
    settingsLoaded ? (refreshInterval > 0 ? refreshInterval : WEATHER_CACHE_FALLBACK_REFRESH_MS) : 0,
    () => { void refreshCurrentWeather(); },
    { isActive }
  );

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

    let resolvedCoordinates = coordinates;
    let resolvedName = locationName;
    if (normalizedLocationQuery !== locationQuery) {
      try {
        const { data } = await axios.get(`${API_BASE_URL}/api/weather/geocode`, {
          params: { q: normalizedLocationQuery },
        });
        resolvedCoordinates = { lat: data.lat, lon: data.lon };
        resolvedName = data.resolvedName || '';
      } catch (err) {
        setError(getWeatherErrorMessage(err));
        return;
      }
    }

    setLocationQuery(normalizedLocationQuery);
    setTempUnit(normalizedTempUnit);
    setCoordinates(resolvedCoordinates);
    setLayoutMode(normalizedLayoutMode);
    setShouldFetchNow(true);

    try {
      await saveInstanceSettingsToTab(activeTab, {
        locationQuery: normalizedLocationQuery,
        tempUnit: normalizedTempUnit,
        layoutMode: normalizedLayoutMode,
        ...(resolvedCoordinates ? { lat: resolvedCoordinates.lat, lon: resolvedCoordinates.lon } : {}),
        resolvedName,
      });
    } catch (saveErr) {
      console.error('Error saving weather settings:', saveErr);
    }
    setSettingsModalOpen(false);
  };

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

  const describeCondition = (entry) => {
    if (entry?.description) return entry.description;
    if (!entry?.condition) return '';
    return t(`weather:conditions.${entry.condition}`);
  };

  const forecastDayLabel = (day) => formatWeekdayShort(new Date(`${day.date}T12:00:00`));

  const chartSeries = chartData.map((point) => ({
    time: formatTime(new Date(point.timestamp * 1000)),
    temperature: point.temp === null ? null : Math.round(point.temp),
    precipitation: point.precipitation ?? 0,
  }));

  const renderCompactLayout = () => (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 1 }}>
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

  const renderMediumLayout = () => (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, gap: 2 }}>
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
          {weatherData.feelsLike !== null && (
            <Typography variant="body2" sx={{ opacity: 0.7 }}>
              {t('weather:widget.feelsLike', {
                value: `${Math.round(weatherData.feelsLike)}${unitSymbol}`,
              })}
            </Typography>
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
          {t('weather:widget.forecastHeading')}
        </Typography>
        {forecastData.slice(0, 3).map((day) => (
          <Box
            key={day.date}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 1,
              border: '1px solid var(--card-border)',
              borderRadius: 1,
              bgcolor: 'rgba(var(--accent-rgb), 0.05)',
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

  const renderFullLayout = () => (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 2 }}>
      <Box sx={{ display: 'flex', gap: 3, flex: 1, minHeight: 0 }}>
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
        </Box>

        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
            {t('weather:widget.forecastHeading')}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {forecastData.slice(0, 3).map((day) => (
              <Box
                key={day.date}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 2,
                  border: '1px solid var(--card-border)',
                  borderRadius: 1,
                  bgcolor: 'rgba(var(--accent-rgb), 0.05)',
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

  // Active date defaults to first available forecast day
  const activeDate = selectedDateKey || (forecastData && forecastData[0]?.date) || null;

  // Filter 3-hour intervals using the location's local calendar date
  const filteredHourly = Array.isArray(chartData)
    ? chartData.filter((pt) => {
        if (!activeDate) return true;
        if (pt.date) return pt.date === activeDate;
        const d = new Date(pt.timestamp * 1000);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}` === activeDate;
      })
    : [];

  const detailsModal = (
    <Dialog
      open={Boolean(detailsModalOpen)}
      onClose={() => setDetailsModalOpen(false)}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: { xs: 2, sm: 3 },
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'var(--card-bg, #fff)',
            color: 'var(--text, #171717)',
          },
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, pt: 2, px: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {locationName || locationQuery || 'Weather'}
          </Typography>
          {weatherData && (
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
              {describeCondition(weatherData)} • Currently {Math.round(weatherData.temp || 0)}{unitSymbol}
              {weatherData.feelsLike !== null && ` (Feels like ${Math.round(weatherData.feelsLike)}${unitSymbol})`}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {!hideWeatherSettings && (
            <IconButton
              size="small"
              onClick={handleOpenSettingsModal}
              aria-label={t('weather:widget.openSettingsAria')}
              sx={{ color: 'var(--text)' }}
            >
              <Settings fontSize="small" />
            </IconButton>
          )}
          <IconButton size="small" onClick={() => setDetailsModalOpen(false)}>✕</IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, overflowY: 'auto' }}>
        {/* AccuWeather 5-Day Visual Carousel */}
        <Box sx={{ p: 1.5, borderBottom: '1px solid var(--border, rgba(0,0,0,0.08))', bgcolor: 'rgba(0,0,0,0.02)' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'text.secondary' }}>
              5-Day Forecast
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
              Tap a day to filter
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1 }}>
            {Array.isArray(forecastData) && forecastData.map((day, idx) => {
              const isSelected = (day.date === activeDate) || (!selectedDateKey && idx === 0);
              const dayDate = new Date(`${day.date}T12:00:00`);
              const dayOfWeek = idx === 0 ? 'Today' : formatWeekdayShort(dayDate);
              const dayNum = dayDate.getDate();
              const rainChance = typeof day.pop === 'number' ? day.pop : (day.precipitation > 0 ? 50 : 0);

              return (
                <Box
                  key={day.date || idx}
                  onClick={() => setSelectedDateKey(day.date)}
                  sx={{
                    p: 1.2,
                    minWidth: 70,
                    textAlign: 'center',
                    flexShrink: 0,
                    borderRadius: 2,
                    cursor: 'pointer',
                    userSelect: 'none',
                    border: '1.5px solid',
                    borderColor: isSelected ? 'var(--accent, #00ddeb)' : 'var(--card-border, #e5e5e5)',
                    bgcolor: isSelected ? 'rgba(var(--accent-rgb, 0, 221, 235), 0.12)' : 'var(--surface, #fff)',
                    boxShadow: isSelected ? '0 2px 8px rgba(var(--accent-rgb, 0, 221, 235), 0.25)' : 'none',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                    {dayOfWeek}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', mb: 0.5 }}>
                    {dayNum}
                  </Typography>

                  <Typography sx={{ fontSize: '1.3rem', lineHeight: 1 }}>
                    {getWeatherIcon(day.condition)}
                  </Typography>

                  <Typography variant="caption" sx={{ color: '#0288d1', fontWeight: 600, fontSize: '0.7rem', my: 0.2 }}>
                    💧{rainChance}%
                  </Typography>

                  <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '0.88rem' }}>
                    {day.high !== null ? `${Math.round(day.high)}°` : '—'}
                  </Typography>

                  <Box
                    sx={{
                      width: 6,
                      height: 32,
                      my: 0.5,
                      borderRadius: 3,
                      background: 'linear-gradient(180deg, rgba(255,107,107,0.7) 0%, rgba(0,221,235,0.7) 100%)',
                    }}
                  />

                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: '0.78rem' }}>
                    {day.low !== null ? `${Math.round(day.low)}°` : '—'}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* 3-Hour Interval List in Chronological Order */}
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'text.secondary' }}>
              Forecast Timeline ({activeDate ? formatWeekdayShort(new Date(`${activeDate}T12:00:00`)) : 'Today'})
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {filteredHourly.length} intervals
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {filteredHourly.length > 0 ? (
              filteredHourly.map((pt, i) => {
                const hourDate = new Date(pt.timestamp * 1000);
                const popVal = typeof pt.pop === 'number' ? pt.pop : (pt.precipitation > 0 ? 50 : 0);
                return (
                  <Box
                    key={i}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      py: 1.1,
                      px: 0.5,
                      borderBottom: '1px solid var(--border, rgba(0,0,0,0.06))',
                      '&:last-child': { borderBottom: 'none' },
                    }}
                  >
                    <Box sx={{ minWidth: 68 }}>
                      <Box
                        sx={{
                          display: 'inline-block',
                          px: 1,
                          py: 0.25,
                          borderRadius: 10,
                          bgcolor: 'action.hover',
                          fontWeight: 600,
                          fontSize: '0.78rem',
                          textAlign: 'center',
                        }}
                      >
                        {formatTime(hourDate)}
                      </Box>
                    </Box>

                    <Typography sx={{ fontSize: '1.3rem', mx: 1.5, width: 28, textAlign: 'center' }}>
                      {getWeatherIcon(pt.condition || weatherData?.condition)}
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flex: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                        {pt.temp !== null ? `${Math.round(pt.temp)}${unitSymbol}` : '—'}
                      </Typography>
                    </Box>

                    <Box sx={{ minWidth: 65, textAlign: 'right' }}>
                      {popVal > 0 ? (
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3 }}>
                          <span style={{ fontSize: '0.8rem' }}>💧</span>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: '#0288d1', fontSize: '0.8rem' }}>
                            {popVal}%
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.5 }}>
                          💧 0%
                        </Typography>
                      )}
                    </Box>
                  </Box>
                );
              })
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                No forecast data recorded for this day.
              </Typography>
            )}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 1.5, borderTop: '1px solid var(--border, rgba(0,0,0,0.08))' }}>
        <Button onClick={() => setDetailsModalOpen(false)} variant="contained" size="small" sx={{ px: 3 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );

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
        },
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
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', p: 2 }}>
        <Typography variant="h6">🌤️ {t('weather:widget.title')}</Typography>
        <Typography>{settingsLoaded ? t('weather:widget.loadingData') : t('weather:widget.loadingSettings')}</Typography>
      </Box>
    );
  } else if (error) {
    content = (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>🌤️ Weather</Typography>
        <Box sx={{ p: 2, bgcolor: 'rgba(255, 0, 0, 0.1)', borderRadius: 1, mb: 2 }}>
          <Typography color="error" variant="body2">{error}</Typography>
        </Box>
        {!hideWeatherSettings && (
          <Button size="small" variant="outlined" onClick={handleOpenSettingsModal}>
            {t('weather:widget.openSettings')}
          </Button>
        )}
      </Box>
    );
  } else if (!weatherData) {
    content = (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', p: 2 }}>
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
        <Box
          onClick={() => setDetailsModalOpen(true)}
          role="button"
          tabIndex={0}
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'rgba(0, 221, 235, 0.15)',
            '& *': { pointerEvents: 'none' },
          }}
        >
          {layoutType === 'compact' && renderCompactLayout()}
          {layoutType === 'medium' && renderMediumLayout()}
          {layoutType === 'full' && renderFullLayout()}
        </Box>
      </>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      {content}
      {settingsModal}
      {detailsModal}
    </Box>
  );
};

export default WeatherWidget;
