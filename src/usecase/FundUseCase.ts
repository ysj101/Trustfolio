import { fail, propagateFailure } from '../domain/result';
import type { Fund, Result } from '../domain/types';
import type { FundRepository } from '../repository/FundRepository';
import { WEALTH_ADVISOR_CODE_PATTERN } from '../service/WealthAdvisorService';
import { getFundIdSuffix } from '../Config';
import { generateUlid } from '../utils/ulid';
import { clock } from '../utils/dateTime';

/**
 * 銘柄更新の入力値。
 * navSourceとnavSourceCodeは両方のプロパティが不在（undefined）の場合に既存値を維持し、
 * 両方へ明示的にnullを指定した場合に取得元設定をクリアする。
 */
export type UpdateFundInput = {
  id: string;
  name: string;
  rakutenFundId: string | null;
  settlementBusinessDays: number | null;
  /** undefinedは既存値維持、nullは明示的なクリアを表す。 */
  navSource?: 'wealthadvisor' | null;
  /** undefinedは既存値維持、nullは明示的なクリアを表す。 */
  navSourceCode?: string | null;
};

export type FundUseCase = {
  listFunds: () => Result<Fund[]>;
  createFund: (input: {
    name: string;
    rakutenFundId: string | null;
    settlementBusinessDays: number | null;
    navSource: 'wealthadvisor' | null;
    navSourceCode: string | null;
  }) => Result<Fund>;
  updateFund: (input: UpdateFundInput) => Result<Fund>;
};

/**
 * 投資信託のユースケース。
 */
export function createFundUseCase(fundRepository: FundRepository): FundUseCase {
  return {
    listFunds: (): Result<Fund[]> => {
      return fundRepository.listFunds();
    },
    createFund: (input: {
      name: string;
      rakutenFundId: string | null;
      settlementBusinessDays: number | null;
      navSource: 'wealthadvisor' | null;
      navSourceCode: string | null;
    }): Result<Fund> => {
      const { name, rakutenFundId, settlementBusinessDays, navSource, navSourceCode } = input;

      if (typeof name !== 'string' || name.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '銘柄名を入力してください。', field: 'name' },
        };
      }

      // 楽天ファンドIDのバリデーション（設定されている場合のみ）
      if (rakutenFundId !== null) {
        const codeValidation = validateRakutenFundId(rakutenFundId);
        if (!codeValidation.success) {
          return codeValidation;
        }
      }
      if (settlementBusinessDays !== null) {
        const settlementValidation = validateSettlementBusinessDays(settlementBusinessDays);
        if (!settlementValidation.success) {
          return settlementValidation;
        }
      }
      const navSourceValidation = validateNavSource(rakutenFundId, navSource, navSourceCode);
      if (!navSourceValidation.success) {
        return navSourceValidation;
      }

      const trimmedName = name.trim();
      const existingResult = fundRepository.findByName(trimmedName);
      if (!existingResult.success) {
        return existingResult;
      }
      if (existingResult.value) {
        return {
          success: false,
          error: { type: 'conflict', message: '同名の銘柄が既に存在します。', field: 'name' },
        };
      }

      const fund: Fund = {
        id: generateUlid(),
        name: trimmedName,
        rakutenFundId:
          rakutenFundId !== null && rakutenFundId.trim() !== '' ? rakutenFundId.trim() : null,
        settlementBusinessDays,
        navSource,
        navSourceCode: navSourceValidation.value,
        createdAt: clock.nowIso(),
      };

      const suffixValidation = validateFundIdSuffixUniqueness(fundRepository, fund.id);
      if (!suffixValidation.success) {
        return propagateFailure(suffixValidation);
      }

      const createResult = fundRepository.createFund(fund);
      if (!createResult.success) {
        return propagateFailure(createResult);
      }

      return { success: true, value: fund };
    },
    updateFund: (input: UpdateFundInput): Result<Fund> => {
      const { id, name, rakutenFundId, settlementBusinessDays, navSource, navSourceCode } = input;

      if (typeof id !== 'string' || id.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '銘柄IDが不正です。', field: 'id' },
        };
      }

      if (typeof name !== 'string' || name.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '銘柄名を入力してください。', field: 'name' },
        };
      }

      // 楽天ファンドIDのバリデーション（設定されている場合のみ）
      if (rakutenFundId !== null) {
        const codeValidation = validateRakutenFundId(rakutenFundId);
        if (!codeValidation.success) {
          return codeValidation;
        }
      }
      if (settlementBusinessDays !== null) {
        const settlementValidation = validateSettlementBusinessDays(settlementBusinessDays);
        if (!settlementValidation.success) {
          return settlementValidation;
        }
      }
      if ((navSource === undefined) !== (navSourceCode === undefined)) {
        return fail(
          'validation',
          'NAV取得元と取得元コードは両方を指定するか、両方を省略してください。',
          navSource === undefined ? 'navSource' : 'navSourceCode'
        );
      }

      const existingResult = fundRepository.findById(id);
      if (!existingResult.success) {
        return existingResult;
      }
      if (!existingResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の銘柄が存在しません。', field: 'id' },
        };
      }
      let resolvedNavSource: 'wealthadvisor' | null;
      let resolvedNavSourceCode: string | null;
      if (navSource === undefined && navSourceCode === undefined) {
        resolvedNavSource = existingResult.value.navSource;
        resolvedNavSourceCode = existingResult.value.navSourceCode;
      } else if (navSource !== undefined && navSourceCode !== undefined) {
        resolvedNavSource = navSource;
        resolvedNavSourceCode = navSourceCode;
      } else {
        // 片方だけの省略は上で拒否済みだが、型の絞り込みに依存せず防御的に失敗させる。
        return fail(
          'validation',
          'NAV取得元と取得元コードは両方を指定するか、両方を省略してください。'
        );
      }
      const navSourceValidation = validateNavSource(
        rakutenFundId,
        resolvedNavSource,
        resolvedNavSourceCode
      );
      if (!navSourceValidation.success) {
        return navSourceValidation;
      }

      const trimmedName = name.trim();
      // 同名の他の銘柄が存在するか確認
      const duplicateResult = fundRepository.findByName(trimmedName);
      if (!duplicateResult.success) {
        return duplicateResult;
      }
      if (duplicateResult.value && duplicateResult.value.id !== id) {
        return {
          success: false,
          error: { type: 'conflict', message: '同名の銘柄が既に存在します。', field: 'name' },
        };
      }

      const updatedFund: Fund = {
        id,
        name: trimmedName,
        rakutenFundId:
          rakutenFundId !== null && rakutenFundId.trim() !== '' ? rakutenFundId.trim() : null,
        settlementBusinessDays,
        navSource: resolvedNavSource,
        navSourceCode: navSourceValidation.value,
        createdAt: existingResult.value.createdAt,
      };

      const suffixValidation = validateFundIdSuffixUniqueness(fundRepository, id, id);
      if (!suffixValidation.success) {
        return propagateFailure(suffixValidation);
      }

      const updateResult = fundRepository.updateFund(updatedFund);
      if (!updateResult.success) {
        return propagateFailure(updateResult);
      }

      return { success: true, value: updatedFund };
    },
  };
}

