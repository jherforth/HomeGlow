// CSS "stacked card" pattern for MUI <Table>: below the mobile cutoff the
// header row is hidden and each body row renders as a bordered card whose
// cells show their column name via the cell's data-label attribute.
// Cells without a data-label (e.g. avatars, action buttons) render unprefixed.
export const stackableTableSx = {
  '@media (max-width:599.95px)': {
    '& thead': { display: 'none' },
    '& tr': {
      display: 'block',
      mb: 1.5,
      border: '1px solid var(--card-border)',
      borderRadius: 2,
      p: 1,
    },
    '& td': {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 2,
      border: 0,
      py: 0.75,
      '&::before': {
        content: 'attr(data-label)',
        fontWeight: 600,
        color: 'var(--text-secondary)',
        marginRight: '12px',
      },
    },
  },
};
