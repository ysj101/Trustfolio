import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createFundRepository } from '../../src/repository/FundRepository';
import { openSheetRepository } from '../../src/repository/SheetRepository';
import { SHEET_HEADERS, SHEET_NAMES } from '../../src/Config';
import { createFakeSpreadsheet, createInMemorySheetRepository, headerRow } from '../fakes';

describe('FundRepository', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('_fundsシートが存在しない場合は読み取りに失敗する', () => {
    // 前提: スプレッドシートに_fundsシートが存在しない。
    // 事前条件: listFundsは読み取り時にシートを新規作成しない。
    // 検証: readSheetWithHeader由来の「シートが存在しません」エラーをそのまま返す。
    expect(createFundRepository(createInMemorySheetRepository()).listFunds()).toEqual({
      success: false,
      error: {
        type: 'unexpected',
        message: 'シートが存在しません: _funds',
      },
    });
  });

  it('文字列のsettlementBusinessDaysを数値に変換する', () => {
    // 前提: settlementBusinessDaysが文字列で保存されている。
    // 事前条件: 現行8列のfundsシートに1件の銘柄がある。
    // 検証: settlementBusinessDaysは数値、assetClassは未設定として取得できる。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        headerRow(SHEET_NAMES.FUNDS),
        ['fund-1', '日本株ファンド', 'ABCD1234EFGH', '3', '', '', '', '2024-01-01T00:00:00.000Z'],
      ],
    });
    const repository = createFundRepository(sheetRepository);
    const result = repository.listFunds();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value[0]?.settlementBusinessDays).toBe(3);
      expect(result.value[0]?.assetClass).toBeNull();
    }
  });

  it('空行はスキップして残りの銘柄を返す（他リポジトリと同じ parseAllRows へ統一）', () => {
    // 前提: fundsシートのデータ行の間に空行が混入している
    // 事前条件: 空行を挟んで2件の銘柄データがある
    // 検証: 空行はエラーにならずスキップされ、2件の銘柄が取得できる
    //   （H3 #149 以前は本リポジトリだけ空行をスキップせず id 不正エラーになっていた）
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        headerRow(SHEET_NAMES.FUNDS),
        ['fund-1', '日本株ファンド', '', '', '', '', '', '2024-01-01T00:00:00.000Z'],
        ['', '', '', '', '', '', '', ''],
        ['fund-2', '先進国株ファンド', '', '', '', '', '', '2024-01-02T00:00:00.000Z'],
      ],
    });
    const repository = createFundRepository(sheetRepository);
    const result = repository.listFunds();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.map((fund) => fund.id)).toEqual(['fund-1', 'fund-2']);
    }
  });

  it('不正なsettlementBusinessDaysの場合はエラーになる', () => {
    // 前提: settlementBusinessDaysが不正な文字列である
    // 事前条件: fundsシートに不正データがある
    // 検証: unexpectedエラーが返る
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        headerRow(SHEET_NAMES.FUNDS),
        [
          'fund-1',
          '日本株ファンド',
          'ABCD1234EFGH',
          '不正値',
          '',
          '',
          '',
          '2024-01-01T00:00:00.000Z',
        ],
      ],
    });
    const repository = createFundRepository(sheetRepository);
    const result = repository.listFunds();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
    }
  });

  it('更新対象が存在しない場合はnot_foundになる', () => {
    // 前提: 更新対象のIDが存在しない
    // 事前条件: fundsシートにデータがない
    // 検証: not_foundエラーが返る
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [headerRow(SHEET_NAMES.FUNDS)],
    });
    const repository = createFundRepository(sheetRepository);
    const result = repository.updateFund({
      id: 'fund-1',
      name: '日本株ファンド',
      rakutenFundId: null,
      settlementBusinessDays: null,
      navSource: null,
      navSourceCode: null,
      assetClass: 'equity',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('not_found');
    }
  });

  it('旧7列シートを移行して対象銘柄のassetClassセルだけを更新する', () => {
    // 前提: _fundsシートには値入りの旧7列行が2件存在する。
    // 事前条件: 2件目の銘柄へupdateAssetClassでgoldを設定する。
    // 検証: 8列移行後は対象assetClassセルだけが変わり、対象行の他セルと他行の値は不変である。
    const fakeSpreadsheet = createFakeSpreadsheet([
      {
        name: SHEET_NAMES.FUNDS,
        rows: [
          [
            'id',
            'name',
            'rakutenFundId',
            'settlementBusinessDays',
            'navSource',
            'navSourceCode',
            'createdAt',
          ],
          [
            'fund-equity',
            '国内株式ファンド',
            'ABCD1234EFGH',
            '1',
            '',
            '',
            '2026-09-01T00:00:00.000Z',
          ],
          [
            'fund-gold',
            ' ＳＢＩ・ゴールドファンド ',
            '',
            '02',
            'wealthadvisor',
            ' sbi_am/sa_202306080A ',
            '2026-09-02T00:00:00.000Z',
          ],
        ],
      },
    ]);
    vi.spyOn(globalThis.SpreadsheetApp, 'getActiveSpreadsheet').mockReturnValue(
      fakeSpreadsheet as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet
    );
    const sheetRepositoryResult = openSheetRepository();
    expect(sheetRepositoryResult.success).toBe(true);
    if (!sheetRepositoryResult.success) {
      return;
    }

    const result = createFundRepository(sheetRepositoryResult.value).updateAssetClass(
      'fund-gold',
      'gold'
    );

    expect(result).toEqual({ success: true, value: undefined });
    expect(fakeSpreadsheet.getSheetByName(SHEET_NAMES.FUNDS)?.getData()).toEqual([
      Array.from(SHEET_HEADERS[SHEET_NAMES.FUNDS]),
      [
        'fund-equity',
        '国内株式ファンド',
        'ABCD1234EFGH',
        '1',
        '',
        '',
        '',
        '2026-09-01T00:00:00.000Z',
      ],
      [
        'fund-gold',
        ' ＳＢＩ・ゴールドファンド ',
        '',
        '02',
        'wealthadvisor',
        ' sbi_am/sa_202306080A ',
        'gold',
        '2026-09-02T00:00:00.000Z',
      ],
    ]);
  });

  it('assetClass更新対象のidが存在しない場合はnot_foundになる', () => {
    // 前提: _fundsシートには対象外の銘柄だけが存在する。
    // 事前条件: 存在しないidをupdateAssetClassへ指定する。
    // 検証: updateFundと同じ文言のnot_foundエラーを返す。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        headerRow(SHEET_NAMES.FUNDS),
        ['fund-existing', '国内株式ファンド', '', '2', '', '', '', '2026-09-01T00:00:00.000Z'],
      ],
    });

    expect(createFundRepository(sheetRepository).updateAssetClass('fund-missing', 'gold')).toEqual({
      success: false,
      error: {
        type: 'not_found',
        message: '対象の銘柄が見つかりません: id=fund-missing',
      },
    });
  });

  it('wealthadvisorの新列を読み書きする', () => {
    // 前提: SBI証券限定販売ファンドにWealth Advisor取得元が設定されている。
    // 事前条件: 空のfundsシートへファンドを追加する。
    // 検証: navSourceとnavSourceCodeが新しい列順で保存され、同じ値で読み戻せる。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [headerRow(SHEET_NAMES.FUNDS)],
    });
    const repository = createFundRepository(sheetRepository);
    const createResult = repository.createFund({
      id: 'fund-sbi-gold',
      name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）',
      rakutenFundId: null,
      settlementBusinessDays: 2,
      navSource: 'wealthadvisor',
      navSourceCode: 'sbi_am/sa_202306080A',
      assetClass: 'gold',
      createdAt: '2026-09-02T00:00:00.000Z',
    });
    expect(createResult.success).toBe(true);
    const result = repository.listFunds();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value[0]?.navSource).toBe('wealthadvisor');
      expect(result.value[0]?.navSourceCode).toBe('sbi_am/sa_202306080A');
    }
  });

  it('未対応のnavSourceが保存されている場合は行番号付きunexpectedエラーになる', () => {
    // 前提: fundsシートの2行目に未対応の取得元文字列が保存されている。
    // 事前条件: navSource以外の必須列は正しい。
    // 検証: 2行目を示すunexpectedエラーでfail fastする。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        headerRow(SHEET_NAMES.FUNDS),
        ['fund-1', '国内株式ファンド', '', '', 'unknown', '', '', '2026-09-02T00:00:00.000Z'],
      ],
    });
    const result = createFundRepository(sheetRepository).listFunds();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
      expect(result.error.message).toContain('2行目');
    }
  });

  it('旧5列ヘッダーを変更せずに読み取る', () => {
    // 前提: _fundsシートはid、name、rakutenFundId、settlementBusinessDays、createdAtの旧5列である。
    // 事前条件: 既存銘柄には楽天ファンドIDと作成日時が保存されている。
    // 検証: 既存値を正しい列から読み、旧形式にない3項目をnullとして返す。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        ['id', 'name', 'rakutenFundId', 'settlementBusinessDays', 'createdAt'],
        [
          'fund-legacy-five',
          '全世界株式インデックスファンド',
          ' ABCD1234EFGH ',
          '2',
          '2024-01-01T00:00:00.000Z',
        ],
      ],
    });

    expect(createFundRepository(sheetRepository).listFunds()).toEqual({
      success: true,
      value: [
        {
          id: 'fund-legacy-five',
          name: '全世界株式インデックスファンド',
          rakutenFundId: 'ABCD1234EFGH',
          settlementBusinessDays: 2,
          navSource: null,
          navSourceCode: null,
          assetClass: null,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  it('値入り旧7列ヘッダーを変更せずに読み取る', () => {
    // 前提: _fundsシートはassetClass導入前の旧7列である。
    // 事前条件: 既存銘柄にはWealth Advisor取得元と作成日時が保存されている。
    // 検証: navSource、navSourceCode、createdAtをヘッダー名で読み、assetClassをnullとして返す。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        [
          'id',
          'name',
          'rakutenFundId',
          'settlementBusinessDays',
          'navSource',
          'navSourceCode',
          'createdAt',
        ],
        [
          'fund-legacy-seven',
          'ＳＢＩ・iシェアーズ・ゴールドファンド',
          '',
          '2',
          'wealthadvisor',
          'sbi_am/sa_202306080A',
          '2026-08-01T00:00:00.000Z',
        ],
      ],
    });

    const result = createFundRepository(sheetRepository).listFunds();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value[0]).toEqual({
        id: 'fund-legacy-seven',
        name: 'ＳＢＩ・iシェアーズ・ゴールドファンド',
        rakutenFundId: null,
        settlementBusinessDays: 2,
        navSource: 'wealthadvisor',
        navSourceCode: 'sbi_am/sa_202306080A',
        assetClass: null,
        createdAt: '2026-08-01T00:00:00.000Z',
      });
    }
  });

  it('旧5列シートへ銘柄を追加する前に列移行し、既存行と新規行を読み取る', () => {
    // 前提: _fundsシートには旧5列ヘッダーと既存の国内株式ファンドが保存されている。
    // 事前条件: Wealth Advisor取得元を持つ新規ファンドをcreateFundで追加する。
    // 検証: 書き込み前に現行8列へ移行され、既存行と新規行の両方を正常に読み取れる。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        ['id', 'name', 'rakutenFundId', 'settlementBusinessDays', 'createdAt'],
        [
          'fund-legacy',
          '国内株式インデックスファンド',
          'ABCD1234EFGH',
          '2',
          '2024-01-01T00:00:00.000Z',
        ],
      ],
    });
    const repository = createFundRepository(sheetRepository);
    const createResult = repository.createFund({
      id: 'fund-sbi-gold',
      name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）',
      rakutenFundId: null,
      settlementBusinessDays: 2,
      navSource: 'wealthadvisor',
      navSourceCode: 'sbi_am/sa_202306080A',
      assetClass: 'gold',
      createdAt: '2026-09-02T00:00:00.000Z',
    });
    expect(createResult.success).toBe(true);

    const result = repository.listFunds();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]).toEqual({
        id: 'fund-legacy',
        name: '国内株式インデックスファンド',
        rakutenFundId: 'ABCD1234EFGH',
        settlementBusinessDays: 2,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      expect(result.value[1]?.navSource).toBe('wealthadvisor');
      expect(result.value[1]?.navSourceCode).toBe('sbi_am/sa_202306080A');
    }
  });

  it('実SheetRepository経路で旧5列を移行してから銘柄を追加する', () => {
    // 前提: 本番と同じSheetRepositoryが、旧5列ヘッダーと既存ファンドを持つシートへ接続する。
    // 事前条件: createFundが書き込み前にensureSheetを実行する。
    // 検証: ヘッダーは8列になり、既存createdAtは第8列、追加3列は空文字として保持される。
    // 検証: listFundsは既存行の追加3項目をnullとして読み、新規行も正常に読み取る。
    const fakeSpreadsheet = createFakeSpreadsheet([
      {
        name: SHEET_NAMES.FUNDS,
        rows: [
          ['id', 'name', 'rakutenFundId', 'settlementBusinessDays', 'createdAt'],
          [
            'fund-legacy',
            '国内株式インデックスファンド',
            'ABCD1234EFGH',
            '2',
            '2024-01-01T00:00:00.000Z',
          ],
        ],
      },
    ]);
    vi.spyOn(globalThis.SpreadsheetApp, 'getActiveSpreadsheet').mockReturnValue(
      fakeSpreadsheet as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet
    );
    const sheetRepositoryResult = openSheetRepository();
    expect(sheetRepositoryResult.success).toBe(true);
    if (!sheetRepositoryResult.success) {
      return;
    }
    const repository = createFundRepository(sheetRepositoryResult.value);
    const createResult = repository.createFund({
      id: 'fund-sbi-gold',
      name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）',
      rakutenFundId: null,
      settlementBusinessDays: 2,
      navSource: 'wealthadvisor',
      navSourceCode: 'sbi_am/sa_202306080A',
      assetClass: 'gold',
      createdAt: '2026-09-02T00:00:00.000Z',
    });
    expect(createResult.success).toBe(true);

    const sheetData = fakeSpreadsheet.getSheetByName(SHEET_NAMES.FUNDS)?.getData();
    expect(sheetData?.[0]).toEqual(Array.from(SHEET_HEADERS[SHEET_NAMES.FUNDS]));
    expect(sheetData?.[1]?.[4]).toBe('');
    expect(sheetData?.[1]?.[5]).toBe('');
    expect(sheetData?.[1]?.[6]).toBe('');
    expect(sheetData?.[1]?.[7]).toBe('2024-01-01T00:00:00.000Z');
    expect(sheetData?.[2]).toEqual([
      'fund-sbi-gold',
      'ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）',
      '',
      2,
      'wealthadvisor',
      'sbi_am/sa_202306080A',
      'gold',
      '2026-09-02T00:00:00.000Z',
    ]);

    const listResult = repository.listFunds();
    expect(listResult.success).toBe(true);
    if (listResult.success) {
      expect(listResult.value).toHaveLength(2);
      expect(listResult.value[0]?.navSource).toBeNull();
      expect(listResult.value[0]?.navSourceCode).toBeNull();
      expect(listResult.value[0]?.assetClass).toBeNull();
      expect(listResult.value[0]?.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(listResult.value[1]?.navSource).toBe('wealthadvisor');
    }
  });

  it('実SheetRepository経路で旧5列を移行してから対象銘柄を更新する', () => {
    // 前提: 本番と同じSheetRepositoryが、旧5列ヘッダーと未更新・更新対象の2行を持つ。
    // 事前条件: updateFundが行検索と書き込みの前にensureSheetを実行する。
    // 検証: ヘッダーは8列になり、未更新行のcreatedAtは第8列、追加3列は空文字として保持される。
    // 検証: 対象行だけが期待値へ更新され、listFundsは両行を正常に読み取る。
    const fakeSpreadsheet = createFakeSpreadsheet([
      {
        name: SHEET_NAMES.FUNDS,
        rows: [
          ['id', 'name', 'rakutenFundId', 'settlementBusinessDays', 'createdAt'],
          [
            'fund-stable',
            '国内債券インデックスファンド',
            'IJKL1234MNOP',
            '1',
            '2024-01-01T00:00:00.000Z',
          ],
          ['fund-update', '更新前ファンド', '', '2', '2024-01-02T00:00:00.000Z'],
        ],
      },
    ]);
    vi.spyOn(globalThis.SpreadsheetApp, 'getActiveSpreadsheet').mockReturnValue(
      fakeSpreadsheet as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet
    );
    const sheetRepositoryResult = openSheetRepository();
    expect(sheetRepositoryResult.success).toBe(true);
    if (!sheetRepositoryResult.success) {
      return;
    }
    const repository = createFundRepository(sheetRepositoryResult.value);
    const updateResult = repository.updateFund({
      id: 'fund-update',
      name: 'ＳＢＩ・限定販売ファンド（更新後）',
      rakutenFundId: null,
      settlementBusinessDays: 3,
      navSource: 'wealthadvisor',
      navSourceCode: 'sbi_am/sa_202306080A',
      assetClass: 'gold',
      createdAt: '2024-01-02T00:00:00.000Z',
    });
    expect(updateResult.success).toBe(true);

    const sheetData = fakeSpreadsheet.getSheetByName(SHEET_NAMES.FUNDS)?.getData();
    expect(sheetData?.[0]).toEqual(Array.from(SHEET_HEADERS[SHEET_NAMES.FUNDS]));
    expect(sheetData?.[1]?.[4]).toBe('');
    expect(sheetData?.[1]?.[5]).toBe('');
    expect(sheetData?.[1]?.[6]).toBe('');
    expect(sheetData?.[1]?.[7]).toBe('2024-01-01T00:00:00.000Z');
    expect(sheetData?.[2]).toEqual([
      'fund-update',
      'ＳＢＩ・限定販売ファンド（更新後）',
      '',
      3,
      'wealthadvisor',
      'sbi_am/sa_202306080A',
      'gold',
      '2024-01-02T00:00:00.000Z',
    ]);

    const listResult = repository.listFunds();
    expect(listResult.success).toBe(true);
    if (listResult.success) {
      expect(listResult.value).toHaveLength(2);
      expect(listResult.value[0]?.navSource).toBeNull();
      expect(listResult.value[0]?.navSourceCode).toBeNull();
      expect(listResult.value[1]?.name).toBe('ＳＢＩ・限定販売ファンド（更新後）');
      expect(listResult.value[1]?.navSource).toBe('wealthadvisor');
    }
  });

  it('listFundsは値入り旧7列と利用者追加列を変更せずに読み取る', () => {
    // 前提: 旧7列シートの既存銘柄にはWealth Advisor取得元と作成日時が保存されている。
    // 事前条件: H列は空ヘッダー、I列は利用者追加のメモ列であり、両列に値がある。
    // 検証: listFundsはシートを変更せず、追加列を無視してassetClassをnullとして読み取る。
    const fakeSpreadsheet = createFakeSpreadsheet([
      {
        name: SHEET_NAMES.FUNDS,
        rows: [
          [
            'id',
            'name',
            'rakutenFundId',
            'settlementBusinessDays',
            'navSource',
            'navSourceCode',
            'createdAt',
            '',
            'メモ',
          ],
          [
            'fund-legacy-seven',
            'ＳＢＩ・既存ゴールドファンド',
            '',
            '2',
            'wealthadvisor',
            'sbi_am/sa_202306080A',
            '2026-08-01T00:00:00.000Z',
            '空ヘッダー列の値',
            '利用者が追加した確認メモ',
          ],
        ],
      },
    ]);
    vi.spyOn(globalThis.SpreadsheetApp, 'getActiveSpreadsheet').mockReturnValue(
      fakeSpreadsheet as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet
    );
    const sheetRepositoryResult = openSheetRepository();
    expect(sheetRepositoryResult.success).toBe(true);
    if (!sheetRepositoryResult.success) {
      return;
    }
    const repository = createFundRepository(sheetRepositoryResult.value);

    const listResult = repository.listFunds();

    expect(listResult.success).toBe(true);
    const sheetData = fakeSpreadsheet.getSheetByName(SHEET_NAMES.FUNDS)?.getData();
    expect(sheetData?.[0]).toEqual([
      'id',
      'name',
      'rakutenFundId',
      'settlementBusinessDays',
      'navSource',
      'navSourceCode',
      'createdAt',
      '',
      'メモ',
    ]);
    expect(sheetData?.[1]).toEqual([
      'fund-legacy-seven',
      'ＳＢＩ・既存ゴールドファンド',
      '',
      '2',
      'wealthadvisor',
      'sbi_am/sa_202306080A',
      '2026-08-01T00:00:00.000Z',
      '空ヘッダー列の値',
      '利用者が追加した確認メモ',
    ]);
    if (listResult.success) {
      expect(listResult.value).toEqual([
        {
          id: 'fund-legacy-seven',
          name: 'ＳＢＩ・既存ゴールドファンド',
          rakutenFundId: null,
          settlementBusinessDays: 2,
          navSource: 'wealthadvisor',
          navSourceCode: 'sbi_am/sa_202306080A',
          assetClass: null,
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ]);
    }
  });

  it.each([
    { cell: '', expected: null },
    { cell: '   ', expected: null },
    { cell: null, expected: null },
    { cell: 'equity', expected: 'equity' },
    { cell: 'gold', expected: 'gold' },
  ])('現行8列のassetClassセル $cell を解析する', ({ cell, expected }) => {
    // 前提: _fundsシートはassetClassを含む現行8列形式である。
    // 事前条件: assetClass以外のセルは妥当であり、空白文字は任意文字列セルと同じ規則で扱う。
    // 検証: 空セルはnull、有効値は対応する資産クラスとして読み取られる。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        headerRow(SHEET_NAMES.FUNDS),
        [
          'fund-asset-class',
          'ＳＢＩ・iシェアーズ・ゴールドファンド',
          '',
          '2',
          '',
          '',
          cell,
          '2026-09-02T00:00:00.000Z',
        ],
      ],
    });

    const result = createFundRepository(sheetRepository).listFunds();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value[0]?.assetClass).toBe(expected);
    }
  });

  it.each(['bond', 1, undefined])('現行8列の不正なassetClass値 %s を拒否する', (assetClass) => {
    // 前提: _fundsシートはassetClassを含む現行8列形式である。
    // 事前条件: assetClassには定義外の文字列、数値、またはundefinedが保存されている。
    // 検証: 2行目のassetClassを示すunexpectedエラーでfail fastする。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        headerRow(SHEET_NAMES.FUNDS),
        [
          'fund-invalid-asset-class',
          'ＳＢＩ・iシェアーズ・ゴールドファンド',
          '',
          '2',
          '',
          '',
          assetClass,
          '2026-09-02T00:00:00.000Z',
        ],
      ],
    });

    const result = createFundRepository(sheetRepository).listFunds();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toEqual({
        type: 'unexpected',
        message: 'fundsの2行目のassetClassが不正です。',
      });
    }
  });

  it('navSourceなしの孤立したnavSourceCodeを拒否する', () => {
    // 前提: 現行8列行でnavSourceが空だが取得元コードだけが保存されている。
    // 事前条件: その他の必須列は正しい。
    // 検証: 行番号付きunexpectedエラーでfail fastする。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        headerRow(SHEET_NAMES.FUNDS),
        [
          'fund-orphan',
          'ＳＢＩ・限定販売ファンド',
          '',
          '2',
          '',
          'sbi_am/sa_202306080A',
          '',
          '2026-09-02T00:00:00.000Z',
        ],
      ],
    });
    const result = createFundRepository(sheetRepository).listFunds();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
      expect(result.error.message).toContain('2行目');
      expect(result.error.message).toContain('navSourceCode');
    }
  });

  it('wealthadvisor取得元でnavSourceCodeが欠落した行を拒否する', () => {
    // 前提: 現行8列行でnavSourceだけがwealthadvisorに設定されている。
    // 事前条件: 楽天ファンドIDは未設定である。
    // 検証: コード欠落を行番号付きunexpectedエラーで拒否する。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        headerRow(SHEET_NAMES.FUNDS),
        [
          'fund-missing-code',
          'ＳＢＩ・限定販売ファンド',
          '',
          '2',
          'wealthadvisor',
          '',
          '',
          '2026-09-02T00:00:00.000Z',
        ],
      ],
    });
    const result = createFundRepository(sheetRepository).listFunds();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
      expect(result.error.message).toContain('2行目');
      expect(result.error.message).toContain('navSourceCode');
    }
  });

  it('楽天ファンドIDとwealthadvisor取得元が二重指定された行を拒否する', () => {
    // 前提: 現行8列行に楽天ファンドIDとWealth Advisor取得元が両方保存されている。
    // 事前条件: 各取得元コード単独の形式は正しい。
    // 検証: 二重指定を行番号付きunexpectedエラーで拒否する。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        headerRow(SHEET_NAMES.FUNDS),
        [
          'fund-double',
          'ＳＢＩ・限定販売ファンド',
          'ABCD1234EFGH',
          '2',
          'wealthadvisor',
          'sbi_am/sa_202306080A',
          '',
          '2026-09-02T00:00:00.000Z',
        ],
      ],
    });
    const result = createFundRepository(sheetRepository).listFunds();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
      expect(result.error.message).toContain('2行目');
      expect(result.error.message).toContain('二重');
    }
  });

  it('必須のcreatedAtヘッダーがない場合はunexpectedエラーになる', () => {
    // 前提: _fundsシートのヘッダーに必須のcreatedAt列が存在しない。
    // 事前条件: idとnameのヘッダーは存在する。
    // 検証: データ行を解析せず、欠落した列名を含むunexpectedエラーを返す。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        ['id', 'name', 'rakutenFundId', 'settlementBusinessDays'],
        ['fund-invalid', '国内株式ファンド', 'ABCD1234EFGH', '2'],
      ],
    });
    const result = createFundRepository(sheetRepository).listFunds();
    expect(result).toEqual({
      success: false,
      error: {
        type: 'unexpected',
        message: 'fundsシートのヘッダーにcreatedAt列がありません。',
      },
    });
  });

  it('旧5列より古い必須ヘッダー構成を拒否する', () => {
    // 前提: _fundsシートにはid・name・createdAtヘッダーだけが存在する。
    // 事前条件: rakutenFundIdとsettlementBusinessDaysは旧5列から存在する必須ヘッダーである。
    // 検証: 旧5列より古い構成を受理せず、最初の欠落必須列を示すunexpectedエラーを返す。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        ['id', 'name', 'createdAt'],
        ['fund-too-old', '国内株式ファンド', '2024-01-01T00:00:00.000Z'],
      ],
    });

    expect(createFundRepository(sheetRepository).listFunds()).toEqual({
      success: false,
      error: {
        type: 'unexpected',
        message: 'fundsシートのヘッダーにrakutenFundId列がありません。',
      },
    });
  });

  it('navSourceCodeだけが存在するヘッダー構成を拒否する', () => {
    // 前提: _fundsシートにはnavSourceCodeヘッダーだけが追加され、navSourceヘッダーは存在しない。
    // 事前条件: 旧5列の必須ヘッダーはすべて存在する。
    // 検証: 利用者追加列や空ヘッダーとは区別し、NAV取得元ヘッダーの片側欠落を拒否する。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        ['id', 'name', 'rakutenFundId', 'settlementBusinessDays', 'navSourceCode', 'createdAt'],
        [
          'fund-one-sided-header',
          '国内株式ファンド',
          '',
          '2',
          'sbi_am/sa_202306080A',
          '2024-01-01T00:00:00.000Z',
        ],
      ],
    });

    expect(createFundRepository(sheetRepository).listFunds()).toEqual({
      success: false,
      error: {
        type: 'unexpected',
        message:
          'fundsシートのヘッダーのnavSourceとnavSourceCodeは両方存在するか両方欠落している必要があります。',
      },
    });
  });

  it('同名ヘッダーが重複する場合はunexpectedエラーになる', () => {
    // 前提: _fundsシートにnameヘッダーが2列存在する。
    // 事前条件: 重複列のどちらを採用するか暗黙に決定できない。
    // 検証: データ行を解析せず、重複した列名を含むunexpectedエラーを返す。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        ['id', 'name', 'name', 'createdAt'],
        ['fund-invalid', '国内株式ファンド', '重複した銘柄名', '2024-01-01T00:00:00.000Z'],
      ],
    });
    const result = createFundRepository(sheetRepository).listFunds();
    expect(result).toEqual({
      success: false,
      error: {
        type: 'unexpected',
        message: 'fundsシートのヘッダーにname列が重複しています。',
      },
    });
  });

  it('取得元関連セルをtrimし、空白のみの楽天ファンドIDをnullへ変換する', () => {
    // 前提: rakutenFundIdは空白のみ、navSourceとnavSourceCodeには前後空白がある。
    // 事前条件: 行は現行8列レイアウトである。
    // 検証: 楽天ファンドIDはnull、Wealth Advisorの取得元2項目はtrim済みで認識される。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        headerRow(SHEET_NAMES.FUNDS),
        [
          'fund-trim',
          'ＳＢＩ・限定販売ファンド',
          '   ',
          '',
          ' wealthadvisor ',
          ' sbi_am/sa_202306080A ',
          '',
          '2026-09-02T00:00:00.000Z',
        ],
      ],
    });
    const result = createFundRepository(sheetRepository).listFunds();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value[0]?.rakutenFundId).toBeNull();
      expect(result.value[0]?.navSource).toBe('wealthadvisor');
      expect(result.value[0]?.navSourceCode).toBe('sbi_am/sa_202306080A');
    }
  });
});
