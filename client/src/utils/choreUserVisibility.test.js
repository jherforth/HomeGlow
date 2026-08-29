import { describe, it, expect } from 'vitest';
import {
  filterVisibleUsers,
  toggleHiddenUserId,
  pruneHiddenUserIds,
} from './choreUserVisibility.js';

const USERS = [
  { id: 1, username: 'Ada', sort_order: 0 },
  { id: 2, username: 'Bee', sort_order: 1 },
  { id: 3, username: 'Cy', sort_order: 2 },
];

describe('filterVisibleUsers', () => {
  it('returns everyone when the hidden list is absent', () => {
    expect(filterVisibleUsers(USERS, undefined)).toEqual(USERS);
    expect(filterVisibleUsers(USERS, null)).toEqual(USERS);
  });

  it('returns everyone when the hidden list is empty', () => {
    expect(filterVisibleUsers(USERS, [])).toEqual(USERS);
  });

  it('hides a single user by id', () => {
    expect(filterVisibleUsers(USERS, [2]).map((u) => u.id)).toEqual([1, 3]);
  });

  it('hides all users when every id is on the list', () => {
    expect(filterVisibleUsers(USERS, [1, 2, 3])).toEqual([]);
  });

  it('preserves input order (which carries the admin sort_order)', () => {
    const reversed = [...USERS].reverse();
    expect(filterVisibleUsers(reversed, [2]).map((u) => u.id)).toEqual([3, 1]);
  });

  it('ignores stale ids that no longer match a live user', () => {
    // 99 has been deleted from the system but still lingers in a device's
    // stored hidden list — the widget must still render the survivors.
    expect(filterVisibleUsers(USERS, [99, 2]).map((u) => u.id)).toEqual([1, 3]);
  });

  it('tolerates ids that arrive as strings after a JSON round-trip', () => {
    expect(filterVisibleUsers(USERS, ['2']).map((u) => u.id)).toEqual([1, 3]);
  });

  it('returns [] for a non-array user list', () => {
    expect(filterVisibleUsers(null, [1])).toEqual([]);
    expect(filterVisibleUsers(undefined, [1])).toEqual([]);
  });
});

describe('toggleHiddenUserId', () => {
  it('adds a user id that is not on the list', () => {
    expect(toggleHiddenUserId([], 2)).toEqual([2]);
    expect(toggleHiddenUserId([1], 2)).toEqual([1, 2]);
  });

  it('removes a user id that is already on the list', () => {
    expect(toggleHiddenUserId([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it('does not mutate the input', () => {
    const input = [1, 2];
    toggleHiddenUserId(input, 3);
    expect(input).toEqual([1, 2]);
  });

  it('starts from empty when the input is not an array', () => {
    expect(toggleHiddenUserId(null, 2)).toEqual([2]);
    expect(toggleHiddenUserId(undefined, 2)).toEqual([2]);
  });

  it('normalizes string ids so toggling stays idempotent', () => {
    expect(toggleHiddenUserId(['2'], 2)).toEqual([]);
  });
});

describe('pruneHiddenUserIds', () => {
  it('drops ids that no longer resolve to a live user', () => {
    expect(pruneHiddenUserIds([1, 99, 2], USERS)).toEqual([1, 2]);
  });

  it('dedupes and coerces to numbers', () => {
    expect(pruneHiddenUserIds([1, '1', 2, 2], USERS)).toEqual([1, 2]);
  });

  it('returns [] for non-array input', () => {
    expect(pruneHiddenUserIds(null, USERS)).toEqual([]);
  });
});
