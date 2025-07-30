import React, { useState, useEffect } from 'react';
import { Card, Typography, Box, Avatar, Chip, List, ListItem, ListItemText, IconButton, Button } from '@mui/material';
import { CheckCircle, RadioButtonUnchecked, Add } from '@mui/icons-material';
import axios from 'axios';

const ChoreWidget = ({ transparentBackground }) => {
  const [users, setUsers] = useState([]);
  const [chores, setChores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersResponse, choresResponse] = await Promise.all([
        axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users`),
        axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores`)
      ]);
      
      setUsers(usersResponse.data);
      setChores(choresResponse.data);
      setError(null);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load chores data');
    } finally {
      setLoading(false);
    }
  };

  const toggleChoreCompletion = async (choreId, currentStatus) => {
    try {
      await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores/${choreId}`, {
        completed: !currentStatus
      });
      
      // Update local state
      setChores(chores.map(chore => 
        chore.id === choreId ? { ...chore, completed: !currentStatus } : chore
      ));
      
      // Refresh users data to update clam totals
      const usersResponse = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users`);
      setUsers(usersResponse.data);
    } catch (error) {
      console.error('Error updating chore:', error);
    }
  };

  const assignBonusChore = async (choreId, userId) => {
    try {
      await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores/${choreId}/assign`, {
        user_id: userId
      });
      
      // Refresh data
      fetchData();
    } catch (error) {
      console.error('Error assigning bonus chore:', error);
      alert(error.response?.data?.error || 'Failed to assign bonus chore');
    }
  };

  const getCurrentDay = () => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[new Date().getDay()];
  };

  const getUserChores = (userId) => {
    const currentDay = getCurrentDay();
    return chores.filter(chore => 
      chore.user_id === userId && 
      (chore.assigned_day_of_week === currentDay || chore.repeat_type === 'daily')
    );
  };

  const getBonusChores = () => {
    return chores.filter(chore => chore.user_id === 0 && chore.clam_value > 0);
  };

  const getAssignedBonusChores = (userId) => {
    return chores.filter(chore => chore.user_id === userId && chore.clam_value > 0);
  };

  if (loading) {
    return (
      <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`} sx={{ height: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography>Loading chores...</Typography>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`} sx={{ height: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="error">{error}</Typography>
      </Card>
    );
  }

  // Filter out the bonus user (id: 0) from display
  const displayUsers = users.filter(user => user.id !== 0);
  const bonusChores = getBonusChores();

  return (
    <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`} sx={{ height: '500px', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
        ✅ Chores
      </Typography>
      
      <Box sx={{ display: 'flex', height: '100%', gap: 2 }}>
        {/* User Columns */}
        {displayUsers.map((user) => {
          const userChores = getUserChores(user.id);
          const userBonusChores = getAssignedBonusChores(user.id);
          const allUserChores = [...userChores, ...userBonusChores];
          const completedChores = allUserChores.filter(chore => chore.completed).length;
          const totalChores = allUserChores.length;
          
          return (
            <Box key={user.id} sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {/* User Header */}
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 2 }}>
                <Box sx={{ position: 'relative', mb: 1 }}>
                  <Avatar
                    src={user.profile_picture ? `${import.meta.env.VITE_REACT_APP_API_URL}/Uploads/users/${user.profile_picture}` : undefined}
                    sx={{ width: 60, height: 60, fontSize: '1.5rem' }}
                  >
                    {user.username.charAt(0).toUpperCase()}
                  </Avatar>
                  {user.clam_total > 0 && (
                    <Chip
                      label={`🐚 ${user.clam_total}`}
                      size="small"
                      sx={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        backgroundColor: 'var(--accent)',
                        color: 'white',
                        fontSize: '0.7rem',
                        height: '20px',
                      }}
                    />
                  )}
                </Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', textAlign: 'center' }}>
                  {user.username}
                </Typography>
                {totalChores > 0 ? (
                  <Typography variant="caption" sx={{ color: completedChores === totalChores ? 'green' : 'var(--accent)' }}>
                    {completedChores === totalChores ? 'All done! 🎉' : `${completedChores}/${totalChores} tasks`}
                  </Typography>
                ) : (
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                    No tasks today
                  </Typography>
                )}
              </Box>

              {/* User's Chores List */}
              <Box sx={{ flex: 1, overflow: 'hidden' }}>
                {allUserChores.length > 0 ? (
                  <List sx={{ p: 0, overflow: 'auto', height: '100%' }}>
                    {allUserChores.map((chore) => (
                      <ListItem 
                        key={chore.id} 
                        sx={{ 
                          px: 0, 
                          py: 0.5,
                          borderBottom: '1px solid var(--card-border)',
                          '&:last-child': { borderBottom: 'none' }
                        }}
                      >
                        <IconButton
                          size="small"
                          onClick={() => toggleChoreCompletion(chore.id, chore.completed)}
                          sx={{ mr: 1, color: chore.completed ? 'green' : 'var(--accent)' }}
                        >
                          {chore.completed ? <CheckCircle /> : <RadioButtonUnchecked />}
                        </IconButton>
                        <ListItemText
                          primary={
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                fontSize: '0.8rem',
                                textDecoration: chore.completed ? 'line-through' : 'none',
                                opacity: chore.completed ? 0.6 : 1,
                                fontWeight: chore.clam_value > 0 ? 'bold' : 'normal'
                              }}
                            >
                              {chore.title}
                              {chore.clam_value > 0 && (
                                <Chip
                                  label={`🐚 ${chore.clam_value}`}
                                  size="small"
                                  sx={{
                                    ml: 1,
                                    height: '16px',
                                    fontSize: '0.6rem',
                                    backgroundColor: 'gold',
                                    color: 'black',
                                  }}
                                />
                              )}
                            </Typography>
                          }
                          secondary={
                            chore.time_period && chore.time_period !== 'any-time' && (
                              <Typography variant="caption" sx={{ fontSize: '0.7rem', opacity: 0.7 }}>
                                {chore.time_period}
                              </Typography>
                            )
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', textAlign: 'center' }}>
                      No tasks today
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Grab Bonus Button */}
              {bonusChores.length > 0 && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Add />}
                  onClick={() => {
                    const availableBonus = bonusChores[0];
                    if (availableBonus) {
                      assignBonusChore(availableBonus.id, user.id);
                    }
                  }}
                  sx={{
                    mt: 1,
                    fontSize: '0.7rem',
                    borderColor: 'gold',
                    color: 'gold',
                    '&:hover': {
                      borderColor: 'gold',
                      backgroundColor: 'rgba(255, 215, 0, 0.1)',
                    },
                  }}
                >
                  GRAB BONUS
                </Button>
              )}
            </Box>
          );
        })}

        {/* Bonus Chores Column (if any available) */}
        {bonusChores.length > 0 && (
          <Box sx={{ flex: 0.8, display: 'flex', flexDirection: 'column', minHeight: 0, borderLeft: '2px solid gold', pl: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 2 }}>
              <Typography variant="h4" sx={{ mb: 1 }}>🎁</Typography>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'gold', textAlign: 'center' }}>
                Bonus Chores
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center' }}>
                Extra clams available!
              </Typography>
            </Box>

            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              <List sx={{ p: 0, overflow: 'auto', height: '100%' }}>
                {bonusChores.map((chore) => (
                  <ListItem 
                    key={chore.id} 
                    sx={{ 
                      px: 0, 
                      py: 1,
                      borderBottom: '1px solid gold',
                      '&:last-child': { borderBottom: 'none' }
                    }}
                  >
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 'bold' }}>
                          {chore.title}
                        </Typography>
                      }
                      secondary={
                        <Chip
                          label={`🐚 ${chore.clam_value} clams`}
                          size="small"
                          sx={{
                            mt: 0.5,
                            height: '18px',
                            fontSize: '0.7rem',
                            backgroundColor: 'gold',
                            color: 'black',
                          }}
                        />
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          </Box>
        )}
      </Box>
    </Card>
  );
};

export default ChoreWidget;