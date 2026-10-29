import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'public/**',
      'dist/**',
      'coverage/**',
      '**/*.min.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
    rules: {
      // Warn instead of error on unused variables, and ignore variables/params starting with underscore (_)
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_|^err|^e',
        },
      ],
      // Allow console.log/error in backend Node applications
      'no-console': 'off',
      // Allow empty catch blocks if documented
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
];
