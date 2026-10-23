# 依存関係更新戦略

## 概要

本ドキュメントは、Trustfolio GASプロジェクトにおける依存関係のバージョンアップ戦略を定義します。特にメジャーバージョンアップにおいて、問題の特定と解決を容易にするための段階的なアプローチを採用します。

## 基本方針

### メジャーバージョンアップは段階的に実施

メジャーバージョンを複数跨いで一気に上げると、問題が発生した際に原因の切り分けが困難になります。

**悪い例:**
```
v2.0.0 → v4.0.0 に直接アップグレード
```
問題が発生した場合、v3.0.0での変更とv4.0.0での変更のどちらが原因か特定しづらい。

**良い例:**
```
v2.0.0 → v3.0.0 → v4.0.0 と段階的にアップグレード
```
各バージョンで動作確認を行うことで、問題の原因を特定しやすくなる。

### Dependabotによる自動化

- **patchバージョン**: Dependabotが自動的にPRを作成し、CIが成功すれば自動マージ（[dependabot-auto-merge.yml](../.github/workflows/dependabot-auto-merge.yml)）
- **minorバージョン**: Dependabotが自動的にPRを作成（手動でレビュー・マージ）
- **majorバージョン**: Dependabotが検知して個別にPRを作成（自動マージ対象外。実際の適用は後述の「メジャーバージョンアップ手順」に従い手動で段階的に実施）。ただし意図的にバージョンを固定している依存は[dependabot.yml](../.github/dependabot.yml)の`ignore`で個別に除外する（現在の除外対象は`typescript-js-api`のmajor更新と、`vite`・`vitest`・`@vitest/coverage-v8`の全更新。後述の「エイリアス devDependency `typescript-js-api`」と「Vite+（vp）への一本化の記録」を参照）

> **majorのPRの扱いについて**
>
> Dependabotが提案するのは常に最新バージョンへの1回のジャンプであり、複数メジャーを跨ぐ場合でも中間バージョンを経由するPRは作成されません。したがってmajorのPRは「新しいメジャーが出たことの検知」として扱い、Dependabotのブランチをそのままマージするのではなく、「メジャーバージョンアップ手順」に沿って段階的にアップグレードを実施してください。
>
> なおmajorは[dependabot.yml](../.github/dependabot.yml)の`groups`のいずれにも該当しないため、1パッケージにつき1本の個別PRとして起票されます。これにより、1つのメジャー更新を1PRで検証できます。

> **`open-pull-requests-limit` について**
>
> [dependabot.yml](../.github/dependabot.yml)の`open-pull-requests-limit`は、**個別PRとグループPRの合計**に対する上限です。上限に達するとDependabotは新規PRを黙って作成しなくなるため、メジャー更新の検知を取りこぼす原因になります。
>
> 最悪ケースは「`devDependencies`のうち個別PRを生みうる全件が同時に個別PRを持つ ＋ `development`グループPR 1本」です（`production`グループは`dependencies`が0件のためPRを生みません）。現在は`devDependencies`12件のうち、`typescript-js-api`（major除外）と`vite`・`vitest`・`@vitest/coverage-v8`（全更新を除外）を除く8件＋1本＝9本となり、予備2本を加えて上限を`11`に設定しています。`vite-plus`は`development`グループから外しているためminor・patchも個別PRになりますが、1パッケージにつき同時に開くPRは1本であるため、8件の中で数えています（issue #272）。
>
> **依存パッケージを追加する際は、この上限の見直しが必要かどうかを必ず確認してください。**

依存関係の正本は `pnpm-lock.yaml` です。開発者は `npm` を使わず、`pnpm` と `package.json` の `packageManager` / `engines` に従って作業します。

#### 自動マージの条件

パッチバージョンの更新は以下の条件を満たすと自動的にマージされます：

1. Dependabotが作成したPRであること
2. パッチバージョン（`x.y.z`の`z`部分）の更新であること
3. Lint（Oxlint・Oxfmt。lint.yml の「Lint And Format Check」）が成功すること
4. Test（Vitest とビルド。test.yml の「Unit Tests」）が成功すること

3 と 4 は main のルールセットの必須チェックであり、`gh pr merge --auto` はこれらの成功を待ってマージします。

これにより、セキュリティパッチやバグフィックスが迅速に適用されます。

## メジャーバージョンアップ手順

### 1. 事前準備

- [ ] 現在のバージョンから目標バージョンまでの間にあるメジャーバージョンをリストアップ
- [ ] 各バージョンのCHANGELOGまたはリリースノートを確認
- [ ] 破壊的変更(Breaking Changes)の内容を把握

### 2. ローカル環境での段階的アップグレード

**2.1. 最初のメジャーバージョンにアップグレード**

```bash
# 例: @google/clasp v2 → v3 へのアップグレード
pnpm add @google/clasp@3
```

**2.2. ビルドとテストの実行**

```bash
# ビルドが成功するか確認
pnpm build

# テストが通過するか確認
pnpm test
```

**2.3. GASへのデプロイと動作確認**

```bash
# ステージング環境へデプロイ（存在する場合）
pnpm push

# または本番環境へデプロイ
pnpm push
```

**2.4. 主要機能の動作確認チェックリスト**

- [ ] スプレッドシートの基本操作が正常に動作する
- [ ] トリガー設定が正常に動作する
- [ ] データ取得・更新処理が正常に動作する
- [ ] エラーハンドリングが正常に動作する
- [ ] ログ出力が正常に動作する

**2.5. 問題がなければコミット**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: upgrade [package-name] from vX to vY"
```

**2.6. 次のメジャーバージョンがある場合は2.1に戻る**

### 3. 問題が発生した場合のロールバック手順

**3.1. 即座にロールバック**

```bash
# 直前のコミットへ作業ツリーを戻す
git checkout HEAD~1 -- package.json pnpm-lock.yaml

# 依存関係を再インストール
pnpm install --frozen-lockfile

# ビルド
pnpm build

