import type { Fund, Nav, RecurringPurchase, Result, Transaction } from '../domain/types';
import {
  addBusinessDays,
  findNextBusinessDay,
  subtractBusinessDays,
} from '../domain/BusinessDayCalculator';
import { calculateUnits } from '../domain/PurchaseCalculator';
import { fail, propagateFailure } from '../domain/result';
import {
  isValidIsoDate,
  validateNonEmptyString,
  validatePositiveNumber,
  validateRecurringDay,
} from '../domain/validators';
import type { FundRepository } from '../repository/FundRepository';
import type { NavRepository } from '../repository/NavRepository';
import type { RecurringPurchaseRepository } from '../repository/RecurringPurchaseRepository';
import type { TransactionRepository } from '../repository/TransactionRepository';
import { generateUlid } from '../utils/ulid';
import { assertFundExists } from './fundGuard';
import { buildTransaction } from './transactionFactory';

export type SkipReason = 'ALREADY_EXECUTED' | 'NO_NAV' | 'INACTIVE' | 'NOT_TARGET_DATE';

export type ExecuteRecurringResult = {
  executed: Transaction[];
  skipped: { recurringPurchaseId: string; reason: SkipReason }[];
};

type NavCalendar = {
  businessDates: string[];
  byDate: Map<string, Nav>;
};

/**
 * 1件の積立設定を処理した結果の判別共用体。
 * - `executed`: 取引を生成・登録した。
 * - `skipped`: 約定対象外・重複などの理由で登録しなかった。
 */
type RecurringOutcome =
  | { kind: 'executed'; transaction: Transaction }
  | { kind: 'skipped'; reason: SkipReason };

/**
 * 積立実行（{@link RecurringUseCase.executeRecurringPurchases}）の1件処理で共有する依存・状態。
 *
 * - `targetDate`: 約定日（YYYY-MM-DD）。逆算して注文日を求める基準日。
 * - `fundMap`: 銘柄IDから {@link Fund} を引く索引。
 * - `fundIds`: 全銘柄ID。冪等チェック（横断検索）に用いる。
 * - `navRepository`: 基準価額の取得元。
 * - `navCache`: 銘柄IDごとの営業日カレンダーのキャッシュ。
 * - `transactionRepository`: 取引の重複確認・登録先。
 */
type RecurringExecutionContext = {
  targetDate: string;
  fundMap: Map<string, Fund>;
  fundIds: string[];
  navRepository: NavRepository;
  navCache: Map<string, NavCalendar>;
  transactionRepository: TransactionRepository;
};

export type RecurringUseCase = {
  listRecurringPurchases: () => Result<RecurringPurchase[]>;
  createRecurringPurchase: (input: {
    fundId: string;
    monthlyAmount: number;
    executionDay: number;
    startDate: string;
    endDate: string | null;
    isActive: boolean;
  }) => Result<RecurringPurchase>;
  /**
   * 既存の積立設定を更新する。
   * 全項目を指定して更新する（作成日時は保持する）。
   */
  updateRecurringPurchase: (input: {
    id: string;
    fundId: string;
    monthlyAmount: number;
    executionDay: number;
    startDate: string;
    endDate: string | null;
    isActive: boolean;
  }) => Result<RecurringPurchase>;
  /**
   * 既存の積立設定を削除する。
   */
  deleteRecurringPurchase: (recurringId: string) => Result<RecurringPurchase>;
  /**
   * 指定した約定日に基づいて積立購入を実行する。
   * targetDateは約定日として扱われ、逆算して注文日を求め、
   * その注文日がexecutionDayに基づく正しい注文日かを検証する。
   */
  executeRecurringPurchases: (targetDate: string) => Result<ExecuteRecurringResult>;
};

/**
 * 積立設定のユースケース。
 */
