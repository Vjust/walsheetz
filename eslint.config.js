import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * ESLint Flat Configuration for WalSheetz Monorepo
 *
 * This config enforces:
 * - Package boundary rules (packages can't import from frontend/blockchain)
 * - React best practices
 * - TypeScript type safety
 * - Code style consistency
 */

export default [
  // Base JavaScript recommended rules
  js.configs.recommended,

  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/Sui Ref/**', // Vendored Sui reference docs (not lintable application code)
      '**/*.config.js', // Config files can be flexible
    ],
  },

  // TypeScript files configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // Disable base rules that conflict with TypeScript - TS compiler handles these
      'no-undef': 'off',
      'no-unused-vars': 'off',
      // Allow unused vars with underscore prefix
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // JavaScript/JSX files configuration
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // React configuration
      'react/react-in-jsx-scope': 'off', // Not needed with React 17+
      'react/prop-types': 'off', // Using TypeScript for prop validation

      // Code style
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },

  // Package boundary enforcement for SDK packages
  {
    files: ['packages/**/*.{js,jsx,ts,tsx}'],
    rules: {
      // Prevent packages from importing from app-specific directories
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/frontend/**', '../frontend/**', '../../frontend/**'],
              message:
                'Packages should not import from frontend/. Use proper package exports instead.',
            },
            {
              group: ['**/apps/**', '../apps/**', '../../apps/**'],
              message: 'Packages should not import from apps/. Packages must be standalone.',
            },
            {
              group: ['**/scripts/**', '../scripts/**', '../../scripts/**'],
              message:
                'Packages should not import from scripts/. Extract to packages/shared if needed.',
            },
          ],
        },
      ],
    },
  },

  // Frontend-specific rules
  {
    files: ['frontend/**/*.{js,jsx,ts,tsx}'],
    ignores: ['frontend/lib/**/*.{js,jsx,ts,tsx}'],
    rules: {
      // Enforce use of Vite aliases instead of relative imports for cross-directory imports
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../../*', '../../*'],
              message:
                'Use Vite import aliases (@app, @features, @shared, @services, @utils, @adapters) instead of deep relative imports.',
            },
            {
              group: ['packages/*/src/*', '**/packages/*/src/*'],
              message:
                'Import from package exports (e.g., @dreamlit/walrus) instead of package source files.',
            },
            {
              group: ['*.jsx'],
              message:
                'Do not use .jsx extension in imports. Use extensionless imports for TypeScript resolution.',
            },
          ],
        },
      ],
    },
  },

  // Frontend lib - internal module, allow relative imports within it
  {
    files: ['frontend/lib/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['packages/*/src/*', '**/packages/*/src/*'],
              message:
                'Import from package exports (e.g., @dreamlit/walrus) instead of package source files.',
            },
            {
              group: ['*.jsx'],
              message:
                'Do not use .jsx extension in imports. Use extensionless imports for TypeScript resolution.',
            },
          ],
        },
      ],
    },
  },

  // SDK integration files - external SDK types are complex, allow any
  {
    files: [
      'packages/walrus-sui-core/src/**/*.ts',
      'packages/walrus/src/**/*.ts',
      'packages/subwallet/src/**/*.ts',
      'packages/shared/src/types/**/*.ts',
      'frontend/lib/spreadsheet/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Type definition files - external library interfaces
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Test files - more lenient rules
  {
    files: [
      '**/*.test.{js,jsx,ts,tsx}',
      '**/__tests__/**/*.{js,jsx,ts,tsx}',
      'tests/**/*.{js,jsx,ts,tsx}',
    ],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // Scripts - more lenient rules
  {
    files: ['scripts/**/*.{js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },

  // E2E fixtures - Playwright uses 'use' function, not React hooks
  {
    files: ['tests/e2e/fixtures/**/*.{js,ts}'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
];