# GASへ再デプロイ
pnpm push
```

**3.2. 問題の調査**

- エラーログの確認
- CHANGELOGで破壊的変更の再確認
- 必要に応じてissueを作成し、問題を記録

**3.3. 修正と再試行**

- コードの修正が必要な場合は修正を実施
- 再度手順2から実施

### 4. マージとデプロイ

- [ ] PRを作成
- [ ] レビュー（必要に応じて）
- [ ] mainブランチにマージ
- [ ] 本番環境での動作確認

## テスト戦略

### ローカルテスト

1. **TypeScriptの型チェック**: `pnpm build`でコンパイルエラーがないか確認
2. **ユニットテスト**: `pnpm test`で既存のテストが通過するか確認
3. **Lintチェック**: `pnpm lint`でコードスタイルの問題がないか確認

### GAS環境でのテスト

1. **デプロイの成功**: `pnpm push`が正常に完了するか確認
2. **基本機能の動作確認**: スプレッドシートを開いて主要機能が動作するか手動確認
3. **トリガーの動作確認**: 定期実行トリガーが正常に動作するか確認
4. **エラー監視**: GASログを確認し、新しいエラーが発生していないか確認

## トラブルシューティング

### よくある問題と対処法

| 問題 | 原因 | 対処法 |
|------|------|--------|
| ビルドエラー | APIの破壊的変更 | CHANGELOGを確認し、該当するコードを修正 |
| 型エラー | 型定義の変更 | `@types/*`パッケージも併せてアップグレード |
| ランタイムエラー | メソッド名の変更 | 新しいAPIドキュメントを参照してコードを修正 |
| デプロイ失敗 | `@google/clasp`の互換性問題 | `.clasp.json`や`appsscript.json`の設定を確認 |

## peer 依存の明示的許容（peerDependencyRules）の記録

`pnpm-workspace.yaml` の `peerDependencyRules.allowedVersions` に設定した許容ルールは、暗黙のフォールバックを避けるため、必ず本セクションに判断理由を記録します（issue #272 で `package.json` の `pnpm.peerDependencyRules` から移動）。

### `@formatjs/intl@3.1.8>typescript: ^6.0.0 || ^7.0.0`（2026-07-23 追加）

- **経緯**: TypeScript を 5.9.3 → 6.0.3 へ更新した際（issue #175 Phase 1）、`@google/clasp@3.3.0` の推移的依存 `@formatjs/intl@3.1.8` が peerDependencies に `typescript: ^5.6.0`（optional）を宣言しているため、`pnpm install` で unmet peer 警告が発生した。
- **判断理由**:
  - `@formatjs/intl` の typescript peer は `peerDependenciesMeta` で optional 宣言されており、TypeScript は同パッケージの型定義利用時のみ関与する。clasp は `@formatjs/intl` を CLI メッセージの国際化（実行時処理）に使用しており、本リポジトリの `tsc --noEmit` 型チェック対象（`src/`）にも含まれない。
  - `@formatjs/intl` は 4.1.x で typescript peer 宣言自体を撤廃済みだが、clasp が依存するのは 3.1.8 であり、メジャーを跨ぐ強制上書き（pnpm overrides）は clasp の実行時動作を壊すリスクがあるため採用しない。
  - `@google/clasp` の最新は 3.3.0（2026-07-23 時点）であり、`@formatjs/intl` の typescript peer 警告を解消するリリース済みの `@google/clasp` バージョンは存在しない。したがって「clasp を更新して警告を解消する」という選択肢は存在しない。
- **許容範囲の限定**: 許容ルールの親セレクタは、判断根拠として検証済みの `@formatjs/intl@3.1.8` に限定している。将来 `@google/clasp` の更新で `@formatjs/intl` の別バージョンが導入され新たな peer 非互換が生じた場合、本ルールでは抑制されず警告が再び顕在化する（fail fast）。
- **解除条件**: `@google/clasp` を更新した際は、その時点の推移的依存（`@formatjs/intl` のバージョンと peer 宣言）を再評価し、typescript peer 警告が発生しなくなっていれば本ルールを削除する。警告が残る場合は、検証したバージョンへ限定を付け替えた上で本セクションを更新する。
- **レンジ拡張（2026-07-23、issue #175 Phase 2）**: TypeScript を 6.0.3 → 7.0.2 へ更新した際、許容レンジを `^6.0.0` から `^6.0.0 || ^7.0.0` へ拡張した。判断理由・許容範囲の限定・解除条件は上記のとおり変わらない（TypeScript 7 でも `@formatjs/intl@3.1.8` の optional peer 宣言は `^5.6.0` のままであることを確認済み）。

### `vitest@<版>>vite` と `@vitest/mocker@<版>>vite`（2026-10-12 追加、issue #272。現在の値は `pnpm-workspace.yaml` の `peerDependencyRules.allowedVersions` を正とする）

- **経緯**: Vite+ 1.1.0 へ移行した際（後述の「Vite+（vp）への一本化の記録」）、`vite` が `@voidzero-dev/vite-plus-core@1.1.0`（Vite+ 版の vite）への別名に解決されるようになった。`vitest@5.0.3` と `@vitest/mocker@5.0.3` は peerDependencies に `vite: ^6.4.0 || ^7.0.0 || ^8.0.0`（`@vitest/mocker` は `^6.0.0 || ^7.0.0 || ^8.0.0`）を宣言しており、解決された版番号 `1.1.0` がこの範囲を満たさないため、`pnpm install` で unmet peer 警告が 2 件発生した。
- **判断理由**:
  - `@voidzero-dev/vite-plus-core@1.1.0` は vite 8.3.3 をそのまま同梱している（同パッケージの `package.json` の `bundledVersions` が `"vite": "8.3.3"` を宣言している）。peer の範囲を満たさないのは版番号の付け方の違いであり、vitest が要求する vite 8 系の機能は提供されている。
  - Vite+ はこの組み合わせ（vitest 5.0.3 と vite-plus-core 1.1.0）を `vite-plus@1.1.0` の依存として固定して配布しており、`vp test` はこの組み合わせで実行される。本リポジトリでも `pnpm test --run`（688 件）が成功した。
  - `vp migrate` は警告を `peerDependencyRules.allowAny: [vite, vitest]` と `allowedVersions` の `vite: "*"` / `vitest: "*"` で全面的に抑止したが、これは親セレクタによる限定を求める本セクションの方針に反するため採用しなかった。`allowAny` と `"*"` を削除し、親セレクタを付けた 2 件のルールへ置き換えた後、`pnpm install --resolution-only` で 2 件の警告が消えることを確認した。
- **許容範囲の限定**: 親セレクタを検証済みの vitest と @vitest/mocker の版に、許容する版を検証済みの vite-plus-core の版に限定している。vite-plus の更新で vitest または vite-plus-core の版が変わると本ルールは一致しなくなり、警告が再び顕在化する（fail fast）。
- **付け替えの記録**:
  - 2026-10-12（issue #272）: `vitest@5.0.3>vite: 1.1.0`、`@vitest/mocker@5.0.3>vite: 1.1.0` を追加した（vite-plus 1.1.0）。
  - 2026-10-19（PR #283）: vite-plus 1.2.0 への更新で vitest が 5.0.4、vite-plus-core が 1.2.0 になり、警告が 2 件再び出た。`vitest@5.0.4>vite: 1.2.0`、`@vitest/mocker@5.0.4>vite: 1.2.0` へ付け替え、`pnpm install --resolution-only` で 2 件の警告が消えることを確認した。判断理由は上記と変わらない（`@voidzero-dev/vite-plus-core@1.2.0` の `bundledVersions` は `"vite": "8.3.4"`）。
  - 2026-10-22（issue #286）: vite-plus 1.3.0 への更新で vitest が 5.0.5、vite-plus-core が 1.3.0 になり、警告が 2 件再び出た。`vitest@5.0.5>vite: 1.3.0`、`@vitest/mocker@5.0.5>vite: 1.3.0` へ付け替え、`pnpm install --resolution-only` で 2 件の警告が消えることを確認した。判断理由は上記と変わらない（`@voidzero-dev/vite-plus-core@1.3.0` の `bundledVersions` は `"vite": "8.3.4"`）。
- **解除条件**: vite-plus を更新した際は、`pnpm install --resolution-only` の出力で警告を確認し、親セレクタと許容する版を新しい組み合わせへ付け替える。Vite+ が vite-plus-core の版番号を vite の版番号と一致させた場合、または vitest が vite-plus-core を peer として受け付けるようになった場合は、本ルールを削除する。
- **残っている警告**: `vitest > tinyglobby 0.2.17 > fdir 6.5.0` の `unmet peer picomatch@4.0.4: found 4.0.7` は、移行前の main（`vite 8.3.3 > tinyglobby 0.2.17 > fdir 6.5.0`）から出ている警告であり、Vite+ の移行・更新では扱わない（最終確認: 2026-10-22、vite-plus 1.3.0 > vitest 5.0.5、issue #286）。

## zod の強制（`"@google/clasp@<版>>zod"`）の記録

本節は、zod の強制の判断理由と、clasp を更新するときの手順の正本である（`pnpm-workspace.yaml` のコメントと `tests/dependencies/zod-override.test.ts` は本節を参照する）。

### 経緯と構成（2026-10-24、issue #291）

- zod の GHSA-mrhx-c7xc-m3w5（high。4.6.6 未満が対象。3 系には修正版がない）に対応するため、`pnpm-workspace.yaml` の overrides に `"@google/clasp@3.4.1>zod": ">=4.6.6 <5"` を置いている。`@google/clasp` 3.4.1 は zod を `^3.25.76` で要求するため、これは clasp の宣言範囲の外（3 系 → 4 系）への強制である。
- clasp 3.4.1 で、zod 4.6.7 のまま `clasp --version`、認証とリモートへの問い合わせを伴う `clasp deployments`、MCP サーバーの構築（`buildMcpServer`）が成功することを確認した。clasp は、コマンドの定義から MCP サーバーのモジュール（zod を使う）を静的に読み込む。
- 範囲外への強制は、動作を確認した clasp の版だけに限る（親セレクタに版を書く）。clasp を更新すると強制は外れる。そのため `tests/dependencies/zod-override.test.ts` が、次の 2 点を必須チェックの Unit Tests で検査する。Dependency Audit は必須チェックではなく、Dependabot の patch 更新は Lint と Test の成功だけで自動マージされる（`.github/workflows/dependabot-auto-merge.yml`）ためである。clasp の更新 PR は、他の devDependencies の更新を止めないよう、Dependabot の development グループから外して個別 PR にしている（`.github/dependabot.yml`）。
  - 親セレクタの版と、ロックファイルで解決された clasp の版が一致すること。
  - ロックファイルの zod の全版が 4.6.6 以上であること。

### clasp を更新するとき

1. `tests/dependencies/zod-override.test.ts` の「親セレクタに書いた clasp の版が…一致する」が失敗する（Dependabot の PR では Unit Tests が失敗し、自動マージが止まる）。
2. 新しい clasp の `package.json` で zod の宣言範囲を確認し、次の 3 つの場合に分けて対応する。
   - 宣言範囲が 4.6.6 以上だけを許す場合（例: `^4.6.6`）: overrides の `"@google/clasp@<版>>zod"` と `tests/dependencies/zod-override.test.ts` を削除し、`.github/dependabot.yml` の development グループの `exclude-patterns` から `"@google/clasp"` を削除する。zod の脆弱な版の検出は `pnpm audit` が担う。
   - 宣言範囲が 4.6.6 以上と脆弱な版の両方を許す場合（例: `^3.25.76 || ^4`）: overrides の `"@google/clasp@<版>>zod"` と、`tests/dependencies/zod-override.test.ts` の 1 つ目のテスト（親セレクタの版の一致）を削除する。2 つ目のテスト（ロックファイルの zod がすべて 4.6.6 以上）は残す。依存の解決で脆弱な版へ戻った場合に、必須チェックの Unit Tests で止めるためである（Dependency Audit は必須チェックではない）。`.github/dependabot.yml` の `exclude-patterns` の `"@google/clasp"` は残す。
   - zod 3 系だけを許す場合: 新しい clasp で、zod 4 系のまま次の 3 点を確認する（いずれも本番の GAS を変更しない）。問題がなければ、親セレクタの版を新しい clasp の版へ付け替える。
     - `pnpm exec clasp --version` が成功する（起動時に MCP サーバーのモジュールと zod を読み込む）。
     - `pnpm exec clasp deployments` が成功する（認証とリモートへの問い合わせを伴う読み取り専用のコマンド）。
     - clasp の `build/src/mcp/server.js` の `buildMcpServer({})` が例外を投げずに MCP サーバーを返す（zod のスキーマを構築する）。
3. `pnpm install` 後に `pnpm audit --audit-level moderate` と `pnpm test --run` が成功することを確認する。

## TypeScript 7（ネイティブ実装）と JS API の併存の記録

### エイリアス devDependency `typescript-js-api`（2026-07-23 追加、issue #175 Phase 2）

- **経緯**: TypeScript を 6.0.3 → 7.0.2（ネイティブ実装、通称 tsgo）へ更新した際、`typescript@7` の npm パッケージが従来の JS コンパイラ API（`ts.sys`・`ts.createSourceFile`・`ts.resolveModuleName` 等）を同梱しなくなっていることが判明した（パッケージのエクスポートは `version` と、明示的に不安定な `typescript/unstable/*` のみ）。本リポジトリでは `scripts/check-architecture.mjs` と `scripts/check-typescript-rules.mjs`（いずれも `pnpm lint` の構成要素）がこの JS API に依存しており、TS 7 単独では `pnpm lint` が失敗する。
- **対応**: `package.json` の devDependencies にエイリアス `"typescript-js-api": "npm:typescript@^6.0.3"` を追加し、上記2スクリプトの import を `typescript` から `typescript-js-api` へ変更した。型チェック（`pnpm typecheck` = `tsc --noEmit`）はネイティブ実装の `typescript@7` を使用する。
- **判断理由**:
  - TypeScript 7 の `typescript/unstable/*` API は名前のとおり不安定と明言されており、lint 基盤をそこへ移行するのは時期尚早である。
  - TypeScript 6 系は JS 実装ベースの最終系として API 利用者向けに提供され続けており、2スクリプトが使う API（tsconfig 解析・ソース解析・モジュール解決）は安定している。
  - エイリアス併存は devDependencies のみに閉じ、GAS へのビルド成果物・実行時挙動には一切影響しない。
- **Dependabot の扱い（2026-07-26 追加）**: 本エイリアスの6系固定は「更新の遅れ」ではなく意図的な設計判断であるため、[dependabot.yml](../.github/dependabot.yml)の`ignore`で`typescript-js-api`のmajor更新を除外している。除外しない場合、Dependabotが7系への更新PRを提案し、上記の`pnpm lint`破壊を招く。なおDependabotのエイリアス依存（`npm:typescript@^6.0.3`形式）の扱いによっては本除外設定がマッチしない可能性があるが、その場合でも当該更新は`pnpm lint`の失敗としてCIで検知される（fail fast）。
- **解除条件**: TypeScript 本体が安定版の JS API（`unstable` プレフィックスの外れた API）を提供し、2スクリプトをそれへ移行した時点で `typescript-js-api` を削除する。もしくは2スクリプトを TS コンパイラ非依存の実装（oxc 等）へ置き換えた時点で削除する。この際、上記の Dependabot 除外設定もあわせて削除する。

## Tailwind CSS v4 移行の記録

### tailwindcss 3.4 → 4.3 と `@tailwindcss/cli` の導入（issue #176）

- **経緯**: tailwindcss が 3.4.19 → 4.3.3 と1メジャー遅れていた（issue #176 起票時点では dependabot.yml が semver-major を一括 ignore していたが、2026-07-26 の方針変更（#187）以降はメジャー更新も個別 PR で検知される）。Tailwind v4 は CLI の別パッケージ分離・CSS-first 設定への転換という破壊的変更を含み、ビルド構成（`scripts/build-styles.sh` / `tailwind.config.js` / `src/ui/input.css`）の書き換えを伴うため、Dependabot の自動 PR ではなく手動で移行した。
- **対応**:
  - devDependencies に `@tailwindcss/cli@^4.3.3` を追加し、`tailwindcss` を `^4.3.3` へ更新した。v4 では CLI が別パッケージへ分離されたが、バイナリ名は `tailwindcss` のまま変わらないため、`scripts/build-styles.sh` のビルドコマンド自体は無変更で動作する。
  - `tailwind.config.js` を削除し、設定を `src/ui/input.css` の CSS-first 形式へ移行した（`@import 'tailwindcss' source(none)` ＋ `@source './**/*.html'` で v3 の content 設定と同一の走査範囲を明示、`@theme` で fontFamily / boxShadow の拡張を移行）。
  - devDependencies が 13 件 → 14 件へ増えたため、`open-pull-requests-limit` を 15 → 16 へ引き上げた（算出根拠は上記「Dependabotによる自動化」セクションの記載を正とする）。
