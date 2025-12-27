import { SHEET_NAMES } from '../Config';
import type { AppError, Fund, Result } from '../domain/types';
import type { SheetRepository } from './SheetRepository';

export type FundRepository = {
  listFunds: () => Result<Fund[]>;
  findByName: (name: string) => Result<Fund | null>;
  findById: (id: string) => Result<Fund | null>;
  createFund: (fund: Fund) => Result<void>;
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
      return sheetRepository.appendRows(SHEET_NAMES.FUNDS, [[fund.id, fund.name, fund.createdAt]]);
    }
  };

  return repository;
}

function parseRow(row: unknown[], index: number): Result<Fund> {
  const [id, name, createdAt] = row;

  if (typeof id !== 'string' || id === '') {
    return fail('unexpected', `fundsの${String(index + 2)}行目のidが不正です。`);
  }
  if (typeof name !== 'string' || name === '') {
    return fail('unexpected', `fundsの${String(index + 2)}行目のnameが不正です。`);
  }
  if (typeof createdAt !== 'string' || createdAt === '') {
    return fail('unexpected', `fundsの${String(index + 2)}行目のcreatedAtが不正です。`);
  }

  return { success: true, value: { id, name, createdAt } };
}

function fail<T>(type: AppError['type'], message: string): Result<T> {
  return { success: false, error: { type, message } };
}
