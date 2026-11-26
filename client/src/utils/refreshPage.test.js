import { describe, it, expect, vi } from 'vitest';
import {
  CALENDAR_SYNC_TIMEOUT_MS,
  syncCalendarsThenReload,
} from './refreshPage.js';

describe('syncCalendarsThenReload', () => {
  it('posts to the calendar-sync endpoint and reloads on success', async () => {
    const post = vi.fn().mockResolvedValue({});
    const reload = vi.fn();

    await syncCalendarsThenReload({ post, apiBaseUrl: 'http://wall:5000', reload });

    expect(post).toHaveBeenCalledWith(
      'http://wall:5000/api/calendar-sync/all',
      {},
      { timeout: CALENDAR_SYNC_TIMEOUT_MS },
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('still reloads when the sync rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const post = vi.fn().mockRejectedValue(new Error('sync failed'));
    const reload = vi.fn();

    await syncCalendarsThenReload({ post, apiBaseUrl: '', reload });

    expect(post).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
