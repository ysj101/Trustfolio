import { describe, expect, it } from 'vitest';
import { createSheetInitializationUseCase } from '../../src/usecase/SheetInitializationUseCase';
import {
  PERFORMANCE_HEADERS,
  PERFORMANCE_SHEET_NAME,
  SHEET_DEFINITIONS,
  SHEET_HEADERS,
  SHEET_NAMES,
  type SheetDefinition,
} from '../../src/Config';
import type { FundRepository } from '../../src/repository/FundRepository';
import type { SheetRepository } from '../../src/repository/SheetRepository';
import type { Fund } from '../../src/domain/types';
import { createStubSheetRepository, ok, fail } from '../fakes';

/**
 * シート初期化ユースケース（SheetInitializationUseCase）の検証。
 *
 * 仕様の中心は以下の3点である:
 * - initializeAllSheets: 基本シート → 全体実績シート → ファンド別シート（取引/実績）の順で
 *   ensureSheet を呼び、ファンドID末尾3文字（シート名サフィックス）の重複を conflict として弾く。
 *   銘柄一覧（listFunds）の取得に失敗した場合は、その失敗を伝播する（fail fast。黙ってスキップしない）。
 * - ensureNavFetchSheets: NAV 自動取得に必要な _funds と _nav_records のみを保証する。
 * - ensureMarketIndexSheet: _market_indices のみを保証する。
 */

/** テスト用の銘柄を生成する。id 以外は共通の実データに近い値を用いる。 */
function createTestFund(id: string, name: string): Fund {
  return {
    id,
    name,
    rakutenFundId: null,
    settlementBusinessDays: null,
    navSource: null,
    navSourceCode: null,
    assetClass: null,
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

/** listFunds だけを差し替えられる FundRepository スタブを生成する。 */
function createFundRepositoryStub(listFunds: FundRepository['listFunds']): FundRepository {
  return {
    listFunds,
    findByName: () => ok(null),
    findById: () => ok(null),
    createFund: () => ok(undefined),
    updateFund: () => ok(undefined),
    updateAssetClass: () => ok(undefined),
  };
}

/**
 * ensureSheet に渡されたシート定義を記録する SheetRepository スタブを生成する。
 * 検証側は記録（ensuredDefinitions）を通じて「どのシートがどのヘッダーで保証されたか」を確認する。
 */
function createRecordingSheetRepository(ensureSheetOverride?: SheetRepository['ensureSheet']): {
  repository: SheetRepository;
  ensuredDefinitions: SheetDefinition[];
} {
  const ensuredDefinitions: SheetDefinition[] = [];
  const repository = createStubSheetRepository({
    ensureSheet: (definition) => {
      ensuredDefinitions.push(definition);
      if (ensureSheetOverride) {
        return ensureSheetOverride(definition);
      }
      return ok({} as GoogleAppsScript.Spreadsheet.Sheet);
    },
  });
  return { repository, ensuredDefinitions };
}

describe('initializeAllSheets', () => {
  it('基本シート・全体実績シート・全ファンドの取引/実績シートが順に保証される', () => {
    // 前提: 末尾3文字が重複しない2つの銘柄が登録されている
    // 事前条件: ensureSheet は全て成功する
    // 検証: SHEET_DEFINITIONS（4シート）→ 全体実績 → fund別（_tx_/_perf_ × 2銘柄）の順で
    //   ensureSheet が呼ばれ、完了メッセージが返る
    const { repository, ensuredDefinitions } = createRecordingSheetRepository();
    const fundRepository = createFundRepositoryStub(() =>
      ok([
        createTestFund('fund-001', '全世界株式インデックスファンド'),
        createTestFund('fund-002', '先進国債券ファンド'),
      ])
    );

    const useCase = createSheetInitializationUseCase(repository, fundRepository);
    const result = useCase.initializeAllSheets();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.message).toBe('シート初期化が完了しました。');
    }
    expect(ensuredDefinitions.map((d) => d.name)).toEqual([
      ...SHEET_DEFINITIONS.map((d) => d.name),
      PERFORMANCE_SHEET_NAME,
      '_tx_001',
      '_perf_001',
      '_tx_002',
      '_perf_002',
    ]);
    // ファンド別シートのヘッダーが正しい定義で渡されている
    const txDefinition = ensuredDefinitions.find((d) => d.name === '_tx_001');
    expect(txDefinition?.headers).toEqual(SHEET_HEADERS[SHEET_NAMES.TRANSACTIONS]);
    const perfDefinition = ensuredDefinitions.find((d) => d.name === '_perf_001');
    expect(perfDefinition?.headers).toEqual(PERFORMANCE_HEADERS);
  });

  it('ファンドID末尾3文字が重複する場合は conflict エラーで中断する', () => {
    // 前提: 'fund-001' と 'other-001' の末尾3文字（001）が衝突している
    // 事前条件: 基本シート・全体実績シートの保証は成功する
    // 検証: conflict エラー（対象末尾を含むメッセージ）が返り、
    //   ファンド別シート（_tx_/_perf_）の保証は一切実行されない
    const { repository, ensuredDefinitions } = createRecordingSheetRepository();
    const fundRepository = createFundRepositoryStub(() =>
      ok([
        createTestFund('fund-001', '全世界株式インデックスファンド'),
        createTestFund('other-001', '新興国株式ファンド'),
      ])
    );

    const useCase = createSheetInitializationUseCase(repository, fundRepository);
    const result = useCase.initializeAllSheets();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('conflict');
      expect(result.error.message).toBe('ファンドID末尾3文字が重複しています。対象末尾: 001');
    }
    // 重複検証はシート生成前に行われるため、ファンド別シートは保証されない
    const fundSheetNames = ensuredDefinitions
      .map((d) => d.name)
      .filter((name) => name.startsWith('_tx_') || name.startsWith('_perf_'));
    expect(fundSheetNames).toEqual([]);
  });

  it('基本シートの保証に失敗した場合はその失敗を返し後続を実行しない', () => {
    // 前提: シート生成が最初の基本シートで失敗する
    // 事前条件: ensureSheet が常に失敗を返す
    // 検証: 失敗がそのまま伝播し、ensureSheet は最初の1回で打ち切られる
    const { repository, ensuredDefinitions } = createRecordingSheetRepository(() =>
      fail('unexpected', 'シートの作成に失敗しました。')
    );
    const fundRepository = createFundRepositoryStub(() => ok([]));

    const useCase = createSheetInitializationUseCase(repository, fundRepository);
    const result = useCase.initializeAllSheets();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('シートの作成に失敗しました。');
    }
    expect(ensuredDefinitions).toHaveLength(1);
  });

  it('銘柄一覧の取得に失敗した場合はその失敗を伝播する', () => {
    // 前提: 銘柄一覧の取得が失敗する（シート読み取りエラー等）
    // 事前条件: 基本シート・全体実績シートの保証は成功する
    // 検証: 銘柄一覧の取得失敗がそのまま伝播し、基本シート・全体実績シートまでが保証される
    const { repository, ensuredDefinitions } = createRecordingSheetRepository();
    const fundRepository = createFundRepositoryStub(() =>
      fail('unexpected', '銘柄シートの読み取りに失敗しました。')
    );

    const useCase = createSheetInitializationUseCase(repository, fundRepository);
    const result = useCase.initializeAllSheets();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('銘柄シートの読み取りに失敗しました。');
    }
    expect(ensuredDefinitions.map((d) => d.name)).toEqual([
      ...SHEET_DEFINITIONS.map((d) => d.name),
      PERFORMANCE_SHEET_NAME,
    ]);
  });
});

