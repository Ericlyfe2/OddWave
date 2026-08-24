import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
    // Tests run against a real Postgres database (Neon), not a mock — network
    // round-trips routinely exceed vitest's 5s default, and every test file's
    // `beforeEach` does broad `deleteMany()` sweeps across shared tables, so
    // running test files concurrently lets one file's cleanup race another
    // file's in-flight writes. Both settings trade test-run speed for
    // determinism, which matters more here than shaving a few seconds.
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
