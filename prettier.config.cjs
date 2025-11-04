/**
 * Prettier configuration for the monorepo
 * https://prettier.io/docs/en/configuration.html
 */

module.exports = {
  // Use semicolons at the end of statements
  semi: true,

  // Add trailing commas where valid in ES5 (objects, arrays, etc.)
  trailingComma: 'es5',

  // Use single quotes instead of double quotes
  singleQuote: true,

  // Line length that the printer will wrap on
  printWidth: 100,

  // Number of spaces per indentation level
  tabWidth: 2,

  // Indent with spaces, not tabs
  useTabs: false,

  // Put > of multi-line JSX elements at end of last line
  jsxBracketSameLine: false,

  // Include parentheses around a sole arrow function parameter
  arrowParens: 'always',

  // Maintain existing line endings
  endOfLine: 'lf',

  // Ignore files
  overrides: [
    {
      files: '*.md',
      options: {
        // Disable prose wrap to preserve markdown formatting
        proseWrap: 'preserve',
      },
    },
  ],
}
