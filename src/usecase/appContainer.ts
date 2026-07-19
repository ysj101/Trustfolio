import type { Result } from '../domain/types';
import { createFundRepository } from '../repository/FundRepository';
import { createMarketIndexRepository } from '../repository/MarketIndexRepository';
import { createNavRepository } from '../repository/NavRepository';
import { createPerformanceRepository } from '../repository/PerformanceRepository';
import { createRecurringPurchaseRepository } from '../repository/RecurringPurchaseRepository';
import { openSheetRepository } from '../repository/SheetRepository';
import { createTransactionRepository } from '../repository/TransactionRepository';
import { createEmailService } from '../service/EmailService';
import { createMarketIndexService } from '../service/MarketIndexService';
import { createRakutenService } from '../service/RakutenService';
import { createFundUseCase, type FundUseCase } from './FundUseCase';
import { createHoldingUseCase, type HoldingUseCase } from './HoldingUseCase';
import {
  createMarketIndexAlertUseCase,
  type MarketIndexAlertUseCase,
} from './MarketIndexAlertUseCase';
import {
  createMarketIndexFetchUseCase,
  type MarketIndexFetchUseCase,
} from './MarketIndexFetchUseCase';
import { createNavFetchUseCase, type NavFetchUseCase } from './NavFetchUseCase';
import { createNavUseCase, type NavUseCase } from './NavUseCase';
import { createPortfolioUseCase, type PortfolioUseCase } from './PortfolioUseCase';
import { createRecurringUseCase, type RecurringUseCase } from './RecurringUseCase';
import {
  createSheetInitializationUseCase,
  type SheetInitializationUseCase,
} from './SheetInitializationUseCase';
import { createTransactionUseCase, type TransactionUseCase } from './TransactionUseCase';
import { createWeeklyReportUseCase, type WeeklyReportUseCase } from './WeeklyReportUseCase';

/**
 * アプリ全体の依存（リポジトリ・サービス・ユースケース）を組み立てた結果を保持するコンテナ。
 *
 * api/router.ts に散在していた DI 配線（リポジトリ生成 → サービス生成 → ユースケース生成）を
 * この composition root へ集約することで、router からリポジトリ層への直接依存を排除する。
 * router は本コンテナが公開するユースケース／サービスへの委譲のみを担う。
 */
export type AppContainer = {
  /** シート初期化・存在保証ユースケース。 */
  readonly sheetInitializationUseCase: SheetInitializationUseCase;
  /** ファンド管理ユースケース。 */
  readonly fundUseCase: FundUseCase;
  /** 基準価額参照ユースケース。 */
  readonly navUseCase: NavUseCase;
  /** 取引ユースケース。 */
  readonly transactionUseCase: TransactionUseCase;
  /** 保有ユースケース。 */
  readonly holdingUseCase: HoldingUseCase;
  /** ポートフォリオユースケース。 */
  readonly portfolioUseCase: PortfolioUseCase;
  /** 積立ユースケース。 */
  readonly recurringUseCase: RecurringUseCase;
  /** 基準価額自動取得ユースケース。 */
  readonly navFetchUseCase: NavFetchUseCase;
  /** 週次レポート生成ユースケース。 */
  readonly weeklyReportUseCase: WeeklyReportUseCase;
  /** 市場指数取得ユースケース。 */
  readonly marketIndexFetchUseCase: MarketIndexFetchUseCase;
  /** -5%ルールアラートユースケース。 */
  readonly marketIndexAlertUseCase: MarketIndexAlertUseCase;
};

/**
 * アプリ全体の依存を組み立て、{@link AppContainer} を生成する。
 *
 * 最初にスプレッドシート接続（{@link openSheetRepository}）を行い、失敗した場合は
 * そのエラーを伝播する。成功した場合は単一の SheetRepository を共有して全リポジトリ・
 * ユースケースを生成する。生成自体に副作用（I/O）は無いため、毎リクエスト生成しても安全。
 *
 * @returns 組み立て済みコンテナ、または接続失敗エラー
 */
export function createAppContainer(): Result<AppContainer> {
  const sheetRepositoryResult = openSheetRepository();
  if (!sheetRepositoryResult.success) {
    return sheetRepositoryResult;
  }

  const sheetRepository = sheetRepositoryResult.value;

  // リポジトリ層
  const fundRepository = createFundRepository(sheetRepository);
  const navRepository = createNavRepository(sheetRepository);
  const recurringRepository = createRecurringPurchaseRepository(sheetRepository);
  const transactionRepository = createTransactionRepository(sheetRepository);
  const performanceRepository = createPerformanceRepository(sheetRepository);
  const marketIndexRepository = createMarketIndexRepository(sheetRepository);

  // サービス層
  const rakutenService = createRakutenService();
  const marketIndexService = createMarketIndexService();
  const emailService = createEmailService();

  // ユースケース層
  const holdingUseCase = createHoldingUseCase(fundRepository, navRepository, transactionRepository);
  const portfolioUseCase = createPortfolioUseCase(
    fundRepository,
    transactionRepository,
    holdingUseCase,
    performanceRepository
  );

  return {
    success: true,
    value: {
      sheetInitializationUseCase: createSheetInitializationUseCase(sheetRepository, fundRepository),
      fundUseCase: createFundUseCase(fundRepository),
      navUseCase: createNavUseCase(fundRepository, navRepository),
      transactionUseCase: createTransactionUseCase(fundRepository, transactionRepository),
      holdingUseCase,
      portfolioUseCase,
      recurringUseCase: createRecurringUseCase(
        fundRepository,
        navRepository,
        recurringRepository,
        transactionRepository
      ),
      navFetchUseCase: createNavFetchUseCase(
        fundRepository,
        navRepository,
        transactionRepository,
        performanceRepository,
        rakutenService
      ),
      weeklyReportUseCase: createWeeklyReportUseCase(
        portfolioUseCase,
        performanceRepository,
        emailService
      ),
      marketIndexFetchUseCase: createMarketIndexFetchUseCase(
        marketIndexRepository,
        marketIndexService
      ),
      marketIndexAlertUseCase: createMarketIndexAlertUseCase(marketIndexRepository, emailService),
    },
  };
}
