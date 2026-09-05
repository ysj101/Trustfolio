import { SHEET_DEFINITIONS, SHEET_HEADERS, SHEET_NAMES } from '../Config';
import { fail } from '../domain/result';
import { ASSET_CLASSES, type AssetClass, type Fund, type Result } from '../domain/types';
import {
  parseAllRows,
  createColumnIndex,
  mapRowByHeaders,
  parseOptionalEnumCell,
  parseOptionalStringCell,
  parseRequiredStringCell,
} from './SheetMapping';
import type { SheetRepository } from './SheetRepository';

export type FundRepository = {
  listFunds: () => Result<Fund[]>;
  findByName: (name: string) => Result<Fund | null>;
  findById: (id: string) => Result<Fund | null>;
  createFund: (fund: Fund) => Result<void>;
  updateFund: (fund: Fund) => Result<void>;
  /**
   * 指定銘柄の資産クラスを更新する。
   * assetClassセルだけを書き換え、銘柄名や取得元などの他セルは変更しない。
   */
  updateAssetClass: (id: string, assetClass: AssetClass) => Result<void>;
};

type FundColumnName = (typeof SHEET_HEADERS)[typeof SHEET_NAMES.FUNDS][number];

type FundRowCells = Record<FundColumnName, unknown>;

/**
 * 読み取り時に必須とする銘柄列。
 * 旧5列より古い、または破損した構成（id・name・createdAtだけの構成など）は受理しない。
 */
const REQUIRED_FUND_COLUMNS = [
  'id',
  'name',
  'rakutenFundId',
  'settlementBusinessDays',
  'createdAt',
] as const satisfies readonly FundColumnName[];

/**
 * 読み取り時に省略を許可する銘柄列。
 * navSource・navSourceCode・assetClassは、各列の導入前に作成された
 * 旧5列・旧7列シートでは未設定を表すnullとして扱う。
 */
const OPTIONAL_FUND_COLUMNS = [
  'navSource',
  'navSourceCode',
  'assetClass',
] as const satisfies readonly FundColumnName[];

/**
 * 投資信託シートへのアクセスを担当する。
 */
export function createFundRepository(sheetRepository: SheetRepository): FundRepository {
  const repository: FundRepository = {
    listFunds: (): Result<Fund[]> => {
      const sheetResult = sheetRepository.readSheetWithHeader(SHEET_NAMES.FUNDS);
      if (!sheetResult.success) {
        return sheetResult;
      }
      const columnIndexResult = createColumnIndex(
        sheetResult.value.headers,
        'funds',
        REQUIRED_FUND_COLUMNS
      );
      if (!columnIndexResult.success) {
        return columnIndexResult;
      }
      const hasNavSource = columnIndexResult.value.has('navSource');
      const hasNavSourceCode = columnIndexResult.value.has('navSourceCode');
      if (hasNavSource !== hasNavSourceCode) {
        return fail(
          'unexpected',
          'fundsシートのヘッダーのnavSourceとnavSourceCodeは両方存在するか両方欠落している必要があります。'
        );
      }
      // 他リポジトリと同じ parseAllRows（空行スキップ付き）へ統一する（H3 #149）。
      // 従来は本リポジトリだけ手書きループで空行をスキップしておらず、空行が混入すると
      // id 不正エラーになっていた。統一により空行は他リポジトリ同様スキップされる。
      return parseAllRows(sheetResult.value.rows, (row, index) => {
        const cellsResult = mapRowByHeaders(
          row,
          columnIndexResult.value,
          REQUIRED_FUND_COLUMNS,
          OPTIONAL_FUND_COLUMNS,
          'funds',
          index
        );
        if (!cellsResult.success) {
          return cellsResult;
        }
        return parseRow(cellsResult.value, index);
      });
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
    updateAssetClass: (id: string, assetClass: AssetClass): Result<void> => {
      const migrationResult = ensureFundsSheetReadyForWrite(sheetRepository);
      if (!migrationResult.success) {
        return migrationResult;
      }
      const rowsResult = sheetRepository.readAllRows(SHEET_NAMES.FUNDS);
      if (!rowsResult.success) {
        return rowsResult;
      }

      const rowIndex = rowsResult.value.findIndex((row) => row[0] === id);
      if (rowIndex === -1) {
        return fail('not_found', `対象の銘柄が見つかりません: id=${id}`);
      }
      const assetClassColumnIndex = SHEET_HEADERS[SHEET_NAMES.FUNDS].indexOf('assetClass');
      if (assetClassColumnIndex === -1) {
        return fail('unexpected', 'fundsシートの定義にassetClass列がありません。');
      }

      return sheetRepository.updateCell(
        SHEET_NAMES.FUNDS,
        rowIndex,
        assetClassColumnIndex,
        assetClass
      );
    },
  };

  return repository;
}

/**
 * 銘柄シートを書き込み可能な現行列構成へ移行する。
 * 読み取りはヘッダー名から列を対応付けるため移行せず、シートを変更しない。
 * 銘柄全体の登録・更新とassetClassセル更新は現行列を前提とするため、
 * 書き込み直前だけヘッダー整列と列追加を実行する。
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
    fund.assetClass ?? '',
    fund.createdAt,
  ];
}

function parseRow(cells: FundRowCells, index: number): Result<Fund> {
  const {
    id,
    name,
    rakutenFundId,
    settlementBusinessDays,
    navSource,
    navSourceCode,
    assetClass,
    createdAt,
  } = cells;

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
  const parsedNavSource = parseOptionalEnumCell(
    navSource,
    ['wealthadvisor'],
    'funds',
    'navSource',
    index
  );
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
  const parsedAssetClass = parseOptionalEnumCell(
    assetClass,
    ASSET_CLASSES,
    'funds',
    'assetClass',
    index
  );
  if (!parsedAssetClass.success) {
    return parsedAssetClass;
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
      assetClass: parsedAssetClass.value,
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
