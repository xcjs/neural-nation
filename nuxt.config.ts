// @ts-expect-error nuxt auto-import
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },

  modules: [
    '@nuxtjs/tailwindcss',
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
      '0 */6 * * *': 'game-cleanup',
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  vite: {
    optimizeDeps: {
      include: [
        'three',
        'three/examples/jsm/postprocessing/EffectComposer.js',
        'three/examples/jsm/postprocessing/RenderPass.js',
        'three/examples/jsm/postprocessing/UnrealBloomPass.js',
        'three/examples/jsm/controls/OrbitControls.js',
        'topojson-client',
        '@modelcontextprotocol/sdk/server/index.js',
        '@modelcontextprotocol/sdk/server/sse.js',
        '@modelcontextprotocol/sdk/types.js',
      ],
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
