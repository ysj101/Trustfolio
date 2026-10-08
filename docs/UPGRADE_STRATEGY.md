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
- **majorバージョン**: Dependabotが検知して個別にPRを作成（自動マージ対象外。実際の適用は後述の「メジャーバージョンアップ手順」に従い手動で段階的に実施）。ただし意図的にバージョンを固定している依存は[dependabot.yml](../.github/dependabot.yml)の`ignore`で個別に除外する（現在の除外対象は`typescript-js-api`のみ。後述の「エイリアス devDependency `typescript-js-api`」を参照）

> **majorのPRの扱いについて**
>
> Dependabotが提案するのは常に最新バージョンへの1回のジャンプであり、複数メジャーを跨ぐ場合でも中間バージョンを経由するPRは作成されません。したがってmajorのPRは「新しいメジャーが出たことの検知」として扱い、Dependabotのブランチをそのままマージするのではなく、「メジャーバージョンアップ手順」に沿って段階的にアップグレードを実施してください。
>
> なおmajorは[dependabot.yml](../.github/dependabot.yml)の`groups`のいずれにも該当しないため、1パッケージにつき1本の個別PRとして起票されます。これにより、1つのメジャー更新を1PRで検証できます。

> **`open-pull-requests-limit` について**
>
> [dependabot.yml](../.github/dependabot.yml)の`open-pull-requests-limit`は、**個別PRとグループPRの合計**に対する上限です。上限に達するとDependabotは新規PRを黙って作成しなくなるため、メジャー更新の検知を取りこぼす原因になります。
>
> 最悪ケースは「`devDependencies`のうちmajor除外分を除く全件が同時にメジャー遅れ ＋ `development`グループPR 1本」です（`production`グループは`dependencies`が0件のためPRを生みません）。現在は`devDependencies`14件のうち`typescript-js-api`がmajor除外のため13本＋1本＝14本となり、予備2本を加えて上限を`16`に設定しています。
>
> **依存パッケージを追加する際は、この上限の見直しが必要かどうかを必ず確認してください。**

依存関係の正本は `pnpm-lock.yaml` です。開発者は `npm` を使わず、`pnpm` と `package.json` の `packageManager` / `engines` に従って作業します。

#### 自動マージの条件

パッチバージョンの更新は以下の条件を満たすと自動的にマージされます：

1. Dependabotが作成したPRであること
2. パッチバージョン（`x.y.z`の`z`部分）の更新であること
3. Lint（ESLint）が成功すること
4. Test（Vitest）が成功すること

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

`package.json` の `pnpm.peerDependencyRules.allowedVersions` に設定した許容ルールは、暗黙のフォールバックを避けるため、必ず本セクションに判断理由を記録します。

### `@formatjs/intl@3.1.8>typescript: ^6.0.0 || ^7.0.0`（2026-07-23 追加）

- **経緯**: TypeScript を 5.9.3 → 6.0.3 へ更新した際（issue #175 Phase 1）、`@google/clasp@3.3.0` の推移的依存 `@formatjs/intl@3.1.8` が peerDependencies に `typescript: ^5.6.0`（optional）を宣言しているため、`pnpm install` で unmet peer 警告が発生した。
- **判断理由**:
  - `@formatjs/intl` の typescript peer は `peerDependenciesMeta` で optional 宣言されており、TypeScript は同パッケージの型定義利用時のみ関与する。clasp は `@formatjs/intl` を CLI メッセージの国際化（実行時処理）に使用しており、本リポジトリの `tsc --noEmit` 型チェック対象（`src/`）にも含まれない。
  - `@formatjs/intl` は 4.1.x で typescript peer 宣言自体を撤廃済みだが、clasp が依存するのは 3.1.8 であり、メジャーを跨ぐ強制上書き（pnpm overrides）は clasp の実行時動作を壊すリスクがあるため採用しない。
  - `@google/clasp` の最新は 3.3.0（2026-07-23 時点）であり、`@formatjs/intl` の typescript peer 警告を解消するリリース済みの `@google/clasp` バージョンは存在しない。したがって「clasp を更新して警告を解消する」という選択肢は存在しない。
