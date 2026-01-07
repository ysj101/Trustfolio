import type { Fund, Nav, RecurringPurchase, Result, Transaction } from '../domain/types';
import { calculateUnits } from '../domain/PurchaseCalculator';
import type { FundRepository } from '../repository/FundRepository';
import type { NavRepository } from '../repository/NavRepository';
import type { RecurringPurchaseRepository } from '../repository/RecurringPurchaseRepository';
import type { TransactionRepository } from '../repository/TransactionRepository';
import { generateUlid } from '../utils/ulid';

export type SkipReason = 'ALREADY_EXECUTED' | 'NO_NAV' | 'INACTIVE' | 'NOT_TARGET_DATE';

export type ExecuteRecurringResult = {
  executed: Transaction[];
  skipped: { recurringPurchaseId: string; reason: SkipReason }[];
};

type NavCalendar = {
  businessDates: string[];
  byDate: Map<string, Nav>;
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
        return validateResult as Result<RecurringPurchase>;
      }

      const { fundId, monthlyAmount, executionDay, startDate, endDate, isActive } =
        validateResult.value;

      const fundResult = fundRepository.findById(fundId);
      if (!fundResult.success) {
        return fundResult as Result<RecurringPurchase>;
      }
      if (!fundResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の銘柄が存在しません。', field: 'fundId' },
        };
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
        return createResult as Result<RecurringPurchase>;
      }

      return { success: true, value: recurring };
    },
    updateRecurringPurchase: (input): Result<RecurringPurchase> => {
      if (typeof input.id !== 'string' || input.id.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '積立設定IDが不正です。', field: 'id' },
        };
      }

      const validateResult = validateRecurringInput(input);
      if (!validateResult.success) {
        return validateResult as Result<RecurringPurchase>;
      }

      const { fundId, monthlyAmount, executionDay, startDate, endDate, isActive } =
        validateResult.value;

      const existingResult = recurringRepository.findById(input.id);
      if (!existingResult.success) {
        return existingResult as Result<RecurringPurchase>;
      }
      if (!existingResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の積立設定が存在しません。', field: 'id' },
        };
      }

      const fundResult = fundRepository.findById(fundId);
      if (!fundResult.success) {
        return fundResult as Result<RecurringPurchase>;
      }
      if (!fundResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の銘柄が存在しません。', field: 'fundId' },
        };
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
        return updateResult as Result<RecurringPurchase>;
      }

      return { success: true, value: recurring };
    },
    deleteRecurringPurchase: (recurringId: string): Result<RecurringPurchase> => {
      if (typeof recurringId !== 'string' || recurringId.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '積立設定IDが不正です。', field: 'id' },
        };
      }

      const existingResult = recurringRepository.findById(recurringId);
      if (!existingResult.success) {
        return existingResult as Result<RecurringPurchase>;
      }
      if (!existingResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の積立設定が存在しません。', field: 'id' },
        };
      }

      const deleteResult = recurringRepository.deleteRecurringPurchase(recurringId);
      if (!deleteResult.success) {
        return deleteResult as Result<RecurringPurchase>;
      }

      return { success: true, value: existingResult.value };
    },
    executeRecurringPurchases: (targetDate: string): Result<ExecuteRecurringResult> => {
      if (!isValidIsoDate(targetDate)) {
        return {
          success: false,
          error: {
            type: 'validation',
            message: '約定日はYYYY-MM-DD形式で入力してください。',
            field: 'targetDate',
          },
        };
      }

      const listResult = recurringRepository.listAll();
      if (!listResult.success) {
        return listResult as Result<ExecuteRecurringResult>;
      }

      const fundListResult = fundRepository.listFunds();
      if (!fundListResult.success) {
        return fundListResult as Result<ExecuteRecurringResult>;
      }

      const fundMap = new Map<string, Fund>();
      fundListResult.value.forEach((fund) => {
        fundMap.set(fund.id, fund);
      });

      const navCache = new Map<string, NavCalendar>();
      const executed: Transaction[] = [];
      const skipped: { recurringPurchaseId: string; reason: SkipReason }[] = [];

      for (const recurring of listResult.value) {
        if (!recurring.isActive) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'INACTIVE' });
          continue;
        }

        const fund = fundMap.get(recurring.fundId);
        if (!fund) {
          return {
            success: false,
            error: {
              type: 'not_found',
              message: `積立対象の銘柄が存在しません: fundId=${recurring.fundId}`,
            },
          };
        }
        if (fund.settlementBusinessDays === null) {
          return {
            success: false,
            error: {
              type: 'validation',
              message: `約定までの営業日数が未設定です: fundId=${fund.id}, fundName=${fund.name}`,
              field: 'settlementBusinessDays',
            },
          };
        }
        if (!Number.isInteger(fund.settlementBusinessDays) || fund.settlementBusinessDays < 0) {
          return {
            success: false,
            error: {
              type: 'validation',
              message: `約定までの営業日数が不正です: fundId=${fund.id}, fundName=${fund.name}`,
              field: 'settlementBusinessDays',
            },
          };
        }

        const navCalendarResult = getNavCalendar(navRepository, navCache, fund.id);
        if (!navCalendarResult.success) {
          return navCalendarResult as Result<ExecuteRecurringResult>;
        }

        // targetDateを約定日として、逆算して注文日を求める
        const orderAndSettlement = findOrderDateFromSettlementDate(
          recurring,
          targetDate,
          fund.settlementBusinessDays,
          navCalendarResult.value.businessDates
        );
        if (!orderAndSettlement) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'NOT_TARGET_DATE' });
          continue;
        }

        const { orderDate, settlementDate } = orderAndSettlement;
        const idempotencyKey = `${recurring.id}_${orderDate}`;
        const allFundsResult = fundRepository.listFunds();
        if (!allFundsResult.success) {
          return {
            success: false,
            error: {
              type: 'unexpected',
              message: `ファンド一覧の取得に失敗しました: ${allFundsResult.error.message}`,
            },
          };
        }
        const fundIds = allFundsResult.value.map((f) => f.id);
        const existingResult = transactionRepository.findByIdempotencyKey(idempotencyKey, fundIds);
        if (!existingResult.success) {
          return {
            success: false,
            error: {
              type: 'unexpected',
              message: `重複チェックに失敗しました: ${existingResult.error.message}`,
            },
          };
        }
        if (existingResult.value) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'ALREADY_EXECUTED' });
          continue;
        }

        const navValue = navCalendarResult.value.byDate.get(settlementDate);
        if (!navValue) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'NO_NAV' });
          continue;
        }

        const unitsResult = calculateUnits(recurring.monthlyAmount, navValue.value);
        if (!unitsResult.success) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'NO_NAV' });
          continue;
        }

        const transaction: Transaction = {
          id: generateUlid(),
          fundId: recurring.fundId,
          type: 'RECURRING_PURCHASE',
          date: settlementDate,
          amount: recurring.monthlyAmount,
          navValue: navValue.value,
          units: unitsResult.value,
          recurringPurchaseId: recurring.id,
          idempotencyKey,
          createdAt: new Date().toISOString(),
        };

        const createResult = transactionRepository.createTransaction(transaction);
        if (!createResult.success) {
          return {
            success: false,
            error: {
              type: 'unexpected',
              message: `取引の作成に失敗しました: ${createResult.error.message}`,
            },
          };
        }

        executed.push(transaction);
      }

      return { success: true, value: { executed, skipped } };
    },
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

  if (typeof fundId !== 'string' || fundId.trim() === '') {
    return {
      success: false,
      error: { type: 'validation', message: '銘柄を選択してください。', field: 'fundId' },
    };
  }
  if (typeof monthlyAmount !== 'number' || Number.isNaN(monthlyAmount) || monthlyAmount <= 0) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: '月額購入金額は0より大きい数値で入力してください。',
        field: 'monthlyAmount',
      },
    };
  }
  if (typeof executionDay !== 'number' || Number.isNaN(executionDay)) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: '注文日は1〜28の範囲で入力してください。',
        field: 'executionDay',
      },
    };
  }
  if (executionDay < 1 || executionDay > 28) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: '注文日は1〜28の範囲で入力してください。',
        field: 'executionDay',
      },
    };
  }
  if (!isValidIsoDate(startDate)) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: '開始日はYYYY-MM-DD形式で入力してください。',
        field: 'startDate',
      },
    };
  }
  if (endDate !== null && endDate !== '' && !isValidIsoDate(endDate)) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: '終了日はYYYY-MM-DD形式で入力してください。',
        field: 'endDate',
      },
    };
  }
  if (endDate !== null && endDate !== '' && parseIsoDate(endDate) < parseIsoDate(startDate)) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: '終了日は開始日以降である必要があります。',
        field: 'endDate',
      },
    };
  }
  if (typeof isActive !== 'boolean') {
    return {
      success: false,
      error: {
        type: 'validation',
        message: 'アクティブ設定が不正です。',
        field: 'isActive',
      },
    };
  }

  return {
    success: true,
    value: {
      fundId,
      monthlyAmount,
      executionDay,
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
 * 指定した日付より後の最初の営業日を返す。
 * 営業日が存在しない場合はnullを返す。
 */
function findNextBusinessDay(date: string, businessDates: string[]): string | null {
  for (const businessDate of businessDates) {
    if (businessDate > date) {
      return businessDate;
    }
  }
  return null;
}

/**
 * 指定した日付より前のN営業日前の日付を返す。
 * 営業日が不足している場合はnullを返す。
 */
function subtractBusinessDays(
  date: string,
  businessDays: number,
  businessDates: string[]
): string | null {
  if (businessDays === 0) {
    return businessDates.includes(date) ? date : null;
  }
  let count = 0;
  for (let i = businessDates.length - 1; i >= 0; i -= 1) {
    if (businessDates[i] >= date) {
      continue;
    }
    count += 1;
    if (count === businessDays) {
      return businessDates[i];
    }
  }
  return null;
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

/**
 * 注文日より後の営業日をカウントし、N営業日後の日付を返す。
 * 注文日の翌営業日を1日目としてカウントする。
 * N=0の場合は注文日が営業日カレンダーに存在する時のみ注文日を返す。
 */
function addBusinessDays(
  orderDate: string,
  businessDays: number,
  businessDates: string[]
): string | null {
  if (businessDays === 0) {
    return businessDates.includes(orderDate) ? orderDate : null;
  }
  let count = 0;
  for (const date of businessDates) {
    if (date <= orderDate) {
      continue;
    }
    count += 1;
    if (count === businessDays) {
      return date;
    }
  }
  return null;
}

function isValidIsoDate(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}
