// client/src/components/MenuWidget.jsx
import React, { useState, useEffect } from 'react';
import { Card, Typography, TextField, Box, Button, IconButton, List, ListItem, ListItemText } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import '../index.css'; // Assuming global styles are here

const MenuWidget = ({ transparentBackground }) => {
  // Initialize state for menu items for each day
  const [menuItems, setMenuItems] = useState(() => {
    const savedMenu = localStorage.getItem('weeklyMenu');
    const defaultMenu = {
      sunday: [],
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
    };
    // Ensure saved items are arrays, convert if old format (string)
    if (savedMenu) {
      const parsedMenu = JSON.parse(savedMenu);
      for (const day in parsedMenu) {
        if (typeof parsedMenu[day] === 'string') {
          parsedMenu[day] = parsedMenu[day].split(',').map(item => item.trim()).filter(item => item !== '');
        }
      }
      return { ...defaultMenu, ...parsedMenu };
    }
    return defaultMenu;
  });

  const [isEditing, setIsEditing] = useState(false);
  const [newItemText, setNewItemText] = useState({}); // State to hold new item text for each day

  // Save menu items to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('weeklyMenu', JSON.stringify(menuItems));
  }, [menuItems]);

  // Initialize newItemText state for each day
  useEffect(() => {
    const initialNewItemText = {};
    daysOfWeek.forEach(day => {
      initialNewItemText[day] = '';
    });
    setNewItemText(initialNewItemText);
  }, []);

  const handleToggleEdit = () => {
    setIsEditing(!isEditing);
  };

  const handleNewItemTextChange = (day) => (event) => {
    setNewItemText({
      ...newItemText,
      [day]: event.target.value,
    });
  };

  const handleAddItem = (day) => () => {
    const text = newItemText[day].trim();
    if (text) {
      setMenuItems(prevItems => ({
        ...prevItems,
        [day]: [...prevItems[day], text],
      }));
      setNewItemText(prevText => ({
        ...prevText,
        [day]: '', // Clear the input field for that day
      }));
    }
  };

  const handleRemoveItem = (day, index) => () => {
    setMenuItems(prevItems => ({
      ...prevItems,
      [day]: prevItems[day].filter((_, i) => i !== index),
    }));
  };

  const daysOfWeek = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
  ];

  const getFullDayName = (day) => {
    return day.charAt(0).toUpperCase() + day.slice(1);
  };

  const getCurrentDay = () => {
    const date = new Date();
    return daysOfWeek[date.getDay()];
  };

  return (
    <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" gutterBottom sx={{ mb: 0 }}>
          Weekly Menu
        </Typography>
        <IconButton onClick={handleToggleEdit} size="small">
          {isEditing ? <SaveIcon /> : <EditIcon />}
        </IconButton>
      </Box>

      <Box>
        {daysOfWeek.map((day) => (
          <Box
            key={day}
            sx={{
              mb: 2,
              p: 1,
              borderRadius: '8px',
              border: day === getCurrentDay() && !isEditing ? '1px solid var(--accent)' : 'none',
              backgroundColor: day === getCurrentDay() && !isEditing ? 'rgba(var(--text-color-rgb), 0.05)' : 'transparent',
              transition: 'all 0.3s ease',
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
              {getFullDayName(day)}:
            </Typography>
            {isEditing ? (
              <Box>
                <List dense>
                  {menuItems[day].map((item, index) => (
                    <ListItem
                      key={index}
                      secondaryAction={
                        <IconButton edge="end" aria-label="delete" onClick={handleRemoveItem(day, index)} size="small">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      }
                    >
                      <ListItemText primary={item} />
                    </ListItem>
                  ))}
                </List>
                <TextField
                  label={`Add item for ${getFullDayName(day)}`}
                  variant="outlined"
                  size="small"
                  fullWidth
                  value={newItemText[day]}
                  onChange={handleNewItemTextChange(day)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault(); // Prevent form submission
                      handleAddItem(day)();
                    }
                  }}
                  sx={{ mt: 1 }}
                />
                <Button
                  startIcon={<AddIcon />}
                  onClick={handleAddItem(day)}
                  size="small"
                  sx={{ mt: 1 }}
                >
                  Add Item
                </Button>
              </Box>
            ) : (
              <Box>
                {menuItems[day].length > 0 ? (
                  <List dense>
                    {menuItems[day].map((item, index) => (
                      <ListItem key={index}>
                        <ListItemText primary={item} />
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No menu items for {getFullDayName(day)}.
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        ))}
      </Box>
    </Card>
  );
};

export default MenuWidget;
