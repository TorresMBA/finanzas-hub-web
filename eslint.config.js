// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const boundaries = require('eslint-plugin-boundaries');

/** @param {string[]} types */
const elements = (types) => ({ to: { element: { types: { anyOf: types } } } });

module.exports = defineConfig([
  {
    // Generated from docs/api/openapi.v1.json by "npm run api:generate".
    ignores: ['src/app/core/api/schema.ts'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    // Architecture of src/app (docs/architecture/frontend.md):
    //   core     singletons without UI          -> core
    //   shared   reusable UI without business   -> shared
    //   layout   the application frame          -> layout, shared, core
    //   features one folder per section         -> its own folder, shared, core
    // A feature never imports another feature; they meet only in the router.
    files: ['src/app/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { node: { extensions: ['.ts'] } },
      'boundaries/elements': [
        { type: 'core', pattern: 'src/app/core' },
        { type: 'shared', pattern: 'src/app/shared' },
        { type: 'layout', pattern: 'src/app/layout' },
        { type: 'feature', pattern: 'src/app/features/*', capture: ['feature'] },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            { from: { element: { type: 'core' } }, allow: elements(['core']) },
            { from: { element: { type: 'shared' } }, allow: elements(['shared']) },
            { from: { element: { type: 'layout' } }, allow: elements(['layout', 'shared', 'core']) },
            { from: { element: { type: 'feature' } }, allow: elements(['shared', 'core']) },
            {
              from: { element: { type: 'feature' } },
              allow: { to: { element: { type: 'feature', captured: { feature: '{{ from.element.captured.feature }}' } } } },
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
