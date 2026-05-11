import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/weekly/**/*.test.ts', 'src/lib/weekly*.test.ts', 'src/types/weekly*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
