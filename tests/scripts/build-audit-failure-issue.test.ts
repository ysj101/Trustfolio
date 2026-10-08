import { describe, expect, it } from 'vitest';
import {
  buildIssueBody,
  extractAdvisories,
  GITHUB_BODY_MAX_LENGTH,
  main,
  MAX_PATHS_PER_ADVISORY,
} from '../../scripts/build-audit-failure-issue.mjs';

/**
 * scripts/build-audit-failure-issue.mjs のテスト。
 *
 * 対象のスクリプトは、.github/workflows/security.yml の report ジョブが
 * `pnpm audit --json` の出力から issue 本文を生成するために使う（issue #267）。
 *
 * テストデータは、2026-10-08 に本リポジトリの main で実際に検出された
 * アドバイザリ（tinypool・source-map-js など）の値をもとにしている。
 */

/** ワークフロー実行の URL のサンプル。 */
const RUN_URL = 'https://github.com/ysj101/Trustfolio/actions/runs/37690284836';

/** 監査対象のコミット SHA のサンプル。 */
const COMMIT_SHA = 'e2cf3ae0d1b2c3d4e5f60718293a4b5c6d7e8f90';

/**
 * `pnpm audit --json` の advisories に含まれるアドバイザリ 1 件を生成する。
 * 本テストで参照するフィールドだけを持つ。
 */
function createAdvisory(overrides: Record<string, unknown> = {}) {
  return {
    github_advisory_id: 'GHSA-85c8-ppgw-ccpr',
    severity: 'critical',
    module_name: 'tinypool',
    vulnerable_versions: '<2.1.2',
    patched_versions: '>=2.1.2',
    url: 'https://github.com/advisories/GHSA-85c8-ppgw-ccpr',
    findings: [{ version: '2.1.0', paths: ['.>vite-plus>oxfmt>tinypool'] }],
    ...overrides,
  };
}