/**
 * 基準価額取得元の組み合わせとWealth Advisor取得元コードを検証・正規化する。
 * 楽天ファンドIDと他取得元の二重指定、および取得元とコードの片側だけの指定を即座に拒否し、
 * 成功時はtrim済みの取得元コードまたは未設定を表すnullを返す。
 */
function validateNavSource(
  rakutenFundId: string | null,
  navSource: 'wealthadvisor' | null,
  navSourceCode: string | null
): Result<string | null> {
  // doPostのJSON境界ではアクション固有フィールドがunknownからキャストされるため、
  // TypeScript上の入力型だけに依存せず実行時の値も検証する。
  if (navSource !== null && navSource !== 'wealthadvisor') {
    return fail('validation', 'NAV取得元が不正です。', 'navSource');
  }
  if (navSourceCode !== null && typeof navSourceCode !== 'string') {
    return fail('validation', '取得元コードは文字列で入力してください。', 'navSourceCode');
  }
  const hasRakutenFundId = rakutenFundId !== null && rakutenFundId.trim() !== '';
  if (hasRakutenFundId && navSource !== null) {
    return fail(
      'validation',
      '基準価額の取得元は楽天ファンドIDか他取得元のどちらか一方だけ指定してください。'
    );
  }
  if (navSource === null) {
    if (navSourceCode !== null) {
      return fail(
        'validation',
        'NAV取得元が未設定の場合、取得元コードは指定できません。',
        'navSourceCode'
      );
    }
    return { success: true, value: null };
  }
  if (navSourceCode === null) {
    return fail('validation', 'Wealth Advisorの取得元コードを入力してください。', 'navSourceCode');
  }
  const trimmedNavSourceCode = navSourceCode.trim();
  if (trimmedNavSourceCode === '') {
    return fail('validation', 'Wealth Advisorの取得元コードを入力してください。', 'navSourceCode');
  }
  if (!WEALTH_ADVISOR_CODE_PATTERN.test(trimmedNavSourceCode)) {
    return fail(
      'validation',
      'Wealth Advisorの取得元コードは<company>/<pageId>形式で入力してください。',
      'navSourceCode'
    );
  }
  return { success: true, value: trimmedNavSourceCode };
}

/**
 * 楽天ファンドIDのバリデーション。
 * 12桁の英数字であることを確認する。
 */
function validateRakutenFundId(code: string): Result<void> {
  const trimmed = code.trim();
  if (trimmed === '') {
    return { success: true, value: undefined };
  }
  if (!/^[A-Za-z0-9]{12}$/.test(trimmed)) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: '楽天ファンドIDは12桁の英数字で入力してください。',
        field: 'rakutenFundId',
      },
    };
  }
  return { success: true, value: undefined };
}

/**
 * 約定までの営業日数のバリデーション。
 * 0以上の整数であることを確認する。
 */
function validateSettlementBusinessDays(value: number): Result<void> {
  if (!Number.isInteger(value) || value < 0) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: '約定までの営業日数は0以上の整数で入力してください。',
        field: 'settlementBusinessDays',
      },
    };
  }
  return { success: true, value: undefined };
}

/**
 * ファンドID末尾3文字の重複を検知する。
 * ファンド別シート名の重複を防ぐために使用する。
 *
 * @param fundRepository ファンドリポジトリ
 * @param targetFundId 検証対象のファンドID
 * @param excludeFundId 検証から除外するファンドID（更新時の自分自身）
 * @returns 重複がなければ成功、重複があれば競合エラー
 */
function validateFundIdSuffixUniqueness(
  fundRepository: FundRepository,
  targetFundId: string,
  excludeFundId?: string
): Result<void> {
  const listResult = fundRepository.listFunds();
  if (!listResult.success) {
    return propagateFailure(listResult);
  }

  const targetSuffix = getFundIdSuffix(targetFundId);
  const duplicate = listResult.value.find((fund) => {
    if (excludeFundId !== undefined && fund.id === excludeFundId) {
      return false;
    }
    return getFundIdSuffix(fund.id) === targetSuffix;
  });

  if (duplicate) {
    return {
      success: false,
      error: {
        type: 'conflict',
        message: `ファンドID末尾3文字が重複しています。対象末尾: ${targetSuffix}`,
      },
    };
  }

  return { success: true, value: undefined };
}
