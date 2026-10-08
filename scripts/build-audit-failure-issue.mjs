#!/usr/bin/env node

/**
 * Dependency Audit の定期監査が失敗したときに起票・追記する issue の本文を生成するスクリプト。
 *
 * 目的:
 *   `.github/workflows/security.yml` の report ジョブから呼び出す。main の定期監査
 *   （schedule）または手動実行（workflow_dispatch）で `pnpm audit` が失敗したとき、
 *   検出したアドバイザリを一覧化した Markdown を生成し、GitHub CLI による issue の
 *   起票・コメント追記に渡す（issue #267）。
 *
 * 内容:
 *   - `pnpm audit --json` の出力を読み込み、監査レベル以上のアドバイザリを抽出する。
 *   - GHSA ID・重要度・パッケージ名・脆弱なバージョン範囲・修正版・依存経路を表にする。
 *   - アドバイザリが 0 件の場合は、監査ジョブが脆弱性以外の理由で失敗した可能性を明記する。
 *
 * 使用方法:
 *   node scripts/build-audit-failure-issue.mjs \
 *     --audit-json <pnpm audit --json の出力ファイル> \
 *     --audit-level <info|low|moderate|high|critical> \
 *     --run-url <ワークフロー実行の URL> \
 *     --event-name <schedule|workflow_dispatch> \
 *     --commit-sha <監査対象のコミット SHA> \
 *     --output <本文の出力先ファイル>
 *
 * 注意:
 *   - `pnpm audit --json` の出力形式が想定と異なる場合は、例外を投げて終了コード 1 で終了する
 *     （fail fast）。形式を解釈できないまま「0 件」と誤って報告しないためである。
 *   - `package.json` の `pnpm.auditConfig.ignoreGhsas` で除外した GHSA は、pnpm が
 *     `advisories` から除いて出力するため、本スクリプトの集計対象にならない。
 *   - 生成した本文が GitHub の issue 本文・コメントの上限（65,536 文字）を超える場合は
 *     例外を投げる。本文を黙って切り詰めると、検出内容の一部が失われるためである。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * pnpm audit が出力する重要度を、低いものから順に並べた配列。
 * 配列の添字を重要度の順位として比較に使う。
 */
export const SEVERITY_LEVELS = ['info', 'low', 'moderate', 'high', 'critical'];

/**
 * 1 件のアドバイザリについて表に載せる依存経路の上限。
 * 推移的依存が多数の経路から参照されると表が読めなくなるため、超過分は件数だけを示す。
 */
export const MAX_PATHS_PER_ADVISORY = 5;

/** GitHub の issue 本文・コメントに設定できる最大文字数。 */
export const GITHUB_BODY_MAX_LENGTH = 65536;

/**
 * 起票ジョブを起動するイベント名と、本文に表示する日本語の説明の対応。
 * security.yml の report ジョブはこの 2 種類のイベントでのみ実行される。
 */
const EVENT_LABELS = {
  schedule: '定期監査',
  workflow_dispatch: '手動実行',
};

/** CLI で必須とするオプション名の一覧。 */
const REQUIRED_OPTIONS = [
  'audit-json',
  'audit-level',
  'run-url',
  'event-name',
  'commit-sha',
  'output',
];

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
 * アドバイザリのフィールドが空でない文字列であることを検証して返す。
 *
 * @param {unknown} value 検証対象の値
 * @param {string} fieldName エラーメッセージに表示するフィールド名
 * @param {string} advisoryKey エラーメッセージに表示するアドバイザリのキー
 * @returns {string} 検証済みの文字列
 * @throws {Error} 値が空でない文字列ではない場合
 */
function requireString(value, fieldName, advisoryKey) {
  if (typeof value !== 'string' || value === '') {
    throw new Error(
      `pnpm audit の出力形式が想定と異なります: advisories["${advisoryKey}"].${fieldName} が空でない文字列ではありません。`
    );
  }
  return value;
}