- **判断理由**:
  - `tailwindcss` と `@tailwindcss/cli` は**同一メジャーで揃える必要があるパッケージ対**である。Dependabot のメジャー更新は1パッケージ1PRのため、将来 v5 系が出た際は両者を同時に上げる必要がある（片方のみのマージは不整合を生む）。この対応は typescript / typescript-js-api の対と同様に本セクションを参照して行う。
  - Google Fonts を読み込まない判断: 後述のとおりフォントは v3 時代から配信されておらず、読み込みを追加すると表示フォントが変わる（挙動変更）ため、v4 移行（挙動不変）では追加しない。`scripts/build-styles.sh` が styles.html に埋め込む fonts.googleapis.com / fonts.gstatic.com への preconnect タグは残置した。注意: preconnect はフォント CSS を取得しなくても両ホストへの DNS 解決・TCP/TLS 接続を先行実行させるため、「何も起きないヒント」ではない（フォント未配信の現状では便益のない外部接続が発生している）。残置理由は、既存出力（styles.html）を変えない挙動不変方針と、フォント読み込み有効化の判断（別 issue）で必要になり得るためであり、有効化しないと判断した場合は preconnect も併せて削除する。
- **移行時に確認した事実**:
  - v3/v4 の生成 CSS の**ユーティリティクラスのセレクタ集合**の差分は `.filter` の消失のみ（Preflight 等の非クラスセレクタや宣言の記法は v4 で変わっており、生成 CSS 全体の同一性を意味しない）。消失した `.filter` は v3 のスキャナが JS メソッド名（`performance-scripts.html` の `data.filter(...)` 等）を誤検出して生成していた未使用クラスであり、HTML のどの要素にも使われていないため視覚影響はない。使用中クラスの欠落はない。
  - Google Fonts の `@import url(...)` は v3 時代から出力 CSS に含まれていなかった。原因は `@tailwind` ディレクティブ後という CSS として不正な位置に置かれていたことであり、**minify の有無に関わらず**ビルド時に除去される（`--minify` なしのビルドでも消失することを実測確認済み）。
  - レイアウト系クラス（余白・グリッド・角丸等）の解決後の出力値は v3 と同一（v4 は `calc(var(--spacing) * N)` 形式だが計算結果は一致）。
  - v4 の既定パレットは OKLCH 化されており、**色値はわずかに変化する**（実測例: slate-900 `#0f172a` → `#0f172b`、emerald-500 `#10b981` → `#00bb7f`。カスタムテーマの `shadow-panel` は `rgba(0,0,0,.35)` → `#00000059` で等価）。
