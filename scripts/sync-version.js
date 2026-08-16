#!/usr/bin/env node
/**
 * Copies the version from package.json into src/index.js.
 *
 * The browser build cannot read package.json at runtime, so the version has to
 * be literal in the source — which means two places that can drift. This runs
 * from npm's `version` lifecycle (after the bump, before the commit) so the
 * bump is always carried across, and `scripts/test.js` asserts the two agree so
 * a hand-edit can never slip through.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = path.join(ROOT, 'src/index.js');
const VERSION_RE = /^(export const version = ')([^']*)(';)$/m;

const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const source = fs.readFileSync(ENTRY, 'utf8');

if (!VERSION_RE.test(source)) {
  console.error('sync-version: could not find `export const version = ...` in src/index.js');
  process.exit(1);
}

const updated = source.replace(VERSION_RE, `$1${version}$3`);
if (updated === source) {
  console.log(`version already ${version}`);
} else {
  fs.writeFileSync(ENTRY, updated);
  console.log(`src/index.js -> ${version}`);
}

// Rebuild so dist/ carries the new version, then stage both for the tag commit.
execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.js')], { cwd: ROOT, stdio: 'inherit' });
try {
  execFileSync('git', ['add', 'src/index.js', 'dist'], { cwd: ROOT, stdio: 'inherit' });
} catch {
  // Not a git checkout, or nothing staged — neither is worth failing over.
}
