import { describe, expect, it, vi } from 'vitest';
import { createFundUseCase } from '../../src/usecase/FundUseCase';
import type { FundRepository } from '../../src/repository/FundRepository';
import type { Fund } from '../../src/domain/types';
import { ok, fail } from '../fakes';

function createFundRepository(seed: Fund[] = []): FundRepository {
  const funds = [...seed];
  return {
    listFunds: () => ok([...funds]),
    findByName: (name) => ok(funds.find((item) => item.name === name) ?? null),
    findById: (id) => ok(funds.find((item) => item.id === id) ?? null),
    createFund: (fund) => {
      funds.push(fund);
      return ok(undefined);
    },
    updateFund: (fund) => {
      const index = funds.findIndex((item) => item.id === fund.id);
      if (index === -1) {
        return fail('not_found', `対象の銘柄が見つかりません: id=${fund.id}`);
      }
      funds[index] = fund;
      return ok(undefined);
    },
    updateAssetClass: (id, assetClass) => {
      const index = funds.findIndex((item) => item.id === id);
      if (index === -1) {
        return fail('not_found', `対象の銘柄が見つかりません: id=${id}`);
      }
      const existingFund = funds[index];
      if (existingFund === undefined) {
        return fail('unexpected', `更新対象の銘柄を取得できません: id=${id}`);
      }
      funds[index] = { ...existingFund, assetClass };
      return ok(undefined);
    },
  };
}

