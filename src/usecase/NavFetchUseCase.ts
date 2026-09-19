import { calculateHolding, calculatePortfolio } from '../domain/HoldingCalculator';
import type { FetchedNavData, Fund, Nav, PerformanceRecord, Result } from '../domain/types';
import type { FundRepository } from '../repository/FundRepository';
import type { NavRepository } from '../repository/NavRepository';
import type { PerformanceRepository } from '../repository/PerformanceRepository';
import type { TransactionRepository } from '../repository/TransactionRepository';
import type { RakutenService } from '../service/RakutenService';
import type { WealthAdvisorService } from '../service/WealthAdvisorService';
import { logError } from '../utils/logger';
import { clock } from '../utils/dateTime';
import { requireMapValue } from './mapGuard';

/**
 * 基準価額の自動取得結果（1銘柄分）。
 */
export type NavFetchResultItem = {
  /** 銘柄ID */
  fundId: string;
  /** 銘柄名 */
  fundName: string;
  /** 処理結果のステータス */
  status: 'success' | 'skipped' | 'failed' | 'already_exists';
  /** エラーメッセージ（失敗時のみ） */
  message?: string;
  /** 取得した基準価額（成功時のみ） */
  nav?: Nav;
};

/**
 * 実績記録（パフォーマンスシートへの永続化）失敗の内訳。
 *
 * 「基準価額（NAV）の取得・登録は成功したが、実績シートへの書き込みに失敗した」ケースを表す。
 * このケースは同一日付の再実行では自動回復されない（NAV が「既存」と判定され実績記録が再試行
 * されない）ため、手動復旧が必要な静かなデータロストとなる。運用者への通知（`main.ts` の
 * `fetchAllNavs`）で用いるため、失敗した種別・銘柄・理由を保持する。
 *
 * `scope` を判別子とする判別可能ユニオンで表現する。「全体実績失敗は銘柄に紐づかない（fundId・
 * fundName は null）」「ファンド別実績失敗は銘柄に紐づく（fundId・fundName は非 null の文字列）」
 * という不変条件を型自身にエンコードすることで、通知整形時に銘柄情報の有無を型で保証し、
 * 到達不能なフォールバック（暗黙のフォールバック）を排除する。
 */
export type PerformanceRecordFailure =
  | {
      /** 全体実績シートへの記録失敗。銘柄に紐づかないため fundId・fundName は null。 */
      scope: 'global';
      fundId: null;
      fundName: null;
      /** 失敗理由（元の {@link Result} 失敗時のエラーメッセージ）。 */
      message: string;
    }
  | {
      /** ファンド別実績シートへの記録失敗。対象銘柄の fundId・fundName を保持する。 */
      scope: 'fund';
      fundId: string;
      fundName: string;
      /** 失敗理由（元の {@link Result} 失敗時のエラーメッセージ）。 */
      message: string;
    };

/**
 * 基準価額の自動取得結果（全体）。
 */
export type NavFetchResult = {
  /** 処理した銘柄数 */
  totalCount: number;
  /** 成功した銘柄数 */
  successCount: number;
  /** スキップした銘柄数（基準価額取得元未設定） */
  skippedCount: number;
  /** 既に登録済みの銘柄数 */
  alreadyExistsCount: number;
  /** 失敗した銘柄数 */
  failedCount: number;
  /** 各銘柄の処理結果 */
  items: NavFetchResultItem[];
  /**
   * 実績記録に失敗した内訳（全体実績・ファンド別実績）。
   *
   * ここに含まれる失敗は「NAV の取得・登録は成功したが実績シートへの永続化に失敗」したもので、
   * 自動回復されないデータロストである。空配列の場合は実績記録失敗が無かったことを表す。
   * `main.ts` の `fetchAllNavs` はこの配列が空でなければ運用者へエラー通知メールを送信する。
   */
  performanceFailures: PerformanceRecordFailure[];
};

