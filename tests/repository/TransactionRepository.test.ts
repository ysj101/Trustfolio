import { describe, expect, it } from 'vitest';
import { createTransactionRepository } from '../../src/repository/TransactionRepository';
import { getTransactionSheetName, SHEET_NAMES } from '../../src/Config';
import { createInMemorySheetRepository, fail, headerRow } from '../fakes';

/**
 * 同一取引日の取引行を作り、登録日時による検証データを用意する。
 */
function createSameDateTransactionRows(fundId: string, olderId: string, newerId: string) {
  return [
    [
      olderId,
      fundId,
      'SPOT_PURCHASE',
      '2026-08-10',
      10000,
      25000,
      4000,
      '',
      '',
      '',
      '',
      '2026-08-10T01:00:00.000Z',
    ],
    [
      newerId,
      fundId,
      'SPOT_PURCHASE',
      '2026-08-10',
      20000,
      25000,
      8000,
      '',
      '',
      '',
      '',
      '2026-08-10T07:00:00.000Z',
    ],
  ];
}

describe('TransactionRepository', () => {
  it('空行を除外して取引履歴を取得する', () => {
    // 前提: 取引シートに空行が混在する
    // 事前条件: ファンドIDに対応するシートが存在する
    // 検証: 空行が無視される
    const sheetName = getTransactionSheetName('fund-1');
    const sheetRepository = createInMemorySheetRepository({
      [sheetName]: [
        headerRow(SHEET_NAMES.TRANSACTIONS),
        [
          'tx-1',
          'fund-1',
          'SPOT_PURCHASE',
          '2024-01-01',
          10000,
          10000,
          10000,
          '',
          '',
          '',
          '',
          '2024-01-01T00:00:00.000Z',
        ],
        ['', '', '', '', '', '', '', '', '', '', '', ''],
      ],
    });
    const repository = createTransactionRepository(sheetRepository);
    const result = repository.listByFundId('fund-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.id).toBe('tx-1');
    }
  });

  it('listByFundIdは同一取引日の取引を登録日時の降順で返す', () => {
    // 前提: 同じ取引日に登録日時が異なる取引が複数存在する
    // 事前条件: 全世界株式ファンドの取引シートでは古い登録日時の取引が先に保存されている
    // 検証: 新しく登録された取引から順に返る
    const sheetName = getTransactionSheetName('全世界株式ファンド');
    const sheetRepository = createInMemorySheetRepository({
      [sheetName]: [
        headerRow(SHEET_NAMES.TRANSACTIONS),
        ...createSameDateTransactionRows(
          '全世界株式ファンド',
          '全世界株式-午前登録',
          '全世界株式-午後登録'
        ),
      ],
    });
    const repository = createTransactionRepository(sheetRepository);

    const result = repository.listByFundId('全世界株式ファンド');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.map((transaction) => transaction.id)).toEqual([
        '全世界株式-午後登録',
        '全世界株式-午前登録',
      ]);
    }
  });

  it('listByFundIdはシート不存在時に空配列を返す', () => {
    // 前提: 取引履歴シートが作成されていない銘柄が存在する。
    // 検証: シート不存在を取引0件として明示的に扱い、成功した空配列を返す。
    const repository = createTransactionRepository(createInMemorySheetRepository());
    const result = repository.listByFundId(
      'ＳＢＩ・ｉシェアーズ・ゴールドファンド（為替ヘッジなし）'
    );
    expect(result).toEqual({ success: true, value: [] });
  });

  it('listByFundIdはシート存在判定の失敗を取引0件へ変換せず返す', () => {
    // 前提: 対象銘柄のシート存在判定でスプレッドシートへのアクセスに失敗する。
    // 事前条件: hasSheetがアクセス失敗を返すSheetRepositoryを使用する。
    // 検証: 取得失敗が成功した空配列へ変換されず、そのまま呼び出し元へ伝播する。
    const sheetRepository = {
      ...createInMemorySheetRepository(),
      hasSheet: () => fail<boolean>('unexpected', 'スプレッドシートへアクセスできません。'),
    };
    const repository = createTransactionRepository(sheetRepository);

    const result = repository.listByFundId('国内株式ファンド');

    expect(result).toEqual({
      success: false,
      error: { type: 'unexpected', message: 'スプレッドシートへアクセスできません。' },
    });
  });

  it('listByFundIdはヘッダー行のみのシートで空配列を返す', () => {
    // 前提: 取引シートは存在するが、ヘッダー行以外の取引行が存在しない。
    // 事前条件: 対象ファンドのシートには最新の取引ヘッダーだけが保存されている。
    // 検証: シート不存在とは異なる読取経路でも、取引0件を成功した空配列として返す。
    const sheetName = getTransactionSheetName('国内株式ファンド');
    const sheetRepository = createInMemorySheetRepository({
      [sheetName]: [headerRow(SHEET_NAMES.TRANSACTIONS)],
    });
    const repository = createTransactionRepository(sheetRepository);

    const result = repository.listByFundId('国内株式ファンド');

    expect(result).toEqual({ success: true, value: [] });
  });

  it('listByFundIdは不正な取引行の解析失敗を返す', () => {
    // 前提: 取引シートに、必須項目である取引IDが空文字の不正な取引行が存在する。
    // 事前条件: ファンドID・取引種別・取引日など、取引ID以外の項目は妥当である。
    // 検証: シート不存在時の空配列契約が、行の解析失敗まで成功へ変換しない。
    const sheetName = getTransactionSheetName('先進国株式ファンド');
    const sheetRepository = createInMemorySheetRepository({
      [sheetName]: [
        headerRow(SHEET_NAMES.TRANSACTIONS),
        [
          '',
          '先進国株式ファンド',
          'SPOT_PURCHASE',
          '2026-07-01',
          20000,
          12000,
          10000,
          '',
          '',
          '',
          '',
          '2026-07-01T00:00:00.000Z',
        ],
      ],
    });
    const repository = createTransactionRepository(sheetRepository);

    const result = repository.listByFundId('先進国株式ファンド');

    expect(result.success).toBe(false);
  });

  it('旧10列（税額カラム追加前）のシートを読取時に自動マイグレーションして解析する', () => {
    // 前提: incomeTax / residentTax カラム追加前の旧10列構成のシートが存在する
    // 事前条件: 旧ヘッダー（units の次が recurringPurchaseId）と旧10要素のデータ行を持つ
    // 検証: 読取前にヘッダーが12列へ整合され、既存行の税額は「未記録」の null として読める
    const sheetName = getTransactionSheetName('fund-1');
    const legacyHeader = [
      'id',
      'fundId',
      'type',
      'date',
      'amount',
      'navValue',
      'units',
      'recurringPurchaseId',
      'idempotencyKey',
      'createdAt',
    ];
    const sheetRepository = createInMemorySheetRepository({
      [sheetName]: [
        legacyHeader,
        [
          'tx-旧形式-積立',
          'fund-1',
          'RECURRING_PURCHASE',
          '2024-02-01',
          10000,
          10000,
          10000,
          'rec-1',
          'rec-1_2024-02-01',
          '2024-02-01T00:00:00.000Z',
        ],
        [
          'tx-旧形式-売却',
          'fund-1',
          'REDEMPTION',
          '2024-03-01',
          6000,
          12000,
          5000,
          '',
          '',
          '2024-03-01T00:00:00.000Z',
        ],
      ],
    });
    const repository = createTransactionRepository(sheetRepository);
    const result = repository.listByFundId('fund-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveLength(2);
      const recurring = result.value.find((tx) => tx.id === 'tx-旧形式-積立');
      // 旧 recurringPurchaseId 列の値が incomeTax として誤解釈されないこと
      expect(recurring?.recurringPurchaseId).toBe('rec-1');
      expect(recurring?.idempotencyKey).toBe('rec-1_2024-02-01');
      expect(recurring?.incomeTax).toBeNull();
      expect(recurring?.residentTax).toBeNull();
      const redemption = result.value.find((tx) => tx.id === 'tx-旧形式-売却');
      // 旧形式の売却は税額未記録（null）として読み込まれ、0円とは区別される
      expect(redemption?.incomeTax).toBeNull();
      expect(redemption?.residentTax).toBeNull();
      expect(redemption?.createdAt).toBe('2024-03-01T00:00:00.000Z');
    }
  });

  it('idempotencyKeyで取引を検索できる', () => {
    // 前提: idempotencyKeyが設定された取引がある
    // 事前条件: 該当ファンドのシートが存在する
    // 検証: 指定キーの取引が返る
    const sheetName = getTransactionSheetName('fund-1');
    const sheetRepository = createInMemorySheetRepository({
      [sheetName]: [
        headerRow(SHEET_NAMES.TRANSACTIONS),
        [
          'tx-1',
          'fund-1',
          'RECURRING_PURCHASE',
          '2024-02-01',
          10000,
          10000,
          10000,
          '',
          '',
          'rec-1',
          'rec-1_2024-02-01',
          '2024-02-01T00:00:00.000Z',
        ],
      ],
    });
    const repository = createTransactionRepository(sheetRepository);
    const result = repository.findByIdempotencyKey('rec-1_2024-02-01', ['fund-1']);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value?.id).toBe('tx-1');
    }
  });

  it('Date型の取引日をYYYY-MM-DDに変換する', () => {
    // 前提: dateがDateオブジェクトで保存されている
    // 事前条件: 取引シートにDate型の日付がある
    // 検証: 文字列の日付として取得できる
    const sheetName = getTransactionSheetName('fund-2');
    const sheetRepository = createInMemorySheetRepository({
      [sheetName]: [
        headerRow(SHEET_NAMES.TRANSACTIONS),
        [
          'tx-2',
          'fund-2',
          'SPOT_PURCHASE',
          new Date('2024-03-01T00:00:00.000Z'),
          10000,
          10000,
          10000,
          '',
          '',
          '',
          '',
          '2024-03-01T00:00:00.000Z',
        ],
      ],
    });
    const repository = createTransactionRepository(sheetRepository);
    const result = repository.listByFundId('fund-2');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value[0]?.date).toBe('2024-03-01');
    }
  });

  it('不正なtypeが含まれる場合はエラーになる', () => {
    // 前提: typeが不正な文字列である
    // 事前条件: 取引シートに不正データがある
    // 検証: unexpectedエラーが返る
    const sheetName = getTransactionSheetName('fund-3');
    const sheetRepository = createInMemorySheetRepository({
      [sheetName]: [
        headerRow(SHEET_NAMES.TRANSACTIONS),
        [
          'tx-3',
          'fund-3',
          'INVALID',
          '2024-03-01',
          10000,
          10000,
          10000,
          '',
          '',
          '',
          '',
          '2024-03-01T00:00:00.000Z',
        ],
      ],
    });
    const repository = createTransactionRepository(sheetRepository);
    const result = repository.listByFundId('fund-3');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
    }
  });

  it('存在しないシートはlistAllでスキップされる', () => {
    // 前提: 指定ファンドのシートが存在しない
    // 事前条件: 片方のファンドのみシートが存在する
    // 検証: 既存シートの取引のみ返る
    const sheetName = getTransactionSheetName('fund-1');
    const sheetRepository = createInMemorySheetRepository({
      [sheetName]: [
        headerRow(SHEET_NAMES.TRANSACTIONS),
        [
          'tx-1',
          'fund-1',
          'SPOT_PURCHASE',
          '2024-01-01',
          10000,
          10000,
          10000,
          '',
          '',
          '',
          '',
          '2024-01-01T00:00:00.000Z',
        ],
      ],
    });
    const repository = createTransactionRepository(sheetRepository);
    const result = repository.listAll(['fund-1', 'fund-missing']);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveLength(1);
    }
  });

  it('listAllは同一取引日の取引を登録日時の降順で返す', () => {
    // 前提: 異なるファンドに同じ取引日かつ登録日時が異なる取引が存在する
    // 事前条件: 国内株式ファンドの取引より先進国株式インデックスの取引が後から登録されている
    // 注意: 取引シート名はファンドIDの末尾3文字から決まる（getFundIdSuffix）ため、
    //       2つのファンドIDは末尾3文字が衝突しない名前にする必要がある
    // 検証: ファンドをまたいで集約した後も新しく登録された取引から順に返る
    const domesticSheetName = getTransactionSheetName('国内株式ファンド');
    const developedSheetName = getTransactionSheetName('先進国株式インデックス');
    const sheetRepository = createInMemorySheetRepository({
      [domesticSheetName]: [
        headerRow(SHEET_NAMES.TRANSACTIONS),
        [
          '国内株式-先行登録',
          '国内株式ファンド',
          'SPOT_PURCHASE',
          '2026-08-10',
          15000,
          30000,
          5000,
          '',
          '',
          '',
          '',
          '2026-08-10T02:00:00.000Z',
        ],
      ],
      [developedSheetName]: [
        headerRow(SHEET_NAMES.TRANSACTIONS),
        [
          '先進国株式-後続登録',
          '先進国株式インデックス',
          'SPOT_PURCHASE',
          '2026-08-10',
          25000,
          35000,
          7143,
          '',
          '',
          '',
          '',
          '2026-08-10T08:00:00.000Z',
        ],
      ],
    });
    const repository = createTransactionRepository(sheetRepository);

    const result = repository.listAll(['国内株式ファンド', '先進国株式インデックス']);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.map((transaction) => transaction.id)).toEqual([
        '先進国株式-後続登録',
        '国内株式-先行登録',
      ]);
    }
  });

  it('listByFundIdsGroupedは同一取引日の取引を登録日時の降順で返す', () => {
    // 前提: 同じファンドに同じ取引日かつ登録日時が異なる取引が複数存在する
    // 事前条件: バランスファンドの取引シートでは古い登録日時の取引が先に保存されている
    // 検証: ファンド別にグループ化した後も新しく登録された取引から順に返る
    const sheetName = getTransactionSheetName('バランスファンド');
    const sheetRepository = createInMemorySheetRepository({
      [sheetName]: [
        headerRow(SHEET_NAMES.TRANSACTIONS),
        [
          'バランス-午前登録',
          'バランスファンド',
          'SPOT_PURCHASE',
          '2026-08-10',
          12000,
          28000,
          4286,
          '',
          '',
          '',
          '',
          '2026-08-10T03:00:00.000Z',
        ],
        [
          'バランス-午後登録',
          'バランスファンド',
          'SPOT_PURCHASE',
          '2026-08-10',
          18000,
          28000,
          6429,
          '',
          '',
          '',
          '',
          '2026-08-10T09:00:00.000Z',
        ],
      ],
    });
    const repository = createTransactionRepository(sheetRepository);

    const result = repository.listByFundIdsGrouped(['バランスファンド']);

    expect(result.success).toBe(true);
    if (result.success) {
      const transactions = result.value.get('バランスファンド');
      expect(transactions?.map((transaction) => transaction.id)).toEqual([
        'バランス-午後登録',
        'バランス-午前登録',
      ]);
    }
  });

  it('updateTransactionで取引内容が更新される', () => {
    // 前提: 更新対象の取引が存在する
    // 事前条件: 取引シートに対象データがある
    // 検証: 更新後の取引が取得できる
    const sheetName = getTransactionSheetName('fund-10');
    const sheetRepository = createInMemorySheetRepository({
      [sheetName]: [
        headerRow(SHEET_NAMES.TRANSACTIONS),
        [
          'tx-10',
          'fund-10',
          'SPOT_PURCHASE',
          '2024-01-01',
          10000,
          10000,
          10000,
          '',
          '',
          '',
          '',
          '2024-01-01T00:00:00.000Z',
        ],
      ],
    });
    const repository = createTransactionRepository(sheetRepository);
    const updateResult = repository.updateTransaction({
      id: 'tx-10',
      fundId: 'fund-10',
      type: 'SPOT_PURCHASE',
      date: '2024-01-01',
      amount: 20000,
      navValue: 10000,
      units: 20000,
      incomeTax: null,
      residentTax: null,
      recurringPurchaseId: null,
      idempotencyKey: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(updateResult.success).toBe(true);
    const listResult = repository.listByFundId('fund-10');
    expect(listResult.success).toBe(true);
    if (listResult.success) {
      expect(listResult.value[0]?.amount).toBe(20000);
    }
  });

  it('deleteTransactionで取引が削除される', () => {
    // 前提: 削除対象の取引が存在する
    // 事前条件: 取引シートに対象データがある
    // 検証: 取引件数が減る
    const sheetName = getTransactionSheetName('fund-11');
    const sheetRepository = createInMemorySheetRepository({
      [sheetName]: [
        headerRow(SHEET_NAMES.TRANSACTIONS),
        [
          'tx-11',
          'fund-11',
          'SPOT_PURCHASE',
          '2024-01-01',
          10000,
          10000,
          10000,
          '',
          '',
          '',
          '',
          '2024-01-01T00:00:00.000Z',
        ],
      ],
    });
    const repository = createTransactionRepository(sheetRepository);
    const deleteResult = repository.deleteTransaction('tx-11', 'fund-11');
    expect(deleteResult.success).toBe(true);
    const listResult = repository.listByFundId('fund-11');
    expect(listResult.success).toBe(true);
    if (listResult.success) {
      expect(listResult.value).toHaveLength(0);
    }
  });

  it('findByIdで対象が存在しない場合はnullを返す', () => {
    // 前提: 対象取引が存在しない
    // 事前条件: 取引シートにデータがない
    // 検証: nullが返る
    const sheetName = getTransactionSheetName('fund-12');
    const sheetRepository = createInMemorySheetRepository({
      [sheetName]: [headerRow(SHEET_NAMES.TRANSACTIONS)],
    });
    const repository = createTransactionRepository(sheetRepository);
    const result = repository.findById('missing-id', 'fund-12');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBeNull();
    }
  });

  it('findByIdは取引シート未作成の銘柄に対して成功結果のnullを返す', () => {
    // 前提: 対象銘柄の取引シートが作成されていない。
    // 事前条件: インメモリのシートリポジトリに対象銘柄の取引シートを用意しない。
    // 検証: シート不存在は内部エラーではなく、該当取引なしの成功結果として返る。
    const repository = createTransactionRepository(createInMemorySheetRepository());

    const result = repository.findById('存在しない取引ID', '国内株式ファンド');

    expect(result).toEqual({ success: true, value: null });
  });

  it('updateTransactionは取引シート未作成の銘柄に対してnot_foundを返す', () => {
    // 前提: 更新対象の取引シートが作成されていない。
    // 事前条件: インメモリのシートリポジトリに対象銘柄の取引シートを用意しない。
    // 検証: unexpectedではなくnot_found種別で、既存契約のメッセージを返す。
    const repository = createTransactionRepository(createInMemorySheetRepository());
    const transactionId = '更新対象なしの取引';

    const result = repository.updateTransaction({
      id: transactionId,
      fundId: '先進国株式ファンド',
      type: 'SPOT_PURCHASE',
      date: '2026-08-01',
      amount: 10000,
      navValue: 20000,
      units: 500,
      incomeTax: null,
      residentTax: null,
      recurringPurchaseId: null,
      idempotencyKey: null,
      createdAt: '2026-08-01T00:00:00.000Z',
    });

    expect(result).toEqual({
      success: false,
      error: { type: 'not_found', message: `対象の取引履歴が見つかりません: id=${transactionId}` },
    });
  });

  it('deleteTransactionは取引シート未作成の銘柄に対してnot_foundを返す', () => {
    // 前提: 削除対象の取引シートが作成されていない。
    // 事前条件: インメモリのシートリポジトリに対象銘柄の取引シートを用意しない。
    // 検証: unexpectedではなくnot_found種別で、既存契約のメッセージを返す。
    const repository = createTransactionRepository(createInMemorySheetRepository());
    const transactionId = '削除対象なしの取引';

    const result = repository.deleteTransaction(transactionId, 'バランスファンド');

    expect(result).toEqual({
      success: false,
      error: { type: 'not_found', message: `対象の取引履歴が見つかりません: id=${transactionId}` },
    });
  });

  it('12要素の売却行から税額を読み込み、空セルはnullとして区別する', () => {
    // 前提: 税額記録済みと税額未記録の売却行が存在する
    // 事前条件: 各行は新しい12カラム順で保存されている
    // 検証: 数値税額は保持され、空セルは0ではなくnullとして返る
    const sheetName = getTransactionSheetName('国内株式ファンド');
    const sheetRepository = createInMemorySheetRepository({
      [sheetName]: [
        headerRow(SHEET_NAMES.TRANSACTIONS),
        [
          '売却-記録済み',
          '国内株式ファンド',
          'REDEMPTION',
          '2026-07-01',
          20000,
          12000,
          10000,
          1532,
          500,
          '',
          '',
          '2026-07-01T00:00:00.000Z',
        ],
        [
          '売却-未記録',
          '国内株式ファンド',
          'REDEMPTION',
          '2026-06-01',
          10000,
          11000,
          5000,
          '',
          '',
          '',
          '',
          '2026-06-01T00:00:00.000Z',
        ],
      ],
    });
    const result = createTransactionRepository(sheetRepository).listByFundId('国内株式ファンド');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value[0]?.incomeTax).toBe(1532);
      expect(result.value[0]?.residentTax).toBe(500);
      expect(result.value[1]?.incomeTax).toBeNull();
      expect(result.value[1]?.residentTax).toBeNull();
    }
  });

  it('負の税額が保存されている場合はunexpectedエラーにする', () => {
    // 前提: 売却行の所得税セルに負値が保存されている
    // 事前条件: その他の列は妥当である
    // 検証: 不正データを読み飛ばさずunexpectedエラーを返す
    const sheetName = getTransactionSheetName('先進国株式ファンド');
    const sheetRepository = createInMemorySheetRepository({
      [sheetName]: [
        headerRow(SHEET_NAMES.TRANSACTIONS),
        [
          '売却-負税額',
          '先進国株式ファンド',
          'REDEMPTION',
          '2026-07-01',
          20000,
          12000,
          10000,
          -1,
          500,
          '',
          '',
          '2026-07-01T00:00:00.000Z',
        ],
      ],
    });
    const result = createTransactionRepository(sheetRepository).listByFundId('先進国株式ファンド');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
      expect(result.error.message).toContain('incomeTax');
    }
  });

  it('購入行に税額が保存されている場合はunexpectedエラーにする', () => {
    // 前提: スポット購入行に所得税0円が明示的に保存されている
    // 事前条件: 0円は数値として妥当だが購入取引には設定できない
    // 検証: 取引種別との不整合をunexpectedエラーとして検出する
    const sheetName = getTransactionSheetName('全世界株式ファンド');
    const sheetRepository = createInMemorySheetRepository({
      [sheetName]: [
        headerRow(SHEET_NAMES.TRANSACTIONS),
        [
          '購入-税額不整合',
          '全世界株式ファンド',
          'SPOT_PURCHASE',
          '2026-07-01',
          20000,
          12000,
          10000,
          0,
          '',
          '',
          '',
          '2026-07-01T00:00:00.000Z',
        ],
      ],
    });
    const result = createTransactionRepository(sheetRepository).listByFundId('全世界株式ファンド');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
      expect(result.error.message).toContain('購入取引');
    }
  });

  it('税額nullの取引は空文字として12カラム行へ書き出す', () => {
    // 前提: 税額が該当しないスポット購入を登録する
    // 事前条件: 取引シートは新しい12カラムで初期化済みである
    // 検証: 読み戻した税額がnullであり、後続列の位置も崩れない
    const sheetName = getTransactionSheetName('バランスファンド');
    const sheetRepository = createInMemorySheetRepository({
      [sheetName]: [headerRow(SHEET_NAMES.TRANSACTIONS)],
    });
    const repository = createTransactionRepository(sheetRepository);
    const createResult = repository.createTransaction({
      id: '購入-null税額',
      fundId: 'バランスファンド',
      type: 'SPOT_PURCHASE',
      date: '2026-07-01',
      amount: 10000,
      navValue: 10000,
      units: 10000,
      incomeTax: null,
      residentTax: null,
      recurringPurchaseId: null,
      idempotencyKey: null,
      createdAt: '2026-07-01T00:00:00.000Z',
    });
    const rowsResult = sheetRepository.readAllRows(sheetName);

    expect(createResult.success).toBe(true);
    expect(rowsResult.success).toBe(true);
    if (rowsResult.success) {
      expect(rowsResult.value[0]).toHaveLength(12);
      expect(rowsResult.value[0]?.[7]).toBe('');
      expect(rowsResult.value[0]?.[8]).toBe('');
    }
  });

  describe('listByFundIdsGrouped', () => {
    it('複数のファンドIDに対する取引をグループ化して取得する', () => {
      // 前提: 複数のファンドに取引が存在する
      // 事前条件: 各ファンドに対応する取引シートが存在する
      // 検証: ファンドIDごとにグループ化されたMapが返される
      const sheetName1 = getTransactionSheetName('三菱UFJ国際投信-eMAXIS');
      const sheetName2 = getTransactionSheetName('野村アセット-NASDAQ100');
      const sheetRepository = createInMemorySheetRepository({
        [sheetName1]: [
          headerRow(SHEET_NAMES.TRANSACTIONS),
          [
            'tx-1',
            '三菱UFJ国際投信-eMAXIS',
            'SPOT_PURCHASE',
            '2024-01-01',
            10000,
            10000,
            10000,
            '',
            '',
            '',
            '',
            '2024-01-01T00:00:00.000Z',
          ],
          [
            'tx-2',
            '三菱UFJ国際投信-eMAXIS',
            'SPOT_PURCHASE',
            '2024-02-01',
            20000,
            11000,
            18182,
            '',
            '',
            '',
            '',
            '2024-02-01T00:00:00.000Z',
          ],
        ],
        [sheetName2]: [
          headerRow(SHEET_NAMES.TRANSACTIONS),
          [
            'tx-3',
            '野村アセット-NASDAQ100',
            'SPOT_PURCHASE',
            '2024-01-15',
            30000,
            25000,
            12000,
            '',
            '',
            '',
            '',
            '2024-01-15T00:00:00.000Z',
          ],
        ],
      });
      const repository = createTransactionRepository(sheetRepository);
      const result = repository.listByFundIdsGrouped([
        '三菱UFJ国際投信-eMAXIS',
        '野村アセット-NASDAQ100',
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        const txMap = result.value;
        expect(txMap.size).toBe(2);

        const emaxisTxs = txMap.get('三菱UFJ国際投信-eMAXIS');
        expect(emaxisTxs).toHaveLength(2);
        // 降順ソート確認（最新が先頭）
        expect(emaxisTxs?.[0]?.date).toBe('2024-02-01');
        expect(emaxisTxs?.[1]?.date).toBe('2024-01-01');

        const nasdaqTxs = txMap.get('野村アセット-NASDAQ100');
        expect(nasdaqTxs).toHaveLength(1);
        expect(nasdaqTxs?.[0]?.amount).toBe(30000);
      }
    });

    it('取引が存在しないファンドには空配列を設定する', () => {
      // 前提: 一部のファンドに取引が存在しない
      // 事前条件: 片方のファンドのシートのみ存在する
      // 検証: 取引が存在しないファンドには空配列が設定される
      const sheetName1 = getTransactionSheetName('三菱UFJ国際投信-eMAXIS');
      const sheetRepository = createInMemorySheetRepository({
        [sheetName1]: [
          headerRow(SHEET_NAMES.TRANSACTIONS),
          [
            'tx-1',
            '三菱UFJ国際投信-eMAXIS',
            'SPOT_PURCHASE',
            '2024-01-01',
            10000,
            10000,
            10000,
            '',
            '',
            '',
            '',
            '2024-01-01T00:00:00.000Z',
          ],
        ],
      });
      const repository = createTransactionRepository(sheetRepository);
      const result = repository.listByFundIdsGrouped([
        '三菱UFJ国際投信-eMAXIS',
        '野村アセット-NASDAQ100',
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        const txMap = result.value;
        expect(txMap.size).toBe(2);

        const emaxisTxs = txMap.get('三菱UFJ国際投信-eMAXIS');
        expect(emaxisTxs).toHaveLength(1);

        const nasdaqTxs = txMap.get('野村アセット-NASDAQ100');
        expect(nasdaqTxs).toEqual([]);
      }
    });

    it('空のファンドID配列を渡すと空のMapを返す', () => {
      // 前提: ファンドIDが空配列である
      // 事前条件: 取引シートにデータがある
      // 検証: 空のMapが返される
      const sheetName1 = getTransactionSheetName('fund-1');
      const sheetRepository = createInMemorySheetRepository({
        [sheetName1]: [
          headerRow(SHEET_NAMES.TRANSACTIONS),
          [
            'tx-1',
            'fund-1',
            'SPOT_PURCHASE',
            '2024-01-01',
            10000,
            10000,
            10000,
            '',
            '',
            '',
            '',
            '2024-01-01T00:00:00.000Z',
          ],
        ],
      });
      const repository = createTransactionRepository(sheetRepository);
      const result = repository.listByFundIdsGrouped([]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.size).toBe(0);
      }
    });

    it('空行を除外してグループ化する', () => {
      // 前提: 取引シートに空行が混在する
      // 事前条件: ファンドの取引シートに空行がある
      // 検証: 空行が除外された状態でグループ化される
      const sheetName1 = getTransactionSheetName('fund-1');
      const sheetRepository = createInMemorySheetRepository({
        [sheetName1]: [
          headerRow(SHEET_NAMES.TRANSACTIONS),
          [
            'tx-1',
            'fund-1',
            'SPOT_PURCHASE',
            '2024-01-01',
            10000,
            10000,
            10000,
            '',
            '',
            '',
            '',
            '2024-01-01T00:00:00.000Z',
          ],
          ['', '', '', '', '', '', '', '', '', '', '', ''],
          [
            'tx-2',
            'fund-1',
            'SPOT_PURCHASE',
            '2024-02-01',
            20000,
            11000,
            18182,
            '',
            '',
            '',
            '',
            '2024-02-01T00:00:00.000Z',
          ],
        ],
      });
      const repository = createTransactionRepository(sheetRepository);
      const result = repository.listByFundIdsGrouped(['fund-1']);

      expect(result.success).toBe(true);
      if (result.success) {
        const txMap = result.value;
        const fund1Txs = txMap.get('fund-1');
        expect(fund1Txs).toHaveLength(2);
      }
    });
  });

  describe('マイグレーション失敗の伝播', () => {
    // シートは存在するがヘッダー整合（ensureSheet）が失敗する状況を作るヘルパー。
    // 失敗を握りつぶすと該当ファンドの取引が欠落したまま集計が成功してしまうため、
    // 各読取APIがエラーを即座に伝播することを検証する。
    const createEnsureFailingRepository = () => {
      const sheetName = getTransactionSheetName('fund-1');
      const base = createInMemorySheetRepository({
        [sheetName]: [
          headerRow(SHEET_NAMES.TRANSACTIONS),
          [
            'tx-1',
            'fund-1',
            'SPOT_PURCHASE',
            '2024-01-01',
            10000,
            10000,
            10000,
            '',
            '',
            '',
            '',
            '2024-01-01T00:00:00.000Z',
          ],
        ],
      });
      return {
        ...base,
        ensureSheet: () => fail<never>('unexpected', 'ヘッダー整合に失敗しました'),
      };
    };

    it('listAllはヘッダー整合の失敗をスキップせずエラーとして返す', () => {
      // 前提: fund-1のシートは存在するがヘッダー整合が失敗する
      // 事前条件: ensureSheetが常に失敗するリポジトリを使う
      // 検証: 取引欠落のまま成功を返さず、エラーが伝播する
      const repository = createTransactionRepository(createEnsureFailingRepository());
      const result = repository.listAll(['fund-1']);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('ヘッダー整合に失敗しました');
      }
    });

    it('listByFundIdsGroupedはヘッダー整合の失敗をスキップせずエラーとして返す', () => {
      // 前提: fund-1のシートは存在するがヘッダー整合が失敗する
      // 事前条件: ensureSheetが常に失敗するリポジトリを使う
      // 検証: 取引欠落のまま成功を返さず、エラーが伝播する
      const repository = createTransactionRepository(createEnsureFailingRepository());
      const result = repository.listByFundIdsGrouped(['fund-1']);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('ヘッダー整合に失敗しました');
      }
    });

    it('findByIdempotencyKeyはヘッダー整合の失敗をスキップせずエラーとして返す', () => {
      // 前提: fund-1のシートは存在するがヘッダー整合が失敗する
      // 事前条件: ensureSheetが常に失敗するリポジトリを使う
      // 検証: 「該当なし（null）」と誤判定せず、エラーが伝播する
      const repository = createTransactionRepository(createEnsureFailingRepository());
      const result = repository.findByIdempotencyKey('key-1', ['fund-1']);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('ヘッダー整合に失敗しました');
      }
    });

    it('listAllはシートが存在しないファンドだけをスキップする', () => {
      // 前提: fund-1のシートは存在し、fund-2のシートは存在しない
      // 事前条件: fund-1に取引が1件ある
      // 検証: 不存在のfund-2はスキップされ、fund-1の取引が返る
      const sheetName = getTransactionSheetName('fund-1');
      const sheetRepository = createInMemorySheetRepository({
        [sheetName]: [
          headerRow(SHEET_NAMES.TRANSACTIONS),
          [
            'tx-1',
            'fund-1',
            'SPOT_PURCHASE',
            '2024-01-01',
            10000,
            10000,
            10000,
            '',
            '',
            '',
            '',
            '2024-01-01T00:00:00.000Z',
          ],
        ],
      });
      const repository = createTransactionRepository(sheetRepository);
      const result = repository.listAll(['fund-1', 'fund-2']);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.id).toBe('tx-1');
      }
    });
  });
});
