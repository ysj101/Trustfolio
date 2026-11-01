#!/usr/bin/env node

/**
 * Vite+ の配布物に同梱（インライン化）されたパッケージを、npm レジストリのアドバイザリと照合する
 * スクリプト（issue #272）。
 *
 * 目的:
 *   `vite-plus` と `@voidzero-dev/vite-plus-core`（`vite` の別名として解決される Vite+ 版の vite）は、
 *   vite・rolldown・tsdown と、それらが依存する多数のパッケージを配布物の JavaScript に
 *   インライン化している。インライン化されたパッケージは `pnpm-lock.yaml` に現れないため、
 *   次の 2 つの既定の対処が効かない。
 *   - `pnpm audit` による検出（パッケージ名と版をロックファイルから照合するため）
 *   - `pnpm-workspace.yaml` の `overrides` による修正版への強制（issue #173 の方針）
 *   本スクリプトは、インライン化されたパッケージの名前と版を配布物から抽出し、アドバイザリと
 *   照合することで、`pnpm audit` の検出漏れを補う。
 *
 * 内容:
 *   1. プロジェクトに導入された `vite-plus` と、`vite-plus` が `vite` として解決する
 *      `@voidzero-dev/vite-plus-core` の位置を特定する。両者の版が一致しない場合は例外を投げる。
 *   2. 同梱されたパッケージを、次の 2 つの情報源から抽出する。
 *      - `@voidzero-dev/vite-plus-core` の `package.json` の `bundledVersions`
 *        （vite / rolldown / tsdown の版。Vite+ が公式に宣言している値）
 *      - 両パッケージの `dist/` 配下の JavaScript にある、モジュールの元パスを示すコメント行。
 *        バンドラ（rolldown）は、インライン化した各モジュールの先頭に元のファイルパスを 1 行の
 *        コメントとして出力する。形式は `//#region <パス>`（vite-plus 1.3.0 まで）または
 *        `// <パス>`（vite-plus 1.4.0 以降）である（下記の MODULE_PATH_COMMENT_PATTERN を参照）。
 *        パスに含まれる pnpm ストアのディレクトリ名（`node_modules/.pnpm/<名前>@<版>_.../`）から
 *        パッケージ名と版を読み取る。
 *   3. npm レジストリの bulk アドバイザリ API（`/-/npm/v1/security/advisories/bulk`）へ
 *      パッケージ名と版を送り、該当するアドバイザリを取得する。
 *   4. 監査レベル以上のアドバイザリから、`scripts/bundled-advisory-exceptions.mjs` に記録した
 *      例外を除き、残りがあれば失敗とする。どの検出にも一致しない例外（陳腐化した例外）も失敗とする。
 *
 * 使用方法:
 *   node scripts/check-bundled-advisories.mjs --audit-level <info|low|moderate|high|critical>
 *
 * 注意:
 *   - 抽出結果が 0 件の場合や、モジュールの元パスからパッケージ名と版を読み取れない場合は、
 *     例外を投げる（fail fast）。Vite+ が配布物の形式を変えたときに「検出 0 件」と誤って
 *     合格させないためである。
 *   - 本スクリプトが対象にするのは JavaScript にインライン化されたパッケージだけである。
 *     プラットフォーム別のネイティブバイナリ（`@voidzero-dev/vite-plus-<OS>-<CPU>`）に
 *     静的リンクされた Rust のクレートは対象外である。
 *   - `pnpm audit` は `/-/npm/v1/security/audits/quick` を使う（pnpm 10.30.2 の実装で確認）。
 *     本スクリプトは同じ npm レジストリの bulk エンドポイント（`npm audit` が使うもの）を使う。
 *     bulk エンドポイントは、送った版に該当するアドバイザリだけを返す。
 *   - レジストリへの通信に失敗した場合や、応答の形式が想定と異なる場合は例外を投げる。
 */

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { SEVERITY_LEVELS } from './build-audit-failure-issue.mjs';
import { BUNDLED_ADVISORY_EXCEPTIONS } from './bundled-advisory-exceptions.mjs';

/** npm レジストリの bulk アドバイザリ API の URL。 */
export const BULK_ADVISORY_URL = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';

