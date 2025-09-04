import React, { useState, useEffect } from 'react';
import { Card, Typography, Box, TextField, IconButton, Button } from '@mui/material';
import { Edit, Save, Cancel } from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import axios from 'axios';

const WeatherWidget = ({ transparentBackground, weatherApiKey }) => {
  const [weatherData, setWeatherData] = useState(null);
  const [forecastData, setForecastData] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [zipCode, setZipCode] = useState('');
  const [editingZip, setEditingZip] = useState(false);
  const [tempZipCode, setTempZipCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chartType, setChartType] = useState('temperature'); // 'temperature' or 'precipitation'

  useEffect(() => {
    // Load saved zip code from localStorage
    const savedZipCode = localStorage.getItem('weatherZipCode') || '14818';
    setZipCode(savedZipCode);
    setTempZipCode(savedZipCode);
  }, []);

  useEffect(() => {
    if (zipCode && weatherApiKey) {
      fetchWeatherData();
    }
  }, [zipCode, weatherApiKey]);

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
      console.log('Fetching weather data for zip:', zipCode);
      console.log('Using API key:', weatherApiKey ? 'Present' : 'Missing');

      // Fetch current weather
      const currentWeatherUrl = `https://api.openweathermap.org/data/2.5/weather?zip=${zipCode},US&appid=${weatherApiKey}&units=imperial`;
      console.log('Current weather URL:', currentWeatherUrl);
      
      const currentResponse = await axios.get(currentWeatherUrl);
      console.log('Current weather response:', currentResponse.data);
      setWeatherData(currentResponse.data);

      // Fetch 5-day forecast
      const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?zip=${zipCode},US&appid=${weatherApiKey}&units=imperial`;
      console.log('Forecast URL:', forecastUrl);
      
      const forecastResponse = await axios.get(forecastUrl);
      console.log('Forecast response:', forecastResponse.data);

      // Process forecast data for 3-day forecast
      const dailyForecasts = [];
      const chartDataPoints = [];
      
      if (forecastResponse.data && forecastResponse.data.list) {
        // Group by day for 3-day forecast
        const forecastByDay = {};
        
        forecastResponse.data.list.slice(0, 24).forEach((item, index) => {
          const date = new Date(item.dt * 1000);
          const dayKey = date.toDateString();
          
          if (!forecastByDay[dayKey]) {
            forecastByDay[dayKey] = {
              date: date,
              temps: {
                min: item.main.temp_min,
                max: item.main.temp_max,
                all: []
              },
              weather: item.weather[0],
              precipitation: item.rain ? item.rain['3h'] || 0 : 0
            };
          } else {
            // Update min/max temperatures for the day
            forecastByDay[dayKey].temps.min = Math.min(forecastByDay[dayKey].temps.min, item.main.temp_min);
            forecastByDay[dayKey].temps.max = Math.max(forecastByDay[dayKey].temps.max, item.main.temp_max);
          }
          
          forecastByDay[dayKey].temps.all.push(item.main.temp);
          
          // Add to chart data (first 8 points for hourly chart)
          if (index < 8) {
            chartDataPoints.push({
              time: date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
              temperature: Math.round(item.main.temp),
              precipitation: item.rain ? item.rain['3h'] || 0 : 0
            });
          }
        });

        // Convert to array and take first 3 days
        const dailyForecastArray = Object.values(forecastByDay).slice(0, 3).map(day => ({
          date: day.date,
          dayName: day.date.toLocaleDateString('en-US', { weekday: 'short' }),
          tempHigh: Math.round(day.temps.max),
          tempLow: Math.round(day.temps.min),
          tempAvg: Math.round(day.temps.all.reduce((a, b) => a + b, 0) / day.temps.all.length),
          weather: day.weather,
          precipitation: day.precipitation
        }));

        setForecastData(dailyForecastArray);
        setChartData(chartDataPoints);
      }

    } catch (error) {
      console.error('Error fetching weather data:', error);
      
      if (error.response) {
        if (error.response.status === 401) {
          setError('Invalid API key. Please check your OpenWeatherMap API key in the Admin Panel.');
        } else if (error.response.status === 404) {
          setError('Invalid zip code. Please enter a valid US zip code.');
        } else {
          setError(`Weather service error: ${error.response.status} ${error.response.statusText}`);
        }
      } else if (error.code === 'ECONNREFUSED' || error.message.includes('Network Error')) {
        setError('Unable to connect to weather service. Please check your internet connection.');
      } else {
        setError('Failed to fetch weather data. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleZipCodeSave = () => {
    setZipCode(tempZipCode);
    localStorage.setItem('weatherZipCode', tempZipCode);
    setEditingZip(false);
  };

  const handleZipCodeCancel = () => {
    setTempZipCode(zipCode);
    setEditingZip(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleZipCodeSave();
    } else if (e.key === 'Escape') {
      handleZipCodeCancel();
    }
  };

  const getWeatherIcon = (iconCode) => {
    // Map OpenWeatherMap icon codes to emojis
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
      <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`}>
        <Typography variant="h6">🌤️ Weather</Typography>
        <Typography>Loading weather data...</Typography>
      </Card>
    );
  }

  return (
    <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">🌤️ Weather</Typography>
        
        {/* Zip Code Editor */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {editingZip ? (
            <>
              <TextField
                size="small"
                value={tempZipCode}
                onChange={(e) => setTempZipCode(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter zip code"
                sx={{ width: 120 }}
                autoFocus
              />
              <IconButton size="small" onClick={handleZipCodeSave}>
                <Save />
              </IconButton>
              <IconButton size="small" onClick={handleZipCodeCancel}>
                <Cancel />
              </IconButton>
            </>
          ) : (
            <>
              <Typography variant="body2" sx={{ cursor: 'pointer' }} onClick={() => setEditingZip(true)}>
                {zipCode || 'Set zip code'}
              </Typography>
              <IconButton size="small" onClick={() => setEditingZip(true)}>
                <Edit />
              </IconButton>
            </>
          )}
        </Box>
      </Box>

      {error && (
        <Box sx={{ mb: 2, p: 2, bgcolor: 'rgba(255, 0, 0, 0.1)', borderRadius: 1 }}>
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        </Box>
      )}

      {weatherData && (
        <Box sx={{ display: 'flex', gap: 3, height: 400 }}>
          {/* Current Weather - Left Column */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography variant="h4" sx={{ fontSize: '3rem', mb: 1 }}>
              {getWeatherIcon(weatherData.weather[0].icon)}
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 'bold', mb: 1 }}>
              {Math.round(weatherData.main.temp)}°F
            </Typography>
            <Typography variant="h6" sx={{ mb: 1, textAlign: 'center' }}>
              {weatherData.name}
            </Typography>
            <Typography variant="body1" sx={{ mb: 2, textAlign: 'center', textTransform: 'capitalize' }}>
              {weatherData.weather[0].description}
            </Typography>
            
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2">
                Feels like {Math.round(weatherData.main.feels_like)}°F
              </Typography>
              <Typography variant="body2">
                Humidity: {weatherData.main.humidity}%
              </Typography>
              <Typography variant="body2">
                Wind: {Math.round(weatherData.wind.speed)} mph
              </Typography>
            </Box>
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
                    {day.tempHigh}°F
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#00ddeb' }}>
                    {day.tempLow}°F
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
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
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

            <Box sx={{ height: 300 }}>
              <ResponsiveContainer width="75%" height="100%">
                {chartType === 'temperature' ? (
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
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
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="precipitation" fill="var(--accent)" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </Box>
          </Box>
        </Box>
      )}
    </Card>
  );
};

export default WeatherWidget;
