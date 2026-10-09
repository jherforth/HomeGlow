// Filtering, sorting and grouping for the Admin History view.
//
// All of it runs in the browser: a family logs a few thousand history rows a
// year, so the server sends a date range and the view does the rest.

// How far back the view reaches; null is all time.
export const HISTORY_RANGES = { '7': 7, '30': 30, '90': 90, all: null };

// History kinds, as the view shows and filters them.
const CATEGORY_OF_KIND = {
  completion: 'done',
  missed: 'missed',
  daily_bonus: 'bonus',
  transfer_bonus: 'bonus',
  adjustment: 'adjustment',
  spent: 'adjustment',
};

export const HISTORY_CATEGORIES = ['done', 'bonus', 'adjustment'];

export function categoryOf(row) {
  return CATEGORY_OF_KIND[row.kind] || 'done';
}

/** The first day of the range, as YYYY-MM-DD, counting `today` as one of its days; null for all time. */
export function rangeStart(range, today = new Date()) {
  const days = HISTORY_RANGES[range];
  if (days == null) return null;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
  return [
    start.getFullYear(),
    String(start.getMonth() + 1).padStart(2, '0'),
    String(start.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Which chore a row belongs to. The chore, while its schedule exists; after
 * that only the title the row was logged with is left, so rows of a deleted
 * chore group by that title.
 */
export function choreKey(row) {
  if (row.chore_id != null) return `chore:${row.chore_id}`;
  return `title:${row.title || ''}`;
}

const personKey = (row) => `person:${row.user_id ?? ''}`;

// Newest first: by the day a row counts for, then when it was logged.
function compareRecency(a, b) {
  return String(b.date).localeCompare(String(a.date))
    || String(b.created_at || '').localeCompare(String(a.created_at || ''))
    || (b.id || 0) - (a.id || 0);
}

/** The people and chores present in `rows`, for the filter menus, by name. */
export function filterOptions(rows) {
  const people = new Map();
  const chores = new Map();
  for (const row of [...rows].sort(compareRecency)) {
    const person = personKey(row);
    if (!people.has(person)) people.set(person, { key: person, label: row.username || '' });
    // Newest first, so a renamed chore is listed under its current name.
    const chore = choreKey(row);
    if (!chores.has(chore)) chores.set(chore, { key: chore, label: row.title || '' });
  }
  const byLabel = (a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  return { people: [...people.values()].sort(byLabel), chores: [...chores.values()].sort(byLabel) };
}

/**
 * The rows that pass the filters. `person` and `chore` are keys from
 * filterOptions, or empty for all; `categories` holds the categories to show
 * besides missed, which `showMissed` controls.
 */
export function filterRows(rows, { person = '', chore = '', categories = HISTORY_CATEGORIES, showMissed = true } = {}) {
  const shown = new Set(categories);
  return rows.filter((row) => {
    if (person && personKey(row) !== person) return false;
    if (chore && choreKey(row) !== chore) return false;
    const category = categoryOf(row);
    return category === 'missed' ? showMissed : shown.has(category);
  });
}

const SORTS = {
  date: (a, b) => -compareRecency(a, b),
  person: (a, b) => String(a.username || '').localeCompare(String(b.username || ''), undefined, { sensitivity: 'base' }),
  chore: (a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }),
  clams: (a, b) => (a.clam_value || 0) - (b.clam_value || 0),
};

/** Rows sorted by `by` (date, person, chore or clams); ties fall back to newest first. */
export function sortRows(rows, { by = 'date', direction = 'desc' } = {}) {
  const compare = SORTS[by] || SORTS.date;
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => sign * compare(a, b) || compareRecency(a, b));
}

const GROUP_KEYS = {
  person: (row) => personKey(row),
  chore: (row) => choreKey(row),
  personChore: (row) => `${personKey(row)}|${choreKey(row)}`,
};

/**
 * Rows grouped by person, chore, or both (`groupBy`), each group with its
 * totals. Groups come most recently active first; rows keep the order given.
 * The labels are the newest row's, so a renamed chore shows its current name.
 */
export function groupRows(rows, groupBy) {
  const keyOf = GROUP_KEYS[groupBy];
  if (!keyOf) return [];
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, { key, rows: [], done: 0, missed: 0, clams: 0, newest: null });
    const group = groups.get(key);
    group.rows.push(row);
    const category = categoryOf(row);
    if (category === 'done') group.done += 1;
    if (category === 'missed') group.missed += 1;
    group.clams += row.clam_value || 0;
    if (!group.newest || compareRecency(row, group.newest) < 0) group.newest = row;
  }
  return [...groups.values()]
    .map(({ newest, ...group }) => ({
      ...group,
      person: groupBy === 'chore' ? null : newest.username || '',
      chore: groupBy === 'person' ? null : newest.title || '',
      lastDate: newest.date,
    }))
    .sort((a, b) => String(b.lastDate).localeCompare(String(a.lastDate))
      || `${a.person || ''} ${a.chore || ''}`.localeCompare(`${b.person || ''} ${b.chore || ''}`));
}
