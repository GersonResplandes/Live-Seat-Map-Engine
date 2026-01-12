// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierpw from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist', 'eslint.config.mjs', 'jest.config.js'],
  },
  // Base Integ
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  
  // Prettier Integ
  {
    plugins: {
      prettier: prettierpw,
    },
    rules: {
      'prettier/prettier': 'error',
    },
  },
  prettierConfig,

  // Custom Rules
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        'no-console': ['warn', { allow: ['info', 'error', 'log'] }], // Allowed log for this specific project as it is a demo
    },
  },
  
  // Files
  {
    files: ['**/*.ts'],
  }
);
