import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { Button, Card, Typography, TextField } from '@mui/material';
import Hammer from 'hammerjs';

const ChoreWidget = () => {
  const [chores, setChores] = useState([]);
  const [newChore, setNewChore] = useState({ title: '', description: '' });
  const [error, setError] = useState(null);
  const cardRef = useRef(null);

  // Fetch chores on mount
  useEffect(() => {
    axios
      .get(`${process.env.REACT_APP_API_URL}/api/chores`)
      .then((response) => {
        setChores(response.data);
        setError(null);
      })
      .catch((error) => {
        console.error('Error fetching chores:', error);
        setError('Failed to load chores');
      });
  }, []);

  // Set up Hammer.js for swipe gestures
  useEffect(() => {
    const hammer = new Hammer(cardRef.current);
    hammer.on('swiperight', (e) => {
      // Assuming the chore ID is stored in a data attribute or context
      // For simplicity, we'll log the action; replace with actual logic
      const choreId = e.target.dataset.choreId; // Requires data-chore-id in JSX
      if (choreId) {
        markChoreComplete(choreId);
      }
    });

    // Cleanup Hammer.js on component unmount
    return () => hammer.destroy();
  }, [chores]); // Re-run if chores change to ensure correct bindings

  // Mark a chore as complete
  const markChoreComplete = async (choreId) => {
    try {
      await axios.patch(`${process.env.REACT_APP_API_URL}/api/chores/${choreId}`, {
        completed: true,
      });
      setChores(
        chores.map((chore) =>
          chore.id === parseInt(choreId) ? { ...chore, completed: true } : chore
        )
      );
      setError(null);
    } catch (error) {
      console.error('Error marking chore complete:', error);
      setError('Failed to mark chore as complete');
    }
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    setNewChore({ ...newChore, [e.target.name]: e.target.value });
  };

  // Handle adding a new chore
  const handleAddChore = async () => {
    if (!newChore.title.trim()) {
      setError('Chore title is required');
      return;
    }
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/chores`, {
        user_id: 1, // Replace with dynamic user ID in production
        title: newChore.title,
        description: newChore.description,
        completed: false,
      });
      setChores([...chores, { ...newChore, id: response.data.id, completed: false }]);
      setNewChore({ title: '', description: '' }); // Reset form
      setError(null);
    } catch (error) {
      console.error('Error adding chore:', error);
      setError('Failed to add chore');
    }
  };

  return (
    <Card
      ref={cardRef}
      style={{ padding: '20px', width: '300px', touchAction: 'manipulation' }}
    >
      <Typography variant="h6">Chores</Typography>
      {error && <Typography color="error">{error}</Typography>}
      {chores.map((chore) => (
        <Typography
          key={chore.id}
          data-chore-id={chore.id} // For swipe detection
          style={{
            textDecoration: chore.completed ? 'line-through' : 'none',
            marginBottom: '8px',
          }}
        >
          {chore.title}
        </Typography>
      ))}
      <TextField
        name="title"
        value={newChore.title}
        onChange={handleInputChange}
        label="Chore Title"
        variant="outlined"
        size="small"
        style={{ marginBottom: '8px', width: '100%' }}
      />
      <TextField
        name="description"
        value={newChore.description}
        onChange={handleInputChange}
        label="Chore Description"
        variant="outlined"
        size="small"
        style={{ marginBottom: '8px', width: '100%' }}
      />
      <Button variant="contained" onClick={handleAddChore}>
        Add Chore
      </Button>
    </Card>
  );
};

export default ChoreWidget;