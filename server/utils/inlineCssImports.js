// The stylesheet plugins link as /index.css pulls Classic's tokens in with
// `@import './themes/classic.css'`, a path nothing serves to a plugin frame.
// Inline relative imports so the sheet arrives whole. The production build
// does the same (client/src/utils/inlineCssImports.js); this is for
// `npm run dev`, where the backend answers /index.css from the source tree.
const fs = require('fs/promises');
const path = require('path');

const LOCAL_IMPORT = /@import\s+(?:url\()?\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)?\s*;/g;

async function inlineCssImports(css, file, seen = new Set([file])) {
    const parts = [];
    let last = 0;
    for (const match of css.matchAll(LOCAL_IMPORT)) {
        parts.push(css.slice(last, match.index));
        const target = path.join(path.dirname(file), match[1]);
        if (seen.has(target)) {
            parts.push(`/* ${match[1]}: already included */`);
        } else {
            seen.add(target);
            parts.push(await inlineCssImports(await fs.readFile(target, 'utf-8'), target, seen));
        }
        last = match.index + match[0].length;
    }
    parts.push(css.slice(last));
    return parts.join('');
}

module.exports = { inlineCssImports };
