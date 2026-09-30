// ESLint 9+ flat config — modern minimal setup for Vite + TS + Three.js.
// Docs: https://typescript-eslint.io/getting-started
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/**',
      'projects/**',
      'test-results/**',
      'playwright-report/**',
      'scripts/**',
      '.claude/**',
      'coverage/**',
      '.tmp-pw/**',
    ],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.worker,
      },
    },
    rules: {
      // Keep the bar reasonable for an existing codebase — don't be overly strict on day 1.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn', // warn — intentional `any` at WebGPU boundaries
      '@typescript-eslint/no-non-null-assertion': 'off', // codebase uses `!` at three.js boundaries
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // Ambient declaration files: `{}` types are legitimate stubs for untyped
  // three.js WebGPU internals. Downgrade to warn so day-1 lint is green.
  {
    files: ['src/types/**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  // Tests: Playwright + Node smoke scripts. Allow console + node globals.
  {
    files: ['tests/**/*.ts', 'tests/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
  // Vite/Playwright config files: `no-useless-escape` flags `[\/]` in regexes
  // (a deliberate cross-platform idiom). We can't edit these files in this task.
  {
    files: ['vite.config.ts', 'playwright.config.ts'],
    rules: {
      'no-useless-escape': 'off',
    },
  },
  prettierConfig,
)
