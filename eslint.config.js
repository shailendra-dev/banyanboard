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
    },
  },
  // Prettier must come last to disable conflicting formatting rules
  prettierConfig,
];
