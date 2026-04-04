import React, { useState, useEffect } from 'react';
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

const DEFAULT_ZIP_CODE = '14818';
const VALID_LAYOUT_MODES = new Set(['auto', 'compact', 'medium', 'full']);
const WEATHER_SETTINGS_STORAGE_PREFIX = 'weatherWidgetSettings:';
const WEATHER_CACHE_STORAGE_PREFIX = 'weatherWidgetCache:';

const WeatherWidget = ({
  transparentBackground,
  weatherApiKey,
  widgetSize = { width: 4, height: 4 },
  activeTabId = 1,
  widgetId = 'weather-widget',
}) => {
  const weatherSettingsStorageKey = `${WEATHER_SETTINGS_STORAGE_PREFIX}${activeTabId}:${widgetId}`;
  const weatherCacheStorageKey = `${WEATHER_CACHE_STORAGE_PREFIX}${activeTabId}:${widgetId}`;
  const [weatherData, setWeatherData] = useState(null);
  const [forecastData, setForecastData] = useState([]);
  const [airQualityData, setAirQualityData] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [zipCode, setZipCode] = useState(DEFAULT_ZIP_CODE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chartType, setChartType] = useState('temperature');
  const [tempUnit, setTempUnit] = useState('F');
  const [layoutMode, setLayoutMode] = useState('auto');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [shouldFetchNow, setShouldFetchNow] = useState(false);
  const [draftZipCode, setDraftZipCode] = useState(DEFAULT_ZIP_CODE);
  const [draftTempUnit, setDraftTempUnit] = useState('F');
  const [draftLayoutMode, setDraftLayoutMode] = useState('auto');

  const unitSymbol = `°${tempUnit}`;

  const persistInstanceSettings = (nextSettings) => {
    localStorage.setItem(weatherSettingsStorageKey, JSON.stringify(nextSettings));
  };

  const persistWeatherCacheForKey = (cacheKey, payload) => {
    localStorage.setItem(cacheKey, JSON.stringify({
      ...payload,
      cachedAt: Date.now(),
    }));
  };

  const persistWeatherCache = (payload) => {
    persistWeatherCacheForKey(weatherCacheStorageKey, payload);
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

  const resolveInstanceConfig = (rawSettings = {}, fallbackZipCode = DEFAULT_ZIP_CODE, fallbackTempUnit = 'F') => {
    const resolvedZipCode = (rawSettings.zipCode || fallbackZipCode || '').trim();
    const resolvedTempUnit = normalizeTempUnit(rawSettings.tempUnit, fallbackTempUnit);
    return { resolvedZipCode, resolvedTempUnit };
  };

  const applyWeatherPayloadToState = (payload) => {
    setWeatherData(payload.weatherData || null);
    setForecastData(Array.isArray(payload.forecastData) ? payload.forecastData : []);
    setAirQualityData(payload.airQualityData || null);
    setChartData(Array.isArray(payload.chartData) ? payload.chartData : []);
  };

  const getWeatherErrorMessage = (requestError) => {
    if (requestError?.response) {
      if (requestError.response.status === 401) {
        return 'Invalid API key. Please check your OpenWeatherMap API key in the Admin Panel.';
      }
      if (requestError.response.status === 404) {
        return 'Invalid zip code. Please enter a valid US zip code.';
      }
      return `Weather service error: ${requestError.response.status} ${requestError.response.statusText}`;
    }

    if (requestError?.code === 'ECONNREFUSED' || requestError?.message?.includes('Network Error')) {
      return 'Unable to connect to weather service. Please check your internet connection.';
    }

    return 'Failed to fetch weather data. Please try again later.';
  };

  const fetchWeatherPayload = async (targetZipCode, targetTempUnit) => {
    const targetUnitParam = targetTempUnit === 'F' ? 'imperial' : 'metric';

    const currentWeatherUrl = `https://api.openweathermap.org/data/2.5/weather?zip=${targetZipCode},US&appid=${weatherApiKey}&units=${targetUnitParam}`;
    const currentResponse = await axios.get(currentWeatherUrl);
    const nextWeatherData = currentResponse.data;
    let nextAirQualityData = null;
    let nextForecastData = [];
    let nextChartData = [];

    if (currentResponse.data.coord) {
      const { lat, lon } = currentResponse.data.coord;
      const airQualityUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${weatherApiKey}`;

      try {
        const airQualityResponse = await axios.get(airQualityUrl);
        nextAirQualityData = airQualityResponse.data;
      } catch {
        nextAirQualityData = null;
      }
    }

    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?zip=${targetZipCode},US&appid=${weatherApiKey}&units=${targetUnitParam}`;
    const forecastResponse = await axios.get(forecastUrl);
    const chartDataPoints = [];

    if (forecastResponse.data && forecastResponse.data.list) {
      const forecastByDay = {};

      forecastResponse.data.list.slice(0, 24).forEach((item, index) => {
        const date = new Date(item.dt * 1000);
        const dayKey = date.toDateString();

        if (!forecastByDay[dayKey]) {
          forecastByDay[dayKey] = {
            date,
            temps: {
              min: item.main.temp_min,
              max: item.main.temp_max,
              all: [],
            },
            weather: item.weather[0],
            precipitation: item.rain ? item.rain['3h'] || 0 : 0,
          };
        } else {
          forecastByDay[dayKey].temps.min = Math.min(forecastByDay[dayKey].temps.min, item.main.temp_min);
          forecastByDay[dayKey].temps.max = Math.max(forecastByDay[dayKey].temps.max, item.main.temp_max);
        }

        forecastByDay[dayKey].temps.all.push(item.main.temp);

        if (index < 8) {
          chartDataPoints.push({
            time: date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
            temperature: Math.round(item.main.temp),
            precipitation: item.rain ? item.rain['3h'] || 0 : 0,
          });
        }
      });

      nextForecastData = Object.values(forecastByDay).slice(0, 3).map(day => ({
        date: day.date,
        dayName: day.date.toLocaleDateString('en-US', { weekday: 'short' }),
        tempHigh: Math.round(day.temps.max),
        tempLow: Math.round(day.temps.min),
        tempAvg: Math.round(day.temps.all.reduce((a, b) => a + b, 0) / day.temps.all.length),
        weather: day.weather,
        precipitation: day.precipitation,
      }));

      nextChartData = chartDataPoints;
    }

    return {
      zipCode: targetZipCode,
      tempUnit: targetTempUnit,
      weatherData: nextWeatherData,
      airQualityData: nextAirQualityData,
      forecastData: nextForecastData,
      chartData: nextChartData,
    };
  };

  const refreshAllConfiguredWeatherCaches = async () => {
    if (!weatherApiKey) {
      return;
    }

    const legacyZipCode = localStorage.getItem('weatherZipCode') || DEFAULT_ZIP_CODE;
    const legacyTempUnit = localStorage.getItem('weatherTempUnit') === 'C' ? 'C' : 'F';
    const settingsKeys = Object.keys(localStorage).filter((key) => key.startsWith(WEATHER_SETTINGS_STORAGE_PREFIX));

    if (!settingsKeys.includes(weatherSettingsStorageKey)) {
      settingsKeys.push(weatherSettingsStorageKey);
    }

    const refreshTargets = settingsKeys
      .map((settingsKey) => {
        let parsedSettings = {};
        try {
          parsedSettings = JSON.parse(localStorage.getItem(settingsKey) || '{}');
        } catch {
          parsedSettings = {};
        }

        const currentTargetFallbackZip = settingsKey === weatherSettingsStorageKey ? zipCode : legacyZipCode;
        const currentTargetFallbackTemp = settingsKey === weatherSettingsStorageKey ? tempUnit : legacyTempUnit;
        const { resolvedZipCode, resolvedTempUnit } = resolveInstanceConfig(
          parsedSettings,
          currentTargetFallbackZip,
          currentTargetFallbackTemp
        );

        if (!resolvedZipCode) {
          return null;
        }

        return {
          cacheKey: settingsKey.replace(WEATHER_SETTINGS_STORAGE_PREFIX, WEATHER_CACHE_STORAGE_PREFIX),
          zipCode: resolvedZipCode,
          tempUnit: resolvedTempUnit,
        };
      })
      .filter(Boolean);

    if (refreshTargets.length === 0) {
      return;
    }

    const queryGroups = new Map();
    refreshTargets.forEach((target) => {
      const queryKey = `${target.zipCode}|${target.tempUnit}`;
      if (!queryGroups.has(queryKey)) {
        queryGroups.set(queryKey, []);
      }
      queryGroups.get(queryKey).push(target);
    });

    for (const targets of queryGroups.values()) {
      const { zipCode: targetZipCode, tempUnit: targetTempUnit } = targets[0];

      try {
        const payload = await fetchWeatherPayload(targetZipCode, targetTempUnit);

        targets.forEach((target) => {
          persistWeatherCacheForKey(target.cacheKey, payload);
        });

        if (targetZipCode === zipCode && targetTempUnit === tempUnit) {
          applyWeatherPayloadToState(payload);
          setError(null);
        }
      } catch (requestError) {
        if (targetZipCode === zipCode && targetTempUnit === tempUnit) {
          setError(getWeatherErrorMessage(requestError));
        }
      }
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

  useEffect(() => {
    setSettingsLoaded(false);
    setError(null);

    let parsedSettings = {};
    let legacyWidgetSettings = {};

    try {
      parsedSettings = JSON.parse(localStorage.getItem(weatherSettingsStorageKey) || '{}');
    } catch {
      parsedSettings = {};
    }

    try {
      legacyWidgetSettings = JSON.parse(localStorage.getItem('widgetSettings') || '{}');
    } catch {
      legacyWidgetSettings = {};
    }

    let parsedCache = null;
    try {
      parsedCache = JSON.parse(localStorage.getItem(weatherCacheStorageKey) || 'null');
    } catch {
      parsedCache = null;
    }

    const legacyZipCode = localStorage.getItem('weatherZipCode') || DEFAULT_ZIP_CODE;
    const legacyTempUnit = localStorage.getItem('weatherTempUnit') === 'C' ? 'C' : 'F';
    const { resolvedZipCode: savedZipCode, resolvedTempUnit: savedTempUnit } = resolveInstanceConfig(
      parsedSettings,
      legacyZipCode,
      legacyTempUnit
    );
    const candidateLayoutMode = parsedSettings.layoutMode || legacyWidgetSettings.weather?.layoutMode || 'auto';
    const savedLayoutMode = VALID_LAYOUT_MODES.has(candidateLayoutMode) ? candidateLayoutMode : 'auto';

    const hasMatchingCache = Boolean(
      parsedCache
      && parsedCache.zipCode === savedZipCode
      && parsedCache.tempUnit === savedTempUnit
      && parsedCache.weatherData
    );

    if (hasMatchingCache) {
      setWeatherData(parsedCache.weatherData || null);
      setForecastData(Array.isArray(parsedCache.forecastData) ? parsedCache.forecastData : []);
      setAirQualityData(parsedCache.airQualityData || null);
      setChartData(Array.isArray(parsedCache.chartData) ? parsedCache.chartData : []);
      setShouldFetchNow(false);
    } else {
      setWeatherData(null);
      setForecastData([]);
      setAirQualityData(null);
      setChartData([]);
      setShouldFetchNow(true);
    }

    setZipCode(savedZipCode);
    setTempUnit(savedTempUnit);
    setLayoutMode(savedLayoutMode);
    setDraftZipCode(savedZipCode);
    setDraftTempUnit(savedTempUnit);
    setDraftLayoutMode(savedLayoutMode);
    setSettingsLoaded(true);
  }, [weatherSettingsStorageKey, weatherCacheStorageKey]);

  useEffect(() => {
    if (!settingsLoaded || !shouldFetchNow) {
      return;
    }

    if (zipCode && weatherApiKey) {
      fetchWeatherData();
      setShouldFetchNow(false);
    }
  }, [zipCode, weatherApiKey, tempUnit, settingsLoaded, shouldFetchNow]);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    const widgetSettings = JSON.parse(localStorage.getItem('widgetSettings') || '{}');
    const refreshInterval = widgetSettings.weather?.refreshInterval || 0;

    if (refreshInterval > 0) {
      const intervalId = setInterval(() => {
        void refreshAllConfiguredWeatherCaches();
      }, refreshInterval);

      return () => {
        clearInterval(intervalId);
      };
    }
  }, [zipCode, weatherApiKey, tempUnit, settingsLoaded]);

  const fetchWeatherData = async () => {
    if (!weatherApiKey) {
      setError('Weather API key not configured. Please add your OpenWeatherMap API key in the Admin Panel.');
      return;
    }

    if (!zipCode) {
      setError('Please enter a zip code.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = await fetchWeatherPayload(zipCode, tempUnit);
      applyWeatherPayloadToState(payload);
      persistWeatherCache(payload);
    } catch (error) {
      setError(getWeatherErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const getAirQualityLevel = (aqi) => {
    const levels = {
      1: { label: 'Good', color: '#00e400', emoji: '😊' },
      2: { label: 'Fair', color: '#ffff00', emoji: '😐' },
      3: { label: 'Moderate', color: '#ff7e00', emoji: '😷' },
      4: { label: 'Poor', color: '#ff0000', emoji: '😨' },
      5: { label: 'Very Poor', color: '#8f3f97', emoji: '🤢' }
    };
    return levels[aqi] || { label: 'Unknown', color: '#gray', emoji: '❓' };
  };

  const handleOpenSettingsModal = () => {
    setDraftZipCode(zipCode || DEFAULT_ZIP_CODE);
    setDraftTempUnit(tempUnit);
    setDraftLayoutMode(layoutMode);
    setSettingsModalOpen(true);
  };

  const handleCloseSettingsModal = () => {
    setSettingsModalOpen(false);
  };

  const handleSaveSettingsModal = () => {
    const normalizedZip = (draftZipCode || '').trim();
    if (!normalizedZip) {
      setError('Please enter a zip code.');
      return;
    }

    const normalizedTempUnit = draftTempUnit === 'C' ? 'C' : 'F';
    const normalizedLayoutMode = VALID_LAYOUT_MODES.has(draftLayoutMode) ? draftLayoutMode : 'auto';
    const shouldRefreshForDataChange = normalizedZip !== zipCode || normalizedTempUnit !== tempUnit;

    setZipCode(normalizedZip);
    setTempUnit(normalizedTempUnit);
    setLayoutMode(normalizedLayoutMode);

    if (shouldRefreshForDataChange) {
      setShouldFetchNow(true);
    }

    persistInstanceSettings({
      zipCode: normalizedZip,
      tempUnit: normalizedTempUnit,
      layoutMode: normalizedLayoutMode,
    });

    setSettingsModalOpen(false);
  };

  const getWeatherIcon = (iconCode) => {
    const iconMap = {
      '01d': '☀️', '01n': '🌙',
      '02d': '⛅', '02n': '☁️',
      '03d': '☁️', '03n': '☁️',
      '04d': '☁️', '04n': '☁️',
      '09d': '🌧️', '09n': '🌧️',
      '10d': '🌦️', '10n': '🌧️',
      '11d': '⛈️', '11n': '⛈️',
      '13d': '❄️', '13n': '❄️',
      '50d': '🌫️', '50n': '🌫️'
    };
    return iconMap[iconCode] || '🌤️';
  };

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
          {getWeatherIcon(weatherData.weather[0].icon)}
        </Typography>
        <Typography variant="h3" sx={{ fontWeight: 'bold', mb: 0.5 }}>
          {Math.round(weatherData.main.temp)}{unitSymbol}
        </Typography>
        <Typography variant="h6" sx={{ mb: 1, textAlign: 'center' }}>
          {weatherData.name}
        </Typography>
        <Typography variant="body1" sx={{ textAlign: 'center', textTransform: 'capitalize', mb: 0.5 }}>
          {weatherData.weather[0].description}
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
            {getWeatherIcon(weatherData.weather[0].icon)}
          </Typography>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h3" sx={{ fontWeight: 'bold' }}>
              {Math.round(weatherData.main.temp)}{unitSymbol}
            </Typography>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {weatherData.name}
            </Typography>
            <Typography variant="body1" sx={{ textTransform: 'capitalize' }}>
              {weatherData.weather[0].description}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.7 }}>
              Feels like {Math.round(weatherData.main.feels_like)}{unitSymbol}
            </Typography>
          </Box>
        </Box>

        {/* 3-Day Forecast */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
            3-Day Forecast
          </Typography>
          {forecastData.map((day, index) => (
            <Box
              key={index}
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
                {day.dayName}
              </Typography>
              <Typography variant="h6" sx={{ fontSize: '1.5rem' }}>
                {getWeatherIcon(day.weather.icon)}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, minWidth: 80, justifyContent: 'flex-end' }}>
                <Typography variant="body2" sx={{ color: '#ff6b6b', fontWeight: 'bold' }}>
                  {day.tempHigh}°
                </Typography>
                <Typography variant="body2" sx={{ color: '#00ddeb' }}>
                  {day.tempLow}°
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
              {getWeatherIcon(weatherData.weather[0].icon)}
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 'bold', mb: 1 }}>
              {Math.round(weatherData.main.temp)}{unitSymbol}
            </Typography>
            <Typography variant="h6" sx={{ mb: 1, textAlign: 'center' }}>
              {weatherData.name}
            </Typography>
            <Typography variant="body1" sx={{ mb: 2, textAlign: 'center', textTransform: 'capitalize' }}>
              {weatherData.weather[0].description}
            </Typography>

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2">
                Feels like {Math.round(weatherData.main.feels_like)}{unitSymbol}
              </Typography>
              <Typography variant="body2">
                Humidity: {weatherData.main.humidity}%
              </Typography>
              <Typography variant="body2">
                Wind: {Math.round(weatherData.wind.speed)} mph
              </Typography>
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
                  Air Quality
                </Typography>
                {(() => {
                  const aqi = airQualityData.list[0].main.aqi;
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
                          <Typography variant="caption">
                            PM2.5: {Math.round(airQualityData.list[0].components.pm2_5)}
                          </Typography>
                          <Typography variant="caption">
                            PM10: {Math.round(airQualityData.list[0].components.pm10)}
                          </Typography>
                          <Typography variant="caption">
                            O₃: {Math.round(airQualityData.list[0].components.o3)}
                          </Typography>
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
              3-Day Forecast
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {forecastData.map((day, index) => (
                <Box
                  key={index}
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
                      {day.tempHigh}{unitSymbol}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#00ddeb' }}>
                      {day.tempLow}{unitSymbol}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography variant="h5">
                      {getWeatherIcon(day.weather.icon)}
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                      {day.weather.description}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Charts - Right Column */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
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

            <Box sx={{ flex: 1, width: '100%', minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'temperature' ? (
                  <LineChart data={chartData}>
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
                  <BarChart data={chartData}>
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
    <Dialog open={settingsModalOpen} onClose={handleCloseSettingsModal} maxWidth="xs" fullWidth>
      <DialogTitle>Weather Widget Settings</DialogTitle>
      <DialogContent>
        <Typography variant="caption" sx={{ display: 'block', mb: 2, opacity: 0.8 }}>
          These settings apply only to this tab's weather widget instance.
        </Typography>

        <TextField
          fullWidth
          label="Zip Code"
          value={draftZipCode}
          onChange={(e) => setDraftZipCode(e.target.value)}
          sx={{ mb: 2 }}
        />

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="weather-temp-unit-label">Temperature Unit</InputLabel>
          <Select
            labelId="weather-temp-unit-label"
            label="Temperature Unit"
            value={draftTempUnit}
            onChange={(e) => setDraftTempUnit(e.target.value)}
          >
            <MenuItem value="F">Fahrenheit (°F)</MenuItem>
            <MenuItem value="C">Celsius (°C)</MenuItem>
          </Select>
        </FormControl>

        <FormControl fullWidth>
          <InputLabel id="weather-layout-mode-label">Layout Mode</InputLabel>
          <Select
            labelId="weather-layout-mode-label"
            label="Layout Mode"
            value={draftLayoutMode}
            onChange={(e) => setDraftLayoutMode(e.target.value)}
          >
            <MenuItem value="auto">Auto (based on widget size)</MenuItem>
            <MenuItem value="compact">Compact</MenuItem>
            <MenuItem value="medium">Medium</MenuItem>
            <MenuItem value="full">Full</MenuItem>
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCloseSettingsModal}>Cancel</Button>
        <Button variant="contained" onClick={handleSaveSettingsModal}>Save</Button>
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
        <Typography variant="h6">🌤️ Weather</Typography>
        <Typography>{settingsLoaded ? 'Loading weather data...' : 'Loading weather settings...'}</Typography>
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
          Open Settings
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
        <Typography variant="h6">🌤️ Weather</Typography>
        <Typography>No weather data available</Typography>
      </Box>
    );
  } else {
    content = (
      <>
        {layoutType !== 'compact' && (
          <Box sx={{ p: 2, pb: 0 }}>
            <Typography variant="h6">🌤️ Weather</Typography>
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
        aria-label="Open weather widget settings"
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
