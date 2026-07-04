import axios from 'axios';

export const syncWidgetAssignments = async (API_DEVICE_URL, assignments, currentAssignments) => {
  for (const [widgetName, desiredTabNumbers] of Object.entries(assignments)) {
    const existing = currentAssignments.filter(a => a.widget_name === widgetName);
    const existingTabNumbers = existing.map(a => a.tab_number);

    const toRemove = existing.filter(a => !desiredTabNumbers.includes(a.tab_number));
    const toAdd = desiredTabNumbers.filter(number => !existingTabNumbers.includes(number));

    for (const assignment of toRemove) {
      await axios.delete(`${API_DEVICE_URL}/widget-assignments/${assignment.id}`);
    }

    for (const tabNumber of toAdd) {
      await axios.post(`${API_DEVICE_URL}/widget-assignments`, {
        widget_name: widgetName,
        tabNumber,
      });
    }
  }
};
