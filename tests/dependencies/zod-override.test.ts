import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vite-plus/test';

/**
 * zod の強制（pnpm-workspace.yaml の overrides の "@google/clasp@<版>>zod"、issue #291）の前提を検査するテスト。
 *
 * 目的:
 *   zod の強制は、動作を確認した clasp の版に限って、clasp の宣言範囲（zod 3 系）の外の zod 4 系を使わせている。
 *   clasp を更新すると強制が外れ、zod は脆弱な 3 系へ戻りうる。この崩れを、必須チェックの Unit Tests で検出する
 *   （fail fast）。判断理由と、本テストが失敗したときの手順の正本は、docs/UPGRADE_STRATEGY.md の
 *   「zod の強制（"@google/clasp@<版>>zod"）の記録」の節である。
 *
 * 内容:
 *   - 親セレクタに書いた clasp の版が、ロックファイルの clasp の版（すべて）と一致すること。
 *   - ロックファイルの zod の全版が、GHSA-mrhx-c7xc-m3w5 の修正版（4.6.6）以上であること。
 *
 * 注意:
 *   - 版は「X.Y.Z」の形式だけを想定する。ロックファイルにそれ以外の形式（プレリリース等）の版がある場合は、
 *     黙って検査から外さず、例外を投げて失敗させる。
 *   - zod の強制を削除するときの本テストの扱い（全体を削除するか、2 つ目のテストを残すか）は、
 *     新しい clasp の zod の宣言範囲によって異なる。上記の節の手順に従う。
 */

/** zod の GHSA-mrhx-c7xc-m3w5 の修正版（これ以上なら対象外）。 */
const PATCHED_ZOD_VERSION = '4.6.6';

/** 本テストが失敗したときに案内する手順の正本。 */
const PROCEDURE_REFERENCE =
  'docs/UPGRADE_STRATEGY.md の「zod の強制（"@google/clasp@<版>>zod"）の記録」の手順に従ってください。';

const workspaceSource = fs.readFileSync(path.join(process.cwd(), 'pnpm-workspace.yaml'), 'utf8');
const lockfileSource = fs.readFileSync(path.join(process.cwd(), 'pnpm-lock.yaml'), 'utf8');

/**
 * 「X.Y.Z」形式の版を、比較できる数値の組に変換する。形式が違う場合は例外を投げる（暗黙に別の値へ置き換えない）。
 *
 * @param version 版の文字列
 * @returns [メジャー, マイナー, パッチ]
 */
function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`版の形式が想定（X.Y.Z）と異なります: "${version}"`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * 版 a が版 b 以上かどうかを返す。
 *
 * @param a 比較する版
 * @param b 基準の版
 * @returns a ≧ b なら true
 */
function isAtLeast(a: string, b: string): boolean {
  const [aMajor, aMinor, aPatch] = parseVersion(a);
  const [bMajor, bMinor, bPatch] = parseVersion(b);
  if (aMajor !== bMajor) {
    return aMajor > bMajor;
  }
  if (aMinor !== bMinor) {
    return aMinor > bMinor;
  }
  return aPatch >= bPatch;
}

/**
 * ロックファイルの packages の節に「  <パッケージ名>@<版>:」の形で並ぶ版を、形式を問わずすべて取り出す。
 *
 * @param packageKeyPattern パッケージ名の部分の正規表現（例: `zod`、`'@google\/clasp`）
 * @param keySuffix 版の後ろに続く文字列（クォートで囲まれたキーは `'`）
 * @returns 取り出した版の一覧（重複を除く）
 */
function lockedVersions(packageKeyPattern: string, keySuffix: string): string[] {
  const pattern = new RegExp(`^ {2}${packageKeyPattern}@([^:(\\s']+)${keySuffix}:$`, 'gm');
  return [...new Set([...lockfileSource.matchAll(pattern)].map((match) => match[1]))];
}

describe('zod の強制（"@google/clasp@<版>>zod"）の前提', () => {
  it('親セレクタに書いた clasp の版が、ロックファイルの clasp の版と一致する', () => {
    // 前提: pnpm-workspace.yaml の overrides に "@google/clasp@<版>>zod" がある
    // 事前条件: pnpm-lock.yaml の packages に、解決された clasp の版が「'@google/clasp@<版>':」の形で並ぶ
    // 検証: ロックファイルの clasp の版がすべて親セレクタの版と一致する（clasp を更新すると、強制が外れたことをここで検出する）
    const overrideVersion = /^ {2}"@google\/clasp@([^>"]+)>zod":/m.exec(workspaceSource)?.[1];
    if (overrideVersion === undefined) {
      throw new Error(
        `pnpm-workspace.yaml の overrides に "@google/clasp@<版>>zod" が見つかりません。${PROCEDURE_REFERENCE}`
      );
    }
    parseVersion(overrideVersion);
    const claspVersions = lockedVersions("'@google\\/clasp", "'");
    expect(
      claspVersions.length,
      'pnpm-lock.yaml に @google/clasp が見つかりません。'
    ).toBeGreaterThan(0);

    expect(
      claspVersions,
      `clasp の版（${claspVersions.join(', ')}）が、zod の強制の親セレクタの版（${overrideVersion}）と一致しません。${PROCEDURE_REFERENCE}`
    ).toEqual([overrideVersion]);
  });

  it('ロックファイルの zod はすべて 4.6.6 以上である（GHSA-mrhx-c7xc-m3w5 の対象外）', () => {
    // 前提: zod は clasp・@modelcontextprotocol/sdk・zod-to-json-schema が依存している
    // 事前条件: pnpm-lock.yaml の packages に、解決された zod の版が「zod@<版>:」の形で並ぶ
    // 検証: 解決された zod の版が 1 つ以上あり、すべて 4.6.6 以上である（形式が X.Y.Z でない版は例外で失敗する）
    const zodVersions = lockedVersions('zod', '');
    expect(zodVersions.length, 'pnpm-lock.yaml に zod が見つかりません。').toBeGreaterThan(0);

    const vulnerableVersions = zodVersions.filter(
      (version) => !isAtLeast(version, PATCHED_ZOD_VERSION)
    );
    expect(
      vulnerableVersions,
      `GHSA-mrhx-c7xc-m3w5 の対象（${PATCHED_ZOD_VERSION} 未満）の zod がロックファイルにあります。${PROCEDURE_REFERENCE}`
    ).toEqual([]);
  });
});
