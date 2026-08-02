import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/unit/**/*.test.js',
      'tests/integration/**/*.integration.test.js',
    ],
    environment: 'node',
  },
});
