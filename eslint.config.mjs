import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      boundaries,
    },
  },
  {
    rules: {
      // === enum禁止 ===
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSEnumDeclaration",
          message: "enumは禁止です。as constを使用してください。",
        },
        {
          selector: "ThrowStatement",
          message:
            "throw文は禁止です。Result型（neverthrow）を使用してください。",
        },
        {
          selector: "TryStatement",
          message:
            "try/catchは腐敗防止層でのみ許可されます。Result型を使用してください。",
        },
      ],

      // === class禁止（原則） ===
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSEnumDeclaration",
          message: "enumは禁止です。as constを使用してください。",
        },
        {
          selector: "ThrowStatement",
          message:
            "throw文は禁止です。Result型（neverthrow）を使用してください。",
        },
        {
          selector: "ClassDeclaration",
          message: "classは原則禁止です。関数とオブジェクトを使用してください。",
        },
      ],

      // === require禁止 ===
      "@typescript-eslint/no-require-imports": "error",

      // === 未使用変数 ===
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      // === 明示的な型定義を推奨 ===
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],

      // === anyの使用を禁止 ===
      "@typescript-eslint/no-explicit-any": "error",

      // === Promise関連 ===
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // === 厳格なnullチェック ===
      "@typescript-eslint/strict-boolean-expressions": [
        "error",
        {
          allowNullableBoolean: true,
        },
      ],

      // === 一貫したimport ===
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],

      // === 命名規則 ===
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "default",
          format: ["camelCase"],
        },
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE"],
        },
        {
          selector: "parameter",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
        {
          selector: "enumMember",
          format: ["PascalCase"],
        },
      ],
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "*.config.*"],
  }
);