/**
 * bulk アドバイザリ API への 1 回の要求の制限時間（ミリ秒）。
 * レジストリが応答しない場合に、CI のジョブがジョブ全体のタイムアウトまで止まらないよう、
 * 制限時間を超えた要求は通信の失敗として例外にする（fail fast）。
 */
export const BULK_ADVISORY_TIMEOUT_MS = 30_000;

/** Vite+ のコアパッケージ名。`vite-plus` は依存 `vite` をこのパッケージの別名として解決する。 */
export const CORE_PACKAGE_NAME = '@voidzero-dev/vite-plus-core';

/**
 * `bundledVersions` に必ず含まれていなければならないツール名。
 * vite と rolldown は本リポジトリのビルド（`vp build`）の中核であり、欠けている場合は
 * 配布物の形式が変わったものとみなして失敗させる。
 */
const REQUIRED_BUNDLED_TOOLS = ['vite', 'rolldown'];

/**
 * インライン化されたモジュールの元パスを示すコメント行（rolldown の出力形式）の正規表現。
 * 1 番目のグループは元パスである。
 *
 * 行全体が「`//#region` または `//`、半角空白 1 つ、空白を含まないパス」である行だけに一致させる。
 * 説明文のコメントや、コード中の文字列に現れるストアのパスを、モジュールの元パスと取り違えないためである。
 *
 * 2 つの形式を受け付ける理由（2026-11-02（日本時間）に npm の tarball で確認した事実）:
 *   - vite-plus 1.3.0 / @voidzero-dev/vite-plus-core 1.3.0 は、元パスを `//#region <パス>` で出力し、
 *     モジュールの末尾に `//#endregion` を置く。
 *     例: `//#region ../../node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/visit.js`
 *   - vite-plus 1.4.0 / @voidzero-dev/vite-plus-core 1.4.0 は、同じ元パスを `// <パス>` で出力し、
 *     `//#endregion` を置かない。
 *     例: `// ../../node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/visit.js`
 *   - ただし @voidzero-dev/vite-plus-core 1.4.0 でも `dist/pluginutils/filter-*.mjs` は、
 *     `//#region src/...` の形式のままである。
 *     同じ配布物の中に両形式が混在するため、どちらか一方だけには限定できない。
 */
const MODULE_PATH_COMMENT_PATTERN = /^\/\/(?:#region)? (\S+)$/;

/**
 * モジュールの元パスから pnpm ストア上のパッケージを取り出す正規表現。
 * 例: `../../node_modules/.pnpm/fdir@6.5.0_picomatch@4.0.7/node_modules/fdir/dist/index.mjs`
 *   - 1 番目のグループ: ストアのディレクトリ名（`fdir@6.5.0_picomatch@4.0.7`）
 *   - 2 番目のグループ: パッケージ名（`fdir`。スコープ付きの場合は `@scope/name`）
 */
const PNPM_STORE_PATH_PATTERN =
  /node_modules\/\.pnpm\/([^/\s]+)\/node_modules\/((?:@[^/\s]+\/)?[^/\s]+)/g;

/** 版として受け付ける形式（semver。プレリリース識別子を含む）。 */
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** GitHub Advisory Database の ID の形式。 */
const GHSA_ID_PATTERN = /^GHSA(?:-[23456789cfghjmpqrvwx]{4}){3}$/;

/** 走査対象とする JavaScript ファイルの拡張子。 */
const JAVASCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

/**
 * 値が配列ではないプレーンなオブジェクトかどうかを判定する。
 *
 * @param {unknown} value 判定対象の値
 * @returns {boolean} プレーンなオブジェクトであれば true
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 重要度の文字列を順位（SEVERITY_LEVELS の添字）へ変換する。
 *
 * @param {string} severity 重要度（info / low / moderate / high / critical）
 * @returns {number} 重要度の順位。値が大きいほど重要度が高い
 * @throws {Error} 未知の重要度が渡された場合
 */
function severityRank(severity) {
  const rank = SEVERITY_LEVELS.indexOf(severity);
  if (rank === -1) {
    throw new Error(`未知の重要度です: "${severity}"（許容値: ${SEVERITY_LEVELS.join(' / ')}）`);
  }
  return rank;
}

/**
 * 「名前@版」の形式の文字列を組み立てる。
 *
 * @param {string} name パッケージ名
 * @param {string} version 版
 * @returns {string} `name@version`
 */
function toSpecifier(name, version) {
  return `${name}@${version}`;
}

/**
 * モジュールの元パスに含まれる pnpm ストアのディレクトリ名から、パッケージの版を取り出す。
 *
 * 目的:
 *   pnpm ストアのディレクトリ名は `<名前>@<版>` に、peer 依存やパッチの識別子が `_` 区切りで
 *   続く形式である（例: `fdir@6.5.0_picomatch@4.0.7`、`chokidar@3.6.0_patch_hash=...`）。
 *   スコープ付きパッケージの `/` は `+` に置き換えられる（例: `@rolldown+pluginutils@1.0.1`）。
 *
 * @param {string} storeDirectoryName ストアのディレクトリ名
 * @param {string} packageName パスの後半から取り出したパッケージ名
 * @returns {string} パッケージの版
 * @throws {Error} ディレクトリ名がパッケージ名で始まらない場合、または版の形式が想定と異なる場合
 */
export function parseStoreDirectoryVersion(storeDirectoryName, packageName) {
  const encodedName = packageName.replace('/', '+');
  const prefix = `${encodedName}@`;
  if (!storeDirectoryName.startsWith(prefix)) {
    throw new Error(
      `pnpm ストアのディレクトリ名がパッケージ名で始まっていません: "${storeDirectoryName}"（パッケージ名: ${packageName}）`
    );
  }
  const version = storeDirectoryName.slice(prefix.length).split('_')[0];
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(
      `pnpm ストアのディレクトリ名から版を読み取れません: "${storeDirectoryName}"（読み取った値: "${version}"）`
    );
  }
  return version;
}

