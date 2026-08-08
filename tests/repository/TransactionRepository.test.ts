import { describe, expect, it } from 'vitest';
import { createTransactionRepository } from '../../src/repository/TransactionRepository';
import { getTransactionSheetName, SHEET_NAMES } from '../../src/Config';
import { createInMemorySheetRepository, fail, headerRow } from '../fakes';

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
