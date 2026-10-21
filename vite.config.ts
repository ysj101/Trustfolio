import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite-plus';

/**
 * このプロジェクトのルートディレクトリの絶対パス。
 * ESM 環境では `__dirname` が使えないため `import.meta.dirname`（Node 20.11+）を使用する。
 */
const projectRoot = import.meta.dirname;

/**
 * GAS（Google Apps Script）のグローバル関数トランポリンを生成するフッター関数。
 *
 * Vite はライブラリモードで `src/main.ts` を IIFE バンドルし、グローバル変数
 * `TrustfolioApp` に各 export を割り当てる。一方 GAS ランタイムは、Web アプリの
 * エントリポイント（`doGet` / `doPost`）やトリガー関数を「トップレベルのグローバル
 * 関数名」で直接呼び出す。そのため、バンドラから渡されるエントリチャンクの export 名
 * （`chunk.exports`）ごとに `TrustfolioApp.xxx(...)` へ委譲するトランポリン関数を
 * 生成し、バンドル末尾に追記する。
 *
 * 【重要】`src/main.ts` から export した関数は全て GAS の公開面（名前で参照される契約）
 * になる。参照元は次の 4 種類であり、参照元を確認せずに export を改名・削除してはならない
 * （変更すると GAS のトリガー設定や Web アプリが破綻する）。
 * - Web アプリのエントリポイント: `doGet` / `doPost`（GAS ランタイムが呼ぶ）
 * - Web UI からの API 呼び出し: `handleApiRequestJson`
 *   （src/ui/common-scripts.html の callApi が google.script.run 経由で呼ぶ）
 * - HTML テンプレートのスクリプトレット: `include`
 *   （src/ui/Index.html / src/ui/Performance.html の `<?!= include('...'); ?>` が
 *   HtmlService のテンプレート評価時に呼ぶ）
 * - トリガー・メニュー・手動実行: 上記以外の全て
 *   （ScriptApp.newTrigger の関数名指定、またはスクリプトエディタからの手動実行）
 *
 * トランポリンは export 一覧から機械的に生成されるため、export の追加・改名・削除に
 * 対する手動同期は不要である。逆に、テスト目的の内部ヘルパーを `src/main.ts` から
 * export してはならない（そのまま GAS の公開関数になる）。
 *
 * 生成される各トランポリンは次の 3 行になる。引数は可変長でそのまま委譲する
 * （GAS はトリガー・google.script.run・テンプレートのいずれも位置引数で呼ぶため、
 * 仮引数名に意味はない）。
 *
 * ```
 * function <name>(...args) {
 *   return TrustfolioApp.<name>(...args);
 * }
 * ```
 *
 * @param chunk - バンドラが描画したチャンク。`exports` にエントリの export 名が入る。
 * @returns バンドル末尾に追記するトランポリン関数群の文字列
 */
function createGasGlobalFunctionsFooter(chunk: { exports: string[] }): string {
  if (chunk.exports.length === 0) {
    throw new Error('src/main.ts に export が存在しません。GAS のグローバル関数を生成できません。');
  }
  return chunk.exports
    .map((name) => `function ${name}(...args) {\n  return TrustfolioApp.${name}(...args);\n}`)
    .join('\n');
}

/**
 * ディレクトリを再帰的にコピーするヘルパー。
 *
 * @param source - コピー元ディレクトリの絶対パス
 * @param destination - コピー先ディレクトリの絶対パス
 * @param options.ignoreNames - コピー対象から除外するファイル/ディレクトリ名の集合
 */
function copyDirectory(
  source: string,
  destination: string,
  options?: { ignoreNames?: Set<string> }
): void {
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }
  const ignoreNames = options?.ignoreNames ?? new Set<string>();
  const entries = fs.readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoreNames.has(entry.name)) {
      continue;
    }
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath, options);
      continue;
    }
    fs.copyFileSync(srcPath, destPath);
  }
}

/**
 * `src/ui/` 配下の UI テンプレート（HTML 等）を `dist/` へコピーする Vite プラグイン。
 *
 * `styles.html` のみ除外する。`styles.html` はビルド済み Tailwind CSS をインライン
 * 展開した内容を `scripts/build-styles.sh`（`build:css`）が生成するため、ここで
 * `src/ui/styles.html`（プレースホルダ）をコピーすると上書き合戦になるのを避ける。
 *
 * Vite はビルド時に出力先 `dist/` を空にする（`emptyOutDir`）。空にする処理と
 * バンドル書き出しが完了した後にコピーする必要があるため、`buildEnd` ではなく
 * `closeBundle`（全工程の最後）フックで実行する。
 */
