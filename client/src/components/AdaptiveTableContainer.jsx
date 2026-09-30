import React, { useRef, useLayoutEffect } from 'react';
import { TableContainer } from '@mui/material';
import { stackableTableContainerSx } from '../utils/responsiveTable.js';

const MIN_FIRST_COL_PX = 72; // floor so the column never collapses
const VIEWPORT_MARGIN_PX = 48; // matches the calc(100vw - 48px) fallback

// Measure the natural (unwrapped) width of the first column's cells.
function measureFirstColumn(table) {
  const cells = table.querySelectorAll(
    'thead tr > th:first-child, thead tr > td:first-child, tbody tr > td:first-child, tbody tr > th:first-child'
  );
  if (!cells.length) return 0;
  let max = 0;
  cells.forEach((cell) => {
    // Temporarily lift the width constraints so scrollWidth reflects content.
    cell.style.minWidth = '0';
    cell.style.maxWidth = 'none';
    cell.style.width = 'auto';
    cell.style.whiteSpace = 'nowrap';
    max = Math.max(max, cell.scrollWidth);
    cell.style.minWidth = '';
    cell.style.maxWidth = '';
    cell.style.width = '';
    cell.style.whiteSpace = '';
  });
  return max;
}

// TableContainer for the mobile horizontal-scroll tables. Sizes the sticky
// first column to fit its longest cell content (capped at viewport width)
// instead of always taking the full viewport width. Re-measures when the
// table content changes, on resize, and once web fonts load.
export default function AdaptiveTableContainer({ sx, children, ...props }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return undefined;
    const table = container.querySelector('table');
    if (!table) return undefined;

    const apply = () => {
      const natural = measureFirstColumn(table);
      const capped = Math.min(natural, window.innerWidth - VIEWPORT_MARGIN_PX);
      table.style.setProperty(
        '--first-col-w',
        `${Math.max(MIN_FIRST_COL_PX, Math.ceil(capped))}px`
      );
    };

    apply();

    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };
    // Re-measure when rows/cells change (sorting, filtering, edits).
    const observer = new MutationObserver(schedule);
    observer.observe(table, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', schedule);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(schedule).catch(() => {});
    }
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return (
    <TableContainer ref={ref} sx={{ ...stackableTableContainerSx, ...sx }} {...props}>
      {children}
    </TableContainer>
  );
}
