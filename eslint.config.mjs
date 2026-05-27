import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const designTokenMessage =
  "Use a design token from src/styles/tokens.css (e.g. var(--accent)) instead of a hardcoded color. See docs/DESIGN-TOKENS-PLAN.md.";

export default [
  ...compat.extends("next/core-web-vitals"),
  {
    files: ["src/**/*.{ts,tsx,js,jsx,css}"],
    ignores: [
      "src/app/globals.css",
      "src/styles/tokens.css",
      "src/styles/token-values.ts",
      "src/app/icon.tsx",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/__tests__/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}/]',
          message: designTokenMessage,
        },
        {
          selector: "Literal[value=/rgba?\\(/]",
          message: designTokenMessage,
        },
        {
          selector: "Literal[value=/hsla?\\(/]",
          message: designTokenMessage,
        },
      ],
    },
  },
];