/**
 * `pnpm audit --json` の出力から、監査レベル以上のアドバイザリを抽出する。
 *
 * 目的:
 *   issue 本文の表に載せるアドバイザリを、監査ジョブ（`pnpm audit --audit-level`）と
 *   同じ基準で選び出す。
 *
 * 内容:
 *   - 重要度が auditLevel 未満のアドバイザリを除外する。
 *   - 同一アドバイザリの複数の findings に含まれる依存経路を、重複を除いて昇順に集約する。
 *   - 結果を重要度の高い順に並べ、同じ重要度の中では GHSA ID の昇順に並べる。
 *
 * 注意:
 *   出力形式が想定と異なる場合（`advisories` がない、必須フィールドが欠けている等）は
 *   例外を投げる。pnpm がエラー時に出力する JSON を「0 件」と誤認しないためである。
 *
 * @param {unknown} auditReport `pnpm audit --json` の出力を JSON.parse した値
 * @param {string} auditLevel 監査レベル（info / low / moderate / high / critical）
 * @returns {Array<{ghsaId: string, severity: string, moduleName: string, vulnerableVersions: string, patchedVersions: string, url: string, paths: string[]}>}
 *   抽出したアドバイザリの配列
 * @throws {Error} 監査レベルが未知の場合、または出力形式が想定と異なる場合
 */
export function extractAdvisories(auditReport, auditLevel) {
  const minimumRank = severityRank(auditLevel);

  if (!isPlainObject(auditReport) || !isPlainObject(auditReport.advisories)) {
    throw new Error(
      'pnpm audit の出力形式が想定と異なります: advisories オブジェクトがありません。'
    );
  }

  const advisories = [];
  for (const [advisoryKey, advisory] of Object.entries(auditReport.advisories)) {
    if (!isPlainObject(advisory)) {
      throw new Error(
        `pnpm audit の出力形式が想定と異なります: advisories["${advisoryKey}"] がオブジェクトではありません。`
      );
    }

    const severity = requireString(advisory.severity, 'severity', advisoryKey);
    if (severityRank(severity) < minimumRank) {
      continue;
    }

    if (!Array.isArray(advisory.findings)) {
      throw new Error(
        `pnpm audit の出力形式が想定と異なります: advisories["${advisoryKey}"].findings が配列ではありません。`
      );
    }
    // 1 つのアドバイザリが複数の脆弱なバージョン（findings）を持つ場合があるため、
    // 全 findings の依存経路を 1 つにまとめる
    const paths = advisory.findings.flatMap((finding, findingIndex) => {
      if (!isPlainObject(finding) || !Array.isArray(finding.paths)) {
        throw new Error(
          `pnpm audit の出力形式が想定と異なります: advisories["${advisoryKey}"].findings[${findingIndex}].paths が配列ではありません。`
        );
      }
      return finding.paths.map((dependencyPath) =>
        requireString(dependencyPath, `findings[${findingIndex}].paths`, advisoryKey)
      );
    });

    advisories.push({
      ghsaId: requireString(advisory.github_advisory_id, 'github_advisory_id', advisoryKey),
      severity,
      moduleName: requireString(advisory.module_name, 'module_name', advisoryKey),
      vulnerableVersions: requireString(
        advisory.vulnerable_versions,
        'vulnerable_versions',
        advisoryKey
      ),
      patchedVersions: requireString(advisory.patched_versions, 'patched_versions', advisoryKey),
      url: requireString(advisory.url, 'url', advisoryKey),
      paths: [...new Set(paths)].sort(),
    });
  }

  return advisories.sort(
    (left, right) =>
      severityRank(right.severity) - severityRank(left.severity) ||
      left.ghsaId.localeCompare(right.ghsaId)
  );
}

