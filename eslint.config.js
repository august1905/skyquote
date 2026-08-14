import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// Two TS projects, so two lint blocks with explicit `project` paths rather
// than a single `projectService` — src is browser code checked by
// tsconfig.json, while the configs and Playwright specs are Node code checked
// by tsconfig.node.json. A file belonging to neither is a parse error, which
// is the behavior we want: it means something was added without being
// type-checked at all.
export default tseslint.config(
  { ignores: ['dist', 'playwright-report', 'test-results'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      // Type-aware linting, not just syntax — catches floating promises and
      // unsafe `any` flowing through the block tree, which is most of the
      // reason for adopting TypeScript here in the first place.
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: { react: { version: '18.3' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/jsx-no-target-blank': 'off',
      // Props are typed now, so the plugin's own prop validation is redundant
      // and produces false positives against TS-only prop types.
      'react/prop-types': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ['vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'tests/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: './tsconfig.node.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // The flat-config file itself is plain JS and outside both TS projects.
    files: ['eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
)
