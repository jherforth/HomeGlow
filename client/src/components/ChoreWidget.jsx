import React, { useState, useEffect } from 'react';
import { Card, Typography, Box, Avatar, Chip, List, ListItem, ListItemText, IconButton, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { Add, Edit, Delete, CheckCircle } from '@mui/icons-material';
import axios from 'axios';

const ChoreWidget = ({ transparentBackground }) => {
  const [users, setUsers] = useState([]);
  const [chores, setChores] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openAddChore, setOpenAddChore] = useState(false);
  const [openAddUser, setOpenAddUser] = useState(false);
  const [newChore, setNewChore] = useState({
    title: '',
    description: '',
    user_id: '',
    time_period: 'any-time',
    assigned_day_of_week: 'monday',
    repeat_type: 'weekly',
    clam_value: 0
  });
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    profile_picture: ''
  });

  const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const timePeriods = ['morning', 'afternoon', 'evening', 'any-time'];
  const repeatTypes = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'daily', label: 'Daily' },
    { value: 'until-completed', label: 'Until Completed' },
    { value: 'no-repeat', label: 'No Repeat' }
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersRes, choresRes, prizesRes] = await Promise.all([
        axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users`),
        axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores`),
        axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/prizes`)
      ]);
      
      setUsers(usersRes.data);
      setChores(choresRes.data);
      setPrizes(prizesRes.data);
      setError(null);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load chores data');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteChore = async (choreId) => {
    try {
      await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores/${choreId}`, {
        completed: true
      });
      fetchData(); // Refresh data to show updated clam totals
    } catch (error) {
      console.error('Error completing chore:', error);
    }
  };

  const handleAddChore = async () => {
    try {
      await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores`, {
        ...newChore,
        completed: false
      });
      setOpenAddChore(false);
      setNewChore({
        title: '',
        description: '',
        user_id: '',
        time_period: 'any-time',
        assigned_day_of_week: 'monday',
        repeat_type: 'weekly',
        clam_value: 0
      });
      fetchData();
    } catch (error) {
      console.error('Error adding chore:', error);
    }
  };

  const handleAddUser = async () => {
    try {
      await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users`, newUser);
      setOpenAddUser(false);
      setNewUser({
        username: '',
        email: '',
        profile_picture: ''
      });
      fetchData();
    } catch (error) {
      console.error('Error adding user:', error);
    }
  };

  const handleAssignBonusChore = async (choreId, userId) => {
    try {
      await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores/${choreId}/assign`, {
        user_id: userId
      });
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
      (chore.assigned_day_of_week === currentDay || chore.repeat_type === 'until-completed')
    );
  };

  const getBonusChores = () => {
    return chores.filter(chore => chore.user_id === 0 && chore.clam_value > 0);
  };

  const getAssignedBonusChores = () => {
    return chores.filter(chore => chore.user_id !== 0 && chore.clam_value > 0 && !chore.completed);
  };

  if (loading) {
    return (
      <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`} sx={{ height: '500px' }}>
        <Typography variant="h6">Loading chores...</Typography>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`} sx={{ height: '500px' }}>
        <Typography variant="h6" color="error">{error}</Typography>
      </Card>
    );
  }

  const regularUsers = users.filter(user => user.id !== 0);
  const bonusChores = getBonusChores();
  const assignedBonusChores = getAssignedBonusChores();

  return (
    <>
      <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`} sx={{ height: '500px', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            ✅ Daily Chores - {getCurrentDay().charAt(0).toUpperCase() + getCurrentDay().slice(1)}
          </Typography>
          <Box>
            <IconButton onClick={() => setOpenAddUser(true)} size="small">
              <Add />
            </IconButton>
            <IconButton onClick={() => setOpenAddChore(true)} size="small">
              <Edit />
            </IconButton>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', height: '100%', gap: 2, overflow: 'hidden' }}>
          {/* User Columns */}
          {regularUsers.map((user) => {
            const userChores = getUserChores(user.id);
            const completedChores = userChores.filter(chore => chore.completed).length;
            const totalChores = userChores.length;
            
            return (
              <Box key={user.id} sx={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column' }}>
                {/* User Header */}
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 2, position: 'relative' }}>
                  <Box sx={{ position: 'relative' }}>
                    {user.profile_picture ? (
                      <Avatar
                        src={`${import.meta.env.VITE_REACT_APP_API_URL}/Uploads/users/${user.profile_picture}`}
                        sx={{ 
                          width: 60, 
                          height: 60, 
                          border: '3px solid var(--accent)',
                          mb: 1
                        }}
                      />
                    ) : (
                      <Avatar
                        sx={{ 
                          width: 60, 
                          height: 60, 
                          bgcolor: 'var(--accent)',
                          border: '3px solid var(--accent)',
                          mb: 1,
                          fontSize: '1.5rem',
                          fontWeight: 'bold'
                        }}
                      >
                        {user.username.charAt(0).toUpperCase()}
                      </Avatar>
                    )}
                    
                    {/* Clam Badge */}
                    <Chip
                      label={`🐚 ${user.clam_total || 0}`}
                      size="small"
                      sx={{
                        position: 'absolute',
                        top: -5,
                        right: -10,
                        bgcolor: 'var(--accent)',
                        color: 'white',
                        fontSize: '0.7rem',
                        height: '20px'
                      }}
                    />
                  </Box>
                  
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', textAlign: 'center' }}>
                    {user.username}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'var(--accent)' }}>
                    {completedChores}/{totalChores} completed
                  </Typography>
                </Box>

                {/* User's Chores */}
                <Box sx={{ flex: 1, overflow: 'auto' }}>
                  {userChores.length === 0 ? (
                    <Typography variant="body2" sx={{ textAlign: 'center', color: 'text.secondary', fontStyle: 'italic' }}>
                      No chores today
                    </Typography>
                  ) : (
                    <List sx={{ p: 0 }}>
                      {userChores.map((chore) => (
                        <ListItem 
                          key={chore.id} 
                          sx={{ 
                            px: 1, 
                            py: 0.5,
                            bgcolor: chore.completed ? 'rgba(76, 175, 80, 0.1)' : 'transparent',
                            borderRadius: 1,
                            mb: 0.5,
                            border: chore.clam_value > 0 ? '2px solid gold' : 'none'
                          }}
                        >
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    textDecoration: chore.completed ? 'line-through' : 'none',
                                    fontSize: '0.85rem'
                                  }}
                                >
                                  {chore.title}
                                </Typography>
                                {chore.clam_value > 0 && (
                                  <Chip 
                                    label={`🐚 ${chore.clam_value}`} 
                                    size="small" 
                                    sx={{ 
                                      bgcolor: 'gold', 
                                      color: 'black',
                                      fontSize: '0.6rem',
                                      height: '16px'
                                    }} 
                                  />
                                )}
                              </Box>
                            }
                            secondary={
                              <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                                {chore.time_period} • {chore.repeat_type}
                              </Typography>
                            }
                          />
                          {!chore.completed && (
                            <IconButton 
                              size="small" 
                              onClick={() => handleCompleteChore(chore.id)}
                              sx={{ color: 'var(--accent)' }}
                            >
                              <CheckCircle fontSize="small" />
                            </IconButton>
                          )}
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Box>

                {/* Bonus Chore Assignment */}
                {bonusChores.length > 0 && (
                  <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid var(--card-border)' }}>
                    <Typography variant="caption" sx={{ display: 'block', mb: 1, textAlign: 'center' }}>
                      Available Bonus Chores:
                    </Typography>
                    {bonusChores.slice(0, 2).map((chore) => (
                      <Button
                        key={chore.id}
                        size="small"
                        variant="outlined"
                        onClick={() => handleAssignBonusChore(chore.id, user.id)}
                        sx={{ 
                          width: '100%', 
                          mb: 0.5,
                          fontSize: '0.7rem',
                          py: 0.5,
                          borderColor: 'gold',
                          color: 'gold'
                        }}
                      >
                        {chore.title} (🐚 {chore.clam_value})
                      </Button>
                    ))}
                  </Box>
                )}
              </Box>
            );
          })}

          {/* Bonus Chores Column */}
          {(bonusChores.length > 0 || assignedBonusChores.length > 0) && (
            <Box sx={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 2 }}>
                <Avatar
                  sx={{ 
                    width: 60, 
                    height: 60, 
                    bgcolor: 'gold',
                    mb: 1,
                    fontSize: '1.5rem'
                  }}
                >
                  🎁
                </Avatar>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', textAlign: 'center' }}>
                  Bonus Chores
                </Typography>
              </Box>

              <Box sx={{ flex: 1, overflow: 'auto' }}>
                {bonusChores.length === 0 && assignedBonusChores.length === 0 ? (
                  <Typography variant="body2" sx={{ textAlign: 'center', color: 'text.secondary', fontStyle: 'italic' }}>
                    No bonus chores available
                  </Typography>
                ) : (
                  <List sx={{ p: 0 }}>
                    {bonusChores.map((chore) => (
                      <ListItem 
                        key={chore.id} 
                        sx={{ 
                          px: 1, 
                          py: 0.5,
                          bgcolor: 'rgba(255, 215, 0, 0.1)',
                          borderRadius: 1,
                          mb: 0.5,
                          border: '2px solid gold'
                        }}
                      >
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                                {chore.title}
                              </Typography>
                              <Chip 
                                label={`🐚 ${chore.clam_value}`} 
                                size="small" 
                                sx={{ 
                                  bgcolor: 'gold', 
                                  color: 'black',
                                  fontSize: '0.6rem',
                                  height: '16px'
                                }} 
                              />
                            </Box>
                          }
                          secondary={
                            <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                              Available for assignment
                            </Typography>
                          }
                        />
                      </ListItem>
                    ))}
                    
                    {assignedBonusChores.map((chore) => {
                      const assignedUser = users.find(u => u.id === chore.user_id);
                      return (
                        <ListItem 
                          key={chore.id} 
                          sx={{ 
                            px: 1, 
                            py: 0.5,
                            bgcolor: 'rgba(255, 165, 0, 0.1)',
                            borderRadius: 1,
                            mb: 0.5,
                            border: '2px solid orange'
                          }}
                        >
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                                  {chore.title}
                                </Typography>
                                <Chip 
                                  label={`🐚 ${chore.clam_value}`} 
                                  size="small" 
                                  sx={{ 
                                    bgcolor: 'orange', 
                                    color: 'white',
                                    fontSize: '0.6rem',
                                    height: '16px'
                                  }} 
                                />
                              </Box>
                            }
                            secondary={
                              <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                                Assigned to {assignedUser?.username}
                              </Typography>
                            }
                          />
                        </ListItem>
                      );
                    })}
                  </List>
                )}
              </Box>
            </Box>
          )}
        </Box>
      </Card>

      {/* Add Chore Dialog */}
      <Dialog open={openAddChore} onClose={() => setOpenAddChore(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Chore</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Chore Title"
            value={newChore.title}
            onChange={(e) => setNewChore({...newChore, title: e.target.value})}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Description"
            value={newChore.description}
            onChange={(e) => setNewChore({...newChore, description: e.target.value})}
            margin="normal"
            multiline
            rows={2}
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>Assign to User</InputLabel>
            <Select
              value={newChore.user_id}
              onChange={(e) => setNewChore({...newChore, user_id: e.target.value})}
            >
              <MenuItem value={0}>Bonus Chores (Unassigned)</MenuItem>
              {regularUsers.map((user) => (
                <MenuItem key={user.id} value={user.id}>{user.username}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth margin="normal">
            <InputLabel>Day of Week</InputLabel>
            <Select
              value={newChore.assigned_day_of_week}
              onChange={(e) => setNewChore({...newChore, assigned_day_of_week: e.target.value})}
            >
              {daysOfWeek.map((day) => (
                <MenuItem key={day} value={day}>{day.charAt(0).toUpperCase() + day.slice(1)}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth margin="normal">
            <InputLabel>Time Period</InputLabel>
            <Select
              value={newChore.time_period}
              onChange={(e) => setNewChore({...newChore, time_period: e.target.value})}
            >
              {timePeriods.map((period) => (
                <MenuItem key={period} value={period}>{period.charAt(0).toUpperCase() + period.slice(1)}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth margin="normal">
            <InputLabel>Repeat Type</InputLabel>
            <Select
              value={newChore.repeat_type}
              onChange={(e) => setNewChore({...newChore, repeat_type: e.target.value})}
            >
              {repeatTypes.map((type) => (
                <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Clam Value (0 for regular chores)"
            type="number"
            value={newChore.clam_value}
            onChange={(e) => setNewChore({...newChore, clam_value: parseInt(e.target.value) || 0})}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAddChore(false)}>Cancel</Button>
          <Button onClick={handleAddChore} variant="contained">Add Chore</Button>
        </DialogActions>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={openAddUser} onClose={() => setOpenAddUser(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New User</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Username"
            value={newUser.username}
            onChange={(e) => setNewUser({...newUser, username: e.target.value})}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Email"
            type="email"
            value={newUser.email}
            onChange={(e) => setNewUser({...newUser, email: e.target.value})}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Profile Picture Filename (optional)"
            value={newUser.profile_picture}
            onChange={(e) => setNewUser({...newUser, profile_picture: e.target.value})}
            margin="normal"
            helperText="Enter the filename of an uploaded profile picture"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAddUser(false)}>Cancel</Button>
          <Button onClick={handleAddUser} variant="contained">Add User</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ChoreWidget;