describe('ensureNavFetchSheets', () => {
  it('NAV 自動取得に必要な _funds と _nav_records のみが保証される', () => {
    // 前提: NAV 自動取得バッチの実行前チェックとして呼び出す
    // 事前条件: ensureSheet は全て成功する
    // 検証: 基本シート定義のうち _funds / _nav_records の2シートだけが保証される
    const { repository, ensuredDefinitions } = createRecordingSheetRepository();
    const fundRepository = createFundRepositoryStub(() => ok([]));

    const useCase = createSheetInitializationUseCase(repository, fundRepository);
    const result = useCase.ensureNavFetchSheets();

    expect(result.success).toBe(true);
    expect(ensuredDefinitions.map((d) => d.name)).toEqual([
      SHEET_NAMES.FUNDS,
      SHEET_NAMES.NAV_RECORDS,
    ]);
  });

  it('シート保証が失敗した場合はその失敗を伝播する', () => {
    // 前提: シート生成が失敗する
    // 事前条件: ensureSheet が失敗を返す
    // 検証: 失敗 Result がそのまま返る
    const { repository } = createRecordingSheetRepository(() =>
      fail('unexpected', 'シートの作成に失敗しました。')
    );
    const fundRepository = createFundRepositoryStub(() => ok([]));

    const useCase = createSheetInitializationUseCase(repository, fundRepository);
    const result = useCase.ensureNavFetchSheets();

    expect(result.success).toBe(false);
  });
});

describe('ensureMarketIndexSheet', () => {
  it('市場指数シート（_market_indices）が正しいヘッダーで保証される', () => {
    // 前提: 市場指数取得バッチの実行前チェックとして呼び出す
    // 事前条件: ensureSheet は成功する
    // 検証: _market_indices が市場指数用ヘッダー定義で保証される
    const { repository, ensuredDefinitions } = createRecordingSheetRepository();
    const fundRepository = createFundRepositoryStub(() => ok([]));

    const useCase = createSheetInitializationUseCase(repository, fundRepository);
    const result = useCase.ensureMarketIndexSheet();

    expect(result.success).toBe(true);
    expect(ensuredDefinitions).toEqual([
      {
        name: SHEET_NAMES.MARKET_INDICES,
        headers: SHEET_HEADERS[SHEET_NAMES.MARKET_INDICES],
      },
    ]);
  });
});
