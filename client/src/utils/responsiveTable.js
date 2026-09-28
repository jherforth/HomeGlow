// Compact horizontal-scroll table for mobile: below the mobile cutoff the
// table keeps its desktop column layout inside a horizontally scrollable
// container. Columns stay in a single row (no stacking), with tight padding
// and small type so 10-15 rows fit on screen. Scroll right to reach actions.
export const stackableTableSx = {
  '@media (max-width:599.95px)': {
    display: 'block',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    '& table': {
      minWidth: 640,
    },
    '& thead th': {
      px: 1,
      py: 0.75,
      fontSize: '0.7rem',
      whiteSpace: 'nowrap',
    },
    '& tbody td': {
      px: 1,
      py: 0.75,
      fontSize: '0.8rem',
      verticalAlign: 'top',
    },
    // Keep the first column (usually Title/Name) visible while scrolling.
    '& tbody td:first-of-type': {
      position: 'sticky',
      left: 0,
      backgroundColor: 'var(--card-bg)',
      zIndex: 1,
      maxWidth: 140,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    '& thead th:first-of-type': {
      position: 'sticky',
      left: 0,
      backgroundColor: 'var(--card-bg)',
      zIndex: 2,
    },
  },
};