export function createRecurringUseCase(
  fundRepository: FundRepository,
  navRepository: NavRepository,
  recurringRepository: RecurringPurchaseRepository,
  transactionRepository: TransactionRepository
): RecurringUseCase {
  return {
    listRecurringPurchases: (): Result<RecurringPurchase[]> => {
      return recurringRepository.listAll();
    },
    createRecurringPurchase: (input): Result<RecurringPurchase> => {
      const validateResult = validateRecurringInput(input);
      if (!validateResult.success) {
        return validateResult;
      }

      const { fundId, monthlyAmount, executionDay, startDate, endDate, isActive } =
        validateResult.value;

      const fundResult = assertFundExists(fundRepository, fundId);
      if (!fundResult.success) {
        return propagateFailure(fundResult);
      }

      const recurring: RecurringPurchase = {
        id: generateUlid(),
        fundId,
        monthlyAmount,
        executionDay,
        startDate,
        endDate: endDate !== null && endDate !== '' ? endDate : null,
        isActive,
        createdAt: new Date().toISOString(),
      };

      const createResult = recurringRepository.createRecurringPurchase(recurring);
      if (!createResult.success) {
        return propagateFailure(createResult);
      }

      return { success: true, value: recurring };
    },
    updateRecurringPurchase: (input): Result<RecurringPurchase> => {
      const idResult = validateNonEmptyString(input.id, '積立設定IDが不正です。', 'id');
      if (!idResult.success) {
        return idResult;
      }
      // 入力バリデータの検証済み戻り値(.value)を以降で使用する（元の input.id は使い続けない）。
      const validId = idResult.value;

      const validateResult = validateRecurringInput(input);
      if (!validateResult.success) {
        return validateResult;
      }

      const { fundId, monthlyAmount, executionDay, startDate, endDate, isActive } =
        validateResult.value;

      const existingResult = recurringRepository.findById(validId);
      if (!existingResult.success) {
        return propagateFailure(existingResult);
      }
      if (!existingResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の積立設定が存在しません。', field: 'id' },
        };
      }

      const fundResult = assertFundExists(fundRepository, fundId);
      if (!fundResult.success) {
        return propagateFailure(fundResult);
      }

      const recurring: RecurringPurchase = {
        id: existingResult.value.id,
        fundId,
        monthlyAmount,
        executionDay,
        startDate,
        endDate: endDate !== null && endDate !== '' ? endDate : null,
        isActive,
        createdAt: existingResult.value.createdAt,
      };

      const updateResult = recurringRepository.updateRecurringPurchase(recurring);
      if (!updateResult.success) {
        return propagateFailure(updateResult);
      }

      return { success: true, value: recurring };
    },
    deleteRecurringPurchase: (recurringId: string): Result<RecurringPurchase> => {
      const idResult = validateNonEmptyString(recurringId, '積立設定IDが不正です。', 'id');
      if (!idResult.success) {
        return idResult;
      }
      // 入力バリデータの検証済み戻り値(.value)を以降で使用する（元の recurringId は使い続けない）。
      const validId = idResult.value;

      const existingResult = recurringRepository.findById(validId);
      if (!existingResult.success) {
        return propagateFailure(existingResult);
      }
      if (!existingResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の積立設定が存在しません。', field: 'id' },
        };
      }

      const deleteResult = recurringRepository.deleteRecurringPurchase(validId);
      if (!deleteResult.success) {
        return propagateFailure(deleteResult);
      }

      return { success: true, value: existingResult.value };
    },
    executeRecurringPurchases: (targetDate: string): Result<ExecuteRecurringResult> => {
      if (!isValidIsoDate(targetDate)) {
        return fail('validation', '約定日はYYYY-MM-DD形式で入力してください。', 'targetDate');
      }

      const listResult = recurringRepository.listAll();
      if (!listResult.success) {
        return propagateFailure(listResult);
      }

      const fundIndexResult = buildFundIndex(fundRepository);
      if (!fundIndexResult.success) {
        return propagateFailure(fundIndexResult);
      }
      const { fundMap, fundIds } = fundIndexResult.value;

      const context: RecurringExecutionContext = {
        targetDate,
        fundMap,
        fundIds,
        navRepository,
        navCache: new Map<string, NavCalendar>(),
        transactionRepository,
      };

      const executed: Transaction[] = [];
      const skipped: { recurringPurchaseId: string; reason: SkipReason }[] = [];

      for (const recurring of listResult.value) {
        const outcomeResult = processRecurringPurchase(recurring, context);
        if (!outcomeResult.success) {
          return propagateFailure(outcomeResult);
        }

        const outcome = outcomeResult.value;
        if (outcome.kind === 'executed') {
          executed.push(outcome.transaction);
        } else {
          skipped.push({ recurringPurchaseId: recurring.id, reason: outcome.reason });
        }
      }

      return { success: true, value: { executed, skipped } };
    },
  };
}