/**
 * JavaScript のソース文字列から、モジュールの元パスを示すコメント行に記録されたインライン化済み
 * パッケージを抽出する。
 *
 * 注意:
 *   元パスが pnpm ストアを含まない行（Vite+ 自身のソース `src/...` など）は、インライン化された
 *   外部パッケージではないため、何も抽出しない。
 *
 * @param {string} source JavaScript ファイルの内容
 * @returns {Array<{ name: string, version: string }>} 抽出したパッケージ（重複を含む）
 * @throws {Error} パスから版を読み取れない場合
 */
export function extractInlinedModulePackages(source) {
  const packages = [];
  for (const line of source.split('\n')) {
    const comment = MODULE_PATH_COMMENT_PATTERN.exec(line);
    if (comment === null) {
      continue;
    }
    for (const match of comment[1].matchAll(PNPM_STORE_PATH_PATTERN)) {
      const [, storeDirectoryName, packageName] = match;
      packages.push({
        name: packageName,
        version: parseStoreDirectoryVersion(storeDirectoryName, packageName),
      });
    }
  }
  return packages;
}

/**
 * ディレクトリ配下の JavaScript ファイルのパスを再帰的に列挙する。
 *
 * @param {string} directory 走査するディレクトリの絶対パス
 * @param {typeof readdirSync} readDirectory ディレクトリ読み込み関数
 * @returns {string[]} JavaScript ファイルの絶対パス（昇順）
 */
