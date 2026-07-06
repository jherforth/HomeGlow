// Deduplicate calendar events that represent the same real-world event synced
// from more than one calendar source (e.g. a shared event that lives on both a
// family ICS feed and a personal Google calendar, sometimes with slightly
// different titles). This is a pure, read-time merge — it never touches the
// per-source cache, so editing/deleting still targets the surviving event's
// real (source_id, id).

// Two events count as "the same time" when both start and end are within this
// tolerance. Absorbs small timezone/DST/all-day offsets between sources.
const DEFAULT_TIME_TOLERANCE_MS = 5 * 60 * 1000;

// Dice-coefficient title similarity above this counts as a match (0..1).
const DEFAULT_SIMILARITY_THRESHOLD = 0.6;

// Lowercase, drop a leading "[Family] " / "(Work) " calendar prefix, replace
// punctuation with spaces, collapse whitespace.
function normalizeTitle(title) {
  if (typeof title !== 'string') return '';
  return title
    .toLowerCase()
    .replace(/^\s*[[(][^\])]*[\])]\s*/, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigramCounts(str) {
  const counts = new Map();
  for (let i = 0; i < str.length - 1; i++) {
    const bg = str.slice(i, i + 2);
    counts.set(bg, (counts.get(bg) || 0) + 1);
  }
  return counts;
}

// Sørensen–Dice coefficient over character bigrams. Robust to minor edits and
// word reordering; returns 1 for equality or when one title contains the other
// ("Soccer" vs "Soccer practice").
function titleSimilarity(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 1;
  if (na.length < 2 || nb.length < 2) return 0;

  const A = bigramCounts(na);
  const B = bigramCounts(nb);
  let overlap = 0;
  let sizeA = 0;
  let sizeB = 0;
  for (const c of A.values()) sizeA += c;
  for (const c of B.values()) sizeB += c;
  for (const [bg, countA] of A) {
    overlap += Math.min(countA, B.get(bg) || 0);
  }
  return (2 * overlap) / (sizeA + sizeB);
}

function timesMatch(a, b, toleranceMs) {
  const startDiff = Math.abs(new Date(a.start).getTime() - new Date(b.start).getTime());
  const endDiff = Math.abs(new Date(a.end).getTime() - new Date(b.end).getTime());
  return startDiff <= toleranceMs && endDiff <= toleranceMs;
}

// Merge duplicate events. Returns a new array (input is not mutated). Events
// only merge across *different* sources; the survivor is the copy from the
// lowest source_id, with a `merged_from: [{source_id, source_name}]` list of
// the sources it absorbed. Output is sorted by start time (source_id tiebreak).
function dedupeCalendarEvents(events, options = {}) {
  if (!Array.isArray(events) || events.length < 2) {
    return Array.isArray(events) ? events.slice() : events;
  }

  const toleranceMs = options.toleranceMs ?? DEFAULT_TIME_TOLERANCE_MS;
  const threshold = options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;

  const clusters = [];
  for (const event of events) {
    let cluster = null;
    for (const c of clusters) {
      // Never merge two events from the same source.
      if (c.sourceIds.has(event.source_id)) continue;
      if (!timesMatch(c.survivor, event, toleranceMs)) continue;
      if (titleSimilarity(c.survivor.title, event.title) < threshold) continue;
      cluster = c;
      break;
    }

    if (!cluster) {
      clusters.push({ survivor: event, absorbed: [], sourceIds: new Set([event.source_id]) });
      continue;
    }

    cluster.sourceIds.add(event.source_id);
    // Deterministic survivor: lowest source_id wins.
    if (event.source_id < cluster.survivor.source_id) {
      cluster.absorbed.push(cluster.survivor);
      cluster.survivor = event;
    } else {
      cluster.absorbed.push(event);
    }
  }

  const output = clusters.map((c) => {
    const survivor = { ...c.survivor };
    if (c.absorbed.length > 0) {
      survivor.merged_from = c.absorbed
        .map((e) => ({ source_id: e.source_id, source_name: e.source_name }))
        .sort((x, y) => x.source_id - y.source_id);
    }
    return survivor;
  });

  output.sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime() || a.source_id - b.source_id
  );
  return output;
}

module.exports = { dedupeCalendarEvents, normalizeTitle, titleSimilarity };
