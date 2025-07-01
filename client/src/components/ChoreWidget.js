import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button, Card, Typography } from '@mui/material';
import TouchEvent from 'react-touch-events';

const ChoreWidget = () => {
  const [chores, setChores] = useState([]);

  useEffect(() => {
    axios.get('http://localhost:5000/api/chores')
      .then(response => setChores(response.data))
      .catch(error => console.error(error));
  }, []);

  const handleSwipe = (direction) => {
    console.log(`Swiped ${direction}`);
    // Add logic for swipe actions (e.g., mark chore as complete)
  };

  return (
    <TouchEvent onSwipe={handleSwipe}>
      <Card style={{ padding: '20px', width: '300px' }}>
        <Typography variant="h6">Chores</Typography>
        {chores.map(chore => (
          <Typography key={chore.id}>{chore.title}</Typography>
        ))}
        <Button
          variant="contained"
          onClick={() => axios.post('http://localhost:5000/api/chores', {
            user_id: 1,
            title: 'New Chore',
            description: 'Test chore'
          })}
        >
          Add Chore
        </Button>
      </Card>
    </TouchEvent>
  );
};

export default ChoreWidget;