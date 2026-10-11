import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  BULK_ADVISORY_URL,
  collectInlinedPackages,
  evaluateFindings,
  extractRegionPackages,
  fetchAdvisories,
  main,
  parseBulkAdvisoryResponse,
  parseBundledVersions,
  parseStoreDirectoryVersion,
  resolveVitePlusPackages,
  validateExceptions,
} from '../../scripts/check-bundled-advisories.mjs';

/**
 * scripts/check-bundled-advisories.mjs のテスト。
 *
 * 対象のスクリプトは、Vite+（vite-plus と @voidzero-dev/vite-plus-core）の配布物に
 * インライン化されたパッケージを抽出し、npm レジストリの bulk アドバイザリ API と照合する
 * （issue #272）。pnpm audit はインライン化されたパッケージを検出できないため、その検出漏れを補う。
 *
 * テストデータは、2026-10-12 に vite-plus 1.1.0 / @voidzero-dev/vite-plus-core 1.1.0 の
 * 配布物と bulk アドバイザリ API の応答で実際に確認した値（picomatch 2.3.1 の GHSA など）をもとにしている。
 */

/** vite-plus-core の dist に実際に含まれる //#region 行（picomatch 2.3.1）。 */
const PICOMATCH_REGION =
  '//#region ../../node_modules/.pnpm/picomatch@2.3.1/node_modules/picomatch/lib/parse.js';

/** peer 依存の識別子が付いたストアのディレクトリ名を含む //#region 行（fdir 6.5.0）。 */
const FDIR_REGION =
  '//#region ../../node_modules/.pnpm/fdir@6.5.0_picomatch@4.0.7/node_modules/fdir/dist/index.mjs';

/** スコープ付きパッケージの //#region 行（@rolldown/pluginutils 1.0.1）。 */
const SCOPED_REGION =
  '//#region ../../node_modules/.pnpm/@rolldown+pluginutils@1.0.1/node_modules/@rolldown/pluginutils/dist/index.mjs';

/** bulk アドバイザリ API が picomatch 2.3.1 に対して返すアドバイザリ（実際の応答の抜粋）。 */
const PICOMATCH_ADVISORIES = [
  {
    id: 1115549,
    url: 'https://github.com/advisories/GHSA-3v7f-55p6-f55p',
    title: 'Picomatch: Method Injection in POSIX Character Classes causes incorrect Glob Matching',
    severity: 'moderate',
    vulnerable_versions: '<2.3.2',
  },
  {
    id: 1115552,
    url: 'https://github.com/advisories/GHSA-c2c7-rcm5-vvqj',
    title: 'Picomatch has a ReDoS vulnerability via extglob quantifiers',
    severity: 'high',
    vulnerable_versions: '<2.3.2',
  },
];

/**
 * パッケージ名から版の集合への対応を、比較しやすいオブジェクト（版は昇順の配列）へ変換する。
 */
function toSortedObject(packages: Map<string, Set<string>>) {
  return Object.fromEntries([...packages].map(([name, versions]) => [name, [...versions].sort()]));
}

/**
 * fetch の代わりに使う関数を生成する。
 * 要求本文を記録し、responder が返した値を JSON の応答として返す。
 */
function createFakeFetch(responder: (body: Record<string, string[]>) => unknown) {
  const requests: Array<Record<string, string[]>> = [];
  const fetchImpl = async (url: string, init: { body: string }) => {
    expect(url).toBe(BULK_ADVISORY_URL);
    const body = JSON.parse(init.body) as Record<string, string[]>;
    requests.push(body);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => responder(body),
    };
  };
  return { fetchImpl, requests };
}

