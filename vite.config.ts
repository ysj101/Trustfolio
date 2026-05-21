import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * このプロジェクトのルートディレクトリの絶対パス。
 * ESM 環境では `__dirname` が使えないため `import.meta.dirname`（Node 20.11+）を使用する。
 */
const projectRoot = import.meta.dirname;

/**
 * GAS（Google Apps Script）のグローバル関数を定義するフッター文字列。
 *
 * Vite はライブラリモードで `src/main.ts` を IIFE バンドルし、グローバル変数
 * `TrustfolioApp` に各 export を割り当てる。一方 GAS ランタイムは、Web アプリの
 * エントリポイント（`doGet` / `doPost`）やトリガー関数を「トップレベルのグローバル
 * 関数名」で直接呼び出す。そのため、`TrustfolioApp.xxx()` へ委譲するトランポリン
 * 関数群をバンドル末尾に追記する必要がある。
 *
 * 【重要】ここで定義する関数名・シグネチャは GAS から名前で参照される契約である。
 * 移行前の `rollup.config.js` の `footer` 定数と完全に一致させており、一字一句
 * 変更してはならない（変更すると GAS のトリガー設定や Web アプリが破綻する）。
 */
const gasGlobalFunctionsFooter = [
  'function doGet(e) {',
  '  return TrustfolioApp.doGet(e);',
  '}',
  'function doPost(e) {',
  '  return TrustfolioApp.doPost(e);',
  '}',
  'function onOpen(e) {',
  '  return TrustfolioApp.onOpen(e);',
  '}',
  'function initializeSheets() {',
  '  return TrustfolioApp.initializeSheets();',
  '}',
  'function handleApiRequest(request) {',
  '  return TrustfolioApp.handleApiRequest(request);',
  '}',
  'function include(filename) {',
  '  return TrustfolioApp.include(filename);',
  '}',
  'function runRakutenIntegrationTest() {',
  '  return TrustfolioApp.runRakutenIntegrationTest();',
  '}',
  'function fetchAllNavs() {',
  '  return TrustfolioApp.fetchAllNavs();',
  '}',
  'function executeRecurringPurchasesDaily() {',
  '  return TrustfolioApp.executeRecurringPurchasesDaily();',
  '}',
  'function setupNavFetchTrigger() {',
  '  return TrustfolioApp.setupNavFetchTrigger();',
  '}',
  'function setupRecurringPurchasesTrigger() {',
  '  return TrustfolioApp.setupRecurringPurchasesTrigger();',
  '}',
  'function deleteNavFetchTrigger() {',
  '  return TrustfolioApp.deleteNavFetchTrigger();',
  '}',
  'function sendWeeklyReport() {',
  '  return TrustfolioApp.sendWeeklyReport();',
  '}',
  'function setupWeeklyReportTrigger() {',
  '  return TrustfolioApp.setupWeeklyReportTrigger();',
  '}',
  'function deleteWeeklyReportTrigger() {',
  '  return TrustfolioApp.deleteWeeklyReportTrigger();',
  '}',
  'function fetchMarketIndices() {',
  '  return TrustfolioApp.fetchMarketIndices();',
  '}',
  'function setupMarketIndexFetchTrigger() {',
  '  return TrustfolioApp.setupMarketIndexFetchTrigger();',
  '}',
  'function deleteMarketIndexFetchTrigger() {',
  '  return TrustfolioApp.deleteMarketIndexFetchTrigger();',
  '}',
].join('\n');

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
        footer: gasGlobalFunctionsFooter,
      },
    },
  },
  plugins: [copyUiFiles(), copyManifest()],
});
