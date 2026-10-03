import { useState, useCallback } from 'react';
import axios from 'axios';

const useFetchTabs = (API_DEVICE_URL) => {
  const [tabs, setTabs] = useState([]);

  const fetchTabs = useCallback(async () => {
    if (!API_DEVICE_URL) return [];
    try {
      const response = await axios.get(`${API_DEVICE_URL}/tabs`);
      const data = Array.isArray(response.data) ? response.data : [];
      setTabs(data);
      return data;
    } catch (error) {
      console.error('Error fetching tabs:', error);
      setTabs([]);
      return [];
    }
  }, [API_DEVICE_URL]);

  return { tabs, setTabs, fetchTabs };
};

export default useFetchTabs;
