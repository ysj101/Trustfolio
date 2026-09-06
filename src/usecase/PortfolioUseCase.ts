import type { Portfolio, PortfolioPerformanceHistory, Result } from '../domain/types';
import { propagateFailure } from '../domain/result';
import type { FundRepository } from '../repository/FundRepository';
import type { TransactionRepository } from '../repository/TransactionRepository';
import type { HoldingUseCase } from './HoldingUseCase';
import type { PerformanceRepository } from '../repository/PerformanceRepository';
import { calculateAssetClassSummaries, calculatePortfolio } from '../domain/HoldingCalculator';

export type PortfolioUseCase = {
  getPortfolioSummary: () => Result<Portfolio>;
  getPortfolioPerformanceHistory: () => Result<PortfolioPerformanceHistory[]>;
};

/**
 * ポートフォリオのユースケース。
 */
export function createPortfolioUseCase(
  fundRepository: FundRepository,
  transactionRepository: TransactionRepository,
  holdingUseCase: HoldingUseCase,
  performanceRepository: PerformanceRepository
): PortfolioUseCase {
  return {
    getPortfolioSummary: (): Result<Portfolio> => {
      // HoldingUseCaseを利用してHoldingsを取得（内部でバッチ取得済み）
      const holdingsResult = holdingUseCase.listHoldings();
      if (!holdingsResult.success) {
        return propagateFailure(holdingsResult);
      }

      const holdings = holdingsResult.value;

      // 全ファンドのIDリストを取得
      const fundResult = fundRepository.listFunds();
      if (!fundResult.success) {
        return propagateFailure(fundResult);
      }

      const fundIds = fundResult.value.map((f) => f.id);

      // 全トランザクション取得（実現損益計算用）
      const transactionsMapResult = transactionRepository.listByFundIdsGrouped(fundIds);
      if (!transactionsMapResult.success) {
        return propagateFailure(transactionsMapResult);
      }

      // 全トランザクションでPortfolio計算
      const allTransactions = Array.from(transactionsMapResult.value.values()).flat();
      const assetClassSummariesResult = calculateAssetClassSummaries(
        holdings,
        allTransactions,
        new Map(fundResult.value.map((fund) => [fund.id, fund.assetClass] as const))
      );
      if (!assetClassSummariesResult.success) {
        return propagateFailure(assetClassSummariesResult);
      }
      const summary = calculatePortfolio(holdings, allTransactions);
      return {
        success: true,
        value: {
          ...summary,
          assetClassSummaries: assetClassSummariesResult.value,
          holdings,
        },
      };
    },
    getPortfolioPerformanceHistory: (): Result<PortfolioPerformanceHistory[]> => {
      const historyResult = performanceRepository.listGlobalHistory();
      if (!historyResult.success) {
        return propagateFailure(historyResult);
      }

      const history: PortfolioPerformanceHistory[] = historyResult.value.map((record) => ({
        date: record.date,
        remainingInvestment: record.remainingInvestment,
        currentValue: record.currentValue,
        totalGain: record.totalGain,
        unrealizedGainRate: record.unrealizedGainRate,
      }));

      return { success: true, value: history };
    },
  };
}
