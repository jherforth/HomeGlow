// Backups are .tar.gz archives made and read with the system `tar`.
//
// Paths are handed to tar relative to its working directory, never as
// absolute ones: GNU tar reads "C:\\..." as host "C" (a remote archive), so
// on Windows a run with Git's tar first on the PATH failed with "Cannot
// connect to C: resolve failed". Relative paths with forward slashes work
// with GNU tar and bsdtar alike, on every platform.
const path = require('path');
const { execFileSync } = require('child_process');

// `target` as tar should see it from `cwd`.
function relativeTo(cwd, target) {
  const rel = path.relative(cwd, target);
  // On another drive there is no relative path; tar gets what there is.
  return (path.isAbsolute(rel) ? target : rel || '.').split(path.sep).join('/');
}

/** Pack the contents of `sourceDir` into the gzip archive `archivePath`. */
function createArchive(archivePath, sourceDir) {
  execFileSync('tar', ['-czf', relativeTo(sourceDir, archivePath), '.'], { cwd: sourceDir });
}

/** Unpack `archivePath` into `destDir`, or only `members` of it. */
function extractArchive(archivePath, destDir, members = []) {
  execFileSync('tar', ['-xzf', relativeTo(destDir, archivePath), ...members], { cwd: destDir });
}

module.exports = { createArchive, extractArchive };
