// Completeness check for translations (issue #137).
//
// English is the source of truth: every key under locales/en must exist in
// every other language, with no extra keys that English does not have. Run in
// CI so a new English string can't silently ship as untranslated text in
// another language.
//
//   node scripts/checkTranslations.js          report and exit non-zero on gaps
//   node scripts/checkTranslations.js --report  report only, always exit 0
const fs = require('node:fs');
const path = require('node:path');

const localesDir = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const reportOnly = process.argv.includes('--report');

// Flatten to dotted paths so nesting differences show up as key differences.
const flatten = (obj, prefix = '') => {
  const out = [];
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) out.push(...flatten(value, full));
    else out.push(full);
  }
  return out;
};

const readNamespace = (lang, ns) => {
  const file = path.join(localesDir, lang, `${ns}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};

const languages = fs.readdirSync(localesDir).filter((d) => fs.statSync(path.join(localesDir, d)).isDirectory());
if (!languages.includes('en')) {
  console.error('No English locale found; nothing to compare against.');
  process.exit(1);
}
const namespaces = fs.readdirSync(path.join(localesDir, 'en'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace('.json', ''));

let problems = 0;
for (const lang of languages.filter((l) => l !== 'en')) {
  const missingAll = [];
  const extraAll = [];
  for (const ns of namespaces) {
    const english = flatten(readNamespace('en', ns));
    const translated = readNamespace(lang, ns);
    if (translated === null) {
      missingAll.push(`${ns}.json (whole file)`);
      continue;
    }
    const theirs = new Set(flatten(translated));
    for (const key of english) if (!theirs.has(key)) missingAll.push(`${ns}:${key}`);
    const mine = new Set(english);
    for (const key of theirs) if (!mine.has(key)) extraAll.push(`${ns}:${key}`);
  }

  const total = namespaces.reduce((sum, ns) => sum + flatten(readNamespace('en', ns)).length, 0);
  const done = total - missingAll.length;
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);
  console.log(`\n${lang}: ${done}/${total} keys (${pct}%)`);

  if (missingAll.length) {
    problems += missingAll.length;
    console.log(`  missing (${missingAll.length}):`);
    for (const key of missingAll.slice(0, 25)) console.log(`    - ${key}`);
    if (missingAll.length > 25) console.log(`    ... and ${missingAll.length - 25} more`);
  }
  if (extraAll.length) {
    problems += extraAll.length;
    console.log(`  not in English — stale or misspelled (${extraAll.length}):`);
    for (const key of extraAll.slice(0, 25)) console.log(`    - ${key}`);
  }
  if (!missingAll.length && !extraAll.length) console.log('  complete');
}

if (problems && !reportOnly) {
  console.error(`\n${problems} translation problem(s). Add the missing keys, or run with --report to just see the gaps.`);
  process.exit(1);
}
console.log('\nTranslation check passed.');
