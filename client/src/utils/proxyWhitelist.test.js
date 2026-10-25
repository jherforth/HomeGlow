import { describe, it, expect } from 'vitest';
import { parseWhitelist, serializeWhitelist, normalizeHost, addEntries } from './proxyWhitelist.js';

describe('parseWhitelist', () => {
  it('reads the stored list without blanks or repeats', () => {
    expect(parseWhitelist(' api.example.com, ,feeds.bbci.co.uk,api.example.com ')).toEqual(['api.example.com', 'feeds.bbci.co.uk']);
    expect(parseWhitelist('')).toEqual([]);
    expect(parseWhitelist(undefined)).toEqual([]);
  });

  it('round-trips through the setting', () => {
    expect(serializeWhitelist(parseWhitelist('a.com,b.org'))).toBe('a.com,b.org');
    expect(serializeWhitelist([])).toBe('');
  });
});

describe('normalizeHost', () => {
  it('keeps the hostname, which is all the proxy compares', () => {
    expect(normalizeHost('api.example.com')).toBe('api.example.com');
    expect(normalizeHost('https://API.Example.com:8443/feed?x=1')).toBe('api.example.com');
    expect(normalizeHost('feeds.bbci.co.uk/news/rss.xml')).toBe('feeds.bbci.co.uk');
    expect(normalizeHost('homeassistant')).toBe('homeassistant');
    expect(normalizeHost('192.168.1.20:8123')).toBe('192.168.1.20');
  });

  it('refuses what is not an address', () => {
    expect(normalizeHost('')).toBe(null);
    expect(normalizeHost('not a host')).toBe(null);
    expect(normalizeHost('under_score.com')).toBe(null);
    expect(normalizeHost('-bad.com')).toBe(null);
    expect(normalizeHost('http://')).toBe(null);
  });
});

describe('addEntries', () => {
  it('splits at commas, spaces and new lines', () => {
    expect(addEntries('a.com, b.org\nc.net  d.io,')).toEqual({ hosts: ['a.com', 'b.org', 'c.net', 'd.io'], invalid: [] });
  });

  it('skips what is already listed and repeats within the paste', () => {
    expect(addEntries('a.com, https://a.com/x, b.org', ['b.org'])).toEqual({ hosts: ['a.com'], invalid: [] });
  });

  it('reports entries that are not addresses', () => {
    expect(addEntries('a.com, bad_host, b.org')).toEqual({ hosts: ['a.com', 'b.org'], invalid: ['bad_host'] });
  });
});
