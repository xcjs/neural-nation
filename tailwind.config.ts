import type { Config } from 'tailwindcss'

export default {
  content: [
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './app.vue',
  ],
  theme: {
    extend: {
      colors: {
        holographic: {
          cyan: '#00f0ff',
          teal: '#00b8a9',
          grid: '#0a4a5a',
          glow: '#00d4ff',
        },
        facility: {
          tier1: '#ffd700',
          tier2: '#ff8c00',
          tier3: '#ff4500',
          tier4: '#dc143c',
          infrastructure: '#4169e1',
        },
        earth: {
          ocean: '#0a1929',
          land: '#1a3a2a',
          atmosphere: '#001f3f',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { opacity: '0.6' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config