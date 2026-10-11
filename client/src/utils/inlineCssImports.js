// Plugins link one stylesheet, `/index.css`, for the theme variables. The
// source sheet pulls Classic's tokens in with `@import './themes/classic.css'`,
// and nothing serves that path, so each plugin frame asked for it and got a
// 404 (and no Classic tokens). Serving the sheet with its local imports
// inlined gives plugins one complete file.
//
// Only relative imports (`./` or `../`) are inlined; anything else is left as
// written. `readFile(path)` returns a file's text; `join(dir, rel)` and
// `dirname(path)` are path helpers, passed in so this stays free of Node.

const LOCAL_IMPORT = /@import\s+(?:url\()?\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)?\s*;/g;

export function inlineCssImports(css, file, { readFile, join, dirname }, seen = new Set([file])) {
  return css.replace(LOCAL_IMPORT, (_, rel) => {
    const target = join(dirname(file), rel);
    if (seen.has(target)) return `/* ${rel}: already included */`;
    seen.add(target);
    return inlineCssImports(readFile(target), target, { readFile, join, dirname }, seen);
  });
}
