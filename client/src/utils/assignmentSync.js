import axios from 'axios';

// A widget shown in a Stack on a tab keeps its entry there, marked in_stack
// with the Stack's id. While that Stack is on the tab, the widget isn't on
// the tab on its own, so Admin's tab pickers leave the entry alone.
export const isHiddenInStack = (row, rows) => Boolean(row?.in_stack) && rows.some(
  (other) => other.widget_name === `stack:${row.in_stack}` && other.tab_number === row.tab_number,
);

export const syncWidgetAssignments = async (API_DEVICE_URL, assignments, currentAssignments) => {
  for (const [widgetName, desiredTabNumbers] of Object.entries(assignments)) {
    const existing = currentAssignments.filter(a => a.widget_name === widgetName);
    const existingTabNumbers = existing.map(a => a.tab_number);

    const toRemove = existing.filter(a => !desiredTabNumbers.includes(a.tab_number) && !isHiddenInStack(a, currentAssignments));
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
