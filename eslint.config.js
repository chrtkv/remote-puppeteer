import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

export default [
  ...tseslint.configs.recommended,
  stylistic.configs.all,
  {
    files: ['**/*.ts', '**/*.js'],
  },
  {
    ignores: ['node_modules'],
  },
  {
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      '@stylistic/indent': ['error', 2],
      '@stylistic/quotes': ['error', 'single'],
      '@stylistic/array-element-newline': [
        'error',
        {
          multiline: true,
          minItems: 4,
        },
      ],
      '@stylistic/padded-blocks': ['error', 'never'],
      '@stylistic/comma-dangle': [
        'error',
        {
          arrays: 'always-multiline',
          objects: 'always-multiline',
          imports: 'always-multiline',
          exports: 'always-multiline',
          functions: 'always-multiline',
        },
      ],
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/function-call-argument-newline': ['error', 'never'],
      '@stylistic/quote-props': ['error', 'as-needed'],
      '@stylistic/space-before-function-paren': [
        'error',
        {
          anonymous: 'always',
          named: 'never',
          asyncArrow: 'always',
        },
      ],
      '@stylistic/multiline-ternary': 'off',
    },
  },
];