function copyUiFiles(): Plugin {
  return {
    name: 'copy-ui-files',
    apply: 'build',
    closeBundle() {
      const srcDir = path.join(projectRoot, 'src', 'ui');
      const distDir = path.join(projectRoot, 'dist');
      if (!fs.existsSync(srcDir)) {
        return;
      }
      copyDirectory(srcDir, distDir, { ignoreNames: new Set(['styles.html']) });
    },
  };
}

/**
 * GAS マニフェスト `appsscript.json` を `dist/` へコピーする Vite プラグイン。
 *
 * `clasp push` は `dist/`（`.clasp.json` の `rootDir`）配下のファイルをデプロイする
 * ため、マニフェストを `dist/` に配置する必要がある。`copyUiFiles` と同じ理由で
 * `closeBundle` フックで実行する。
 */
function copyManifest(): Plugin {
  return {
    name: 'copy-manifest',
    apply: 'build',
    closeBundle() {
      const srcPath = path.join(projectRoot, 'appsscript.json');
      const distPath = path.join(projectRoot, 'dist', 'appsscript.json');
      if (!fs.existsSync(srcPath)) {
        return;
      }
      fs.copyFileSync(srcPath, distPath);
    },
  };
}

/**
 * vite のプロキシ（`server.proxy` / `preview.proxy`）が設定されていないことを検証する
 * Vite プラグイン（issue #286）。
 *
 * 目的:
 *   `scripts/bundled-advisory-exceptions.mjs` の follow-redirects 1.16.0 の例外は、
 *   「本リポジトリでは vite のプロキシを使わない」ことを根拠にしている。Vite+ に同梱された
 *   follow-redirects を使うのは vite のプロキシ（http-proxy-3）だけであり、プロキシは解決後の
 *   `server.proxy` または `preview.proxy` が設定されたときだけ生成される。この根拠が崩れたときに、
 *   例外が黙って適用され続けないよう、設定の解決時点で失敗させる（fail fast）。
 *
 * 内容:
 *   設定の解決後（`configResolved`）に、解決済みの `server.proxy` と `preview.proxy` を確かめ、
 *   どちらかが設定されていれば例外を投げる。`configResolved` は `vp build`・`vp dev`・
 *   `vp test`（Vitest が内部で生成するサーバーを含む）・`vp preview` のいずれでも、各コマンドが
 *   実際に解決した設定で呼ばれる。このため、コマンドごとの解決条件（mode 等）を写さずに検査できる。
 *   CI では `pnpm test` と `pnpm build` がこの検査を通る。
 *
 * 注意:
 *   - vite は `preview.proxy` が未設定なら `server.proxy` を引き継ぐ。ただしプラグインは
 *     解決後の `server.proxy` を書き換えられるため、両方を確かめる。
 *   - 判定は意図的に厳しくしている。vite は proxy の各エントリが偽の場合にプロキシを生成しないが、
 *     本プラグインは proxy が設定された時点で失敗させる。プロキシを使う必要が生じた場合は、
 *     follow-redirects の例外の影響経路を再評価したうえで、本プラグインを見直すこと。
 *   - 本プラグインが検査するのは `configResolved` の時点の値である。それより後に他のプラグインが
 *     `configureServer` / `configurePreviewServer` 等で proxy を書き換えた場合は検出できない。
 *     プラグインを追加・更新するときは、proxy を書き換えないことを確認すること。
 *   - follow-redirects の例外を削除した（修正版を同梱した vite-plus へ更新した）ときは、
 *     本プラグインも削除する。
 */
function forbidDevServerProxy(): Plugin {
  return {
    name: 'forbid-dev-server-proxy',
    configResolved(config) {
      if (config.server.proxy !== undefined || config.preview.proxy !== undefined) {
        throw new Error(
          'vite のプロキシ（server.proxy / preview.proxy）が設定されています。' +
            'scripts/bundled-advisory-exceptions.mjs の follow-redirects の例外は、プロキシを使わないことを' +
            '前提にしています。例外の影響経路を再評価してから、vite.config.ts の forbidDevServerProxy を見直してください。'
        );
      }
    },
  };
}

