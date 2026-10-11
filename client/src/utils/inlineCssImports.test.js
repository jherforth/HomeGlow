import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inlineCssImports } from './inlineCssImports.js';

const paths = { join: path.posix.join, dirname: path.posix.dirname };
const fromFiles = (files) => ({ ...paths, readFile: (p) => files[p] });

describe('inlineCssImports', () => {
  it('replaces a relative import with the file it names', () => {
    const files = { '/s/themes/classic.css': ':root { --hg-x: 1; }' };
    const out = inlineCssImports("@import './themes/classic.css';\n:root { --y: 2; }", '/s/index.css', fromFiles(files));
    expect(out).toBe(':root { --hg-x: 1; }\n:root { --y: 2; }');
  });

  it('follows nested imports relative to each file, once each', () => {
    const files = {
      '/s/a/one.css': "@import '../b/two.css'; .one {}",
      '/s/b/two.css': "@import url('../a/one.css'); .two {}",
    };
    const out = inlineCssImports("@import \"./a/one.css\";", '/s/index.css', fromFiles(files));
    expect(out).toContain('.one {}');
    expect(out).toContain('.two {}');
    expect(out).toContain('already included');
  });

  it('leaves remote and bare imports alone', () => {
    const css = "@import url('https://fonts.example/x.css');\n@import 'pkg/x.css';";
    expect(inlineCssImports(css, '/s/index.css', fromFiles({}))).toBe(css);
  });

  it('gives plugins the real sheet with Classic inside and no imports left', () => {
    const indexCss = fileURLToPath(new URL('../index.css', import.meta.url));
    const real = { readFile: (p) => fs.readFileSync(p, 'utf8'), join: path.join, dirname: path.dirname };
    const out = inlineCssImports(fs.readFileSync(indexCss, 'utf8'), indexCss, real);
    expect(out).not.toMatch(/@import\s+['"]\.\//);
    expect(out).toContain(fs.readFileSync(path.join(path.dirname(indexCss), 'themes/classic.css'), 'utf8').trim().slice(0, 200));
  });
});
