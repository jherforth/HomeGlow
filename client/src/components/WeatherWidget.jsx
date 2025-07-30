import React, { useState, useEffect } from 'react';
import { Card, Typography, Box, IconButton, TextField, Button } from '@mui/material';
import { Edit, Check, Close } from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';

const WeatherWidget = ({ transparentBackground, weatherApiKey }) => {
  const [weatherData, setWeatherData] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zipCode, setZipCode] = useState(() => localStorage.getItem('weatherZipCode') || '10001');
  const [isEditingZip, setIsEditingZip] = useState(false);
  const [tempZipCode, setTempZipCode] = useState(zipCode);
  const [chartData, setChartData] = useState([]);
  const [showPrecipitation, setShowPrecipitation] = useState(false);

  useEffect(() => {
    if (weatherApiKey && zipCode) {
      fetchWeatherData();
    }
  }, [weatherApiKey, zipCode]);

  const fetchWeatherData = async () => {
    if (!weatherApiKey) {
      setError('Weather API key not configured');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch current weather
      const currentResponse = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?zip=${zipCode}&appid=${weatherApiKey}&units=imperial`
      );

      // Fetch 5-day forecast
      const forecastResponse = await axios.get(
        `https://api.openweathermap.org/data/2.5/forecast?zip=${zipCode}&appid=${weatherApiKey}&units=imperial`
      );

      setWeatherData(currentResponse.data);
      
      // Process forecast data - get one entry per day for next 3 days
      const dailyForecast = [];
      const processedDates = new Set();
      
      forecastResponse.data.list.forEach(item => {
        const date = new Date(item.dt * 1000);
        const dateString = date.toDateString();
        
        if (!processedDates.has(dateString) && dailyForecast.length < 3) {
          dailyForecast.push({
            date: date,
            temp: Math.round(item.main.temp),
            description: item.weather[0].description,
            icon: item.weather[0].icon,
            humidity: item.main.humidity,
            precipitation: item.rain ? item.rain['3h'] || 0 : 0
          });
          processedDates.add(dateString);
        }
      });

      setForecast(dailyForecast);

      // Prepare chart data
      const chartPoints = forecastResponse.data.list.slice(0, 8).map(item => ({
        time: new Date(item.dt * 1000).toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          hour12: true 
        }),
        temperature: Math.round(item.main.temp),
        precipitation: item.rain ? item.rain['3h'] || 0 : 0
      }));

      setChartData(chartPoints);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching weather data:', error);
      setError('Failed to fetch weather data');
      setLoading(false);
    }
  };

  const handleZipCodeSave = () => {
    if (tempZipCode.trim()) {
      setZipCode(tempZipCode.trim());
      localStorage.setItem('weatherZipCode', tempZipCode.trim());
      setIsEditingZip(false);
    }
  };

  const handleZipCodeCancel = () => {
    setTempZipCode(zipCode);
    setIsEditingZip(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleZipCodeSave();
    } else if (e.key === 'Escape') {
      handleZipCodeCancel();
    }
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

  if (loading) {
    return (
      <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`} sx={{ height: '400px' }}>
        <Typography variant="h6">Loading weather...</Typography>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`} sx={{ height: '400px' }}>
        <Typography variant="h6" color="error">{error}</Typography>
      </Card>
    );
  }

  if (!weatherData) {
    return (
      <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`} sx={{ height: '400px' }}>
        <Typography variant="h6">No weather data available</Typography>
      </Card>
    );
  }

  return (
    <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`} sx={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
          🌤️ Weather
        </Typography>
        
        {/* Zip Code Editor */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isEditingZip ? (
            <>
              <TextField
                size="small"
                value={tempZipCode}
                onChange={(e) => setTempZipCode(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter zip code"
                sx={{ width: '100px' }}
                autoFocus
              />
              <IconButton size="small" onClick={handleZipCodeSave} sx={{ color: 'green' }}>
                <Check fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={handleZipCodeCancel} sx={{ color: 'red' }}>
                <Close fontSize="small" />
              </IconButton>
            </>
          ) : (
            <>
              <Typography variant="caption" sx={{ opacity: 0.7 }}>
                {zipCode}
              </Typography>
              <IconButton size="small" onClick={() => setIsEditingZip(true)}>
                <Edit fontSize="small" />
              </IconButton>
            </>
          )}
        </Box>
      </Box>
      
      <Box sx={{ display: 'flex', height: '100%', gap: 2 }}>
        {/* Current Weather - Left Column */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="h4" sx={{ fontSize: '3rem', mb: 1 }}>
            {getWeatherIcon(weatherData.weather[0].icon)}
          </Typography>
          <Typography variant="h3" sx={{ fontWeight: 'bold', mb: 1 }}>
            {Math.round(weatherData.main.temp)}°F
          </Typography>
          <Typography variant="h6" sx={{ mb: 1, textAlign: 'center' }}>
            {weatherData.name}
          </Typography>
          <Typography variant="body2" sx={{ textTransform: 'capitalize', mb: 2, textAlign: 'center' }}>
            {weatherData.weather[0].description}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.85rem' }}>
            <Typography variant="caption">
              Feels like {Math.round(weatherData.main.feels_like)}°F
            </Typography>
            <Typography variant="caption">
              Humidity: {weatherData.main.humidity}%
            </Typography>
            <Typography variant="caption">
              Wind: {Math.round(weatherData.wind.speed)} mph
            </Typography>
          </Box>
        </Box>

        {/* 3-Day Forecast - Middle Column */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold', textAlign: 'center' }}>
            3-Day Forecast
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
            {forecast.map((day, index) => (
              <Box 
                key={index} 
                sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  p: 1,
                  borderRadius: 1,
                  bgcolor: 'rgba(var(--accent-rgb), 0.1)',
                  border: '1px solid var(--card-border)'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: '1.2rem' }}>
                    {getWeatherIcon(day.icon)}
                  </Typography>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {day.date.toLocaleDateString('en-US', { weekday: 'short' })}
                    </Typography>
                    <Typography variant="caption" sx={{ textTransform: 'capitalize' }}>
                      {day.description}
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                  {day.temp}°F
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Chart - Right Column */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1, gap: 1 }}>
            <Button
              size="small"
              variant={!showPrecipitation ? 'contained' : 'outlined'}
              onClick={() => setShowPrecipitation(false)}
              sx={{ fontSize: '0.7rem', py: 0.5 }}
            >
              Temperature
            </Button>
            <Button
              size="small"
              variant={showPrecipitation ? 'contained' : 'outlined'}
              onClick={() => setShowPrecipitation(true)}
              sx={{ fontSize: '0.7rem', py: 0.5 }}
            >
              Precipitation
            </Button>
          </Box>
          
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 10, fill: 'var(--text-color)' }}
                  stroke="var(--text-color)"
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: 'var(--text-color)' }}
                  stroke="var(--text-color)"
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--card-bg)', 
                    border: '1px solid var(--card-border)',
                    borderRadius: '8px',
                    color: 'var(--text-color)'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey={showPrecipitation ? "precipitation" : "temperature"}
                  stroke="var(--accent)" 
                  strokeWidth={2}
                  dot={{ fill: 'var(--accent)', strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 5, fill: 'var(--accent)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </Box>
      </Box>
    </Card>
  );
};

export default WeatherWidget;