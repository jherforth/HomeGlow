import React from 'react';
import { Container, Grid } from '@mui/material';
import CalendarWidget from './components/CalendarWidget';
import PhotoWidget from './components/PhotoWidget';
import ChoreWidget from './components/ChoreWidget';

const App = () => {
  return (
    <Container style={{ background: '#000', color: '#fff', height: '100vh' }}>
      <Grid container spacing={2}>
        <Grid item xs={4}>
          <CalendarWidget />
        </Grid>
        <Grid item xs={4}>
          <PhotoWidget />
        </Grid>
        <Grid item xs={4}>
          <ChoreWidget />
        </Grid>
      </Grid>
    </Container>
  );
};

export default App;