/**
 * Markdown の表のセルに入れる文字列を、インラインコードとしてエスケープする。
 *
 * バージョン範囲には `||`（OR 条件）が含まれることがあり、そのままでは表の列区切りとして
 * 解釈されてしまう。GitHub Flavored Markdown ではインラインコード内でも `\|` で
 * エスケープすれば `|` として表示されるため、`|` をすべてエスケープする。
 *
 * @param {string} value セルに入れる文字列
 * @returns {string} インラインコードとして整形した文字列
 */
function toCodeCell(value) {
  return `\`${value.replaceAll('|', '\\|')}\``;
}

/**
 * アドバイザリ 1 件の依存経路を、表のセル 1 つ分の文字列に整形する。
 * 経路が MAX_PATHS_PER_ADVISORY を超える場合は、超過分を「ほか N 経路」と件数で示す。
 *
 * @param {string[]} paths 依存経路の配列
 * @returns {string} `<br>` 区切りで連結したセルの文字列
 */
function formatPathsCell(paths) {
  const shown = paths.slice(0, MAX_PATHS_PER_ADVISORY).map(toCodeCell);
  const hiddenCount = paths.length - shown.length;
  if (hiddenCount > 0) {
    shown.push(`ほか ${hiddenCount} 経路`);
  }
  return shown.join('<br>');
}

/**
 * Dependency Audit の失敗を報告する issue（またはコメント）の本文を生成する。
 *
 * 目的:
 *   検出したアドバイザリと対応方法を 1 つの Markdown にまとめ、issue を読むだけで
 *   修正作業に着手できるようにする。
 *
 * 内容:
 *   - 実行 URL・起動イベント・監査対象のコミット・監査レベルを表で示す。
 *   - アドバイザリが 1 件以上あれば一覧表と対応方法を、0 件であれば実行ログの確認を促す文言を出す。
 *
 * 注意:
 *   生成した本文が GITHUB_BODY_MAX_LENGTH を超える場合は例外を投げる。
 *
 * @param {object} params 本文の生成に使う値
 * @param {ReturnType<typeof extractAdvisories>} params.advisories extractAdvisories の戻り値
 * @param {string} params.auditLevel 監査レベル
 * @param {string} params.runUrl ワークフロー実行の URL
 * @param {string} params.eventName 起動イベント名（schedule / workflow_dispatch）
 * @param {string} params.commitSha 監査対象のコミット SHA
 * @returns {string} issue 本文の Markdown
 * @throws {Error} 起動イベントが想定外の場合、または本文が上限を超える場合
 */
