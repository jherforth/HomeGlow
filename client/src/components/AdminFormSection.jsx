import React from 'react';
import { Box } from '@mui/material';
import { AdminGroup, AdminNote } from './AdminRows.jsx';

// A titled block of the Admin Panel that isn't built from rows: a group, its
// subtitle as the group's first line, then the content as it is.
const AdminFormSection = ({ title, subtitle, children }) => (
  <AdminGroup title={title}>
    {subtitle && <AdminNote>{subtitle}</AdminNote>}
    <Box sx={{ px: 2, py: 1.5 }}>{children}</Box>
  </AdminGroup>
);

export default AdminFormSection;
