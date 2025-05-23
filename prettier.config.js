module.exports = {
  arrowParens: 'avoid',
  bracketSpacing: true,
  htmlWhitespaceSensitivity: 'css',
  insertPragma: false,
  bracketSameLine: false,
  jsxSingleQuote: true,
  singleQuote: true,
  // Preserve existing newlines
  endOfLine: 'auto',
  printWidth: 120,
  proseWrap: 'preserve',
  quoteProps: 'as-needed',
  requirePragma: false,
  semi: true,
  tabWidth: 2,
  trailingComma: 'all',
  useTabs: false,
  plugins: [require('@trivago/prettier-plugin-sort-imports')],
  importOrder: [
    'preload$',
    'mock$',
    '^@/',
    '^\\$/',
    '^#/',
    '^[./]',
  ],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  importOrderGroupNamespaceSpecifiers: true,
  importOrderCaseInsensitive: true,
};
