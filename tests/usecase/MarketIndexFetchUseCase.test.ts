import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  createMarketIndexFetchUseCase,
  isMarketIndexFetchResult,
} from '../../src/usecase/MarketIndexFetchUseCase';
import type { MarketIndexRepository } from '../../src/repository/MarketIndexRepository';
import type { MarketIndexData, MarketIndexService } from '../../src/service/MarketIndexService';
import type { MarketIndex, Result } from '../../src/domain/types';
import { ok } from '../fakes';

/**
 * 市場指数取得ユースケースのテスト。
 *
 * 検証対象:
 * - fetchAndRecordLatestIndices の各分岐
 *   - 既に記録済み（already_exists）
 *   - 新規取得して記録（success）
 *   - 指数データ取得失敗（failed: 処理自体は success:true で status のみ failed）
 *   - リポジトリ／サービスのエラー伝播
 *
 * フレーク対策（重要）:
 * - 本ユースケースは内部で `clock.now()`（実装は `new Date()`）を呼び、日本時間→米国東部時間へ換算して
 *   対象営業日を決定する。この換算は実行環境のローカルタイムゾーンに依存するため、
 *   テストではタイムゾーンに依存しない検証方針を採る:
 *   1. `vi.setSystemTime` でシステム時刻を固定し、実行日に依存しないようにする。
 *   2. 対象日付の「具体的な文字列」はハードコードせず、リポジトリのモックが
 *      `findByDate` に渡された日付を捕捉し、その値を後続の検証に使い回す。
 *   これにより、どのタイムゾーン・どの実行日でも結果が安定する。
 * - `createdAt` はシステム時刻固定により決定論的になるため、厳密一致で検証する。
 */
