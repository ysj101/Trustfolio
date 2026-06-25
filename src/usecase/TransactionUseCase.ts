import type { Result, Transaction } from '../domain/types';
import { calculateUnits } from '../domain/PurchaseCalculator';
import { fail, propagateFailure } from '../domain/result';
import {
  isValidIsoDate,
  validateNonEmptyString,
  validatePositiveNumber,
} from '../domain/validators';
import type { FundRepository } from '../repository/FundRepository';
import type { TransactionRepository } from '../repository/TransactionRepository';
import { assertFundExists } from './fundGuard';
import { buildTransaction } from './transactionFactory';

export type TransactionUseCase = {
  getHistory: (fundId: string) => Result<Transaction[]>;
  listAll: () => Result<Transaction[]>;
  executeSpotPurchase: (input: {
    fundId: string;
    date: string;
    amount: number;
    navValue: number;
  }) => Result<Transaction>;
  /**
   * 売却取引を登録する。
   * 入力されたunitsは正の値で受け取り、内部で負の値に変換して保存する。
   * amountは手動入力された売却金額を使用する。
   */
  executeSaleTransaction: (input: {
    fundId: string;
    date: string;
    units: number;
    amount: number;
    navValue: number;
  }) => Result<Transaction>;
  /**
   * 既存のスポット購入履歴を更新する。
   * 全項目を指定して更新する（作成日時は保持する）。
   */
  updateSpotPurchase: (input: {
    id: string;
    fundId: string;
    date: string;
    amount: number;
    navValue: number;
  }) => Result<Transaction>;
  /**
   * 既存の売却取引を更新する。
   * 全項目を指定して更新する（作成日時は保持する）。
   * amountは手動入力された売却金額を使用する。
   */
  updateSaleTransaction: (input: {
    id: string;
    fundId: string;
    date: string;
    units: number;
    amount: number;
    navValue: number;
  }) => Result<Transaction>;
  /**
   * 既存のスポット購入または売却取引を削除する。
   * 積立購入の取引は削除できない。
   */
  deleteSpotPurchase: (transactionId: string, fundId: string) => Result<Transaction>;
};

/**
 * スポット購入のユースケース。
 */
