import { SHEET_DEFINITIONS } from '../Config';
import type { Result } from '../domain/types';
import { createFundRepository } from '../repository/FundRepository';
import { createNavRepository } from '../repository/NavRepository';
import { createRecurringPurchaseRepository } from '../repository/RecurringPurchaseRepository';
import { openSheetRepository } from '../repository/SheetRepository';
import { createTransactionRepository } from '../repository/TransactionRepository';
import { createMorningstarService } from '../service/MorningstarService';
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
  morningstarCode: string | null;
};

type UpdateFundRequest = {
  action: 'updateFund';
  id: string;
  name: string;
  morningstarCode: string | null;
};

type GetNavHistoryRequest = {
  action: 'getNavHistory';
  fundId: string;
};

type RegisterNavRequest = {
  action: 'registerNav';
  fundId: string;
  date: string;
  value: number;
};

type GetTransactionHistoryRequest = {
  action: 'getTransactionHistory';
  fundId: string;
};

type ExecuteSpotPurchaseRequest = {
  action: 'executeSpotPurchase';
  fundId: string;
  date: string;
  amount: number;
  fee: number;
  navValue: number;
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
  | RegisterNavRequest
  | GetTransactionHistoryRequest
  | ExecuteSpotPurchaseRequest
  | ListRecurringPurchasesRequest
  | CreateRecurringPurchaseRequest
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
  const fundUseCase = createFundUseCase(fundRepository);
  const navUseCase = createNavUseCase(fundRepository, navRepository);
  const transactionUseCase = createTransactionUseCase(fundRepository, transactionRepository);
  const holdingUseCase = createHoldingUseCase(fundRepository, navRepository, transactionRepository);
  const portfolioUseCase = createPortfolioUseCase(
    fundRepository,
    navRepository,
    transactionRepository
  );
  const recurringUseCase = createRecurringUseCase(
    fundRepository,
    navRepository,
    recurringRepository,
    transactionRepository
  );
  const morningstarService = createMorningstarService();
  const navFetchUseCase = createNavFetchUseCase(fundRepository, navRepository, morningstarService);

  switch (request.action) {
    case 'initializeSheets': {
      for (const definition of SHEET_DEFINITIONS) {
        const result = sheetRepository.ensureSheet(definition);
        if (!result.success) {
          return result;
        }
      }
      return { success: true, value: { message: 'シート初期化が完了しました。' } };
    }
    case 'listFunds':
      return fundUseCase.listFunds();
    case 'createFund':
      return fundUseCase.createFund({
        name: request.name,
        morningstarCode: request.morningstarCode,
      });
    case 'updateFund':
      return fundUseCase.updateFund({
        id: request.id,
        name: request.name,
        morningstarCode: request.morningstarCode,
      });
    case 'getNavHistory':
      return navUseCase.getNavHistory(request.fundId);
    case 'registerNav':
      return navUseCase.registerNav({
        fundId: request.fundId,
        date: request.date,
        value: request.value,
      });
    case 'getTransactionHistory':
      return transactionUseCase.getHistory(request.fundId);
    case 'executeSpotPurchase':
      return transactionUseCase.executeSpotPurchase({
        fundId: request.fundId,
        date: request.date,
        amount: request.amount,
        fee: request.fee,
        navValue: request.navValue,
      });
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
    case 'executeRecurringPurchases':
      return recurringUseCase.executeRecurringPurchases(request.targetDate);
    case 'listHoldings':
      return holdingUseCase.listHoldings();
    case 'getHolding':
      return holdingUseCase.getHolding(request.fundId);
    case 'getPortfolioSummary':
      return portfolioUseCase.getPortfolioSummary();
    case 'fetchAllNavs':
      return navFetchUseCase.fetchAndRegisterAllNavs();
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
