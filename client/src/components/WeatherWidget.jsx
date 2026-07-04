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
import { API_BASE_URL } from '../utils/apiConfig.js';
import { getDeviceApiBase } from '../utils/deviceName.js';

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
  weatherApiKey,
  refreshInterval = 0,
  widgetSize = { width: 4, height: 4 },
  activeTab = 1,
  activeTabConfigJson = null,
  allTabConfigs = [],
  prefetchOnly = false,
  refreshNonce = 0,
}) => {
  const API_DEVICE_URL = getDeviceApiBase(API_BASE_URL);
  const [weatherData, setWeatherData] = useState(null);
  const [forecastData, setForecastData] = useState([]);
  const [airQualityData, setAirQualityData] = useState(null);
  const [chartData, setChartData] = useState([]);
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

  const buildNotFoundError = () => {
    const notFoundError = new Error('Location not found');
    notFoundError.response = {
      status: 404,
      statusText: 'Not Found',
    };
    return notFoundError;
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
        return 'Invalid location. Try a city and country code like "Sydney,AU" or a postal code like "14818,US".';
      }
      return `Weather service error: ${requestError.response.status} ${requestError.response.statusText}`;
    }

    if (requestError?.code === 'ECONNREFUSED' || requestError?.message?.includes('Network Error')) {
      return 'Unable to connect to weather service. Please check your internet connection.';
    }

    return 'Failed to fetch weather data. Please try again later.';
  };

  const shouldTryZipFallback = (candidateLocation) => {
    const normalizedCandidate = String(candidateLocation || '').trim();
    if (!normalizedCandidate) {
      return false;
    }

    // Treat as postal/zip style when the query has no alphabetic characters.
    return !/[a-z]/i.test(normalizedCandidate);
  };

  const getDirectGeocodeCandidates = (targetLocationQuery) => {
    const baseQuery = String(targetLocationQuery || '').trim();
    if (!baseQuery) {
      return [];
    }

    const candidates = [baseQuery];
    const alreadyUsQualified = /,\s*us\s*$/i.test(baseQuery) || /,\s*usa\s*$/i.test(baseQuery);
    const hasExplicitCountrySegment = baseQuery.split(',').length >= 3;

    if (!alreadyUsQualified && !hasExplicitCountrySegment) {
      candidates.push(`${baseQuery},US`);
    }

    return candidates;
  };

  const resolveCoordinatesForLocation = async (targetLocationQuery) => {
    const directCandidates = getDirectGeocodeCandidates(targetLocationQuery);
    for (const directCandidate of directCandidates) {
      const encodedLocation = encodeURIComponent(directCandidate);
      const directGeocodeUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodedLocation}&limit=1&appid=${weatherApiKey}`;

      try {
        const directResponse = await axios.get(directGeocodeUrl);
        if (Array.isArray(directResponse.data) && directResponse.data.length > 0) {
          const bestMatch = directResponse.data[0];
          const resolvedCoordinates = {
            lat: bestMatch.lat,
            lon: bestMatch.lon,
            name: bestMatch.name,
            country: bestMatch.country,
            state: bestMatch.state || null,
            source: 'direct',
          };
          return resolvedCoordinates;
        }
      } catch (requestError) {
        if (requestError?.response?.status !== 404) {
          throw requestError;
        }
      }
    }

    if (shouldTryZipFallback(targetLocationQuery)) {
      const normalizedZip = targetLocationQuery.includes(',') ? targetLocationQuery : `${targetLocationQuery},US`;
      const encodedZip = encodeURIComponent(normalizedZip);
      const zipGeocodeUrl = `https://api.openweathermap.org/geo/1.0/zip?zip=${encodedZip}&appid=${weatherApiKey}`;

      try {
        const zipResponse = await axios.get(zipGeocodeUrl);
        if (zipResponse?.data && typeof zipResponse.data.lat === 'number' && typeof zipResponse.data.lon === 'number') {
          const resolvedCoordinates = {
            lat: zipResponse.data.lat,
            lon: zipResponse.data.lon,
            name: zipResponse.data.name || null,
            country: zipResponse.data.country || null,
            state: null,
            source: 'zip',
          };
          return resolvedCoordinates;
        }
      } catch (requestError) {
        if (requestError?.response?.status !== 404) {
          throw requestError;
        }
      }
    }

    throw buildNotFoundError();
  };

  const fetchWeatherPayload = async (targetLocationQuery, targetTempUnit, targetCoordinates = null) => {
    const targetUnitParam = targetTempUnit === 'F' ? 'imperial' : 'metric';

    const resolvedCoordinates = isValidCoordinates(targetCoordinates)
      ? { ...targetCoordinates, source: 'saved' }
      : await resolveCoordinatesForLocation(targetLocationQuery);
    const { lat, lon } = resolvedCoordinates;

    const currentWeatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${weatherApiKey}&units=${targetUnitParam}`;
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

    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${weatherApiKey}&units=${targetUnitParam}`;
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
      coordinates: {
        lat,
        lon,
      },
      resolvedName: resolvedCoordinates.name || '',
      weatherData: nextWeatherData,
      airQualityData: nextAirQualityData,
      forecastData: nextForecastData,
      chartData: nextChartData,
    };
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
    if (!weatherApiKey || !locationQuery) {
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

  useEffect(() => {
    if (!settingsLoaded || !shouldFetchNow) {
      return;
    }

    if (locationQuery && weatherApiKey) {
      fetchWeatherData();
      setShouldFetchNow(false);
    }
  }, [locationQuery, weatherApiKey, tempUnit, settingsLoaded, shouldFetchNow]);

  useEffect(() => {
    if (!settingsLoaded || !weatherApiKey) {
      return;
    }

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

    void prefetchAllTargets();

    const intervalMs = refreshInterval > 0 ? refreshInterval : WEATHER_CACHE_FALLBACK_REFRESH_MS;
    const intervalId = setInterval(() => {
      void prefetchAllTargets();
    }, intervalMs);

    return () => {
      clearInterval(intervalId);
    };
  }, [allTabConfigs, activeTab, activeTabConfigJson, prefetchOnly, locationQuery, tempUnit, layoutMode, settingsLoaded, weatherApiKey, refreshInterval]);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    if (refreshInterval > 0) {
      const intervalId = setInterval(() => {
        void refreshCurrentWeather();
      }, refreshInterval);

      return () => {
        clearInterval(intervalId);
      };
    }
  }, [refreshInterval, settingsLoaded, weatherApiKey, locationQuery, tempUnit]);

  const fetchWeatherData = async () => {
    if (!weatherApiKey) {
      setError('Weather API key not configured. Please add your OpenWeatherMap API key in the Admin Panel.');
      return;
    }

    if (!locationQuery) {
      setError('Please enter a location.');
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
      1: { label: 'Good', color: '#00e400', emoji: '😊' },
      2: { label: 'Fair', color: '#ffff00', emoji: '😐' },
      3: { label: 'Moderate', color: '#ff7e00', emoji: '😷' },
      4: { label: 'Poor', color: '#ff0000', emoji: '😨' },
      5: { label: 'Very Poor', color: '#8f3f97', emoji: '🤢' }
    };
    return levels[aqi] || { label: 'Unknown', color: '#gray', emoji: '❓' };
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
      setError('Please enter a location.');
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
        const geocoded = await resolveCoordinatesForLocation(normalizedLocationQuery);
        resolvedCoordinates = { lat: geocoded.lat, lon: geocoded.lon };
        resolvedName = geocoded.name || '';
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
      <DialogTitle>Weather Widget Settings</DialogTitle>
      <DialogContent>
        <Typography variant="caption" sx={{ display: 'block', mb: 2, opacity: 0.8 }}>
          These settings apply only to this tab's weather widget instance.
        </Typography>

        <TextField
          fullWidth
          label="Location"
          value={draftLocationQuery}
          onChange={(e) => setDraftLocationQuery(e.target.value)}
          sx={{ mb: 2 }}
          helperText="Examples: Sydney,AU or 14818,US"
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
        <Button type="button" onClick={handleCloseSettingsModal}>Cancel</Button>
        <Button type="submit" variant="contained">Save</Button>
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
