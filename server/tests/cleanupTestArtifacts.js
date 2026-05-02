const fs = require('node:fs');
const path = require('node:path');

const tmpDir = path.resolve(__dirname, '.tmp');

function cleanupTestArtifacts() {
    if (!fs.existsSync(tmpDir)) {
        return [];
    }

    const entries = fs.readdirSync(tmpDir, { withFileTypes: true });
    const removed = [];

    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }

        const fullPath = path.join(tmpDir, entry.name);
        fs.unlinkSync(fullPath);
        removed.push(fullPath);
    }

    return removed;
}

if (require.main === module) {
    const removed = cleanupTestArtifacts();
    console.log(`[test-cleanup] Removed ${removed.length} leftover artifact(s) from ${tmpDir}`);
}

module.exports = {
    cleanupTestArtifacts,
    tmpDir,
};
