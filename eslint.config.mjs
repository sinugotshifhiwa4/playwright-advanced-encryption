import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import path from "path";
import { fileURLToPath } from "url";

// Ensure compatibility in both CommonJS and ESM environments
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = tseslint.config(
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.ts"],
  })),

  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // Variable handling
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // Console
      "no-console": ["error", { allow: ["error"] }],
      "no-empty-pattern": "off",

      // Type safety
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-argument": "error",

      // Flexibility rules
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "no-duplicate-imports": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },

  {
    files: ["**/*.spec.ts", "**/tests/**/*.ts"],
    rules: {
      // Relaxed rules for test files
      "no-console": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  {
    ignores: [
      "src/testData/**",
      "node_modules/**",
      "logs/**",
      "playwright-report/**",
      "dist/**",
      "*.d.ts",
    ],
  },

  prettierConfig,
);

export default config;
