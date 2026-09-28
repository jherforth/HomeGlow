// Compact horizontal-scroll table for mobile: below the mobile cutoff the
// table keeps its desktop column layout inside a horizontally scrollable
// container. The first column (Title/Chore) takes the full viewport width;
// scroll right to reach the remaining columns (schedules, actions, etc).
// Rows stay compact so 10-15 fit on screen.
export const stackableTableSx = {
  '@media (max-width:599.95px)': {
    display: 'block',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    // The table itself needs a min-width to force horizontal scrolling.
    '& .MuiTable-root': {
      minWidth: 640,
      width: 'max-content',
    },
    '& .MuiTableHead-root .MuiTableCell-root': {
      px: 1,
      py: 0.75,
      fontSize: '0.7rem',
      whiteSpace: 'nowrap',
    },
    '& .MuiTableBody-root .MuiTableCell-root': {
      px: 1,
      py: 0.5,
      fontSize: '0.8rem',
      verticalAlign: 'top',
    },
    // First column takes full viewport width; sticky so it stays visible.
    '& .MuiTableBody-root .MuiTableCell-root:first-of-type': {
      position: 'sticky',
      left: 0,
      backgroundColor: 'var(--card-bg)',
      zIndex: 1,
      minWidth: 'calc(100vw - 48px)',
      maxWidth: 'calc(100vw - 48px)',
      whiteSpace: 'normal',
      wordBreak: 'break-word',
    },
    '& .MuiTableHead-root .MuiTableCell-root:first-of-type': {
      position: 'sticky',
      left: 0,
      backgroundColor: 'var(--card-bg)',
      zIndex: 2,
      minWidth: 'calc(100vw - 48px)',
      maxWidth: 'calc(100vw - 48px)',
    },
  },
};

// Apply to the TableContainer for proper scroll behavior on mobile.
export const stackableTableContainerSx = {
  '@media (max-width:599.95px)': {
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    '& .MuiTable-root': {
      width: 'max-content',
      minWidth: '100%',
    },
  },
};