describe('MarketIndexFetchUseCase', () => {
  /**
   * 固定するシステム時刻。日本時間2024年1月23日（火）午前6時。
   * 週末や祝日に依存しないよう、平日の朝の時刻を選んでいる。
   */
  const fixedSystemTime = new Date('2024-01-23T06:00:00+09:00');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedSystemTime);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * すべてのメソッドが成功を返す市場指数サービスのスタブを生成する。
   *
   * @param overrides 差し替えたいメソッドのみ指定する。
   * @returns MarketIndexService のスタブ
   */
  function createStubService(overrides: Partial<MarketIndexService> = {}): MarketIndexService {
    return {
      ensureHelperSheet: () => ok(undefined),
      fetchLatestIndices: (): Result<MarketIndexData> => ok({ sp500: 4783.45, nasdaq: 15055.65 }),
      ...overrides,
    };
  }

  /**
   * 市場指数リポジトリのスタブを生成する。
   *
   * @param overrides 差し替えたいメソッドのみ指定する。
   * @returns MarketIndexRepository のスタブ
   */
  function createStubRepository(
    overrides: Partial<MarketIndexRepository> = {}
  ): MarketIndexRepository {
    return {
      findByDate: () => ok(null),
      listAll: () => ok([]),
      create: () => ok(undefined),
      highlightAlertCell: () => ok(undefined),
      ...overrides,
    };
  }

  it('対象営業日のデータが既に存在する場合は already_exists を返す', () => {
    // 前提: findByDate が既存レコードを返す（対象日付はユースケースが算出した値を流用）
    // 検証: status=already_exists、既存データがそのまま返り、ensureHelperSheet は呼ばれない
    let requestedDate = '';
    const existingRecord: MarketIndex = {
      // date は findByDate に渡された日付で後から上書きする（TZ非依存にするため）
      date: '',
      sp500: 4700,
      nasdaq: 14800,
      createdAt: '2024-01-23T00:00:00.000Z',
    };
    const ensureHelperSheet = vi.fn(() => ok(undefined));

    const repository = createStubRepository({
      findByDate: (date: string) => {
        requestedDate = date;
        return ok({ ...existingRecord, date });
      },
    });
    const service = createStubService({ ensureHelperSheet });

    const useCase = createMarketIndexFetchUseCase(repository, service);
    const result = useCase.fetchAndRecordLatestIndices();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.status).toBe('already_exists');
      // ユースケースが算出した対象営業日と、結果・既存データの日付が一致すること
      expect(result.value.date).toBe(requestedDate);
      expect(result.value.data?.date).toBe(requestedDate);
      expect(result.value.data?.sp500).toBe(4700);
    }
    // 既存データがあるためヘルパーシート初期化は不要
    expect(ensureHelperSheet).not.toHaveBeenCalled();
  });

  it('未記録の場合は指数を取得してレコードを作成し success を返す', () => {
    // 前提: findByDate=null（未記録）、ensureHelperSheet/fetchLatestIndices は成功
    // 検証: status=success、create に渡るレコードの日付が対象営業日と一致し、
    //       createdAt がシステム固定時刻のISO文字列になる
    let requestedDate = '';
    let createdRecord: MarketIndex | null = null;

    const repository = createStubRepository({
      findByDate: (date: string) => {
        requestedDate = date;
        return ok(null);
      },
      create: (record: MarketIndex) => {
        createdRecord = record;
        return ok(undefined);
      },
    });
    const service = createStubService({
      fetchLatestIndices: () => ok({ sp500: 4783.45, nasdaq: 15055.65 }),
    });

    const useCase = createMarketIndexFetchUseCase(repository, service);
    const result = useCase.fetchAndRecordLatestIndices();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.status).toBe('success');
      expect(result.value.date).toBe(requestedDate);
      expect(result.value.data?.sp500).toBe(4783.45);
      expect(result.value.data?.nasdaq).toBe(15055.65);
    }

    // create に渡されたレコードの内容を検証
    expect(createdRecord).not.toBeNull();
    if (createdRecord !== null) {
      const record: MarketIndex = createdRecord;
      expect(record.date).toBe(requestedDate);
      expect(record.sp500).toBe(4783.45);
      expect(record.nasdaq).toBe(15055.65);
      // システム時刻固定により createdAt は決定論的
      expect(record.createdAt).toBe(fixedSystemTime.toISOString());
    }
  });

  it('指数データの取得に失敗した場合は status=failed（処理自体は success:true）を返す', () => {
    // 前提: fetchLatestIndices が失敗を返す
    // 検証: 戻り値は success:true だが status=failed、create は呼ばれない
    const create = vi.fn(() => ok(undefined));
    const repository = createStubRepository({
      findByDate: () => ok(null),
      create,
    });
    const service = createStubService({
      fetchLatestIndices: () => ({
        success: false,
        error: { type: 'unexpected', message: 'S&P500の終値を取得できませんでした。' },
      }),
    });

    const useCase = createMarketIndexFetchUseCase(repository, service);
    const result = useCase.fetchAndRecordLatestIndices();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.status).toBe('failed');
      expect(result.value.message).toContain('S&P500の終値を取得できませんでした。');
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('既存データ確認（findByDate）でエラーが発生した場合はそのエラーを伝播する', () => {
    // 前提: findByDate がエラーを返す
    // 検証: エラーがそのまま伝播し、ensureHelperSheet は呼ばれない
    const ensureHelperSheet = vi.fn(() => ok(undefined));
    const repository = createStubRepository({
      findByDate: () => ({
        success: false,
        error: { type: 'unexpected', message: 'シートの読み取りに失敗しました' },
      }),
    });
    const service = createStubService({ ensureHelperSheet });

    const useCase = createMarketIndexFetchUseCase(repository, service);
    const result = useCase.fetchAndRecordLatestIndices();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
      expect(result.error.message).toBe('シートの読み取りに失敗しました');
    }
    expect(ensureHelperSheet).not.toHaveBeenCalled();
  });

  it('ヘルパーシート初期化（ensureHelperSheet）でエラーが発生した場合はそのエラーを伝播する', () => {
    // 前提: findByDate=null だが ensureHelperSheet が失敗する
    // 検証: エラーがそのまま伝播し、fetchLatestIndices は呼ばれない
    const fetchLatestIndices = vi.fn(() => ok({ sp500: 1, nasdaq: 1 }));
    const repository = createStubRepository({ findByDate: () => ok(null) });
    const service = createStubService({
      ensureHelperSheet: () => ({
        success: false,
        error: { type: 'unexpected', message: 'ヘルパーシートの作成に失敗しました' },
      }),
      fetchLatestIndices,
    });

    const useCase = createMarketIndexFetchUseCase(repository, service);
    const result = useCase.fetchAndRecordLatestIndices();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('ヘルパーシートの作成に失敗しました');
    }
    expect(fetchLatestIndices).not.toHaveBeenCalled();
  });

  it('レコード作成（create）でエラーが発生した場合はそのエラーを伝播する', () => {
    // 前提: 取得まで成功するが create が失敗する
    // 検証: エラーがそのまま伝播する
    const repository = createStubRepository({
      findByDate: () => ok(null),
      create: () => ({
        success: false,
        error: { type: 'unexpected', message: 'シートへの書き込みに失敗しました' },
      }),
    });
    const service = createStubService();

    const useCase = createMarketIndexFetchUseCase(repository, service);
    const result = useCase.fetchAndRecordLatestIndices();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('シートへの書き込みに失敗しました');
    }
  });

  it('対象営業日はシステム時刻を変えても米国市場の営業日（月〜金）になる', () => {
    // 前提: システム時刻を日本時間2024-01-23（火）に固定
    // 検証: findByDate に渡る対象日付は YYYY-MM-DD 形式で、曜日は米国市場営業日（月〜金）
    //       （-5%ルール等の比較対象は営業日である必要があるため）
    let requestedDate = '';
    const repository = createStubRepository({
      findByDate: (date: string) => {
        requestedDate = date;
        return ok(null);
      },
    });
    const service = createStubService();

    const useCase = createMarketIndexFetchUseCase(repository, service);
    const result = useCase.fetchAndRecordLatestIndices();

    expect(result.success).toBe(true);
    // YYYY-MM-DD 形式であること
    expect(requestedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 対象日付の曜日が土日でないこと（UTC基準で判定: 日付文字列のみを評価）
    const dayOfWeek = new Date(`${requestedDate}T00:00:00Z`).getUTCDay();
    expect(dayOfWeek).not.toBe(0); // 日曜でない
    expect(dayOfWeek).not.toBe(6); // 土曜でない
  });
});

