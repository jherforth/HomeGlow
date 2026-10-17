import { describe, expect, it } from 'vitest';
import { NTFY_TOPIC, isPublicNtfy, randomNtfyTopic } from './ntfy.js';

describe('ntfy helpers', () => {
  it('makes random topics ntfy accepts, different each time', () => {
    const a = randomNtfyTopic();
    const b = randomNtfyTopic();
    expect(a).toMatch(/^homeglow-[a-z0-9]{12}$/);
    expect(NTFY_TOPIC.test(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('knows public ntfy.sh from a self-hosted server', () => {
    expect(isPublicNtfy('https://ntfy.sh')).toBe(true);
    expect(isPublicNtfy(undefined)).toBe(true);
    expect(isPublicNtfy('https://NTFY.sh/')).toBe(true);
    expect(isPublicNtfy('https://ntfy.example.com')).toBe(false);
    expect(isPublicNtfy('http://192.168.1.20:8080')).toBe(false);
    expect(isPublicNtfy('not a url')).toBe(false);
  });

  it('accepts the topic names ntfy does', () => {
    expect(NTFY_TOPIC.test('homeglow_mom-1')).toBe(true);
    expect(NTFY_TOPIC.test('has spaces')).toBe(false);
    expect(NTFY_TOPIC.test('a'.repeat(65))).toBe(false);
  });
});
