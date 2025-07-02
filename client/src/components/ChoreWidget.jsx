import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { Button, Card, Typography, TextField } from '@mui/material';
import Hammer from 'hammerjs';
import '../index.css';

const ChoreWidget = () => {
  const [chores, setChores] = useState([]);
  const [newChore, setNewChore] = useState({ title: '', description: '' });
  const [error, setError] = useState(null);
  const cardRef = useRef(null);

  useEffect(() => {
    const fetchChores = async () => {
      try {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/chores`);
        // Ensure response.data is an array before setting state
        setChores(Array.isArray(response.data) ? response.data : []);
        setError(null);
      } catch (error) {
        console.error('Error fetching chores:', error);
        setError('Cannot connect to chore service. Please try again later.');
      }
    };
    fetchChores();
  }, []);

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
      setError('Failed to update chore. Please try again.');
    }
  };

  const handleInputChange = (e) => {
    setNewChore({ ...newChore, [e.target.name]: e.target.value });
  };

  const handleAddChore = async () => {
    if (!newChore.title.trim()) {
      setError('Chore title is required');
      return;
    }
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/chores`, {
        user_id: 1,
        title: newChore.title,
        description: newChore.description,
        completed: false,
      });
      setChores([...chores, { ...newChore, id: response.data.id, completed: false }]);
      setNewChore({ title: '', description: '' });
      setError(null);
    } catch (error) {
      console.error('Error adding chore:', error);
      setError('Failed to add chore. Please try again.');
    }
  };

  return (
    <Card className="card" ref={cardRef}>
      <Typography variant="h6">Chores</Typography>
      {error && <Typography color="error">{error}</Typography>}
      {chores.length === 0 && !error && <Typography>No chores available</Typography>}
      {/* Ensure chores is an array before mapping */}
      {Array.isArray(chores) && chores.map((chore) => (
        <Typography
          key={chore.id}
          data-chore-id={chore.id}
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
        fullWidth
        sx={{ marginBottom: '8px' }}
      />
      <TextField
        name="description"
        value={newChore.description}
        onChange={handleInputChange}
        label="Chore Description"
        variant="outlined"
        size="small"
        fullWidth
        sx={{ marginBottom: '8px' }}
      />
      <Button variant="contained" onClick={handleAddChore}>
        Add Chore
      </Button>
    </Card>
  );
};

export default ChoreWidget;