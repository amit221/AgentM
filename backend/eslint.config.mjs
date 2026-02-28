// ESLint flat config for the backend (TypeScript, Node, ESM)
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Global ignores
  { ignores: ["dist/**", "node_modules/**"] },

  // TypeScript files
  {
    files: ["**/*.ts"],
    // Relaxed: drop the type-checked preset to avoid strict unsafe-* rules
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
      parser: tseslint.parser,
      parserOptions: {
        // Use project service instead of listing project files to avoid perf issues
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      // General JS rules
      "no-console": "warn",
      "no-useless-escape": "off",

      // TS rules: relax strict typing requirements for now
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      // Express-style handlers often legitimately pass async functions
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/require-await": "off",
    },
  },

  // JavaScript config (in case any JS exists now or later)
  {
    files: ["**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "warn",
    },
  }
);


