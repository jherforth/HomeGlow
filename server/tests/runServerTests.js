const path = require('node:path');
const { spawn } = require('node:child_process');
const { cleanupTestArtifacts, tmpDir } = require('./cleanupTestArtifacts');

const isDebug = process.argv.includes('--debug');

function runNodeTests(env) {
    return new Promise((resolve) => {
        const child = spawn(
            process.execPath,
            ['--test', '--test-concurrency=1'],
            {
                cwd: path.resolve(__dirname, '..'),
                stdio: 'inherit',
                env,
            }
        );

        child.on('close', (code) => resolve(code ?? 1));
        child.on('error', () => resolve(1));
    });
}

(async () => {
    const childEnv = { ...process.env };

    if (isDebug) {
        childEnv.HOMEGLOW_TEST_KEEP_ARTIFACTS = '1';
        console.log(`[test-debug] Cleanup disabled; artifacts will be preserved in ${tmpDir}`);
    } else {
        const removedBefore = cleanupTestArtifacts();
        if (removedBefore.length > 0) {
            console.log(`[test-cleanup] Removed ${removedBefore.length} artifact(s) before test run`);
        }
        delete childEnv.HOMEGLOW_TEST_KEEP_ARTIFACTS;
    }

    const exitCode = await runNodeTests(childEnv);

    if (!isDebug) {
        const removedAfter = cleanupTestArtifacts();
        if (removedAfter.length > 0) {
            console.log(`[test-cleanup] Removed ${removedAfter.length} artifact(s) after test run`);
        }
    } else {
        console.log('[test-debug] Leaving artifacts on disk for inspection');
    }

    process.exit(exitCode);
})();
