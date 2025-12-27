# Phase 2: 投資信託・基準価額

## 概要

投資信託（Fund）と基準価額（NAV）の登録・取得機能を実装する。Domain層からPresentation層まで全レイヤーを縦断する最初の機能。

## 実装項目

### 1. Domain層

#### 1.1 Fund エンティティ (`src/domain/fund/`)

**FundName 値オブジェクト:**
| 項目 | 内容 |
|------|------|
| 制約 | 必須、200文字以内、前後空白トリム |
| 変更 | 登録後は変更不可（型レベルで保証） |

**Fund エンティティ:**
```typescript
type Fund = {
  readonly id: FundId;
  readonly name: FundName;
  readonly createdAt: Date;
};
```

**提供関数:**
- `createFund({ name })`: 新規Fund生成（ULID自動付与）
- `reconstituteFund(data)`: DB復元用（バリデーションなし）

#### 1.2 NAV エンティティ (`src/domain/nav/`)

**NavDate 値オブジェクト:**
| 項目 | 内容 |
|------|------|
| 形式 | YYYY-MM-DD |
| バリデーション | 正規表現 + 日付妥当性チェック |

**NavValue 値オブジェクト:**
| 項目 | 内容 |
|------|------|
| 単位 | 1万口あたり円 |
| 制約 | 正の整数 |

**Nav エンティティ:**
```typescript
type Nav = {
  readonly id: NavId;
  readonly fundId: FundId;
  readonly date: NavDate;
  readonly value: NavValue;
  readonly createdAt: Date;
};
```

### 2. Infrastructure層

#### 2.1 DBスキーマ (`src/infrastructure/database/schema/`)

**funds テーブル:**
```typescript
export const funds = sqliteTable("funds", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
```

**navs テーブル:**
```typescript
export const navs = sqliteTable("navs", {
  id: text("id").primaryKey(),
  fundId: text("fund_id").notNull().references(() => funds.id),
  date: text("date").notNull(),
  value: integer("value").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => ({
  fundDateUnique: unique().on(table.fundId, table.date),
  fundDateIdx: index("navs_fund_date_idx").on(table.fundId, table.date),
}));
```

#### 2.2 Repository実装

**FundRepository:**
| メソッド | 説明 |
|---------|------|
| `save(fund)` | Fund保存 |
| `findById(id)` | ID検索 |
| `findByName(name)` | 名前検索（重複チェック用） |
| `findAll()` | 全件取得 |

**NavRepository:**
| メソッド | 説明 |
|---------|------|
| `upsert(nav)` | NAV登録（同一日付は上書き） |
| `findByFundAndDate(fundId, date)` | 特定日のNAV取得 |
| `findHistoryByFund(fundId, limit?)` | 履歴取得（日付降順） |
| `findLatestByFund(fundId)` | 最新NAV取得 |

**UPSERT実装:**
```typescript
// SQLite ON CONFLICT句を使用
db.insert(navs)
  .values(navData)
  .onConflictDoUpdate({
    target: [navs.fundId, navs.date],
    set: { value: navData.value, createdAt: navData.createdAt },
  });
```

### 3. UseCase層

#### 3.1 registerFund

**入力:** `{ name: string }`
**出力:** `{ fund: Fund }`
**エラー:** ValidationError, DuplicateError, RepositoryError

**処理フロー:**
1. FundName バリデーション
2. 同名Fund重複チェック
3. Fund生成・保存

#### 3.2 listFunds

**入力:** なし
**出力:** `{ funds: Fund[] }`
**エラー:** RepositoryError

#### 3.3 registerNav

**入力:** `{ fundId: string, date: string, value: number }`
**出力:** `{ nav: Nav, isOverwritten: boolean }`
**エラー:** ValidationError, NotFoundError, RepositoryError

**処理フロー:**
1. 入力バリデーション（日付形式、基準価額正値）
2. Fund存在確認
3. 既存NAV確認（上書き判定）
4. NAV生成・UPSERT

#### 3.4 getNavHistory

**入力:** `{ fundId: string, limit?: number }`
**出力:** `{ navs: Nav[] }`
**エラー:** NotFoundError, RepositoryError

### 4. Presentation層

#### 4.1 DTO定義

**FundResponseDto:**
```typescript
type FundResponseDto = {
  id: string;
  name: string;
  createdAt: string; // ISO8601
};
```

**NavResponseDto:**
```typescript
type NavResponseDto = {
  id: string;
  fundId: string;
  date: string;      // YYYY-MM-DD
  value: number;
  createdAt: string; // ISO8601
};
```

**ErrorResponseDto:**
```typescript
type ErrorResponseDto = {
  error: {
    type: string;
    message: string;
  };
};
```

#### 4.2 APIエンドポイント

| メソッド | パス | 説明 | レスポンス |
|---------|------|------|-----------|
| POST | /api/funds | 投資信託登録 | 201: Fund |
| GET | /api/funds | 投資信託一覧 | 200: { funds: Fund[] } |
| POST | /api/funds/:fundId/navs | 基準価額登録 | 201/200: { nav, isOverwritten } |
| GET | /api/funds/:fundId/navs | 基準価額履歴 | 200: { navs: Nav[] } |

## ディレクトリ構造（完成時）

```
src/
├── domain/
│   ├── fund/
│   │   ├── entities/fund.ts
│   │   ├── value-objects/fund-name.ts
│   │   ├── fund.test.ts
│   │   └── index.ts
│   └── nav/
│       ├── entities/nav.ts
│       ├── value-objects/
│       │   ├── nav-date.ts
│       │   └── nav-value.ts
│       ├── nav.test.ts
│       └── index.ts
├── infrastructure/
│   ├── database/
│   │   ├── client.ts
│   │   └── schema/
│   │       ├── funds.ts
│   │       ├── navs.ts
│   │       └── index.ts
│   └── repositories/
│       ├── fund-repository.ts
│       ├── nav-repository.ts
│       └── index.ts
├── usecase/
│   ├── _shared/
│   │   └── repository-interfaces.ts
│   ├── fund/
│   │   ├── register-fund.ts
│   │   ├── list-funds.ts
│   │   ├── fund.integration.test.ts
│   │   └── index.ts
│   └── nav/
│       ├── register-nav.ts
│       ├── get-nav-history.ts
│       ├── nav.integration.test.ts
│       └── index.ts
└── presentation/
    └── api/
        ├── app.ts
        ├── dto/
        │   ├── fund-dto.ts
        │   ├── nav-dto.ts
        │   └── error-dto.ts
        └── routes/
            ├── fund-routes.ts
            └── nav-routes.ts
```

## テスト

### 単体テスト（Domain層）

**Fund:**
- FundName生成（正常、空文字、長すぎ）
- Fund生成（正常、ID一意性）

**NAV:**
- NavDate生成（正常、不正形式、存在しない日付）
- NavValue生成（正常、負値、ゼロ）

### 結合テスト（UseCase層）

**registerFund:**
- 正常登録
- 重複エラー

**registerNav:**
- 正常登録
- 同日上書き（isOverwritten: true）
- 存在しないFund

**getNavHistory:**
- 日付降順確認
- limit指定

## 完了条件

- [ ] `pnpm lint` がエラーなく通る
- [ ] `pnpm test:run` で全テスト合格
- [ ] `pnpm build && node dist/index.js` でサーバー起動
- [ ] curlで全APIエンドポイントが動作確認できる