/**
 * Vite ビルド設定（GAS 向けライブラリモード）。
 *
 * 本プロジェクトは Google Apps Script プロジェクトであり、ブラウザ向けの開発サーバー
 * （`vite dev`）は使用しない。`src/main.ts` を IIFE 形式の単一ファイル `dist/Code.js`
 * にバンドルし、`clasp push` で GAS へデプロイする。移行前の `rollup.config.js` と
 * 機能的に等価な成果物を生成することを目的とする。
 *
 * - ライブラリモード（`build.lib`）で IIFE・グローバル名 `TrustfolioApp` を指定。
 * - `minify: false`：移行直後の差分レビューを容易にするため、また従来の Rollup
 *   ビルド（非 minify）の挙動を踏襲するため、minify は無効にする。
 * - 型チェックは行わない（Vite は型を剥がすのみ）。型検査は `pnpm typecheck`
 *   （`tsc --noEmit`）が独立ステップとして担う。
 *
 * 本ファイルは Vite+（`vp`）の設定の正本でもある（issue #272 で `vp` へ一本化）。
 * `vp build` は `build` / `plugins`、`vp test` は `test`、`vp fmt` は `fmt`、`vp lint` は
 * `lint` を読み、`vp check` は `fmt` と `lint` の両方を読む。`package.json` の scripts
 * （`pnpm build` / `pnpm test` / `pnpm format:check` / `pnpm lint`）は対象パスや CLI 引数を
 * 渡さずに `vp` を呼ぶため、検査の範囲とルールは本ファイルだけで決まり、`vp check` と
 * scripts の結果は一致する。
 *
 * 注意: `vitest.config.ts` / `.oxfmtrc.json` / `.oxlintrc.json` を新たに置いてはならない。
 * Vitest は `vitest.config.ts` を `vite.config.ts` より優先して読み、本ファイルの `test` を
 * 無視する。Vite+ の公式ドキュメントも、整形・lint の設定は本ファイルの `fmt` / `lint` に
 * 置き、`.oxfmtrc.json` 等を併用しないことを推奨している。
 */
export default defineConfig({
  build: {
    // GAS の V8 ランタイム向け。tsconfig.json の target（ES2022）と揃える。
    target: 'es2022',
    outDir: 'dist',
    // 移行直後の差分レビュー容易性のため minify を無効化（従来の Rollup 挙動を踏襲）。
    minify: false,
    lib: {
      entry: path.resolve(projectRoot, 'src/main.ts'),
      formats: ['iife'],
      // IIFE のグローバル変数名。GAS のフッター関数群が参照する。
      name: 'TrustfolioApp',
      // 出力ファイル名を従来どおり `Code.js` に固定する。
      fileName: () => 'Code.js',
    },
    rollupOptions: {
      output: {
        // GAS グローバル関数のトランポリンをバンドル末尾に追記する。
        footer: createGasGlobalFunctionsFooter,
      },
    },
  },
  plugins: [copyUiFiles(), copyManifest(), forbidDevServerProxy()],
  /**
   * Vitest（`vp test` / `pnpm test`）の設定。
   * issue #272 で `vitest.config.ts` から移した。
   */
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // ネイティブモジュール（better-sqlite3）を使用するため、シーケンシャル実行
    fileParallelism: false,
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    // （vp migrate が追加した Vitest v4 互換設定。Vitest 5 は各テストの前にモックの呼び出し履歴を
    // 消去する。削除は issue #272 の対象外であり、別 issue で既存テストへの影響を確認してから行う）
    clearMocks: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts', '**/*.config.*'],
    },
  },
  /**
   * Oxfmt（`vp fmt` / `pnpm format` / `vp check`）の設定。
   * issue #272 で `.oxfmtrc.json` から値を変えずに移した。
   */
  fmt: {
    useTabs: false,
    tabWidth: 2,
    printWidth: 100,
    singleQuote: true,
    jsxSingleQuote: false,
    quoteProps: 'preserve',
    trailingComma: 'es5',
    semi: true,
    arrowParens: 'always',
    bracketSameLine: false,
    bracketSpacing: true,
    // 整形の対象は、.gitignore で除外したファイルを除くリポジトリ全体である。Oxfmt は
    // Markdown と YAML も整形するが、ドキュメント（README.md・docs/）と GitHub Actions の
    // 設定（.github/）・pnpm-workspace.yaml はこれまで整形の対象外であったため、拡張子で除外する。
    // 注意: Oxfmt の ignorePatterns では、ルート直下のファイルを否定パターン（"!package.json" 等）で
    // 対象へ戻せない（2026-10-12 に Oxfmt 0.72.0 で確認）。対象を許可リストで書かず、
    // 除外リストで書いているのはこのためである。
    ignorePatterns: ['**/*.md', '**/*.yml', '**/*.yaml'],
  },
  /**
   * Oxlint（`vp lint` / `pnpm lint:oxlint` / `vp check`）の設定。
   * issue #272 で `package.json` の scripts の CLI 引数から移した。
   */
  lint: {
    // 検査の対象は src・scripts・vite.config.ts である（移行前の lint:oxlint の対象と同じ）。
    // tests は移行前から Oxlint の対象外であるため、引き続き除外する。
    ignorePatterns: ['tests/**'],
    // 旧 CLI 引数 --import-plugin --promise-plugin に相当する。plugins を指定すると Oxlint の
    // 既定のプラグイン（unicorn・typescript・oxc）が置き換わるため、既定の 3 個も列挙する。
    plugins: ['unicorn', 'typescript', 'oxc', 'import', 'promise'],
    options: {
      // 旧 CLI 引数 --deny-warnings に相当する。CLI 引数を使わない vp check でも、警告を失敗にする。
      denyWarnings: true,
    },
  },
});
