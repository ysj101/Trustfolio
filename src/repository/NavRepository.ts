import { SHEET_NAMES } from '../Config';
import type { Nav, Result } from '../domain/types';
import {
  findRowByPredicate,
  parseAllRows,
  parseNumberCell,
  parseRequiredStringCell,
  parseSheetDate,
} from './SheetMapping';
import type { SheetRepository } from './SheetRepository';

export type NavRepository = {
  listByFundId: (fundId: string) => Result<Nav[]>;
  findByFundAndDate: (fundId: string, date: string) => Result<Nav | null>;
  findLatestByFundId: (fundId: string) => Result<Nav | null>;
  /**
   * 指定した全銘柄の最新基準価額を一括取得する。
   *
   * 渡したfundIdsの全件をキーとして含むMapを返し、最新基準価額が存在しない銘柄は値をnullにする。
   * 呼び出し元が基準価額なしとキー欠落による契約違反を区別できるよう、キーの欠落は発生させない。
   *
   * @param fundIds 最新基準価額を取得する銘柄ID一覧
   * @returns 銘柄IDごとの最新基準価額、または取得失敗
   */
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
      const targetFundIds = new Set(fundIds);

      // fundIdsを初期化（NAVが存在しないファンドにはnullを設定）
      for (const fundId of fundIds) {
        latestNavMap.set(fundId, null);
      }

      // 各ファンドの最新NAVを特定
      for (const nav of parsedResult.value) {
        // 対象のファンドIDでない場合はスキップ
        if (!targetFundIds.has(nav.fundId)) {
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

  const fundIdResult = parseRequiredStringCell(fundId, 'navs', 'fundId', index);
  if (!fundIdResult.success) {
    return fundIdResult;
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

  const valueResult = parseNumberCell(value, 'navs', 'value', index);
  if (!valueResult.success) {
    return valueResult;
  }
  const createdAtResult = parseRequiredStringCell(createdAt, 'navs', 'createdAt', index);
  if (!createdAtResult.success) {
    return createdAtResult;
  }

  return {
    success: true,
    value: {
      fundId: fundIdResult.value,
      date: dateStr,
      value: valueResult.value,
      createdAt: createdAtResult.value,
    },
  };
}
