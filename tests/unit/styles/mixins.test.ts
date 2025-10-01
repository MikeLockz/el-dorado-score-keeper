import { describe, expect, it } from 'vitest';
import path from 'path';
import { compileString } from 'sass';

const stylesDir = path.resolve(__dirname, '../../../styles');

function compile(scss: string): string {
  const result = compileString(scss, {
    loadPaths: [stylesDir],
  });
  return result.css.toString();
}

describe('styles mixins', () => {
  it('respond mixin emits a min-width media query', () => {
    const css = compile(
      [
        "@use 'mixins' as mixins;",
        '',
        '.card {',
        '  @include mixins.respond(md) {',
        '    color: red;',
        '  }',
        '}',
      ].join('\n'),
    );

    expect(css).toContain('@media (min-width: 48rem)');
    expect(css).toContain('.card');
    expect(css).toContain('color: red;');
  });

  it('respond-down mixin emits a max-width media query', () => {
    const css = compile(
      [
        "@use 'mixins' as mixins;",
        '',
        '.card {',
        '  @include mixins.respond-down(lg) {',
        '    display: none;',
        '  }',
        '}',
      ].join('\n'),
    );

    expect(css).toContain('@media (max-width: calc(64rem - 0.02rem))');
    expect(css).toContain('display: none;');
  });

  it('typography heading mixin applies shared font tokens', () => {
    const css = compile(
      [
        "@use 'mixins' as mixins;",
        '',
        '.heading {',
        "  @include mixins.heading('heading-sm');",
        '}',
      ].join('\n'),
    );

    expect(css).toContain('font-family: var(--font-sans);');
    expect(css).toContain('font-size: 1.25rem;');
    expect(css).toContain('letter-spacing: -0.005em;');
  });

  it('focus-ring mixin applies outline styling', () => {
    const css = compile(
      [
        "@use 'mixins' as mixins;",
        '',
        '.button:focus-visible {',
        '  @include mixins.focus-ring();',
        '}',
      ].join('\n'),
    );

    expect(css).toContain('outline: 2px solid var(--color-ring);');
    expect(css).toContain('outline-offset: 2px;');
  });

  it('flex-center mixin aligns items and supports gap tokens', () => {
    const css = compile(
      [
        "@use 'mixins' as mixins;",
        '',
        '.actions {',
        "  @include mixins.flex-center(row, 'space-6');",
        '}',
      ].join('\n'),
    );

    expect(css).toContain('display: flex;');
    expect(css).toContain('flex-direction: row;');
    expect(css).toContain('justify-content: center;');
    expect(css).toContain('gap: 1.5rem;');
  });
});
