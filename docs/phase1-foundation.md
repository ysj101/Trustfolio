# Phase 1: 基盤構築

## 概要

プロジェクトの技術基盤を構築する。レイヤードアーキテクチャの土台となる共通モジュール、型定義、ESLint設定を整備する。

## 実装項目

### 1. パッケージ追加

```bash
pnpm add drizzle-orm better-sqlite3 hono neverthrow ulid @hono/node-server
pnpm add -D @types/better-sqlite3 drizzle-kit
```

| パッケージ | 用途 |
|-----------|------|
| drizzle-orm | SQLite ORM |
| better-sqlite3 | SQLiteドライバ |
| hono | APIフレームワーク |
| neverthrow | Result型エラーハンドリング |
| ulid | ID生成 |
| @hono/node-server | Hono用Node.jsサーバー |

### 2. src/shared/ 共通モジュール

#### 2.1 Branded Types (`src/shared/types/branded.ts`)

プリミティブ型の混同を防ぐ型安全なラッパー。

```typescript
declare const brand: unique symbol;
export type Branded<T, Brand extends string> = T & { readonly [brand]: Brand };
```

**使用例:**
- `FundId`: 投資信託ID
- `Money`: 金額（円単位整数）
- `NavValue`: 基準価額

#### 2.2 共通エラー型 (`src/shared/errors/base-error.ts`)

| エラー型 | 用途 | HTTPステータス |
|---------|------|---------------|
| ValidationError | 入力値バリデーション失敗 | 400 |
| NotFoundError | リソース未発見 | 404 |
| DuplicateError | 重複登録 | 409 |
| RepositoryError | DB操作失敗 | 500 |

#### 2.3 Result型ヘルパー (`src/shared/utils/result-helpers.ts`)

neverthrowのResult型を扱うユーティリティ関数。

- `tryCatch`: 同期処理のtry-catchをResult型に変換
- `tryCatchAsync`: 非同期処理のtry-catchをResultAsync型に変換
- `fromNullable`: null/undefinedをResult型に変換

### 3. Money VO実装 (`src/domain/_shared/value-objects/money.ts`)

金額計算の基盤となる値オブジェクト。

**制約:**
- 整数のみ（小数不可）
- 負の値は許可（損益計算のため）

**提供関数:**
| 関数 | 説明 |
|------|------|
| `createMoney(value)` | Money生成（バリデーション付き） |
| `addMoney(a, b)` | 加算 |
| `subtractMoney(a, b)` | 減算 |
| `multiplyMoney(m, multiplier)` | 乗算（結果は四捨五入） |
| `divideMoney(m, divisor)` | 除算（結果は四捨五入） |
| `moneyValue(m)` | number型に変換 |

**単体テスト:**
- 正常系: 生成、四則演算
- 異常系: 小数入力、ゼロ除算

### 4. ESLint boundaries設定

`eslint-plugin-boundaries`でレイヤー間依存を強制。

```javascript
// eslint.config.mjs
{
  "boundaries/element-types": [
    "error",
    {
      default: "disallow",
      rules: [
        { from: "shared", allow: [] },
        { from: "domain", allow: ["shared", "domain"] },
        { from: "usecase", allow: ["shared", "domain", "usecase"] },
        { from: "infrastructure", allow: ["shared", "domain", "usecase", "infrastructure"] },
        { from: "presentation", allow: ["shared", "domain", "usecase", "presentation"] },
      ],
    },
  ],
}
```

**追加ルール:**
- `enum`禁止 → `as const`使用
- `class`禁止 → 関数とオブジェクト使用
- `throw`禁止 → Result型使用
- `try/catch`禁止 → 腐敗防止層のみ許可

## ディレクトリ構造（完成時）

```
src/
├── shared/
│   ├── types/
│   │   └── branded.ts
│   ├── errors/
│   │   └── base-error.ts
│   ├── utils/
│   │   └── result-helpers.ts
│   └── index.ts
└── domain/
    └── _shared/
        ├── value-objects/
        │   ├── money.ts
        │   ├── money.test.ts
        │   └── percentage.ts
        ├── entity-id.ts
        └── index.ts
```

## 完了条件

- [ ] 全パッケージがインストールされている
- [ ] `pnpm lint` がエラーなく通る
- [ ] `pnpm test:run` でMoney VOのテストが全て合格
- [ ] ESLint boundariesでレイヤー違反が検出される
