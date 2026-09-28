// CSS "stacked card" pattern for MUI <Table>: below the mobile cutoff the
// header row is hidden and each body row renders as a compact bordered card.
// Each labeled cell stacks its column name as a small caption ABOVE the value
// (full-width, wrapping) — no side-by-side squeezing, no horizontal scroll.
// Cells without a data-label (e.g. avatars, action buttons) render full-width
// with their content wrapping naturally instead of being space-between'd.
export const stackableTableSx = {
  '@media (max-width:599.95px)': {
    '& thead': { display: 'none' },
    '& tr': {
      display: 'block',
      mb: 1,
      border: '1px solid var(--card-border)',
      borderRadius: 2,
      px: 1.25,
      py: 0.5,
    },
    '& td': {
      display: 'flex',
      border: 0,
      px: 0,
      py: 0.5,
      minWidth: 0,
      // Cells with a column label: caption above, value below at full width.
      '&[data-label]': {
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 0.25,
        '&::before': {
          content: 'attr(data-label)',
          fontSize: '0.68rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-secondary)',
        },
      },
      // Cells without a label (avatars, action buttons): wrap naturally,
      // left-aligned, so grouped controls don't get stretched apart.
      '&:not([data-label])': {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 1,
        rowGap: 0.75,
      },
      // Values wrap and use the full card width — never truncate or scroll.
      '& > *': {
        minWidth: 0,
        maxWidth: '100%',
      },
    },
  },
};