- **許容範囲の限定**: 許容ルールの親セレクタは、判断根拠として検証済みの `@formatjs/intl@3.1.8` に限定している。将来 `@google/clasp` の更新で `@formatjs/intl` の別バージョンが導入され新たな peer 非互換が生じた場合、本ルールでは抑制されず警告が再び顕在化する（fail fast）。
- **解除条件**: `@google/clasp` を更新した際は、その時点の推移的依存（`@formatjs/intl` のバージョンと peer 宣言）を再評価し、typescript peer 警告が発生しなくなっていれば本ルールを削除する。警告が残る場合は、検証したバージョンへ限定を付け替えた上で本セクションを更新する。
- **レンジ拡張（2026-07-23、issue #175 Phase 2）**: TypeScript を 6.0.3 → 7.0.2 へ更新した際、許容レンジを `^6.0.0` から `^6.0.0 || ^7.0.0` へ拡張した。判断理由・許容範囲の限定・解除条件は上記のとおり変わらない（TypeScript 7 でも `@formatjs/intl@3.1.8` の optional peer 宣言は `^5.6.0` のままであることを確認済み）。

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
- **脆弱性対応**: 公開直後の修正版を `pnpm.overrides` で強制する場合、Aikido が安全と確認した修正版（safe patches list。Safe Chain 1.5.21 以降）を除き、48 時間待つ必要がある。この制約は issue #204 のときからローカルの Safe Chain で発生しているものと同じである。
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

## 参考資料