function listJavaScriptFiles(directory, readDirectory) {
  const files = [];
  for (const entry of readDirectory(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJavaScriptFiles(entryPath, readDirectory));
    } else if (entry.isFile() && JAVASCRIPT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

/**
 * 配布パッケージの `dist/` 配下から、インライン化されたパッケージを抽出する。
 *
 * @param {string} packageDirectory 配布パッケージのディレクトリの絶対パス
 * @param {object} io ファイルアクセス関数
 * @param {typeof readdirSync} io.readDirectory ディレクトリ読み込み関数
 * @param {typeof readFileSync} io.readFile ファイル読み込み関数
 * @returns {Map<string, Set<string>>} パッケージ名から版の集合への対応
 * @throws {Error} 抽出結果が 0 件の場合（配布物の形式が変わった可能性があるため）
 */
export function collectInlinedPackages(packageDirectory, { readDirectory, readFile }) {
  const distDirectory = path.join(packageDirectory, 'dist');
  const packages = new Map();
  for (const file of listJavaScriptFiles(distDirectory, readDirectory)) {
    for (const { name, version } of extractInlinedModulePackages(readFile(file, 'utf-8'))) {
      if (!packages.has(name)) {
        packages.set(name, new Set());
      }
      packages.get(name).add(version);
    }
  }
  if (packages.size === 0) {
    throw new Error(
      `${distDirectory} から、インライン化されたパッケージを 1 件も抽出できませんでした。` +
        '配布物の形式（モジュールの元パスを示すコメント行）が変わった可能性があります。本スクリプトの抽出方法を見直してください。'
    );
  }
  return packages;
}

/**
 * `@voidzero-dev/vite-plus-core` の `package.json` の `bundledVersions` を検証して返す。
 *
 * @param {unknown} bundledVersions `package.json` の `bundledVersions` の値
 * @returns {Map<string, Set<string>>} ツール名から版の集合への対応
 * @throws {Error} `bundledVersions` の形式が想定と異なる場合、または vite / rolldown が欠けている場合
 */
export function parseBundledVersions(bundledVersions) {
  if (!isPlainObject(bundledVersions)) {
    throw new Error(
      `${CORE_PACKAGE_NAME} の package.json に bundledVersions オブジェクトがありません。`
    );
  }
  const packages = new Map();
  for (const [name, version] of Object.entries(bundledVersions)) {
    if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
      throw new Error(
        `${CORE_PACKAGE_NAME} の bundledVersions["${name}"] が版の形式ではありません: ${JSON.stringify(version)}`
      );
    }
    packages.set(name, new Set([version]));
  }
  for (const tool of REQUIRED_BUNDLED_TOOLS) {
    if (!packages.has(tool)) {
      throw new Error(`${CORE_PACKAGE_NAME} の bundledVersions に ${tool} がありません。`);
    }
  }
  return packages;
}

/**
 * 検査対象の配布パッケージ（`vite-plus` と `@voidzero-dev/vite-plus-core`）を特定する。
 *
 * 目的:
 *   `vp` コマンドが実際に読み込むパッケージを検査するため、Node.js のモジュール解決で
 *   位置を特定する。`@voidzero-dev/vite-plus-core` は、`vite-plus` の依存 `vite` として解決する。
 *
 * 注意:
 *   `vite-plus` と `@voidzero-dev/vite-plus-core` の版が一致しない場合は例外を投げる。
 *   この状態では `vp build` が失敗し（`Expected @voidzero-dev/vite-plus-core@X, but found Y`）、
 *   検査対象も実際に使われる組み合わせと食い違うためである。`pnpm-workspace.yaml` の
 *   `catalog` で `vite-plus` だけを更新した場合（Dependabot の更新 PR）に発生する。
 *
 * @param {string} projectRoot プロジェクトのルートディレクトリの絶対パス
 * @param {typeof readFileSync} readFile ファイル読み込み関数
 * @returns {Array<{ name: string, version: string, directory: string, manifest: Record<string, unknown> }>}
 *   `vite-plus`、`@voidzero-dev/vite-plus-core` の順の配列
 * @throws {Error} パッケージを解決できない場合、名前が想定と異なる場合、版が一致しない場合
 */
export function resolveVitePlusPackages(projectRoot, readFile) {
  const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
  const vitePlusManifestPath = projectRequire.resolve('vite-plus/package.json');
  const vitePlusManifest = JSON.parse(readFile(vitePlusManifestPath, 'utf-8'));

  // vite-plus の依存 vite は、vite-plus-core への別名（npm:@voidzero-dev/vite-plus-core@<版>）である
  const coreManifestPath = createRequire(vitePlusManifestPath).resolve('vite/package.json');
  const coreManifest = JSON.parse(readFile(coreManifestPath, 'utf-8'));
  if (coreManifest.name !== CORE_PACKAGE_NAME) {
    throw new Error(
      `vite-plus の依存 vite が ${CORE_PACKAGE_NAME} に解決されていません（解決先: ${coreManifest.name}@${coreManifest.version}）。`
    );
  }
  if (coreManifest.version !== vitePlusManifest.version) {
    throw new Error(
      `vite-plus（${vitePlusManifest.version}）と ${CORE_PACKAGE_NAME}（${coreManifest.version}）の版が一致しません。` +
        'pnpm-workspace.yaml の catalog の vite-plus と vite（vite-plus-core の別名）を同じ版にそろえてください' +
        '（手順は docs/UPGRADE_STRATEGY.md の「Vite+（vp）への一本化の記録」を参照）。'
    );
  }

  return [
    {
      name: vitePlusManifest.name,
      version: vitePlusManifest.version,
      directory: path.dirname(vitePlusManifestPath),
      manifest: vitePlusManifest,
    },
    {
      name: coreManifest.name,
      version: coreManifest.version,
      directory: path.dirname(coreManifestPath),
      manifest: coreManifest,
    },
  ];
}

/**
 * 複数の同梱元から抽出したパッケージを、照合用の一覧（同梱元・名前・版の組）にまとめる。
 *
 * @param {Array<{ bundle: string, packages: Map<string, Set<string>> }>} bundles
 *   同梱元（`名前@版`）と、その同梱元から抽出したパッケージの対応
 * @returns {Array<{ bundle: string, name: string, version: string }>} 同梱元・名前・版の組（昇順）
 */
export function flattenBundledPackages(bundles) {
  const entries = [];
  for (const { bundle, packages } of bundles) {
    for (const [name, versions] of packages) {
      for (const version of versions) {
        entries.push({ bundle, name, version });
      }
    }
  }
  return entries.sort(
    (left, right) =>
      left.bundle.localeCompare(right.bundle) ||
      left.name.localeCompare(right.name) ||
      left.version.localeCompare(right.version)
  );
}

/**
 * bulk アドバイザリ API の応答を検証し、アドバイザリの配列へ変換する。
 *
 * @param {unknown} response API の応答を JSON.parse した値
 * @param {Record<string, string[]>} requestBody 送信した本文（パッケージ名から版の配列への対応）
 * @returns {Array<{ name: string, version: string, ghsaId: string, severity: string, title: string, url: string, vulnerableVersions: string }>}
 *   アドバイザリの配列
 * @throws {Error} 応答の形式が想定と異なる場合
 */
export function parseBulkAdvisoryResponse(response, requestBody) {
  if (!isPlainObject(response)) {
    throw new Error('bulk アドバイザリ API の応答がオブジェクトではありません。');
  }
  const advisories = [];
  for (const [name, entries] of Object.entries(response)) {
    const requestedVersions = requestBody[name];
    // 1 回の要求では 1 パッケージにつき 1 つの版だけを送る（fetchAdvisories を参照）。
    // そのため、応答のアドバイザリはすべて送った 1 つの版に該当する
    if (!Array.isArray(requestedVersions) || requestedVersions.length !== 1) {
      throw new Error(
        `bulk アドバイザリ API が、要求していないパッケージ "${name}" を返しました。`
      );
    }
    if (!Array.isArray(entries)) {
      throw new Error(`bulk アドバイザリ API の応答 "${name}" が配列ではありません。`);
    }
    for (const [index, entry] of entries.entries()) {
      const location = `${name}[${index}]`;
      if (!isPlainObject(entry)) {
        throw new Error(`bulk アドバイザリ API の応答 ${location} がオブジェクトではありません。`);
      }
      for (const field of ['url', 'severity', 'title', 'vulnerable_versions']) {
        if (typeof entry[field] !== 'string' || entry[field] === '') {
          throw new Error(
            `bulk アドバイザリ API の応答 ${location}.${field} が空でない文字列ではありません。`
          );
        }
      }
      const ghsaId = entry.url.split('/').at(-1);
      if (!GHSA_ID_PATTERN.test(ghsaId)) {
        throw new Error(
          `bulk アドバイザリ API の応答 ${location}.url から GHSA ID を読み取れません: ${entry.url}`
        );
      }
      severityRank(entry.severity);
      advisories.push({
        name,
        version: requestedVersions[0],
        ghsaId,
        severity: entry.severity,
        title: entry.title,
        url: entry.url,
        vulnerableVersions: entry.vulnerable_versions,
      });
    }
  }
  return advisories;
}

/**
 * パッケージの名前と版の一覧について、bulk アドバイザリ API からアドバイザリを取得する。
 *
 * 目的:
 *   bulk API の応答には「どの版に該当したか」が含まれない。同じパッケージの複数の版を
 *   1 回の要求で送ると、アドバイザリと版の対応が分からなくなる。そのため、1 回の要求に
 *   含める版を 1 パッケージにつき 1 つに限り、版の数が最大のパッケージの版数だけ要求を分ける。
 *
 * @param {Array<{ name: string, version: string }>} packages 照合するパッケージ（重複可）
 * @param {typeof fetch} fetchImpl HTTP クライアント
 * @returns {Promise<ReturnType<typeof parseBulkAdvisoryResponse>>} 取得したアドバイザリ
 * @throws {Error} 通信に失敗した場合（BULK_ADVISORY_TIMEOUT_MS の超過を含む）、または応答の形式が想定と異なる場合
 */
export async function fetchAdvisories(packages, fetchImpl) {
  const versionsByName = new Map();
  for (const { name, version } of packages) {
    if (!versionsByName.has(name)) {
      versionsByName.set(name, new Set());
    }
    versionsByName.get(name).add(version);
  }

  const maxVersionCount = Math.max(
    ...[...versionsByName.values()].map((versions) => versions.size)
  );
  const advisories = [];
  for (let layer = 0; layer < maxVersionCount; layer += 1) {
    const requestBody = {};
    for (const [name, versions] of versionsByName) {
      const sortedVersions = [...versions].sort();
      if (layer < sortedVersions.length) {
        requestBody[name] = [sortedVersions[layer]];
      }
    }
    let response;
    try {
      response = await fetchImpl(BULK_ADVISORY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(BULK_ADVISORY_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(
        `bulk アドバイザリ API への要求が失敗しました（制限時間 ${BULK_ADVISORY_TIMEOUT_MS} ミリ秒の超過、または通信エラー）: ${error.message}`,
        { cause: error }
      );
    }
    if (!response.ok) {
      throw new Error(
        `bulk アドバイザリ API への要求が失敗しました: HTTP ${response.status} ${response.statusText}`
      );
    }
    advisories.push(...parseBulkAdvisoryResponse(await response.json(), requestBody));
  }
  return advisories;
}

/**
 * 例外の一覧を検証する。
 *
 * @param {unknown} exceptions `scripts/bundled-advisory-exceptions.mjs` の例外の一覧
 * @returns {Array<{ bundle: string, package: string, version: string, ghsaIds: string[] }>} 検証済みの例外
 * @throws {Error} 形式が想定と異なる場合、または同じ組み合わせが重複している場合
 */
export function validateExceptions(exceptions) {
  if (!Array.isArray(exceptions)) {
    throw new Error('例外の一覧が配列ではありません。');
  }
  const seen = new Set();
  for (const [index, exception] of exceptions.entries()) {
    if (!isPlainObject(exception)) {
      throw new Error(`例外 [${index}] がオブジェクトではありません。`);
    }
    for (const field of ['bundle', 'package', 'version']) {
      if (typeof exception[field] !== 'string' || exception[field] === '') {
        throw new Error(`例外 [${index}].${field} が空でない文字列ではありません。`);
      }
    }
    if (!Array.isArray(exception.ghsaIds) || exception.ghsaIds.length === 0) {
      throw new Error(`例外 [${index}].ghsaIds が空でない配列ではありません。`);
    }
    for (const ghsaId of exception.ghsaIds) {
      if (typeof ghsaId !== 'string' || !GHSA_ID_PATTERN.test(ghsaId)) {
        throw new Error(
          `例外 [${index}].ghsaIds に GHSA ID の形式ではない値があります: ${JSON.stringify(ghsaId)}`
        );
      }
      const key = `${exception.bundle} ${toSpecifier(exception.package, exception.version)} ${ghsaId}`;
      if (seen.has(key)) {
        throw new Error(`例外が重複しています: ${key}`);
      }
      seen.add(key);
    }
  }
  return exceptions;
}

/**
 * 同梱パッケージとアドバイザリを突き合わせ、例外を適用した判定結果を返す。
 *
 * 目的:
 *   監査レベル以上のアドバイザリのうち、例外に記録していないもの（違反）と、
 *   どの検出にも一致しない例外（陳腐化した例外）を求める。
 *
 * 内容:
 *   - 例外は、同梱元（`bundle`）・パッケージ名・版・GHSA ID のすべてが一致した場合にだけ適用する。
 *     vite-plus を更新すると同梱元の版が変わるため、例外は一致しなくなる。更新のたびに
 *     影響を再評価させるための意図的な限定である。
 *   - 監査レベル未満のアドバイザリは判定の対象外とする（`pnpm audit --audit-level` と同じ基準）。
 *
 * @param {object} params 判定に使う値
 * @param {ReturnType<typeof flattenBundledPackages>} params.bundledPackages 同梱元・名前・版の組
 * @param {Awaited<ReturnType<typeof fetchAdvisories>>} params.advisories 取得したアドバイザリ
 * @param {ReturnType<typeof validateExceptions>} params.exceptions 例外の一覧
 * @param {string} params.auditLevel 監査レベル
 * @returns {{ violations: Array<object>, excepted: Array<object>, staleExceptions: string[] }}
 *   違反・例外として許容した検出・陳腐化した例外（`同梱元 名前@版 GHSA ID` 形式）
 */
export function evaluateFindings({ bundledPackages, advisories, exceptions, auditLevel }) {
  const minimumRank = severityRank(auditLevel);
  const exceptionKeys = new Set(
    exceptions.flatMap((exception) =>
      exception.ghsaIds.map(
        (ghsaId) =>
          `${exception.bundle} ${toSpecifier(exception.package, exception.version)} ${ghsaId}`
      )
    )
  );

  const violations = [];
  const excepted = [];
  const usedExceptionKeys = new Set();
  for (const bundledPackage of bundledPackages) {
    for (const advisory of advisories) {
      if (advisory.name !== bundledPackage.name || advisory.version !== bundledPackage.version) {
        continue;
      }
      if (severityRank(advisory.severity) < minimumRank) {
        continue;
      }
      const finding = { bundle: bundledPackage.bundle, ...advisory };
      const key = `${finding.bundle} ${toSpecifier(finding.name, finding.version)} ${finding.ghsaId}`;
      if (exceptionKeys.has(key)) {
        excepted.push(finding);
        usedExceptionKeys.add(key);
      } else {
        violations.push(finding);
      }
    }
  }

  const staleExceptions = [...exceptionKeys].filter((key) => !usedExceptionKeys.has(key)).sort();
  const byKey = (left, right) =>
    left.bundle.localeCompare(right.bundle) ||
    left.name.localeCompare(right.name) ||
    left.ghsaId.localeCompare(right.ghsaId);
  return {
    violations: violations.sort(byKey),
    excepted: excepted.sort(byKey),
    staleExceptions,
  };
}

/**
 * 検出 1 件をログ用の 1 行に整形する。
 *
 * @param {{ bundle: string, name: string, version: string, ghsaId: string, severity: string, vulnerableVersions: string, title: string }} finding 検出
 * @returns {string} ログの 1 行
 */
function formatFinding(finding) {
  return `  - [${finding.severity}] ${finding.ghsaId} ${toSpecifier(finding.name, finding.version)}（脆弱な範囲: ${finding.vulnerableVersions}、同梱元: ${finding.bundle}）: ${finding.title}`;
}

/**
 * CLI のエントリーポイント。同梱パッケージを抽出し、アドバイザリと照合した結果を出力する。
 *
 * 注意:
 *   `--audit-level` が欠けている場合、未知のオプションが渡された場合は例外を投げる（fail fast）。
 *   照合の結果、違反または陳腐化した例外があれば `ok: false` を返す（終了コードは呼び出し元が設定する）。
 *
 * @param {object} [dependencies] テスト用に差し替え可能な依存
 * @param {string[]} [dependencies.argv] CLI 引数（既定は process.argv.slice(2)）
 * @param {string} [dependencies.projectRoot] プロジェクトのルート（既定は本スクリプトの 1 つ上の階層）
 * @param {typeof readFileSync} [dependencies.readFile] ファイル読み込み関数
 * @param {typeof readdirSync} [dependencies.readDirectory] ディレクトリ読み込み関数
 * @param {typeof fetch} [dependencies.fetchImpl] HTTP クライアント
 * @param {unknown} [dependencies.exceptions] 例外の一覧
 * @param {{ log: (message: string) => void, error: (message: string) => void }} [dependencies.logger] ログ出力先
 * @returns {Promise<{ ok: boolean, bundledPackageCount: number } & ReturnType<typeof evaluateFindings>>} 判定結果
 */
export async function main({
  argv = process.argv.slice(2),
  projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  readFile = readFileSync,
  readDirectory = readdirSync,
  fetchImpl = fetch,
  exceptions = BUNDLED_ADVISORY_EXCEPTIONS,
  logger = console,
} = {}) {
  const { values } = parseArgs({
    args: argv,
    options: { 'audit-level': { type: 'string' } },
    strict: true,
    allowPositionals: false,
  });
  const auditLevel = values['audit-level'];
  if (auditLevel === undefined || auditLevel === '') {
    throw new Error('--audit-level が指定されていません。');
  }
  severityRank(auditLevel);
  const validatedExceptions = validateExceptions(exceptions);

  const [vitePlus, core] = resolveVitePlusPackages(projectRoot, readFile);
  const io = { readDirectory, readFile };
  const corePackages = collectInlinedPackages(core.directory, io);
  // bundledVersions（vite / rolldown / tsdown）は、モジュールの元パスから抽出した一覧に統合する
  for (const [name, versions] of parseBundledVersions(core.manifest.bundledVersions)) {
    corePackages.set(name, new Set([...(corePackages.get(name) ?? []), ...versions]));
  }
  const bundledPackages = flattenBundledPackages([
    {
      bundle: toSpecifier(vitePlus.name, vitePlus.version),
      packages: collectInlinedPackages(vitePlus.directory, io),
    },
    { bundle: toSpecifier(core.name, core.version), packages: corePackages },
  ]);

  const advisories = await fetchAdvisories(bundledPackages, fetchImpl);
  const result = evaluateFindings({
    bundledPackages,
    advisories,
    exceptions: validatedExceptions,
    auditLevel,
  });

  logger.log(
    `同梱パッケージ ${bundledPackages.length} 件（${toSpecifier(vitePlus.name, vitePlus.version)} と ${toSpecifier(core.name, core.version)}）を、監査レベル ${auditLevel} 以上のアドバイザリと照合しました。`
  );
  if (result.excepted.length > 0) {
    logger.log(
      `例外として許容した検出（${result.excepted.length} 件。理由は scripts/bundled-advisory-exceptions.mjs を参照）:`
    );
    for (const finding of result.excepted) {
      logger.log(formatFinding(finding));
    }
  }
  if (result.violations.length > 0) {
    logger.error(`例外に記録されていない検出（${result.violations.length} 件）:`);
    for (const finding of result.violations) {
      logger.error(formatFinding(finding));
    }
    logger.error(
      '対応方法: vite-plus の更新で解消できるかを確認してください。解消できない場合は、影響経路を評価し、' +
        'scripts/bundled-advisory-exceptions.mjs に理由・影響経路の評価・解除条件とともに例外を記録してください。'
    );
  }
  if (result.staleExceptions.length > 0) {
    logger.error(`どの検出にも一致しない例外（${result.staleExceptions.length} 件）:`);
    for (const key of result.staleExceptions) {
      logger.error(`  - ${key}`);
    }
    logger.error(
      '対応方法: vite-plus の更新等で検出が解消または変化しています。再評価のうえ、' +
        'scripts/bundled-advisory-exceptions.mjs から該当する例外を削除または更新してください。'
    );
  }

  const ok = result.violations.length === 0 && result.staleExceptions.length === 0;
  if (ok) {
    logger.log('例外に記録されていない検出はありません。');
  }
  return { ok, bundledPackageCount: bundledPackages.length, ...result };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await main();
  if (!result.ok) {
    process.exitCode = 1;
  }
}
