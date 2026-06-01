import { SHEET_NAMES } from '../Config';
import { fail } from '../domain/result';
import type { Fund, Result } from '../domain/types';
import type { SheetRepository } from './SheetRepository';

export type FundRepository = {
  listFunds: () => Result<Fund[]>;
  findByName: (name: string) => Result<Fund | null>;
  findById: (id: string) => Result<Fund | null>;
  createFund: (fund: Fund) => Result<void>;
  updateFund: (fund: Fund) => Result<void>;
};

/**
 * 投資信託シートへのアクセスを担当する。
 */
export function createFundRepository(sheetRepository: SheetRepository): FundRepository {
  const repository: FundRepository = {
    listFunds: (): Result<Fund[]> => {
      const rowsResult = sheetRepository.readAllRows(SHEET_NAMES.FUNDS);
      if (!rowsResult.success) {
        return rowsResult;
      }

      const funds: Fund[] = [];
      for (const [index, row] of rowsResult.value.entries()) {
        const parsed = parseRow(row, index);
        if (!parsed.success) {
          return parsed;
        }
        funds.push(parsed.value);
      }

      return { success: true, value: funds };
    },
    findByName: (name: string): Result<Fund | null> => {
      const listResult = repository.listFunds();
      if (!listResult.success) {
        return listResult;
      }

      const fund = listResult.value.find((item) => item.name === name) ?? null;
      return { success: true, value: fund };
    },
    findById: (id: string): Result<Fund | null> => {
      const listResult = repository.listFunds();
      if (!listResult.success) {
        return listResult;
      }

      const fund = listResult.value.find((item) => item.id === id) ?? null;
      return { success: true, value: fund };
    },
    createFund: (fund: Fund): Result<void> => {
      return sheetRepository.appendRows(SHEET_NAMES.FUNDS, [
        [
          fund.id,
          fund.name,
          fund.rakutenFundId ?? '',
          fund.settlementBusinessDays ?? '',
          fund.createdAt,
        ],
      ]);
    },
    updateFund: (fund: Fund): Result<void> => {
      const rowsResult = sheetRepository.readAllRows(SHEET_NAMES.FUNDS);
      if (!rowsResult.success) {
        return rowsResult;
      }

      const rowIndex = rowsResult.value.findIndex((row) => row[0] === fund.id);
      if (rowIndex === -1) {
        return fail('not_found', `対象の銘柄が見つかりません: id=${fund.id}`);
      }

      return sheetRepository.updateRow(SHEET_NAMES.FUNDS, rowIndex, [
        fund.id,
        fund.name,
        fund.rakutenFundId ?? '',
        fund.settlementBusinessDays ?? '',
        fund.createdAt,
      ]);
    },
  };

  return repository;
}

function parseRow(row: unknown[], index: number): Result<Fund> {
  const [id, name, rakutenFundId, settlementBusinessDays, createdAt] = row;

  if (typeof id !== 'string' || id === '') {
    return fail('unexpected', `fundsの${String(index + 2)}行目のidが不正です。`);
  }
  if (typeof name !== 'string' || name === '') {
    return fail('unexpected', `fundsの${String(index + 2)}行目のnameが不正です。`);
  }
  if (typeof createdAt !== 'string' || createdAt === '') {
    return fail('unexpected', `fundsの${String(index + 2)}行目のcreatedAtが不正です。`);
  }

  // rakutenFundIdは空文字列の場合はnullとして扱う
  const parsedRakutenFundId =
    typeof rakutenFundId === 'string' && rakutenFundId !== '' ? rakutenFundId : null;
  const parsedSettlementBusinessDays = parseSettlementBusinessDays(settlementBusinessDays, index);
  if (!parsedSettlementBusinessDays.success) {
    return parsedSettlementBusinessDays;
  }

  return {
    success: true,
    value: {
      id,
      name,
      rakutenFundId: parsedRakutenFundId,
      settlementBusinessDays: parsedSettlementBusinessDays.value,
      createdAt,
    },
  };
}

function parseSettlementBusinessDays(value: unknown, index: number): Result<number | null> {
  if (value === '' || value === null || value === undefined) {
    return { success: true, value: null };
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      return fail(
        'unexpected',
        `fundsの${String(index + 2)}行目のsettlementBusinessDaysが不正です。`
      );
    }
    return { success: true, value };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return { success: true, value: null };
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return fail(
        'unexpected',
        `fundsの${String(index + 2)}行目のsettlementBusinessDaysが不正です。`
      );
    }
    return { success: true, value: parsed };
  }
  return fail('unexpected', `fundsの${String(index + 2)}行目のsettlementBusinessDaysが不正です。`);
}