/**
 * 全銘柄を取得し、ID索引（`fundMap`）と全ID一覧（`fundIds`）を構築する。
 *
 * 約定処理では「銘柄の参照」と「冪等チェックの横断検索」の双方で銘柄情報が必要となるため、
 * 銘柄一覧の取得を1回に集約し、その結果から両者を導出する。
 *
 * @param fundRepository 銘柄マスタへのアクセスを担うリポジトリ。
 * @returns 取得に成功すれば索引と全ID一覧を持つ {@link Result}。
 */
function buildFundIndex(
  fundRepository: FundRepository
): Result<{ fundMap: Map<string, Fund>; fundIds: string[] }> {
  const fundListResult = fundRepository.listFunds();
  if (!fundListResult.success) {
    return propagateFailure(fundListResult);
  }

  const fundMap = new Map<string, Fund>();
  for (const fund of fundListResult.value) {
    fundMap.set(fund.id, fund);
  }
  const fundIds = fundListResult.value.map((fund) => fund.id);

  return { success: true, value: { fundMap, fundIds } };
}

/**
 * 1件の積立設定を処理し、取引の生成・登録または各種スキップ判定を行う。
 *
 * 処理の流れ:
 * 1. 非アクティブなら `INACTIVE` でスキップ。
 * 2. 銘柄の存在と約定営業日数の妥当性を確認（不正時はユースケース全体を失敗させる）。
 * 3. 営業日カレンダーを構築し、約定日（targetDate）から注文日を逆算（対象外なら `NOT_TARGET_DATE`）。
 * 4. 冪等キーで重複確認（既存なら `ALREADY_EXECUTED`）。
 * 5. 約定日の基準価額が無い、または口数計算に失敗したら `NO_NAV` でスキップ。
 * 6. 取引を生成・登録し、`executed` として返す。
 *
 * @param recurring 処理対象の積立設定。
 * @param context 約定処理で共有する依存・状態。
 * @returns 処理結果（{@link RecurringOutcome}）。取得・登録失敗時は失敗 {@link Result}。
 */
function processRecurringPurchase(
  recurring: RecurringPurchase,
  context: RecurringExecutionContext
): Result<RecurringOutcome> {
  if (!recurring.isActive) {
    return { success: true, value: { kind: 'skipped', reason: 'INACTIVE' } };
  }

  const fundResult = resolveRecurringFund(recurring, context.fundMap);
  if (!fundResult.success) {
    return propagateFailure(fundResult);
  }
  const { fund, settlementBusinessDays } = fundResult.value;

  const navCalendarResult = getNavCalendar(context.navRepository, context.navCache, fund.id);
  if (!navCalendarResult.success) {
    return propagateFailure(navCalendarResult);
  }
  const navCalendar = navCalendarResult.value;

  // targetDateを約定日として、逆算して注文日を求める
  const orderAndSettlement = findOrderDateFromSettlementDate(
    recurring,
    context.targetDate,
    settlementBusinessDays,
    navCalendar.businessDates
  );
  if (!orderAndSettlement) {
    return { success: true, value: { kind: 'skipped', reason: 'NOT_TARGET_DATE' } };
  }

  const { orderDate, settlementDate } = orderAndSettlement;

  const idempotencyResult = checkRecurringIdempotency(
    context.transactionRepository,
    recurring,
    orderDate,
    context.fundIds
  );
  if (!idempotencyResult.success) {
    return propagateFailure(idempotencyResult);
  }
  if (idempotencyResult.value.alreadyExecuted) {
    return { success: true, value: { kind: 'skipped', reason: 'ALREADY_EXECUTED' } };
  }
  const { idempotencyKey } = idempotencyResult.value;

  const navValue = navCalendar.byDate.get(settlementDate);
  if (!navValue) {
    return { success: true, value: { kind: 'skipped', reason: 'NO_NAV' } };
  }

  const unitsResult = calculateUnits(recurring.monthlyAmount, navValue.value);
  if (!unitsResult.success) {
    return { success: true, value: { kind: 'skipped', reason: 'NO_NAV' } };
  }

  const transaction = buildTransaction({
    type: 'RECURRING_PURCHASE',
    fundId: recurring.fundId,
    date: settlementDate,
    amount: recurring.monthlyAmount,
    navValue: navValue.value,
    units: unitsResult.value,
    recurringPurchaseId: recurring.id,
    idempotencyKey,
  });

  const createResult = context.transactionRepository.createTransaction(transaction);
  if (!createResult.success) {
    return fail('unexpected', `取引の作成に失敗しました: ${createResult.error.message}`);
  }

  return { success: true, value: { kind: 'executed', transaction } };
}

