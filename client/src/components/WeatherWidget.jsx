import React, { useState, useEffect } from 'react';
import { Card, Typography, Box, Button, ButtonGroup } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import axios from 'axios';

const WeatherWidget = ({ transparentBackground, weatherApiKey }) => {
  const [weatherData, setWeatherData] = useState(null);
  const [forecastData, setForecastData] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [activeChart, setActiveChart] = useState('temperature');
  const [zipCode, setZipCode] = useState('12345'); // Default zip code
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (weatherApiKey) {
      fetchWeatherData();
    }
  }, [weatherApiKey, zipCode]);

  const fetchWeatherData = async () => {
    if (!weatherApiKey) {
      setError('Weather API key not configured');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch current weather
      const currentResponse = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?zip=${zipCode}&appid=${weatherApiKey}&units=imperial`
      );
      setWeatherData(currentResponse.data);

      // Fetch 5-day forecast
      const forecastResponse = await axios.get(
        `https://api.openweathermap.org/data/2.5/forecast?zip=${zipCode}&appid=${weatherApiKey}&units=imperial`
      );
      
      // Process forecast data - get one entry per day for next 3 days
      const dailyForecasts = [];
      const processedDates = new Set();
      
      forecastResponse.data.list.forEach(item => {
        const date = new Date(item.dt * 1000).toDateString();
        if (!processedDates.has(date) && dailyForecasts.length < 3) {
          dailyForecasts.push({
            date: new Date(item.dt * 1000),
            temp_min: Math.round(item.main.temp_min),
            temp_max: Math.round(item.main.temp_max),
            description: item.weather[0].description,
            icon: item.weather[0].icon,
            humidity: item.main.humidity,
            precipitation: item.pop * 100, // Convert to percentage
          });
          processedDates.add(date);
        }
      });
      
      setForecastData(dailyForecasts);

      // Create chart data from hourly forecast (next 24 hours)
      const hourlyData = forecastResponse.data.list.slice(0, 8).map(item => ({
        time: new Date(item.dt * 1000).toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          hour12: true 
        }),
        temperature: Math.round(item.main.temp),
        precipitation: Math.round(item.pop * 100),
        humidity: item.main.humidity,
      }));
      
      setChartData(hourlyData);
    } catch (error) {
      console.error('Error fetching weather data:', error);
      setError('Failed to fetch weather data');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getWeatherIcon = (iconCode) => {
    const iconMap = {
      '01d': '☀️', '01n': '🌙', '02d': '⛅', '02n': '☁️',
      '03d': '☁️', '03n': '☁️', '04d': '☁️', '04n': '☁️',
      '09d': '🌧️', '09n': '🌧️', '10d': '🌦️', '10n': '🌧️',
      '11d': '⛈️', '11n': '⛈️', '13d': '❄️', '13n': '❄️',
      '50d': '🌫️', '50n': '🌫️'
    };
    return iconMap[iconCode] || '🌤️';
  };

  if (loading) {
    return (
      <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`} sx={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography>Loading weather data...</Typography>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`} sx={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="error">{error}</Typography>
      </Card>
    );
  }

  return (
    <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`} sx={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
        🌤️ Weather
      </Typography>
      
      <Box sx={{ display: 'flex', height: '100%', gap: 2 }}>
        {/* Left Column - Current Weather */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {weatherData && (
            <>
              <Typography variant="caption" sx={{ color: 'var(--accent)', mb: 1 }}>
                {new Date().toLocaleTimeString('en-US', { 
                  hour: '2-digit', 
                  minute: '2-digit',
                  hour12: true 
                })}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
                {weatherData.name}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="h3" sx={{ fontSize: '2rem', mr: 1 }}>
                  {getWeatherIcon(weatherData.weather[0].icon)}
                </Typography>
                <Typography variant="h3" sx={{ fontSize: '2.5rem', fontWeight: 'bold' }}>
                  {Math.round(weatherData.main.temp)}°F
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ textTransform: 'capitalize', mb: 1 }}>
                {weatherData.weather[0].description}
              </Typography>
              <Typography variant="caption" sx={{ color: 'var(--accent)' }}>
                Feels like {Math.round(weatherData.main.feels_like)}°F
              </Typography>
            </>
          )}
        </Box>

        {/* Middle Column - 3-Day Forecast */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold', color: 'var(--accent)' }}>
            3-Day Forecast
          </Typography>
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {forecastData.map((day, index) => (
              <Box key={index} sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                p: 1,
                borderRadius: 1,
                backgroundColor: 'rgba(var(--accent-rgb), 0.1)',
                border: '1px solid var(--card-border)'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                  <Typography variant="body2" sx={{ fontSize: '1.2rem', mr: 1 }}>
                    {getWeatherIcon(day.icon)}
                  </Typography>
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block' }}>
                      {formatDate(day.date)}
                    </Typography>
                    <Typography variant="caption" sx={{ fontSize: '0.7rem', opacity: 0.8 }}>
                      {day.description}
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                  {day.temp_min}° / {day.temp_max}°F
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Right Column - Charts */}
        <Box sx={{ flex: 1.5, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'var(--accent)' }}>
              24-Hour Forecast
            </Typography>
            <ButtonGroup size="small" variant="outlined">
              <Button 
                onClick={() => setActiveChart('temperature')}
                variant={activeChart === 'temperature' ? 'contained' : 'outlined'}
                sx={{ fontSize: '0.7rem', px: 1 }}
              >
                TEMP
              </Button>
              <Button 
                onClick={() => setActiveChart('precipitation')}
                variant={activeChart === 'precipitation' ? 'contained' : 'outlined'}
                sx={{ fontSize: '0.7rem', px: 1 }}
              >
                RAIN
              </Button>
            </ButtonGroup>
          </Box>
          
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              {activeChart === 'temperature' ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 10, fill: 'var(--text-color)' }}
                    axisLine={{ stroke: 'var(--card-border)' }}
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: 'var(--text-color)' }}
                    axisLine={{ stroke: 'var(--card-border)' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--card-bg)', 
                      border: '1px solid var(--card-border)',
                      borderRadius: '8px',
                      fontSize: '0.8rem'
                    }}
                    formatter={(value) => [`${value}°F`, 'Temperature']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="temperature" 
                    stroke="var(--accent)" 
                    strokeWidth={2}
                    dot={{ fill: 'var(--accent)', strokeWidth: 2, r: 3 }}
                  />
                </LineChart>
              ) : (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 10, fill: 'var(--text-color)' }}
                    axisLine={{ stroke: 'var(--card-border)' }}
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: 'var(--text-color)' }}
                    axisLine={{ stroke: 'var(--card-border)' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--card-bg)', 
                      border: '1px solid var(--card-border)',
                      borderRadius: '8px',
                      fontSize: '0.8rem'
                    }}
                    formatter={(value) => [`${value}%`, 'Precipitation']}
                  />
                  <Bar 
                    dataKey="precipitation" 
                    fill="var(--accent)"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </Box>
        </Box>
      </Box>
    </Card>
  );
};

export default WeatherWidget;