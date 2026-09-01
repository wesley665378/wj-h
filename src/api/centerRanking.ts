import { apiClient } from './client';

export interface CenterRankingResponse {
  unitName: string;
  // Based on the fields defined in SingleMonthUnitMetrics
  revenuePackage: number;
  confirmedValuePackage: number;
  pendingLinkageValuePackage: number;
  salaryPackage: number;
  bonusPayout: number;
  aCost: number;
  b1Cost: number;
  b2Cost: number;
  cCost: number;
  dCost: number;
  totalCost: number;
  directCost: number;
  row1ValuePackage: number;
  row1IncomeValuePackage: number;
  row1MonthlyProfit: number;
  row2ValuePackage: number;
  row2IncomeValuePackage: number;
  row2MonthlyProfit: number;
  isNoActivity: boolean;
  // Year cumulative values might need separate handling or calculation if not provided by backend.
  // The backend API might return monthly metrics. We'll assume it returns single month metrics.
}

export const fetchCenterRanking = async (month: string): Promise<CenterRankingResponse> => {
  return apiClient.get<CenterRankingResponse>(`/api/center-ranking?month=${month}`);
};
