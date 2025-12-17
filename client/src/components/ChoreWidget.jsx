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

const ChoreWidget = ({ transparentBackground }) => {
  const [users, setUsers] = useState([]);
  const [chores, setChores] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [editingChore, setEditingChore] = useState(null);
  const [newChore, setNewChore] = useState({
    user_id: '',
    title: '',
    description: '',
    time_period: 'any-time',
    assigned_days_of_week: ['monday'], // Changed to array
    repeat_type: 'weekly',
    clam_value: 0
  });
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showPrizesModal, setShowPrizesModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showBonusChores, setShowBonusChores] = useState(() => {
    const saved = localStorage.getItem('showBonusChores');
    return saved !== null ? JSON.parse(saved) : true; // Default to true (show bonus chores)
  });
  const [isLoading, setIsLoading] = useState(false);

  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const timePeriods = ['morning', 'afternoon', 'evening', 'any-time'];
  const repeatTypes = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'daily', label: 'Daily' },
    { value: 'until-completed', label: 'Until Completed' },
    { value: 'no-repeat', label: 'No Repeat' }
  ];

  useEffect(() => {
    fetchUsers();
    fetchChores();
    fetchPrizes();
  }, []);

  // Save showBonusChores preference to localStorage
  useEffect(() => {
    localStorage.setItem('showBonusChores', JSON.stringify(showBonusChores));
  }, [showBonusChores]);

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/users`);
      setUsers(response.data.filter(user => user.id !== 0)); // Exclude bonus user
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchChores = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores`);
      setChores(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching chores:', error);
      setLoading(false);
    }
  };

  const fetchPrizes = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/prizes`);
      setPrizes(response.data);
    } catch (error) {
      console.error('Error fetching prizes:', error);
    }
  };
  const toggleChoreCompletion = async (choreId, currentStatus) => {
    try {
      setIsLoading(true);
      await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores/${choreId}`, {
        completed: !currentStatus
      });
      fetchChores();
      fetchUsers(); // Refresh to update clam totals
    } catch (error) {
      console.error('Error updating chore:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const assignBonusChore = async (choreId, userId) => {
    try {
      setIsLoading(true);
      await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores/${choreId}/assign`, {
        user_id: userId
      });
      fetchChores();
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
      if (editingChore) {
        // Update existing chore
        await axios.patch(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores/${editingChore.id}`, editingChore);
      } else {
        // Add new chores (one for each selected day)
        for (const day of newChore.assigned_days_of_week) {
          const choreForDay = {
            ...newChore,
            assigned_day_of_week: day
          };
          await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/chores`, choreForDay);
        }
        setNewChore({
          user_id: '',
          title: '',
          description: '',
          time_period: 'any-time',
          assigned_days_of_week: ['monday'],
          repeat_type: 'weekly',
          clam_value: 0
        });
        setShowAddDialog(false);
      }
      setEditingChore(null);
      fetchChores();
    } catch (error) {
      console.error('Error saving chore:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getCurrentDay = () => {
    return daysOfWeek[new Date().getDay()];
  };

  const getUserChores = (userId, dayOfWeek = null) => {
    return chores.filter(chore => 
      chore.user_id === userId && 
      (dayOfWeek ? chore.assigned_day_of_week === dayOfWeek : true)
    );
  };

  const getBonusChores = () => {
    return chores.filter(chore => chore.clam_value > 0);
  };

  const getAvailableBonusChores = () => {
    return getBonusChores().filter(chore => chore.user_id === 0);
  };

  const getAssignedBonusChores = () => {
    return getBonusChores().filter(chore => chore.user_id !== 0);
  };

  const renderUserAvatar = (user) => {
    const handleImageError = (e) => {
      console.log(`Profile picture failed to load for user ${user.username}:`, user.profile_picture);
      e.target.style.display = 'none';
      e.target.nextSibling.style.display = 'flex';
    };

    // Handle both base64 data URLs and file paths
    let imageUrl = null;
    if (user.profile_picture) {
      if (user.profile_picture.startsWith('data:')) {
        // It's a base64 data URL, use it directly
        imageUrl = user.profile_picture;
      } else {
        // It's a filename, construct the URL
        imageUrl = `${import.meta.env.VITE_REACT_APP_API_URL}/Uploads/users/${user.profile_picture}`;
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
        
        {/* Clam Badge */}
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

  const renderChoreItem = (chore, isEditing = false) => {
    // Only allow editing in admin context (this function is now only used for display)
    if (false) { // Disable editing in user view
      return (
        <Box key={chore.id} sx={{ p: 2, border: '1px solid var(--accent)', borderRadius: 2, mb: 1 }}>
          <TextField
            fullWidth
            label="Title"
            value={editingChore.title}
            onChange={(e) => setEditingChore({...editingChore, title: e.target.value})}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Description"
            value={editingChore.description}
            onChange={(e) => setEditingChore({...editingChore, description: e.target.value})}
            sx={{ mb: 2 }}
          />
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <FormControl sx={{ minWidth: 120 }}>
              <InputLabel>Time Period</InputLabel>
              <Select
                value={editingChore.time_period}
                onChange={(e) => setEditingChore({...editingChore, time_period: e.target.value})}
              >
                {timePeriods.map(period => (
                  <MenuItem key={period} value={period}>
                    {period.charAt(0).toUpperCase() + period.slice(1).replace('-', ' ')}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl sx={{ minWidth: 120 }}>
              <InputLabel>Day</InputLabel>
              <Select
                value={editingChore.assigned_day_of_week}
                onChange={(e) => setEditingChore({...editingChore, assigned_day_of_week: e.target.value})}
              >
                {daysOfWeek.map(day => (
                  <MenuItem key={day} value={day}>
                    {day.charAt(0).toUpperCase() + day.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl sx={{ minWidth: 120 }}>
              <InputLabel>Repeat</InputLabel>
              <Select
                value={editingChore.repeat_type}
                onChange={(e) => setEditingChore({...editingChore, repeat_type: e.target.value})}
              >
                {repeatTypes.map(type => (
                  <MenuItem key={type.value} value={type.value}>
                    {type.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <TextField
            type="number"
            label="🥟 Clam Value (0 for regular chore)"
            value={editingChore.clam_value}
            onChange={(e) => setEditingChore({...editingChore, clam_value: parseInt(e.target.value) || 0})}
            sx={{ mb: 2 }}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button startIcon={<Save />} onClick={saveChore} variant="contained">
              Save
            </Button>
            <Button startIcon={<Cancel />} onClick={() => setEditingChore(null)}>
              Cancel
            </Button>
          </Box>
        </Box>
      );
    }

    return (
      <Box
        key={chore.id}
        sx={{
          p: 1.5, // Reduced padding
          border: '1px solid var(--card-border)',
          borderRadius: 2,
          mb: 1,
          bgcolor: chore.completed ? 'rgba(0, 255, 0, 0.1)' : 'transparent',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: chore.completed ? 'normal' : 'bold', fontSize: '0.85rem' }}>
            {chore.title}
            {chore.clam_value > 0 && (
              <Chip
                label={`${chore.clam_value} 🥟`}
                size="small"
                sx={{ ml: 1, bgcolor: 'var(--accent)', color: 'white' }}
              />
            )}
          </Typography>
          {chore.description && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              {chore.description}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
            {chore.time_period.replace('-', ' ')} • {repeatTypes.find(t => t.value === chore.repeat_type)?.label}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton
            color={chore.completed ? "secondary" : "primary"}
            onClick={() => toggleChoreCompletion(chore.id, chore.completed)}
            size="small"
            sx={{ 
              minWidth: 'auto',
              width: 32,
              height: 32,
              bgcolor: chore.completed ? 'transparent' : 'var(--accent)',
              color: chore.completed ? 'var(--accent)' : 'white',
              '&:hover': {
                bgcolor: chore.completed ? 'rgba(var(--accent-rgb), 0.1)' : 'var(--accent)',
                filter: 'brightness(1.1)'
              }
            }}
          >
            {chore.completed ? <Undo fontSize="small" /> : <Check fontSize="small" />}
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

  const currentDay = getCurrentDay();
  const availableBonusChores = getAvailableBonusChores();
  const assignedBonusChores = getAssignedBonusChores();

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
        {/* User Columns - Regular users first */}
        {users.filter(user => user.id !== 0).map(user => {
          const userChores = getUserChores(user.id, currentDay);
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
                    label="All Done! +2 🥟"
                    color="success"
                    size="small"
                    sx={{ mt: 1 }}
                  />
                )}
              </Box>

              <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {userChores.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
                    No chores for today
                  </Typography>
                ) : (
                  userChores.map(chore => renderChoreItem(chore, false))
                )}
              </Box>
            </Box>
          );
        })}

        {/* Bonus Chores Column */}
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

            {/* Available Bonus Chores */}
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
              Available:
            </Typography>
            <Box sx={{ flex: 1, overflowY: 'auto', mb: 2, minHeight: 0 }}>
              {availableBonusChores.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
                  No bonus chores available
                </Typography>
              ) : (
                availableBonusChores.map(chore => (
                  <Box
                    key={chore.id}
                    sx={{
                      p: 1,
                      border: '1px solid var(--accent)',
                      borderRadius: 1,
                      mb: 1,
                      bgcolor: 'rgba(var(--accent-rgb), 0.1)'
                    }}
                  >
                    <Typography variant="subtitle2">
                      {chore.title}
                      <Chip
                        label={`${chore.clam_value} 🥟`}
                        size="small"
                        sx={{ ml: 1, bgcolor: 'var(--accent)', color: 'white' }}
                      />
                    </Typography>
                    {chore.description && (
                      <Typography variant="caption" color="text.secondary">
                        {chore.description}
                      </Typography>
                    )}
                    <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {users.map(user => (
                        <Button
                          key={user.id}
                          size="small"
                          variant="outlined"
                          onClick={() => assignBonusChore(chore.id, user.id)}
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

            {/* Assigned Bonus Chores REMOVED
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
              Assigned:
            </Typography>
            <Box sx={{ maxHeight: 150, overflowY: 'auto' }}>
              {assignedBonusChores.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
                  No assigned bonus chores
                </Typography>
              ) : (
                assignedBonusChores.map(chore => {
                  const assignedUser = users.find(u => u.id === chore.user_id);
                  return (
                    <Box
                      key={chore.id}
                      sx={{
                        p: 1,
                        border: '1px solid var(--card-border)',
                        borderRadius: 1,
                        mb: 1,
                        bgcolor: chore.completed ? 'rgba(0, 255, 0, 0.1)' : 'transparent'
                      }}
                    >
                      <Typography variant="subtitle2">
                        {chore.title}
                        <Chip
                          label={`${chore.clam_value} 🥟`}
                          size="small"
                          sx={{ ml: 1, bgcolor: 'var(--accent)', color: 'white' }}
                        />
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Assigned to: {assignedUser?.username}
                      </Typography>
                      <Box sx={{ mt: 1 }}>
                        <IconButton
                          size="small"
                          color={chore.completed ? "secondary" : "primary"}
                          onClick={() => toggleChoreCompletion(chore.id, chore.completed)}
                          sx={{ 
                            minWidth: 'auto',
                            width: 32,
                            height: 32,
                            bgcolor: chore.completed ? 'transparent' : 'var(--accent)',
                            color: chore.completed ? 'var(--accent)' : 'white',
                            '&:hover': {
                              bgcolor: chore.completed ? 'rgba(var(--accent-rgb), 0.1)' : 'var(--accent)',
                              filter: 'brightness(1.1)'
                            }
                          }}
                        >
                          {chore.completed ? <Undo fontSize="small" /> : <Check fontSize="small" />}
                        </IconButton>
                      </Box>
                    </Box> 
                  );
                })
              )}
            </Box> */}
          </Box>
        )}
      </Box>
      </Box>

      {/* Prizes Modal */}
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
      {/* Add Chore Dialog */}
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
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <FormControl sx={{ flex: 1 }}>
              <InputLabel>Time Period</InputLabel>
              <Select
                value={newChore.time_period}
                onChange={(e) => setNewChore({...newChore, time_period: e.target.value})}
              >
                {timePeriods.map(period => (
                  <MenuItem key={period} value={period}>
                    {period.charAt(0).toUpperCase() + period.slice(1).replace('-', ' ')}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          
          {/* Multiple Day Selection */}
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
          
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Repeat Type</InputLabel>
            <Select
              value={newChore.repeat_type}
              onChange={(e) => setNewChore({...newChore, repeat_type: e.target.value})}
            >
              {repeatTypes.map(type => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
            disabled={newChore.assigned_days_of_week.length === 0}
          >
            Add Chore{newChore.assigned_days_of_week.length > 1 ? 's' : ''}
          </Button>
        </DialogActions>
      </Dialog>
      </Box>

      {/* Fun Loading Indicator */}
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
          {/* Animated Clams */}
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
          
          {/* Loading Text */}
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
          
          {/* Subtle Progress Ring */}
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
