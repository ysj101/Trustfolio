import type { Result, Transaction } from '../domain/types';
import {
  AMOUNT_NOT_POSITIVE_INTEGER_MESSAGE,
  NAV_VALUE_NOT_POSITIVE_INTEGER_MESSAGE,
  calculateUnits,
} from '../domain/PurchaseCalculator';
import { fail, propagateFailure } from '../domain/result';
import {
  isValidIsoDate,
  validateNonEmptyString,
  validateNonNegativeNumber,
  validatePositiveInteger,
  validatePositiveNumber,
} from '../domain/validators';
import type { FundRepository } from '../repository/FundRepository';
import type { TransactionRepository } from '../repository/TransactionRepository';
import { assertEntityFound } from './entityGuard';
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
   * 入力されたunitsは正の値で受け取り、そのまま保存し、計算時にtypeで減算する。
   * amountは手動入力された売却金額を使用する。
   * incomeTaxとresidentTaxは0以上の有限数を必須とし、0円も記録値として保持する。
   */
  executeSaleTransaction: (input: {
    fundId: string;
    date: string;
    units: number;
    amount: number;
    navValue: number;
    incomeTax: number;
    residentTax: number;
  }) => Result<Transaction>;
  /**
   * 既存のスポット購入履歴を更新する。
   * 全項目を指定して更新する（作成日時は保持する）。
   *
   * 口数の扱い（issue #260）:
   * - 購入金額または基準価額が変わる場合は、calculateUnits で口数を計算し直す。
   * - 購入金額と基準価額がどちらも変わらない場合は、記録済みの口数を保持する。口数は購入金額と
   *   基準価額だけから決まるため、計算し直すと「口数を訂正」で訂正した約定口数を推定値へ戻して
   *   しまうからである。
   * - 注意: 編集画面で日付を変えると、基準価額はその日付の値に取り直される。そのため、日付だけを
   *   直した場合も多くは基準価額が変わり、口数は計算し直される。保持されるのは、何も変えずに保存した
   *   場合や、取り直した基準価額が記録値と同じ場合である（画面の口数プレビューは、口数が記録値から
   *   変わる場合にその旨を表示する）。
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
   * incomeTaxとresidentTaxは0以上の有限数を必須とし、既存の税額未記録取引を
   * 更新する場合も利用者による明示入力を要求する。
   */
  updateSaleTransaction: (input: {
    id: string;
    fundId: string;
    date: string;
    units: number;
    amount: number;
    navValue: number;
    incomeTax: number;
    residentTax: number;
  }) => Result<Transaction>;
  /**
   * 既存の購入取引（スポット購入・積立購入）の口数を、実際の約定口数へ訂正する（issue #260）。
   *
   * 目的:
   *   購入時に記録する口数は calculateUnits による推定値であり、販売会社の実際の約定口数と
   *   異なる場合がある。利用者が取引報告書の約定口数へ訂正できるようにする。
   *
   * 内容:
   *   - 口数（units）だけを書き換える。日付・金額・基準価額・積立設定ID・冪等キー・作成日時は
   *     既存の値を保持する。冪等キーを保持するため、積立の自動記録が同じ約定を二重に記録しない。
   *   - 口数を減らす訂正だけ、訂正後の口数で全期間の保有口数がマイナスにならないことを検証する
   *     （口数を増やす訂正は、どの時点の保有口数も減らさないため検証しない）。
   *   - 口数が記録済みの値と同じ訂正は、シートへ書き込まずに記録済みの取引を返す。
   *
   * 注意:
   *   - 売却取引（REDEMPTION）は対象外である（売却口数は売却取引の「編集」で変更する）。
   *   - 訂正後にスポット購入を「編集」で更新した場合、購入金額または基準価額を変えると口数は
   *     計算し直され、訂正した口数は推定値で上書きされる（どちらも変えなければ保持される）。
   */
  correctPurchaseUnits: (input: {
    id: string;
    fundId: string;
    units: number;
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
      // 入力バリデータの検証済み戻り値(.value)を以降で使用する（元の入力変数は使い続けない）。
      const validFundId = fundIdResult.value;

      const fundResult = assertFundExists(fundRepository, validFundId);
      if (!fundResult.success) {
        return fundResult;
      }

      return transactionRepository.listByFundId(validFundId);
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
        incomeTax: null,
        residentTax: null,
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
      incomeTax: number;
      residentTax: number;
    }): Result<Transaction> => {
      const validateResult = validateSaleTransactionInput(input);
      if (!validateResult.success) {
        return validateResult;
      }

      const { fundId, date, units, amount, navValue, incomeTax, residentTax } =
        validateResult.value;

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
        incomeTax,
        residentTax,
      });

      // 新しい売却取引を含めて、全期間で保有口数がマイナスにならないことを検証
      const validationResult = validateHoldingsAcrossAllDates(
        transactionsResult.value,
        transaction,
        SALE_NEGATIVE_HOLDINGS_WORDING
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
      // 入力バリデータの検証済み戻り値(.value)を以降で使用する（元の input.id は使い続けない）。
      const validId = idResult.value;

      const validateResult = validateSpotPurchaseInput(input);
      if (!validateResult.success) {
        return validateResult;
      }

      const { fundId, date, amount, navValue } = validateResult.value;

      const existingResult = assertEntityFound(
        transactionRepository.findById(validId, fundId),
        '対象の取引履歴が存在しません。'
      );
      if (!existingResult.success) {
        return existingResult;
      }
      const typeResult = assertTransactionType(
        existingResult.value,
        ['SPOT_PURCHASE'],
        '積立購入の取引履歴は編集できません。'
      );
      if (!typeResult.success) {
        return typeResult;
      }

      const fundResult = assertFundExists(fundRepository, fundId);
      if (!fundResult.success) {
        return fundResult;
      }

      // 購入金額と基準価額が変わらなければ、記録済みの口数（「口数を訂正」の訂正値を含む）を保持する。
      // 口数は購入金額と基準価額だけから決まるため、計算し直すと訂正した約定口数を推定値へ戻してしまう。
      const isAmountAndNavUnchanged =
        existingResult.value.amount === amount && existingResult.value.navValue === navValue;
      let units = existingResult.value.units;
      if (!isAmountAndNavUnchanged) {
        const unitsResult = calculateUnits(amount, navValue);
        if (!unitsResult.success) {
          return unitsResult;
        }
        units = unitsResult.value;
      }

      const transaction = buildTransaction({
        type: 'SPOT_PURCHASE',
        fundId,
        date,
        amount,
        navValue,
        units,
        incomeTax: null,
        residentTax: null,
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
      incomeTax: number;
      residentTax: number;
    }): Result<Transaction> => {
      const idResult = validateNonEmptyString(input.id, '取引IDが不正です。', 'id');
      if (!idResult.success) {
        return idResult;
      }
      // 入力バリデータの検証済み戻り値(.value)を以降で使用する（元の input.id は使い続けない）。
      const validId = idResult.value;

      const validateResult = validateSaleTransactionInput(input);
      if (!validateResult.success) {
        return validateResult;
      }

      const { fundId, date, units, amount, navValue, incomeTax, residentTax } =
        validateResult.value;

      const existingResult = assertEntityFound(
        transactionRepository.findById(validId, fundId),
        '対象の取引履歴が存在しません。'
      );
      if (!existingResult.success) {
        return existingResult;
      }
      const typeResult = assertTransactionType(
        existingResult.value,
        ['REDEMPTION'],
        '売却取引以外の取引履歴は編集できません。'
      );
      if (!typeResult.success) {
        return typeResult;
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
        incomeTax,
        residentTax,
        id: existingResult.value.id,
        createdAt: existingResult.value.createdAt,
      });

      const transactionsResult = transactionRepository.listByFundId(fundId);
      if (!transactionsResult.success) {
        return propagateFailure(transactionsResult);
      }

      // 更新後の売却取引を含めて、全期間で保有口数がマイナスにならないことを検証
      const validationResult = validateHoldingsAcrossAllDates(
        transactionsResult.value,
        transaction,
        SALE_NEGATIVE_HOLDINGS_WORDING
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
    correctPurchaseUnits: (input: {
      id: string;
      fundId: string;
      units: number;
    }): Result<Transaction> => {
      const idResult = validateNonEmptyString(input.id, '取引IDが不正です。', 'id');
      if (!idResult.success) {
        return idResult;
      }
      const fundIdResult = validateNonEmptyString(input.fundId, '銘柄IDが不正です。', 'fundId');
      if (!fundIdResult.success) {
        return fundIdResult;
      }
      // 口数は取引報告書の約定口数（1口単位）であるため、1以上の安全な整数だけを受け付ける。
      const unitsResult = validatePositiveInteger(
        input.units,
        '口数は1以上の整数で入力してください。',
        'units'
      );
      if (!unitsResult.success) {
        return unitsResult;
      }
      // 入力バリデータの検証済み戻り値(.value)を以降で使用する（元の入力値は使い続けない）。
      const validId = idResult.value;
      const validFundId = fundIdResult.value;
      const validUnits = unitsResult.value;

      // 銘柄の存在を先に確認する。存在しない銘柄を「取引が存在しない」と取り違えて報告しないためである。
      const fundResult = assertFundExists(fundRepository, validFundId);
      if (!fundResult.success) {
        return fundResult;
      }

      // listByFundId の結果を、対象取引の特定と保有口数の検証に共用する（findById を別に呼ぶと
      // 取引シートをもう一度読むため）。なお、updateTransaction の内部でも書き込む行を探すために読む。
      const transactionsResult = transactionRepository.listByFundId(validFundId);
      if (!transactionsResult.success) {
        return propagateFailure(transactionsResult);
      }
      const existingResult = assertEntityFound(
        {
          success: true,
          value: transactionsResult.value.find((transaction) => transaction.id === validId) ?? null,
        },
        '対象の取引履歴が存在しません。'
      );
      if (!existingResult.success) {
        return existingResult;
      }
      // 対象は購入取引（スポット購入・積立購入）だけである。許可する種別を明示的に列挙して判定し、
      // 将来追加される種別が意図せず対象に入らないようにする。
      const typeResult = assertTransactionType(
        existingResult.value,
        ['SPOT_PURCHASE', 'RECURRING_PURCHASE'],
        '口数の訂正は購入取引（スポット購入・積立購入）だけが対象です。売却口数は売却取引の「編集」で変更してください。'
      );
      if (!typeResult.success) {
        return typeResult;
      }
      const existing = typeResult.value;

      // 口数が変わらない訂正（入力ダイアログの初期値のまま確定した場合など）は、シートへ書き込まずに返す。
      if (validUnits === existing.units) {
        return { success: true, value: existing };
      }

      // 口数以外（日付・金額・基準価額・積立設定ID・冪等キー・作成日時）は既存の値を保持する。
      const transaction: Transaction = { ...existing, units: validUnits };

      // 口数を減らす訂正だけを検証する。購入の口数を減らすと、後日の売却と合わせて保有口数が
      // マイナスになりうる。口数を増やす訂正は、どの時点の保有口数も減らさないため検証しない
      // （訂正と無関係な既存のマイナス保有によって、訂正が拒否されないようにする）。
      if (validUnits < existing.units) {
        const validationResult = validateHoldingsAcrossAllDates(
          transactionsResult.value,
          transaction,
          UNITS_CORRECTION_NEGATIVE_HOLDINGS_WORDING
        );
        if (!validationResult.success) {
          return propagateFailure(validationResult);
        }
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
      // 入力バリデータの検証済み戻り値(.value)を以降で使用する（元の入力変数は使い続けない）。
      const validTransactionId = transactionIdResult.value;
      const validFundId = fundIdResult.value;

      const existingResult = assertEntityFound(
        transactionRepository.findById(validTransactionId, validFundId),
        '対象の取引履歴が存在しません。'
      );
      if (!existingResult.success) {
        return existingResult;
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

      const deleteResult = transactionRepository.deleteTransaction(validTransactionId, validFundId);
      if (!deleteResult.success) {
        return propagateFailure(deleteResult);
      }

      return { success: true, value: existingResult.value };
    },
  };
}

/**
 * 更新対象の取引が期待する取引種別であることを検証する共通ガード。
 *
 * 目的:
 * - `updateSpotPurchase`（SPOT_PURCHASE のみ編集可）・`updateSaleTransaction`
 *   （REDEMPTION のみ編集可）・`correctPurchaseUnits`（SPOT_PURCHASE と RECURRING_PURCHASE の
 *   口数のみ訂正可。issue #260）に共通する「取得済み取引の種別チェック → validation エラー」の
 *   定型を一本化する（H4 #150）。
 *
 * 注意:
 * - 許可する種別は明示的に列挙して渡す。否定形の条件（「〜以外」）にしないのは、将来追加される
 *   種別が意図せず許可されないようにするためである。
 * - `deleteSpotPurchase` の種別チェックは「RECURRING_PURCHASE のみ削除不可」という
 *   否定形の条件で書かれた既存の実装であり、本ガードを使っていない。
 *
 * @param transaction - 存在確認済みの取引。
 * @param allowedTypes - 許可する取引種別の一覧。
 * @param mismatchMessage - 種別不一致時に利用者へ提示するメッセージ。
 * @returns 種別が一致すれば取引を持つ成功 {@link Result}。
 */
function assertTransactionType(
  transaction: Transaction,
  allowedTypes: readonly Transaction['type'][],
  mismatchMessage: string
): Result<Transaction> {
  if (!allowedTypes.includes(transaction.type)) {
    return fail('validation', mismatchMessage, 'id');
  }
  return { success: true, value: transaction };
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
  // fundId は検証済み戻り値(.value)を用いる。date は Result を返さない isValidIsoDate で
  // 判定するため元の値を用いる（本方針は Result を返す入力バリデータの戻り値を対象とする）。
  return { success: true, value: { fundId: fundIdResult.value, date } };
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
  // 購入金額と基準価額は、口数の計算（calculateUnits）が円単位の整数を前提とするため、
  // 入力の時点で1円以上の整数に限る（issue #260）。金額・基準価額を変えない更新では
  // calculateUnits を呼ばないため、ここで検証しないと整数でない値が保存されうる。
  const amountResult = validatePositiveInteger(
    amount,
    AMOUNT_NOT_POSITIVE_INTEGER_MESSAGE,
    'amount'
  );
  if (!amountResult.success) {
    return amountResult;
  }
  const navValueResult = validatePositiveInteger(
    navValue,
    NAV_VALUE_NOT_POSITIVE_INTEGER_MESSAGE,
    'navValue'
  );
  if (!navValueResult.success) {
    return navValueResult;
  }

  // 各入力バリデータの検証済み戻り値(.value)を集約して返す（元の入力変数は使い続けない）。
  // fundId・date は validateFundAndDate の検証済み value をそのまま展開する。
  return {
    success: true,
    value: {
      ...fundAndDateResult.value,
      amount: amountResult.value,
      navValue: navValueResult.value,
    },
  };
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
  incomeTax: number;
  residentTax: number;
}): Result<{
  fundId: string;
  date: string;
  units: number;
  amount: number;
  navValue: number;
  incomeTax: number;
  residentTax: number;
}> {
  const { fundId, date, units, amount, navValue, incomeTax, residentTax } = input;

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
  const incomeTaxResult = validateNonNegativeNumber(
    incomeTax,
    '所得税は0以上の有限数で入力してください。',
    'incomeTax'
  );
  if (!incomeTaxResult.success) {
    return incomeTaxResult;
  }
  const residentTaxResult = validateNonNegativeNumber(
    residentTax,
    '住民税は0以上の有限数で入力してください。',
    'residentTax'
  );
  if (!residentTaxResult.success) {
    return residentTaxResult;
  }

  // 各入力バリデータの検証済み戻り値(.value)を集約して返す（元の入力変数は使い続けない）。
  // fundId・date は validateFundAndDate の検証済み value をそのまま展開する。
  return {
    success: true,
    value: {
      ...fundAndDateResult.value,
      units: unitsResult.value,
      amount: amountResult.value,
      navValue: navValueResult.value,
      incomeTax: incomeTaxResult.value,
      residentTax: residentTaxResult.value,
    },
  };
}

/**
 * 全取引を時系列順に並べ、全期間で保有口数がマイナスにならないことを検証する。
 * 過去日付での売却登録により、未来の時点で保有口数がマイナスになることを防ぐ。
 * 本検証を適用している経路は、売却取引の新規登録と更新、購入取引の口数の訂正
 * （`correctPurchaseUnits`。issue #260）である。
 * 購入取引の編集（`updateSpotPurchase`）と削除（`deleteSpotPurchase`）は対象外であり、
 * それらの経路では保有口数がマイナスになるデータが作られうる。この点はissue #207の対応範囲外であり、別途対応が必要である。
 *
 * @param existingTransactions 既存の全取引。検証対象取引と同一idの既存行は、更新経路で更新前の行を二重計上しないため除外する。
 * @param targetTransaction 検証対象の新規または更新取引。既存行を除外した集合へ必ず加えて検証する。
 * @param wording 保有口数がマイナスになるときのメッセージのうち、操作（売却・口数の訂正）ごとに異なる文言。
 *   見直すべき入力を案内する文言が操作ごとに異なるため、呼び出し元が渡す。
 */
function validateHoldingsAcrossAllDates(
  existingTransactions: Transaction[],
  targetTransaction: Transaction,
  wording: NegativeHoldingsWording
): Result<void> {
  // 検証対象の集合を日付順にソートする（同日の場合は作成日時順）。
  const sortedTransactions = [
    ...existingTransactions.filter((transaction) => transaction.id !== targetTransaction.id),
    targetTransaction,
  ].sort((a, b) => {
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
          message: `${wording.operationLabel}により、${transaction.date}時点で保有口数がマイナス（${cumulativeUnits.toFixed(0)}口）になります。${wording.advice}`,
          field: 'units',
        },
      };
    }
  }

  return { success: true, value: undefined };
}

/**
 * 保有口数がマイナスになるときのメッセージのうち、操作ごとに異なる文言。
 *
 * - `operationLabel`: 文頭の操作名（例: 「売却」）。「〜により、…時点で保有口数がマイナス（…口）になります。」の主語になる。
 * - `advice`: 末尾の案内文。利用者が見直すべき入力を示す。
 */
type NegativeHoldingsWording = { operationLabel: string; advice: string };

/** 売却（新規登録・更新）により保有口数がマイナスになるときの文言。 */
const SALE_NEGATIVE_HOLDINGS_WORDING: NegativeHoldingsWording = {
  operationLabel: '売却',
  advice: '売却口数を減らすか、登録順序を見直してください。',
};

/** 購入取引の口数の訂正により保有口数がマイナスになるときの文言（issue #260）。 */
const UNITS_CORRECTION_NEGATIVE_HOLDINGS_WORDING: NegativeHoldingsWording = {
  operationLabel: '口数の訂正',
  advice: '訂正後の口数を見直してください。',
};
