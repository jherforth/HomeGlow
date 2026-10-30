import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';

// The import note is shown until dismissed, once per import.
const IMPORT_SEEN_KEY = 'homeglow.routinesImportSeen';
const readSeen = () => { try { return localStorage.getItem(IMPORT_SEEN_KEY); } catch { return null; } };
const writeSeen = (value) => { try { localStorage.setItem(IMPORT_SEEN_KEY, value); } catch { /* private window */ } };

// Routines, the step library and the calendars a routine can watch, for
// Admin → Family → Chores. `reload` after any change: a routine's write also
// changes its chore and schedules, so the page reloads those as well.
export default function useRoutines({ onError } = {}) {
  const [routines, setRoutines] = useState([]);
  const [steps, setSteps] = useState([]);
  const [sources, setSources] = useState([]);
  const [imported, setImported] = useState(null);
  const [loaded, setLoaded] = useState(false);
  // Held so a new callback each render doesn't make a new reload (and load again).
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const reload = useCallback(async () => {
    try {
      const [routinesRes, sourcesRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/routines`),
        axios.get(`${API_BASE_URL}/api/calendar-sources`).catch(() => ({ data: [] })),
      ]);
      setRoutines(routinesRes.data.routines || []);
      setSteps(routinesRes.data.steps || []);
      setImported(routinesRes.data.imported && routinesRes.data.imported.at !== readSeen() ? routinesRes.data.imported : null);
      setSources((Array.isArray(sourcesRes.data) ? sourcesRes.data : []).filter((source) => source.enabled));
    } catch (error) {
      console.error('Error loading routines:', error);
      onErrorRef.current?.();
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const dismissImported = () => {
    if (imported) writeSeen(imported.at);
    setImported(null);
  };

  // A step made in the routine editor joins the library at once.
  const addStep = (step) => setSteps((current) => [...current, step]);

  return { loaded, routines, steps, sources, imported, dismissImported, addStep, reload };
}
