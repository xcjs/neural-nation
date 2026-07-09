// @ts-expect-error nuxt auto-import
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },

  modules: [
    '@pinia/nuxt',
  ],

  css: ['~/assets/css/main.css'],

  alias: {
    '~': __dirname,
    '~~': __dirname,
    '@': __dirname,
  },

  app: {
    head: {
      title: 'Neural Nation',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Watch an LLM build an industrial economy on a 3D earth.' },
      ],
    },
  },

  nitro: {
    experimental: {
      tasks: true,
    },
    scheduledTasks: {
      'game-cleanup': {
        cron: '0 */6 * * *',
      },
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  tailwindcss: {
    cssPath: '~/assets/css/main.css',
    configPath: '~/tailwind.config.ts',
  },

  vite: {
    optimizeDeps: {
      include: ['three'],
    },
  },

  runtimeConfig: {
    gameCleanupEnabled: true,
    gameCleanupAgeDays: 7,
    gameCleanupGraceDays: 1,
    gameCleanupIntervalHours: 6,
  },

  future: {
    compatibilityVersion: 4,
  },
})