/**
 * {@link PerformanceRecordFailure}（実績記録失敗の内訳）の型ガード関数。
 *
 * `main.ts` の `fetchAllNavs` は実績記録失敗の内訳を運用者通知メールの本文へ整形するため、
 * 想定外の構造（scope 不正・message 欠落・scope と fundId/fundName の不整合）が混入した状態で
 * 本文整形へ進むと、undefined 等の不正値を含む通知を送ってしまう。これを防ぐため、要素構造を
 * fail fast で検証し、不正要素があれば {@link isNavFetchResult} を通じて NavFetchResult 全体を
 * 不正と判定する。
 *
 * 検証規則（{@link PerformanceRecordFailure} の不変条件に一致させる）:
 * - `scope` は 'global' または 'fund' のいずれか。
 * - `message` は空でない文字列。
 * - `scope='global'`（全体実績失敗）は銘柄に紐づかないため `fundId`・`fundName` はともに null。
 * - `scope='fund'`（ファンド別実績失敗）は銘柄に紐づくため `fundId`・`fundName` は空でない文字列。
 *
 * 配置について: 本型ガードは結果型を定義する本モジュールに同居させる（H2 #148）。
 * 型の不変条件が変わった際に、型定義と検証規則を同一ファイル内で同期させるためである。
 */
export function isPerformanceRecordFailure(value: unknown): value is PerformanceRecordFailure {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if (obj.scope !== 'global' && obj.scope !== 'fund') {
    return false;
  }
  if (typeof obj.message !== 'string' || obj.message === '') {
    return false;
  }
  if (obj.scope === 'global') {
    return obj.fundId === null && obj.fundName === null;
  }
  return (
    typeof obj.fundId === 'string' &&
    obj.fundId !== '' &&
    typeof obj.fundName === 'string' &&
    obj.fundName !== ''
  );
}

/**
 * {@link NavFetchResult} の型ガード関数。
 *
 * `main.ts` の `fetchAllNavs` が API レスポンス（unknown）を結果型として扱う前の
 * ランタイム検証に用いる。`performanceFailures` は要素構造まで
 * {@link isPerformanceRecordFailure} で fail fast に検証する。
 */
export function isNavFetchResult(value: unknown): value is NavFetchResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.totalCount === 'number' &&
    typeof obj.successCount === 'number' &&
    typeof obj.alreadyExistsCount === 'number' &&
    typeof obj.skippedCount === 'number' &&
    typeof obj.failedCount === 'number' &&
    Array.isArray(obj.items) &&
    Array.isArray(obj.performanceFailures) &&
    obj.performanceFailures.every(isPerformanceRecordFailure)
  );
}

export type NavFetchUseCase = {
  /**
   * 全銘柄の最新基準価額を設定された取得元から取得し、登録する。
   * 基準価額取得元が設定されていない銘柄はスキップする。
   * 同一日付の基準価額が既に登録されている場合もスキップする。
   */
  fetchAndRegisterAllNavs: () => Result<NavFetchResult>;
};

/**
 * 基準価額自動取得ユースケースを作成する。
 */
export function createNavFetchUseCase(
  fundRepository: FundRepository,
  navRepository: NavRepository,
  transactionRepository: TransactionRepository,
  performanceRepository: PerformanceRepository,
  rakutenService: RakutenService,
  wealthAdvisorService: WealthAdvisorService
): NavFetchUseCase {
  return {
    fetchAndRegisterAllNavs: (): Result<NavFetchResult> => {
      // 全銘柄を取得
      const fundsResult = fundRepository.listFunds();
      if (!fundsResult.success) {
        return fundsResult;
      }

      const funds = fundsResult.value;
      const items: NavFetchResultItem[] = [];
      // 実績記録失敗の内訳を蓄積する（全体実績・ファンド別実績の双方を集約する）。
      const performanceFailures: PerformanceRecordFailure[] = [];

      for (const fund of funds) {
        const outcome = processFund(
          fund,
          navRepository,
          transactionRepository,
          performanceRepository,
          rakutenService,
          wealthAdvisorService
        );
        items.push(outcome.item);
        if (outcome.performanceFailure !== null) {
          performanceFailures.push(outcome.performanceFailure);
        }
      }

      // 集計
      const successCount = items.filter((i) => i.status === 'success').length;
      const skippedCount = items.filter((i) => i.status === 'skipped').length;
      const alreadyExistsCount = items.filter((i) => i.status === 'already_exists').length;
      const failedCount = items.filter((i) => i.status === 'failed').length;

      // 基準価額が1件でも登録された場合、全体実績を記録
      if (successCount > 0) {
        const latestDate = items
          .filter((i) => i.status === 'success' && i.nav !== undefined)
          .map((i) => i.nav?.date ?? '')
          .filter((d) => d !== '')
          .sort()
          .reverse()[0];

        if (latestDate !== '') {
          const globalResult = recordGlobalPerformance(
            latestDate,
            funds,
            transactionRepository,
            navRepository,
            performanceRepository
          );

          if (!globalResult.success) {
            // 基準価額の取得・登録は成功したが全体実績シートへの永続化に失敗したケース。
            // 同一日付の再実行は NAV が「既存」と判定され実績記録が再試行されないため、
            // この日付の全体実績行は自動回復されず欠落する（手動復旧が必要なデータロスト）。
            // 気付きにくい静かな欠落を grep・目視で検知できるよう [ERROR] で記録する（#137）。
            logError(`全体実績記録に失敗: ${globalResult.error.message}`);
            // 運用者への通知（#144）のため、全体実績失敗を内訳へ記録する。
            performanceFailures.push({
              scope: 'global',
              fundId: null,
              fundName: null,
              message: globalResult.error.message,
            });
          } else {
            Logger.log(`全体実績記録成功: ${latestDate}`);
          }
        }
      }

      return {
        success: true,
        value: {
          totalCount: funds.length,
          successCount,
          skippedCount,
          alreadyExistsCount,
          failedCount,
          items,
          performanceFailures,
        },
      };
    },
  };
}

