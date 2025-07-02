import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, Typography, Button, Box } from '@mui/material';
import '../index.css'; // Assuming global styles are here

const PhotoWidget = ({ transparentBackground }) => { // Added transparentBackground prop
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPhotos = async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/photos`);
        setPhotos(Array.isArray(response.data) ? response.data : []); // Defensive check
        setError(null);
      } catch (error) {
        console.error('Error fetching photos:', error);
        setError('Cannot connect to photo service. Please try again later.');
      }
    };
    fetchPhotos();
  }, []);

  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('photo', file);

    try {
      await axios.post(`${import.meta.env.VITE_REACT_APP_API_URL}/api/photos/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      // Re-fetch photos after successful upload
      const response = await axios.get(`${import.meta.env.VITE_REACT_APP_API_URL}/api/photos`);
      setPhotos(Array.isArray(response.data) ? response.data : []); // Defensive check
      setError(null);
    } catch (error) {
      console.error('Error uploading photo:', error);
      setError('Failed to upload photo. Please try again.');
    }
  };

  return (
    <Card className={`card ${transparentBackground ? 'transparent-card' : ''}`}> {/* Apply transparent-card class */}
      <Typography variant="h6">Photos</Typography>
      {error && <Typography color="error">{error}</Typography>}
      <Box sx={{ height: 200, overflowY: 'auto', mt: 2 }}>
        {photos.length === 0 && !error && <Typography>No photos available</Typography>}
        {Array.isArray(photos) && photos.map((photo) => ( // Ensure photos is an array before mapping
          <img
            key={photo.id}
            src={`${import.meta.env.VITE_REACT_APP_API_URL}/Uploads/${photo.filename}`}
            alt={photo.filename}
            style={{ width: '100%', marginBottom: '8px', borderRadius: '4px' }}
          />
        ))}
      </Box>
      <Button variant="contained" component="label" sx={{ mt: 2 }}>
        Upload Photo
        <input type="file" hidden onChange={handleUpload} />
      </Button>
    </Card>
  );
};

export default PhotoWidget;
