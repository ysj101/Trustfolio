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
        if (!Number.isInteger(fund.settlementBusinessDays) || fund.settlementBusinessDays < 1) {
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

        const settlementMatch = findSettlementMatch(
          recurring,
          targetDate,
          fund.settlementBusinessDays,
          navCalendarResult.value.businessDates
        );
        if (!settlementMatch) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'NOT_TARGET_DATE' });
          continue;
        }

        const idempotencyKey = `${recurring.id}_${targetDate}`;
        const existingResult = transactionRepository.findByIdempotencyKey(idempotencyKey);
        if (!existingResult.success) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'NO_NAV' });
          continue;
        }
        if (existingResult.value) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'ALREADY_EXECUTED' });
          continue;
        }

        const navValue = navCalendarResult.value.byDate.get(targetDate);
        if (!navValue) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'NO_NAV' });
          continue;
        }

        const unitsResult = calculateUnits(recurring.monthlyAmount, 0, navValue.value);
        if (!unitsResult.success) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'NO_NAV' });
          continue;
        }

        const transaction: Transaction = {
          id: generateUlid(),
          fundId: recurring.fundId,
          type: 'RECURRING_PURCHASE',
          date: targetDate,
          amount: recurring.monthlyAmount,
          fee: 0,
          navValue: navValue.value,
          units: unitsResult.value,
          recurringPurchaseId: recurring.id,
          idempotencyKey,
          createdAt: new Date().toISOString(),
        };

        const createResult = transactionRepository.createTransaction(transaction);
        if (!createResult.success) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'NO_NAV' });
          continue;
        }

        executed.push(transaction);
      }

      return { success: true, value: { executed, skipped } };
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
 * 注文日と約定日を対応付け、対象日の約定に一致するかを判定する。
 */
function findSettlementMatch(
  recurring: RecurringPurchase,
  targetDate: string,
  settlementBusinessDays: number,
  businessDates: string[]
): { orderDate: string; settlementDate: string } | null {
  const candidateOrderDates = buildCandidateOrderDates(
    targetDate,
    recurring.executionDay,
    settlementBusinessDays
  );

  for (const orderDate of candidateOrderDates) {
    if (!isWithinRecurringPeriod(recurring, orderDate)) {
      continue;
    }
    const settlementDate = addBusinessDays(orderDate, settlementBusinessDays, businessDates);
    if (settlementDate === null) {
      continue;
    }
    if (settlementDate === targetDate) {
      return { orderDate, settlementDate };
    }
  }

  return null;
}

/**
 * 対象日の約定に一致しうる注文日候補を月単位で列挙する。
 */
function buildCandidateOrderDates(
  targetDate: string,
  executionDay: number,
  settlementBusinessDays: number
): string[] {
  const [yearText, monthText] = targetDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const monthsBack = Math.max(1, Math.ceil(settlementBusinessDays / 20) + 1);
  const candidates: string[] = [];

  for (let offset = 0; offset <= monthsBack; offset += 1) {
    const shifted = shiftMonth(year, month, -offset);
    candidates.push(formatIsoDate(shifted.year, shifted.month, executionDay));
  }

  return candidates;
}

/**
 * 指定した年月から月オフセット分だけ移動する。
 */
function shiftMonth(year: number, month: number, offset: number): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + offset;
  const nextYear = Math.floor(zeroBased / 12);
  const nextMonth = ((zeroBased % 12) + 12) % 12;
  return { year: nextYear, month: nextMonth + 1 };
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
 */
function addBusinessDays(
  orderDate: string,
  businessDays: number,
  businessDates: string[]
): string | null {
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
