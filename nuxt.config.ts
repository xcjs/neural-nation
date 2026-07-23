import pkg from './package.json' with { type: 'json' };

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
      htmlAttrs: { lang: 'en' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Can AI make the world a better place? Watch an LLM autonomously build an industrial economy on a 3D Earth.' },
        { name: 'theme-color', content: '#021628' },
        { property: 'og:title', content: 'Neural Nation' },
        { property: 'og:description', content: 'Can AI make the world a better place? Watch an LLM autonomously build an industrial economy on a 3D Earth.' },
        { property: 'og:type', content: 'website' },
        { property: 'og:image', content: '/logo.png' },
        { property: 'og:site_name', content: 'Neural Nation' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'Neural Nation' },
        { name: 'twitter:description', content: 'Can AI make the world a better place? Watch an LLM autonomously build an industrial economy on a 3D Earth.' },
        { name: 'twitter:image', content: '/logo.png' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
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
        '@modelcontextprotocol/sdk/client/index.js',
        '@modelcontextprotocol/sdk/client/sse.js',
        '@modelcontextprotocol/sdk/types.js',
      ],
    },
    worker: {
      format: 'es',
    },
  },

  runtimeConfig: {
    public: {
      version: pkg.version,
    },
    gameCleanupEnabled: true,
    gameCleanupAgeDays: 7,
    gameCleanupGraceDays: 1,
    gameCleanupIntervalHours: 6,
  },

  future: {
    compatibilityVersion: 4,
  },
});
