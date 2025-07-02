import React, { useState, useEffect } from 'react';
import { Card, Typography, TextField, Box } from '@mui/material';
import '../index.css'; // Assuming global styles are here

const MenuWidget = ({ transparentBackground }) => {
  // Initialize state for menu items for each day
  const [menuItems, setMenuItems] = useState(() => {
    const savedMenu = localStorage.getItem('weeklyMenu');
    return savedMenu ? JSON.parse(savedMenu) : {
      sunday: '',
      monday: '',
      tuesday: '',
      wednesday: '',
      thursday: '',
      friday: '',
      saturday: '',
    };
  });

  // Save menu items to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('weeklyMenu', JSON.stringify(menuItems));
  }, [menuItems]);

  const handleMenuItemChange = (day) => (event) => {
    setMenuItems({
      ...menuItems,
      [day]: event.target.value,
    });
  };

  const daysOfWeek = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
  ];

  return (
    <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`}>
      <Typography variant="h6" gutterBottom>
        Weekly Menu
      </Typography>
      <Box>
        {daysOfWeek.map((day) => (
          <Box key={day} sx={{ mb: 2 }}>
            <Typography variant="subtitle1" sx={{ textTransform: 'capitalize', mb: 0.5 }}>
              {day}
            </Typography>
            <TextField
              label={`Menu for ${day}`}
              variant="outlined"
              size="small"
              fullWidth
              value={menuItems[day]}
              onChange={handleMenuItemChange(day)}
            />
          </Box>
        ))}
      </Box>
    </Card>
  );
};

export default MenuWidget;