describe('scripts/check-bundled-advisories', () => {
  describe('parseStoreDirectoryVersion', () => {
    it('pnpm ストアのディレクトリ名から版を取り出す', () => {
      // 前提: ディレクトリ名は「名前@版」に peer 依存・パッチの識別子が "_" 区切りで続く
      // 検証: 識別子を除いた版だけを返す。スコープ付きの名前は "/" が "+" に置き換えられている
      expect(parseStoreDirectoryVersion('picomatch@2.3.1', 'picomatch')).toBe('2.3.1');
      expect(parseStoreDirectoryVersion('fdir@6.5.0_picomatch@4.0.7', 'fdir')).toBe('6.5.0');
      expect(parseStoreDirectoryVersion('chokidar@3.6.0_patch_hash=e17269188c54', 'chokidar')).toBe(
        '3.6.0'
      );
      expect(
        parseStoreDirectoryVersion('@rolldown+pluginutils@1.0.1', '@rolldown/pluginutils')
      ).toBe('1.0.1');
      expect(parseStoreDirectoryVersion('get-tsconfig@5.0.0-beta.6', 'get-tsconfig')).toBe(
        '5.0.0-beta.6'
      );
    });

    it('ディレクトリ名がパッケージ名で始まらない場合は例外にする', () => {
      // 前提: パスの前半（ストアのディレクトリ）と後半（パッケージ名）が食い違っている
      // 検証: 誤った版を読み取らず、例外を投げる
      expect(() => parseStoreDirectoryVersion('anymatch@3.1.3', 'picomatch')).toThrow(
        'pnpm ストアのディレクトリ名がパッケージ名で始まっていません'
      );
    });

    it('版が semver の形式でない場合は例外にする', () => {
      // 前提: 名前の直後が版の形式ではない（pnpm のディレクトリ名の形式が変わった場合を想定）
      // 検証: 読み取れない値を版として扱わず、例外を投げる
      expect(() => parseStoreDirectoryVersion('picomatch@latest', 'picomatch')).toThrow(
        'pnpm ストアのディレクトリ名から版を読み取れません'
      );
    });
  });

  describe('extractRegionPackages', () => {
    it('//#region 行だけからパッケージを抽出する', () => {
      // 前提: ソースに //#region 行と、コード中の文字列としてのストアのパスが混在する
      // 検証: //#region 行のパスだけが抽出され、Vite+ 自身のソース（.pnpm を含まないパス）は無視される
      const source = [
        PICOMATCH_REGION,
        'const path = "node_modules/.pnpm/braces@3.0.3/node_modules/braces/index.js";',
        '//#region ../../vite/packages/vite/src/node/server/index.ts',
        FDIR_REGION,
        SCOPED_REGION,
        '//#endregion',
      ].join('\n');

      expect(extractRegionPackages(source)).toEqual([
        { name: 'picomatch', version: '2.3.1' },
        { name: 'fdir', version: '6.5.0' },
        { name: '@rolldown/pluginutils', version: '1.0.1' },
      ]);
    });
  });

  describe('collectInlinedPackages / parseBundledVersions', () => {
    /** テストごとに作成する一時ディレクトリ。 */
    let workDirectory: string;

    beforeEach(() => {
      workDirectory = mkdtempSync(path.join(tmpdir(), 'check-bundled-advisories-'));
    });

    afterEach(() => {
      rmSync(workDirectory, { recursive: true, force: true });
    });

    it('dist 配下の JavaScript を再帰的に走査し、パッケージ名ごとに版を集約する', () => {
      // 前提: dist/vite/node/chunks/node.js と dist/rolldown/index.mjs に //#region 行がある
      // 事前条件: picomatch は 2 つのファイルで別の版（2.3.1 と 4.0.7）として同梱されている
      // 検証: パッケージ名ごとに版の集合が作られ、.d.ts などの JavaScript 以外は無視される
      mkdirSync(path.join(workDirectory, 'dist', 'vite', 'node', 'chunks'), { recursive: true });
      mkdirSync(path.join(workDirectory, 'dist', 'rolldown'), { recursive: true });
      writeFileSync(
        path.join(workDirectory, 'dist', 'vite', 'node', 'chunks', 'node.js'),
        `${PICOMATCH_REGION}\n${FDIR_REGION}\n`
      );
      writeFileSync(
        path.join(workDirectory, 'dist', 'rolldown', 'index.mjs'),
        '//#region ../../node_modules/.pnpm/picomatch@4.0.7/node_modules/picomatch/index.js\n'
      );
      writeFileSync(
        path.join(workDirectory, 'dist', 'rolldown', 'index.d.mts'),
        '//#region ../../node_modules/.pnpm/braces@3.0.3/node_modules/braces/index.js\n'
      );

      const packages = collectInlinedPackages(workDirectory, {
        readDirectory: readdirSync,
        readFile: readFileSync,
      });

      expect(toSortedObject(packages)).toEqual({
        picomatch: ['2.3.1', '4.0.7'],
        fdir: ['6.5.0'],
      });
    });

    it('抽出結果が 0 件の場合は例外にする', () => {
      // 前提: dist に JavaScript はあるが、//#region 行がない（配布物の形式が変わった場合を想定）
      // 検証: 「検出 0 件」として合格させず、例外を投げる
      mkdirSync(path.join(workDirectory, 'dist'), { recursive: true });
      writeFileSync(path.join(workDirectory, 'dist', 'index.js'), 'export {};\n');

      expect(() =>
        collectInlinedPackages(workDirectory, {
          readDirectory: readdirSync,
          readFile: readFileSync,
        })
      ).toThrow('インライン化されたパッケージを 1 件も抽出できませんでした');
    });

    it('bundledVersions から vite / rolldown / tsdown の版を取り出す', () => {
      // 前提: @voidzero-dev/vite-plus-core 1.1.0 の package.json の bundledVersions と同じ値
      // 検証: ツール名ごとに版の集合が作られる
      const packages = parseBundledVersions({
        vite: '8.3.3',
        rolldown: '1.2.12',
        tsdown: '0.23.0',
      });

      expect(toSortedObject(packages)).toEqual({
        vite: ['8.3.3'],
        rolldown: ['1.2.12'],
        tsdown: ['0.23.0'],
      });
    });

    it('bundledVersions がない場合や vite が欠けている場合は例外にする', () => {
      // 前提: Vite+ が package.json の形式を変えた場合を想定する
      // 検証: vite・rolldown を検査できないまま合格させず、例外を投げる
      expect(() => parseBundledVersions(undefined)).toThrow(
        'bundledVersions オブジェクトがありません'
      );
      expect(() => parseBundledVersions({ rolldown: '1.2.12' })).toThrow(
        'bundledVersions に vite がありません'
      );
      expect(() => parseBundledVersions({ vite: 'latest', rolldown: '1.2.12' })).toThrow(
        'bundledVersions["vite"] が版の形式ではありません'
      );
    });
  });

  describe('resolveVitePlusPackages', () => {
    /** テストごとに作成する、プロジェクトのルートに見立てた一時ディレクトリ。 */
    let projectRoot: string;

    beforeEach(() => {
      // Node.js のモジュール解決はシンボリックリンクを実体のパスへ解決する（macOS の一時ディレクトリは
      // /var → /private/var のリンクである）。戻り値のディレクトリと比較するため、実体のパスを使う
      projectRoot = realpathSync(
        mkdtempSync(path.join(tmpdir(), 'check-bundled-advisories-project-'))
      );
      writeFileSync(path.join(projectRoot, 'package.json'), '{"name":"trustfolio-gas"}');
    });

    afterEach(() => {
      rmSync(projectRoot, { recursive: true, force: true });
    });

    /**
     * node_modules/vite-plus と、vite-plus の依存 vite（vite-plus-core の別名）を配置する。
     * 実際の pnpm の配置と同様に、vite は vite-plus 自身の node_modules から解決される。
     */
    function installPackages(vitePlusVersion: string, core: { name: string; version: string }) {
      const vitePlusDirectory = path.join(projectRoot, 'node_modules', 'vite-plus');
      const coreDirectory = path.join(vitePlusDirectory, 'node_modules', 'vite');
      mkdirSync(coreDirectory, { recursive: true });
      writeFileSync(
        path.join(vitePlusDirectory, 'package.json'),
        JSON.stringify({ name: 'vite-plus', version: vitePlusVersion })
      );
      writeFileSync(path.join(coreDirectory, 'package.json'), JSON.stringify(core));
      return { vitePlusDirectory, coreDirectory };
    }

    it('vite-plus と、vite-plus が vite として解決する vite-plus-core を返す', () => {
      // 前提: vite-plus 1.1.0 と @voidzero-dev/vite-plus-core 1.1.0 が導入されている
      // 検証: 両パッケージの名前・版・ディレクトリが、vite-plus → vite-plus-core の順で返る
      const { vitePlusDirectory, coreDirectory } = installPackages('1.1.0', {
        name: '@voidzero-dev/vite-plus-core',
        version: '1.1.0',
      });

      const [vitePlus, core] = resolveVitePlusPackages(projectRoot, readFileSync);

      expect(vitePlus).toMatchObject({
        name: 'vite-plus',
        version: '1.1.0',
        directory: vitePlusDirectory,
      });
      expect(core).toMatchObject({
        name: '@voidzero-dev/vite-plus-core',
        version: '1.1.0',
        directory: coreDirectory,
      });
    });

    it('vite-plus と vite-plus-core の版が一致しない場合は例外にする', () => {
      // 前提: Dependabot が catalog の vite-plus だけを 1.2.0 へ更新し、vite の別名が 1.1.0 のまま残っている
      // 事前条件: この状態では vp build が「Expected @voidzero-dev/vite-plus-core@1.2.0」で失敗する
      // 検証: 実際に使われない組み合わせを検査せず、両方の版を示して例外を投げる
      installPackages('1.2.0', { name: '@voidzero-dev/vite-plus-core', version: '1.1.0' });

      expect(() => resolveVitePlusPackages(projectRoot, readFileSync)).toThrow(
        'vite-plus（1.2.0）と @voidzero-dev/vite-plus-core（1.1.0）の版が一致しません。'
      );
    });

    it('vite-plus の依存 vite が vite-plus-core 以外に解決される場合は例外にする', () => {
      // 前提: overrides の誤りなどで、vite-plus の依存 vite が単体の vite 8.3.3 に解決されている
      // 検証: 解決先を示して例外を投げる
      installPackages('1.1.0', { name: 'vite', version: '8.3.3' });

      expect(() => resolveVitePlusPackages(projectRoot, readFileSync)).toThrow(
        'vite-plus の依存 vite が @voidzero-dev/vite-plus-core に解決されていません（解決先: vite@8.3.3）。'
      );
    });
  });

  describe('fetchAdvisories / parseBulkAdvisoryResponse', () => {
    it('1 回の要求に含める版を 1 パッケージにつき 1 つに限り、アドバイザリを版に対応付ける', async () => {
      // 前提: picomatch が 3 つの版（2.3.1・4.0.5・4.0.7）、braces が 1 つの版で同梱されている
      // 事前条件: API は picomatch 2.3.1 にだけアドバイザリを返す（実際の応答と同じ）
      // 検証: 要求は版数の最大値（3 回）に分かれ、アドバイザリは picomatch 2.3.1 に対応付けられる
      const { fetchImpl, requests } = createFakeFetch((body) =>
        body.picomatch?.[0] === '2.3.1' ? { picomatch: PICOMATCH_ADVISORIES } : {}
      );

      const advisories = await fetchAdvisories(
        [
          { name: 'picomatch', version: '4.0.7' },
          { name: 'picomatch', version: '2.3.1' },
          { name: 'braces', version: '3.0.3' },
          { name: 'picomatch', version: '4.0.5' },
        ],
        fetchImpl as unknown as typeof fetch
      );

      expect(requests).toEqual([
        { picomatch: ['2.3.1'], braces: ['3.0.3'] },
        { picomatch: ['4.0.5'] },
        { picomatch: ['4.0.7'] },
      ]);
      expect(advisories).toEqual([
        {
          name: 'picomatch',
          version: '2.3.1',
          ghsaId: 'GHSA-3v7f-55p6-f55p',
          severity: 'moderate',
          title: PICOMATCH_ADVISORIES[0].title,
          url: PICOMATCH_ADVISORIES[0].url,
          vulnerableVersions: '<2.3.2',
        },
        {
          name: 'picomatch',
          version: '2.3.1',
          ghsaId: 'GHSA-c2c7-rcm5-vvqj',
          severity: 'high',
          title: PICOMATCH_ADVISORIES[1].title,
          url: PICOMATCH_ADVISORIES[1].url,
          vulnerableVersions: '<2.3.2',
        },
      ]);
    });

    it('API が失敗した場合は例外にする', async () => {
      // 前提: レジストリが一時的な障害で HTTP 503 を返す
      // 検証: 「アドバイザリ 0 件」と誤認せず、ステータスを示して例外を投げる
      const fetchImpl = async () => ({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({}),
      });

      await expect(
        fetchAdvisories(
          [{ name: 'picomatch', version: '2.3.1' }],
          fetchImpl as unknown as typeof fetch
        )
      ).rejects.toThrow(
        'bulk アドバイザリ API への要求が失敗しました: HTTP 503 Service Unavailable'
      );
    });

    it('要求していないパッケージや GHSA ID を読み取れない URL を含む応答は例外にする', () => {
      // 前提: 応答の形式が想定と異なる
      // 検証: 誤った対応付けをせず、例外を投げる
      expect(() => parseBulkAdvisoryResponse({ braces: [] }, { picomatch: ['2.3.1'] })).toThrow(
        '要求していないパッケージ "braces" を返しました'
      );
      expect(() =>
        parseBulkAdvisoryResponse(
          { picomatch: [{ ...PICOMATCH_ADVISORIES[0], url: 'https://example.com/advisory/1' }] },
          { picomatch: ['2.3.1'] }
        )
      ).toThrow('url から GHSA ID を読み取れません');
    });
  });

  describe('validateExceptions / evaluateFindings', () => {
    /** 同梱元 @voidzero-dev/vite-plus-core 1.1.0 の picomatch 2.3.1 を許容する例外。 */
    const PICOMATCH_EXCEPTION = {
      bundle: '@voidzero-dev/vite-plus-core@1.1.0',
      package: 'picomatch',
      version: '2.3.1',
      ghsaIds: ['GHSA-3v7f-55p6-f55p', 'GHSA-c2c7-rcm5-vvqj'],
    };

    /** picomatch 2.3.1 に対して API から取得したアドバイザリ（fetchAdvisories の戻り値の形式）。 */
    const PICOMATCH_FINDINGS = PICOMATCH_ADVISORIES.map((advisory) => ({
      name: 'picomatch',
      version: '2.3.1',
      ghsaId: advisory.url.split('/').at(-1) as string,
      severity: advisory.severity,
      title: advisory.title,
      url: advisory.url,
      vulnerableVersions: advisory.vulnerable_versions,
    }));

    it('同梱元・パッケージ・版・GHSA ID がすべて一致する検出だけを例外として許容する', () => {
      // 前提: picomatch 2.3.1 を vite-plus-core 1.1.0 と（架空の）vite-plus 1.1.0 の両方が同梱している
      // 事前条件: 例外は vite-plus-core 1.1.0 の同梱物だけを対象にしている
      // 検証: vite-plus-core の検出は許容され、vite-plus の検出は違反として残る
      const result = evaluateFindings({
        bundledPackages: [
          { bundle: '@voidzero-dev/vite-plus-core@1.1.0', name: 'picomatch', version: '2.3.1' },
          { bundle: 'vite-plus@1.1.0', name: 'picomatch', version: '2.3.1' },
        ],
        advisories: PICOMATCH_FINDINGS,
        exceptions: validateExceptions([PICOMATCH_EXCEPTION]),
        auditLevel: 'moderate',
      });

      expect(result.excepted.map((finding) => `${finding.bundle} ${finding.ghsaId}`)).toEqual([
        '@voidzero-dev/vite-plus-core@1.1.0 GHSA-3v7f-55p6-f55p',
        '@voidzero-dev/vite-plus-core@1.1.0 GHSA-c2c7-rcm5-vvqj',
      ]);
      expect(result.violations.map((finding) => `${finding.bundle} ${finding.ghsaId}`)).toEqual([
        'vite-plus@1.1.0 GHSA-3v7f-55p6-f55p',
        'vite-plus@1.1.0 GHSA-c2c7-rcm5-vvqj',
      ]);
      expect(result.staleExceptions).toEqual([]);
    });

    it('監査レベル未満の検出は判定の対象外とする', () => {
      // 前提: picomatch 2.3.1 のアドバイザリは moderate と high の 2 件である
      // 事前条件: 監査レベルを high にし、例外は登録しない
      // 検証: high の 1 件だけが違反になる
      const result = evaluateFindings({
        bundledPackages: [
          { bundle: '@voidzero-dev/vite-plus-core@1.1.0', name: 'picomatch', version: '2.3.1' },
        ],
        advisories: PICOMATCH_FINDINGS,
        exceptions: [],
        auditLevel: 'high',
      });

      expect(result.violations.map((finding) => finding.ghsaId)).toEqual(['GHSA-c2c7-rcm5-vvqj']);
    });

    it('vite-plus の更新で同梱元の版が変わると、例外は一致しなくなり陳腐化した例外として報告される', () => {
      // 前提: vite-plus を 1.2.0 へ更新したが、picomatch 2.3.1 は引き続き同梱されている
      // 事前条件: 例外は 1.1.0 の同梱物を対象にしたままである
      // 検証: 1.2.0 の検出は違反になり、1.1.0 の例外は陳腐化として報告される（再評価の強制）
      const result = evaluateFindings({
        bundledPackages: [
          { bundle: '@voidzero-dev/vite-plus-core@1.2.0', name: 'picomatch', version: '2.3.1' },
        ],
        advisories: PICOMATCH_FINDINGS,
        exceptions: validateExceptions([PICOMATCH_EXCEPTION]),
        auditLevel: 'moderate',
      });

      expect(result.violations).toHaveLength(2);
      expect(result.excepted).toEqual([]);
      expect(result.staleExceptions).toEqual([
        '@voidzero-dev/vite-plus-core@1.1.0 picomatch@2.3.1 GHSA-3v7f-55p6-f55p',
        '@voidzero-dev/vite-plus-core@1.1.0 picomatch@2.3.1 GHSA-c2c7-rcm5-vvqj',
      ]);
    });

    it('形式が誤っている例外や重複した例外は受け付けない', () => {
      // 前提: 例外の一覧を手で編集した際の誤りを想定する
      // 検証: GHSA ID の形式誤り・重複・必須項目の欠落を、それぞれ例外として報告する
      expect(() =>
        validateExceptions([{ ...PICOMATCH_EXCEPTION, ghsaIds: ['CVE-2026-0001'] }])
      ).toThrow('GHSA ID の形式ではない値があります');
      expect(() => validateExceptions([PICOMATCH_EXCEPTION, PICOMATCH_EXCEPTION])).toThrow(
        '例外が重複しています: @voidzero-dev/vite-plus-core@1.1.0 picomatch@2.3.1 GHSA-3v7f-55p6-f55p'
      );
      expect(() => validateExceptions([{ ...PICOMATCH_EXCEPTION, bundle: '' }])).toThrow(
        '例外 [0].bundle が空でない文字列ではありません。'
      );
    });
  });

  describe('main', () => {
    /** テストごとに作成する、プロジェクトのルートに見立てた一時ディレクトリ。 */
    let projectRoot: string;

    beforeEach(() => {
      // 前提: vite-plus 1.1.0 と @voidzero-dev/vite-plus-core 1.1.0 が導入されている。
      // vite-plus は picomatch 4.0.7 を、vite-plus-core は picomatch 2.3.1 を同梱し、
      // vite-plus-core の bundledVersions は vite 8.3.3 / rolldown 1.2.12 である
      projectRoot = mkdtempSync(path.join(tmpdir(), 'check-bundled-advisories-main-'));
      writeFileSync(path.join(projectRoot, 'package.json'), '{"name":"trustfolio-gas"}');
      const vitePlusDirectory = path.join(projectRoot, 'node_modules', 'vite-plus');
      const coreDirectory = path.join(vitePlusDirectory, 'node_modules', 'vite');
      mkdirSync(path.join(vitePlusDirectory, 'dist'), { recursive: true });
      mkdirSync(path.join(coreDirectory, 'dist'), { recursive: true });
      writeFileSync(
        path.join(vitePlusDirectory, 'package.json'),
        JSON.stringify({ name: 'vite-plus', version: '1.1.0' })
      );
      writeFileSync(
        path.join(vitePlusDirectory, 'dist', 'bin.js'),
        '//#region ../../node_modules/.pnpm/picomatch@4.0.7/node_modules/picomatch/index.js\n'
      );
      writeFileSync(
        path.join(coreDirectory, 'package.json'),
        JSON.stringify({
          name: '@voidzero-dev/vite-plus-core',
          version: '1.1.0',
          bundledVersions: { vite: '8.3.3', rolldown: '1.2.12' },
        })
      );
      writeFileSync(path.join(coreDirectory, 'dist', 'node.js'), `${PICOMATCH_REGION}\n`);
    });

    afterEach(() => {
      rmSync(projectRoot, { recursive: true, force: true });
    });

    it('例外に記録された検出だけであれば合格とする', async () => {
      // 事前条件: API は picomatch 2.3.1 にだけアドバイザリを返し、その 2 件は例外に記録されている
      // 検証: ok が true になり、vite / rolldown を含む 4 件の同梱パッケージが照合される
      const { fetchImpl, requests } = createFakeFetch((body) =>
        body.picomatch?.[0] === '2.3.1' ? { picomatch: PICOMATCH_ADVISORIES } : {}
      );
      const logs: string[] = [];
      const errors: string[] = [];

      const result = await main({
        argv: ['--audit-level', 'moderate'],
        projectRoot,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        exceptions: [
          {
            bundle: '@voidzero-dev/vite-plus-core@1.1.0',
            package: 'picomatch',
            version: '2.3.1',
            ghsaIds: ['GHSA-3v7f-55p6-f55p', 'GHSA-c2c7-rcm5-vvqj'],
          },
        ],
        logger: {
          log: (message: string) => logs.push(message),
          error: (message: string) => errors.push(message),
        },
      });

      expect(result.ok).toBe(true);
      expect(result.bundledPackageCount).toBe(4);
      expect(requests).toEqual([
        { picomatch: ['2.3.1'], rolldown: ['1.2.12'], vite: ['8.3.3'] },
        { picomatch: ['4.0.7'] },
      ]);
      expect(errors).toEqual([]);
      expect(logs.at(-1)).toBe('例外に記録されていない検出はありません。');
    });

    it('例外に記録されていない検出があれば不合格とし、対応方法を出力する', async () => {
      // 事前条件: API は bundledVersions の vite 8.3.3 にアドバイザリを返し、例外は登録されていない
      // 検証: ok が false になり、検出内容と対応方法がエラー出力に出る
      const { fetchImpl } = createFakeFetch((body) =>
        body.vite?.[0] === '8.3.3'
          ? {
              vite: [
                {
                  id: 9000001,
                  url: 'https://github.com/advisories/GHSA-p9ff-h696-f583',
                  title: 'Vite Vulnerable to Arbitrary File Read via Vite Dev Server WebSocket',
                  severity: 'high',
                  vulnerable_versions: '>=8.0.0 <=8.3.3',
                },
              ],
            }
          : {}
      );
      const errors: string[] = [];

      const result = await main({
        argv: ['--audit-level', 'moderate'],
        projectRoot,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        exceptions: [],
        logger: { log: () => undefined, error: (message: string) => errors.push(message) },
      });

      expect(result.ok).toBe(false);
      expect(
        result.violations.map((finding) => `${finding.bundle} ${finding.name}@${finding.version}`)
      ).toEqual(['@voidzero-dev/vite-plus-core@1.1.0 vite@8.3.3']);
      expect(errors[0]).toBe('例外に記録されていない検出（1 件）:');
      expect(errors[1]).toContain('GHSA-p9ff-h696-f583 vite@8.3.3');
      expect(errors[2]).toContain('scripts/bundled-advisory-exceptions.mjs');
    });

    it('--audit-level が指定されていない場合は例外にする', async () => {
      // 前提: 監査レベルを暗黙の既定値で補わない
      // 検証: 引数名を示して例外を投げる
      await expect(
        main({
          argv: [],
          projectRoot,
          fetchImpl: createFakeFetch(() => ({})).fetchImpl as unknown as typeof fetch,
          exceptions: [],
          logger: { log: () => undefined, error: () => undefined },
        })
      ).rejects.toThrow('--audit-level が指定されていません。');
    });
  });
});
