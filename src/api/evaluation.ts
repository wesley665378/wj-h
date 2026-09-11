import { apiClient, unwrapApiEnvelope } from './client';

export interface EvaluationExpertRow {
  userId: string;
  userName: string;
  category: string;
  filterMonth?: string;
  isProdExpert?: boolean;
  isRevenueExpert?: boolean;
  
  // 收入/收产包
  monthlyIncome: number;
  monthlyIncomeUpper?: number;
  monthlyIncomeLower?: number;
  confirmedValueConfirmed?: number;
  pendingValueConfirmed?: number;

  // 成本包及明细
  monthlyCost: number;
  baseSalary?: number;
  aCost?: number;
  b1Cost?: number;
  b2Cost?: number;
  cCost?: number;
  dCost?: number;
  nonEffectiveDeduction?: number;

  // 月损益与月效率
  contribution: number;
  contributionUpper?: number;
  contributionLower?: number;
  monthlyEfficiency: number;
  monthlyEfficiencyUpper?: number;
  monthlyEfficiencyLower?: number;

  // 年累计指标
  yearlyIncome: number;
  yearlyIncomeUpper?: number;
  yearlyIncomeLower?: number;
  yearlyCost: number;
  yearlyContribution?: number;
  yearlyContributionUpper?: number;
  yearlyContributionLower?: number;
  yearlyEfficiency: number;
  yearlyEfficiencyUpper?: number;
  yearlyEfficiencyLower?: number;

  // 评级与决策路由
  tier: string;
  tierLabel?: string;
  tierColor?: string;
  tierUpper?: string;
  tierLower?: string;
  tierLabelUpper?: string;
  tierLabelLower?: string;

  timestamp?: number;
  contributionStatus?: string;
  fixedRatio?: number;
}

export interface EvaluationDataResponse {
  month: string;
  filterMonth: string;
  startDate: string | null;
  endDate: string | null;
  scope?: { mode: string; center?: string | null };
  experts: EvaluationExpertRow[];
}

export async function fetchEvaluationData(params: {
  month?: string;
  startDate?: string;
  endDate?: string;
}): Promise<EvaluationDataResponse> {
  const qs = new URLSearchParams();
  if (params.startDate && params.endDate) {
    qs.set('startDate', params.startDate);
    qs.set('endDate', params.endDate);
  } else if (params.month) {
    qs.set('month', params.month);
  }
  const queryString = qs.toString();
  const raw = await apiClient.get<any>(`/api/evaluation${queryString ? `?${queryString}` : ''}`);
  const res = unwrapApiEnvelope<any>(raw);
  return {
    month: res?.month || res?.filterMonth || params.month || '',
    filterMonth: res?.filterMonth || res?.month || params.month || '',
    startDate: res?.startDate ?? null,
    endDate: res?.endDate ?? null,
    scope: res?.scope,
    experts: Array.isArray(res?.experts) ? res.experts : [],
  };
}
