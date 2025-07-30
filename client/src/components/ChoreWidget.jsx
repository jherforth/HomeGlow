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
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import Hammer from 'hammerjs';
import '../index.css';

const ChoreWidget = ({ transparentBackground }) => {
  const [chores, setChores] = useState([]);
  const [users, setUsers] = useState([]);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    assignedTo: '',
    selectedDays: [], // Array of day indices (0=Sunday, 1=Monday, etc.)
    repeatType: 'no-repeat', // 'no-repeat', 'weekly', 'daily', 'until-completed'
    timePeriod: 'any-time', // 'morning', 'afternoon', 'evening', 'any-time'
    clamValue: '', // New field for bonus chores
  });
  const [error, setError] = useState(null);
  const [openAddTaskDialog, setOpenAddTaskDialog] = useState(false);
  const [openBonusChoresDialog, setOpenBonusChoresDialog] = useState(false);
  const [bonusChores, setBonusChores] = useState([]);
  const [selectedBonusChore, setSelectedBonusChore] = useState(null);
  const [claimingUser, setClaimingUser] = useState(null);
  const [openPrizeListDialog, setOpenPrizeListDialog] = useState(false);
  const [prizes, setPrizes] = useState([]);
  const cardRef = useRef(null);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayAbbreviations = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
      // Filter for bonus chores (user_id 0, clam_value > 0)
      const fetchedBonusChores = choresResponse.data.filter(chore => chore.user_id === 0 && chore.clam_value > 0);
      setBonusChores(fetchedBonusChores);
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
    if (cardRef.current) { // Add this check
      const hammer = new Hammer(cardRef.current);
      hammer.on('swiperight', (e) => {
        const choreId = e.target.dataset.choreId;
        if (choreId) {
          markChoreComplete(choreId);
        }
      });
      return () => hammer.destroy();
    }
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
    setNewTask((prevTask) => {
      const updatedTask = { ...prevTask, [name]: value };

      // If assignedTo changes to bonus user (ID 0), set defaults for timePeriod, assignedDayOfWeek, and repeats
      if (name === 'assignedTo' && parseInt(value) === 0) {
        updatedTask.timePeriod = 'any-time';
        updatedTask.selectedDays = [new Date().getDay()]; // Current day
        updatedTask.repeatType = 'no-repeat'; // Bonus chores don't repeat in the traditional sense
      } else if (name === 'assignedTo' && parseInt(value) !== 0) {
        // If assignedTo changes to a regular user, reset these fields if they were previously set by bonus logic
        if (prevTask.assignedTo === '0') {
          updatedTask.timePeriod = 'any-time';
          updatedTask.selectedDays = [];
          updatedTask.repeatType = 'no-repeat';
        }
      }
      return updatedTask;
    });
  };

  const handleDayToggle = (dayIndex) => {
    setNewTask(prevTask => {
      const selectedDays = [...prevTask.selectedDays];
      const dayIndexNum = parseInt(dayIndex);
      
      if (selectedDays.includes(dayIndexNum)) {
        // Remove day
        return {
          ...prevTask,
          selectedDays: selectedDays.filter(day => day !== dayIndexNum)
        };
      } else {
        // Add day
        return {
          ...prevTask,
          selectedDays: [...selectedDays, dayIndexNum].sort()
        };
      }
    });
  };

  const handleAddTask = async () => {
    // General validation for all tasks
    if (!newTask.title.trim()) {
      setError('Please fill all required fields for the new task.');
      return;
    }

    // Specific validation for non-bonus tasks
    if (parseInt(newTask.assignedTo) !== 0) {
      if (!newTask.assignedTo || newTask.selectedDays.length === 0) {
        setError('Please select an assignee and at least one day for the task.');
        return;
      }
    }

    // Validation for clamValue if bonus user is selected
    if (parseInt(newTask.assignedTo) === 0 && (!newTask.clamValue || parseInt(newTask.clamValue) <= 0)) {
      setError('Clam Value is required and must be a positive integer for bonus chores.');
      return;
    }

    try {
      // Create chores for each selected day
      const chorePromises = newTask.selectedDays.map(dayIndex => {
        const dayName = dayNames[dayIndex].toLowerCase();
        return axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores`, {
          user_id: parseInt(newTask.assignedTo),
          title: newTask.title,
          description: newTask.description,
          time_period: newTask.timePeriod,
          assigned_day_of_week: dayName,
          repeat_type: newTask.repeatType,
          completed: false,
          clam_value: parseInt(newTask.assignedTo) === 0 ? parseInt(newTask.clamValue) : 0,
          expiration_date: null,
        });
      });

      await Promise.all(chorePromises);
      
      setNewTask({
        title: '',
        description: '',
        timePeriod: 'any-time',
        assignedTo: '',
        selectedDays: [],
        repeatType: 'no-repeat',
        clamValue: '',
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
      timePeriod: 'any-time',
      assignedTo: '',
      selectedDays: [],
      repeatType: 'no-repeat',
      clamValue: '',
    });
  };

  const handleOpenBonusChoresDialog = () => {
    setOpenBonusChoresDialog(true);
    setError(null);
  };

  const handleCloseBonusChoresDialog = () => {
    setOpenBonusChoresDialog(false);
    setError(null);
    setSelectedBonusChore(null);
    setClaimingUser(null);
  };

  const handleOpenPrizeListDialog = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/prizes`);
      setPrizes(Array.isArray(response.data) ? response.data : []);
      setOpenPrizeListDialog(true);
      setError(null);
    } catch (err) {
      console.error('Error fetching prizes:', err);
      setError('Failed to fetch prizes. Please try again.');
    }
  };

  const handleClosePrizeListDialog = () => {
    setOpenPrizeListDialog(false);
    setError(null);
  };

  const handleGrabBonusClick = (userId) => {
    setClaimingUser(userId);
    setOpenBonusChoresDialog(true);
    setError(null);
  };

  const handleSelectBonusChore = (event) => {
    setSelectedBonusChore(parseInt(event.target.value));
  };

  const handleConfirmGrabBonus = async () => {
    if (!selectedBonusChore || !claimingUser) {
      setError('Please select a bonus chore and ensure a user is claiming it.');
      return;
    }

    try {
      await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores/${selectedBonusChore}/assign`, {
        user_id: claimingUser,
      });
      setError(null);
      handleCloseBonusChoresDialog();
      fetchData(); // Re-fetch data to update UI
    } catch (err) {
      console.error('Error assigning bonus chore:', err);
      setError(err.response?.data?.error || 'Failed to assign bonus chore. Please try again.');
    }
  };

  return (
    <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`} ref={cardRef} sx={{ width: '100%', maxWidth: 'none' }}>
      <Typography variant="h6" gutterBottom>Chores</Typography>
      {error && <Typography color="error">{error}</Typography>}

      {/* User Row with Profile Pictures and Tasks */}
      <Box sx={{ display: 'flex', justifyContent: 'space-evenly', flexWrap: 'wrap', mb: 3, gap: 2 }}> {/* Changed justifyContent to 'space-evenly' */}
        {users.length === 0 && !error && <Typography>No users available.</Typography>}
        {users.filter(user => user.id !== 0).map(user => {
          const userDailyChores = chores.filter(
            chore => parseInt(chore.user_id) === user.id && chore.assigned_day_of_week === currentDay
          );
          const completedDailyChores = userDailyChores.filter(chore => chore.completed).length;
          const totalDailyChores = userDailyChores.length;
          const completionPercentage = totalDailyChores > 0 ? (completedDailyChores / totalDailyChores) * 100 : 0;

          return (
            <Box key={user.id} sx={{ textAlign: 'center', mb: 2, position: 'relative' }}> {/* Removed mx: 1 */}
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
                  bgcolor: 'rgba(137, 152, 218, 0.53)', // Changed color for better visibility
                  color: 'white',
                  display: 'flex', // Use flexbox for centering content
                  alignItems: 'center', // Center vertically
                  justifyContent: 'center', // Center horizontally
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                }}
              >
                {user.clam_total || 0}🥟
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
              {user.id !== 0 && ( // Only show "Grab Bonus" for actual users, not the bonus user itself
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => handleGrabBonusClick(user.id)}
                  sx={{ mt: 1 }}
                >
                  Grab Bonus
                </Button>
              )}
            </Box>
          );
        })}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 2 }}>
        <Button
          variant="contained"
          onClick={handleOpenPrizeListDialog}
          sx={{
            minWidth: 'auto',
            padding: '8px 12px',
            fontSize: '1.2rem',
            lineHeight: 1,
          }}
        >
          🛍️
        </Button>
        <Button
          variant="contained"
          onClick={handleOpenBonusChoresDialog}
          sx={{
            minWidth: 'auto',
            padding: '8px 12px',
            fontSize: '1.2rem',
            lineHeight: 1,
          }}
        >
          🥟
        </Button>
        <Button
          variant="contained"
          onClick={handleOpenAddTaskDialog}
          sx={{
            minWidth: 'auto',
            padding: '8px 12px',
            fontSize: '1.2rem',
            lineHeight: 1,
          }}
        >
          +
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
            <InputLabel>Time of Day</InputLabel>
            <Select
              name="timePeriod"
              value={newTask.timePeriod}
              label="Time of Day"
              onChange={handleNewTaskInputChange}
            >
              <MenuItem value="any-time">Any Time</MenuItem>
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
          
          {parseInt(newTask.assignedTo) === 0 && (
            <TextField
              name="clamValue"
              label="Clam Value"
              variant="outlined"
              size="small"
              fullWidth
              type="number"
              value={newTask.clamValue}
              onChange={handleNewTaskInputChange}
              sx={{ mb: 2 }}
              inputProps={{ min: 1 }}
            />
          )}
          
          {/* Day Selection */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Select Days *
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {dayNames.map((day, index) => (
                <Button
                  key={index}
                  variant={newTask.selectedDays.includes(index) ? "contained" : "outlined"}
                  size="small"
                  onClick={() => handleDayToggle(index)}
                  sx={{
                    minWidth: '45px',
                    fontSize: '0.75rem',
                    padding: '4px 8px',
                  }}
                >
                  {dayAbbreviations[index]}
                </Button>
              ))}
            </Box>
          </Box>
          
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Repeat Options</InputLabel>
            <Select
              name="repeatType"
              value={newTask.repeatType}
              label="Repeat Options"
              onChange={handleNewTaskInputChange}
            >
              <MenuItem value="no-repeat">No Repeat</MenuItem>
              <MenuItem value="weekly">Weekly (on selected days)</MenuItem>
              <MenuItem value="daily">Daily</MenuItem>
              <MenuItem value="until-completed">Repeat Until Completed</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAddTaskDialog}>Cancel</Button>
          <Button onClick={handleAddTask} variant="contained">Add Task</Button>
        </DialogActions>
      </Dialog>

      {/* Bonus Chores Dialog */}
      <Dialog open={openBonusChoresDialog} onClose={handleCloseBonusChoresDialog} key="bonus-chores-dialog">
        <DialogTitle>Grab a Bonus Chore</DialogTitle>
        <DialogContent>
          {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
          {bonusChores.length === 0 ? (
            <Typography>No bonus chores available at the moment.</Typography>
          ) : (
            <FormControl component="fieldset">
              <FormLabel component="legend">Available Bonus Chores</FormLabel>
              <RadioGroup
                aria-label="bonus-chores"
                name="bonus-chores-group"
                value={selectedBonusChore}
                onChange={handleSelectBonusChore}
              >
                {bonusChores.map((chore) => (
                  <FormControlLabel
                    key={chore.id}
                    value={chore.id}
                    control={<Radio />}
                    label={`${chore.title} (${chore.clam_value} 🥟)`}
                  />
                ))}
              </RadioGroup>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseBonusChoresDialog}>Cancel</Button>
          <Button onClick={handleConfirmGrabBonus} variant="contained" disabled={!selectedBonusChore || bonusChores.length === 0}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Prize List Dialog */}
      <Dialog open={openPrizeListDialog} onClose={handleClosePrizeListDialog} key="prize-list-dialog">
        <DialogTitle>Available Prizes</DialogTitle>
        <DialogContent>
          {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
          {prizes.length === 0 ? (
            <Typography>No prizes available at the moment.</Typography>
          ) : (
            <List>
              {prizes.map((prize) => (
                <ListItem key={prize.id}>
                  <ListItemText
                    primary={prize.name}
                    secondary={`${prize.clam_cost} 🥟`}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePrizeListDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default ChoreWidget;
