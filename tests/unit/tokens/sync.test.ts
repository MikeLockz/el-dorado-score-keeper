import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { syncTokens } from '../../../scripts/tokens/sync';

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), 'tokens-sync-'));
});

describe('tokens sync script', () => {
  it('writes all artifacts on first run', async () => {
    const result = await syncTokens({ root: tempRoot, mode: 'sync' });

    expect(result.stale).toEqual([]);
    expect(result.wrote).toContain('styles/tokens/_colors.scss');
    expect(result.wrote).toContain('styles/tokens/_spacing.scss');
    expect(result.wrote).toContain('styles/tokens/_radii.scss');
    expect(result.wrote).toContain('styles/tokens/_typography.scss');
    expect(result.wrote).toContain('.cache/tokens.hash');
    expect(result.hash.length).toBeGreaterThan(10);
  });

  it('skips writing when artifacts are up to date', async () => {
    await syncTokens({ root: tempRoot, mode: 'sync' });
    const secondRun = await syncTokens({ root: tempRoot, mode: 'sync' });

    expect(secondRun.wrote).toEqual([]);
    expect(secondRun.stale).toEqual([]);
  });

  it('flags drift in check mode', async () => {
    await syncTokens({ root: tempRoot, mode: 'sync' });

    const colorsPath = path.join(tempRoot, 'styles/tokens/_colors.scss');
    const original = await readFile(colorsPath, 'utf8');
    await writeFile(colorsPath, `${original}\n/* mutate */\n`, 'utf8');

    const check = await syncTokens({ root: tempRoot, mode: 'check' });

    expect(check.stale).toContain('styles/tokens/_colors.scss');
    expect(check.stale).toContain('.cache/tokens.hash');
  });
});
