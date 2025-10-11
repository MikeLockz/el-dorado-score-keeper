#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

/**
 * Format staged files with Prettier and restage them so that commits always
 * contain formatted changes.
 */
function getStagedFiles() {
  const result = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.stdout
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);
}

function runPrettier(files) {
  const result = spawnSync(
    'pnpm',
    ['exec', 'prettier', '--ignore-unknown', '--log-level', 'warn', '--cache', '--write', ...files],
    { stdio: 'inherit' },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function restageFiles(files) {
  const result = spawnSync('git', ['add', ...files], { stdio: 'inherit' });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const stagedFiles = getStagedFiles();

if (stagedFiles.length === 0) {
  process.exit(0);
}

runPrettier(stagedFiles);
restageFiles(stagedFiles);
