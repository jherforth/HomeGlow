import React from 'react';
import { Box, Typography } from '@mui/material';

const AdminFormSection = ({ title, subtitle, children }) => {
  return (
    <>
      <Typography variant="h6" gutterBottom>{title}</Typography>
      <Box sx={{ mb: 3, p: 2, border: '1px solid var(--card-border)', borderRadius: 1 }}>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>{subtitle}</Typography>
        {children}
      </Box>
    </>
  );
};

export default AdminFormSection;
