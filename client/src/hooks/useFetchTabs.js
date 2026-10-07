import { useState, useCallback } from 'react';
import axios from 'axios';

const useFetchTabs = (API_DEVICE_URL) => {
  const [tabs, setTabs] = useState([]);

  const fetchTabs = useCallback(async () => {
    try {
      const response = await axios.get(`${API_DEVICE_URL}/tabs`);
      setTabs(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching tabs:', error);
      setTabs([]);
    }
  }, [API_DEVICE_URL]);

  return { tabs, setTabs, fetchTabs };
};

export default useFetchTabs;
