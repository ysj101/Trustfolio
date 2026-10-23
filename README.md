# Trustfolio (GAS)

投資信託ポートフォリオ管理アプリケーション（Google Apps Script + Google Sheets）

## リポジトリ

ソースコードは [GitHub の Trustfolio リポジトリ](https://github.com/ysj101/Trustfolio) で管理しています。

## 概要

Trustfolioは、投資信託の銘柄・基準価額・取引・積立・保有情報・ポートフォリオを
Google Sheets上で管理するGASアプリケーションです。

### 主な機能

- 📊 **銘柄・NAV管理**: 投資信託銘柄の登録と基準価額の記録・自動取得（楽天証券・Wealth Advisorの公開ページから取得。[注意事項](#基準価額の自動取得に関する注意事項)を参照）
- 💰 **取引管理**: スポット購入・積立設定の登録と自動実行
- 📈 **保有・パフォーマンス分析**: 銘柄ごとの保有状況と時系列パフォーマンスの可視化
- 📧 **週次レポート**: 投資実績を自動でメール送信
- 🎨 **モダンなUI**: Tailwind CSSを使用したダークモード対応のWebアプリ

## 基準価額の自動取得に関する注意事項

Trustfolioの基準価額（NAV）自動取得は、公式のAPIを使っていません。楽天証券とWealth Advisorが公開しているWebページのHTMLを取得し、その中から基準価額と基準日を読み取っています（スクレイピング）。この機能を使う前に、次の点を確認してください。

- **非公式の機能です**: Trustfolioは、楽天証券株式会社およびウエルスアドバイザー株式会社とは関係のない、個人が開発したアプリケーションです。この機能は、両社が提供または承認したものではありません。
- **利用規約の確認は利用者の責任です**: 取得先サイトの利用規約と`robots.txt`は、利用者自身で確認し、それに従ってください。規約がこのような取得を禁じている場合や、取得先から停止を求められた場合は、この機能を使わないでください。
- **アクセス先とアクセス回数**: Trustfolioがアクセスするのは、次の2種類のページだけです。
  - 楽天証券: `https://www.rakuten-sec.co.jp/web/fund/detail/?ID=<楽天ファンドID>`
  - Wealth Advisor: `https://apl.wealthadvisor.jp/webasp/<company>/pc/basic/<pageId>.html`

  夜間の自動取得（`fetchAllNavs`）は、毎日21:00〜22:00の間に1回だけ実行されます。1回の実行では、取得元を設定した銘柄ごとに1回ずつ、間隔を空けずに順番にページを取得します。このほか、登録フォームの「確認」ボタンと、統合テスト用のスクリプト（`pnpm test:rakuten`、`pnpm test:nav-fetch`、`pnpm test:wealthadvisor`）も取得先へアクセスします。
- **取得先に負荷をかけないでください**: トリガーの実行間隔を短くする、同じ処理を繰り返し実行するなど、アクセス回数を増やす使い方や改変はしないでください。
- **取得できなくなることがあります**: 取得先のページ構成が変わると、基準価額を取得できなくなったり、誤った値を読み取ったりするおそれがあります。取得した値は証券会社や運用会社の公式情報と照らし合わせて確認し、投資判断には公式情報を使ってください。
- **取得したデータは個人の管理にだけ使ってください**: 取得した基準価額を第三者へ再配布しないでください。
- **自動取得は止められます**: 登録フォームの「基準価額の取得元」を「取得しない」にした銘柄には、Trustfolioはアクセスしません。夜間の自動取得そのものを止める場合は、GASエディタで`deleteNavFetchTrigger`を実行してください。

TrustfolioはMIT Licenseのもと、無保証で提供しています（[LICENSE](LICENSE)）。この機能を使った結果について、作者は責任を負いません。

## 技術スタック

| カテゴリ | 技術 |
|----------|------|
| 言語 | TypeScript 7 |
| ランタイム | Google Apps Script (V8) |
| データストア | Google Sheets |
| ツールチェーン | Vite+（`vp`。ビルド・テスト・lint・整形を 1 つの CLI と `vite.config.ts` に集約） |
| ビルド | Vite 8（`vp build`。ライブラリモードで`dist/Code.js`へバンドル） |
| デプロイ | clasp |
| テスト | Vitest 5（`vp test`） |
| lint・整形 | Oxlint（`vp lint`）・Oxfmt（`vp fmt`） |
| UI | Tailwind CSS |
| エラーハンドリング | Result型（オブジェクト） |
| ID生成 | ULID |

## ディレクトリ構成

```
.
├── appsscript.json          # GAS マニフェスト
├── vite.config.ts           # Vite+ の設定（ビルド・テスト・整形・lint）
├── pnpm-workspace.yaml      # pnpm の設定と catalog
├── tsconfig.json            # TypeScript 設定
├── src/
│   ├── main.ts              # エントリーポイント
│   ├── Config.ts            # 設定管理
│   ├── api/                 # APIルーター
│   ├── domain/              # ドメインロジック（計算、型定義）
│   ├── repository/          # データアクセス層（Sheets操作）
│   ├── service/             # 外部サービス連携（楽天証券、メール）
│   ├── usecase/             # ユースケース層（ビジネスロジック）
│   ├── ui/                  # HTML/CSS（Webアプリ画面）
│   ├── utils/               # ユーティリティ（ULID生成など）
│   ├── scripts/             # スクリプト用型定義
│   └── integration/         # 統合テスト
├── tests/                   # テストコード（Vitest）
│   ├── api/
│   ├── domain/
│   ├── repository/
│   ├── service/
│   ├── usecase/
│   └── utils/
├── scripts/                 # ビルド・セットアップスクリプト
│   ├── build-styles.sh      # CSS ビルド
│   ├── setup-clasp.sh       # clasp 設定生成
│   ├── sync-env-to-gas.mjs  # 環境変数同期スクリプト
│   ├── rakuten-integration-test.mjs  # 楽天証券統合テスト
│   └── nav-fetch-test.mjs   # NAV取得統合テスト
├── docs/                    # ドキュメント
└── dist/                    # ビルド出力（GASへデプロイ）
```

## シート構成

| シート名 | 説明 |
|----------|------|
| `_funds` | 投資信託マスタ（銘柄情報） |
| `_nav_records` | 基準価額（NAV）履歴 |
| `_recurring` | 積立設定（自動購入設定） |
| `_tx_{suffix}` | 取引履歴（銘柄ごと、suffixはファンドIDの末尾3文字） |
| `_performance` | パフォーマンスデータ（全銘柄集計） |
| `_perf_{suffix}` | パフォーマンスデータ（銘柄ごと、suffixはファンドIDの末尾3文字） |

`_funds`シートは、`id`、`name`、`rakutenFundId`、`settlementBusinessDays`、`navSource`、`navSourceCode`、`assetClass`、`createdAt`の8列で構成されます。列移行はシート初期化または銘柄の登録・更新時に実行され、夜間のNAV自動取得では実行されません。読み取り時はヘッダー名で列を対応付けるため、移行前の旧5列・旧7列や利用者が追加した列を変更せずに読み取れます。一方、書き込みを伴う操作（銘柄の登録・更新、銘柄一覧からの資産クラスの設定、シート初期化）では列移行が実行され、定義外のヘッダーを持つ列（利用者が追加したメモ列や空ヘッダーの列）はその値ごと削除されます。`_funds`シートに独自の列を追加して運用しないでください。`assetClass`には株式を表す`equity`または金を表す`gold`を保存します。空セルは導入前の銘柄に残る未設定状態を表します。資産クラスは銘柄一覧からいつでも変更できます。ポートフォリオタブの「資産クラス別」カード、週次レポートメールの「資産クラス別」表と保有銘柄一覧の資産クラス列に使用します。未設定銘柄は「未設定」区分として集計されます。

## セットアップ

### 必要環境

- [mise](https://mise.jdx.dev/)（Node.js のバージョン管理）
- Corepack（Node.js 24 に同梱。pnpm の取得・SHA 検証に利用）
- [Aikido Safe Chain](https://github.com/AikidoSec/safe-chain) 1.5.24（npm パッケージのマルウェア検査と、公開直後のパッケージを取得させない最小経過時間ガード。リポジトリ直下の `.aikido` を読み込むために 1.5.15 以上が必須）
- clasp（`pnpm exec clasp login`で認証）
- Google Apps Scriptプロジェクト
- Google スプレッドシート

`mise.toml` で Node.js `24.19` 系（現行の Active LTS 線。patch は自動追従）を推奨ランタイムとして固定しています（issue #199 で 22.22 系から移行）。pnpm は `package.json` の `packageManager` (`pnpm@10.30.2+sha512...`) を Corepack が SHA まで検証してインストールするため、バージョン定義を 1 箇所に集約しています。これらは `engines.node` (`>=24.11.0 <25`)、`engines.pnpm` (`>=10.30.2 <11`) と整合しています。`engines.node` は Node 24 系だけを許容します。下限の 24.11.0 は vite-plus 1.x の要求（`^22.18.0 || ^24.11.0 || >=26.0.0` のうち 24 系の下限）に由来し、上限の `<25` は Corepack を同梱しない Node 25 系以降を除外します。Node 22 系は 2027-04-30 に EOL を迎えるため、issue #265 で許容対象から外しました。テスト・lint・依存関係監査の CI（test.yml / lint.yml / security.yml）も Node 24 系の単一バージョンで実行します。依存関係の追加・更新・実行は `pnpm` だけを使用してください。

依存関係の取得は、ローカルと CI のどちらも Aikido Safe Chain を経由させます（issue #267）。Safe Chain は `pnpm` などのパッケージマネージャーを包み、取得するパッケージをマルウェアのデータベースと照合します。さらに、公開から一定時間が経過していない版を取得させません。この最小経過時間は、リポジトリ直下の `.aikido`（`minimumPackageAgeHours: 48`）でローカルと CI に共有しています。環境変数 `SAFE_CHAIN_MINIMUM_PACKAGE_AGE_HOURS` を設定すると `.aikido` より優先されるため、ローカルでは設定しないでください。CI では `.github/actions/setup-safe-chain/action.yml` が同じ版を SHA256 検証付きで導入します。版の更新手順は `docs/UPGRADE_STRATEGY.md` の「Aikido Safe Chain の記録」を参照してください。

### インストール

mise が未導入であれば、まずインストールし、シェルへの activate を済ませてください（zsh の場合は `~/.zshrc` に `eval "$(mise activate zsh)"` を追加）。

```bash
# macOS（Homebrew）
brew install mise

# Linux または macOS の代替
curl https://mise.run | sh

# ~/.zshrc に: eval "$(mise activate zsh)"
exec zsh
```

プロジェクトルートで以下を実行します。

```bash
mise install     # mise.toml に従って Node.js 24.19.x をインストール
corepack enable  # Corepack を有効化（Node 24 に同梱）
```

続いて Aikido Safe Chain 1.5.24 をインストールします。インストーラの SHA256 を検証してから実行してください。インストーラはシェルの設定ファイル（`~/.zshrc` など）に Safe Chain の読み込み処理を追加します。古い版を導入済みの場合も、同じ手順で 1.5.24 へ更新できます。

```bash
curl -fsSL https://github.com/AikidoSec/safe-chain/releases/download/1.5.24/install-safe-chain.sh -o /tmp/install-safe-chain.sh \
  && echo "99eb124a3404b3ac99e8b65406b87c4ee049c1d6c17757a7d04991ae60d16e69  /tmp/install-safe-chain.sh" | shasum -a 256 -c - \
  && sh /tmp/install-safe-chain.sh \
  && rm /tmp/install-safe-chain.sh
exec zsh                # シェルを再起動し、Safe Chain の読み込み処理を反映
safe-chain --version    # 「Current safe-chain version: 1.5.24」と表示されることを確認
pnpm safe-chain-verify  # 「OK: Safe-chain works!」と表示されることを確認
```

最後に依存関係をインストールします。

```bash
pnpm install     # Corepack が package.json の packageManager フィールドから
                 # pnpm@10.30.2 を SHA 検証付きで自動解決し、Safe Chain 経由で依存を取得
```

### 環境変数の設定

1. `.env.example`をコピーして`.env`を作成します。

```bash
cp .env.example .env
```

2. `.env`ファイルに以下の値を設定します。

| 環境変数 | 説明 | 取得方法 |
|----------|------|----------|
| `GAS_SCRIPT_ID` | GASプロジェクトのScript ID | GASエディタのURL `https://script.google.com/home/projects/{SCRIPT_ID}/edit` から取得 |
| `WEEKLY_REPORT_EMAIL` | 週次レポート送信先メールアドレス | 投資実績レポートを受信するメールアドレスを指定 |

3. `.clasp.json`を作成します。`.clasp.json`はGASプロジェクトのScript IDを含むため、`.gitignore`で除外しており、Gitの追跡対象には含めません。

`.env`の`GAS_SCRIPT_ID`から生成する場合は、次を実行します。

```bash
pnpm setup:clasp
```

テンプレートから作る場合は、`.clasp.json.example`をコピーし、`scriptId`の`YOUR_SCRIPT_ID_HERE`を手順2のScript IDに置き換えます。`rootDir`は`./dist`のままにします。

```bash
cp .clasp.json.example .clasp.json
```

### ビルド

TypeScriptのバンドル、`src/ui/`のファイルと`appsscript.json`のコピー、CSSのビルドを一括実行します。

```bash
pnpm build
```

個別にビルドする場合：

```bash
pnpm build:js    # TypeScriptのバンドルと、src/ui/ のファイル・appsscript.json の dist/ へのコピー
pnpm build:css   # Tailwind CSSのビルド
```

### テスト

```bash
pnpm test                # Vitest（vp test）でユニットテスト実行
pnpm test:rakuten        # 楽天証券NAV取得の統合テスト
pnpm test:nav-fetch      # NAV自動取得の統合テスト
pnpm test:wealthadvisor  # Wealth Advisor NAV取得の実サイト疎通確認
```

### コード品質チェック

```bash
pnpm lint             # Oxlint（vp lint）・専用チェック・型チェックでコード検査
pnpm lint:fix         # Oxlintの自動修正とOxfmt（vp fmt）の整形を実行
pnpm format           # Oxfmt（vp fmt）でコード整形
pnpm format:check     # Oxfmt（vp fmt --check）でフォーマットチェックのみ
pnpm exec vp check    # 整形とlintをまとめて検査（結果は pnpm format:check と pnpm lint:oxlint に一致）
pnpm audit:bundled    # Vite+ の配布物に同梱されたパッケージを脆弱性アドバイザリと照合
```

ビルド・テスト・lint・整形は Vite+ の `vp` コマンドで実行します（issue #272）。対象範囲とルールは `vite.config.ts` の `build`・`test`・`fmt`・`lint` に集約しており、`package.json` の scripts は対象パスや CLI 引数を渡しません。そのため、`vp check` と scripts の検査結果は一致します。`vitest.config.ts`・`.oxfmtrc.json`・`.oxlintrc.json` は置かないでください（Vitest は `vitest.config.ts` を優先して読み、`vite.config.ts` の `test` を無視します）。

Vite+ の更新（`vite-plus` の版上げ）は、`vite`（`@voidzero-dev/vite-plus-core` の別名）・`vitest`・`@vitest/coverage-v8` の版を同時にそろえる必要があるため、`vp migrate` で行います。手順は `docs/UPGRADE_STRATEGY.md` の「Vite+（vp）への一本化の記録」を参照してください。

## デプロイ

### 開発フロー

```bash
pnpm push
```

このコマンドで以下が自動実行されます：

1. Oxlint（vp lint）・専用チェック・型チェックによるコードチェック
2. TypeScriptのビルド（vp build）とTailwind CSSのビルド
3. GASへのコードpush（`@HEAD`デプロイメント更新）

### 本番反映

GASエディタで既存デプロイメントを更新します（URLが固定されます）：

1. GASエディタを開く
2. 「デプロイ」→「デプロイを管理」
3. 編集（鉛筆アイコン）をクリック
4. バージョンで「新バージョン」を選択
5. 「デプロイ」をクリック

`appsscript.json`の`webapp.access`は`MYSELF`（自分のみ）です。`pnpm push`（`clasp push`）はマニフェストをGASプロジェクトへ送るだけで、公開中のウェブアプリURLのアクセス権は変わりません。アクセス権を変えたときは、上記の手順で既存デプロイを更新し、アクセスできるユーザーが「自分のみ」になっていることを確認してください。

### 初回Webアプリデプロイ（新規プロジェクトのみ）

1. GASエディタで「デプロイ」→「新しいデプロイ」
2. 種類で「ウェブアプリ」を選択
3. 実行ユーザーを「自分」（`appsscript.json`の`executeAs`: `USER_DEPLOYING`）、アクセスできるユーザーを「自分のみ」（`access`: `MYSELF`）に設定します
4. 「デプロイ」をクリック

### 画面の開き方

- GASエディタの「デプロイ」→「デプロイを管理」からWebアプリURLを確認できます。

## 使い方

### 初期セットアップ

1. スプレッドシートを開き、メニューの`Trustfolio`から`シート初期化`を実行します。
2. 必要なシート（`_funds`、`_nav_records`、`_recurring`など）が自動作成されます。

### Webアプリの使用

Webアプリでは以下の操作が可能です：

- **銘柄管理**: 投資信託銘柄の登録（基準価額の取得元として楽天証券ファンドID / Wealth Advisor 取得元コードを選択）
- **基準価額（NAV）管理**: 手動でのNAV登録・履歴確認
- **スポット購入**: 単発の購入取引の登録
- **積立設定**: 定期的な自動購入の設定（月次、実行日指定）
- **保有情報**: 銘柄ごとの保有口数・評価額の確認
- **ポートフォリオ**: 全銘柄の投資配分・パフォーマンスの確認
- **パフォーマンス分析**: 時系列でのパフォーマンス推移の確認

### NAV自動取得の設定

保有銘柄の基準価額（NAV）を毎日自動で取得するには、以下の手順でトリガーを設定します。設定する前に、[基準価額の自動取得に関する注意事項](#基準価額の自動取得に関する注意事項)を確認してください。

詳細な手順は [docs/NAV_AUTO_FETCH_SETUP.md](docs/NAV_AUTO_FETCH_SETUP.md) を参照してください。

#### 方法1: スクリプトによる設定（推奨）

1. Google Apps Scriptエディタを開く
2. 関数選択ドロップダウンから`setupNavFetchTrigger`を選択
3. 「実行」ボタンをクリック
4. 初回実行時は権限を承認

#### 方法2: 手動設定

1. Google Apps Scriptエディタの「トリガー」から「+ トリガーを追加」
2. 関数: `fetchAllNavs`、イベント: `時間主導型`、時刻: `午後9時〜10時`を設定

### 積立購入の自動実行設定

登録した積立設定に基づき、毎日自動で購入を実行するには、以下の手順でトリガーを設定します。

#### トリガーを設定

1. Google Apps Scriptエディタを開く
2. 関数選択ドロップダウンから`setupRecurringPurchasesTrigger`を選択
3. 「実行」ボタンをクリック
4. 初回実行時は権限を承認

これで毎日午前9:00-10:00に積立設定がチェックされ、実行日に該当する場合は自動購入が実行されます。

### 週次レポートの設定

投資実績を毎週土曜日にメールで受信するには、以下の手順を実行します。

#### 1. スクリプトプロパティの設定

1. Google Apps Scriptエディタを開く
2. プロジェクトの設定（歯車アイコン）をクリック
3. 「スクリプトプロパティ」タブを選択
4. 「スクリプトプロパティを追加」をクリック
5. 以下を入力して保存
   - プロパティ: `WEEKLY_REPORT_EMAIL`
   - 値: メール送信先アドレス（例: `your_email@example.com`）

#### 2. トリガーを設定

1. Google Apps Scriptエディタを開く
2. 関数選択ドロップダウンから`setupWeeklyReportTrigger`を選択
3. 「実行」ボタンをクリック

これで毎週土曜日の7:00-8:00に投資実績レポートが指定したメールアドレスに送信されます。

#### トリガーの削除

週次レポートの送信を停止したい場合は、`deleteWeeklyReportTrigger`関数を実行してください。

## 開発体制

### CI/CD

GitHub Actionsで以下を自動実行しています：

- **Lint**: Oxlint（vp lint）と専用チェック、Oxfmt（vp fmt）のフォーマット検証（[.github/workflows/lint.yml](.github/workflows/lint.yml)）
- **Test**: Vitest（vp test）による単体テスト実行と、ビルド（`pnpm build`）の成功確認（[.github/workflows/test.yml](.github/workflows/test.yml)）
- **Security Check**: `pnpm audit --audit-level moderate` による依存関係監査と、Vite+ の配布物に同梱されたパッケージのアドバイザリ照合（`scripts/check-bundled-advisories.mjs`）（[.github/workflows/security.yml](.github/workflows/security.yml)）
- **Code Review**: Claudeによる自動コードレビュー（プルリクエスト時）
- **Dependabot Auto Merge**: パッチバージョンの自動マージ（[.github/workflows/dependabot-auto-merge.yml](.github/workflows/dependabot-auto-merge.yml)）

### コミットフック

Huskyとlint-stagedを使用し、コミット前に以下を自動実行：

- Oxlint（vp lint --fix）による自動修正
- Oxfmt（vp fmt）によるコード整形
- 関連するテストの実行（vp test related）

## コーディング規約

| 項目 | 方針 |
|------|------|
| enum | 禁止（`as const`を使用） |
| class | 禁止（関数とオブジェクトを使用） |
| throw | 禁止（Result型を使用） |
| try/catch | 腐敗防止層でのみ許可 |
| any | 禁止 |

### アーキテクチャ

レイヤードアーキテクチャを採用：

- **UI層** ([src/ui/](src/ui/)): HTML/CSS（Webアプリ画面）
- **API層** ([src/api/](src/api/)): HTTPリクエストのルーティング
- **UseCase層** ([src/usecase/](src/usecase/)): ビジネスロジック
- **Domain層** ([src/domain/](src/domain/)): ドメインロジック・型定義
- **Repository層** ([src/repository/](src/repository/)): データアクセス（Sheets操作）
- **Service層** ([src/service/](src/service/)): 外部サービス連携（楽天証券、メール）

## スクリプト一覧

| コマンド | 説明 |
|----------|------|
| `pnpm push` | lint→ビルド→GASへpush（メインコマンド） |
| `pnpm setup:clasp` | `.env`から`.clasp.json`を生成 |
| `pnpm sync:env` | `.env`からGASスクリプトプロパティ設定用の関数を出力 |
| `pnpm build` | GAS用にバンドルして`dist/`へ出力 |
| `pnpm build:js` | TypeScriptをバンドルし、`src/ui/`のファイルと`appsscript.json`を`dist/`へコピー |
| `pnpm build:css` | Tailwind CSSをビルド |
| `pnpm lint` | Oxlint（vp lint）・専用チェック・型チェックでコード検査 |
| `pnpm lint:fix` | Oxlintの自動修正とOxfmt（vp fmt）の整形を実行 |
| `pnpm format` | Oxfmt（vp fmt）でコード整形 |
| `pnpm format:check` | Oxfmt（vp fmt --check）でフォーマットチェック |
| `pnpm test` | Vitest（vp test）でテスト実行 |
| `pnpm audit:bundled` | Vite+ の配布物に同梱されたパッケージを脆弱性アドバイザリと照合（CI の Security Check と同じ検査） |
| `pnpm test:rakuten` | 楽天証券NAV取得の統合テスト（1銘柄） |
| `pnpm test:nav-fetch` | NAV自動取得の統合テスト（複数銘柄） |
| `pnpm test:wealthadvisor` | Wealth Advisor NAV取得の実サイト疎通確認（取得元コードは`WEALTHADVISOR_CODES`にカンマ区切りで指定） |

## ライセンス

このリポジトリはMIT Licenseです。著作権表示はCopyright (c) 2026 ysjです。全文は[LICENSE](LICENSE)にあります。
