import js from '@eslint/js';

export default [
  { ignores: ['node_modules/**', 'coverage/**', 'uploads/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly', fetch: 'readonly' },
    },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
];
