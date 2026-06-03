import { SHEET_NAMES } from '../Config';
import { fail } from '../domain/result';
import type { Nav, Result } from '../domain/types';
import { findRowByPredicate, parseAllRows, parseSheetDate } from './SheetMapping';
import type { SheetRepository } from './SheetRepository';

export type NavRepository = {
  listByFundId: (fundId: string) => Result<Nav[]>;
  findByFundAndDate: (fundId: string, date: string) => Result<Nav | null>;
  findLatestByFundId: (fundId: string) => Result<Nav | null>;
  findLatestByFundIds: (fundIds: string[]) => Result<Map<string, Nav | null>>;
  createNav: (nav: Nav) => Result<void>;
};

/**
 * 基準価額シートへのアクセスを担当する。
 */
export function createNavRepository(sheetRepository: SheetRepository): NavRepository {
  const repository: NavRepository = {
    listByFundId: (fundId: string): Result<Nav[]> => {
      const rowsResult = sheetRepository.readAllRows(SHEET_NAMES.NAV_RECORDS);
      if (!rowsResult.success) {
        return rowsResult;
      }

      const parsedResult = parseAllRows(rowsResult.value, parseRow);
      if (!parsedResult.success) {
        return parsedResult;
      }

      const navs = parsedResult.value.filter((nav) => nav.fundId === fundId);
      navs.sort((a, b) => (a.date < b.date ? 1 : -1));

      return { success: true, value: navs };
    },
    findByFundAndDate: (fundId: string, date: string): Result<Nav | null> => {
      const rowsResult = sheetRepository.readAllRows(SHEET_NAMES.NAV_RECORDS);
      if (!rowsResult.success) {
        return rowsResult;
      }

      const found = findRowByPredicate(
        rowsResult.value,
        parseRow,
        (nav) => nav.fundId === fundId && nav.date === date
      );
      if (!found.success) {
        return found;
      }

      return { success: true, value: found.value?.entity ?? null };
    },
    findLatestByFundId: (fundId: string): Result<Nav | null> => {
      const listResult = repository.listByFundId(fundId);
      if (!listResult.success) {
        return listResult;
      }
      const latest = listResult.value[0] ?? null;
      return { success: true, value: latest };
    },
    findLatestByFundIds: (fundIds: string[]): Result<Map<string, Nav | null>> => {
      // NAV_RECORDSシートを1回だけ読み込む
      const rowsResult = sheetRepository.readAllRows(SHEET_NAMES.NAV_RECORDS);
      if (!rowsResult.success) {
        return rowsResult;
      }

      const parsedResult = parseAllRows(rowsResult.value, parseRow);
      if (!parsedResult.success) {
        return parsedResult;
      }

      // 各ファンドIDに対する最新NAVを保持するMap
      const latestNavMap = new Map<string, Nav | null>();

      // fundIdsを初期化（NAVが存在しないファンドにはnullを設定）
      for (const fundId of fundIds) {
        latestNavMap.set(fundId, null);
      }

      // 各ファンドの最新NAVを特定
      for (const nav of parsedResult.value) {
        // 対象のファンドIDでない場合はスキップ
        if (!fundIds.includes(nav.fundId)) {
          continue;
        }

        // 既存の最新NAVと比較して、より新しい日付のNAVなら更新
        const currentLatest = latestNavMap.get(nav.fundId);
        if (
          currentLatest === null ||
          currentLatest === undefined ||
          nav.date > currentLatest.date
        ) {
          latestNavMap.set(nav.fundId, nav);
        }
      }

      return { success: true, value: latestNavMap };
    },
    createNav: (nav: Nav): Result<void> => {
      return sheetRepository.appendRows(SHEET_NAMES.NAV_RECORDS, [
        [nav.fundId, nav.date, nav.value, nav.createdAt],
      ]);
    },
  };

  return repository;
}

function parseRow(row: unknown[], index: number): Result<Nav> {
  const [fundId, date, value, createdAt] = row;

  if (typeof fundId !== 'string' || fundId === '') {
    return fail('unexpected', `navsの${String(index + 2)}行目のfundIdが不正です。`);
  }

  // dateはスプレッドシートからDateオブジェクトとして返される可能性があるため、文字列に変換
  const dateResult = parseSheetDate(date, {
    sheetLabel: 'navs',
    fieldName: 'date',
    index,
    trim: true,
    quoteInvalidValue: true,
  });
  if (!dateResult.success) {
    return dateResult;
  }
  const dateStr = dateResult.value;

  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fail('unexpected', `navsの${String(index + 2)}行目のvalueが不正です。`);
  }
  if (typeof createdAt !== 'string' || createdAt === '') {
    return fail('unexpected', `navsの${String(index + 2)}行目のcreatedAtが不正です。`);
  }

  return { success: true, value: { fundId, date: dateStr, value, createdAt } };
}
