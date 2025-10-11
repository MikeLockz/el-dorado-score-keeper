#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function isGitRepository() {
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    stdio: 'ignore',
  });
  return result.status === 0;
}

if (!isGitRepository()) {
  process.exit(0);
}

const result = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
  stdio: 'ignore',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
