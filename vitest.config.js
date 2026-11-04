import { configDefaults, defineConfig } from 'vitest/config';

// This is a Node built-in test suite, run separately with npm run compat:selftest.
// Vitest discovers *.test.mjs by default but cannot collect node:test tests.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'tests/legacy-first-compatibility.node.test.mjs'],
  },
});
