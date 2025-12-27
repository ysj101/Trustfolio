/**
 * React Query hooks
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fundsApi } from "../api/funds";
import { navsApi } from "../api/navs";
import { transactionsApi } from "../api/transactions";
import { recurringApi } from "../api/recurring";
import { portfolioApi } from "../api/portfolio";
import type {
  RegisterFundInput,
  RegisterNavInput,
  ExecuteSpotPurchaseInput,
  RegisterRecurringPurchaseInput,
  ExecuteRecurringPurchasesInput,
} from "../types/api";

// === 投資信託 ===

export function useFunds() {
  return useQuery({
    queryKey: ["funds"],
    queryFn: fundsApi.list,
  });
}

export function useRegisterFund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RegisterFundInput) => fundsApi.register(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["funds"] });
    },
  });
}

// === 基準価額 ===

export function useNavHistory(fundId: string, limit?: number) {
  return useQuery({
    queryKey: ["navs", fundId, limit],
    queryFn: () => navsApi.getHistory(fundId, limit),
    enabled: Boolean(fundId),
  });
}

export function useRegisterNav(fundId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RegisterNavInput) => navsApi.register(fundId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["navs", fundId] });
      void queryClient.invalidateQueries({ queryKey: ["holdings"] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });
}

// === 取引 ===

export function useTransactionHistory(fundId: string, limit?: number) {
  return useQuery({
    queryKey: ["transactions", fundId, limit],
    queryFn: () => transactionsApi.getHistory(fundId, limit),
    enabled: Boolean(fundId),
  });
}

export function useExecuteSpotPurchase(fundId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ExecuteSpotPurchaseInput) =>
      transactionsApi.executeSpotPurchase(fundId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions", fundId] });
      void queryClient.invalidateQueries({ queryKey: ["holdings"] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });
}

// === 積立設定 ===

export function useRecurringPurchases() {
  return useQuery({
    queryKey: ["recurring"],
    queryFn: recurringApi.list,
  });
}

export function useRegisterRecurringPurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RegisterRecurringPurchaseInput) =>
      recurringApi.register(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recurring"] });
    },
  });
}

export function useExecuteRecurringPurchases() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ExecuteRecurringPurchasesInput) =>
      recurringApi.execute(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["holdings"] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });
}

// === ポートフォリオ ===

export function usePortfolio() {
  return useQuery({
    queryKey: ["portfolio"],
    queryFn: portfolioApi.getSummary,
  });
}

export function useHolding(fundId: string) {
  return useQuery({
    queryKey: ["holdings", fundId],
    queryFn: () => portfolioApi.getHolding(fundId),
    enabled: Boolean(fundId),
  });
}