- **実機確認（issue #176 の完了条件。ユーザーが実施）**:
  1. ポートフォリオタブ: カード（`shadow-panel`）・サマリー数値・詳細開閉が崩れていないこと。
  2. 取引フォーム: 入力欄（`bg-slate-950/40` 系）・約定日のカレンダーボタン（白色アイコン）・登録ボタンの配色。
  3. 積立設定フォーム: 一覧・フォームの配色とレイアウト。
  4. パフォーマンス推移タブ: タブ切替（`data-[active=true]` 系）とチャート周辺のレイアウト。
  5. 全体: 成功/エラーメッセージ（emerald / rose 系。**emerald-500 は色変化が最も大きい**）の視認性。

## Aikido Safe Chain の記録

### 導入の構成（2026-10-09、issue #267）

- **目的**: 依存パッケージの取得を、マルウェア検査と最小経過時間ガードの対象にする。最小経過時間ガードは、公開から一定時間が経過していない版を取得させない仕組みであり、公開直後に混入した悪性コードの検知が間に合わない期間を避けるためのものである。
- **CI**: `.github/actions/setup-safe-chain/action.yml`（composite action）が、版を固定したインストーラを SHA256 検証付きで `--ci` モードで実行し、`pnpm safe-chain-verify` の出力に `OK: Safe-chain works!` が含まれることを確認する。test.yml / lint.yml / security.yml の audit ジョブは、`pnpm install` の直前にこの action を呼び出す。security.yml の report ジョブは依存をインストールしないため、Safe Chain を導入しない。
- **ローカル**: 開発者は README の「セットアップ > インストール」の手順で、CI と同じ版を導入する。
- **最小経過時間**: リポジトリ直下の `.aikido` に `minimumPackageAgeHours: 48` を記載し、ローカルと CI で共有する。`.aikido` は Safe Chain 1.5.15 以降でのみ読み込まれる。1.5.24 で、本リポジトリの `.aikido` を置いた環境ではインストールが成功し、値を極端に大きくした環境では全版が除外されて失敗することを実機で確認した。
- **Dependabot との関係**: `.github/dependabot.yml` の npm エントリに `cooldown.default-days: 3`（72 時間）を明記している。cooldown が最小経過時間（48 時間）より短いと、Dependabot が提案した版を CI の Safe Chain が取得できずに失敗する。Dependabot は未設定でも既定で 3 日の cooldown を適用するが、この前提を設定上で明示するために記載した。PR #263（2026-10-03 作成）で更新された 4 パッケージは、いずれも npm 公開から 132〜226 時間後に提案されていた。

### 注意点

- **推移的依存**: Dependabot がロックファイルを再生成するとき、推移的依存が公開から 48 時間未満の版に解決されることがある。この場合、CI の `pnpm install --frozen-lockfile` が Safe Chain に止められて失敗する。Safe Chain 1.4.6 以降は、ロックファイルからの取得など、メタデータを経由しない直接ダウンロードにも最小経過時間を適用するためである。公開から 48 時間が経過した後にジョブを再実行すれば解消する。
- **脆弱性対応**: 公開直後の修正版を `pnpm-workspace.yaml` の `overrides` で強制する場合、Aikido が安全と確認した修正版（safe patches list。Safe Chain 1.5.21 以降）を除き、48 時間待つ必要がある。この制約は issue #204 のときからローカルの Safe Chain で発生しているものと同じである。
- **キャッシュ**: `actions/setup-node` の `cache: 'pnpm'` で復元されたパッケージはダウンロードされないため、Safe Chain の検査を経由しない。導入時は、導入前に作成された pnpm ストアのキャッシュを `gh cache delete --all` で削除する。

### 版の更新手順

Safe Chain の版は composite action とインストール手順に直接書いているため、Dependabot の追跡対象にならない。更新は次の手順で手動で行う。

