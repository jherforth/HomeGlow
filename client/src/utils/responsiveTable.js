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
      borderRadius: 'var(--hg-radius-md)',
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

// A denser stacked card for long admin lists (the Chores tab), where one
// labelled line per field turns a dozen chores into ten screens of scrolling.
// Same stacked-card idea, laid out by flex `order` so no markup moves:
//   - the first cell (the title) is the card heading, unlabelled;
//   - the last cell (the action buttons) sits on the heading line, at the right;
//   - every other cell becomes a small labelled chip, several to a line;
//   - a cell with the `stack-full` class takes a line of its own under the
//     heading (a description), and one with `stack-empty` is dropped, so an
//     empty value does not cost a line.
// Mobile only, like stackableTableSx: nothing changes at 600px and up.
export const compactStackedTableSx = {
  '@media (max-width:599.95px)': {
    '& thead': { display: 'none' },
    '& tbody tr': {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: 1.5,
      rowGap: 0.5,
      mb: 1,
      border: '1px solid var(--card-border)',
      borderRadius: 'var(--hg-radius-md)',
      px: 1.25,
      py: 1,
    },
    '& td': {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 0.75,
      border: 0,
      p: 0,
      order: 2,
      '&::before': {
        content: 'attr(data-label)',
        fontSize: '0.72rem',
        fontWeight: 600,
        color: 'var(--text-secondary)',
      },
    },
    // At least 60% of the line, so the title and the actions fill it and the
    // chips start on the next line instead of squeezing the title.
    '& td:first-of-type': {
      order: 0,
      flex: '1 0 60%',
      minWidth: 0,
      '&::before': { content: 'none' },
    },
    '& td:last-of-type': {
      order: 1,
      flex: '0 0 auto',
      ml: 'auto',
      '&::before': { content: 'none' },
    },
    '& td.stack-full': {
      flexBasis: '100%',
      '&::before': { content: 'none' },
    },
    '& td.stack-empty': { display: 'none' },
    // The empty-state row is a single cell spanning every column: keep it a
    // plain centred line rather than a heading.
    '& td[colspan]': {
      order: 0,
      flexBasis: '100%',
      justifyContent: 'center',
    },
  },
};