/**
 * {@link processFund} の処理結果。
 *
 * 銘柄単位の処理結果（{@link NavFetchResultItem}）に加えて、
 * 「NAV 登録は成功したがファンド別実績記録に失敗した」場合の失敗内訳を併せて返す。
 * 実績記録失敗は NAV 取得自体の成否（`item.status`）とは独立した事象であるため、
 * `item` に混ぜず別フィールドとして表現する（成功時も `item.status` は 'success' のまま）。
 */
type ProcessFundOutcome = {
  /** 銘柄単位の処理結果。 */
  item: NavFetchResultItem;
  /** ファンド別実績記録の失敗内訳。失敗が無い場合は null。 */
  performanceFailure: PerformanceRecordFailure | null;
};

/**
 * 1銘柄の基準価額取得・登録処理を実行する。
 */
function processFund(
  fund: Fund,
  navRepository: NavRepository,
  transactionRepository: TransactionRepository,
  performanceRepository: PerformanceRepository,
  rakutenService: RakutenService,
  wealthAdvisorService: WealthAdvisorService
): ProcessFundOutcome {
  // FundRepositoryは不正な組み合わせを読取時に拒否するが、将来別経路からFundが渡されても
  // 外部取得へ進まないよう、二重指定とコード欠落の防御的検証をここにも維持する。
  if (fund.navSource === 'wealthadvisor' && fund.rakutenFundId !== null) {
    return {
      item: {
        fundId: fund.id,
        fundName: fund.name,
        status: 'failed',
        message: '取得元が二重に指定されています。',
      },
      performanceFailure: null,
    };
  }

  // 取得元を明示的に分岐し、別取得元への暗黙フォールバックを行わない。
  // FundRepositoryで拒否する孤立コードもFund型では表現可能なため、別経路から渡された場合を防御する。
  let fetchResult: Result<{ nav: FetchedNavData }>;
  if (fund.navSource === 'wealthadvisor') {
    if (fund.navSourceCode === null) {
      return {
        item: {
          fundId: fund.id,
          fundName: fund.name,
          status: 'failed',
          message: 'Wealth Advisorの取得元コードが設定されていません。',
        },
        performanceFailure: null,
      };
    }
    fetchResult = wealthAdvisorService.fetchLatestNav(fund.navSourceCode);
  } else if (fund.navSource === null && fund.navSourceCode === null) {
    if (fund.rakutenFundId === null) {
      return {
        item: {
          fundId: fund.id,
          fundName: fund.name,
          status: 'skipped',
          message: '基準価額の取得元が設定されていません。',
        },
        performanceFailure: null,
      };
    }
    fetchResult = rakutenService.fetchLatestNav(fund.rakutenFundId);
  } else {
    return {
      item: {
        fundId: fund.id,
        fundName: fund.name,
        status: 'failed',
        message: '取得元の設定が不整合です。',
      },
      performanceFailure: null,
    };
  }
  if (!fetchResult.success) {
    return {
      item: {
        fundId: fund.id,
        fundName: fund.name,
        status: 'failed',
        message: fetchResult.error.message,
      },
      performanceFailure: null,
    };
  }

  const navData = fetchResult.value.nav;
  // 同一日付の基準価額が既に登録されているか確認
  const existingResult = navRepository.findByFundAndDate(fund.id, navData.date);
  if (!existingResult.success) {
    return {
      item: {
        fundId: fund.id,
        fundName: fund.name,
        status: 'failed',
        message: existingResult.error.message,
      },
      performanceFailure: null,
    };
  }

  if (existingResult.value !== null) {
    return {
      item: {
        fundId: fund.id,
        fundName: fund.name,
        status: 'already_exists',
        message: `${navData.date}の基準価額は既に登録されています。`,
      },
      performanceFailure: null,
    };
  }

  // 基準価額を登録
  const nav: Nav = {
    fundId: fund.id,
    date: navData.date,
    value: navData.value,
    createdAt: clock.nowIso(),
  };

  const createResult = navRepository.createNav(nav);
  if (!createResult.success) {
    return {
      item: {
        fundId: fund.id,
        fundName: fund.name,
        status: 'failed',
        message: createResult.error.message,
      },
      performanceFailure: null,
    };
  }

  // 実績記録（失敗してもエラーにしない）
  const performanceResult = recordFundPerformance(
    fund,
    nav,
    transactionRepository,
    performanceRepository
  );

  let performanceFailure: PerformanceRecordFailure | null = null;
  if (!performanceResult.success) {
    // 基準価額の取得・登録は成功したがファンド別実績シートへの永続化に失敗したケース。
    // 同一日付の再実行は NAV が「既存」と判定され processFund が early return するため、
    // この日付のファンド別実績行は自動回復されず欠落する（手動復旧が必要なデータロスト）。
    // 気付きにくい静かな欠落を grep・目視で検知できるよう [ERROR] で記録する（#137）。
    logError(`[${fund.name}] ファンド別実績記録に失敗: ${performanceResult.error.message}`);
    // 運用者への通知（#144）のため、ファンド別実績失敗を内訳へ記録する。
    performanceFailure = {
      scope: 'fund',
      fundId: fund.id,
      fundName: fund.name,
      message: performanceResult.error.message,
    };
  } else {
    Logger.log(`[${fund.name}] ファンド別実績記録成功: ${nav.date}`);
  }

  return {
    item: {
      fundId: fund.id,
      fundName: fund.name,
      status: 'success',
      nav,
    },
    performanceFailure,
  };
}

