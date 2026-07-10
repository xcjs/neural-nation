import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60000,
    exclude: ['node_modules', '.nuxt', '.output', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'cobertura'],
      reportsDirectory: './coverage',
      include: ['lib/**', 'server/**', 'composables/**', 'stores/**'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/*.config.*'],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['lib/**/*.test.ts', 'server/**/*.test.ts', 'stores/**/*.test.ts', 'composables/**/*.test.ts'],
          poolOptions: {
            forks: { singleFork: true },
          },
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
})