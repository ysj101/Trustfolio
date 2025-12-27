import { SHEET_NAMES } from '../Config';
import type { AppError, Nav, Result } from '../domain/types';
import type { SheetRepository } from './SheetRepository';

export type NavRepository = {
  listByFundId: (fundId: string) => Result<Nav[]>;
  findByFundAndDate: (fundId: string, date: string) => Result<Nav | null>;
  findLatestByFundId: (fundId: string) => Result<Nav | null>;
  createNav: (nav: Nav) => Result<void>;
};

/**
 * 基準価額シートへのアクセスを担当する。
 */
export function createNavRepository(sheetRepository: SheetRepository): NavRepository {
  const repository: NavRepository = {
    listByFundId: (fundId: string): Result<Nav[]> => {
      const rowsResult = sheetRepository.readAllRows(SHEET_NAMES.NAVS);
      if (!rowsResult.success) {
        return rowsResult;
      }

      const navs: Nav[] = [];
      for (const [index, row] of rowsResult.value.entries()) {
        const parsed = parseRow(row, index);
        if (!parsed.success) {
          return parsed;
        }
        if (parsed.value.fundId === fundId) {
          navs.push(parsed.value);
        }
      }

      navs.sort((a, b) => (a.date < b.date ? 1 : -1));

      return { success: true, value: navs };
    },
    findByFundAndDate: (fundId: string, date: string): Result<Nav | null> => {
      const rowsResult = sheetRepository.readAllRows(SHEET_NAMES.NAVS);
      if (!rowsResult.success) {
        return rowsResult;
      }

      for (let index = 0; index < rowsResult.value.length; index += 1) {
        const parsed = parseRow(rowsResult.value[index], index);
        if (!parsed.success) {
          return parsed;
        }
        if (parsed.value.fundId === fundId && parsed.value.date === date) {
          return { success: true, value: parsed.value };
        }
      }

      return { success: true, value: null };
    },
    findLatestByFundId: (fundId: string): Result<Nav | null> => {
      const listResult = repository.listByFundId(fundId);
      if (!listResult.success) {
        return listResult;
      }
      const latest = listResult.value[0] ?? null;
      return { success: true, value: latest };
    },
    createNav: (nav: Nav): Result<void> => {
      return sheetRepository.appendRows(SHEET_NAMES.NAVS, [
        [nav.id, nav.fundId, nav.date, nav.value, nav.createdAt]
      ]);
    }
  };

  return repository;
}

function parseRow(row: unknown[], index: number): Result<Nav> {
  const [id, fundId, date, value, createdAt] = row;

  if (typeof id !== 'string' || id === '') {
    return fail('unexpected', `navsの${String(index + 2)}行目のidが不正です。`);
  }
  if (typeof fundId !== 'string' || fundId === '') {
    return fail('unexpected', `navsの${String(index + 2)}行目のfundIdが不正です。`);
  }
  if (typeof date !== 'string' || date === '') {
    return fail('unexpected', `navsの${String(index + 2)}行目のdateが不正です。`);
  }
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fail('unexpected', `navsの${String(index + 2)}行目のvalueが不正です。`);
  }
  if (typeof createdAt !== 'string' || createdAt === '') {
    return fail('unexpected', `navsの${String(index + 2)}行目のcreatedAtが不正です。`);
  }

  return { success: true, value: { id, fundId, date, value, createdAt } };
}

function fail<T>(type: AppError['type'], message: string): Result<T> {
  return { success: false, error: { type, message } };
}
