import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

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
        footer: createGasGlobalFunctionsFooter,
      },
    },
  },
  plugins: [copyUiFiles(), copyManifest()],
});