export function createTransactionUseCase(
  fundRepository: FundRepository,
  transactionRepository: TransactionRepository
): TransactionUseCase {
  return {
    getHistory: (fundId: string): Result<Transaction[]> => {
      const fundIdResult = validateNonEmptyString(fundId, '銘柄を選択してください。', 'fundId');
      if (!fundIdResult.success) {
        return fundIdResult;
      }

      const fundResult = assertFundExists(fundRepository, fundId);
      if (!fundResult.success) {
        return fundResult;
      }

      return transactionRepository.listByFundId(fundId);
    },
    listAll: (): Result<Transaction[]> => {
      const fundsResult = fundRepository.listFunds();
      if (!fundsResult.success) {
        return propagateFailure(fundsResult);
      }

      const fundIds = fundsResult.value.map((f) => f.id);
      return transactionRepository.listAll(fundIds);
    },
    executeSpotPurchase: (input: {
      fundId: string;
      date: string;
      amount: number;
      navValue: number;
    }): Result<Transaction> => {
      const validateResult = validateSpotPurchaseInput(input);
      if (!validateResult.success) {
        return validateResult;
      }

      const { fundId, date, amount, navValue } = validateResult.value;

      const fundResult = assertFundExists(fundRepository, fundId);
      if (!fundResult.success) {
        return fundResult;
      }

      const unitsResult = calculateUnits(amount, navValue);
      if (!unitsResult.success) {
        return unitsResult;
      }

      const transaction = buildTransaction({
        type: 'SPOT_PURCHASE',
        fundId,
        date,
        amount,
        navValue,
        units: unitsResult.value,
      });

      const createResult = transactionRepository.createTransaction(transaction);
      if (!createResult.success) {
        return propagateFailure(createResult);
      }

      return { success: true, value: transaction };
    },
    executeSaleTransaction: (input: {
      fundId: string;
      date: string;
      units: number;
      amount: number;
      navValue: number;
    }): Result<Transaction> => {
      const validateResult = validateSaleTransactionInput(input);
      if (!validateResult.success) {
        return validateResult;
      }

      const { fundId, date, units, amount, navValue } = validateResult.value;

      // 銘柄の存在確認
      const fundResult = assertFundExists(fundRepository, fundId);
      if (!fundResult.success) {
        return fundResult;
      }

      // 売却日時点および全期間で保有口数がマイナスにならないことをチェック
      const transactionsResult = transactionRepository.listByFundId(fundId);
      if (!transactionsResult.success) {
        return propagateFailure(transactionsResult);
      }

      // 保存対象の売却取引を一度だけ生成し、検証と登録で同一オブジェクトを使い回す。
      // unitsは正の値で保存し、保有口数の計算時にtypeで判別して減算する。
      const transaction = buildTransaction({
        type: 'REDEMPTION',
        fundId,
        date,
        amount,
        navValue,
        units,
      });

      // 新しい売却取引を含めて、全期間で保有口数がマイナスにならないことを検証
      const validationResult = validateHoldingsAcrossAllDates(
        [...transactionsResult.value, transaction],
        null // 更新対象なし（新規登録）
      );

      if (!validationResult.success) {
        return propagateFailure(validationResult);
      }

      const createResult = transactionRepository.createTransaction(transaction);
      if (!createResult.success) {
        return propagateFailure(createResult);
      }

      return { success: true, value: transaction };
    },
    updateSpotPurchase: (input): Result<Transaction> => {
      const idResult = validateNonEmptyString(input.id, '取引IDが不正です。', 'id');
      if (!idResult.success) {
        return idResult;
      }

      const validateResult = validateSpotPurchaseInput(input);
      if (!validateResult.success) {
        return validateResult;
      }

      const { fundId, date, amount, navValue } = validateResult.value;

      const existingResult = transactionRepository.findById(input.id, fundId);
      if (!existingResult.success) {
        return propagateFailure(existingResult);
      }
      if (!existingResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の取引履歴が存在しません。', field: 'id' },
        };
      }
      if (existingResult.value.type !== 'SPOT_PURCHASE') {
        return {
          success: false,
          error: {
            type: 'validation',
            message: '積立購入の取引履歴は編集できません。',
            field: 'id',
          },
        };
      }

      const fundResult = assertFundExists(fundRepository, fundId);
      if (!fundResult.success) {
        return fundResult;
      }

      const unitsResult = calculateUnits(amount, navValue);
      if (!unitsResult.success) {
        return unitsResult;
      }

      const transaction = buildTransaction({
        type: 'SPOT_PURCHASE',
        fundId,
        date,
        amount,
        navValue,
        units: unitsResult.value,
        id: existingResult.value.id,
        createdAt: existingResult.value.createdAt,
      });

      const updateResult = transactionRepository.updateTransaction(transaction);
      if (!updateResult.success) {
        return propagateFailure(updateResult);
      }

      return { success: true, value: transaction };
    },
    updateSaleTransaction: (input: {
      id: string;
      fundId: string;
      date: string;
      units: number;
      amount: number;
      navValue: number;
    }): Result<Transaction> => {
      const idResult = validateNonEmptyString(input.id, '取引IDが不正です。', 'id');
      if (!idResult.success) {
        return idResult;
      }

      const validateResult = validateSaleTransactionInput(input);
      if (!validateResult.success) {
        return validateResult;
      }

      const { fundId, date, units, amount, navValue } = validateResult.value;

      const existingResult = transactionRepository.findById(input.id, fundId);
      if (!existingResult.success) {
        return propagateFailure(existingResult);
      }
      if (!existingResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の取引履歴が存在しません。', field: 'id' },
        };
      }
      if (existingResult.value.type !== 'REDEMPTION') {
        return {
          success: false,
          error: {
            type: 'validation',
            message: '売却取引以外の取引履歴は編集できません。',
            field: 'id',
          },
        };
      }

      const fundResult = assertFundExists(fundRepository, fundId);
      if (!fundResult.success) {
        return fundResult;
      }

      // 売却金額は手動入力された値を使用
      // 更新後の売却取引（作成日時は既存値を維持する）。
      // unitsは正の値で保存し、保有口数の計算時にtypeで判別して減算する。
      const transaction = buildTransaction({
        type: 'REDEMPTION',
        fundId,
        date,
        amount,
        navValue,
        units,
        id: existingResult.value.id,
        createdAt: existingResult.value.createdAt,
      });

      // 全期間で保有口数がマイナスにならないことを検証（更新対象の売却取引を除く）
      const transactionsResult = transactionRepository.listByFundId(fundId);
      if (!transactionsResult.success) {
        return propagateFailure(transactionsResult);
      }

      // 更新後の売却取引を含めて、全期間で保有口数がマイナスにならないことを検証
      const validationResult = validateHoldingsAcrossAllDates(
        [...transactionsResult.value, transaction],
        input.id // 更新対象の取引IDを除外
      );

      if (!validationResult.success) {
        return propagateFailure(validationResult);
      }

      const updateResult = transactionRepository.updateTransaction(transaction);
      if (!updateResult.success) {
        return propagateFailure(updateResult);
      }

      return { success: true, value: transaction };
    },
    deleteSpotPurchase: (transactionId: string, fundId: string): Result<Transaction> => {
      const transactionIdResult = validateNonEmptyString(transactionId, '取引IDが不正です。', 'id');
      if (!transactionIdResult.success) {
        return transactionIdResult;
      }
      const fundIdResult = validateNonEmptyString(fundId, '銘柄IDが不正です。', 'fundId');
      if (!fundIdResult.success) {
        return fundIdResult;
      }

      const existingResult = transactionRepository.findById(transactionId, fundId);
      if (!existingResult.success) {
        return propagateFailure(existingResult);
      }
      if (!existingResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の取引履歴が存在しません。', field: 'id' },
        };
      }
      // 積立購入の取引履歴は削除できない（スポット購入と売却は削除可能）
      if (existingResult.value.type === 'RECURRING_PURCHASE') {
        return {
          success: false,
          error: {
            type: 'validation',
            message: '積立購入の取引履歴は削除できません。',
            field: 'id',
          },
        };
      }

      const deleteResult = transactionRepository.deleteTransaction(transactionId, fundId);
      if (!deleteResult.success) {
        return propagateFailure(deleteResult);
      }

      return { success: true, value: existingResult.value };
    },
  };
}

