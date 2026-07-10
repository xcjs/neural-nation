import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 120000,
    exclude: ['node_modules', '.nuxt', '.output', 'dist'],
    hookTimeout: 120000,
    setupFiles: ['./test/setup.ts'],
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
          include: ['lib/**/*.test.ts', 'server/**/*.test.ts', 'stores/**/*.test.ts', 'composables/**/*.test.ts'],
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
