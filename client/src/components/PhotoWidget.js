import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardMedia, Typography } from '@mui/material';

const PhotoWidget = () => {
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    axios.get('http://localhost:5000/api/photos')
      .then(response => setPhotos(response.data))
      .catch(error => console.error(error));
  }, []);

  return (
    <Card style={{ padding: '20px', width: '300px' }}>
      <Typography variant="h6">Photos</Typography>
      {photos.map(photo => (
        <CardMedia
          key={photo.id}
          component="img"
          height="140"
          image={photo.url}
          alt={photo.name}
        />
      ))}
    </Card>
  );
};

export default PhotoWidget;