1. [Safe Chain のリリース一覧](https://github.com/AikidoSec/safe-chain/releases)で新しい版の変更内容を確認する。
2. 新しい版のリリース資産から、Unix/Linux/macOS 用インストーラ（`install-safe-chain.sh`）の SHA256 を算出する。`<版>` は新しい版の番号に置き換える。

   ```bash
   curl -fsSL https://github.com/AikidoSec/safe-chain/releases/download/<版>/install-safe-chain.sh | shasum -a 256
   ```

3. 手順 2 の値を、Safe Chain リポジトリの **main ブランチ**の README に記載されたインストール手順の SHA256 と照合する。照合は、README の手順が新しい版の URL を指していることを確かめてから行う。一致しない場合は更新を中止し、原因を調査する。
   - 注意: 版のタグ時点の README は参照しないこと。README はリリース後に更新されるため、タグ時点の README には前の版の値が載っている。実例として、タグ `1.5.24` の README には 1.5.23 の URL と SHA256（`b7eac1c7…`）が記載されている。
4. 次の 2 ファイルの版と SHA256 を、同じ値へ同時に書き換える。
   - `.github/actions/setup-safe-chain/action.yml` の `SAFE_CHAIN_VERSION` と `SAFE_CHAIN_INSTALLER_SHA256`
   - `README.md` の「必要環境」と「インストール」に記載した版と SHA256
5. 開発者のローカル環境で、README の手順を実行して同じ版へ更新する。
6. PR の CI で、test.yml / lint.yml / security.yml の `Verify safe-chain` ステップが成功することを確認する。

## Vite+（vp）への一本化の記録

### 経緯（2026-10-12、issue #272）

- `docs/plans/vite-https-viteplus-dev-wobbly-acorn.md` は、`package.json` の scripts と CI が単体パッケージ（`vite` / `vitest` / `oxlint` / `oxfmt`）を直接呼ぶ「正規経路」と、ローカル専用の `vp` を併存させる二層構成を定めていた。2026-10-11 に main（vite-plus 0.3.1）で実測したところ、`vp build`（`pnpm.overrides.vite` が vite-plus 内部の別名まで上書きしていた）と `vp check`（`.oxfmtrc.json` を読まず既定値で検査していた）が失敗し、両経路の結果が一致するのは `vp test` だけであった。
- 二層構成で `vp` をローカル限定とした理由は「Vite+ は alpha 版」であったが、Vite+ 1.0 が 2026-09-28 に安定版として公開されたため、この理由は解消した。
- このため、vite-plus を 1.1.0 へ更新し、ビルド・テスト・lint・整形を `vp` に一本化した。単体の `oxfmt` / `oxlint` は devDependencies から削除し、`vite` は `@voidzero-dev/vite-plus-core`（Vite+ 版の vite）への別名、`vitest` と `@vitest/coverage-v8` は 5.0.3 になった。

### 構成

| 項目 | 内容 |
|---|---|
| 設定の正本 | `vite.config.ts` の `build`（ビルド）・`test`（Vitest。`vitest.config.ts` から移動）・`fmt`（Oxfmt。`.oxfmtrc.json` から値を変えずに移動）・`lint`（Oxlint。CLI 引数 `--import-plugin --promise-plugin --deny-warnings` から移動） |
| scripts | `build:js` = `vp build`、`test` = `vp test`、`lint:oxlint` = `vp lint`、`format` = `vp fmt`、`format:check` = `vp fmt --check`。対象パスや CLI 引数を渡さないため、検査範囲とルールは `vite.config.ts` だけで決まり、`vp check` と scripts の結果が一致する |
| 整形の範囲 | `.gitignore` の対象を除くリポジトリ全体から、Markdown と YAML（`**/*.md`・`**/*.yml`・`**/*.yaml`）を除いたもの。移行前の `format:check` の対象（src・tests・scripts・vite.config.ts・package.json）に、整形済みであった JSON / TOML の 6 ファイル（`.claude/settings.json`・`appsscript.json`・`tsconfig.json`・`tsconfig.build.json`・`mise.toml`・`.clasp.json.example`）が加わった。Oxfmt の `ignorePatterns` では、ルート直下のファイルを否定パターンで対象へ戻せない（Oxfmt 0.72.0 で確認）ため、許可リストではなく除外リストで指定している |
| lint の範囲 | src・scripts・vite.config.ts（移行前と同じ）。tests は `lint.ignorePatterns` で除外している |
| lint-staged | `vp fmt`、`vp lint --fix`、`vp test related --run` を呼ぶ。husky（`.husky/pre-commit` の `pnpm lint-staged`）は維持し、`vp staged` へは移行していない |
| pnpm の設定 | `vp migrate` が `package.json` の `pnpm`（overrides / auditConfig / peerDependencyRules）を `pnpm-workspace.yaml` へ移した。`pnpm.overrides.vite` は削除され、`overrides` の `vite@*` / `vitest@*` が `catalog` の版を指す |
| catalog | `pnpm-workspace.yaml` の `catalog` に、`vite-plus`・`vite`（`npm:@voidzero-dev/vite-plus-core@<版>`）・`vitest`・`@vitest/coverage-v8` の版を置く。4 項目は vite-plus の版に合わせて同時に更新する |

### バンドルされた依存の監査可能性（issue #272 の方針 6-1 の結論）

調査した事実（2026-10-12）:

1. **バンドルの確認**: `@voidzero-dev/vite-plus-core@1.1.0` の配布物（npm の tarball）には `dist/vite`・`dist/rolldown`・`dist/tsdown` が含まれ、`package.json` の `bundledVersions` が `{"vite":"8.3.3","rolldown":"1.2.12","tsdown":"0.23.0"}` を宣言している。さらに、配布物の `//#region` コメントから、130 個のパッケージパスがインライン化されていることを確認した（`vite-plus@1.1.0` の配布物は 34 個）。インライン化されたパッケージは `pnpm-lock.yaml` に現れないため、`pnpm-workspace.yaml` の `overrides` で修正版へ強制できない。
2. **`pnpm audit` の検出範囲**: vite 8.0.3 を同梱した `vite-plus@0.1.15` だけを依存に持つ検証用プロジェクトで `pnpm audit` を実行した。影響パッケージに `vite-plus <=0.1.23` を明記した GHSA-fx2h-pf6j-xcff は検出されたが、vite 8.0.0〜8.0.4 に該当する GHSA-p9ff-h696-f583（high）・GHSA-v2wj-q39q-566r（high）・GHSA-4w7w-66w2-5vf9 は検出されなかった。`pnpm audit` がバンドルされた vite の脆弱性を検出できるのは、アドバイザリの作成者が `vite-plus` を影響パッケージに書き加えた場合だけである。
3. **Vite+ 側の告知**: Vite+ はリリースノートで同梱した vite の修正を告知している（v0.1.16 は、上記 3 件のアドバイザリと同じ 2026-04-06 に「Security: 3 Vite dev server vulnerabilities patched」と告知した）。各リリースノートには上流の版の表（vite / rolldown 等）がある。一方、リポジトリの GitHub Security Advisories は Vite+ 自身のコードに関する 1 件（GHSA-33r3-4whc-44c2）だけであり、SECURITY.md はない。インライン化された推移的依存は追跡されておらず、1.1.0（2026-10-07 公開）は 2026-03-25 に公表された picomatch のアドバイザリ（GHSA-c2c7-rcm5-vvqj、high）に該当する picomatch 2.3.1 を同梱している。
4. **移行前との比較**: 移行前の単体の vite 8.3.3 も braces 3.0.3 と postcss-selector-parser 7.1.1 を同梱しており、vite-plus 0.3.1 も brace-expansion 5.0.3 を同梱していた。これらのアドバイザリは、移行前から `pnpm audit` で検出されていなかった。移行によって新たに入ったのは picomatch 2.3.1 である（単体の vite 8.3.3 は picomatch を通常の依存として解決し、overrides により 4.0.7 以上であった）。

結論（代わりの監視方法）:

- `scripts/check-bundled-advisories.mjs` を追加した。`vite-plus` と `@voidzero-dev/vite-plus-core` の配布物から、インライン化されたパッケージの名前と版（`//#region` コメントの pnpm ストアのパス）と `bundledVersions`（vite / rolldown / tsdown）を抽出し、npm レジストリの bulk アドバイザリ API（`/-/npm/v1/security/advisories/bulk`）と照合する。`pnpm audit` と異なりパッケージ名と版で直接照合するため、上記 2 の GHSA-p9ff-h696-f583 なども検出できる（vite 8.0.3 を照合して確認した）。
- `.github/workflows/security.yml` の audit ジョブ（PR・main への push・毎日の schedule）で、`pnpm audit` の後に実行する。監査レベルは `pnpm audit` と同じ `moderate` である。ローカルでは `pnpm audit:bundled` で実行できる。
- 修正版を取り込む手段が「Vite+ 側の更新を待つ」以外にない検出は、影響経路を評価したうえで `scripts/bundled-advisory-exceptions.mjs` に例外として記録する。例外は同梱元の版（例: `@voidzero-dev/vite-plus-core@1.1.0`）まで一致した場合にだけ適用されるため、vite-plus を更新すると検査が失敗し、例外の再評価が強制される。どの検出にも一致しない例外があっても検査は失敗する。
- 2026-10-12 時点の例外は 4 パッケージ・12 件である（braces 3.0.3、picomatch 2.3.1、postcss-selector-parser 7.1.0、brace-expansion 5.0.3）。いずれも開発時にだけ使われ、入力（glob パターン・CSS）は外部から渡らず、GAS へデプロイする成果物に含まれない。各例外の理由・影響経路の評価・解除条件は同ファイルのコメントに記録している。現在の例外は `scripts/bundled-advisory-exceptions.mjs` を正とする（その後の追加・削除の経緯は「履歴」の節を参照）。
- 限界: 本検査が対象にするのは JavaScript にインライン化されたパッケージだけであり、プラットフォーム別のネイティブバイナリ（`@voidzero-dev/vite-plus-<OS>-<CPU>`）に静的リンクされた Rust のクレート（rolldown・oxc 等）は対象外である。rolldown については、`bundledVersions` の版を npm の `rolldown` パッケージのアドバイザリと照合することで代替している。
- 定期監査（schedule）で本検査だけが失敗した場合、report ジョブが起票する issue のアドバイザリ一覧は 0 件になる（report ジョブは依存をインストールせず、`pnpm audit` だけを再実行するため）。issue 本文には、同梱パッケージの検査で検出した可能性を明記し、実行ログの確認を促している。

### peer 依存の検査（issue #272 の方針 6-2 の結論）

`vp migrate` が追加した `peerDependencyRules.allowAny: [vite, vitest]` と `allowedVersions` の `vite: "*"` / `vitest: "*"` を削除し、親セレクタで限定した 2 件のルールへ置き換えた。詳細は「peer 依存の明示的許容（peerDependencyRules）の記録」の `vitest@<版>>vite` の項を参照。

### Dependabot と catalog の関係

- Dependabot は pnpm の catalog を更新対象として扱う（2025-02-04 に GA）。ただし、vite-plus の更新では `catalog` の `vite-plus` だけを更新し、`vite`（vite-plus-core の別名）・`vitest`・`@vitest/coverage-v8` は更新しない。他リポジトリの Dependabot PR（Asura7170/cortar-ordenar-facturas#62、vite-plus 1.0.0 → 1.1.0）で、`pnpm-workspace.yaml` の差分が `vite-plus: 1.0.0 → 1.1.0` の 1 行だけであることを確認した。
- 本リポジトリで、`catalog` の `vite-plus` だけを 1.0.0 に変えて `pnpm install` した状態を再現したところ、`vp lint` と `vp test --run`（667 件）は成功し、`vp build` だけが `Expected @voidzero-dev/vite-plus-core@1.0.0, but found @voidzero-dev/vite-plus-core@1.1.0 ... Run vp migrate to align the Vite alias` で失敗した（`vp fmt --check` も失敗したが、これは同梱 Oxfmt の版の違いによる偶発的な失敗である）。
- このため次の 3 点を設定した。
  - `.github/workflows/test.yml` の Unit Tests ジョブに `pnpm build` を追加した。Unit Tests は main のルールセットの必須チェックであるため、vite-plus だけを更新した Dependabot PR は失敗し、自動マージ（`dependabot-auto-merge.yml`）も止まる。
  - `.github/dependabot.yml` で `vite`・`vitest`・`@vitest/coverage-v8` の全更新を `ignore` で除外した。これらの版は vite-plus が決めるためである。
  - `.github/dependabot.yml` の `development` グループから `vite-plus` を `exclude-patterns` で外した。vite-plus の更新 PR は上記のとおり `vp migrate` まで CI が失敗するため、グループに含めると他の devDependencies の更新まで止まる。
- `scripts/check-bundled-advisories.mjs` も、`vite-plus` と `@voidzero-dev/vite-plus-core` の版が一致しない場合に失敗する。

### vite-plus の更新手順

Dependabot が vite-plus の更新 PR を作成した場合、または手動で更新する場合は、次の手順で行う。`<版>` は更新先の vite-plus の版に置き換える。

1. main から作業ブランチを作成する（Dependabot の PR を使う場合は、その PR のブランチを取得する）。
2. vite-plus の移行ツールを Safe Chain 経由で実行し、`catalog` の `vite-plus`・`vite`・`vitest`・`@vitest/coverage-v8` をそろえる。`pnpm` はシェルの関数として Safe Chain に包まれており、Safe Chain が子プロセスへ渡す `HTTPS_PROXY`（ローカルの検査プロキシ）と `NODE_EXTRA_CA_CERTS` により、`vp migrate` が内部で起動する `pnpm` の取得も検査の対象になる（2026-10-12 に Safe Chain 1.4.2 で確認）。`--no-agent` / `--no-editor` は、`CLAUDE.md` / `AGENTS.md` やエディタの設定を書き換えさせないために付ける。

   ```bash
   pnpm dlx --package=vite-plus@<版> vp migrate --no-interactive --no-agent --no-editor
   ```

   注意: ローカルの Safe Chain は README の「必要環境」に記載した版を使うこと。`.aikido` を読まない古い版（1.5.15 未満）は、Safe Chain の既定の最小経過時間で依存を解決する。そのため、CI の Safe Chain（`.aikido` の 48 時間）が取得を拒否する版でロックファイルが作られることがある。2026-10-12 の移行では、ローカルの Safe Chain 1.4.2 が公開から約 25 時間の `tinybench@6.2.2`（vitest 5.0.3 の依存）を解決し、CI の `pnpm install --frozen-lockfile` が `blocked by safe-chain direct download minimum package age` で失敗した。`SAFE_CHAIN_MINIMUM_PACKAGE_AGE_HOURS=48 pnpm update tinybench` で、公開から 48 時間以上が経過した 6.2.1 へ解決し直して解消した。

3. `pnpm exec vp toolchain vitest` で同梱 Vitest の版を確認し、`catalog` の `vitest` と `@vitest/coverage-v8` がその版であることを確認する。
4. `pnpm install --resolution-only` で peer 依存の警告を確認し、「peer 依存の明示的許容（peerDependencyRules）の記録」の `vitest@<版>>vite` のルールを新しい組み合わせへ付け替える。`vp migrate` は実行のたびに `peerDependencyRules.allowAny: [vite, vitest]` と `allowedVersions` の `vite: '*'` / `vitest: '*'` を追加し、`overrides` の `"catalog:"` のクォートをシングルクォートへ書き換える（vite-plus 1.2.0 と 1.3.0 の `vp migrate` で確認）。全面抑止は本ドキュメントの方針に反するため削除し、クォートは元に戻す。
   - `vp migrate` の最終段の自動整形は `Expected at least one target file. All matched files may have been excluded by ignore rules.` で失敗する。整形しようとする `pnpm-lock.yaml` / `pnpm-workspace.yaml` を `vite.config.ts` の `fmt.ignorePatterns`（`**/*.yaml`）で除外しているためであり、対処は不要である（`vp migrate` 自体は終了コード 0 で終わる）。
5. `pnpm audit:bundled` を実行し、`scripts/bundled-advisory-exceptions.mjs` を再評価する。解消した例外は削除し、引き続き該当する例外は同梱元の版を更新し、新たな検出は影響経路を評価して対応または記録する。
6. `pnpm lint`・`pnpm format:check`・`pnpm test --run`・`pnpm build`・`pnpm exec vp check` が成功することを確認する。`dist/` を更新前の `dist/` と `diff -r` で比較し、差分がある場合はその内容を PR に記載する。
7. `vp migrate` が `vite.config.ts` に Vitest の互換設定などを追加した場合は、その内容と理由を PR に記載する。

### 移行時に確認した事実（2026-10-12）

- `pnpm build` の `dist/` は、移行前の main の `dist/` と完全に一致した（`diff -r` で差分なし）。`vp build` の後に `pnpm build:css` を実行した場合も一致した。
- 移行前の main と同じテスト集合（55 ファイル 667 件）は、Vitest 5.0.3 ですべて成功した。`pnpm test --run --coverage` の対象ファイル集合も、移行前（Vitest 4.1.11）の 53 ファイルと一致した。
- `vp lint --print-config` の有効なプラグイン（unicorn / typescript / oxc / import / promise）とルール（116 件）は、移行前の `oxlint src --import-plugin --promise-plugin --print-config` と一致した。差分は `--deny-warnings` を置き換えた `options.denyWarnings: true` だけである。
- 依存総数（`pnpm audit` の totalDependencies）は 535 から 501 へ減った。
- `vp migrate` は最終段で、変更したファイルを Oxfmt の既定値（ダブルクォート・末尾カンマ all）で再整形した。`fmt` ブロックへ `.oxfmtrc.json` の設定を移した後に再整形し、tests 配下 56 ファイルの差分を `from 'vitest'` → `from 'vite-plus/test'` の import 指定子の書き換えだけにした。
- `vp migrate` は `vite.config.ts` と `vitest.config.ts` の両方に `test.clearMocks: false`（Vitest v4 互換設定）を追加した。Vitest は `vitest.config.ts` を優先するため `vite.config.ts` 側の追加は効果がなかった。`vitest.config.ts` を `vite.config.ts` の `test` へ統合して一本化した。

### 対象外とした事項

- `lint.options.typeAware` / `typeCheck` の有効化（型情報を使うルールで新たな指摘が生じるため別 issue とする。型チェックは `pnpm typecheck` を維持する）
- Vitest v4 互換設定（`clearMocks: false`）の削除（公式の手順「Remove unneeded compatibility settings」に従い、別 issue で行う）
- `vp staged` / Vite+ のフックへの移行（husky と lint-staged を維持する）
- `package.json` への `"type": "module"` の追加
- pnpm 11 と Node 26 系への移行

## 参考資料

- [Semantic Versioning 2.0.0](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [Dependabot documentation](https://docs.github.com/en/code-security/dependabot)

## 履歴

2026-10-22 の項から、各項の日付（項の中に書く日付を含む）を日本時間で記載する。それより前の項は、時刻帯を明記せずに記載している。

- 2026-01-16: 初版作成
- 2026-07-23: TypeScript 5.9 → 6.0 更新（issue #175 Phase 1）に伴い、peer 依存の明示的許容の記録セクションを追加
- 2026-07-23: TypeScript 6.0 → 7.0 更新（issue #175 Phase 2）に伴い、許容レンジを拡張し、エイリアス devDependency `typescript-js-api` の記録セクションを追加。型チェック（`tsc --noEmit -p tsconfig.build.json` を pnpm を介さず直接実行、同一マシン・ウォーム状態・連続3回計測の実測レンジ）は TS 6.0.3（JS 実装）の約0.47〜0.49秒から TS 7.0.2（ネイティブ実装）の約0.08秒へ短縮（約6倍高速化）
- 2026-07-26: メジャーバージョンアップの検知方針を変更。`.github/dependabot.yml` の `version-update:semver-major` の ignore 設定を削除し、Dependabot がメジャー更新も検知して個別PRを作成するようにした（自動マージ対象外であることは従来どおり）。あわせて上限到達による取りこぼしを防ぐため `open-pull-requests-limit` を 10 から 15 へ引き上げ、意図的に6系へ固定しているエイリアス依存 `typescript-js-api` のみ major 更新を `ignore` で除外した
- 2026-08-02: tailwindcss 3.4 → 4.3 へ移行（issue #176）。CLI の `@tailwindcss/cli` 分離対応と CSS-first 設定への移行の記録セクションを追加。devDependencies 増（13→14件）に伴い `open-pull-requests-limit` を 15 から 16 へ引き上げ
- 2026-08-03: `engines.node` を `>=22.18 <23` から `>=22.22.1 <23 || >=24.11.0 <25` へ変更（issue #178）。22 系の下限は Dependabot PR #198 で導入された lint-staged@17 の要求（`>=22.22.1`）に由来し、Node 24 系の許容はユーザー判断（24 系の下限 24.11.0 は vite-plus の要求に由来。EOL 済みの非 LTS Node 23 系はレンジで機械的に除外。Corepack 同梱は Node 24 まで）。あわせてテスト・lint CI（test.yml / lint.yml）を 22 系・24 系のマトリクスへ拡張（security.yml の pnpm audit はロックファイルの静的検査でランタイム非依存のため単一バージョンのまま）
- 2026-08-04: 推奨ランタイムを Node 22.22 系（Maintenance LTS）から 24.19 系（現行の Active LTS 線）へ移行（issue #199）。mise.toml の pin を `24.19` へ更新し、security.yml の単一バージョンも `24` へ変更（test.yml / lint.yml の 22/24 マトリクスは engines が 22 系を許容する間は維持）。Node 24.19.0 実機で Corepack 同梱・`pnpm install`（engines WARN 解消）・lint・テスト（401件）・build・pre-commit（husky + lint-staged@17）の動作を確認済み
- 2026-10-08: `engines.node` を `>=22.22.1 <23 || >=24.11.0 <25` から `>=24.11.0 <25` へ変更し、Node 22 系を許容対象から外した（issue #265）。理由は次の 3 点である。(1) 実運用はすでに 24 系へ統一されていた（mise.toml の pin `24.19`、security.yml の単一バージョン `24`、ローカル開発環境の Node 24.19.0）。22 系は engines と test.yml / lint.yml のマトリクスにだけ残り、CI の実行回数を倍にしていた。(2) Node 22 系は Maintenance LTS で 2027-04-30 に EOL を迎えるため、残すと半年後に再度の移行が必要になる。(3) 全 devDependencies の engines が 24 系を許容している（node_modules の package.json で確認。vite-plus 0.3.1: `^20.19.0 || ^22.18.0 || >=24.11.0`、lint-staged 17.6.0: `>=22.22.1`、vitest 4.1.11: `^20.0.0 || ^22.0.0 || >=24.0.0`、oxlint 1.86.0 / oxfmt 0.71.0 / vite 8.3.1: `^20.19.0 || >=22.12.0`、typescript 7.0.2: `>=16.20.0`、@google/clasp 3.4.1: `>=20.0.0`、husky 9.1.7: `>=18`）。下限 24.11.0 は従来どおり vite-plus の要求に由来し、上限 `<25` は Corepack を同梱しない Node 25 系以降を除外する。あわせて test.yml / lint.yml の 22/24 マトリクスを廃止し、security.yml と同じ単一バージョン `24` へ揃えた（CI のジョブ名は `Unit Tests (22)` / `Unit Tests (24)` から `Unit Tests` へ、`Lint And Format Check (22)` / `Lint And Format Check (24)` から `Lint And Format Check` へ変わる）。Node 26 系は 2026-10-28 まで LTS ではなく、Corepack を同梱しないため pnpm の取得経路（README・mise.toml のコメント・CI の pnpm/action-setup）の見直しが必要になる。このため 26 系への移行は、LTS 化と Corepack 非同梱への対応方針が決まった後に別 issue で検討する。Node 24.19.0 実機で `pnpm install`（engines WARN なし）・lint・format チェック・テスト（651 件）の成功を確認済み
- 2026-10-09: Dependency Audit の定期監査化・PR 監査の限定と、Aikido Safe Chain の導入を行った（issue #267）。security.yml に毎日 21:17 UTC（06:17 JST）の schedule と workflow_dispatch を追加し、それらで監査が失敗したときは report ジョブが issue「Dependency Audit の定期監査で脆弱性を検出しました」を起票する（同じタイトルのオープン issue があればコメントを追記する。本文は scripts/build-audit-failure-issue.mjs が生成する）。pull_request での監査は package.json / pnpm-lock.yaml / security.yml を変更した PR に限定した。理由は、監査結果がコードではなく外部の脆弱性データベースで変わるため、新規アドバイザリの公表後に最初に CI を実行した無関係な PR が失敗していたことである（2026-10-03 の #261、2026-10-07 の #266。いずれもアドバイザリのレビュー完了から最初の CI 失敗まで CI が実行されていなかった）。あわせて CI の依存取得を Aikido Safe Chain 1.5.24 経由にし、`.aikido` で最小経過時間 48 時間を、dependabot.yml で cooldown 3 日を明示した（詳細は「Aikido Safe Chain の記録」を参照）
- 2026-10-12: Vite+ を 0.3.1 から 1.1.0 へ更新し、ツールチェーンを `vp` に一本化した（issue #272）。二層構成（scripts と CI は単体パッケージ、`vp` はローカル専用）を廃止し、設定を `vite.config.ts` の `build`・`test`・`fmt`・`lint` に集約した（`vitest.config.ts` と `.oxfmtrc.json` を削除）。pnpm の設定は `package.json` から `pnpm-workspace.yaml` へ移り、Vitest は 4.1.11 から 5.0.3 になった。バンドルされた依存は `pnpm audit` と `overrides` が効かないため、`scripts/check-bundled-advisories.mjs` で照合する検査を security.yml に追加した。Dependabot は catalog の vite-plus だけを更新するため、test.yml に `pnpm build` を追加し、dependabot.yml で `vite`・`vitest`・`@vitest/coverage-v8` を除外し、`vite-plus` を development グループから外した。devDependencies が 14 件から 12 件へ減ったことと除外の追加に伴い、`open-pull-requests-limit` を 16 から 11 へ変更した。詳細は「Vite+（vp）への一本化の記録」を参照
- 2026-10-19: vite-plus を 1.1.0 から 1.2.0 へ更新した（PR #283。Dependabot の PR に、「Vite+（vp）への一本化の記録」の「vite-plus の更新手順」で補正を加えた）。Dependabot は `catalog` の `vite-plus` だけを更新していたため、`vp migrate` で `vite`（`@voidzero-dev/vite-plus-core@1.2.0`。同梱の vite は 8.3.4、rolldown は 1.2.13）・`vitest` 5.0.4・`@vitest/coverage-v8` 5.0.4 へそろえた。peer 依存の許容ルールを付け替え、`vp migrate` が再追加した全面抑止を削除した。同梱パッケージの検出は 1.1.0 と同じ 4 パッケージ・12 件であり、1.2.0 の配布物でも影響経路の評価が成り立つことを確認して、例外の同梱元を 1.2.0 へ更新した。`pnpm build` の `dist/` は更新前と完全に一致し、`vp lint --print-config` の有効なプラグインとルール（116 件）も変わらなかった。テストは Vitest 5.0.4 で 689 件成功した
- 2026-10-22: Dependency Audit の失敗に対応した（issue #286）。(1) 2026-10-21 の定期監査（schedule）で、`scripts/check-bundled-advisories.mjs` が `@voidzero-dev/vite-plus-core@1.2.0` に同梱された follow-redirects 1.16.0 の 2 件（GHSA-8r9p-f939-6h3c・GHSA-q3jh-wrc6-jgq8。いずれも high。2026-10-21 公表）を検出した。修正版の 1.16.1 は 2026-10-01 に公開済みであるが、最新版の vite-plus 1.3.0 も 1.16.0 を同梱しており、vite-plus の更新では解消できない。配布物（`dist/vite/node/chunks/node.js`）を読み、follow-redirects を使うのは vite に同梱された http-proxy-3 だけであり、プロキシの設定で `followRedirects` が真の場合に限られること、そのプロキシを生成するのは `server.proxy` または `preview.proxy` が設定されたときだけであること、本リポジトリの `vite.config.ts` はいずれも設定していないことを確認し、`scripts/bundled-advisory-exceptions.mjs` に例外を追加した。この前提（解決後の `server.proxy` と `preview.proxy` がともに未設定であること）が崩れたときに例外が黙って適用され続けないよう、`vite.config.ts` に `forbidDevServerProxy` プラグインを追加した。同プラグインは設定の解決後（`configResolved`）に両者を確かめ、どちらかが設定されていれば `vp build`・`vp test` 等を失敗させる。同プラグインの検証は `tests/vite.config.test.ts` で行う。(2) 対応中の 2026-10-22 に公表された GHSA-p458-7748-mcp3（moderate。Vitest のサーバーが `server.fs.deny` を正しく適用しない。影響範囲は vite-plus 1.0.0-rc.0 以上 1.3.0 未満、@vitest/browser・@vitest/ui 5.0.0-beta.6 以上 5.0.5 未満）を、`pnpm audit` が検出するようになった。本リポジトリは UI・Browser Mode・api のいずれも使わないが、修正版へ強制する方針（issue #173）に従い、「vite-plus の更新手順」で vite-plus を 1.2.0 から 1.3.0 へ更新した。`vp migrate` で `vite`（`@voidzero-dev/vite-plus-core@1.3.0`。同梱の vite は 8.3.4、rolldown は 1.2.14）・`vitest` 5.0.5・`@vitest/coverage-v8` 5.0.5 へそろえ、peer 依存の許容ルールを付け替え、`vp migrate` が再追加した全面抑止を削除した。同梱パッケージの検出は 1.2.0 と同じ 5 パッケージ・14 件（同じ版）であった。1.2.0 と 1.3.0 の `dist/vite/node/chunks/node.js`・`build.js` の差分は、評価に関わる範囲ではバンドラによる識別子の改名だけであり、5 件の例外の影響経路の評価が成り立つことを確認して、例外の同梱元を 1.3.0 へ更新した。ロックファイルの全 512 版が公開から 48 時間以上経過していることを確認した。`pnpm build` の `dist/` は更新前と完全に一致し、`vp lint --print-config` の有効なプラグインとルール（116 件）も変わらなかった。テストは Vitest 5.0.5 で 693 件（上記のプラグインのテスト 4 件を含む）成功した
- 2026-10-24: Dependency Audit の失敗に対応した（issue #288）。(1) 2026-10-23 の定期監査（schedule）で、`pnpm audit` が ip-address 10.7.1 の GHSA-rxp7-6hxx-x8q5（moderate。2026-10-23 公表。`@google/clasp > @modelcontextprotocol/sdk > express-rate-limit > ip-address` 経由）を検出した。issue #173 の方針に従い、`pnpm-workspace.yaml` の overrides の完全一致の固定（`ip-address: 10.7.1`）を、セレクタ付きの範囲（`ip-address@>=10.0.0 <10.7.4: ">=10.7.4 <11"`）に改めた。完全一致の固定は、10.7.2〜10.7.4 が公開されても版を 10.7.1 に留め、依存元が将来より新しい版を要求した場合も古い版へ戻してしまうためである。新しい形は、10 系の脆弱な版だけを選んで修正版以上・次のメジャー未満へ強制する（同じブロックの `brace-expansion@>=4.0.0 <5.0.12: ">=5.0.12 <6"` と同じ形）。セレクタの下限を 10.0.0 にしたのは、9 系を要求する依存が加わった場合に、その依存を 10 系へ引き上げないためである。この書き方の規則は、`pnpm-workspace.yaml` の冒頭のコメント（overrides の判断理由の参照先）にも加えた。解決される版は修正版の 10.7.4（2026-10-12 04:34 公開）であり、依存元の express-rate-limit 8.7.0 の要求（`^10.2.0`）を満たす。ロックファイルの差分は ip-address だけである。(2) 対応中に、2026-10-23 に braces の GHSA-vfj7-8cjw-p6xm がアドバイザリごと撤回された（Withdrawn Advisory）ことが分かった。撤回により、`pnpm audit` は同 ID を報告しなくなり、`scripts/check-bundled-advisories.mjs` は `@voidzero-dev/vite-plus-core@1.3.0` の braces 3.0.3 の例外を「どの検出にも一致しない例外」として報告して失敗するようになった。このため、同梱パッケージの例外（`scripts/bundled-advisory-exceptions.mjs`）、`pnpm-workspace.yaml` の `auditConfig.ignoreGhsas`（唯一の項目だったため `auditConfig` ごと）、`.github/workflows/security.yml` の例外の記録を削除した。削除した例外の理由・影響経路の評価は、本項の変更より前の両ファイルを git の履歴で参照する。braces の例外を参照していた picomatch の例外のコメントは、影響経路の説明を自身に移した。同梱パッケージの例外は 4 パッケージ・13 件になった。`pnpm audit --audit-level moderate` と `pnpm audit:bundled` が成功し、`pnpm build` の `dist/` は変更前と完全に一致し、テストは 693 件成功した
- 2026-10-24: Dependency Audit の失敗に対応した（issue #291）。2026-10-24 に zod の GHSA-mrhx-c7xc-m3w5（high。大きな入力の検証によるメモリ枯渇。CVE-2023-54404）の対象範囲が 4.6.6 未満に更新され、3 系も対象になった。修正版は 4.6.6 以上だけである。(1) 通常の依存: zod 3.25.76 は `@google/clasp` 3.4.1（最新版）が `^3.25.76` で、`@modelcontextprotocol/sdk` 1.32.1 と `zod-to-json-schema` 3.25.2 が 3 系・4 系のどちらも受け付ける範囲で要求している。issue #173 の方針に従い、`pnpm-workspace.yaml` の overrides で zod 4.6.7（2026-10-13 公開）へ強制した。clasp の zod は宣言範囲の外（3 系 → 4 系）への強制になるため、動作を確認した clasp 3.4.1 だけに限る親セレクタ `"@google/clasp@3.4.1>zod": ">=4.6.6 <5"` で書いた。今後 zod 3 系だけを受け付ける依存が加わった場合も、黙って 4 系へ引き上げず、`pnpm audit` の失敗で見直させる（issue #288 の ip-address の下限と同じ考え方）。`@modelcontextprotocol/sdk` と `zod-to-json-schema` は宣言範囲を変えずに同じ zod 4.6.7 へ解決される。overrides の書き方の規則（`pnpm-workspace.yaml` の冒頭のコメント）に、この親セレクタの書き方を例外として追記した。clasp の更新で強制が外れたことと 4.6.6 未満の zod を必須チェックの Unit Tests で検出する `tests/dependencies/zod-override.test.ts` を追加し、clasp を Dependabot の development グループから外した。判断理由と clasp の更新手順は「zod の強制（"@google/clasp@<版>>zod"）の記録」の節に記載した。clasp 3.4.1 で、zod 4.6.7 のまま動作することを確認した（確認の項目は「zod の強制（"@google/clasp@<版>>zod"）の記録」の節）。(2) vite-plus 1.3.0 に同梱された zod 4.6.5: overrides が効かず、2026-10-24 時点の最新版の vite-plus 1.4.0 も 4.6.5 を同梱しているため、更新では解消できない。同梱物を読むのは `vp sync-versions`（外部の自動化ツール向けで、本リポジトリは使わない）の動的 import と、どこからも参照されず直接実行した場合にだけ動く `dist/sync-versions/bin.mjs` だけであることを確認し、`scripts/bundled-advisory-exceptions.mjs` に例外を追加した。vite-plus 1.4.0（2026-10-23 公開。CI の Aikido Safe Chain の 48 時間の制限により、2026-10-24 時点では取得できない）も zod 4.6.5 を同梱していることを、配布物（tarball）で確認した。同梱パッケージの例外は 5 パッケージ・14 件になった
