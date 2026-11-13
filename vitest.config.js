import { defineConfig } from 'vitest/config';
export default defineConfig({test:{env:{JWT_ACCESS_SECRET:'unit-test-access-only-32-characters-long',JWT_REFRESH_SECRET:'unit-test-refresh-only-32-characters-long'}}});