- [Semantic Versioning 2.0.0](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [Dependabot documentation](https://docs.github.com/en/code-security/dependabot)

## 履歴

- 2026-01-16: 初版作成
- 2026-07-23: TypeScript 5.9 → 6.0 更新（issue #175 Phase 1）に伴い、peer 依存の明示的許容の記録セクションを追加
- 2026-07-23: TypeScript 6.0 → 7.0 更新（issue #175 Phase 2）に伴い、許容レンジを拡張し、エイリアス devDependency `typescript-js-api` の記録セクションを追加。型チェック（`tsc --noEmit -p tsconfig.build.json` を pnpm を介さず直接実行、同一マシン・ウォーム状態・連続3回計測の実測レンジ）は TS 6.0.3（JS 実装）の約0.47〜0.49秒から TS 7.0.2（ネイティブ実装）の約0.08秒へ短縮（約6倍高速化）
- 2026-07-26: メジャーバージョンアップの検知方針を変更。`.github/dependabot.yml` の `version-update:semver-major` の ignore 設定を削除し、Dependabot がメジャー更新も検知して個別PRを作成するようにした（自動マージ対象外であることは従来どおり）。あわせて上限到達による取りこぼしを防ぐため `open-pull-requests-limit` を 10 から 15 へ引き上げ、意図的に6系へ固定しているエイリアス依存 `typescript-js-api` のみ major 更新を `ignore` で除外した
- 2026-08-02: tailwindcss 3.4 → 4.3 へ移行（issue #176）。CLI の `@tailwindcss/cli` 分離対応と CSS-first 設定への移行の記録セクションを追加。devDependencies 増（13→14件）に伴い `open-pull-requests-limit` を 15 から 16 へ引き上げ
- 2026-08-03: `engines.node` を `>=22.18 <23` から `>=22.22.1 <23 || >=24.11.0 <25` へ変更（issue #178）。22 系の下限は Dependabot PR #198 で導入された lint-staged@17 の要求（`>=22.22.1`）に由来し、Node 24 系の許容はユーザー判断（24 系の下限 24.11.0 は vite-plus の要求に由来。EOL 済みの非 LTS Node 23 系はレンジで機械的に除外。Corepack 同梱は Node 24 まで）。あわせてテスト・lint CI（test.yml / lint.yml）を 22 系・24 系のマトリクスへ拡張（security.yml の pnpm audit はロックファイルの静的検査でランタイム非依存のため単一バージョンのまま）
- 2026-08-04: 推奨ランタイムを Node 22.22 系（Maintenance LTS）から 24.19 系（現行の Active LTS 線）へ移行（issue #199）。mise.toml の pin を `24.19` へ更新し、security.yml の単一バージョンも `24` へ変更（test.yml / lint.yml の 22/24 マトリクスは engines が 22 系を許容する間は維持）。Node 24.19.0 実機で Corepack 同梱・`pnpm install`（engines WARN 解消）・lint・テスト（401件）・build・pre-commit（husky + lint-staged@17）の動作を確認済み
- 2026-10-08: `engines.node` を `>=22.22.1 <23 || >=24.11.0 <25` から `>=24.11.0 <25` へ変更し、Node 22 系を許容対象から外した（issue #265）。理由は次の 3 点である。(1) 実運用はすでに 24 系へ統一されていた（mise.toml の pin `24.19`、security.yml の単一バージョン `24`、ローカル開発環境の Node 24.19.0）。22 系は engines と test.yml / lint.yml のマトリクスにだけ残り、CI の実行回数を倍にしていた。(2) Node 22 系は Maintenance LTS で 2027-04-30 に EOL を迎えるため、残すと半年後に再度の移行が必要になる。(3) 全 devDependencies の engines が 24 系を許容している（node_modules の package.json で確認。vite-plus 0.3.1: `^20.19.0 || ^22.18.0 || >=24.11.0`、lint-staged 17.6.0: `>=22.22.1`、vitest 4.1.11: `^20.0.0 || ^22.0.0 || >=24.0.0`、oxlint 1.86.0 / oxfmt 0.71.0 / vite 8.3.1: `^20.19.0 || >=22.12.0`、typescript 7.0.2: `>=16.20.0`、@google/clasp 3.4.1: `>=20.0.0`、husky 9.1.7: `>=18`）。下限 24.11.0 は従来どおり vite-plus の要求に由来し、上限 `<25` は Corepack を同梱しない Node 25 系以降を除外する。あわせて test.yml / lint.yml の 22/24 マトリクスを廃止し、security.yml と同じ単一バージョン `24` へ揃えた（CI のジョブ名は `Unit Tests (22)` / `Unit Tests (24)` から `Unit Tests` へ、`Lint And Format Check (22)` / `Lint And Format Check (24)` から `Lint And Format Check` へ変わる）。Node 26 系は 2026-10-28 まで LTS ではなく、Corepack を同梱しないため pnpm の取得経路（README・mise.toml のコメント・CI の pnpm/action-setup）の見直しが必要になる。このため 26 系への移行は、LTS 化と Corepack 非同梱への対応方針が決まった後に別 issue で検討する。Node 24.19.0 実機で `pnpm install`（engines WARN なし）・lint・format チェック・テスト（651 件）の成功を確認済み
- 2026-10-09: Dependency Audit の定期監査化・PR 監査の限定と、Aikido Safe Chain の導入を行った（issue #267）。security.yml に毎日 21:17 UTC（06:17 JST）の schedule と workflow_dispatch を追加し、それらで監査が失敗したときは report ジョブが issue「Dependency Audit の定期監査で脆弱性を検出しました」を起票する（同じタイトルのオープン issue があればコメントを追記する。本文は scripts/build-audit-failure-issue.mjs が生成する）。pull_request での監査は package.json / pnpm-lock.yaml / security.yml を変更した PR に限定した。理由は、監査結果がコードではなく外部の脆弱性データベースで変わるため、新規アドバイザリの公表後に最初に CI を実行した無関係な PR が失敗していたことである（2026-10-03 の #261、2026-10-07 の #266。いずれもアドバイザリのレビュー完了から最初の CI 失敗まで CI が実行されていなかった）。あわせて CI の依存取得を Aikido Safe Chain 1.5.24 経由にし、`.aikido` で最小経過時間 48 時間を、dependabot.yml で cooldown 3 日を明示した（詳細は「Aikido Safe Chain の記録」を参照）
