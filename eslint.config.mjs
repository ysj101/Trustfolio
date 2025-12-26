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
    settings: {
      "boundaries/elements": [
        { type: "shared", pattern: "src/shared/**" },
        { type: "domain", pattern: "src/domain/**" },
        { type: "usecase", pattern: "src/usecase/**" },
        { type: "infrastructure", pattern: "src/infrastructure/**" },
        { type: "presentation", pattern: "src/presentation/**" },
      ],
      "boundaries/ignore": ["**/*.test.ts", "**/*.spec.ts"],
    },
    rules: {
      // === レイヤー間依存ルール ===
      // Domain層: sharedのみ依存可能
      // UseCase層: domain, sharedのみ依存可能
      // Infrastructure層: usecase, domain, sharedのみ依存可能
      // Presentation層: usecase, domain, sharedのみ依存可能
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            // shared は外部依存なし（他レイヤーからimportされるのみ）
            { from: "shared", allow: [] },
            // domain は shared のみ依存可能
            { from: "domain", allow: ["shared", "domain"] },
            // usecase は domain, shared のみ依存可能
            { from: "usecase", allow: ["shared", "domain", "usecase"] },
            // infrastructure は usecase, domain, shared のみ依存可能
            {
              from: "infrastructure",
              allow: ["shared", "domain", "usecase", "infrastructure"],
            },
            // presentation は usecase, domain, shared のみ依存可能
            {
              from: "presentation",
              allow: ["shared", "domain", "usecase", "presentation"],
            },
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
      ],

      // === Promise rejection ===
      // 我々はResult型を使用するため、エラーオブジェクトの代わりにRepositoryError等を使用する
      "@typescript-eslint/prefer-promise-reject-errors": "off",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "*.config.*"],
  }
);