describe('scripts/build-audit-failure-issue', () => {
  describe('extractAdvisories', () => {
    it('監査レベル未満のアドバイザリを除外し、重要度の高い順・GHSA ID の昇順に並べる', () => {
      // 前提: pnpm audit の出力に critical 2 件・high 1 件・low 1 件のアドバイザリがある
      // 事前条件: 監査レベルは security.yml と同じ moderate である
      // 検証: low は除外され、critical（GHSA ID 昇順）→ high の順に並ぶ
      const auditReport = {
        advisories: {
          '1001': createAdvisory({
            github_advisory_id: 'GHSA-68fv-2mgg-jv7q',
            severity: 'high',
            module_name: 'source-map-js',
            vulnerable_versions: '>=1.0.0 <1.2.2',
            patched_versions: '>=1.2.2',
            url: 'https://github.com/advisories/GHSA-68fv-2mgg-jv7q',
            findings: [
              {
                version: '1.2.1',
                paths: ['.>@tailwindcss/cli>@tailwindcss/node>source-map-js'],
              },
            ],
          }),
          '1002': createAdvisory(),
          '1003': createAdvisory({
            github_advisory_id: 'GHSA-5gmw-xhrv-c9v3',
            vulnerable_versions: '<=2.1.0',
            patched_versions: '>=2.1.1',
            url: 'https://github.com/advisories/GHSA-5gmw-xhrv-c9v3',
          }),
          '1004': createAdvisory({
            github_advisory_id: 'GHSA-xxxx-low0-test',
            severity: 'low',
            module_name: 'brace-expansion',
          }),
        },
      };

      const advisories = extractAdvisories(auditReport, 'moderate');

      expect(advisories.map((advisory) => advisory.ghsaId)).toEqual([
        'GHSA-5gmw-xhrv-c9v3',
        'GHSA-85c8-ppgw-ccpr',
        'GHSA-68fv-2mgg-jv7q',
      ]);
      expect(advisories[2]).toEqual({
        ghsaId: 'GHSA-68fv-2mgg-jv7q',
        severity: 'high',
        moduleName: 'source-map-js',
        vulnerableVersions: '>=1.0.0 <1.2.2',
        patchedVersions: '>=1.2.2',
        url: 'https://github.com/advisories/GHSA-68fv-2mgg-jv7q',
        paths: ['.>@tailwindcss/cli>@tailwindcss/node>source-map-js'],
      });
    });

    it('同一アドバイザリの複数の findings に含まれる依存経路を、重複を除いて昇順に集約する', () => {
      // 前提: 1 件のアドバイザリが 2 つの脆弱なバージョン（findings）を持つ
      // 事前条件: 2 つの findings に同じ依存経路が重複して含まれる
      // 検証: 依存経路は重複なく昇順の 1 つの配列にまとまる
      const auditReport = {
        advisories: {
          '2001': createAdvisory({
            findings: [
              { version: '2.0.0', paths: ['.>vitest>tinypool', '.>vite-plus>oxfmt>tinypool'] },
              { version: '2.1.0', paths: ['.>vite-plus>oxfmt>tinypool'] },
            ],
          }),
        },
      };

      const [advisory] = extractAdvisories(auditReport, 'moderate');

      expect(advisory.paths).toEqual(['.>vite-plus>oxfmt>tinypool', '.>vitest>tinypool']);
    });

    it('アドバイザリが 0 件の出力からは空配列を返す', () => {
      // 前提: pnpm audit が脆弱性を検出しなかった
      // 事前条件: advisories は空のオブジェクトである
      // 検証: 例外にならず空配列が返る
      expect(extractAdvisories({ advisories: {} }, 'moderate')).toEqual([]);
    });

    it('advisories を持たない出力（pnpm のエラー出力など）は例外にする', () => {
      // 前提: レジストリのエラーなどで、pnpm audit が advisories を含まない JSON を出力した
      // 事前条件: 出力は error オブジェクトだけを持つ
      // 検証: 「0 件」と誤認せず、出力形式の不一致として例外を投げる
      const errorReport = { error: { code: 'ERR_PNPM_AUDIT_BAD_RESPONSE' } };

      expect(() => extractAdvisories(errorReport, 'moderate')).toThrow(
        'advisories オブジェクトがありません'
      );
    });

    it('必須フィールドが欠けたアドバイザリは例外にする', () => {
      // 前提: アドバイザリの github_advisory_id が空文字である
      // 事前条件: その他のフィールドは揃っている
      // 検証: どのアドバイザリのどのフィールドが不正かを示して例外を投げる
      const auditReport = { advisories: { '3001': createAdvisory({ github_advisory_id: '' }) } };

      expect(() => extractAdvisories(auditReport, 'moderate')).toThrow(
        'advisories["3001"].github_advisory_id が空でない文字列ではありません'
      );
    });

    it('findings の paths が配列でないアドバイザリは例外にする', () => {
      // 前提: findings の要素に paths がない
      // 事前条件: 重要度は監査レベル以上である
      // 検証: 依存経路を集計できないため例外を投げる
      const auditReport = {
        advisories: { '4001': createAdvisory({ findings: [{ version: '2.1.0' }] }) },
      };

      expect(() => extractAdvisories(auditReport, 'moderate')).toThrow(
        'advisories["4001"].findings[0].paths が配列ではありません'
      );
    });

    it('未知の監査レベルは例外にする', () => {
      // 前提: 監査レベルに pnpm audit が受け付けない値が渡された
      // 事前条件: 出力自体は正しい形式である
      // 検証: 許容値を示して例外を投げる
      expect(() => extractAdvisories({ advisories: {} }, 'severe')).toThrow(
        '未知の重要度です: "severe"'
      );
    });
  });

  describe('buildIssueBody', () => {
    it('アドバイザリの一覧表と対応方法を含む本文を生成する', () => {
      // 前提: 定期監査で critical のアドバイザリが 1 件検出された
      // 事前条件: 起動イベントは schedule である
      // 検証: 実行情報・GHSA のリンク・パッケージ・バージョン範囲・依存経路・対応方法が本文に含まれる
      const advisories = extractAdvisories(
        { advisories: { '5001': createAdvisory() } },
        'moderate'
      );

      const body = buildIssueBody({
        advisories,
        auditLevel: 'moderate',
        runUrl: RUN_URL,
        eventName: 'schedule',
        commitSha: COMMIT_SHA,
      });

      expect(body).toContain(`| ワークフロー実行 | ${RUN_URL} |`);
      expect(body).toContain('| 起動イベント | `schedule`（定期監査） |');
      expect(body).toContain(`| 監査対象のコミット | \`${COMMIT_SHA}\` |`);
      expect(body).toContain('| 監査レベル | `moderate` 以上 |');
      expect(body).toContain('## 検出したアドバイザリ（1 件）');
      expect(body).toContain(
        '| [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) | critical | `tinypool` | `<2.1.2` | `>=2.1.2` | `.>vite-plus>oxfmt>tinypool` |'
      );
      expect(body).toContain('## 対応方法');
    });

    it('バージョン範囲に含まれる | をエスケープし、表の列が崩れないようにする', () => {
      // 前提: 脆弱なバージョン範囲が OR 条件（||）を含む
      // 事前条件: 起動イベントは workflow_dispatch である
      // 検証: | が \| にエスケープされ、起動イベントは手動実行と表示される
      const advisories = extractAdvisories(
        {
          advisories: {
            '6001': createAdvisory({
              github_advisory_id: 'GHSA-jqcg-44mw-7w3h',
              module_name: 'proxy-addr',
              vulnerable_versions: '>=1.1.0 <2.0.8 || >=3.0.0 <3.0.1',
              patched_versions: '>=2.0.8',
              url: 'https://github.com/advisories/GHSA-jqcg-44mw-7w3h',
            }),
          },
        },
        'moderate'
      );

      const body = buildIssueBody({
        advisories,
        auditLevel: 'moderate',
        runUrl: RUN_URL,
        eventName: 'workflow_dispatch',
        commitSha: COMMIT_SHA,
      });

      expect(body).toContain('`>=1.1.0 <2.0.8 \\|\\| >=3.0.0 <3.0.1`');
      expect(body).toContain('| 起動イベント | `workflow_dispatch`（手動実行） |');
    });

    it('依存経路が上限を超える場合は、超過分を件数で示す', () => {
      // 前提: 1 件のアドバイザリが上限 + 2 本の依存経路から参照されている
      // 事前条件: 依存経路はすべて異なる
      // 検証: 上限本数の経路だけを表示し、残りは「ほか 2 経路」と示す
      const paths = Array.from(
        { length: MAX_PATHS_PER_ADVISORY + 2 },
        (_, index) => `.>@google/clasp>パッケージ${index}>tinypool`
      );
      const advisories = extractAdvisories(
        { advisories: { '7001': createAdvisory({ findings: [{ version: '2.1.0', paths }] }) } },
        'moderate'
      );

      const body = buildIssueBody({
        advisories,
        auditLevel: 'moderate',
        runUrl: RUN_URL,
        eventName: 'schedule',
        commitSha: COMMIT_SHA,
      });

      expect(body).toContain('`.>@google/clasp>パッケージ4>tinypool`<br>ほか 2 経路');
      expect(body).not.toContain('パッケージ5');
    });

    it('アドバイザリが 0 件の場合は、実行ログの確認を促し、対応方法を出さない', () => {
      // 前提: 監査ジョブは失敗したが、再監査ではアドバイザリが検出されなかった
      // 事前条件: advisories は空配列である
      // 検証: 脆弱性以外の理由で失敗した可能性と、実行ログの確認を促す文言が含まれる
      const body = buildIssueBody({
        advisories: [],
        auditLevel: 'moderate',
        runUrl: RUN_URL,
        eventName: 'schedule',
        commitSha: COMMIT_SHA,
      });

      expect(body).toContain('## 検出したアドバイザリ（0 件）');
      expect(body).toContain('再監査ではアドバイザリを検出しませんでした');
      expect(body).toContain('ログを確認してください');
      expect(body).not.toContain('## 対応方法');
    });

    it('想定外の起動イベントは例外にする', () => {
      // 前提: report ジョブは schedule と workflow_dispatch でのみ実行される
      // 事前条件: 起動イベントに pull_request が渡された
      // 検証: 許容値を示して例外を投げる
      expect(() =>
        buildIssueBody({
          advisories: [],
          auditLevel: 'moderate',
          runUrl: RUN_URL,
          eventName: 'pull_request',
          commitSha: COMMIT_SHA,
        })
      ).toThrow('想定外の起動イベントです: "pull_request"');
    });

    it('本文が GitHub の上限を超える場合は例外にする', () => {
      // 前提: 非常に長いパッケージ名のアドバイザリが大量にある
      // 事前条件: 本文の長さが GITHUB_BODY_MAX_LENGTH を超える
      // 検証: 本文を黙って切り詰めず、例外を投げる
      const longName = 'とても長いパッケージ名'.repeat(100);
      const advisories = Array.from({ length: 100 }, (_, index) => ({
        ghsaId: `GHSA-test-${String(index).padStart(4, '0')}-aaaa`,
        severity: 'high',
        moduleName: longName,
        vulnerableVersions: '<1.0.0',
        patchedVersions: '>=1.0.0',
        url: 'https://github.com/advisories/GHSA-test',
        paths: [`.>${longName}`],
      }));

      expect(() =>
        buildIssueBody({
          advisories,
          auditLevel: 'moderate',
          runUrl: RUN_URL,
          eventName: 'schedule',
          commitSha: COMMIT_SHA,
        })
      ).toThrow(`GitHub の上限（${GITHUB_BODY_MAX_LENGTH} 文字）を超えています`);
    });
  });

  describe('main', () => {
    /** CLI に渡す引数のうち、--audit-json 以外の必須引数。 */
    const BASE_ARGS = [
      '--audit-level',
      'moderate',
      '--run-url',
      RUN_URL,
      '--event-name',
      'schedule',
      '--commit-sha',
      COMMIT_SHA,
      '--output',
      '/tmp/issue-body.md',
    ];

    it('pnpm audit の出力ファイルを読み込み、issue 本文をファイルへ書き出す', () => {
      // 前提: pnpm audit の出力ファイルに critical のアドバイザリが 1 件ある
      // 事前条件: ファイルの読み書きは差し替えた関数で行う
      // 検証: 出力先へ本文が書き出され、件数がログと戻り値に反映される
      const writes: Array<{ path: string; content: string }> = [];
      const logs: string[] = [];

      const result = main({
        argv: ['--audit-json', '/tmp/audit.json', ...BASE_ARGS],
        readFile: () => JSON.stringify({ advisories: { '8001': createAdvisory() } }),
        writeFile: (path: string, content: string) => writes.push({ path, content }),
        logger: { log: (message: string) => logs.push(message) },
      });

      expect(result).toEqual({ advisoryCount: 1 });
      expect(writes).toHaveLength(1);
      expect(writes[0].path).toBe('/tmp/issue-body.md');
      expect(writes[0].content).toContain('GHSA-85c8-ppgw-ccpr');
      expect(logs).toEqual([
        'issue 本文を /tmp/issue-body.md へ出力しました（アドバイザリ 1 件）。',
      ]);
    });

    it('必須の引数が欠けている場合は例外にする', () => {
      // 前提: --audit-json が指定されていない
      // 事前条件: その他の必須引数は揃っている
      // 検証: 欠けている引数名を示して例外を投げる
      expect(() =>
        main({
          argv: BASE_ARGS,
          readFile: () => '{"advisories":{}}',
          writeFile: () => undefined,
          logger: { log: () => undefined },
        })
      ).toThrow('--audit-json が指定されていません。');
    });

    it('pnpm audit の出力が JSON として解析できない場合は例外にする', () => {
      // 前提: pnpm audit が異常終了し、出力ファイルが空である
      // 事前条件: 必須引数は揃っている
      // 検証: 出力ファイルのパスを示して例外を投げ、本文を書き出さない
      const writes: string[] = [];

      expect(() =>
        main({
          argv: ['--audit-json', '/tmp/audit.json', ...BASE_ARGS],
          readFile: () => '',
          writeFile: (path: string) => writes.push(path),
          logger: { log: () => undefined },
        })
      ).toThrow('pnpm audit の出力（/tmp/audit.json）を JSON として読み込めません');
      expect(writes).toEqual([]);
    });
  });
});
