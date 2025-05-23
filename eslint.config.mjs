import { fileURLToPath } from 'url';
import { dirname } from 'path';
import js from "@eslint/js";

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default [
  // Include all rules from the shared config
  js.configs.recommended,
  
  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/bin/**',
      'prettier.config.js'
    ]
  },
  
  // Project-specific settings
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: './tsconfig.json'
      }
    }
  }
];