export function buildIssueBody({ advisories, auditLevel, runUrl, eventName, commitSha }) {
  const eventLabel = EVENT_LABELS[eventName];
  if (eventLabel === undefined) {
    throw new Error(
      `想定外の起動イベントです: "${eventName}"（許容値: ${Object.keys(EVENT_LABELS).join(' / ')}）`
    );
  }

  const lines = [
    '## 実行情報',
    '',
    `Dependency Audit（\`.github/workflows/security.yml\`）の${eventLabel}で、監査ジョブが失敗しました。`,
    '',
    '| 項目 | 値 |',
    '|---|---|',
    `| ワークフロー実行 | ${runUrl} |`,
    `| 起動イベント | \`${eventName}\`（${eventLabel}） |`,
    `| 監査対象のコミット | \`${commitSha}\` |`,
    `| 監査レベル | \`${auditLevel}\` 以上 |`,
    '',
    `## 検出したアドバイザリ（${advisories.length} 件）`,
    '',
  ];

  if (advisories.length === 0) {
    lines.push(
      '監査ジョブは失敗しましたが、再監査ではアドバイザリを検出しませんでした。' +
        '依存関係のインストールの失敗、Aikido Safe Chain による取得の阻止、' +
        'レジストリの一時的なエラーなど、脆弱性以外の理由で失敗した可能性があります。' +
        '上記のワークフロー実行のログを確認してください。'
    );
  } else {
    lines.push(
      '| GHSA ID | 重要度 | パッケージ | 脆弱なバージョン範囲 | 修正版 | 依存経路 |',
      '|---|---|---|---|---|---|'
    );
    for (const advisory of advisories) {
      lines.push(
        `| [${advisory.ghsaId}](${advisory.url}) | ${advisory.severity} | ${toCodeCell(advisory.moduleName)} | ${toCodeCell(advisory.vulnerableVersions)} | ${toCodeCell(advisory.patchedVersions)} | ${formatPathsCell(advisory.paths)} |`
      );
    }
    lines.push(
      '',
      '## 対応方法',
      '',
      '1. issue-resolve スキルに本 issue を指定し、`package.json` の `pnpm.overrides` で修正版を強制する（issue #173 の方針）。',
      '2. 修正版が存在しない場合など、やむを得ず `pnpm.auditConfig` に例外を追加するときは、`.github/workflows/security.yml` のコメントに対象 ID・理由・影響経路の評価・解除条件を記録する。',
      '3. 修正版の公開から 48 時間が経過していない場合、Aikido Safe Chain の最小経過時間ガード（`.aikido` の `minimumPackageAgeHours`）によって取得が阻止されることがある。その場合は経過を待ってから再試行する。'
    );
  }

  const body = `${lines.join('\n')}\n`;
  if (body.length > GITHUB_BODY_MAX_LENGTH) {
    throw new Error(
      `issue 本文が GitHub の上限（${GITHUB_BODY_MAX_LENGTH} 文字）を超えています: ${body.length} 文字`
    );
  }
  return body;
}

/**
 * CLI のエントリーポイント。引数を解釈し、issue 本文をファイルへ書き出す。
 *
 * 目的:
 *   security.yml の report ジョブから、`pnpm audit --json` の出力ファイルを受け取って
 *   issue 本文のファイルを生成する。
 *
 * 注意:
 *   必須オプションが欠けている場合、未知のオプションが渡された場合、JSON として解析できない
 *   場合は例外を投げる（fail fast）。
 *
 * @param {object} [dependencies] テスト用に差し替え可能な依存
 * @param {string[]} [dependencies.argv] CLI 引数（既定は process.argv.slice(2)）
 * @param {typeof readFileSync} [dependencies.readFile] ファイル読み込み関数
 * @param {typeof writeFileSync} [dependencies.writeFile] ファイル書き込み関数
 * @param {{ log: (message: string) => void }} [dependencies.logger] ログ出力先
 * @returns {{ advisoryCount: number }} 本文に載せたアドバイザリの件数
 */
export function main({
  argv = process.argv.slice(2),
  readFile = readFileSync,
  writeFile = writeFileSync,
  logger = console,
} = {}) {
  const { values } = parseArgs({
    args: argv,
    options: Object.fromEntries(REQUIRED_OPTIONS.map((name) => [name, { type: 'string' }])),
    strict: true,
    allowPositionals: false,
  });

  for (const name of REQUIRED_OPTIONS) {
    if (values[name] === undefined || values[name] === '') {
      throw new Error(`--${name} が指定されていません。`);
    }
  }

  let auditReport;
  try {
    auditReport = JSON.parse(readFile(values['audit-json'], 'utf-8'));
  } catch (error) {
    throw new Error(
      `pnpm audit の出力（${values['audit-json']}）を JSON として読み込めません: ${error.message}`,
      { cause: error }
    );
  }

  const advisories = extractAdvisories(auditReport, values['audit-level']);
  const body = buildIssueBody({
    advisories,
    auditLevel: values['audit-level'],
    runUrl: values['run-url'],
    eventName: values['event-name'],
    commitSha: values['commit-sha'],
  });
  writeFile(values.output, body, 'utf-8');
  logger.log(
    `issue 本文を ${values.output} へ出力しました（アドバイザリ ${advisories.length} 件）。`
  );
  return { advisoryCount: advisories.length };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
