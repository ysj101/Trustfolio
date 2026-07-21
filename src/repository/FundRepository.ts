import { SHEET_NAMES } from '../Config';
import { fail } from '../domain/result';
import type { Fund, Result } from '../domain/types';
import { parseAllRows, parseRequiredStringCell } from './SheetMapping';
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

      // 他リポジトリと同じ parseAllRows（空行スキップ付き）へ統一する（H3 #149）。
      // 従来は本リポジトリだけ手書きループで空行をスキップしておらず、空行が混入すると
      // id 不正エラーになっていた。統一により空行は他リポジトリ同様スキップされる。
      return parseAllRows(rowsResult.value, parseRow);
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
      return sheetRepository.appendRows(SHEET_NAMES.FUNDS, [toRow(fund)]);
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

      return sheetRepository.updateRow(SHEET_NAMES.FUNDS, rowIndex, toRow(fund));
    },
  };

  return repository;
}

/**
 * 銘柄をシートの行配列へ変換する。
 * 登録（appendRows）と更新（updateRow）で同一の列順を用いるため共通化している（H3 #149）。
 */
function toRow(fund: Fund): unknown[] {
  return [
    fund.id,
    fund.name,
    fund.rakutenFundId ?? '',
    fund.settlementBusinessDays ?? '',
    fund.createdAt,
  ];
}

function parseRow(row: unknown[], index: number): Result<Fund> {
  const [id, name, rakutenFundId, settlementBusinessDays, createdAt] = row;

  const idResult = parseRequiredStringCell(id, 'funds', 'id', index);
  if (!idResult.success) {
    return idResult;
  }
  const nameResult = parseRequiredStringCell(name, 'funds', 'name', index);
  if (!nameResult.success) {
    return nameResult;
  }
  const createdAtResult = parseRequiredStringCell(createdAt, 'funds', 'createdAt', index);
  if (!createdAtResult.success) {
    return createdAtResult;
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
      id: idResult.value,
      name: nameResult.value,
      rakutenFundId: parsedRakutenFundId,
      settlementBusinessDays: parsedSettlementBusinessDays.value,
      createdAt: createdAtResult.value,
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
