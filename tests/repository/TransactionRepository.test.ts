import { describe, expect, it } from 'vitest';
import { createTransactionRepository } from '../../src/repository/TransactionRepository';
import { getTransactionSheetName, SHEET_NAMES } from '../../src/Config';
import { createInMemorySheetRepository, headerRow } from '../fakes';

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
          '2024-01-01T00:00:00.000Z',
        ],
        ['', '', '', '', '', '', '', '', '', ''],
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
            '2024-01-01T00:00:00.000Z',
          ],
          ['', '', '', '', '', '', '', '', '', ''],
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
});