describe('isMarketIndexFetchResult', () => {
  it('正しい構造の取得結果は true と判定される', () => {
    // 前提: fetchAndRecordLatestIndices が返す実際の結果と同じ構造を与える
    // 事前条件: status は結果型が定義する4値のいずれかである
    // 検証: 4値すべてが型ガードを通過する
    for (const status of ['success', 'already_exists', 'skipped', 'failed']) {
      expect(
        isMarketIndexFetchResult({ status, date: '2024-03-05', message: '記録しました。' })
      ).toBe(true);
    }
  });

  it('未知のステータスを持つ値は false と判定される（fail fast）', () => {
    // 前提: status が文字列ではあるが、結果型が定義しない未知の値である
    // 事前条件: date・message は正しい形である
    // 検証: 未知ステータスを通すと後段の 'failed' 判定・通知が静かに素通りするため、
    //   形式不正として弾かれる（H2 #148 で追加した検証規則の固定）
    expect(
      isMarketIndexFetchResult({ status: 'unknown', date: '2024-03-05', message: 'メッセージ' })
    ).toBe(false);
  });

  it('必須フィールドが欠落した値・オブジェクトでない値は false と判定される', () => {
    // 前提: date 欠落・message 欠落・null・文字列の各パターンを与える
    // 事前条件: なし
    // 検証: いずれも形式不正として弾かれる
    expect(isMarketIndexFetchResult({ status: 'success', message: 'メッセージ' })).toBe(false);
    expect(isMarketIndexFetchResult({ status: 'success', date: '2024-03-05' })).toBe(false);
    expect(isMarketIndexFetchResult(null)).toBe(false);
    expect(isMarketIndexFetchResult('success')).toBe(false);
  });
});
