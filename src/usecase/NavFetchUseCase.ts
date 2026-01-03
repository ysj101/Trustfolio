import { calculateHolding, calculatePortfolio } from '../domain/HoldingCalculator';
import type { Fund, Nav, PerformanceRecord, Result } from '../domain/types';
import type { FundRepository } from '../repository/FundRepository';
import type { NavRepository } from '../repository/NavRepository';
import type { PerformanceRepository } from '../repository/PerformanceRepository';
import type { TransactionRepository } from '../repository/TransactionRepository';
import type { RakutenService } from '../service/RakutenService';

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
  /** スキップした銘柄数（楽天ファンドID未設定） */
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
   * 全銘柄の最新基準価額を楽天証券から取得し、登録する。
   * 楽天ファンドIDが設定されていない銘柄はスキップする。
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
  transactionRepository: TransactionRepository,
  performanceRepository: PerformanceRepository,
  rakutenService: RakutenService
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
        const item = processFund(
          fund,
          navRepository,
          transactionRepository,
          performanceRepository,
          rakutenService
        );
        items.push(item);
      }

      // 集計
      const successCount = items.filter((i) => i.status === 'success').length;
      const skippedCount = items.filter((i) => i.status === 'skipped').length;
      const alreadyExistsCount = items.filter((i) => i.status === 'already_exists').length;
      const failedCount = items.filter((i) => i.status === 'failed').length;

      // 基準価額が1件でも登録された場合、全体実績を記録
      if (successCount > 0) {
        const latestDate = items
          .filter((i) => i.status === 'success' && i.nav !== undefined)
          .map((i) => i.nav?.date ?? '')
          .filter((d) => d !== '')
          .sort()
          .reverse()[0];

        if (latestDate !== '') {
          const globalResult = recordGlobalPerformance(
            latestDate,
            fundRepository,
            transactionRepository,
            navRepository,
            performanceRepository
          );

          if (!globalResult.success) {
            console.warn(`全体実績記録に失敗: ${globalResult.error.message}`);
          } else {
            console.log(`全体実績記録成功: ${latestDate}`);
          }
        }
      }

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
  transactionRepository: TransactionRepository,
  performanceRepository: PerformanceRepository,
  rakutenService: RakutenService
): NavFetchResultItem {
  // 楽天ファンドIDが未設定の場合はスキップ
  if (fund.rakutenFundId === null) {
    return {
      fundId: fund.id,
      fundName: fund.name,
      status: 'skipped',
      message: '楽天ファンドIDが設定されていません。',
    };
  }

  // 楽天証券から基準価額を取得
  const fetchResult = rakutenService.fetchLatestNav(fund.rakutenFundId);
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

  // 実績記録（失敗してもエラーにしない）
  const performanceResult = recordFundPerformance(
    fund,
    nav,
    transactionRepository,
    performanceRepository
  );

  if (!performanceResult.success) {
    console.warn(`[${fund.name}] ファンド別実績記録に失敗: ${performanceResult.error.message}`);
  } else {
    console.log(`[${fund.name}] ファンド別実績記録成功: ${nav.date}`);
  }

  return {
    fundId: fund.id,
    fundName: fund.name,
    status: 'success',
    nav,
  };
}

/**
 * ファンド別実績を記録する。
 * @param fund ファンド情報
 * @param nav 登録された基準価額
 * @param transactionRepository 取引リポジトリ
 * @param performanceRepository 実績リポジトリ
 * @returns 成功または失敗
 */
function recordFundPerformance(
  fund: Fund,
  nav: Nav,
  transactionRepository: TransactionRepository,
  performanceRepository: PerformanceRepository
): Result<void> {
  // 1. 重複チェック
  const existingResult = performanceRepository.findByFundAndDate(fund.id, nav.date);
  if (!existingResult.success) return existingResult;
  if (existingResult.value !== null) {
    return { success: true, value: undefined }; // 既に記録済み
  }

  // 2. 取引履歴取得
  const transactionsResult = transactionRepository.listByFundId(fund.id);
  if (!transactionsResult.success) return transactionsResult;

  // 3. 保有情報計算
  const holding = calculateHolding(fund, transactionsResult.value, nav);
  if (holding?.currentValue === null || holding?.currentValue === undefined) {
    return { success: true, value: undefined }; // 保有なし
  }

  // unrealizedGainとunrealizedGainRateはnullでないことを確認
  if (holding.unrealizedGain === null || holding.unrealizedGainRate === null) {
    return { success: true, value: undefined };
  }

  // 4. 実績データ作成
  const performance: PerformanceRecord = {
    fundId: fund.id,
    date: nav.date,
    totalUnits: holding.totalUnits,
    remainingInvestment: holding.remainingInvestment,
    currentValue: holding.currentValue,
    totalGain: holding.unrealizedGain,
    unrealizedGainRate: holding.unrealizedGainRate,
    createdAt: new Date().toISOString(),
  };

  // 5. ファンド別シートに記録
  return performanceRepository.createPerformance(performance);
}

/**
 * 全体実績を記録する。
 * @param date 記録日付
 * @param fundRepository ファンドリポジトリ
 * @param transactionRepository 取引リポジトリ
 * @param navRepository 基準価額リポジトリ
 * @param performanceRepository 実績リポジトリ
 * @returns 成功または失敗
 */
function recordGlobalPerformance(
  date: string,
  fundRepository: FundRepository,
  transactionRepository: TransactionRepository,
  navRepository: NavRepository,
  performanceRepository: PerformanceRepository
): Result<void> {
  // 1. 重複チェック
  const existingResult = performanceRepository.findGlobalByDate(date);
  if (!existingResult.success) return existingResult;
  if (existingResult.value !== null) {
    return { success: true, value: undefined };
  }

  // 2. 全ファンドの保有情報を計算
  const fundsResult = fundRepository.listFunds();
  if (!fundsResult.success) return fundsResult;

  const fundIds = fundsResult.value.map((f) => f.id);
  const allTransactionsResult = transactionRepository.listAll(fundIds);
  if (!allTransactionsResult.success) return allTransactionsResult;

  const holdings = [];
  for (const fund of fundsResult.value) {
    const transactionsResult = transactionRepository.listByFundId(fund.id);
    if (!transactionsResult.success) continue;

    const navResult = navRepository.findLatestByFundId(fund.id);
    if (!navResult.success) continue;

    const holding = calculateHolding(fund, transactionsResult.value, navResult.value);
    if (holding !== null) holdings.push(holding);
  }

  // 3. ポートフォリオサマリー計算
  const portfolio = calculatePortfolio(holdings, allTransactionsResult.value);

  if (portfolio.totalCurrentValue === null || portfolio.totalUnrealizedGain === null) {
    return { success: true, value: undefined };
  }

  // 全保有口数を計算
  const totalUnits = holdings.reduce((sum, holding) => sum + holding.totalUnits, 0);

  // 4. 全体実績データ作成（portfolioから既に計算済みの値を使用）
  const performance: PerformanceRecord = {
    fundId: '', // 全体実績はfundIdなし
    date,
    totalUnits,
    remainingInvestment: portfolio.remainingInvestment,
    currentValue: portfolio.totalCurrentValue,
    totalGain: portfolio.totalUnrealizedGain,
    unrealizedGainRate: portfolio.totalUnrealizedGainRate ?? 0,
    createdAt: new Date().toISOString(),
  };

  // 5. 全体シートに記録
  return performanceRepository.createGlobalPerformance(performance);
}