/**
 * ファンド別実績を記録する。
 * @param fund ファンド情報
 * @param nav 登録された基準価額
 * @param transactionRepository 取引履歴リポジトリ
 * @param performanceRepository 実績リポジトリ
 * @returns 成功または失敗
 */
function recordFundPerformance(
  fund: Fund,
  nav: Nav,
  transactionRepository: TransactionRepository,
  performanceRepository: PerformanceRepository
): Result<void> {
  // 1. 重複チェック
  const existingResult = performanceRepository.findByFundAndDate(fund.id, nav.date);
  if (!existingResult.success) return existingResult;
  if (existingResult.value !== null) {
    return { success: true, value: undefined }; // 既に記録済み
  }

  // 2. 取引履歴取得
  // 1銘柄の取引シートの不整合が他の銘柄のファンド別実績記録を巻き込まないよう、
  // 失敗の影響を銘柄単位に閉じるため、ファンド別実績は銘柄ごとに個別読取する。
  const transactionsResult = transactionRepository.listByFundId(fund.id);
  if (!transactionsResult.success) return transactionsResult;

  // 3. 保有情報計算
  const holding = calculateHolding(fund, transactionsResult.value, nav);
  if (holding?.currentValue === null || holding?.currentValue === undefined) {
    // calculateHoldingがnullを返す2条件（取引0件またはtotalUnits <= 0）に対応して判別する。
    const reason =
      transactionsResult.value.length === 0
        ? '取引0件のため（取引シート未作成を含む）'
        : '全口数売却済みのため';
    Logger.log(`[${fund.name}] ${nav.date} のファンド別実績記録をスキップしました（${reason}）。`);
    return { success: true, value: undefined }; // 保有なし
  }

  // calculateHoldingの仕様上ここには到達しないが、将来HoldingCalculatorの仕様が変わった場合に
  // 不正な実績を書き込まないための防御である。
  if (holding.unrealizedGain === null || holding.unrealizedGainRate === null) {
    return { success: true, value: undefined };
  }

  // 4. 実績データ作成
  const performance: PerformanceRecord = {
    fundId: fund.id,
    date: nav.date,
    totalUnits: holding.totalUnits,
    remainingInvestment: holding.remainingInvestment,
    currentValue: holding.currentValue,
    totalGain: holding.unrealizedGain,
    unrealizedGainRate: holding.unrealizedGainRate,
    createdAt: clock.nowIso(),
  };

  // 5. ファンド別シートに記録
  return performanceRepository.createPerformance(performance);
}

