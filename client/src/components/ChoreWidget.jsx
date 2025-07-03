import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { Button, Card, Typography, TextField, Box, FormControl, InputLabel, Select, MenuItem, Radio, RadioGroup, FormControlLabel, FormLabel } from '@mui/material';
import Hammer from 'hammerjs';
import '../index.css';

const ChoreWidget = ({ transparentBackground }) => {
  const [chores, setChores] = useState([]);
  const [users, setUsers] = useState([]); // State to store users
  const [newTask, setNewTask] = useState({
    title: '',
    description: '', // Keeping description for now, though not explicitly requested for new task form
    timePeriod: '',
    assignedTo: '', // User ID
    assignedDayOfWeek: '',
    repeats: 'Doesn\'t repeat',
  });
  const [error, setError] = useState(null);
  const cardRef = useRef(null);

  // Helper to get current day of the week as a string (e.g., "monday")
  const getCurrentDayOfWeek = () => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[new Date().getDay()];
  };

  // Fetch Users and Chores
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch users
        const usersResponse = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users`);
        setUsers(Array.isArray(usersResponse.data) ? usersResponse.data : []);

        // Fetch chores
        const choresResponse = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores`);
        setChores(Array.isArray(choresResponse.data) ? choresResponse.data : []);
        setError(null);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Cannot connect to service. Please try again later.');
      }
    };
    fetchData();
  }, []);

  // Hammer.js for swipe to complete (existing functionality)
  useEffect(() => {
    const hammer = new Hammer(cardRef.current);
    hammer.on('swiperight', (e) => {
      const choreId = e.target.dataset.choreId;
      if (choreId) {
        markChoreComplete(choreId);
      }
    });
    return () => hammer.destroy();
  }, [chores]);

  const markChoreComplete = async (choreId) => {
    try {
      await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores/${choreId}`, {
        completed: true,
      });
      setChores(
        chores.map((chore) =>
          chore.id === parseInt(choreId) ? { ...chore, completed: true } : chore
        )
      );
      setError(null);
      // TODO: Implement clam reward logic here after task completion
    } catch (err) {
      console.error('Error marking chore complete:', err);
      setError('Failed to update chore. Please try again.');
    }
  };

  const handleNewTaskInputChange = (e) => {
    const { name, value } = e.target;
    setNewTask({ ...newTask, [name]: value });
  };

  const handleAddTask = async () => {
    if (!newTask.title.trim() || !newTask.assignedTo || !newTask.timePeriod || !newTask.assignedDayOfWeek) {
      setError('Please fill all required fields for the new task.');
      return;
    }
    try {
      const response = await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores`, {
        user_id: newTask.assignedTo,
        title: newTask.title,
        description: newTask.description,
        time_period: newTask.timePeriod,
        assigned_day_of_week: newTask.assignedDayOfWeek,
        repeats: newTask.repeats,
        completed: false,
      });
      setChores([...chores, { ...newTask, id: response.data.id, completed: false }]);
      setNewTask({ // Reset form
        title: '',
        description: '',
        timePeriod: '',
        assignedTo: '',
        assignedDayOfWeek: '',
        repeats: 'Doesn\'t repeat',
      });
      setError(null);
    } catch (err) {
      console.error('Error adding chore:', err);
      setError('Failed to add chore. Please try again.');
    }
  };

  const currentDay = getCurrentDayOfWeek();

  return (
    <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`} ref={cardRef} sx={{ width: '100%', maxWidth: 'none' }}>
      <Typography variant="h6" gutterBottom>Chores</Typography>
      {error && <Typography color="error">{error}</Typography>}

      {/* User Row with Profile Pictures and Tasks */}
      <Box sx={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', mb: 3 }}>
        {users.length === 0 && !error && <Typography>No users available.</Typography>}
        {users.map(user => (
          <Box key={user.id} sx={{ textAlign: 'center', mx: 1, mb: 2 }}>
            <Box sx={{
              position: 'relative',
              width: 80,
              height: 80,
              borderRadius: '50%',
              overflow: 'hidden',
              border: '2px solid grey', // Placeholder for dynamic border
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'lightgray', // Fallback background
              mx: 'auto',
              mb: 1,
            }}>
              {user.profile_picture ? (
                <img
                  src={user.profile_picture}
                  alt={user.username}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                />
              ) : (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>No Pic</Typography>
              )}
              {/* Placeholder for Clam Total */}
              <Typography
                variant="caption"
                sx={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bgcolor: 'rgba(0,0,0,0.6)',
                  color: 'white',
                  borderRadius: '0 0 0 8px',
                  px: 0.5,
                  py: 0.2,
                  fontSize: '0.7rem',
                }}
              >
                {user.clam_total || 0} 🐚
              </Typography>
            </Box>
            <Typography variant="subtitle2" sx={{ textTransform: 'capitalize' }}>{user.username}</Typography>
            <Box sx={{ mt: 1, textAlign: 'left' }}>
              {chores
                .filter(chore => chore.assigned_to_user_id === user.id && chore.assigned_day_of_week === currentDay)
                .map(chore => (
                  <Box key={chore.id} sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                    <Radio
                      checked={chore.completed}
                      onChange={() => markChoreComplete(chore.id)}
                      value={chore.id}
                      name={`chore-complete-${chore.id}`}
                      sx={{
                        color: chore.completed ? 'green' : 'inherit',
                        '&.Mui-checked': {
                          color: 'green',
                        },
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        textDecoration: chore.completed ? 'line-through' : 'none',
                        ml: 0.5,
                      }}
                    >
                      {chore.title} ({chore.time_period})
                    </Typography>
                  </Box>
                ))}
              {chores.filter(chore => chore.assigned_to_user_id === user.id && chore.assigned_day_of_week === currentDay).length === 0 && (
                <Typography variant="body2" color="text.secondary">No tasks today</Typography>
              )}
            </Box>
          </Box>
        ))}
      </Box>

      {/* Add New Task Form */}
      <Box sx={{ mt: 3, p: 2, borderTop: '1px solid var(--card-border)' }}>
        <Typography variant="h6" gutterBottom>Add New Task</Typography>
        <TextField
          name="title"
          label="Task Name"
          variant="outlined"
          size="small"
          fullWidth
          value={newTask.title}
          onChange={handleNewTaskInputChange}
          sx={{ mb: 2 }}
        />
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>Task Time Period</InputLabel>
          <Select
            name="timePeriod"
            value={newTask.timePeriod}
            label="Task Time Period"
            onChange={handleNewTaskInputChange}
          >
            <MenuItem value=""><em>None</em></MenuItem>
            <MenuItem value="morning">Morning</MenuItem>
            <MenuItem value="afternoon">Afternoon</MenuItem>
            <MenuItem value="evening">Evening</MenuItem>
          </Select>
        </FormControl>
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>Assign Member</InputLabel>
          <Select
            name="assignedTo"
            value={newTask.assignedTo}
            label="Assign Member"
            onChange={handleNewTaskInputChange}
          >
            <MenuItem value=""><em>None</em></MenuItem>
            {users.map(user => (
              <MenuItem key={user.id} value={user.id}>{user.username}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>Assigned Day of the Week</InputLabel>
          <Select
            name="assignedDayOfWeek"
            value={newTask.assignedDayOfWeek}
            label="Assigned Day of the Week"
            onChange={handleNewTaskInputChange}
          >
            <MenuItem value=""><em>None</em></MenuItem>
            <MenuItem value="sunday">Sunday</MenuItem>
            <MenuItem value="monday">Monday</MenuItem>
            <MenuItem value="tuesday">Tuesday</MenuItem>
            <MenuItem value="wednesday">Wednesday</MenuItem>
            <MenuItem value="thursday">Thursday</MenuItem>
            <MenuItem value="friday">Friday</MenuItem>
            <MenuItem value="saturday">Saturday</MenuItem>
          </Select>
        </FormControl>
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>Repeats</InputLabel>
          <Select
            name="repeats"
            value={newTask.repeats}
            label="Repeats"
            onChange={handleNewTaskInputChange}
          >
            <MenuItem value="Doesn't repeat">Doesn't repeat</MenuItem>
            <MenuItem value="Weekly on this day">Weekly on this day</MenuItem>
            <MenuItem value="Daily">Daily</MenuItem>
          </Select>
        </FormControl>
        <Button variant="contained" onClick={handleAddTask} fullWidth>
          Add New Task
        </Button>
      </Box>
    </Card>
  );
};

export default ChoreWidget;
