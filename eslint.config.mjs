// path: eslint.config.mjs
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const NON_ASCII = '[^\\x00-\\x7F]';

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'public/**',
      'docs/**',
      'supabase/**',
      'next-env.d.ts',
      'scripts/**/*.mjs',
      '*.config.js',
      '*.config.mjs',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
        },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'react/no-danger': 'error',
      eqeqeq: ['error', 'always'],
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=/${NON_ASCII}/]`,
          message: 'Only English (ASCII) text is allowed in source files.',
        },
        {
          selector: `TemplateElement[value.raw=/${NON_ASCII}/]`,
          message: 'Only English (ASCII) text is allowed in source files.',
        },
        {
          selector: `JSXText[value=/${NON_ASCII}/]`,
          message: 'Only English (ASCII) text is allowed in source files.',
        },
        {
          selector: "AssignmentExpression[left.property.name='innerHTML']",
          message: 'Do not assign innerHTML. Use sanitized React rendering.',
        },
        {
          selector: "AssignmentExpression[left.property.name='outerHTML']",
          message: 'Do not assign outerHTML. Use sanitized React rendering.',
        },
      ],
    },
  },
  { files: ['lib/logger/sink.ts'], rules: { 'no-console': 'off' } },
  {
    files: ['components/shared/safe-html.tsx', 'components/shared/theme-init-script.tsx'],
    rules: { 'react/no-danger': 'off' },
  },
];

export default config;
