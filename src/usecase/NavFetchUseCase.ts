import type { Fund, Nav, Result } from '../domain/types';
import type { FundRepository } from '../repository/FundRepository';
import type { NavRepository } from '../repository/NavRepository';
import type { MorningstarService } from '../service/MorningstarService';
import { generateUlid } from '../utils/ulid';

/**
 * 基準価額の自動取得結果（1銘柄分）。
 */
export type NavFetchResultItem = {
  /** 銘柄ID */
  fundId: string;
  /** 銘柄名 */
  fundName: string;
  /** 処理結果のステータス */
  status: 'success' | 'skipped' | 'failed' | 'already_exists';
  /** エラーメッセージ（失敗時のみ） */
  message?: string;
  /** 取得した基準価額（成功時のみ） */
  nav?: Nav;
};

/**
 * 基準価額の自動取得結果（全体）。
 */
export type NavFetchResult = {
  /** 処理した銘柄数 */
  totalCount: number;
  /** 成功した銘柄数 */
  successCount: number;
  /** スキップした銘柄数（モーニングスターコード未設定） */
  skippedCount: number;
  /** 既に登録済みの銘柄数 */
  alreadyExistsCount: number;
  /** 失敗した銘柄数 */
  failedCount: number;
  /** 各銘柄の処理結果 */
  items: NavFetchResultItem[];
};

export type NavFetchUseCase = {
  /**
   * 全銘柄の最新基準価額をモーニングスターから取得し、登録する。
   * モーニングスターコードが設定されていない銘柄はスキップする。
   * 同一日付の基準価額が既に登録されている場合もスキップする。
   */
  fetchAndRegisterAllNavs: () => Result<NavFetchResult>;
};

/**
 * 基準価額自動取得ユースケースを作成する。
 */
export function createNavFetchUseCase(
  fundRepository: FundRepository,
  navRepository: NavRepository,
  morningstarService: MorningstarService
): NavFetchUseCase {
  return {
    fetchAndRegisterAllNavs: (): Result<NavFetchResult> => {
      // 全銘柄を取得
      const fundsResult = fundRepository.listFunds();
      if (!fundsResult.success) {
        return fundsResult;
      }

      const funds = fundsResult.value;
      const items: NavFetchResultItem[] = [];

      for (const fund of funds) {
        const item = processFund(fund, navRepository, morningstarService);
        items.push(item);
      }

      // 集計
      const successCount = items.filter((i) => i.status === 'success').length;
      const skippedCount = items.filter((i) => i.status === 'skipped').length;
      const alreadyExistsCount = items.filter((i) => i.status === 'already_exists').length;
      const failedCount = items.filter((i) => i.status === 'failed').length;

      return {
        success: true,
        value: {
          totalCount: funds.length,
          successCount,
          skippedCount,
          alreadyExistsCount,
          failedCount,
          items,
        },
      };
    },
  };
}

/**
 * 1銘柄の基準価額取得・登録処理を実行する。
 */
function processFund(
  fund: Fund,
  navRepository: NavRepository,
  morningstarService: MorningstarService
): NavFetchResultItem {
  // モーニングスターコードが未設定の場合はスキップ
  if (fund.morningstarCode === null) {
    return {
      fundId: fund.id,
      fundName: fund.name,
      status: 'skipped',
      message: 'モーニングスターコードが設定されていません。',
    };
  }

  // モーニングスターから基準価額を取得
  const fetchResult = morningstarService.fetchLatestNav(fund.morningstarCode);
  if (!fetchResult.success) {
    return {
      fundId: fund.id,
      fundName: fund.name,
      status: 'failed',
      message: fetchResult.error.message,
    };
  }

  const navData = fetchResult.value.nav;
  if (navData === null) {
    return {
      fundId: fund.id,
      fundName: fund.name,
      status: 'failed',
      message: '基準価額データを取得できませんでした。',
    };
  }

  // 同一日付の基準価額が既に登録されているか確認
  const existingResult = navRepository.findByFundAndDate(fund.id, navData.date);
  if (!existingResult.success) {
    return {
      fundId: fund.id,
      fundName: fund.name,
      status: 'failed',
      message: existingResult.error.message,
    };
  }

  if (existingResult.value !== null) {
    return {
      fundId: fund.id,
      fundName: fund.name,
      status: 'already_exists',
      message: `${navData.date}の基準価額は既に登録されています。`,
    };
  }

  // 基準価額を登録
  const nav: Nav = {
    id: generateUlid(),
    fundId: fund.id,
    date: navData.date,
    value: navData.value,
    createdAt: new Date().toISOString(),
  };

  const createResult = navRepository.createNav(nav);
  if (!createResult.success) {
    return {
      fundId: fund.id,
      fundName: fund.name,
      status: 'failed',
      message: createResult.error.message,
    };
  }

  return {
    fundId: fund.id,
    fundName: fund.name,
    status: 'success',
    nav,
  };
}
