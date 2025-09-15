import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function scan(dir: string, predicate: (p: string) => boolean): string[] {
  const out: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const pth = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...scan(pth, predicate));
    else if (predicate(pth)) out.push(pth);
  }
  return out;
}

describe('adapter usage guard (spot-check)', () => {
  it('no direct state.players reads in single-player pages/components', () => {
    const roots = ['components/views/SinglePlayerMobile.tsx'];
    const offenders: string[] = [];
    for (const r of roots) {
      const p = path.resolve(process.cwd(), r);
      if (!fs.existsSync(p)) continue;
      const files = fs.statSync(p).isDirectory()
        ? scan(p, (f) => f.endsWith('.ts') || f.endsWith('.tsx'))
        : [p];
      for (const f of files) {
        const src = fs.readFileSync(f, 'utf8');
        if (src.includes('state.players')) offenders.push(path.relative(process.cwd(), f));
      }
    }
    expect(offenders).toEqual([]);
  });
});
