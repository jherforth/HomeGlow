// client/src/components/WeatherWidget.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, Typography, TextField, Button, Box, Tabs, Tab, Dialog, DialogTitle, DialogContent, DialogActions, IconButton } from '@mui/material';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import CloudIcon from '@mui/icons-material/Cloud';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import GrainIcon from '@mui/icons-material/Grain';
import SettingsIcon from '@mui/icons-material/Settings'; // Import SettingsIcon
import '../index.css'; // Assuming global styles are here

// Recharts imports
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const WeatherWidget = ({ transparentBackground, weatherApiKey }) => {
  const [zipCode, setZipCode] = useState(() => {
    const savedZip = localStorage.getItem('weatherZipCode');
    return savedZip || '';
  });
  const [weatherData, setWeatherData] = useState(null);
  const [forecastData, setForecastData] = useState(null); // For 3-day summary
  const [chartData, setChartData] = useState([]); // For 3-hourly chart data
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date()); // New state for current time
  const [showSettingsModal, setShowSettingsModal] = useState(false); // New state for settings modal

  useEffect(() => {
    localStorage.setItem('weatherZipCode', zipCode);
  }, [zipCode]);

  // Effect to update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (zipCode) {
      fetchWeather();
    }
  }, [zipCode, weatherApiKey]);

  const handleOpenSettings = () => {
    setShowSettingsModal(true);
  };

  const handleCloseSettings = () => {
    setShowSettingsModal(false);
  };

  const fetchWeather = async () => {
    if (!zipCode) {
      setError('Please enter a zip code.');
      return;
    }
    if (!weatherApiKey) {
      setError('OpenWeatherMap API key is not configured. Please add it in the Admin Panel.');
      return;
    }

    // ADD THIS LINE TO LOG THE API KEY
    console.log('Using OpenWeatherMap API Key:', weatherApiKey);

    setLoading(true);
    setError(null);
    setWeatherData(null);
    setForecastData(null);
    setChartData([]);

    try {
      // Fetch current weather
      const currentWeatherResponse = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?zip=${zipCode},us&appid=${weatherApiKey}&units=imperial`
      );
      setWeatherData(currentWeatherResponse.data);

      // Fetch 5-day / 3-hour forecast
      const forecastResponse = await axios.get(
        `https://api.openweathermap.org/data/2.5/forecast?zip=${zipCode},us&appid=${weatherApiKey}&units=imperial`
      );

      // Process forecast data for 3-day summary
      const dailyForecasts = {};
      const hourlyChartData = []; // Data for charts

      if (Array.isArray(forecastResponse.data.list)) {
        forecastResponse.data.list.forEach(item => {
          const date = new Date(item.dt * 1000);
          const dateString = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

          // For 3-day summary
          if (!dailyForecasts[dateString]) {
            dailyForecasts[dateString] = {
              temp_max: -Infinity,
              temp_min: Infinity,
              description: item.weather[0].description,
              icon: item.weather[0].icon,
            };
          }
          dailyForecasts[dateString].temp_max = Math.max(dailyForecasts[dateString].temp_max, item.main.temp_max);
          dailyForecasts[dateString].temp_min = Math.min(dailyForecasts[dateString].temp_min, item.main.temp_min);

          // For chart data (using 3-hourly data)
          hourlyChartData.push({
            time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            temp: item.main.temp,
            humidity: item.main.humidity,
            pop: item.pop * 100, // Probability of precipitation in percentage
          });
        });
      }

      const forecastArray = Object.entries(dailyForecasts)
        .slice(0, 3) // Get next 3 days
        .map(([date, data]) => ({
          date,
          temp_max: data.temp_max,
          temp_min: data.temp_min,
          description: data.description,
          icon: data.icon,
        }));
      setForecastData(forecastArray);
      setChartData(hourlyChartData);

    } catch (err) {
      console.error('Error fetching weather data:', err);
      if (err.response && err.response.status === 404) {
        setError('Zip code not found. Please try again.');
      } else {
        setError('Failed to fetch weather data. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getWeatherIcon = (iconCode) => {
    if (!iconCode) return null;
    return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  };

  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };

  return (
    <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`}> {/* Apply transparent-card class */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Weather</Typography>
        <IconButton onClick={handleOpenSettings} size="small">
          <SettingsIcon fontSize="small" />
        </IconButton>
      </Box>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold' }}>
        {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </Typography>

      {(!weatherData && !loading) && (
        <Box sx={{ mt: 2 }}>
          <TextField
            label="Enter Zip Code"
            variant="outlined"
            size="small"
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
            fullWidth
            sx={{ mb: 1 }}
          />
          <Button variant="contained" onClick={fetchWeather} disabled={loading} fullWidth>
            {loading ? 'Loading...' : 'Get Weather'}
          </Button>
        </Box>
      )}

      {error && <Typography color="error" sx={{ mt: 2 }}>{error}</Typography>}

      {weatherData && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="h5">{weatherData.name}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
            {weatherData.weather[0].icon && (
              <img
                src={getWeatherIcon(weatherData.weather[0].icon)}
                alt={weatherData.weather[0].description}
                width="50"
                height="50"
              />
            )}
            <Typography variant="h4" sx={{ ml: 1 }}>
              {Math.round(weatherData.main.temp)}°F
            </Typography>
          </Box>
          <Typography variant="body1" sx={{ textTransform: 'capitalize' }}>
            {weatherData.weather[0].description}
          </Typography>
          <Typography variant="body2">
            Feels like: {Math.round(weatherData.main.feels_like)}°F
          </Typography>
        </Box>
      )}

      {forecastData && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6">3-Day Forecast</Typography>
          {Array.isArray(forecastData) && forecastData.map((day, index) => ( // Ensure forecastData is an array before mapping
            <Box key={index} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
              <Typography variant="body2">{day.date}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                {day.icon && (
                  <img
                    src={getWeatherIcon(day.icon)}
                    alt={day.description}
                    width="30"
                    height="30"
                  />
                )}
                <Typography variant="body2" sx={{ ml: 1 }}>
                  {Math.round(day.temp_min)}°F / {Math.round(day.temp_max)}°F
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {chartData.length > 0 && ( // Only show tabs if chart data is available
        <Box sx={{ width: '100%', mt: 3 }}>
          <Tabs value={selectedTab} onChange={handleTabChange} aria-label="weather graphs tabs" centered> {/* Added 'centered' prop here */}
            <Tab label="Temperature" />
            <Tab label="Precipitation" />
          </Tabs>
          <Box sx={{ p: 2, height: 250 }}> {/* Fixed height for chart container */}
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{
                  top: 5,
                  right: 30,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={transparentBackground ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)'} />
                <XAxis dataKey="time" stroke={transparentBackground ? 'white' : 'black'} />
                <YAxis stroke={transparentBackground ? 'white' : 'black'} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: transparentBackground ? 'rgba(0,0,0,0.8)' : 'white',
                    border: transparentBackground ? '1px solid rgba(255,255,255,0.5)' : '1px solid #ccc',
                    color: transparentBackground ? 'white' : 'black',
                  }}
                  itemStyle={{ color: transparentBackground ? 'white' : 'black' }}
                />
                <Legend />
                {selectedTab === 0 && (
                  <Line
                    type="monotone"
                    dataKey="temp"
                    name="Temperature (°F)"
                    stroke="#8884d8"
                    activeDot={{ r: 8 }}
                  />
                )}
                {selectedTab === 1 && (
                  <Line
                    type="monotone"
                    dataKey="pop"
                    name="Precipitation (%)"
                    stroke="#82ca9d"
                    activeDot={{ r: 8 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </Box>
      )}

      <Dialog open={showSettingsModal} onClose={handleCloseSettings}>
        <DialogTitle>Weather Settings</DialogTitle>
        <DialogContent>
          <TextField
            label="Enter Zip Code"
            variant="outlined"
            size="small"
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
            fullWidth
            sx={{ mb: 1, mt: 2 }}
          />
          {error && <Typography color="error" sx={{ mt: 1 }}>{error}</Typography>}\
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseSettings}>Cancel</Button>
          <Button onClick={() => { fetchWeather(); handleCloseSettings(); }} disabled={loading}>
            {loading ? 'Loading...' : 'Get Weather'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default WeatherWidget;
