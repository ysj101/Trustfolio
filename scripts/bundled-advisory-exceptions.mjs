/**
 * `scripts/check-bundled-advisories.mjs` が許容する例外の一覧（issue #272）。
 *
 * 目的:
 *   Vite+ の配布物に同梱（インライン化）されたパッケージは、`pnpm-workspace.yaml` の
 *   `overrides` で修正版へ強制できない。修正版を取り込む手段が「Vite+ 側の更新を待つ」以外に
 *   ない検出について、影響経路を評価したうえで一時的に許容する。
 *
 * 内容:
 *   各例外は、同梱元（`bundle`）・パッケージ名（`package`）・版（`version`）・GHSA ID（`ghsaIds`）の
 *   組である。各例外の直前のコメントに、理由・影響経路の評価・解除条件を記録する。
 *
 * 注意:
 *   - 例外は同梱元の版まで一致した場合にだけ適用される。vite-plus を更新すると同梱元の版が
 *     変わり、すべての例外が一致しなくなって検査が失敗する。これは、更新のたびに同梱物の
 *     脆弱性を再評価させるための意図的な限定である（fail fast）。更新時は、
 *     `pnpm audit:bundled` の出力をもとに本一覧を見直すこと（手順は
 *     docs/UPGRADE_STRATEGY.md の「Vite+（vp）への一本化の記録」を参照）。
 *   - どの検出にも一致しない例外があると検査は失敗する。解消した例外は削除すること。
 *   - 以下の影響経路の評価（同梱物の位置・読み込み元・起動条件）は、各例外の `bundle` に記した版の
 *     配布物（`dist/`）を実際に読んで確認したものである。各例外のコメントには同梱元の版を書かない
 *     （版の正は `bundle` とする）。評価と再確認の経緯（日付・版・issue / PR）は、
 *     docs/UPGRADE_STRATEGY.md の「履歴」の節に記録する。
 *
 * @type {Array<{ bundle: string, package: string, version: string, ghsaIds: string[] }>}
 */
