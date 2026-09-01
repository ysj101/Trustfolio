import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFundRepository } from '../../src/repository/FundRepository';
import { openSheetRepository } from '../../src/repository/SheetRepository';
import { SHEET_HEADERS, SHEET_NAMES } from '../../src/Config';
import { createFakeSpreadsheet, createInMemorySheetRepository } from '../fakes';

describe('FundRepository', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('文字列のsettlementBusinessDaysを数値に変換する', () => {
    // 前提: settlementBusinessDaysが文字列で保存されている
    // 事前条件: fundsシートに1件のデータがある
    // 検証: 数値として取得できる
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
        ['fund-1', '日本株ファンド', 'ABCD1234EFGH', '3', '', '', '2024-01-01T00:00:00.000Z'],
      ],
    });
    const repository = createFundRepository(sheetRepository);
    const result = repository.listFunds();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value[0]?.settlementBusinessDays).toBe(3);
    }
  });

  it('空行はスキップして残りの銘柄を返す（他リポジトリと同じ parseAllRows へ統一）', () => {
    // 前提: fundsシートのデータ行の間に空行が混入している
    // 事前条件: 空行を挟んで2件の銘柄データがある
    // 検証: 空行はエラーにならずスキップされ、2件の銘柄が取得できる
    //   （H3 #149 以前は本リポジトリだけ空行をスキップせず id 不正エラーになっていた）
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
        ['fund-1', '日本株ファンド', '', '', '', '', '2024-01-01T00:00:00.000Z'],
        ['', '', '', '', '', '', ''],
        ['fund-2', '先進国株ファンド', '', '', '', '', '2024-01-02T00:00:00.000Z'],
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
        [
          'id',
          'name',
          'rakutenFundId',
          'settlementBusinessDays',
          'navSource',
          'navSourceCode',
          'createdAt',
        ],
        ['fund-1', '日本株ファンド', 'ABCD1234EFGH', '不正値', '', '', '2024-01-01T00:00:00.000Z'],
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
      ],
    });
    const repository = createFundRepository(sheetRepository);
    const result = repository.updateFund({
      id: 'fund-1',
      name: '日本株ファンド',
      rakutenFundId: null,
      settlementBusinessDays: null,
      navSource: null,
      navSourceCode: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('not_found');
    }
  });

  it('wealthadvisorの新列を読み書きする', () => {
    // 前提: SBI証券限定販売ファンドにWealth Advisor取得元が設定されている。
    // 事前条件: 空のfundsシートへファンドを追加する。
    // 検証: navSourceとnavSourceCodeが新しい列順で保存され、同じ値で読み戻せる。
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
        [
          'id',
          'name',
          'rakutenFundId',
          'settlementBusinessDays',
          'navSource',
          'navSourceCode',
          'createdAt',
        ],
        ['fund-1', '国内株式ファンド', '', '', 'unknown', '', '2026-09-02T00:00:00.000Z'],
      ],
    });
    const result = createFundRepository(sheetRepository).listFunds();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
      expect(result.error.message).toContain('2行目');
    }
  });

  it('ensureHeader移行前の旧5列行を読み取る', () => {
    // 前提: デプロイ直後で_fundsシートの列追加がまだ実行されていない。
    // 事前条件: 行は旧形式のid、name、rakutenFundId、settlementBusinessDays、createdAtの5列である。
    // 検証: createdAtを旧位置から読み、追加前の取得元2項目をnullとして返す。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        ['id', 'name', 'rakutenFundId', 'settlementBusinessDays', 'createdAt'],
        [
          'fund-legacy',
          '全世界株式インデックスファンド',
          ' ABCD1234EFGH ',
          '2',
          '2024-01-01T00:00:00.000Z',
        ],
      ],
    });
    const result = createFundRepository(sheetRepository).listFunds();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value[0]).toEqual({
        id: 'fund-legacy',
        name: '全世界株式インデックスファンド',
        rakutenFundId: 'ABCD1234EFGH',
        settlementBusinessDays: 2,
        navSource: null,
        navSourceCode: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      });
    }
  });

  it('旧5列シートへ銘柄を追加する前に列移行し、既存行と新規行を読み取る', () => {
    // 前提: _fundsシートには旧5列ヘッダーと既存の国内株式ファンドが保存されている。
    // 事前条件: Wealth Advisor取得元を持つ新規ファンドをcreateFundで追加する。
    // 検証: 書き込み前に現行7列へ移行され、既存行と新規行の両方を正常に読み取れる。
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
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      expect(result.value[1]?.navSource).toBe('wealthadvisor');
      expect(result.value[1]?.navSourceCode).toBe('sbi_am/sa_202306080A');
    }
  });

  it('実SheetRepository経路で旧5列を移行してから銘柄を追加する', () => {
    // 前提: 本番と同じSheetRepositoryが、旧5列ヘッダーと既存ファンドを持つシートへ接続する。
    // 事前条件: createFundが書き込み前にensureSheetを実行する。
    // 検証: ヘッダーは7列になり、既存createdAtは第7列、追加2列は空文字として保持される。
    // 検証: listFundsは既存行の追加2項目をnullとして読み、新規行も正常に読み取る。
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
      createdAt: '2026-09-02T00:00:00.000Z',
    });
    expect(createResult.success).toBe(true);

    const sheetData = fakeSpreadsheet.getSheetByName(SHEET_NAMES.FUNDS)?.getData();
    expect(sheetData?.[0]).toEqual(Array.from(SHEET_HEADERS[SHEET_NAMES.FUNDS]));
    expect(sheetData?.[1]?.[4]).toBe('');
    expect(sheetData?.[1]?.[5]).toBe('');
    expect(sheetData?.[1]?.[6]).toBe('2024-01-01T00:00:00.000Z');

    const listResult = repository.listFunds();
    expect(listResult.success).toBe(true);
    if (listResult.success) {
      expect(listResult.value).toHaveLength(2);
      expect(listResult.value[0]?.navSource).toBeNull();
      expect(listResult.value[0]?.navSourceCode).toBeNull();
      expect(listResult.value[0]?.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(listResult.value[1]?.navSource).toBe('wealthadvisor');
    }
  });

  it('実SheetRepository経路で旧5列を移行してから対象銘柄を更新する', () => {
    // 前提: 本番と同じSheetRepositoryが、旧5列ヘッダーと未更新・更新対象の2行を持つ。
    // 事前条件: updateFundが行検索と書き込みの前にensureSheetを実行する。
    // 検証: ヘッダーは7列になり、未更新行のcreatedAtは第7列、追加2列は空文字として保持される。
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
      createdAt: '2024-01-02T00:00:00.000Z',
    });
    expect(updateResult.success).toBe(true);

    const sheetData = fakeSpreadsheet.getSheetByName(SHEET_NAMES.FUNDS)?.getData();
    expect(sheetData?.[0]).toEqual(Array.from(SHEET_HEADERS[SHEET_NAMES.FUNDS]));
    expect(sheetData?.[1]?.[4]).toBe('');
    expect(sheetData?.[1]?.[5]).toBe('');
    expect(sheetData?.[1]?.[6]).toBe('2024-01-01T00:00:00.000Z');
    expect(sheetData?.[2]).toEqual([
      'fund-update',
      'ＳＢＩ・限定販売ファンド（更新後）',
      '',
      3,
      'wealthadvisor',
      'sbi_am/sa_202306080A',
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

  it('navSourceなしの孤立したnavSourceCodeを拒否する', () => {
    // 前提: 現行7列行でnavSourceが空だが取得元コードだけが保存されている。
    // 事前条件: その他の必須列は正しい。
    // 検証: 行番号付きunexpectedエラーでfail fastする。
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
          'fund-orphan',
          'ＳＢＩ・限定販売ファンド',
          '',
          '2',
          '',
          'sbi_am/sa_202306080A',
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
    // 前提: 現行7列行でnavSourceだけがwealthadvisorに設定されている。
    // 事前条件: 楽天ファンドIDは未設定である。
    // 検証: コード欠落を行番号付きunexpectedエラーで拒否する。
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
          'fund-missing-code',
          'ＳＢＩ・限定販売ファンド',
          '',
          '2',
          'wealthadvisor',
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
    // 前提: 現行7列行に楽天ファンドIDとWealth Advisor取得元が両方保存されている。
    // 事前条件: 各取得元コード単独の形式は正しい。
    // 検証: 二重指定を行番号付きunexpectedエラーで拒否する。
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
          'fund-double',
          'ＳＢＩ・限定販売ファンド',
          'ABCD1234EFGH',
          '2',
          'wealthadvisor',
          'sbi_am/sa_202306080A',
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

  it('6列の未知レイアウトはunexpectedエラーになる', () => {
    // 前提: 旧5列でも現行7列以上でもない6列の行が存在する。
    // 事前条件: 各セル値だけでは列レイアウトを一意に判断できない。
    // 検証: 未知レイアウトへ暗黙フォールバックせず、行番号付きunexpectedエラーを返す。
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        ['id', 'name', 'rakutenFundId', 'settlementBusinessDays', 'unknown', 'createdAt'],
        ['fund-invalid', '国内株式ファンド', '', '', '', '2024-01-01T00:00:00.000Z'],
      ],
    });
    const result = createFundRepository(sheetRepository).listFunds();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
      expect(result.error.message).toContain('2行目');
      expect(result.error.message).toContain('列数');
    }
  });

  it('ヘッダー定義より多い8列の未知レイアウトはunexpectedエラーになる', () => {
    // 前提: 現行のFUNDSヘッダー定義より余分な列を持つ行が存在する。
    // 事前条件: 行は旧5列でも現行ヘッダーと同じ7列でもない8列である。
    // 検証: 余分な列を黙って無視せず、行番号付きunexpectedエラーを返す。
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
          'unknown',
        ],
        ['fund-invalid', '国内株式ファンド', '', '', '', '', '2024-01-01T00:00:00.000Z', ''],
      ],
    });
    const result = createFundRepository(sheetRepository).listFunds();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
      expect(result.error.message).toContain('2行目');
      expect(result.error.message).toContain('列数');
    }
  });

  it('取得元関連セルをtrimし、空白のみの楽天ファンドIDをnullへ変換する', () => {
    // 前提: rakutenFundIdは空白のみ、navSourceとnavSourceCodeには前後空白がある。
    // 事前条件: 行は現行7列レイアウトである。
    // 検証: 楽天ファンドIDはnull、Wealth Advisorの取得元2項目はtrim済みで認識される。
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
          'fund-trim',
          'ＳＢＩ・限定販売ファンド',
          '   ',
          '',
          ' wealthadvisor ',
          ' sbi_am/sa_202306080A ',
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
