import js from '@eslint/js'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'
import ts from 'typescript-eslint'

export default ts.config(
  {
    ignores: ['**/dist/', '**/.wrangler/', '**/worker-configuration.d.ts'],
  },
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: { parser: ts.parser, extraFileExtensions: ['.svelte'] },
    },
  },
  {
    files: ['apps/client/**'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      '*.js',
      '*.config.ts',
      'apps/*/*.config.ts',
      'apps/*/*.config.js',
      'packages/*/*.config.ts',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['packages/sim/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['three', 'three/*', 'svelte', 'svelte/*', 'cloudflare:*'],
              message:
                'packages/sim must stay engine-agnostic: no rendering, UI or Workers imports.',
            },
          ],
        },
      ],
    },
  },
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
)
