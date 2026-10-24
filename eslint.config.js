// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    rules: {
      // The new react-hooks refs heuristic doesn't understand React Native
      // idioms: PanResponder callbacks and event-owned ref brokers read and
      // write refs outside the render phase by design.
      'react-hooks/refs': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      globals: { Buffer: 'readonly' },
    },
  },
]);
