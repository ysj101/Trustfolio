import { SHEET_DEFINITIONS, SHEET_HEADERS, SHEET_NAMES } from '../Config';
import { fail } from '../domain/result';
import type { Fund, Result } from '../domain/types';
import { parseAllRows, parseOptionalStringCell, parseRequiredStringCell } from './SheetMapping';
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
      const migrationResult = ensureFundsSheetReadyForWrite(sheetRepository);
      if (!migrationResult.success) {
        return migrationResult;
      }
      return sheetRepository.appendRows(SHEET_NAMES.FUNDS, [toRow(fund)]);
    },
    updateFund: (fund: Fund): Result<void> => {
      const migrationResult = ensureFundsSheetReadyForWrite(sheetRepository);
      if (!migrationResult.success) {
        return migrationResult;
      }
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
 * 銘柄シートを書き込み可能な現行列構成へ移行する。
 * 旧5列シートへ7列の新形式行を直接書くと、既存行のcreatedAt列がnavSource列として誤読されるため、
 * 登録・更新の直前に必ずヘッダー整列と列追加を完了させる。
 */
function ensureFundsSheetReadyForWrite(sheetRepository: SheetRepository): Result<void> {
  const definition = SHEET_DEFINITIONS.find((item) => item.name === SHEET_NAMES.FUNDS);
  if (definition === undefined) {
    return fail('unexpected', 'fundsシートの定義が見つかりません。');
  }
  const ensureResult = sheetRepository.ensureSheet(definition);
  if (!ensureResult.success) {
    return ensureResult;
  }
  return { success: true, value: undefined };
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
    fund.navSource ?? '',
    fund.navSourceCode ?? '',
    fund.createdAt,
  ];
}

function parseRow(row: unknown[], index: number): Result<Fund> {
  let id: unknown;
  let name: unknown;
  let rakutenFundId: unknown;
  let settlementBusinessDays: unknown;
  let navSource: unknown;
  let navSourceCode: unknown;
  let createdAt: unknown;

  if (row.length === 5) {
    // ensureHeaderによる列追加はシート初期化またはNAV自動取得時に実行されるため、
    // 移行が走るまでの読み取り互換として既知の旧5列フォーマットを明示的にサポートする。
    // 本分岐は任意レイアウトへの暗黙フォールバックではなく、列順が確定した旧形式だけを対象とする。
    [id, name, rakutenFundId, settlementBusinessDays, createdAt] = row;
    navSource = null;
    navSourceCode = null;
  } else if (row.length === SHEET_HEADERS[SHEET_NAMES.FUNDS].length) {
    [id, name, rakutenFundId, settlementBusinessDays, navSource, navSourceCode, createdAt] = row;
  } else {
    return fail('unexpected', `fundsの${String(index + 2)}行目の列数が不正です。`);
  }

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

  const parsedRakutenFundId = parseOptionalStringCell(
    rakutenFundId,
    'funds',
    'rakutenFundId',
    index
  );
  if (!parsedRakutenFundId.success) {
    return parsedRakutenFundId;
  }
  const parsedSettlementBusinessDays = parseSettlementBusinessDays(settlementBusinessDays, index);
  if (!parsedSettlementBusinessDays.success) {
    return parsedSettlementBusinessDays;
  }
  const parsedNavSource = parseNavSource(navSource, index);
  if (!parsedNavSource.success) {
    return parsedNavSource;
  }
  const parsedNavSourceCode = parseOptionalStringCell(
    navSourceCode,
    'funds',
    'navSourceCode',
    index
  );
  if (!parsedNavSourceCode.success) {
    return parsedNavSourceCode;
  }
  const combinationResult = validateNavSourceCombination(
    parsedRakutenFundId.value,
    parsedNavSource.value,
    parsedNavSourceCode.value,
    index
  );
  if (!combinationResult.success) {
    return combinationResult;
  }

  return {
    success: true,
    value: {
      id: idResult.value,
      name: nameResult.value,
      rakutenFundId: parsedRakutenFundId.value,
      settlementBusinessDays: parsedSettlementBusinessDays.value,
      navSource: parsedNavSource.value,
      navSourceCode: parsedNavSourceCode.value,
      createdAt: createdAtResult.value,
    },
  };
}

/**
 * シートから読み取った基準価額取得元の組み合わせ不変条件を検証する。
 * FundUseCase.validateNavSourceと同じ意味になるよう、孤立コード・コード欠落・取得元の二重指定を拒否する。
 */
function validateNavSourceCombination(
  rakutenFundId: string | null,
  navSource: 'wealthadvisor' | null,
  navSourceCode: string | null,
  index: number
): Result<void> {
  if (navSource === 'wealthadvisor' && rakutenFundId !== null) {
    return fail(
      'unexpected',
      `fundsの${String(index + 2)}行目の基準価額取得元が二重に指定されています。`
    );
  }
  if (navSource === null && navSourceCode !== null) {
    return fail(
      'unexpected',
      `fundsの${String(index + 2)}行目のnavSourceCodeがnavSourceなしで指定されています。`
    );
  }
  if (navSource === 'wealthadvisor' && navSourceCode === null) {
    return fail(
      'unexpected',
      `fundsの${String(index + 2)}行目のnavSourceCodeが設定されていません。`
    );
  }
  return { success: true, value: undefined };
}

/**
 * シート上のNAV取得元種別を解析する。
 * 空セルは未設定を表すnullへ変換し、サポート外の文字列は行番号付きで即座に失敗させる。
 */
function parseNavSource(value: unknown, index: number): Result<'wealthadvisor' | null> {
  const parsed = parseOptionalStringCell(value, 'funds', 'navSource', index);
  if (!parsed.success) {
    return parsed;
  }
  if (parsed.value === null || parsed.value === 'wealthadvisor') {
    return { success: true, value: parsed.value };
  }
  return fail('unexpected', `fundsの${String(index + 2)}行目のnavSourceが不正です。`);
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
