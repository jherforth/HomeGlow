import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardMedia, Typography } from '@mui/material';
import '../index.css';

const PhotoWidget = () => {
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios
      .get(`${process.env.REACT_APP_API_URL}/api/photos`)
      .then((response) => {
        setPhotos(response.data);
        setError(null);
      })
      .catch((error) => {
        console.error('Error fetching photos:', error);
        setError('Failed to load photos');
      });
  }, []);

  return (
    <Card className="card">
      <Typography variant="h6">Photos</Typography>
      {error && <Typography color="error">{error}</Typography>}
      {photos.map((photo) => (
        <CardMedia
          key={photo.id}
          component="img"
          height="140"
          image={photo.url}
          alt={photo.name}
          style={{
            borderRadius: '8px',
            marginBottom: '8px',
            border: '1px solid var(--card-border)',
            objectFit: 'cover',
          }}
        />
      ))}
    </Card>
  );
};

export default PhotoWidget;