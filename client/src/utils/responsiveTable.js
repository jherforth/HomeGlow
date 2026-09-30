// Compact horizontal-scroll table for mobile: below the mobile cutoff the
// table keeps its desktop column layout inside a horizontally scrollable
// container. The first column (Title/Chore) is sticky and sized to fit its
// content via the --first-col-w CSS variable (set by AdaptiveTableContainer),
// capped at the viewport width; scroll right to reach the remaining columns
// (schedules, actions, etc). Rows stay compact so 10-15 fit on screen.
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
    // First column is sticky and shrink-to-fit: --first-col-w is measured
    // from the column content by AdaptiveTableContainer (capped at viewport
    // width); falls back to full viewport width before measurement.
    '& .MuiTableBody-root .MuiTableCell-root:first-of-type': {
      position: 'sticky',
      left: 0,
      backgroundColor: 'var(--card-bg)',
      zIndex: 1,
      width: 'var(--first-col-w, calc(100vw - 48px))',
      minWidth: 'var(--first-col-w, calc(100vw - 48px))',
      maxWidth: 'var(--first-col-w, calc(100vw - 48px))',
      whiteSpace: 'normal',
      wordBreak: 'break-word',
    },
    '& .MuiTableHead-root .MuiTableCell-root:first-of-type': {
      position: 'sticky',
      left: 0,
      backgroundColor: 'var(--card-bg)',
      zIndex: 2,
      width: 'var(--first-col-w, calc(100vw - 48px))',
      minWidth: 'var(--first-col-w, calc(100vw - 48px))',
      maxWidth: 'var(--first-col-w, calc(100vw - 48px))',
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
