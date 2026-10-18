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
 *   - 以下の影響経路の評価は、2026-10-12 に vite-plus 1.1.0 / @voidzero-dev/vite-plus-core 1.1.0 の
 *     配布物（`dist/`）を実際に読んで確認し、2026-10-19 に 1.2.0 の配布物で同じ内容
 *     （同梱物の位置・読み込み元・起動条件）が成り立つことを再確認したものである（PR #283）。
 *
 * @type {Array<{ bundle: string, package: string, version: string, ghsaIds: string[] }>}
 */
export const BUNDLED_ADVISORY_EXCEPTIONS = [
  // braces 3.0.3（@voidzero-dev/vite-plus-core 1.2.0 の dist/vite/node/chunks/node.js に同梱）
  //   理由: 修正版が未リリースである（アドバイザリの first_patched_version が null）。
  //     同じ GHSA は、通常の依存としての braces についても pnpm-workspace.yaml の
  //     auditConfig.ignoreGhsas で例外にしている（.github/workflows/security.yml のコメントを参照）。
  //   影響経路の評価: vite に同梱された chokidar 3.6.0 が使う。chokidar は vite のサーバーを
  //     生成する処理（_createServer）で server.watch が null でないときに起動し、プロジェクトの
  //     ルート・設定ファイル・env ファイルを監視する。本リポジトリは開発サーバー（vp dev）を使わないが、
  //     Vitest は内部で vite のサーバーを生成するため、vp test の実行時に動作しうる。
  //     展開されるパターンは vite.config.ts とプロジェクト内のパスに由来し、外部から入力されない。
  //     GAS へデプロイする成果物（dist/Code.js・dist/*.html）には含まれない。
  //     なお、移行前の単体の vite 8.3.3 も同じ braces 3.0.3 を同梱していた。
  //   解除条件: braces の修正版が公開され、それを同梱した vite-plus へ更新した時点で削除する。
  {
    bundle: '@voidzero-dev/vite-plus-core@1.2.0',
    package: 'braces',
    version: '3.0.3',
    ghsaIds: ['GHSA-vfj7-8cjw-p6xm'],
  },
  // picomatch 2.3.1（@voidzero-dev/vite-plus-core 1.2.0 の dist/vite/node/chunks/node.js に同梱）
  //   理由: 修正版（2.3.2）は公開済みだが、同梱されたコピーには pnpm-workspace.yaml の
  //     overrides（picomatch@<2.3.2 → 2.3.2）が効かない。移行前の単体の vite 8.3.3 は picomatch を
  //     通常の依存として解決していたため（overrides により 4.0.7 以上）、本検出は移行で新たに生じた。
  //   影響経路の評価: 上記の chokidar 3.6.0 が使う anymatch 3.1.3 と readdirp 3.6.0 が使う。
  //     起動条件と入力の由来は braces と同じであり、照合するパターンは vite.config.ts の
  //     server.watch 等に由来する。GHSA-c2c7-rcm5-vvqj（extglob の量指定子による ReDoS）と
  //     GHSA-3v7f-55p6-f55p（POSIX 文字クラスでの誤照合）は、いずれも攻撃者がパターンを
  //     指定できる場合に成立するが、本リポジトリではパターンを外部から受け取らない。
  //     GAS へデプロイする成果物には含まれない。
  //   解除条件: picomatch 2.3.2 以上（または picomatch を同梱しない構成）の vite-plus へ
  //     更新した時点で削除する。
  {
    bundle: '@voidzero-dev/vite-plus-core@1.2.0',
    package: 'picomatch',
    version: '2.3.1',
    ghsaIds: ['GHSA-3v7f-55p6-f55p', 'GHSA-c2c7-rcm5-vvqj'],
  },
  // postcss-selector-parser 7.1.0（@voidzero-dev/vite-plus-core 1.2.0 の dist/vite/node/chunks/build.js に同梱）
  //   理由: 修正版（7.1.6）は公開済みだが、同梱されたコピーには overrides が効かない。
  //     移行前の単体の vite 8.3.3 も、同じアドバイザリに該当する 7.1.1 を同梱していた。
  //   影響経路の評価: CSS Modules の処理（postcss-modules-local-by-default / postcss-modules-scope）が
  //     使う。build.js は vite が CSS Modules を処理するときに動的に読み込む。本リポジトリの
  //     vp build の入力（src/main.ts）は CSS を import しておらず、CSS は Tailwind CSS の CLI
  //     （scripts/build-styles.sh）が vite を介さずに生成する。解析する CSS も外部から入力されない。
  //   解除条件: postcss-selector-parser 7.1.6 以上を同梱した vite-plus へ更新した時点で削除する。
  {
    bundle: '@voidzero-dev/vite-plus-core@1.2.0',
    package: 'postcss-selector-parser',
    version: '7.1.0',
    ghsaIds: ['GHSA-rj75-hqrm-r3gf'],
  },
  // brace-expansion 5.0.3（vite-plus 1.2.0 の dist/editor-*.js に同梱。minimatch 10.2.4 が使う）
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
    bundle: 'vite-plus@1.2.0',
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
];