/**
 * 全体実績を記録する。
 * @param date 記録日付
 * @param funds 呼び出し元が取得済みの銘柄一覧
 * @param transactionRepository 取引履歴リポジトリ
 * @param navRepository 基準価額リポジトリ
 * @param performanceRepository 実績リポジトリ
 * @returns 成功または失敗
 */
function recordGlobalPerformance(
  date: string,
  funds: readonly Fund[],
  transactionRepository: TransactionRepository,
  navRepository: NavRepository,
  performanceRepository: PerformanceRepository
): Result<void> {
  // 1. 重複チェック
  const existingResult = performanceRepository.findGlobalByDate(date);
  if (!existingResult.success) return existingResult;
  if (existingResult.value !== null) {
    // 既存行は再計算しないため、過去の誤値や障害による欠測は自動訂正・補完されない。
    // PerformanceRepositoryには更新・削除がなく、訂正手段は現時点で存在しない。
    // upsertやバックフィルの要否は別issueで扱う。
    return { success: true, value: undefined };
  }

  // 2. 全ファンドの保有情報を計算
  // 呼び出し元と同一実行内に取得した銘柄スナップショットを使い、取引・基準価額のMapと
  // ループ対象を一致させる。ここで再読取すると、実行中の銘柄追加で不整合が生じる。
  const fundIds = funds.map((f) => f.id);
  // 取引シートへの書込みと並行し得るため、スナップショットの安全性は同一実行内に限られる。
  const transactionsMapResult = transactionRepository.listByFundIdsGrouped(fundIds);
  if (!transactionsMapResult.success) return transactionsMapResult;
  const transactionsMap = transactionsMapResult.value;
  const navsMapResult = navRepository.findLatestByFundIds(fundIds);
  if (!navsMapResult.success) return navsMapResult;
  const navsMap = navsMapResult.value;
  const holdings = [];
  for (const fund of funds) {
    const transactionsResult = requireMapValue(transactionsMap, fund.id, '取引履歴');
    if (!transactionsResult.success) return transactionsResult;
    const navResult = requireMapValue(navsMap, fund.id, '基準価額');
    if (!navResult.success) return navResult;

    const holding = calculateHolding(fund, transactionsResult.value, navResult.value);
    if (holding !== null) holdings.push(holding);
  }

  // 3. ポートフォリオサマリー計算
  // PerformanceRecordへ書く4値は保有情報だけで算出できるが、calculatePortfolioの契約は
  // 実現損益・税額も計算するため、結果を変えずに呼び出しを維持するには全取引が必要である。
  // calculatePortfolioは実現損益計算時にfundIdごとに再グループ化して日付順へ並べ直すため、
  // ここでの平坦化に並び順の責任はない。契約違反で早期returnする場合に備え、直前で作る。
  const portfolio = calculatePortfolio(holdings, Array.from(transactionsMap.values()).flat());

  // calculatePortfolio は、いずれかの保有で現在値が欠損した場合に totalCurrentValue・
  // totalUnrealizedGain・totalUnrealizedGainRate を常に同時に null にする（詳細は
  // calculatePortfolio の TSDoc を参照）。欠損時は 0 等で補完せず、記録をスキップする。
  if (
    portfolio.totalCurrentValue === null ||
    portfolio.totalUnrealizedGain === null ||
    portfolio.totalUnrealizedGainRate === null
  ) {
    return { success: true, value: undefined };
  }

  // 4. 全体実績データ作成（portfolioから既に計算済みの値を使用）
  // 注: totalUnitsは全体実績では意味を持たないため0を設定
  const performance: PerformanceRecord = {
    fundId: '', // 全体実績はfundIdなし
    date,
    totalUnits: 0, // 全体実績では各ファンドの単位が異なるため合計値に意味がない
    remainingInvestment: portfolio.remainingInvestment,
    currentValue: portfolio.totalCurrentValue,
    totalGain: portfolio.totalUnrealizedGain,
    unrealizedGainRate: portfolio.totalUnrealizedGainRate,
    createdAt: clock.nowIso(),
  };

  // 5. 全体シートに記録
  return performanceRepository.createGlobalPerformance(performance);
}