describe('FundUseCase', () => {
  it('銘柄名が空の場合はバリデーションエラーになる', () => {
    // 前提: 銘柄名が空文字列である
    // 事前条件: リポジトリは空である
    // 検証: nameフィールドのエラーが返る
    const repository = createFundRepository();
    const useCase = createFundUseCase(repository);
    const result = useCase.createFund({
      name: ' ',
      rakutenFundId: null,
      settlementBusinessDays: null,
      navSource: null,
      navSourceCode: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('name');
    }
  });

  it('同名銘柄が存在する場合は競合エラーになる', () => {
    // 前提: 既に同名の銘柄が存在する
    // 事前条件: リポジトリに銘柄を登録済みとする
    // 検証: conflictエラーが返る
    const repository = createFundRepository([
      {
        id: 'fund-1',
        name: 'つみたて日本株',
        rakutenFundId: null,
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: 'equity',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ]);
    const useCase = createFundUseCase(repository);
    const result = useCase.createFund({
      name: 'つみたて日本株',
      rakutenFundId: ' ABCD1234EFGH ',
      settlementBusinessDays: 3,
      navSource: null,
      navSourceCode: null,
      assetClass: 'equity',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('conflict');
    }
  });

  it('銘柄を作成するとIDと作成日時が設定される', () => {
    // 前提: 銘柄名と楽天ファンドIDが有効である
    // 事前条件: リポジトリに同名銘柄が存在しない
    // 検証: 銘柄が作成され、トリム後の値が保持される
    const repository = createFundRepository();
    const useCase = createFundUseCase(repository);
    const result = useCase.createFund({
      name: '  世界株インデックス  ',
      rakutenFundId: ' ABCD1234EFGH ',
      settlementBusinessDays: 2,
      navSource: null,
      navSourceCode: null,
      assetClass: 'equity',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.name).toBe('世界株インデックス');
      expect(result.value.rakutenFundId).toBe('ABCD1234EFGH');
      expect(result.value.id).not.toBe('');
      expect(result.value.createdAt).toContain('T');
    }
  });

  it.each(['', undefined, null, 'bond', 1])(
    '作成時の不正な資産クラス %s を拒否する',
    (assetClass) => {
      // 前提: 銘柄名、楽天ファンドID、約定営業日数、NAV取得元は妥当である。
      // 事前条件: assetClassは登録フォームの未選択値（空文字列）、未指定相当、null、定義外文字列、または数値である。
      // 検証: assetClassフィールドの同一validationエラーで拒否され、リポジトリのcreateFundは一度も呼ばれない。
      const repository = createFundRepository();
      const createFundSpy = vi.spyOn(repository, 'createFund');
      const result = createFundUseCase(repository).createFund({
        name: 'ＳＢＩ・iシェアーズ・ゴールドファンド',
        rakutenFundId: null,
        settlementBusinessDays: 2,
        navSource: null,
        navSourceCode: null,
        assetClass: assetClass as never,
      });

      expect(result).toEqual({
        success: false,
        error: {
          type: 'validation',
          message: '資産クラスを選択してください。',
          field: 'assetClass',
        },
      });
      expect(createFundSpy).not.toHaveBeenCalled();
    }
  );

  it('更新対象が存在しない場合はnot_foundになる', () => {
    // 前提: 更新対象のIDが存在しない
    // 事前条件: リポジトリは空である
    // 検証: not_foundエラーが返る
    const repository = createFundRepository();
    const useCase = createFundUseCase(repository);
    const result = useCase.updateFund({
      id: 'missing-id',
      name: '国内債券ファンド',
      rakutenFundId: null,
      settlementBusinessDays: null,
      navSource: null,
      navSourceCode: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('not_found');
    }
  });

  it('同名の別銘柄が存在する場合は競合エラーになる', () => {
    // 前提: 同名の別銘柄が存在する
    // 事前条件: 2つの銘柄が登録済み
    // 検証: conflictエラーが返る
    const repository = createFundRepository([
      {
        id: 'fund-1',
        name: '新興国株式',
        rakutenFundId: null,
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: 'equity',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'fund-2',
        name: '国内債券',
        rakutenFundId: null,
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: 'equity',
        createdAt: '2024-01-02T00:00:00.000Z',
      },
    ]);
    const useCase = createFundUseCase(repository);
    const result = useCase.updateFund({
      id: 'fund-2',
      name: '新興国株式',
      rakutenFundId: null,
      settlementBusinessDays: null,
      navSource: null,
      navSourceCode: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('conflict');
    }
  });

  it('更新時は作成日時を維持する', () => {
    // 前提: 更新対象が存在する
    // 事前条件: 作成日時が設定されている
    // 検証: 更新後もcreatedAtが保持される
    const repository = createFundRepository([
      {
        id: 'fund-1',
        name: '国内株式',
        rakutenFundId: 'ABCD1234EFGH',
        settlementBusinessDays: 1,
        navSource: null,
        navSourceCode: null,
        assetClass: 'equity',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ]);
    const useCase = createFundUseCase(repository);
    const result = useCase.updateFund({
      id: 'fund-1',
      name: '国内株式（更新後）',
      rakutenFundId: 'ABCD1234EFGH',
      settlementBusinessDays: 2,
      navSource: null,
      navSourceCode: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(result.value.name).toBe('国内株式（更新後）');
    }
  });

  it('ファンドID末尾3文字が重複する場合は更新を拒否する', () => {
    // 前提: 更新対象以外のファンドと末尾3文字が一致する
    // 事前条件: 2件のファンドが存在し、末尾3文字が一致する
    // 検証: conflictエラーが返る
    const repository = createFundRepository([
      {
        id: 'fund-999',
        name: '国内債券',
        rakutenFundId: null,
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: 'equity',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'abc999',
        name: '国内株式',
        rakutenFundId: null,
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: 'equity',
        createdAt: '2024-01-02T00:00:00.000Z',
      },
    ]);
    const useCase = createFundUseCase(repository);
    const result = useCase.updateFund({
      id: 'fund-999',
      name: '国内債券（更新）',
      rakutenFundId: null,
      settlementBusinessDays: null,
      navSource: null,
      navSourceCode: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('conflict');
    }
  });

  it('wealthadvisor取得元と正しい取得元コードで銘柄を作成する', () => {
    // 前提: SBI証券限定販売ファンドには楽天ファンドIDが存在しない。
    // 事前条件: navSourceとnavSourceCodeを組で指定する。
    // 検証: 取得元コードがトリムされて作成結果へ保持される。
    const useCase = createFundUseCase(createFundRepository());
    const result = useCase.createFund({
      name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）',
      rakutenFundId: null,
      settlementBusinessDays: 2,
      navSource: 'wealthadvisor',
      navSourceCode: ' sbi_am/sa_202306080A ',
      assetClass: 'gold',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.navSource).toBe('wealthadvisor');
      expect(result.value.navSourceCode).toBe('sbi_am/sa_202306080A');
      expect(result.value.assetClass).toBe('gold');
    }
  });

  it('wealthadvisor取得元で取得元コードが欠落した場合はvalidationエラーになる', () => {
    // 前提: navSourceだけがwealthadvisorに設定されている。
    // 事前条件: navSourceCodeはnullである。
    // 検証: navSourceCodeフィールドのvalidationエラーを返す。
    const result = createFundUseCase(createFundRepository()).createFund({
      name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）',
      rakutenFundId: null,
      settlementBusinessDays: 2,
      navSource: 'wealthadvisor',
      navSourceCode: null,
      assetClass: 'gold',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
      expect(result.error.field).toBe('navSourceCode');
    }
  });

  it('wealthadvisor取得元コードの形式が不正な場合はvalidationエラーになる', () => {
    // 前提: navSourceはwealthadvisorだが取得元コードにcompanyとpageIdの区切りがない。
    // 事前条件: 楽天ファンドIDは未設定である。
    // 検証: navSourceCodeフィールドのvalidationエラーを返す。
    const result = createFundUseCase(createFundRepository()).createFund({
      name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）',
      rakutenFundId: null,
      settlementBusinessDays: 2,
      navSource: 'wealthadvisor',
      navSourceCode: 'sbi_am',
      assetClass: 'gold',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
      expect(result.error.field).toBe('navSourceCode');
    }
  });

  it('NAV取得元が未設定で取得元コードだけがある場合はvalidationエラーになる', () => {
    // 前提: navSourceはnullだがnavSourceCodeが指定されている。
    // 事前条件: 楽天ファンドIDも未設定である。
    // 検証: 片側だけの指定をvalidationエラーで拒否する。
    const result = createFundUseCase(createFundRepository()).createFund({
      name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）',
      rakutenFundId: null,
      settlementBusinessDays: 2,
      navSource: null,
      navSourceCode: 'sbi_am/sa_202306080A',
      assetClass: 'gold',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
    }
  });

  it('楽天ファンドIDとwealthadvisor取得元の二重指定はvalidationエラーになる', () => {
    // 前提: 1銘柄に楽天ファンドIDとWealth Advisor取得元が両方指定されている。
    // 事前条件: 各コード単独の形式は正しい。
    // 検証: 取得元の排他制約をvalidationエラーで適用する。
    const result = createFundUseCase(createFundRepository()).createFund({
      name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）',
      rakutenFundId: 'ABCD1234EFGH',
      settlementBusinessDays: 2,
      navSource: 'wealthadvisor',
      navSourceCode: 'sbi_am/sa_202306080A',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
      expect(result.error.message).toContain('どちらか一方');
    }
  });

  it('更新時も楽天ファンドIDとwealthadvisor取得元の二重指定を拒否する', () => {
    // 前提: 更新対象のSBIファンドが登録済みである。
    // 事前条件: 更新入力に楽天ファンドIDとWealth Advisor取得元を両方指定する。
    // 検証: 永続化前にvalidationエラーを返す。
    const repository = createFundRepository([
      {
        id: 'fund-sbi-gold',
        name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）',
        rakutenFundId: null,
        settlementBusinessDays: 2,
        navSource: 'wealthadvisor',
        navSourceCode: 'sbi_am/sa_202306080A',
        assetClass: 'gold',
        createdAt: '2026-09-02T00:00:00.000Z',
      },
    ]);
    const result = createFundUseCase(repository).updateFund({
      id: 'fund-sbi-gold',
      name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）',
      rakutenFundId: 'ABCD1234EFGH',
      settlementBusinessDays: 2,
      navSource: 'wealthadvisor',
      navSourceCode: 'sbi_am/sa_202306080A',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
    }
  });

  it('旧形式更新で取得元2項目を省略した場合は既存のWealth Advisor設定を維持する', () => {
    // 前提: Wealth Advisor取得元が設定済みのSBI証券限定販売ファンドが存在する。
    // 事前条件: 旧形式クライアントがnavSourceとnavSourceCodeを含めずに名称を更新する。
    // 検証: 更新後も既存の取得元種別と取得元コードが維持される。
    const repository = createFundRepository([
      {
        id: 'fund-sbi-gold',
        name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）',
        rakutenFundId: null,
        settlementBusinessDays: 2,
        navSource: 'wealthadvisor',
        navSourceCode: 'sbi_am/sa_202306080A',
        assetClass: 'gold',
        createdAt: '2026-09-02T00:00:00.000Z',
      },
    ]);
    const result = createFundUseCase(repository).updateFund({
      id: 'fund-sbi-gold',
      name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（更新）',
      rakutenFundId: null,
      settlementBusinessDays: 3,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.navSource).toBe('wealthadvisor');
      expect(result.value.navSourceCode).toBe('sbi_am/sa_202306080A');
      expect(result.value.assetClass).toBe('gold');
    }
  });

  it('資産クラスだけを設定し、既存銘柄の他項目を変更しない', () => {
    // 前提: 12桁形式ではない既存楽天ファンドIDを持つ、資産クラス未設定の銘柄が存在する。
    // 事前条件: 専用処理へgoldを指定し、汎用更新で要求される他項目は入力しない。
    // 検証: 他項目の再検証で拒否されず、assetClassだけがgoldへ変更される。
    const existingFund: Fund = {
      id: 'fund-sbi-gold',
      name: 'ＳＢＩ・iシェアーズ・ゴールドファンド',
      rakutenFundId: '旧形式ID',
      settlementBusinessDays: 2,
      navSource: null,
      navSourceCode: null,
      assetClass: null,
      createdAt: '2026-09-02T00:00:00.000Z',
    };
    const repository = createFundRepository([existingFund]);
    repository.updateFund = () =>
      fail('unexpected', '資産クラス専用設定から汎用更新が呼び出されました。');

    const result = createFundUseCase(repository).setFundAssetClass({
      id: existingFund.id,
      assetClass: 'gold',
    });

    expect(result).toEqual({
      success: true,
      value: { ...existingFund, assetClass: 'gold' },
    });
    expect(repository.findById(existingFund.id)).toEqual({
      success: true,
      value: { ...existingFund, assetClass: 'gold' },
    });
  });

  it.each(['', undefined, null, 'bond', 1])(
    '資産クラス専用設定で不正値 %s を拒否する',
    (assetClass) => {
      // 前提: 資産クラス未設定の既存銘柄が登録されている。
      // 事前条件: assetClassは一覧selectの未選択値（空文字列）、未指定相当、null、定義外文字列、または数値である。
      // 検証: assetClassフィールドのvalidationエラーを返し、リポジトリのupdateAssetClassは一度も呼ばれない（書き込み前に fail fast）。
      const repository = createFundRepository([
        {
          id: 'fund-sbi-gold',
          name: 'ＳＢＩ・iシェアーズ・ゴールドファンド',
          rakutenFundId: null,
          settlementBusinessDays: 2,
          navSource: null,
          navSourceCode: null,
          assetClass: null,
          createdAt: '2026-09-02T00:00:00.000Z',
        },
      ]);
      const updateAssetClassSpy = vi.spyOn(repository, 'updateAssetClass');
      const result = createFundUseCase(repository).setFundAssetClass({
        id: 'fund-sbi-gold',
        assetClass: assetClass as never,
      });

      expect(result).toEqual({
        success: false,
        error: {
          type: 'validation',
          message: '資産クラスを選択してください。',
          field: 'assetClass',
        },
      });
      expect(updateAssetClassSpy).not.toHaveBeenCalled();
    }
  );

  it('資産クラス設定対象が存在しない場合はnot_foundを返す', () => {
    // 前提: リポジトリに対象銘柄が存在しない。
    // 事前条件: idとassetClassは妥当である。
    // 検証: idフィールドを持つnot_foundエラーを返す。
    const result = createFundUseCase(createFundRepository()).setFundAssetClass({
      id: 'fund-not-found',
      assetClass: 'gold',
    });

    expect(result).toEqual({
      success: false,
      error: {
        type: 'not_found',
        message: '対象の銘柄が存在しません。',
        field: 'id',
      },
    });
  });

  it('更新時に取得元2項目へ明示的なnullを指定すると既存設定をクリアする', () => {
    // 前提: Wealth Advisor取得元が設定済みのSBI証券限定販売ファンドが存在する。
    // 事前条件: navSourceとnavSourceCodeの両方へ明示的にnullを指定する。
    // 検証: 更新後の取得元種別と取得元コードが両方nullになる。
    const repository = createFundRepository([
      {
        id: 'fund-sbi-gold',
        name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）',
        rakutenFundId: null,
        settlementBusinessDays: 2,
        navSource: 'wealthadvisor',
        navSourceCode: 'sbi_am/sa_202306080A',
        assetClass: 'gold',
        createdAt: '2026-09-02T00:00:00.000Z',
      },
    ]);
    const result = createFundUseCase(repository).updateFund({
      id: 'fund-sbi-gold',
      name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（取得元解除）',
      rakutenFundId: null,
      settlementBusinessDays: 2,
      navSource: null,
      navSourceCode: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.navSource).toBeNull();
      expect(result.value.navSourceCode).toBeNull();
    }
  });

  it('更新時に取得元2項目の片方だけを省略するとvalidationエラーになる', () => {
    // 前提: Wealth Advisor取得元が設定済みのファンドが存在する。
    // 事前条件: navSourceを省略し、navSourceCodeだけを明示する。
    // 検証: 既存値との暗黙結合を行わずvalidationエラーで拒否する。
    const repository = createFundRepository([
      {
        id: 'fund-sbi-gold',
        name: 'ＳＢＩ・限定販売ファンド',
        rakutenFundId: null,
        settlementBusinessDays: 2,
        navSource: 'wealthadvisor',
        navSourceCode: 'sbi_am/sa_202306080A',
        assetClass: 'gold',
        createdAt: '2026-09-02T00:00:00.000Z',
      },
    ]);
    const result = createFundUseCase(repository).updateFund({
      id: 'fund-sbi-gold',
      name: 'ＳＢＩ・限定販売ファンド',
      rakutenFundId: null,
      settlementBusinessDays: 2,
      navSource: undefined,
      navSourceCode: 'sbi_am/sa_202306080A',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
      expect(result.error.field).toBe('navSource');
    }
  });

  it('存在しないIDと不正な入力を同時に渡した更新では入力のvalidationエラーを優先する', () => {
    // 前提: リポジトリは空で、更新対象のIDは存在しない。
    // 事前条件: 銘柄名が空文字列（不正）で、かつ ID も存在しない。
    // 検証: 存在確認（not_found）より先に入力検証が走り、name フィールドの validation エラーが返る。
    const result = createFundUseCase(createFundRepository()).updateFund({
      id: 'missing-id',
      name: ' ',
      rakutenFundId: null,
      settlementBusinessDays: null,
      navSource: null,
      navSourceCode: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
      expect(result.error.field).toBe('name');
    }
  });

  it('存在しないIDと不正な資産クラスを同時に渡した専用設定では資産クラスのvalidationエラーを優先する', () => {
    // 前提: リポジトリは空で、対象のIDは存在しない。
    // 事前条件: assetClass が定義外の文字列（bond）で、かつ ID も存在しない。
    // 検証: 存在確認（not_found）より先に入力検証が走り、assetClass フィールドの validation エラーが返る。
    const result = createFundUseCase(createFundRepository()).setFundAssetClass({
      id: 'missing-id',
      assetClass: 'bond' as never,
    });
    expect(result).toEqual({
      success: false,
      error: { type: 'validation', message: '資産クラスを選択してください。', field: 'assetClass' },
    });
  });

  it('存在しないIDと不正なNAV取得元コードを同時に渡した更新ではnavSourceCodeのvalidationエラーを優先する', () => {
    // 前提: リポジトリは空で、更新対象のIDは存在しない。
    // 事前条件: NAV取得元ペアを明示指定し、取得元コードが <company>/<pageId> 形式でない。
    // 検証: 明示指定された取得元ペアは検索前に検証され、not_found より先に navSourceCode の validation エラーが返る。
    const result = createFundUseCase(createFundRepository()).updateFund({
      id: 'missing-id',
      name: 'ＳＢＩ・iシェアーズ・ゴールドファンド',
      rakutenFundId: null,
      settlementBusinessDays: null,
      navSource: 'wealthadvisor',
      navSourceCode: '形式不正コード',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
      expect(result.error.field).toBe('navSourceCode');
    }
  });

  it.each([undefined, 12345, ['JP90C000H1T1'], { code: 'JP90C000H1T1' }])(
    '文字列以外の楽天ファンドID %s は例外ではなくvalidationエラーで拒否する',
    (rakutenFundId) => {
      // 前提: doPost の JSON 境界では rakutenFundId に文字列以外や省略（undefined）が渡り得る。
      // 事前条件: 銘柄名・約定営業日数・資産クラスは妥当である。
      // 検証: TypeError を発生させず、rakutenFundId フィールドの validation エラーを返す。
      const result = createFundUseCase(createFundRepository()).createFund({
        name: '世界株インデックス',
        rakutenFundId: rakutenFundId as never,
        settlementBusinessDays: 2,
        navSource: null,
        navSourceCode: null,
        assetClass: 'equity',
      });
      expect(result).toEqual({
        success: false,
        error: {
          type: 'validation',
          message: '楽天ファンドIDは12桁の英数字で入力してください。',
          field: 'rakutenFundId',
        },
      });
    }
  );
});
