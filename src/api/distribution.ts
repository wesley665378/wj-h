import { apiClient, unwrapApiEnvelope } from './client';

export interface HistoryDebtRecord {
  month: string;
  totalIncome: number;
  totalCost: number;
  current: number;
  startDebt: number;
  endDebt: number;
  quota: number;
}

export interface DistributionExpertSlice {
  incomePackage?: number;
  costPackage?: number;
  nonEffectiveDeduction?: number;
  historyDebt?: number;
  currentSurplus?: number;
  quota?: number;
  netRedundancy?: number;
  theoreticalBonus?: number;
  ratio?: number;
  aCost?: number;
  b1Cost?: number;
  salaryPackage?: number;
  historyRecords?: HistoryDebtRecord[];
}

export interface DistributionExpertRow {
  userId: string;
  userName: string;
  category: string;
  isRevenueExpert?: boolean;
  isChan?: boolean;
  salaryPackage?: number;
  unitRedundancy?: number;
  centerLevelBonus?: number;

  // 核心核算主字段（负数/正数已由后端标准格式化）
  historyDebt?: number;
  historyDebtConfirmed?: number;
  historyDebtApproved?: number;
  currentSurplus?: number;
  currentSurplusConfirmed?: number;
  currentSurplusApproved?: number;
  netRedundancy?: number;
  netRedundancyConfirmed?: number;
  netRedundancyApproved?: number;
  nextDebt?: number;
  nextDebtConfirmed?: number;
  nextDebtApproved?: number;
  theoreticalBonus?: number;
  theoreticalBonusConfirmed?: number;
  theoreticalBonusApproved?: number;
  ratio?: number;
  historyRecords?: HistoryDebtRecord[];
  historyRecordsConfirmed?: HistoryDebtRecord[];
  historyRecordsApproved?: HistoryDebtRecord[];

  // 基础/成本/确权入库
  baseValueConfirmed?: number;
  baseValueApproved?: number;
  confirmedValueConfirmed?: number;
  confirmedValueApproved?: number;
  confirmedGoldConfirmed?: number;
  confirmedGoldApproved?: number;
  aCostConfirmed?: number;
  aCostApproved?: number;
  bCostConfirmed?: number;
  bCostApproved?: number;
  costPackage?: number;
  totalCost?: number;
  nonEffectiveDeduction?: number;
  nonEffectiveDeductionConfirmed?: number;
  nonEffectiveDeductionApproved?: number;

  // 切片
  confirmed?: DistributionExpertSlice;
  approved?: DistributionExpertSlice;
}

export interface DistributionDataResponse {
  month: string;
  status: string;
  distribution: DistributionExpertRow[];
  experts?: DistributionExpertRow[];
}

export const fetchDistributionData = async (
  month?: string,
  status?: string
): Promise<DistributionDataResponse> => {
  const params = new URLSearchParams();
  if (month) params.append('month', month);
  if (status) params.append('status', status);
  const qs = params.toString();
  
  const raw = await apiClient.get<any>(`/api/distribution${qs ? `?${qs}` : ''}`);
  const res = unwrapApiEnvelope<any>(raw);
  
  const rows: DistributionExpertRow[] = Array.isArray(res?.distribution)
    ? res.distribution
    : (Array.isArray(res?.experts) ? res.experts : []);

  const normalizedRows: DistributionExpertRow[] = rows.map(r => {
    const levelAdd = r.centerLevelBonus ?? r.unitRedundancy ?? 0;
    const historyDebtConfirmed = r.historyDebtConfirmed ?? r.confirmed?.historyDebt ?? r.historyDebt ?? 0;
    const historyDebtApproved = r.historyDebtApproved ?? r.approved?.historyDebt ?? historyDebtConfirmed;

    return {
      ...r,
      centerLevelBonus: levelAdd,
      unitRedundancy: levelAdd,
      historyDebtConfirmed,
      historyDebtApproved,
      historyDebt: historyDebtConfirmed,
    };
  });

  const targetMonth = res?.month || res?.filterMonth || month || '';
  const targetStatus = res?.status || status || '';

  return {
    month: targetMonth,
    status: targetStatus,
    distribution: normalizedRows,
    experts: normalizedRows,
  };
};
