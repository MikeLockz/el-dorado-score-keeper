import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import tokens from '../../../styles/tokens.json';

function formatTheme(theme: Record<string, string>): string {
  return Object.entries(theme)
    .map(([token, value]) => `--color-${token}: ${value};`)
    .join('\n');
}

describe('theme emitters', () => {
  it('light theme custom properties align with token snapshot', () => {
    expect(formatTheme(tokens.colors.light)).toMatchInlineSnapshot(
      `"--color-background: oklch(1 0 0);\n--color-foreground: oklch(0.145 0 0);\n--color-card: oklch(1 0 0);\n--color-card-foreground: oklch(0.145 0 0);\n--color-popover: oklch(1 0 0);\n--color-popover-foreground: oklch(0.145 0 0);\n--color-primary: oklch(0.205 0 0);\n--color-primary-foreground: oklch(0.985 0 0);\n--color-secondary: oklch(0.97 0 0);\n--color-secondary-foreground: oklch(0.205 0 0);\n--color-muted: oklch(0.97 0 0);\n--color-muted-foreground: oklch(0.556 0 0);\n--color-accent: oklch(0.97 0 0);\n--color-accent-foreground: oklch(0.205 0 0);\n--color-destructive: oklch(0.577 0.245 27.325);\n--color-destructive-foreground: #ffffff;\n--color-border: oklch(0.922 0 0);\n--color-input: oklch(0.922 0 0);\n--color-ring: oklch(0.708 0 0);\n--color-chart-1: oklch(0.646 0.222 41.116);\n--color-chart-2: oklch(0.6 0.118 184.704);\n--color-chart-3: oklch(0.398 0.07 227.392);\n--color-chart-4: oklch(0.828 0.189 84.429);\n--color-chart-5: oklch(0.769 0.188 70.08);\n--color-sidebar: oklch(0.985 0 0);\n--color-sidebar-foreground: oklch(0.145 0 0);\n--color-sidebar-primary: oklch(0.205 0 0);\n--color-sidebar-primary-foreground: oklch(0.985 0 0);\n--color-sidebar-accent: oklch(0.97 0 0);\n--color-sidebar-accent-foreground: oklch(0.205 0 0);\n--color-sidebar-border: oklch(0.922 0 0);\n--color-sidebar-ring: oklch(0.708 0 0);\n--color-surface-subtle: oklch(0.985 0 0);\n--color-surface-subtle-foreground: oklch(0.305 0 0);\n--color-surface-muted: oklch(0.938 0 0);\n--color-surface-muted-foreground: oklch(0.45 0 0);\n--color-surface-accent: oklch(0.93 0.03 210);\n--color-surface-accent-foreground: oklch(0.24 0.02 210);\n--color-status-locked: oklch(0.9 0.02 260);\n--color-status-locked-foreground: oklch(0.34 0.03 260);\n--color-status-locked-surface: oklch(0.96 0.01 260);\n--color-status-bidding: oklch(0.74 0.16 210);\n--color-status-bidding-foreground: oklch(0.985 0 0);\n--color-status-bidding-surface: oklch(0.88 0.09 210);\n--color-status-playing: oklch(0.7 0.16 275);\n--color-status-playing-foreground: oklch(0.985 0 0);\n--color-status-playing-surface: oklch(0.86 0.09 275);\n--color-status-complete: oklch(0.76 0.21 55);\n--color-status-complete-foreground: oklch(0.34 0.05 55);\n--color-status-complete-surface: oklch(0.9 0.12 55);\n--color-status-scored: oklch(0.56 0.18 140);\n--color-status-scored-foreground: oklch(0.2 0.04 140);\n--color-status-scored-surface: oklch(0.8 0.11 140);"`,
    );
  });

  it('dark theme custom properties align with token snapshot', () => {
    expect(formatTheme(tokens.colors.dark)).toMatchInlineSnapshot(
      `
      "--color-background: oklch(0.145 0 0);
      --color-foreground: oklch(0.985 0 0);
      --color-card: oklch(0.145 0 0);
      --color-card-foreground: oklch(0.985 0 0);
      --color-popover: oklch(0.145 0 0);
      --color-popover-foreground: oklch(0.985 0 0);
      --color-primary: oklch(0.985 0 0);
      --color-primary-foreground: oklch(0.205 0 0);
      --color-secondary: oklch(0.269 0 0);
      --color-secondary-foreground: oklch(0.985 0 0);
      --color-muted: oklch(0.269 0 0);
      --color-muted-foreground: oklch(0.708 0 0);
      --color-accent: oklch(0.269 0 0);
      --color-accent-foreground: oklch(0.985 0 0);
      --color-destructive: oklch(0.396 0.141 25.723);
      --color-destructive-foreground: #ffffff;
      --color-border: oklch(0.269 0 0);
      --color-input: oklch(0.269 0 0);
      --color-ring: oklch(0.439 0 0);
      --color-chart-1: oklch(0.488 0.243 264.376);
      --color-chart-2: oklch(0.696 0.17 162.48);
      --color-chart-3: oklch(0.769 0.188 70.08);
      --color-chart-4: oklch(0.627 0.265 303.9);
      --color-chart-5: oklch(0.645 0.246 16.439);
      --color-sidebar: oklch(0.205 0 0);
      --color-sidebar-foreground: oklch(0.985 0 0);
      --color-sidebar-primary: oklch(0.488 0.243 264.376);
      --color-sidebar-primary-foreground: oklch(0.985 0 0);
      --color-sidebar-accent: oklch(0.269 0 0);
      --color-sidebar-accent-foreground: oklch(0.985 0 0);
      --color-sidebar-border: oklch(0.269 0 0);
      --color-sidebar-ring: oklch(0.439 0 0);
      --color-surface-subtle: oklch(0.22 0 0);
      --color-surface-subtle-foreground: oklch(0.9 0 0);
      --color-surface-muted: oklch(0.28 0 0);
      --color-surface-muted-foreground: oklch(0.83 0 0);
      --color-surface-accent: oklch(0.35 0.03 210);
      --color-surface-accent-foreground: oklch(0.9 0.02 210);
      --color-status-locked: oklch(0.3 0 0);
      --color-status-locked-foreground: oklch(0.87 0 0);
      --color-status-locked-surface: oklch(0.2 0 0);
      --color-status-bidding: oklch(0.55 0.12 210);
      --color-status-bidding-foreground: oklch(0.985 0 0);
      --color-status-bidding-surface: oklch(0.28 0.04 210);
      --color-status-playing: oklch(0.52 0.14 275);
      --color-status-playing-foreground: oklch(0.1 0.02 275);
      --color-status-playing-surface: oklch(0.27 0.05 275);
      --color-status-complete: oklch(0.54 0.16 55);
      --color-status-complete-foreground: oklch(0.1 0.03 55);
      --color-status-complete-surface: oklch(0.28 0.06 55);
      --color-status-scored: oklch(0.52 0.17 150);
      --color-status-scored-foreground: oklch(0.985 0 0);
      --color-status-scored-surface: oklch(0.27 0.07 150);"
    `,
    );
  });

  it('theme emitters delegate to generated mixins', async () => {
    const baseDir = path.resolve(__dirname, '../../../styles/themes');
    const light = await readFile(path.join(baseDir, '_light.scss'), 'utf8');
    const dark = await readFile(path.join(baseDir, '_dark.scss'), 'utf8');

    expect(light).toContain("@include colors.emit-theme('light');");
    expect(dark).toContain("@include colors.emit-theme('dark');");
  });
});
