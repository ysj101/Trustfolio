import type { Holding, Result } from '../domain/types';
import { propagateFailure } from '../domain/result';
import type { FundRepository } from '../repository/FundRepository';
import type { NavRepository } from '../repository/NavRepository';
import type { TransactionRepository } from '../repository/TransactionRepository';
import { calculateHolding } from '../domain/HoldingCalculator';

export type HoldingUseCase = {
  getHolding: (fundId: string) => Result<Holding | null>;
  listHoldings: () => Result<Holding[]>;
};

/**
 * 保有情報のユースケース。
 */
export function createHoldingUseCase(
  fundRepository: FundRepository,
  navRepository: NavRepository,
  transactionRepository: TransactionRepository
): HoldingUseCase {
  return {
    getHolding: (fundId: string): Result<Holding | null> => {
      if (typeof fundId !== 'string' || fundId.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '銘柄を選択してください。', field: 'fundId' },
        };
      }

      const fundResult = fundRepository.findById(fundId);
      if (!fundResult.success) {
        return propagateFailure(fundResult);
      }
      if (!fundResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の銘柄が存在しません。', field: 'fundId' },
        };
      }

      const transactionResult = transactionRepository.listByFundId(fundId);
      if (!transactionResult.success) {
        return propagateFailure(transactionResult);
      }

      const navResult = navRepository.findLatestByFundId(fundId);
      if (!navResult.success) {
        return propagateFailure(navResult);
      }

      const holding = calculateHolding(fundResult.value, transactionResult.value, navResult.value);
      return { success: true, value: holding };
    },
    listHoldings: (): Result<Holding[]> => {
      const fundResult = fundRepository.listFunds();
      if (!fundResult.success) {
        return propagateFailure(fundResult);
      }

      // 全ファンドIDを取得
      const fundIds = fundResult.value.map((f) => f.id);

      // バッチ取得（合計3回程度のシートアクセス）
      const transactionsMapResult = transactionRepository.listByFundIdsGrouped(fundIds);
      if (!transactionsMapResult.success) {
        return propagateFailure(transactionsMapResult);
      }

      const navsMapResult = navRepository.findLatestByFundIds(fundIds);
      if (!navsMapResult.success) {
        return propagateFailure(navsMapResult);
      }

      // メモリ上でHoldingを計算
      const holdings: Holding[] = [];

      for (const fund of fundResult.value) {
        const transactions = transactionsMapResult.value.get(fund.id) ?? [];
        const nav = navsMapResult.value.get(fund.id) ?? null;

        const holding = calculateHolding(fund, transactions, nav);
        if (holding !== null) {
          holdings.push(holding);
        }
      }

      return { success: true, value: holdings };
    },
  };
}
