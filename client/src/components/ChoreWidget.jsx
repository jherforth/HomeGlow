import React, { useState, useEffect } from 'react';
import {
  Typography,
  Button,
  Box,
  Avatar,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Backdrop,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  ListItemSecondaryAction
} from '@mui/material';
import { Check, Undo, EmojiEvents } from '@mui/icons-material';
import axios from 'axios';
import parseExpression from 'cron-parser';
import { API_BASE_URL } from '../utils/apiConfig.js';

const ChoreWidget = ({ transparentBackground }) => {
  const [users, setUsers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [chores, setChores] = useState([]);
  const [history, setHistory] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPrizesModal, setShowPrizesModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const widgetSettings = JSON.parse(localStorage.getItem('widgetSettings') || '{}');
    const refreshInterval = widgetSettings.chore?.refreshInterval || 0;

    if (refreshInterval > 0) {
      const intervalId = setInterval(() => {
        fetchData();
      }, refreshInterval);

      return () => clearInterval(intervalId);
    }
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchUsers(),
        fetchSchedules(),
        fetchChores(),
        fetchHistory(),
        fetchPrizes()
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
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

  const fetchSchedules = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/chore-schedules?visible=1`);
      setSchedules(response.data);
    } catch (error) {
      console.error('Error fetching schedules:', error);
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

  const fetchHistory = async () => {
    try {
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

  const shouldShowScheduleToday = (schedule) => {
    if (!schedule.crontab) {
      return true;
    }

    try {
      const now = new Date();
      const interval = parseExpression.parseExpression(schedule.crontab, {
        currentDate: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0),
        endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59),
        iterator: true
      });

      try {
        interval.next();
        return true;
      } catch {
        return false;
      }
    } catch (error) {
      console.error('Error parsing crontab:', schedule.crontab, error);
      return false;
    }
  };

  const isScheduleCompleted = (scheduleId) => {
    return history.some(h => h.chore_schedule_id === scheduleId);
  };

  const getSchedulesForUser = (userId) => {
    return schedules.filter(schedule => {
      if (schedule.user_id !== userId) return false;
      if (!shouldShowScheduleToday(schedule)) return false;
      return true;
    });
  };

  const getChoreForSchedule = (scheduleId) => {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return null;
    return chores.find(c => c.id === schedule.chore_id);
  };

  const handleCompleteChore = async (scheduleId, userId) => {
    setIsLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/api/chores/complete`, {
        chore_schedule_id: scheduleId,
        user_id: userId,
        date: today
      });
      await Promise.all([fetchSchedules(), fetchHistory(), fetchUsers()]);
    } catch (error) {
      console.error('Error completing chore:', error);
      alert('Error completing chore: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUncompleteChore = async (scheduleId, userId) => {
    setIsLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/api/chores/uncomplete`, {
        chore_schedule_id: scheduleId,
        user_id: userId,
        date: today
      });
      await Promise.all([fetchSchedules(), fetchHistory(), fetchUsers()]);
    } catch (error) {
      console.error('Error uncompleting chore:', error);
      alert('Error uncompleting chore: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClaimPrize = async (prizeId, userId) => {
    const user = users.find(u => u.id === userId);
    const prize = prizes.find(p => p.id === prizeId);

    if (!user || !prize) return;

    if (user.clam_total < prize.clam_cost) {
      alert('Not enough clams!');
      return;
    }

    if (!confirm(`Claim "${prize.name}" for ${prize.clam_cost} clams?`)) {
      return;
    }

    setIsLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/api/chore-history/reduce-clams`, {
        user_id: userId,
        amount: prize.clam_cost
      });
      await fetchUsers();
      alert(`Prize claimed! ${user.username} now has ${user.clam_total - prize.clam_cost} clams remaining.`);
    } catch (error) {
      console.error('Error claiming prize:', error);
      alert('Error claiming prize: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{
        p: 3,
        backgroundColor: transparentBackground ? 'transparent' : 'var(--widget-background)',
        borderRadius: '12px',
        textAlign: 'center'
      }}>
        <CircularProgress size={40} />
      </Box>
    );
  }

  return (
    <Box sx={{
      p: 3,
      backgroundColor: transparentBackground ? 'transparent' : 'var(--widget-background)',
      borderRadius: '12px',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'auto'
    }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold' }}>
        Chores
      </Typography>

      {users.map((user) => {
        const userSchedules = getSchedulesForUser(user.id);
        const regularChores = userSchedules.filter(s => {
          const chore = getChoreForSchedule(s.id);
          return chore && chore.clam_value === 0;
        });
        const bonusChores = userSchedules.filter(s => {
          const chore = getChoreForSchedule(s.id);
          return chore && chore.clam_value > 0;
        });

        const completedRegular = regularChores.filter(s => isScheduleCompleted(s.id)).length;
        const totalRegular = regularChores.length;
        const allRegularComplete = totalRegular > 0 && completedRegular === totalRegular;

        return (
          <Box key={user.id} sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Avatar
                src={user.profile_picture}
                alt={user.username}
                sx={{ width: 48, height: 48 }}
              />
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6">{user.username}</Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Chip
                    label={`${user.clam_total} 🥟`}
                    size="small"
                    color="primary"
                  />
                  <Chip
                    label={`${completedRegular}/${totalRegular} complete`}
                    size="small"
                    color={allRegularComplete ? 'success' : 'default'}
                  />
                  {allRegularComplete && totalRegular > 0 && (
                    <Chip
                      label="+2 🥟 Bonus!"
                      size="small"
                      color="success"
                      icon={<Check />}
                    />
                  )}
                </Box>
              </Box>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setShowPrizesModal(user.id)}
                startIcon={<EmojiEvents />}
              >
                Prizes
              </Button>
            </Box>

            {userSchedules.length === 0 ? (
              <Box sx={{ p: 2, textAlign: 'center', opacity: 0.6 }}>
                <Typography variant="body2">No chores for today</Typography>
              </Box>
            ) : (
              <List sx={{ width: '100%' }}>
                {userSchedules.map(schedule => {
                  const chore = getChoreForSchedule(schedule.id);
                  if (!chore) return null;

                  const isCompleted = isScheduleCompleted(schedule.id);
                  const isBonus = chore.clam_value > 0;

                  return (
                    <ListItem
                      key={schedule.id}
                      sx={{
                        border: '1px solid var(--card-border)',
                        borderRadius: 1,
                        mb: 1,
                        backgroundColor: isCompleted ? 'rgba(76, 175, 80, 0.1)' : 'transparent',
                        opacity: isCompleted ? 0.7 : 1
                      }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography
                              variant="body1"
                              sx={{
                                textDecoration: isCompleted ? 'line-through' : 'none',
                                fontWeight: isBonus ? 'bold' : 'normal'
                              }}
                            >
                              {chore.title}
                            </Typography>
                            {isBonus && (
                              <Chip
                                label={`${chore.clam_value} 🥟`}
                                size="small"
                                color="primary"
                              />
                            )}
                          </Box>
                        }
                        secondary={chore.description}
                      />
                      <ListItemSecondaryAction>
                        {isCompleted ? (
                          <IconButton
                            edge="end"
                            onClick={() => handleUncompleteChore(schedule.id, user.id)}
                            color="default"
                            disabled={isLoading}
                          >
                            <Undo />
                          </IconButton>
                        ) : (
                          <IconButton
                            edge="end"
                            onClick={() => handleCompleteChore(schedule.id, user.id)}
                            color="success"
                            disabled={isLoading}
                          >
                            <Check />
                          </IconButton>
                        )}
                      </ListItemSecondaryAction>
                    </ListItem>
                  );
                })}
              </List>
            )}
          </Box>
        );
      })}

      {users.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body2" color="text.secondary">
            No users found. Add users in the Admin Panel.
          </Typography>
        </Box>
      )}

      <Dialog
        open={showPrizesModal !== false}
        onClose={() => setShowPrizesModal(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Available Prizes</DialogTitle>
        <DialogContent>
          {showPrizesModal && (() => {
            const user = users.find(u => u.id === showPrizesModal);
            if (!user) return null;

            return (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {user.username} has {user.clam_total} 🥟
                </Typography>
                <List>
                  {prizes.map(prize => (
                    <ListItem
                      key={prize.id}
                      sx={{
                        border: '1px solid var(--card-border)',
                        borderRadius: 1,
                        mb: 1
                      }}
                    >
                      <ListItemText
                        primary={prize.name}
                        secondary={`Cost: ${prize.clam_cost} 🥟`}
                      />
                      <ListItemSecondaryAction>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => handleClaimPrize(prize.id, user.id)}
                          disabled={user.clam_total < prize.clam_cost || isLoading}
                        >
                          Claim
                        </Button>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
                {prizes.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                    No prizes available. Add prizes in the Admin Panel.
                  </Typography>
                )}
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPrizesModal(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Backdrop open={isLoading} sx={{ zIndex: 9999 }}>
        <CircularProgress />
      </Backdrop>
    </Box>
  );
};

export default ChoreWidget;
