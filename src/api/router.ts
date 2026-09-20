import { fail } from '../domain/result';
import type { AssetClass, Result } from '../domain/types';
import { fetchWealthAdvisorQuote } from '../service/WealthAdvisorService';
import { createAppContainer } from '../usecase/appContainer';

type InitializeSheetsRequest = {
  action: 'initializeSheets';
};

type ListFundsRequest = {
  action: 'listFunds';
};

type CreateFundRequest = {
  action: 'createFund';
  name: string;
  rakutenFundId: string | null;
  settlementBusinessDays: number | null;
  navSource?: 'wealthadvisor' | null;
  navSourceCode?: string | null;
  /** 必須の資産クラス。nullおよび省略は許可しない。 */
  assetClass: AssetClass;
};

type UpdateFundRequest = {
  action: 'updateFund';
  id: string;
  name: string;
  rakutenFundId: string | null;
  settlementBusinessDays: number | null;
  /** プロパティ不在は既存値維持、明示的なnullは取得元設定のクリアを表す。 */
  navSource?: 'wealthadvisor' | null;
  /** プロパティ不在は既存値維持、明示的なnullは取得元設定のクリアを表す。 */
  navSourceCode?: string | null;
};

/**
 * 銘柄の資産クラスだけを変更するAPIリクエスト。
 * 他の銘柄属性を再送しないため、既存値の上書きや他項目の検証エラーを発生させない。
 */
type SetFundAssetClassRequest = {
  action: 'setFundAssetClass';
  id: string;
  /** 設定する資産クラス。nullおよび省略は許可しない。 */
  assetClass: AssetClass;
};

type GetNavHistoryRequest = {
  action: 'getNavHistory';
  fundId: string;
};

type GetTransactionHistoryRequest = {
  action: 'getTransactionHistory';
  fundId: string;
};

type ListAllTransactionsRequest = {
  action: 'listAllTransactions';
};

type ExecuteSpotPurchaseRequest = {
  action: 'executeSpotPurchase';
  fundId: string;
  date: string;
  amount: number;
  navValue: number;
};

type ExecuteSaleRequest = {
  action: 'executeSale';
  fundId: string;
  date: string;
  units: number;
  amount: number;
  navValue: number;
  incomeTax: number;
  residentTax: number;
};

type UpdateSpotPurchaseRequest = {
  action: 'updateSpotPurchase';
  id: string;
  fundId: string;
  date: string;
  amount: number;
  navValue: number;
};

type UpdateSaleTransactionRequest = {
  action: 'updateSaleTransaction';
  id: string;
  fundId: string;
  date: string;
  units: number;
  amount: number;
  navValue: number;
  incomeTax: number;
  residentTax: number;
};

type DeleteSpotPurchaseRequest = {
  action: 'deleteSpotPurchase';
  id: string;
  fundId: string;
};

type ListRecurringPurchasesRequest = {
  action: 'listRecurringPurchases';
};

type CreateRecurringPurchaseRequest = {
  action: 'createRecurringPurchase';
  fundId: string;
  monthlyAmount: number;
  executionDay: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
};

type UpdateRecurringPurchaseRequest = {
  action: 'updateRecurringPurchase';
  id: string;
  fundId: string;
  monthlyAmount: number;
  executionDay: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
};

type DeleteRecurringPurchaseRequest = {
  action: 'deleteRecurringPurchase';
  id: string;
};

type ExecuteRecurringPurchasesRequest = {
  action: 'executeRecurringPurchases';
  targetDate: string;
};

type ListHoldingsRequest = {
  action: 'listHoldings';
};

type GetHoldingRequest = {
  action: 'getHolding';
  fundId: string;
};

type GetPortfolioSummaryRequest = {
  action: 'getPortfolioSummary';
};

type FetchAllNavsRequest = {
  action: 'fetchAllNavs';
};

type SendWeeklyReportRequest = {
  action: 'sendWeeklyReport';
};

type GetPortfolioPerformanceHistoryRequest = {
  action: 'getPortfolioPerformanceHistory';
};

type FetchMarketIndicesRequest = {
  action: 'fetchMarketIndices';
};

type CheckWealthAdvisorNavSourceRequest = {
  action: 'checkWealthAdvisorNavSource';
  navSourceCode: string;
};

export type ApiRequest =
  | InitializeSheetsRequest
  | ListFundsRequest
  | CreateFundRequest
  | UpdateFundRequest
  | SetFundAssetClassRequest
  | GetNavHistoryRequest
  | GetTransactionHistoryRequest
  | ListAllTransactionsRequest
  | ExecuteSpotPurchaseRequest
  | ExecuteSaleRequest
  | UpdateSpotPurchaseRequest
  | UpdateSaleTransactionRequest
  | DeleteSpotPurchaseRequest
  | ListRecurringPurchasesRequest
  | CreateRecurringPurchaseRequest
  | UpdateRecurringPurchaseRequest
  | DeleteRecurringPurchaseRequest
  | ExecuteRecurringPurchasesRequest
  | ListHoldingsRequest
  | GetHoldingRequest
  | GetPortfolioSummaryRequest
  | FetchAllNavsRequest
  | SendWeeklyReportRequest
  | GetPortfolioPerformanceHistoryRequest
  | FetchMarketIndicesRequest
  | CheckWealthAdvisorNavSourceRequest;

/**
 * APIリクエストをハンドリングする。
 */
