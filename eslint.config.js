import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // `.claude/worktrees` holds full checkouts of this same repo, so without
  // this every file gets linted once per live worktree.
  // Vendored builds are someone else's minified code; their inline
  // eslint-disable comments name plugins this project does not load.
  { ignores: ['dist', '.claude', 'public/vendor', 'skill/*/vendor'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      // A leading underscore marks something deliberately unused —
      // a positional parameter that has to exist, a discarded capture.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-empty': 'warn',
      // CJK character classes deliberately include the ideographic space.
      'no-irregular-whitespace': ['error', { skipRegExps: true }],
      'prefer-const': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
)
