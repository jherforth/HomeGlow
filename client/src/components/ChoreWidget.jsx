import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import {
  Button,
  Card,
  Typography,
  TextField,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import Hammer from 'hammerjs';
import '../index.css';

const ChoreWidget = ({ transparentBackground }) => {
  const [chores, setChores] = useState([]);
  const [users, setUsers] = useState([]);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    timePeriod: '',
    assignedTo: '',
    assignedDayOfWeek: '',
    repeats: 'Doesn\'t repeat',
  });
  const [error, setError] = useState(null);
  const [openAddTaskDialog, setOpenAddTaskDialog] = useState(false);
  const cardRef = useRef(null);

  const getCurrentDayOfWeek = () => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[new Date().getDay()];
  };

  // Function to fetch all necessary data
  const fetchData = async () => {
    try {
      const usersResponse = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users`);
      setUsers(Array.isArray(usersResponse.data) ? usersResponse.data : []);

      const choresResponse = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores`);
      setChores(Array.isArray(choresResponse.data) ? choresResponse.data : []);
      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Cannot connect to service. Please try again later.');
    }
  };

  // Fetch data on component mount
  useEffect(() => {
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
      setError(null);
      // Re-fetch data to update UI
      fetchData(); // Re-fetch data to update chores and user clam totals
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
      await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores`, {
        user_id: newTask.assignedTo,
        title: newTask.title,
        description: newTask.description,
        time_period: newTask.timePeriod,
        assigned_day_of_week: newTask.assignedDayOfWeek,
        repeats: newTask.repeats,
        completed: false,
      });
      setNewTask({
        title: '',
        description: '',
        timePeriod: '',
        assignedTo: '',
        assignedDayOfWeek: '',
        repeats: 'Doesn\'t repeat',
      });
      setError(null);
      setOpenAddTaskDialog(false);
      // Re-fetch data to update UI
      fetchData();
    } catch (err) {
      console.error('Error adding chore:', err);
      setError('Failed to add chore. Please try again.');
    }
  };

  const currentDay = getCurrentDayOfWeek();

  const handleOpenAddTaskDialog = () => {
    setOpenAddTaskDialog(true);
    setError(null);
  };

  const handleCloseAddTaskDialog = () => {
    setOpenAddTaskDialog(false);
    setError(null);
    setNewTask({
      title: '',
      description: '',
      timePeriod: '',
      assignedTo: '',
      assignedDayOfWeek: '',
      repeats: 'Doesn\'t repeat',
    });
  };

  return (
    <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`} ref={cardRef} sx={{ width: '100%', maxWidth: 'none' }}>
      <Typography variant="h6" gutterBottom>Chores</Typography>
      {error && <Typography color="error">{error}</Typography>}

      {/* User Row with Profile Pictures and Tasks */}
      <Box sx={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', mb: 3 }}>
        {users.length === 0 && !error && <Typography>No users available.</Typography>}
        {users.map(user => {
          const userDailyChores = chores.filter(
            chore => parseInt(chore.user_id) === user.id && chore.assigned_day_of_week === currentDay
          );
          const completedDailyChores = userDailyChores.filter(chore => chore.completed).length;
          const totalDailyChores = userDailyChores.length;
          const completionPercentage = totalDailyChores > 0 ? (completedDailyChores / totalDailyChores) * 100 : 0;

          return (
            <Box key={user.id} sx={{ textAlign: 'center', mx: 1, mb: 2, position: 'relative' }}> {/* Parent Box is now relative */}
              <Box sx={{ // Profile picture Box (no longer relative, no clam total inside)
                width: 80,
                height: 80,
                borderRadius: '50%',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'lightgray',
                mx: 'auto',
                mb: 1,
                border: '2px solid grey', // Default border for profile pic
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
              </Box>
              {/* Display Clam Total - now a sibling of the profile picture Box */}
              <Typography
                variant="caption"
                sx={{
                  position: 'absolute',
                  top: '0%', // Center vertically
                  left: '50%', // Center horizontally
                  transform: 'translate(-50%, -50%)', // Adjust for its own size
                  width: 35, // Fixed width for circular shape
                  height: 35, // Fixed height for circular shape
                  borderRadius: '50%', // Circular shape
                  bgcolor: 'rgba(0,0,0,0.7)',
                  color: 'white',
                  display: 'flex', // Use flexbox for centering content
                  alignItems: 'center', // Center vertically
                  justifyContent: 'center', // Center horizontally
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                }}
              >
                {user.clam_total || 0}🐚
              </Typography>
              {/* Progress Bar */}
              <Box sx={{
                width: 80,
                height: 8,
                bgcolor: 'grey.300', // Background for empty part
                borderRadius: 4,
                mx: 'auto',
                mt: 0.5,
                overflow: 'hidden', // Ensure inner bar is clipped
              }}>
                <Box sx={{
                  width: `${completionPercentage}%`,
                  height: '100%',
                  bgcolor: 'green', // Color for filled part
                  borderRadius: 4,
                  transition: 'width 0.5s ease-in-out', // Smooth transition
                }} />
              </Box>
              <Typography variant="subtitle2" sx={{ textTransform: 'capitalize', mt: 0.5 }}>{user.username}</Typography>
              <Box sx={{ mt: 1, textAlign: 'left' }}>
                {userDailyChores.map(chore => (
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
                {userDailyChores.length === 0 && (
                  <Typography variant="body2" color="text.secondary">No tasks today</Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Button to open Add New Task Dialog */}
      <Box sx={{ mt: 3, p: 2, borderTop: '1px solid var(--card-border)' }}>
        <Button variant="contained" onClick={handleOpenAddTaskDialog} fullWidth>
          Add New Task
        </Button>
      </Box>

      {/* Add New Task Dialog */}
      <Dialog open={openAddTaskDialog} onClose={handleCloseAddTaskDialog}>
        <DialogTitle>Add New Task</DialogTitle>
        <DialogContent>
          {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
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
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAddTaskDialog}>Cancel</Button>
          <Button onClick={handleAddTask} variant="contained">Add Task</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default ChoreWidget;
