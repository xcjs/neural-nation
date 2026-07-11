import antfu from '@antfu/eslint-config';

export default antfu({
  vue: true,
  typescript: true,
  formatters: true,
  stylistic: {
    indent: 2,
    quotes: 'single',
    semi: true,
  },
  rules: {
    'vue/multi-word-component-names': 'off',
    'ts/strict': 'off',
    'no-unused-vars': 'off',
    'ts/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    'prefer-const': 'error',
    'no-console': 'warn',
    'style/eol-last': 'error',
    'ts/no-redeclare': 'off',
  },
  ignores: [
    '.nuxt/**',
    '.output/**',
    '.nitro/**',
    'dist/**',
    'node_modules/**',
    'data/**',
    'coverage/**',
    '*.db',
    'docs/**',
  ],
});