export function handleApiRequest(request: ApiRequest): Result<unknown> {
  // 疎通確認はfetchWealthAdvisorQuoteだけに依存し、スプレッドシートへアクセスしない。
  // createAppContainerは先頭でopenSheetRepositoryを呼ぶため、不要な接続を要求する前に処理する。
  if (request.action === 'checkWealthAdvisorNavSource') {
    // doPostはactionを持つオブジェクトまでしか検証しないため、固有フィールドはここで検証する。
    if (typeof request.navSourceCode !== 'string') {
      return fail('validation', '取得元コードは文字列で入力してください。', 'navSourceCode');
    }
    return fetchWealthAdvisorQuote(request.navSourceCode);
  }

  // 依存（リポジトリ・サービス・ユースケース）の組み立ては composition root に委譲する。
  // 以下ではrouter 自身はリポジトリ層へ直接依存せず、ユースケースへの委譲のみを担う。
  const containerResult = createAppContainer();
  if (!containerResult.success) {
    return containerResult;
  }

  const container = containerResult.value;

  switch (request.action) {
    case 'initializeSheets':
      return container.sheetInitializationUseCase.initializeAllSheets();
    case 'listFunds':
      return container.fundUseCase.listFunds();
    case 'createFund':
      return container.fundUseCase.createFund({
        name: request.name,
        rakutenFundId: request.rakutenFundId,
        settlementBusinessDays: request.settlementBusinessDays,
        navSource: request.navSource ?? null,
        navSourceCode: request.navSourceCode ?? null,
        assetClass: request.assetClass,
      });
    case 'updateFund':
      return container.fundUseCase.updateFund({
        id: request.id,
        name: request.name,
        rakutenFundId: request.rakutenFundId,
        settlementBusinessDays: request.settlementBusinessDays,
        navSource: request.navSource,
        navSourceCode: request.navSourceCode,
      });
    case 'setFundAssetClass':
      return container.fundUseCase.setFundAssetClass({
        id: request.id,
        assetClass: request.assetClass,
      });
    case 'getNavHistory':
      return container.navUseCase.getNavHistory(request.fundId);
    case 'getTransactionHistory':
      return container.transactionUseCase.getHistory(request.fundId);
    case 'listAllTransactions':
      return container.transactionUseCase.listAll();
    case 'executeSpotPurchase':
      return container.transactionUseCase.executeSpotPurchase({
        fundId: request.fundId,
        date: request.date,
        amount: request.amount,
        navValue: request.navValue,
      });
    case 'executeSale':
      return container.transactionUseCase.executeSaleTransaction({
        fundId: request.fundId,
        date: request.date,
        units: request.units,
        amount: request.amount,
        navValue: request.navValue,
        incomeTax: request.incomeTax,
        residentTax: request.residentTax,
      });
    case 'updateSpotPurchase':
      return container.transactionUseCase.updateSpotPurchase({
        id: request.id,
        fundId: request.fundId,
        date: request.date,
        amount: request.amount,
        navValue: request.navValue,
      });
    case 'updateSaleTransaction':
      return container.transactionUseCase.updateSaleTransaction({
        id: request.id,
        fundId: request.fundId,
        date: request.date,
        units: request.units,
        amount: request.amount,
        navValue: request.navValue,
        incomeTax: request.incomeTax,
        residentTax: request.residentTax,
      });
    case 'deleteSpotPurchase':
      return container.transactionUseCase.deleteSpotPurchase(request.id, request.fundId);
    case 'listRecurringPurchases':
      return container.recurringUseCase.listRecurringPurchases();
    case 'createRecurringPurchase':
      return container.recurringUseCase.createRecurringPurchase({
        fundId: request.fundId,
        monthlyAmount: request.monthlyAmount,
        executionDay: request.executionDay,
        startDate: request.startDate,
        endDate: request.endDate,
        isActive: request.isActive,
      });
    case 'updateRecurringPurchase':
      return container.recurringUseCase.updateRecurringPurchase({
        id: request.id,
        fundId: request.fundId,
        monthlyAmount: request.monthlyAmount,
        executionDay: request.executionDay,
        startDate: request.startDate,
        endDate: request.endDate,
        isActive: request.isActive,
      });
    case 'deleteRecurringPurchase':
      return container.recurringUseCase.deleteRecurringPurchase(request.id);
    case 'executeRecurringPurchases':
      return container.recurringUseCase.executeRecurringPurchases(request.targetDate);
    case 'listHoldings':
      return container.holdingUseCase.listHoldings();
    case 'getHolding':
      return container.holdingUseCase.getHolding(request.fundId);
    case 'getPortfolioSummary':
      return container.portfolioUseCase.getPortfolioSummary();
    case 'fetchAllNavs': {
      const ensureResult = container.sheetInitializationUseCase.ensureNavFetchSheets();
      if (!ensureResult.success) {
        return ensureResult;
      }
      return container.navFetchUseCase.fetchAndRegisterAllNavs();
    }
    case 'sendWeeklyReport':
      // 宛先取得 → レポート生成 → メール送信のオーケストレーションは
      // WeeklyReportUseCase.sendReport へ集約済み（H2 #148）。router は委譲のみを担う。
      return container.weeklyReportUseCase.sendReport();
    case 'getPortfolioPerformanceHistory':
      return container.portfolioUseCase.getPortfolioPerformanceHistory();
    case 'fetchMarketIndices': {
      const ensureResult = container.sheetInitializationUseCase.ensureMarketIndexSheet();
      if (!ensureResult.success) {
        return ensureResult;
      }
      return container.marketIndexFetchUseCase.fetchAndRecordLatestIndices();
    }
    default:
      return fail('unexpected', '未対応のアクションです。');
  }
}