/**
 * 積立対象の銘柄を索引から取得し、約定営業日数の妥当性を検証する。
 *
 * - 銘柄が索引に存在しない場合は `not_found`。
 * - 約定営業日数が未設定（null）の場合は `validation`。
 * - 約定営業日数が非整数または負の場合は `validation`。
 *
 * いずれの失敗もユースケース全体を中断させる（既存挙動を維持する）。
 *
 * @param recurring 処理対象の積立設定。
 * @param fundMap 銘柄IDから {@link Fund} を引く索引。
 * @returns 検証に成功すれば、銘柄と確定済みの約定営業日数を持つ {@link Result}。
 */
function resolveRecurringFund(
  recurring: RecurringPurchase,
  fundMap: Map<string, Fund>
): Result<{ fund: Fund; settlementBusinessDays: number }> {
  const fund = fundMap.get(recurring.fundId);
  if (!fund) {
    return fail('not_found', `積立対象の銘柄が存在しません: fundId=${recurring.fundId}`);
  }
  if (fund.settlementBusinessDays === null) {
    return fail(
      'validation',
      `約定までの営業日数が未設定です: fundId=${fund.id}, fundName=${fund.name}`,
      'settlementBusinessDays'
    );
  }
  const settlementBusinessDays = fund.settlementBusinessDays;
  if (!Number.isInteger(settlementBusinessDays) || settlementBusinessDays < 0) {
    return fail(
      'validation',
      `約定までの営業日数が不正です: fundId=${fund.id}, fundName=${fund.name}`,
      'settlementBusinessDays'
    );
  }

  return { success: true, value: { fund, settlementBusinessDays } };
}

/**
 * 冪等キーを用いて、同一注文日に対する取引が既に登録済みかを確認する。
 *
 * @param transactionRepository 取引リポジトリ。
 * @param recurring 処理対象の積立設定。
 * @param orderDate 逆算で求めた注文日（YYYY-MM-DD）。
 * @param fundIds 横断検索対象の全銘柄ID。
 * @returns 既存有無と冪等キーを持つ {@link Result}。検索失敗時は `unexpected` の失敗 {@link Result}。
 */
function checkRecurringIdempotency(
  transactionRepository: TransactionRepository,
  recurring: RecurringPurchase,
  orderDate: string,
  fundIds: string[]
): Result<{ alreadyExecuted: boolean; idempotencyKey: string }> {
  const idempotencyKey = `${recurring.id}_${orderDate}`;
  const existingResult = transactionRepository.findByIdempotencyKey(idempotencyKey, fundIds);
  if (!existingResult.success) {
    return fail('unexpected', `重複チェックに失敗しました: ${existingResult.error.message}`);
  }

  return {
    success: true,
    value: { alreadyExecuted: existingResult.value !== null, idempotencyKey },
  };
}

/**
 * 積立設定の入力値を検証し、正規化済みの値を返す。
 */
function validateRecurringInput(input: {
  fundId: string;
  monthlyAmount: number;
  executionDay: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
}): Result<{
  fundId: string;
  monthlyAmount: number;
  executionDay: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
}> {
  const { fundId, monthlyAmount, executionDay, startDate, endDate, isActive } = input;

  const fundIdResult = validateNonEmptyString(fundId, '銘柄を選択してください。', 'fundId');
  if (!fundIdResult.success) {
    return fundIdResult;
  }
  const monthlyAmountResult = validatePositiveNumber(
    monthlyAmount,
    '月額購入金額は0より大きい数値で入力してください。',
    'monthlyAmount'
  );
  if (!monthlyAmountResult.success) {
    return monthlyAmountResult;
  }
  // executionDayは「1〜28の整数」という積立固有の制約があるため、専用バリデータで検証する。
  const executionDayResult = validateRecurringDay(
    executionDay,
    '注文日は1〜28の整数で入力してください。',
    'executionDay'
  );
  if (!executionDayResult.success) {
    return executionDayResult;
  }
  if (!isValidIsoDate(startDate)) {
    return fail('validation', '開始日はYYYY-MM-DD形式で入力してください。', 'startDate');
  }
  if (endDate !== null && endDate !== '' && !isValidIsoDate(endDate)) {
    return fail('validation', '終了日はYYYY-MM-DD形式で入力してください。', 'endDate');
  }
  if (endDate !== null && endDate !== '' && parseIsoDate(endDate) < parseIsoDate(startDate)) {
    return fail('validation', '終了日は開始日以降である必要があります。', 'endDate');
  }
  if (typeof isActive !== 'boolean') {
    return fail('validation', 'アクティブ設定が不正です。', 'isActive');
  }

  // Result を返す入力バリデータ（fundId・monthlyAmount・executionDay）は検証済み戻り値(.value)を
  // 用いる。startDate・endDate は isValidIsoDate、isActive は typeof での判定であり Result を
  // 返さないため元の値を用いる（本方針は Result を返す入力バリデータの戻り値を対象とする）。
  return {
    success: true,
    value: {
      fundId: fundIdResult.value,
      monthlyAmount: monthlyAmountResult.value,
      executionDay: executionDayResult.value,
      startDate,
      endDate: endDate !== null && endDate !== '' ? endDate : null,
      isActive,
    },
  };
}

