// @ts-check
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.node,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs['recommended-type-checked'].rules,
      // Blocking: no console calls in production source code (AC-NFR-1)
      'no-console': 'error',
      // Allow _-prefixed parameters that must be declared but are intentionally unused
      // (e.g. Express 4-arg error handlers require the next param even when not called).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Prevent direct imports of infrastructure modules outside their owners
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pg', 'pg/*'],
              message: 'Only src/db/ may import pg. Use query(), ping(), getPool(), shutdown() from src/db/.',
            },
            {
              group: ['pino', 'pino/*', 'pino-http', 'pino-http/*'],
              message: 'Only src/logger/ may import pino. Use getLogger() or the logger singleton from src/logger/.',
            },
            {
              group: ['dotenv', 'dotenv/*'],
              message: 'Only src/config/ may import dotenv.',
            },
          ],
        },
      ],
    },
  },
  {
    // src/config/ is the sole owner of dotenv — override the restriction here
    files: ['src/config/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pg', 'pg/*'],
              message: 'Only src/db/ may import pg. Use query(), ping(), getPool(), shutdown() from src/db/.',
            },
            {
              group: ['pino', 'pino/*', 'pino-http', 'pino-http/*'],
              message: 'Only src/logger/ may import pino. Use getLogger() or the logger singleton from src/logger/.',
            },
          ],
        },
      ],
    },
  },
  {
    // src/db/ is the sole owner of pg
    files: ['src/db/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pino', 'pino/*', 'pino-http', 'pino-http/*'],
              message: 'Only src/logger/ may import pino. Use getLogger() or the logger singleton from src/logger/.',
            },
            {
              group: ['dotenv', 'dotenv/*'],
              message: 'Only src/config/ may import dotenv.',
            },
          ],
        },
      ],
    },
  },
  {
    // src/logger/ is the sole owner of pino
    files: ['src/logger/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pg', 'pg/*'],
              message: 'Only src/db/ may import pg. Use query(), ping(), getPool(), shutdown() from src/db/.',
            },
            {
              group: ['dotenv', 'dotenv/*'],
              message: 'Only src/config/ may import dotenv.',
            },
          ],
        },
      ],
    },
  },
  {
    // Tests may use console (for debugging) and have relaxed import rules
    files: ['tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.node,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs['recommended-type-checked'].rules,
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // supertest res.body is typed as `any`; these rules produce false positives in tests.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  // Prettier must come last to disable conflicting formatting rules
  prettierConfig,
];
