// Every test that starts the server takes its port from freePort.
//
// The tests used to pick a port at random from a fixed range. When another
// program held that port on 127.0.0.1 (Docker publishes ports there), the
// server still started, on 0.0.0.0, but the test's requests reached the other
// program, and the test waited 30 seconds and failed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const testsDir = __dirname;

function startsServer(source) {
    return /\bPORT\b/.test(source) && /index\.js/.test(source);
}

function portProblems(file, source) {
    const problems = [];
    if (/\d+\s*\+\s*Math\.floor\(Math\.random\(\)/.test(source)) {
        problems.push(`${file}: picks a port at random`);
    }
    if (!/require\('\.\/freePort'\)/.test(source)) {
        problems.push(`${file}: does not take its port from freePort`);
    }
    return problems;
}

test('every test that starts the server takes its port from freePort', () => {
    const files = fs.readdirSync(testsDir)
        .filter((name) => name.endsWith('.test.js') && name !== path.basename(__filename));
    const servers = files.filter((name) => startsServer(fs.readFileSync(path.join(testsDir, name), 'utf8')));
    assert.ok(servers.length >= 10, `found only ${servers.length} tests that start the server`);
    const problems = servers.flatMap((name) => portProblems(name, fs.readFileSync(path.join(testsDir, name), 'utf8')));
    assert.deepEqual(problems, []);
});

test('the check catches a port picked from a range', () => {
    const old = "const port = 7900 + Math.floor(Math.random() * 300);\nspawn('node', ['index.js'], { env: { PORT: String(port) } });";
    assert.equal(startsServer(old), true);
    assert.deepEqual(portProblems('old.test.js', old), [
        'old.test.js: picks a port at random',
        'old.test.js: does not take its port from freePort',
    ]);
});
