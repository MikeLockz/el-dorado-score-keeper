import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { compileString } from 'sass';

let compiledCss: string;

beforeAll(async () => {
  const filePath = path.resolve(__dirname, '../../styles/global.scss');
  const source = await readFile(filePath, 'utf8');
  const result = compileString(source, {
    loadPaths: [path.resolve(__dirname, '../../styles')],
  });
  compiledCss = result.css.toString();
});

describe('global styles', () => {
  it('defines CSS custom properties for both themes', () => {
    expect(compiledCss).toContain(':root {');
    expect(compiledCss).toContain('--color-background');
    expect(compiledCss).toContain(':root[data-theme=dark]');
  });

  it('keeps legacy short aliases mapped to semantic variables', () => {
    expect(compiledCss).toContain('--background: var(--color-background);');
    expect(compiledCss).toContain('--foreground: var(--color-foreground);');
  });
});