/**
 * スポット購入・売却の双方に共通する「銘柄ID（fundId）」と「日付（date）」を検証する。
 *
 * 目的:
 * - {@link validateSpotPurchaseInput} と {@link validateSaleTransactionInput} に
 *   完全に重複していた fundId・date の検証ブロックを一本化する。
 *
 * 既存挙動の踏襲（重要）:
 * - 検証順序は「fundId（空でない文字列）→ date（YYYY-MM-DD 形式）」であり、
 *   両ユースケースの元実装と同一である。先に失敗した項目のエラーをそのまま返す。
 * - メッセージ・field キーも元実装と一致させる。
 *
 * @param input - 検証対象の fundId と date。
 * @returns 検証に成功すれば fundId・date を持つ {@link Result}。
 */
function validateFundAndDate(input: {
  fundId: string;
  date: string;
}): Result<{ fundId: string; date: string }> {
  const { fundId, date } = input;

  const fundIdResult = validateNonEmptyString(fundId, '銘柄を選択してください。', 'fundId');
  if (!fundIdResult.success) {
    return fundIdResult;
  }
  if (!isValidIsoDate(date)) {
    return fail('validation', '日付はYYYY-MM-DD形式で入力してください。', 'date');
  }
  return { success: true, value: { fundId, date } };
}

