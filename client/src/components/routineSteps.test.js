import { describe, it, expect } from 'vitest';
import { routineCardView } from './RoutineSteps.jsx';

const open = { completed: false, steps: [{ id: 1 }, { id: 2 }], done: [1] };
const finished = { completed: true, steps: [{ id: 1 }, { id: 2 }], done: [1, 2] };

describe('routineCardView', () => {
  it('shows the steps while any is still to do, and the button is inert', () => {
    expect(routineCardView(open)).toEqual({ finished: false, stepsShown: true, buttonActive: false });
    // Opened earlier or not makes no difference: there is nothing to fold away.
    expect(routineCardView(open, true).stepsShown).toBe(true);
    expect(routineCardView(open, true).buttonActive).toBe(false);
  });

  it('folds the steps away once finished, until a parent opens them', () => {
    expect(routineCardView(finished)).toEqual({ finished: true, stepsShown: false, buttonActive: true });
    expect(routineCardView(finished, true)).toEqual({ finished: true, stepsShown: true, buttonActive: true });
  });
});