/**
 * 基準価額の存在日を営業日カレンダーとして扱うための補助関数。
 * fundIdごとにキャッシュして再利用する。
 */
function getNavCalendar(
  navRepository: NavRepository,
  cache: Map<string, NavCalendar>,
  fundId: string
): Result<NavCalendar> {
  const cached = cache.get(fundId);
  if (cached) {
    return { success: true, value: cached };
  }

  const listResult = navRepository.listByFundId(fundId);
  if (!listResult.success) {
    return listResult;
  }

  const byDate = new Map<string, Nav>();
  for (const nav of listResult.value) {
    if (!byDate.has(nav.date)) {
      byDate.set(nav.date, nav);
    }
  }

  const businessDates = Array.from(byDate.keys()).sort((a, b) => (a < b ? -1 : 1));
  const calendar = { businessDates, byDate };
  cache.set(fundId, calendar);

  return { success: true, value: calendar };
}

/**
 * 約定日（targetDate）から注文日を逆算し、その注文日がexecutionDayに基づく正しい注文日かを検証する。
 *
 * 処理の流れ:
 * 1. targetDate（約定日）から settlementBusinessDays 分戻って注文日を求める
 * 2. その注文日が属する月のexecutionDayから、実際の注文日を計算
 * 3. 計算した注文日から約定日を求め、targetDateと一致するか検証
 */
function findOrderDateFromSettlementDate(
  recurring: RecurringPurchase,
  settlementDate: string,
  settlementBusinessDays: number,
  businessDates: string[]
): { orderDate: string; settlementDate: string } | null {
  // 約定日から逆算して注文日候補を求める
  const candidateOrderDate = subtractBusinessDays(
    settlementDate,
    settlementBusinessDays,
    businessDates
  );
  if (candidateOrderDate === null) {
    return null;
  }

  // 注文日候補の年月を取得
  const [yearText, monthText] = candidateOrderDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  // その月のexecutionDay（希望注文日）を生成
  const desiredOrderDate = formatIsoDate(year, month, recurring.executionDay);

  // 希望注文日が営業日かチェック
  let actualOrderDate: string;
  if (businessDates.includes(desiredOrderDate)) {
    // 希望注文日が営業日の場合、それを注文日とする
    actualOrderDate = desiredOrderDate;
  } else {
    // 希望注文日が営業日でない場合、翌営業日を注文日とする
    const nextBD = findNextBusinessDay(desiredOrderDate, businessDates);
    if (nextBD === null) {
      return null;
    }
    actualOrderDate = nextBD;
  }

  // 注文日が積立期間内かチェック
  if (!isWithinRecurringPeriod(recurring, actualOrderDate)) {
    return null;
  }

  // 実際の注文日から約定日を計算
  const calculatedSettlementDate = addBusinessDays(
    actualOrderDate,
    settlementBusinessDays,
    businessDates
  );
  if (calculatedSettlementDate === null) {
    return null;
  }

  // 計算した約定日がtargetDateと一致するかチェック
  if (calculatedSettlementDate !== settlementDate) {
    return null;
  }

  return { orderDate: actualOrderDate, settlementDate };
}

/**
 * 年月日をYYYY-MM-DD形式の文字列に整形する。
 */
function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 注文日が積立設定の期間内かを判定する。
 */
function isWithinRecurringPeriod(recurring: RecurringPurchase, orderDate: string): boolean {
  const order = parseIsoDate(orderDate);
  const start = parseIsoDate(recurring.startDate);
  if (order < start) {
    return false;
  }
  if (recurring.endDate !== null && recurring.endDate !== '') {
    const end = parseIsoDate(recurring.endDate);
    if (order > end) {
      return false;
    }
  }
  return true;
}

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}