/**
 * スポット購入の入力値を検証し、正規化済みの値を返す。
 */
function validateSpotPurchaseInput(input: {
  fundId: string;
  date: string;
  amount: number;
  navValue: number;
}): Result<{
  fundId: string;
  date: string;
  amount: number;
  navValue: number;
}> {
  const { fundId, date, amount, navValue } = input;

  const fundAndDateResult = validateFundAndDate({ fundId, date });
  if (!fundAndDateResult.success) {
    return fundAndDateResult;
  }
  const amountResult = validatePositiveNumber(
    amount,
    '購入金額は0より大きい数値で入力してください。',
    'amount'
  );
  if (!amountResult.success) {
    return amountResult;
  }
  const navValueResult = validatePositiveNumber(
    navValue,
    '基準価額は0より大きい数値で入力してください。',
    'navValue'
  );
  if (!navValueResult.success) {
    return navValueResult;
  }

  return { success: true, value: { fundId, date, amount, navValue } };
}

/**
 * 売却取引の入力値を検証し、正規化済みの値を返す。
 */
function validateSaleTransactionInput(input: {
  fundId: string;
  date: string;
  units: number;
  amount: number;
  navValue: number;
}): Result<{
  fundId: string;
  date: string;
  units: number;
  amount: number;
  navValue: number;
}> {
  const { fundId, date, units, amount, navValue } = input;

  const fundAndDateResult = validateFundAndDate({ fundId, date });
  if (!fundAndDateResult.success) {
    return fundAndDateResult;
  }
  const unitsResult = validatePositiveNumber(
    units,
    '売却口数は0より大きい数値で入力してください。',
    'units'
  );
  if (!unitsResult.success) {
    return unitsResult;
  }
  const amountResult = validatePositiveNumber(
    amount,
    '売却金額は0より大きい数値で入力してください。',
    'amount'
  );
  if (!amountResult.success) {
    return amountResult;
  }
  const navValueResult = validatePositiveNumber(
    navValue,
    '基準価額は0より大きい数値で入力してください。',
    'navValue'
  );
  if (!navValueResult.success) {
    return navValueResult;
  }

  return { success: true, value: { fundId, date, units, amount, navValue } };
}

/**
 * 全取引を時系列順に並べ、全期間で保有口数がマイナスにならないことを検証する。
 * 過去日付での売却登録により、未来の時点で保有口数がマイナスになることを防ぐ。
 *
 * @param transactions 全取引（検証対象の新規/更新取引を含む）
 * @param excludeTransactionId 更新時に除外する取引ID（新規登録時はnull）
 */
function validateHoldingsAcrossAllDates(
  transactions: Transaction[],
  excludeTransactionId: string | null
): Result<void> {
  // 更新対象の取引を除外
  const filteredTransactions =
    excludeTransactionId !== null
      ? transactions.filter((t) => t.id !== excludeTransactionId)
      : transactions;

  // 日付順にソート（同日の場合は作成日時順）
  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? -1 : 1;
    }
    return a.createdAt < b.createdAt ? -1 : 1;
  });

  // 各時点での累積保有口数を計算し、マイナスにならないことを確認
  let cumulativeUnits = 0;
  for (const transaction of sortedTransactions) {
    // 購入時は加算、売却時は減算（unitsは常に正の値で保存される）
    if (transaction.type === 'REDEMPTION') {
      cumulativeUnits -= transaction.units;
    } else {
      cumulativeUnits += transaction.units;
    }
    if (cumulativeUnits < 0) {
      return {
        success: false,
        error: {
          type: 'validation',
          message: `売却により、${transaction.date}時点で保有口数がマイナス（${cumulativeUnits.toFixed(0)}口）になります。売却口数を減らすか、登録順序を見直してください。`,
          field: 'units',
        },
      };
    }
  }

  return { success: true, value: undefined };
}
