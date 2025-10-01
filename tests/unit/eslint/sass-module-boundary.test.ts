import { describe, it } from 'vitest';
import tsParser from '@typescript-eslint/parser';
import path from 'path';
import { RuleTester } from 'eslint';
import plugin from '../../../eslint/rules/sass-module-boundary.mjs';

const rule = plugin.rules['no-external-import'];

RuleTester.it = it;
RuleTester.itOnly = it.only;
RuleTester.itSkip = it.skip;
RuleTester.describe = describe;
const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
  },
});

const filename = path.join(process.cwd(), 'components/Button/Button.tsx');

ruleTester.run('sass-boundary/no-external-import', rule, {
  valid: [
    {
      filename,
      code: "import styles from './Button.module.scss';",
    },
    {
      filename,
      code: "const styles = require('./Button.module.scss');",
    },
  ],
  invalid: [
    {
      filename,
      code: "import styles from '../shared/Button.module.scss';",
      errors: [{ messageId: 'sibling' }],
    },
    {
      filename,
      code: "import styles from '@/components/Button/Button.module.scss';",
      errors: [{ messageId: 'relative' }],
    },
  ],
});
