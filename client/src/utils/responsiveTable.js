// CSS "stacked card" pattern for MUI <Table>: below the mobile cutoff the
// header row is hidden and each body row renders as a bordered card whose
// cells show their column name via the cell's data-label attribute.
// Cells without a data-label (e.g. avatars, action buttons) render full-width
// with their content wrapping naturally instead of being space-between'd.
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
      alignItems: 'center',
      gap: 1.5,
      border: 0,
      py: 0.75,
      // Cells with a column label: label pinned left, value pushed right.
      '&[data-label]': {
        justifyContent: 'space-between',
        '&::before': {
          content: 'attr(data-label)',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          marginRight: '12px',
          flexShrink: 0,
        },
      },
      // Cells without a label (avatars, action buttons): wrap naturally,
      // left-aligned, so grouped controls don't get stretched apart.
      '&:not([data-label])': {
        justifyContent: 'flex-start',
        flexWrap: 'wrap',
        rowGap: 1,
      },
    },
  },
};
