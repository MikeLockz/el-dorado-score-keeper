import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const basePath = path.resolve(__dirname, '../../../styles/base.scss');

async function loadBase(): Promise<string> {
  return readFile(basePath, 'utf8');
}

describe('base stylesheet', () => {
  it('imports the preflight snapshot', async () => {
    const css = await loadBase();
    expect(css).toContain("@import './generated/preflight.css';");
  });

  it('defines a default focus-visible outline', async () => {
    const css = await loadBase();
    expect(css).toContain(':focus-visible');
    expect(css).toContain('outline: 2px solid var(--color-ring);');
  });

  it('keeps Radix portal stacking overrides', async () => {
    const css = await loadBase();
    expect(css).toContain("[data-slot='dialog-portal']");
    expect(css).toContain('isolation: isolate;');
  });
});
