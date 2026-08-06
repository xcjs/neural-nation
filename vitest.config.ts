import process from 'node:process';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// Tests that open better-sqlite3 Database handles leak Statement JS wrappers
// that crash Node 24 worker V8 teardown (RemoveEnvironmentCleanupHook assertion).
// Skipped in CI (NN_RUN_HEAVY unset); run locally with NN_RUN_HEAVY=1.
const heavyDbTests = [
  'server/api/api.test.ts',
  'server/domains/game/simulation-core.test.ts',
  'server/domains/game/simulation-chain.test.ts',
  'server/domains/mcp/flow.test.ts',
  'server/domains/mcp/validation.test.ts',
  'server/domains/power/Ticks/PowerTick.test.ts',
  'server/domains/resources/Ticks/RegenTick.test.ts',
  'server/domains/humanity/Ticks/PopulationTick.test.ts',
  'scripts/lib/mcs-seed.test.ts',
  'scripts/lib/renewables-seed.test.ts',
];
const ciExclude = process.env.NN_RUN_HEAVY ? [] : heavyDbTests;

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 120000,
    exclude: ['node_modules', '.nuxt', '.output', 'dist', ...ciExclude],
    hookTimeout: 120000,
    setupFiles: ['./test/setup.ts'],
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'cobertura'],
      reportsDirectory: './coverage',
      include: ['lib/**', 'server/**', 'composables/**', 'stores/**'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/*.config.*'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['lib/**/*.test.ts', 'server/**/*.test.ts', 'stores/**/*.test.ts', 'composables/**/*.test.ts', 'workers/**/*.test.ts', 'scripts/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'components',
          environment: 'happy-dom',
          include: ['components/**/*.test.ts'],
        },
        plugins: [vue()],
      },
    ],
    alias: {
      '~': fileURLToPath(new URL('.', import.meta.url)),
      '~~': fileURLToPath(new URL('.', import.meta.url)),
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