export const BUNDLED_ADVISORY_EXCEPTIONS = [
  // picomatch 2.3.1（@voidzero-dev/vite-plus-core の dist/vite/node/chunks/node.js に同梱）
  //   理由: 修正版（2.3.2）は公開済みだが、同梱されたコピーには pnpm-workspace.yaml の
  //     overrides（picomatch@<2.3.2 → 2.3.2）が効かない。移行前の単体の vite 8.3.3 は picomatch を
  //     通常の依存として解決していたため（overrides により 4.0.7 以上）、本検出は移行で新たに生じた。
  //   影響経路の評価: vite に同梱された chokidar 3.6.0 が使う anymatch 3.1.3 と readdirp 3.6.0 が使う。
  //     chokidar は vite のサーバーを生成する処理（_createServer）で server.watch が null でないときに
  //     起動し、プロジェクトのルート・設定ファイル・env ファイルを監視する。本リポジトリは開発サーバー
  //     （vp dev）を使わないが、Vitest は内部で vite のサーバーを生成するため、vp test の実行時に
  //     動作しうる。照合するパターンは vite.config.ts の server.watch 等とプロジェクト内のパスに
  //     由来する。GHSA-c2c7-rcm5-vvqj（extglob の量指定子による ReDoS）と
  //     GHSA-3v7f-55p6-f55p（POSIX 文字クラスでの誤照合）は、いずれも攻撃者がパターンを
  //     指定できる場合に成立するが、本リポジトリではパターンを外部から受け取らない。
  //     GAS へデプロイする成果物には含まれない。
  //   解除条件: picomatch 2.3.2 以上（または picomatch を同梱しない構成）の vite-plus へ
  //     更新した時点で削除する。
  {
    bundle: '@voidzero-dev/vite-plus-core@1.3.0',
    package: 'picomatch',
    version: '2.3.1',
    ghsaIds: ['GHSA-3v7f-55p6-f55p', 'GHSA-c2c7-rcm5-vvqj'],
  },
  // postcss-selector-parser 7.1.0（@voidzero-dev/vite-plus-core の dist/vite/node/chunks/build.js に同梱）
  //   理由: 修正版（7.1.6）は公開済みだが、同梱されたコピーには overrides が効かない。
  //     移行前の単体の vite 8.3.3 も、同じアドバイザリに該当する 7.1.1 を同梱していた。
  //   影響経路の評価: CSS Modules の処理（postcss-modules-local-by-default / postcss-modules-scope）が
  //     使う。build.js は vite が CSS Modules を処理するときに動的に読み込む。本リポジトリの
  //     vp build の入力（src/main.ts）は CSS を import しておらず、CSS は Tailwind CSS の CLI
  //     （scripts/build-styles.sh）が vite を介さずに生成する。解析する CSS も外部から入力されない。
  //   解除条件: postcss-selector-parser 7.1.6 以上を同梱した vite-plus へ更新した時点で削除する。
  {
    bundle: '@voidzero-dev/vite-plus-core@1.3.0',
    package: 'postcss-selector-parser',
    version: '7.1.0',
    ghsaIds: ['GHSA-rj75-hqrm-r3gf'],
  },
  // follow-redirects 1.16.0（@voidzero-dev/vite-plus-core の dist/vite/node/chunks/node.js に同梱）
  //   理由: 修正版（1.16.1。2026-10-01 公開）は公開済みだが、同梱されたコピーには overrides が効かない。
  //     2026-10-22 にアドバイザリの公表（2026-10-21。日付は日本時間）を受けて追加した。vite-plus 1.2.0 と、同日時点の
  //     最新版である 1.3.0 は、いずれも 1.16.0 を同梱しており、vite-plus の更新では解消できない（issue #286）。
  //   影響経路の評価: vite に同梱された http-proxy-3 1.23.3 だけが使う。http-proxy-3 は、プロキシの
  //     設定で followRedirects が真の場合に限り、Node の http / https の代わりに follow-redirects で
  //     プロキシ先へ要求を送る（既定は偽であり、vite も真に設定しない）。http-proxy-3 のプロキシを
  //     生成するのは vite のプロキシミドルウェア（proxyMiddleware）だけであり、それを登録するのは、
  //     vite のサーバーを生成する処理（_createServer）で server.proxy が設定されている場合と、
  //     プレビューサーバー（preview）で解決後の preview.proxy が設定されている場合だけである。
  //     解決後の preview.proxy は、preview.proxy が未設定なら server.proxy を引き継ぐ
  //     （resolvePreviewOptions の `preview?.proxy ?? server.proxy`）。したがって、server.proxy と
  //     preview.proxy のどちらかを設定すると、いずれかのサーバーでプロキシが有効になりうる。
  //     本リポジトリの vite.config.ts は server と preview のいずれも設定しておらず、vp dev と
  //     vp preview も使わない。Vitest は内部で vite のサーバーを生成するが、server.proxy が未設定の
  //     ためプロキシミドルウェアは登録されない。この前提（解決後の server.proxy と preview.proxy が
  //     ともに未設定であること）は、vite.config.ts の forbidDevServerProxy プラグインが設定の解決時に
  //     検査し、崩れた場合は vp build / vp test 等を失敗させる（同プラグインの検証は tests/vite.config.test.ts）。
  //     GHSA-q3jh-wrc6-jgq8（配列形式のヘッダーによる認証ヘッダー除去の回避）と
  //     GHSA-8r9p-f939-6h3c（sensitiveHeaders の正規表現のエスケープ漏れ）は、いずれも
  //     follow-redirects が攻撃者の制御するクロスオリジンのリダイレクトを追従した場合に、
  //     認証ヘッダーがリダイレクト先へ送られるものである。本リポジトリでは follow-redirects が
  //     要求を送ることがないため成立しない。GAS へデプロイする成果物には含まれない。
  //   解除条件: follow-redirects 1.16.1 以上（または follow-redirects を同梱しない構成）の
  //     vite-plus へ更新した時点で削除する。削除するときは、vite.config.ts の forbidDevServerProxy
  //     プラグインと、その検証の tests/vite.config.test.ts も削除する。
  {
    bundle: '@voidzero-dev/vite-plus-core@1.3.0',
    package: 'follow-redirects',
    version: '1.16.0',
    ghsaIds: ['GHSA-8r9p-f939-6h3c', 'GHSA-q3jh-wrc6-jgq8'],
  },
  // brace-expansion 5.0.3（vite-plus の dist/editor-*.js に同梱。minimatch 10.2.4 が使う）
  //   理由: 修正版（5.0.12）は公開済みだが、同梱されたコピーには overrides
  //     （brace-expansion@>=4.0.0 <5.0.12 → >=5.0.12 <6）が効かない。移行前の vite-plus 0.3.1 も
  //     同じ 5.0.3 を同梱していた。
  //   影響経路の評価: editor-*.js を読み込むのは dist/migration/bin.js と dist/create/bin.js だけであり、
  //     vp migrate と vp create の実行時に限られる。本リポジトリが日常的に実行する vp build /
  //     vp test / vp lint / vp fmt / vp check は読み込まない。vp migrate は vite-plus の更新時に
  //     開発者が手動で実行するだけであり、展開するパターンは外部から入力されない。
  //     GAS へデプロイする成果物には含まれない。
  //   解除条件: brace-expansion 5.0.12 以上を同梱した vite-plus へ更新した時点で削除する。
  {
    bundle: 'vite-plus@1.3.0',
    package: 'brace-expansion',
    version: '5.0.3',
    ghsaIds: [
      'GHSA-3jxr-9vmj-r5cp',
      'GHSA-6j4f-fj2g-mc7p',
      'GHSA-f886-m6hf-6m8v',
      'GHSA-jxxr-4gwj-5jf2',
      'GHSA-mh99-v99m-4gvg',
      'GHSA-q2hr-2g5m-vwhr',
      'GHSA-qhr7-859c-m2p7',
      'GHSA-rgw5-rvv9-x895',
    ],
  },
  // zod 4.6.5（vite-plus の dist/sync-versions/bin.js・bin.mjs に同梱）
  //   理由: 修正版（4.6.6）は公開済みだが、同梱されたコピーには overrides（issue #291 の
  //     "@google/clasp@<版>>zod" は通常の依存だけが対象）が効かない。確認した時点の最新版の
  //     vite-plus も同じ 4.6.5 を同梱しており、vite-plus の更新では解消できない（経緯は
  //     docs/UPGRADE_STRATEGY.md の「履歴」）。
  //   影響経路の評価: sync-versions/bin.js を読み込むのは、dist/bin.js が `vp sync-versions` の実行時に
  //     行う動的 import だけである。sync-versions/bin.mjs は、同じ処理を依存ごとインライン化した自己完結の
  //     別ファイル（bin.js とは内容が異なる）で、zod 4.6.5 も含む。bin.mjs はパッケージの exports・bin、
  //     ほかの配布物のどこからも参照されておらず、ファイルのパスを指定して node で直接実行した場合にだけ
  //     動く（本リポジトリは実行しない）。このコマンドは、外部の自動化ツールが標準入力から JSON の要求を
  //     渡すためのもので、端末からの直接実行を拒否する。zod は、その要求（package.json 等のマニフェスト。最大 256 件・1 件 1MB）と、
  //     vite-plus に同梱された toolchain.json の検証に使われる。本リポジトリが実行する vp build / vp test /
  //     vp lint / vp fmt / vp check はこのコマンドを読み込まない。GHSA-mrhx-c7xc-m3w5 は、大きな入力を
  //     検証させてメモリを使い果たさせるサービス拒否であり、本リポジトリには入力を渡す経路がない。
  //     GAS へデプロイする成果物には含まれない。
  //   解除条件: zod 4.6.6 以上（または zod を同梱しない構成）の vite-plus へ更新した時点で削除する。
  {
    bundle: 'vite-plus@1.3.0',
    package: 'zod',
    version: '4.6.5',
    ghsaIds: ['GHSA-mrhx-c7xc-m3w5'],
  },
];
