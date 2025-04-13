import stylisticJs from '@stylistic/eslint-plugin-js';

export default [
  stylisticJs.configs.all,
  {
    files: ['**/*.js'],
  },
  {
    plugins: {
      '@stylistic/js': stylisticJs,
    },
    rules: {
      '@stylistic/js/indent': ['error', 2],
      '@stylistic/js/quotes': ['error', 'single'],
      '@stylistic/js/array-element-newline': [
        'error',
        {
          multiline: true,
          minItems: 3,
        },
      ],
      '@stylistic/js/padded-blocks': ['error', 'never'],
      '@stylistic/js/comma-dangle': [
        'error',
        {
          arrays: 'always-multiline',
          objects: 'always-multiline',
          imports: 'always-multiline',
          exports: 'always-multiline',
          functions: 'always-multiline',
        },
      ],
      '@stylistic/js/object-curly-spacing': ['error', 'always'],
      '@stylistic/js/function-call-argument-newline': ['error', 'never'],
      '@stylistic/js/quote-props': ['error', 'as-needed'],
    },
  },
];
