import path from 'node:path';
import { resolveConfig } from 'vite-plus';
import { describe, expect, it } from 'vite-plus/test';

/**
 * vite.config.ts の forbidDevServerProxy プラグインのテスト（issue #286）。
 *
 * 目的:
 *   scripts/bundled-advisory-exceptions.mjs の follow-redirects 1.16.0 の例外は、「本リポジトリでは
 *   vite のプロキシ（server.proxy / preview.proxy）を使わない」ことを根拠にしている。
 *   forbidDevServerProxy プラグインは、この前提が崩れたときに設定の解決を失敗させる唯一のガードである。
 *   本テストは、ガードが前提の崩れを検出し、前提が成り立つ間は解決を妨げないことを確かめる。
 *
 * 内容:
 *   本リポジトリの vite.config.ts を、vite の resolveConfig で実際に解決する。プロキシを足す場合は、
 *   resolveConfig に渡すインライン設定（設定ファイルの内容に重ねて適用される）で server.proxy または
 *   preview.proxy を加える。プラグインは vite.config.ts の非公開関数であるため、export せずに、
 *   設定ファイル全体を解決して検証する。
 *
 * 注意:
 *   follow-redirects の例外とプラグインを削除した（修正版を同梱した vite-plus へ更新した）ときは、
 *   本テストも削除すること。
 */

/** リポジトリのルートディレクトリの絶対パス（本ファイルは tests/ にある）。 */
const projectRoot = path.resolve(import.meta.dirname, '..');

/**
 * forbidDevServerProxy プラグインが投げる例外のメッセージに含まれる、ガードの関数名。
 * メッセージは見直す対象としてこの関数名を案内する。文言全体ではなく関数名で照合するのは、
 * 案内の文言を変えてもテストが壊れず、かつ他の原因による失敗と区別できるようにするためである。
 */
const GUARD_NAME = 'forbidDevServerProxy';

/**
 * 本リポジトリの vite.config.ts を解決する。
 *
 * @param overrides 設定ファイルの内容に重ねるインライン設定（プロキシを足すときに使う）
 * @param command 解決するコマンドの種類。'serve' は vp dev / vp test / vp preview、'build' は vp build と同じ
 * @returns 解決済みの設定
 */
function resolveProjectConfig(
  overrides: Parameters<typeof resolveConfig>[0] = {},
  command: 'serve' | 'build' = 'serve'
) {
  return resolveConfig(
    { ...overrides, root: projectRoot, configFile: path.join(projectRoot, 'vite.config.ts') },
    command
  );
}

describe('vite.config.ts', () => {
  describe('forbidDevServerProxy プラグイン', () => {
    it('server.proxy と preview.proxy がどちらも未設定なら、設定を解決できる', async () => {
      // 前提: 本リポジトリの vite.config.ts はプロキシを設定していない（follow-redirects の例外の根拠）
      const config = await resolveProjectConfig();

      // 検証: 解決が成功し、解決後の server.proxy と preview.proxy がどちらも未設定である
      expect(config.server.proxy).toBeUndefined();
      expect(config.preview.proxy).toBeUndefined();
    });

    it('server.proxy が設定されたら、設定の解決を失敗させる', async () => {
      // 事前条件: 開発サーバーに、リダイレクトを追従する API へのプロキシを加える
      //   （同梱の follow-redirects が要求を送る構成であり、例外の根拠が崩れる）
      const overrides = {
        server: { proxy: { '/api': { target: 'https://api.example.com', followRedirects: true } } },
      };

      // 検証: プラグインが例外を投げ、設定の解決が失敗する
      await expect(resolveProjectConfig(overrides)).rejects.toThrow(GUARD_NAME);
    });

    it('preview.proxy だけが設定されても、設定の解決を失敗させる', async () => {
      // 事前条件: server.proxy は設定せず、プレビューサーバーにだけ API へのプロキシを加える
      const overrides = { preview: { proxy: { '/api': 'https://api.example.com' } } };

      // 検証: プレビューサーバーのプロキシも検出し、設定の解決が失敗する
      await expect(resolveProjectConfig(overrides)).rejects.toThrow(GUARD_NAME);
    });

    it('vp build と同じ build での解決でも、server.proxy を検出して失敗させる', async () => {
      // 前提: プラグインは apply を指定しておらず、configResolved は build でも呼ばれる
      //   （CI の pnpm build でも前提の崩れを検出できることを裏付ける）
      // 事前条件: 開発サーバーに API へのプロキシを加えたうえで、build として解決する
      const overrides = { server: { proxy: { '/api': 'https://api.example.com' } } };

      // 検証: build の解決でもプラグインが例外を投げる
      await expect(resolveProjectConfig(overrides, 'build')).rejects.toThrow(GUARD_NAME);
    });
  });
});
