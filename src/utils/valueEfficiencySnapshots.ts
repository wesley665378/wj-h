import { User, ValueCreationLog, MiningResource, ValueEfficiencySnapshot } from '../../types';
import { computeAllEvaluations } from './valueEvaluation';

/**
 * 依据最新数据构建全员 ROI/效率比快照
 * @param users 系统全量用户
 * @param logs 系统全量流水
 * @param resources 系统全量矿山资源
 * @param filterMonth 业务月份
 */
export function buildValueEfficiencySnapshots(
  users: User[],
  logs: ValueCreationLog[],
  resources: MiningResource[],
  filterMonth: string
): ValueEfficiencySnapshot[] {
  if (!users || !logs || !resources || !filterMonth) {
    return [];
  }

  const evaluations = computeAllEvaluations(users, logs, resources, filterMonth);
  
  return evaluations.map(e => ({
    userId: e.userId,
    userName: e.userName,
    category: e.category,
    filterMonth: e.filterMonth,
    monthlyIncome: e.monthlyIncome,
    monthlyCost: e.monthlyCost,
    monthlyEfficiency: e.monthlyEfficiency,
    yearlyIncome: e.yearlyIncome,
    yearlyCost: e.yearlyCost,
    yearlyEfficiency: e.yearlyEfficiency,
    tier: e.tier,
    contribution: e.contribution,
    fixedRatio: e.fixedRatio,
    timestamp: e.timestamp
  }));
}
