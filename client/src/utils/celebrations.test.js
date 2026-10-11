import { describe, expect, it } from 'vitest';
import { acceptPluginCelebrateMessage, createCelebrationGate, PLUGIN_CELEBRATE_MESSAGE_TYPE, SOURCE_GAP_MS } from './celebrations.js';

const clock = () => {
  let t = 1000;
  return { now: () => t, advance: (ms) => { t += ms; } };
};

describe('celebration gate', () => {
  it('plays the chore widget each time, with no gap', () => {
    const gate = createCelebrationGate();
    expect(gate.admit('chores')).toBe(true);
    gate.finished();
    expect(gate.admit('chores')).toBe(true);
  });

  it('lets nothing interrupt a celebration that is playing', () => {
    const gate = createCelebrationGate();
    expect(gate.admit('plugin:Routines.html')).toBe(true);
    expect(gate.admit('chores')).toBe(false);
    expect(gate.admit('plugin:Polls.html')).toBe(false);
    gate.finished();
    expect(gate.admit('chores')).toBe(true);
  });

  it('gives each plugin one celebration per gap', () => {
    const { now, advance } = clock();
    const gate = createCelebrationGate({ now });
    expect(gate.admit('plugin:Routines.html')).toBe(true);
    gate.finished();
    advance(SOURCE_GAP_MS - 1);
    expect(gate.admit('plugin:Routines.html')).toBe(false);
    expect(gate.admit('plugin:Polls.html')).toBe(true);
    gate.finished();
    advance(1);
    expect(gate.admit('plugin:Routines.html')).toBe(true);
  });

  it('refuses a request with no source', () => {
    const gate = createCelebrationGate();
    expect(gate.admit(undefined)).toBe(false);
    expect(gate.admit('')).toBe(false);
  });
});

describe('plugin celebrate messages', () => {
  const frame = {};
  const origin = 'https://hg.example';
  const message = (over = {}) => ({ source: frame, origin, data: { type: PLUGIN_CELEBRATE_MESSAGE_TYPE }, ...over });

  it('counts only from the plugin frame and its origin', () => {
    expect(acceptPluginCelebrateMessage(message(), frame, origin)).toBe(true);
    expect(acceptPluginCelebrateMessage(message({ source: {} }), frame, origin)).toBe(false);
    expect(acceptPluginCelebrateMessage(message({ origin: 'https://evil.example' }), frame, origin)).toBe(false);
    expect(acceptPluginCelebrateMessage(message(), null, origin)).toBe(false);
  });

  it('ignores other message types', () => {
    expect(acceptPluginCelebrateMessage(message({ data: { type: 'homeglow:data-changed', scope: 'chores' } }), frame, origin)).toBe(false);
    expect(acceptPluginCelebrateMessage(message({ data: 'homeglow:celebrate' }), frame, origin)).toBe(false);
  });
});
