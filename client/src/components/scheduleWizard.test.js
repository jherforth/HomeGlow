import { describe, it, expect } from 'vitest';
import { WIZARD_START, wizardTiming } from './ScheduleWizard.jsx';
import { afterTiming, everyNTiming } from '../utils/choreScheduleGroups.js';

describe('wizardTiming', () => {
  it('takes whole numbers only, as the server does', () => {
    expect(wizardTiming({ ...WIZARD_START, how: 'after', count: '3', unit: 'm' })).toEqual(afterTiming('3m'));
    expect(wizardTiming({ ...WIZARD_START, how: 'after', count: '2.5', unit: 'd' })).toBeNull();
    expect(wizardTiming({ ...WIZARD_START, how: 'after', count: '1.5', unit: 'w' })).toBeNull();
    expect(wizardTiming({ ...WIZARD_START, how: 'after', count: '', unit: 'w' })).toBeNull();
    expect(wizardTiming({ ...WIZARD_START, how: 'everyN', n: '3' })).toEqual(everyNTiming(3));
    expect(wizardTiming({ ...WIZARD_START, how: 'everyN', n: '2.5' })).toBeNull();
    expect(wizardTiming({ ...WIZARD_START, how: 'everyN', n: 61 })).toBeNull();
  });
});
