import {
  PERFORMANCE_HEADERS,
  PERFORMANCE_SHEET_NAME,
  SHEET_DEFINITIONS,
  SHEET_HEADERS,
  SHEET_NAMES,
  getPerformanceSheetName,
  getTransactionSheetName,
  type SheetDefinition,
} from '../Config';
import type { Result } from '../domain/types';
import { createFundRepository } from '../repository/FundRepository';
import { createNavRepository } from '../repository/NavRepository';
import { createPerformanceRepository } from '../repository/PerformanceRepository';
import { createRecurringPurchaseRepository } from '../repository/RecurringPurchaseRepository';
import type { SheetRepository } from '../repository/SheetRepository';
import { openSheetRepository } from '../repository/SheetRepository';
import { createTransactionRepository } from '../repository/TransactionRepository';
import { createRakutenService } from '../service/RakutenService';
import { createFundUseCase } from '../usecase/FundUseCase';
import { createHoldingUseCase } from '../usecase/HoldingUseCase';
import { createNavFetchUseCase } from '../usecase/NavFetchUseCase';
import { createNavUseCase } from '../usecase/NavUseCase';
import { createPortfolioUseCase } from '../usecase/PortfolioUseCase';
import { createRecurringUseCase } from '../usecase/RecurringUseCase';
import { createTransactionUseCase } from '../usecase/TransactionUseCase';

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
};

