import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from './apiConfig.js';
import { getTodayDateString } from './choreHelpers.js';

// Today's routines for the chore widget, keyed by the schedule each one is
// done against, so a chore card can tell it belongs to a routine and draw its
// steps (server: GET /api/routines/today). Routines are optional: if they
// can't be read the cards simply show as ordinary chores.
export default function useRoutinesToday() {
  const [routines, setRoutines] = useState({});

  const reload = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/routines/today`, { params: { date: getTodayDateString() } });
      setRoutines(data?.routines || {});
    } catch (error) {
      console.error('Error fetching routines:', error);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Tick or untick one step. Shown at once; the server's answer (which may
  // have completed or uncompleted the routine's chore) replaces it, and is
  // returned (null if the tick failed). A routine past its expiry answers
  // { expired: true } unless a parent approved (issue #279).
  const toggleStep = useCallback(async (day, stepId, done, { parentApproved = false } = {}) => {
    setRoutines((current) => ({
      ...current,
      [day.scheduleId]: {
        ...day,
        done: done ? [...day.done, stepId] : day.done.filter((id) => id !== stepId),
      },
    }));
    try {
      const { data } = await axios.post(`${API_BASE_URL}/api/routines/${day.routineId}/steps/${stepId}`, {
        date: getTodayDateString(),
        done,
        ...(parentApproved ? { parent_approved: true } : {}),
      });
      if (data) setRoutines((current) => ({ ...current, [day.scheduleId]: data }));
      return data || null;
    } catch (error) {
      reload();
      if (error?.response?.data?.code === 'CHORE_EXPIRED') return { expired: true };
      console.error('Error ticking a routine step:', error);
      return null;
    }
  }, [reload]);

  return { routines, reload, toggleStep };
}
