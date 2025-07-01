import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardMedia, Typography } from '@mui/material';
import '../index.css';

const PhotoWidget = () => {
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPhotos = async () => {
      try {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/photos`);
        setPhotos(response.data);
        setError(null);
      } catch (error) {
        console.error('Error fetching photos:', error);
        setError('Cannot connect to photo service. Please check Immich settings.');
      }
    };
    fetchPhotos();
  }, []);

  return (
    <Card className="card">
      <Typography variant="h6">Photos</Typography>
      {error && <Typography color="error">{error}</Typography>}
      {photos.length === 0 && !error && <Typography>No photos available</Typography>}
      {photos.map((photo) => (
        <CardMedia
          key={photo.id}
          component="img"
          height="140"
          image={photo.url}
          alt={photo.name}
          style={{ marginBottom: '8px', borderRadius: '8px' }}
        />
      ))}
    </Card>
  );
};

export default PhotoWidget;