type UpdateFundRequest = {
  action: 'updateFund';
  id: string;
  name: string;
  rakutenFundId: string | null;
  settlementBusinessDays: number | null;
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

export type ApiRequest =
  | InitializeSheetsRequest
  | ListFundsRequest
  | CreateFundRequest
  | UpdateFundRequest
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
  | FetchAllNavsRequest;

/**
 * APIリクエストをハンドリングする。
 */
export function handleApiRequest(request: ApiRequest): Result<unknown> {
  const sheetRepositoryResult = openSheetRepository();
  if (!sheetRepositoryResult.success) {
    return sheetRepositoryResult;
  }

  const sheetRepository = sheetRepositoryResult.value;
  const fundRepository = createFundRepository(sheetRepository);
  const navRepository = createNavRepository(sheetRepository);
  const recurringRepository = createRecurringPurchaseRepository(sheetRepository);
  const transactionRepository = createTransactionRepository(sheetRepository);
  const performanceRepository = createPerformanceRepository(sheetRepository);
  const fundUseCase = createFundUseCase(fundRepository);
  const navUseCase = createNavUseCase(fundRepository, navRepository);
  const transactionUseCase = createTransactionUseCase(fundRepository, transactionRepository);
  const holdingUseCase = createHoldingUseCase(fundRepository, navRepository, transactionRepository);
  const portfolioUseCase = createPortfolioUseCase(
    fundRepository,
    transactionRepository,
    holdingUseCase
  );
  const recurringUseCase = createRecurringUseCase(
    fundRepository,
    navRepository,
    recurringRepository,
    transactionRepository
  );
  const rakutenService = createRakutenService();
  const navFetchUseCase = createNavFetchUseCase(
    fundRepository,
    navRepository,
    transactionRepository,
    performanceRepository,
    rakutenService
  );

  switch (request.action) {
    case 'initializeSheets': {
      // 基本シートの初期化
      for (const definition of SHEET_DEFINITIONS) {
        const result = sheetRepository.ensureSheet(definition);
        if (!result.success) {
          return result;
        }
      }

      // 全体実績シートを作成
      const globalPerformanceDefinition: SheetDefinition = {
        name: PERFORMANCE_SHEET_NAME as never,
        headers: PERFORMANCE_HEADERS,
      };
      const globalPerfResult = sheetRepository.ensureSheet(globalPerformanceDefinition);
      if (!globalPerfResult.success) {
        return globalPerfResult;
      }

      // 全ファンドの取引シートと実績シートを作成
      const fundsResult = fundRepository.listFunds();
      if (fundsResult.success) {
        for (const fund of fundsResult.value) {
          // 取引シートを作成
          const transactionSheetName = getTransactionSheetName(fund.id);
          const transactionDefinition: SheetDefinition = {
            name: transactionSheetName as never,
            headers: SHEET_HEADERS[SHEET_NAMES.TRANSACTIONS],
          };
          const transactionResult = sheetRepository.ensureSheet(transactionDefinition);
          if (!transactionResult.success) {
            return transactionResult;
          }

          // 実績シートを作成
          const performanceSheetName = getPerformanceSheetName(fund.id);
          const performanceDefinition: SheetDefinition = {
            name: performanceSheetName as never,
            headers: PERFORMANCE_HEADERS,
          };
          const performanceResult = sheetRepository.ensureSheet(performanceDefinition);
          if (!performanceResult.success) {
            return performanceResult;
          }
        }
      }

      return { success: true, value: { message: 'シート初期化が完了しました。' } };
    }
    case 'listFunds':
      return fundUseCase.listFunds();
    case 'createFund':
      return fundUseCase.createFund({
        name: request.name,
        rakutenFundId: request.rakutenFundId,
        settlementBusinessDays: request.settlementBusinessDays,
      });
    case 'updateFund':
      return fundUseCase.updateFund({
        id: request.id,
        name: request.name,
        rakutenFundId: request.rakutenFundId,
        settlementBusinessDays: request.settlementBusinessDays,
      });
    case 'getNavHistory':
      return navUseCase.getNavHistory(request.fundId);
    case 'getTransactionHistory':
      return transactionUseCase.getHistory(request.fundId);
    case 'listAllTransactions':
      return transactionUseCase.listAll();
    case 'executeSpotPurchase':
      return transactionUseCase.executeSpotPurchase({
        fundId: request.fundId,
        date: request.date,
        amount: request.amount,
        navValue: request.navValue,
      });
    case 'executeSale':
      return transactionUseCase.executeSaleTransaction({
        fundId: request.fundId,
        date: request.date,
        units: request.units,
        amount: request.amount,
        navValue: request.navValue,
      });
    case 'updateSpotPurchase':
      return transactionUseCase.updateSpotPurchase({
        id: request.id,
        fundId: request.fundId,
        date: request.date,
        amount: request.amount,
        navValue: request.navValue,
      });
    case 'updateSaleTransaction':
      return transactionUseCase.updateSaleTransaction({
        id: request.id,
        fundId: request.fundId,
        date: request.date,
        units: request.units,
        amount: request.amount,
        navValue: request.navValue,
      });
    case 'deleteSpotPurchase':
      return transactionUseCase.deleteSpotPurchase(request.id, request.fundId);
    case 'listRecurringPurchases':
      return recurringUseCase.listRecurringPurchases();
    case 'createRecurringPurchase':
      return recurringUseCase.createRecurringPurchase({
        fundId: request.fundId,
        monthlyAmount: request.monthlyAmount,
        executionDay: request.executionDay,
        startDate: request.startDate,
        endDate: request.endDate,
        isActive: request.isActive,
      });
    case 'updateRecurringPurchase':
      return recurringUseCase.updateRecurringPurchase({
        id: request.id,
        fundId: request.fundId,
        monthlyAmount: request.monthlyAmount,
        executionDay: request.executionDay,
        startDate: request.startDate,
        endDate: request.endDate,
        isActive: request.isActive,
      });
    case 'deleteRecurringPurchase':
      return recurringUseCase.deleteRecurringPurchase(request.id);
    case 'executeRecurringPurchases':
      return recurringUseCase.executeRecurringPurchases(request.targetDate);
    case 'listHoldings':
      return holdingUseCase.listHoldings();
    case 'getHolding':
      return holdingUseCase.getHolding(request.fundId);
    case 'getPortfolioSummary':
      return portfolioUseCase.getPortfolioSummary();
    case 'fetchAllNavs': {
      const ensureResult = ensureRequiredSheetsForNavFetch(sheetRepository);
      if (!ensureResult.success) {
        return ensureResult;
      }
      return navFetchUseCase.fetchAndRegisterAllNavs();
    }
    default:
      return {
        success: false,
        error: {
          type: 'unexpected',
          message: '未対応のアクションです。',
        },
      };
  }
}

/**
 * NAV自動取得に必要なシートが存在し、ヘッダーも正しいことを事前に検証する。
 * シートが存在しない場合は自動作成するため、初期化漏れを原因とした失敗を防ぐ。
 */
function ensureRequiredSheetsForNavFetch(sheetRepository: SheetRepository): Result<void> {
  const requiredDefinitions = SHEET_DEFINITIONS.filter(
    (definition) =>
      definition.name === SHEET_NAMES.FUNDS || definition.name === SHEET_NAMES.NAV_RECORDS
  );

  for (const definition of requiredDefinitions) {
    const result = sheetRepository.ensureSheet(definition);
    if (!result.success) {
      return result;
    }
  }

  return { success: true, value: undefined };
}
