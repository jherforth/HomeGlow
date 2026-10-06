import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const srcDir = join(__dirname, '..');
const classic = readFileSync(join(__dirname, 'classic.css'), 'utf8');

// Event pills derive their colors from the event's own color, so they are data.
const EXEMPT = new Set(['utils/colorContrast.js']);

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(jsx?|css)$/.test(name) && !name.includes('.test.') ? [path] : [];
  });
}

const files = sourceFiles(srcDir)
  .map((path) => ({ rel: relative(srcDir, path), text: readFileSync(path, 'utf8') }))
  .filter(({ rel }) => !rel.startsWith('themes/') && !EXEMPT.has(rel));

describe('Classic tokens', () => {
  it('keeps translucent black and white in the theme, not in components', () => {
    const literal = /rgba\(\s*(0|255)\s*,\s*\1\s*,\s*\1\s*,/;
    const offenders = files.filter(({ text }) => literal.test(text)).map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });

  it('defines every --hg-* token the app uses', () => {
    const defined = new Set([...classic.matchAll(/(--hg-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const used = new Set(files.flatMap(({ text }) => [...text.matchAll(/var\((--hg-[a-z0-9-]+)/g)].map((m) => m[1])));
    expect([...used].filter((name) => !defined.has(name))).toEqual([]);
    expect(used.size).toBeGreaterThan(0);
  });
});
