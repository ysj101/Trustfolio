import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettierConfig,
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
      prettier,
    },
    settings: {
      "boundaries/elements": [
        { type: "domain", pattern: "src/domain/**" },
        { type: "usecase", pattern: "src/usecase/**" },
        { type: "repository", pattern: "src/repository/**" },
        { type: "api", pattern: "src/api/**" },
        { type: "ui", pattern: "src/ui/**" },
        { type: "utils", pattern: "src/utils/**" },
      ],
      "boundaries/ignore": ["**/*.test.ts", "**/*.spec.ts"],
    },
    rules: {
      // === レイヤー間依存ルール ===
      // Domain層: utilsのみ依存可能
      // UseCase層: domain, repository, utilsのみ依存可能
      // Repository層: domain, utilsのみ依存可能
      // API層: usecase, domain, repository, utilsのみ依存可能
      // UI層: apiのみ依存可能
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "domain", allow: ["domain", "utils"] },
            { from: "usecase", allow: ["usecase", "domain", "repository", "utils"] },
            { from: "repository", allow: ["repository", "domain", "utils"] },
            { from: "api", allow: ["api", "usecase", "domain", "repository", "utils"] },
            { from: "ui", allow: ["ui", "api"] },
            { from: "utils", allow: ["utils"] },
          ],
        },
      ],

      // === typeエイリアスを許可（タグ付きユニオン等で必要） ===
      "@typescript-eslint/consistent-type-definitions": "off",

      // === enum禁止、throw禁止、class禁止 ===
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
        {
          // 外部ライブラリのデフォルトインポートは任意の形式を許可
          selector: "import",
          format: null,
        },
        {
          // as constオブジェクトのプロパティ名はUPPER_CASEを許可（定数として使用）
          selector: "objectLiteralProperty",
          format: ["camelCase", "UPPER_CASE"],
        },
      ],

      // === Promise rejection ===
      // 我々はResult型を使用するため、エラーオブジェクトの代わりにRepositoryError等を使用する
      "@typescript-eslint/prefer-promise-reject-errors": "off",

      // === Prettier ===
      "prettier/prettier": "error",
    },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "*.config.*",
    ],
  }
);
