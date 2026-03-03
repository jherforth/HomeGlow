import React, { useState, useEffect } from 'react';
import {
  Typography,
  Button,
  Box,
  Avatar,
  Chip,
  IconButton,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Checkbox,
  FormGroup,
  FormLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Backdrop,
  CircularProgress
} from '@mui/material';
import { Edit, Save, Cancel, Add, Delete, Check, Undo } from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { shouldShowChoreToday, getTodayDateString, convertDaysToCrontab } from '../utils/choreHelpers.js';

const ChoreWidget = ({ transparentBackground }) => {
  const [users, setUsers] = useState([]);
  const [chores, setChores] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [history, setHistory] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [newChore, setNewChore] = useState({
    user_id: '',
    title: '',
    description: '',
    assigned_days_of_week: ['monday'],
    clam_value: 0,
    is_one_time: false
  });
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showPrizesModal, setShowPrizesModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showBonusChores, setShowBonusChores] = useState(() => {
    const saved = localStorage.getItem('showBonusChores');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [dailyClamReward, setDailyClamReward] = useState(2);

  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    localStorage.setItem('showBonusChores', JSON.stringify(showBonusChores));
  }, [showBonusChores]);

  useEffect(() => {
    const widgetSettings = JSON.parse(localStorage.getItem('widgetSettings') || '{}');
    const refreshInterval = widgetSettings.chore?.refreshInterval || 0;

    if (refreshInterval > 0) {
      console.log(`ChoreWidget: Auto-refresh enabled (${refreshInterval}ms)`);

      const intervalId = setInterval(() => {
        console.log('ChoreWidget: Auto-refreshing data...');
        fetchData();
      }, refreshInterval);

      return () => {
        console.log('ChoreWidget: Clearing auto-refresh interval');
        clearInterval(intervalId);
      };
    }
  }, []);

  const fetchData = async () => {
    try {
      await Promise.all([
        fetchUsers(),
        fetchChores(),
        fetchSchedules(),
        fetchHistory(),
        fetchPrizes(),
        fetchSettings()
      ]);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/settings`);
      if (response.data.daily_completion_clam_reward) {
        setDailyClamReward(parseInt(response.data.daily_completion_clam_reward, 10));
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/users`);
      setUsers(response.data.filter(user => user.id !== 0));
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchChores = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/chores`);
      setChores(response.data);
    } catch (error) {
      console.error('Error fetching chores:', error);
    }
  };

  const fetchSchedules = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/chore-schedules?usage=chart`);
      setSchedules(response.data);
    } catch (error) {
      console.error('Error fetching schedules:', error);
    }
  };

  const fetchHistory = async () => {
    try {
      const today = getTodayDateString();
      const response = await axios.get(`${API_BASE_URL}/api/chore-history?date=${today}`);
      setHistory(response.data);
    } catch (error) {
      console.error('Error fetching history:', error);
    }
  };

  const fetchPrizes = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/prizes`);
      setPrizes(response.data);
    } catch (error) {
      console.error('Error fetching prizes:', error);
    }
  };

  const toggleChoreCompletion = async (schedule, isCompleted) => {
    try {
      setIsLoading(true);
      const today = getTodayDateString();

      if (isCompleted) {
        await axios.post(`${API_BASE_URL}/api/chores/uncomplete`, {
          chore_schedule_id: schedule.id,
          user_id: schedule.user_id,
          date: today
        });
      } else {
        await axios.post(`${API_BASE_URL}/api/chores/complete`, {
          chore_schedule_id: schedule.id,
          user_id: schedule.user_id,
          date: today
        });
      }

      await fetchData();
    } catch (error) {
      console.error('Error toggling chore completion:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const assignBonusChore = async (scheduleId, userId) => {
    try {
      setIsLoading(true);

      const today = getTodayDateString();

      const userBonusSchedules = schedules.filter(s =>
        s.user_id === userId &&
        s.visible === 1 &&
        s.clam_value > 0
      );

      const hasUncompletedBonusChoreToday = userBonusSchedules.some(schedule => {
        const completedToday = history.some(h =>
          h.chore_schedule_id === schedule.id &&
          h.user_id === userId &&
          h.date === today
        );
        return !completedToday;
      });

      if (hasUncompletedBonusChoreToday) {
        alert('User already has an uncompleted bonus chore. Complete it first!');
        return;
      }

      await axios.patch(`${API_BASE_URL}/api/chore-schedules/${scheduleId}`, {
        user_id: userId,
        visible: 1
      });

      await fetchData();
    } catch (error) {
      console.error('Error assigning bonus chore:', error);
      alert(error.response?.data?.error || 'Failed to assign bonus chore');
    } finally {
      setIsLoading(false);
    }
  };

  const saveChore = async () => {
    try {
      setIsLoading(true);

      const choreResponse = await axios.post(`${API_BASE_URL}/api/chores`, {
        title: newChore.title,
        description: newChore.description,
        clam_value: newChore.clam_value
      });

      const choreId = choreResponse.data.id;
      const crontab = newChore.is_one_time ? null : convertDaysToCrontab(newChore.assigned_days_of_week);

      await axios.post(`${API_BASE_URL}/api/chore-schedules`, {
        chore_id: choreId,
        user_id: newChore.user_id || null,
        crontab: crontab,
        visible: 1
      });

      setNewChore({
        user_id: '',
        title: '',
        description: '',
        assigned_days_of_week: ['monday'],
        clam_value: 0,
        is_one_time: false
      });
      setShowAddDialog(false);
      await fetchData();
    } catch (error) {
      console.error('Error saving chore:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getUserChoresForToday = (userId) => {
    return schedules
      .filter(schedule => {
        if (schedule.user_id !== userId) return false;
        if (!schedule.visible) return false;
        return shouldShowChoreToday(schedule);
      })
      .map(schedule => {
        const today = getTodayDateString();
        const completed = history.some(h =>
          h.chore_schedule_id === schedule.id &&
          h.user_id === userId &&
          h.date === today
        );

        return {
          ...schedule,
          completed,
          id: schedule.id
        };
      });
  };

  const getBonusChores = () => {
    return schedules.filter(schedule => schedule.visible);
  };

  const getAvailableBonusChores = () => {
    return getBonusChores().filter(schedule => schedule.user_id === null || schedule.user_id === 0);
  };

  const renderUserAvatar = (user) => {
    const handleImageError = (e) => {
      console.log(`Profile picture failed to load for user ${user.username}:`, user.profile_picture);
      e.target.style.display = 'none';
      e.target.nextSibling.style.display = 'flex';
    };

    let imageUrl = null;
    if (user.profile_picture) {
      if (user.profile_picture.startsWith('data:')) {
        imageUrl = user.profile_picture;
      } else {
        imageUrl = `${API_BASE_URL}/Uploads/users/${user.profile_picture}`;
      }
    }

    return (
      <Box sx={{ position: 'relative', display: 'inline-block' }}>
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={user.username}
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '3px solid var(--accent)',
                display: 'block'
              }}
              onError={handleImageError}
            />
            <Avatar
              sx={{
                width: 60,
                height: 60,
                bgcolor: 'var(--accent)',
                border: '3px solid var(--accent)',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                display: 'none'
              }}
            >
              {user.username.charAt(0).toUpperCase()}
            </Avatar>
          </>
        ) : (
          <Avatar
            sx={{
              width: 60,
              height: 60,
              bgcolor: 'var(--accent)',
              border: '3px solid var(--accent)',
              fontSize: '1.5rem',
              fontWeight: 'bold'
            }}
          >
            {user.username.charAt(0).toUpperCase()}
          </Avatar>
        )}

        <Chip
          label={`${user.clam_total || 0} 🥟`}
          size="small"
          sx={{
            position: 'absolute',
            top: -8,
            right: -8,
            bgcolor: 'var(--accent)',
            color: 'white',
            fontSize: '0.7rem',
            height: 24,
            '& .MuiChip-label': {
              px: 1
            }
          }}
        />
      </Box>
    );
  };

  const renderChoreItem = (schedule) => {
    return (
      <Box
        key={schedule.id}
        sx={{
          p: 1.5,
          border: '1px solid var(--card-border)',
          borderRadius: 2,
          mb: 1,
          bgcolor: schedule.completed ? 'rgba(0, 255, 0, 0.1)' : 'transparent',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: schedule.completed ? 'normal' : 'bold', fontSize: '0.85rem' }}>
            {schedule.title}
            {schedule.clam_value > 0 && (
              <Chip
                label={`${schedule.clam_value} 🥟`}
                size="small"
                sx={{ ml: 1, bgcolor: 'var(--accent)', color: 'white' }}
              />
            )}
          </Typography>
          {schedule.description && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              {schedule.description}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton
            color={schedule.completed ? "secondary" : "primary"}
            onClick={() => toggleChoreCompletion(schedule, schedule.completed)}
            size="small"
            sx={{
              minWidth: 'auto',
              width: 32,
              height: 32,
              bgcolor: schedule.completed ? 'transparent' : 'var(--accent)',
              color: schedule.completed ? 'var(--accent)' : 'white',
              '&:hover': {
                bgcolor: schedule.completed ? 'rgba(var(--accent-rgb), 0.1)' : 'var(--accent)',
                filter: 'brightness(1.1)'
              }
            }}
          >
            {schedule.completed ? <Undo fontSize="small" /> : <Check fontSize="small" />}
          </IconButton>
        </Box>
      </Box>
    );
  };

  const handleDayToggle = (day) => {
    setNewChore(prev => ({
      ...prev,
      assigned_days_of_week: prev.assigned_days_of_week.includes(day)
        ? prev.assigned_days_of_week.filter(d => d !== day)
        : [...prev.assigned_days_of_week, day]
    }));
  };

  if (loading) {
    return (
      <Box sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        p: 2
      }}>
        <Typography variant="h6">Loading chores...</Typography>
      </Box>
    );
  }

  const availableBonusChores = getAvailableBonusChores();

  return (
    <>
      <Box sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        p: 2
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">🥟 Daily Chores</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              onClick={() => setShowBonusChores(!showBonusChores)}
              variant={showBonusChores ? "contained" : "outlined"}
              size="small"
              sx={{ minWidth: 'auto', px: 1 }}
              title={showBonusChores ? "Hide Bonus Chores" : "Show Bonus Chores"}
            >
              🥟
            </Button>
            <Button
              onClick={() => setShowPrizesModal(true)}
              variant="outlined"
              size="small"
              sx={{ minWidth: 'auto', px: 1 }}
            >
              🛍️
            </Button>
            <Button
              startIcon={<Add />}
              onClick={() => setShowAddDialog(true)}
              variant="contained"
              size="small"
            >
              Add Chore
            </Button>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 2 }}>
          <Box sx={{
            display: 'flex',
            gap: 2,
            pb: 2,
            justifyContent: 'space-evenly',
            alignItems: 'flex-start',
            width: '100%'
          }}>
            {users.filter(user => user.id !== 0).map(user => {
              const userChores = getUserChoresForToday(user.id);
              const completedChores = userChores.filter(c => c.completed && c.clam_value === 0).length;
              const totalRegularChores = userChores.filter(c => c.clam_value === 0).length;
              const allRegularChoresCompleted = totalRegularChores > 0 && completedChores === totalRegularChores;

              return (
                <Box
                  key={user.id}
                  sx={{
                    flex: '1 1 0',
                    minWidth: '180px',
                    maxWidth: '250px',
                    border: '2px solid var(--card-border)',
                    borderRadius: 2,
                    p: 2,
                    bgcolor: allRegularChoresCompleted ? 'rgba(0, 255, 0, 0.05)' : 'transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center'
                  }}
                >
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 2 }}>
                    {renderUserAvatar(user)}
                    <Typography variant="subtitle1" sx={{ mt: 1, fontSize: '0.9rem', fontWeight: 'bold' }}>
                      {user.username}
                    </Typography>
                    {allRegularChoresCompleted && (
                      <Chip
                        label={`All Done! +${dailyClamReward} 🥟`}
                        color="success"
                        size="small"
                        sx={{ mt: 1 }}
                      />
                    )}
                  </Box>

                  <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, width: '100%' }}>
                    {userChores.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
                        No chores for today
                      </Typography>
                    ) : (
                      userChores.map(schedule => renderChoreItem(schedule))
                    )}
                  </Box>
                </Box>
              );
            })}

            {showBonusChores && (
              <Box
                sx={{
                  flex: '1 1 0',
                  minWidth: '180px',
                  maxWidth: '250px',
                  border: '2px solid var(--accent)',
                  borderRadius: 2,
                  p: 2,
                  bgcolor: 'rgba(var(--accent-rgb), 0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center'
                }}
              >
                <Typography variant="subtitle1" sx={{ textAlign: 'center', mb: 2, color: 'var(--accent)', fontSize: '0.9rem', fontWeight: 'bold' }}>
                  🥟 Bonus Chores
                </Typography>

                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                  Available:
                </Typography>
                <Box sx={{ flex: 1, overflowY: 'auto', mb: 2, minHeight: 0, width: '100%' }}>
                  {availableBonusChores.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
                      No bonus chores available
                    </Typography>
                  ) : (
                    availableBonusChores.map(schedule => (
                      <Box
                        key={schedule.id}
                        sx={{
                          p: 1,
                          border: '1px solid var(--accent)',
                          borderRadius: 1,
                          mb: 1,
                          bgcolor: 'rgba(var(--accent-rgb), 0.1)'
                        }}
                      >
                        <Typography variant="subtitle2">
                          {schedule.title}
                          <Chip
                            label={`${schedule.clam_value} 🥟`}
                            size="small"
                            sx={{ ml: 1, bgcolor: 'var(--accent)', color: 'white' }}
                          />
                        </Typography>
                        {schedule.description && (
                          <Typography variant="caption" color="text.secondary">
                            {schedule.description}
                          </Typography>
                        )}
                        <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          {users.map(user => (
                            <Button
                              key={user.id}
                              size="small"
                              variant="outlined"
                              onClick={() => assignBonusChore(schedule.id, user.id)}
                              sx={{ fontSize: '0.7rem', minWidth: 'auto', px: 1 }}
                            >
                              {user.username}
                            </Button>
                          ))}
                        </Box>
                      </Box>
                    ))
                  )}
                </Box>
              </Box>
            )}
          </Box>
        </Box>

        <Dialog open={showPrizesModal} onClose={() => setShowPrizesModal(false)} maxWidth="sm" fullWidth>
          <DialogTitle>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              🛍️ Available Prizes
            </Typography>
          </DialogTitle>
          <DialogContent>
            {prizes.length === 0 ? (
              <Typography variant="body1" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                No prizes available. Ask an admin to add some prizes!
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                {prizes.map((prize) => (
                  <Box
                    key={prize.id}
                    sx={{
                      p: 2,
                      border: '1px solid var(--card-border)',
                      borderRadius: 2,
                      bgcolor: 'rgba(var(--accent-rgb), 0.05)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                        {prize.name}
                      </Typography>
                    </Box>
                    <Chip
                      label={`${prize.clam_cost} 🥟`}
                      sx={{
                        bgcolor: 'var(--accent)',
                        color: 'white',
                        fontWeight: 'bold',
                        fontSize: '0.9rem'
                      }}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowPrizesModal(false)} variant="contained">
              Close
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={showAddDialog} onClose={() => setShowAddDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Add New Chore</DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              label="Title"
              value={newChore.title}
              onChange={(e) => setNewChore({...newChore, title: e.target.value})}
              sx={{ mb: 2, mt: 1 }}
            />
            <TextField
              fullWidth
              label="Description"
              value={newChore.description}
              onChange={(e) => setNewChore({...newChore, description: e.target.value})}
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Assign to User</InputLabel>
              <Select
                value={newChore.user_id}
                onChange={(e) => setNewChore({...newChore, user_id: e.target.value})}
              >
                <MenuItem value={0}>Bonus Chore (Unassigned)</MenuItem>
                {users.map(user => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.username}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box sx={{ mb: 2 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={newChore.is_one_time}
                    onChange={(e) => setNewChore({
                      ...newChore,
                      is_one_time: e.target.checked,
                      assigned_days_of_week: e.target.checked ? [] : ['monday']
                    })}
                    color="primary"
                  />
                }
                label="One-time chore (no recurrence)"
              />
            </Box>

            {!newChore.is_one_time && (
              <Box sx={{ mb: 2 }}>
                <FormLabel component="legend" sx={{ mb: 1, display: 'block' }}>
                  Select Days (choose one or more):
                </FormLabel>
                <FormGroup row>
                  {daysOfWeek.map(day => (
                    <FormControlLabel
                      key={day}
                      control={
                        <Checkbox
                          checked={newChore.assigned_days_of_week.includes(day)}
                          onChange={() => handleDayToggle(day)}
                          color="primary"
                        />
                      }
                      label={day.charAt(0).toUpperCase() + day.slice(1)}
                    />
                  ))}
                </FormGroup>
              </Box>
            )}

            <TextField
              fullWidth
              type="number"
              label="🥟 Clam Value (0 for regular chore)"
              value={newChore.clam_value}
              onChange={(e) => setNewChore({...newChore, clam_value: parseInt(e.target.value) || 0})}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button
              onClick={saveChore}
              variant="contained"
              disabled={!newChore.is_one_time && newChore.assigned_days_of_week.length === 0}
            >
              Add Chore
            </Button>
          </DialogActions>
        </Dialog>
      </Box>

      <Backdrop
        sx={{
          color: '#fff',
          zIndex: (theme) => theme.zIndex.drawer + 1,
          backdropFilter: 'blur(10px)',
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
        }}
        open={isLoading}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            p: 4,
            borderRadius: 3,
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          }}
        >
          <Box
            sx={{
              position: 'relative',
              width: 80,
              height: 80,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {[0, 1, 2].map((index) => (
              <Box
                key={index}
                sx={{
                  position: 'absolute',
                  fontSize: '2rem',
                  animation: `clamBounce 1.5s ease-in-out ${index * 0.2}s infinite`,
                  '@keyframes clamBounce': {
                    '0%, 80%, 100%': {
                      transform: 'scale(0.8) translateY(0)',
                      opacity: 0.6,
                    },
                    '40%': {
                      transform: 'scale(1.2) translateY(-20px)',
                      opacity: 1,
                    },
                  },
                }}
              >
                🥟
              </Box>
            ))}
          </Box>

          <Typography
            variant="h6"
            sx={{
              color: 'white',
              fontWeight: 'bold',
              textAlign: 'center',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
            }}
          >
            Processing...
          </Typography>

          <CircularProgress
            size={40}
            thickness={2}
            sx={{
              color: 'rgba(255, 255, 255, 0.7)',
              '& .MuiCircularProgress-circle': {
                strokeLinecap: 'round',
              },
            }}
          />
        </Box>
      </Backdrop>
    </>
  );
};

export default ChoreWidget;
