import {
  AuditStatus,
  MiningResource,
  RefineCategory,
  User,
  ValueCreationLog,
} from '../../types';
import { calculateHistoricalNetValue, getUserSalaryByMonth } from './business';
import { resolveLogBusinessMonth } from './dateUtils';
import { isNonEffectiveHoursEffective, isSalaryActiveForMonth } from './employmentStatus';
import { getNonEffectiveHoursDeduction } from './nonEffectiveHours';

export interface UserMetricsResult {
  revenuePackage: number;
  productionPackage: number;
  aCost: number;
  b1Cost: number;
  b2Cost: number;
  cCost: number;
  dCost: number;
  nonEffectiveDeduction: number;
}

import { Role } from '../../types';

export function aggregateUserMonthMetrics(
  logs: ValueCreationLog[],
  user: User,
  month: string,
  resources: MiningResource[],
  users: User[],
  statusFilter: AuditStatus[] // e.g., [AuditStatus.Confirmed, AuditStatus.Approved]
): UserMetricsResult {
  let revenuePackage = 0;
  let productionPackage = 0;
  let aCost = 0;
  let b1Cost = 0;
  let b2Cost = 0;
  let cCost = 0;
  let nonEffectiveDeduction = 0;

  const userLogs = logs.filter(
    (l) =>
      l.recordedCollectorId === user.id &&
      resolveLogBusinessMonth(l) === month &&
      statusFilter.includes(l.status as AuditStatus)
  );

  userLogs.forEach((l) => {
    if (l.category === RefineCategory.Revenue) {
      revenuePackage += calculateHistoricalNetValue(l, resources, users);
    } else if (l.category === RefineCategory.Value) {
      productionPackage += calculateHistoricalNetValue(l, resources, users);
    }

    if (l.costCategory === 'A') {
      aCost += l.dynamicCost || 0;
    } else if (l.costCategory === 'B') {
      if (l.valueConsumptionMode === 'B1') b1Cost += l.dynamicCost || 0;
      else if (l.valueConsumptionMode === 'B2') b2Cost += l.dynamicCost || 0;
    } else if (l.costCategory === 'C') {
      cCost += l.dynamicCost || 0;
    }
  });

  const dLogsInMonth = logs.filter(
    (l) =>
      l.costCategory === 'D' &&
      resolveLogBusinessMonth(l) === month &&
      statusFilter.includes(l.status as AuditStatus)
  );
  const totalDInMonth = dLogsInMonth.reduce((acc, l) => acc + (l.dynamicCost || 0), 0);
  const activeCount = users.filter((u) => u.status !== '离职' && u.category !== '系统管理员' && u.role !== Role.Admin).length || 1;
  const dCost = totalDInMonth / activeCount;

  if (user.category !== 'VP') {
    const nonEffLogs = logs.filter(
      (l) =>
        (l.recordedCollectorId === user.id || (!l.recordedCollectorId && l.rankId === user.id)) &&
        resolveLogBusinessMonth(l) === month &&
        statusFilter.includes(l.status as AuditStatus) &&
        isNonEffectiveHoursEffective(l)
    );
    nonEffLogs.forEach((l) => {
      nonEffectiveDeduction += getNonEffectiveHoursDeduction(l);
    });
  }

  return { revenuePackage, productionPackage, aCost, b1Cost, b2Cost, cCost, dCost, nonEffectiveDeduction };
}

export interface HistoryRecord {
  month: string;
  totalIncome: number;
  totalCost: number;
  current: number;
  startDebt: number;
  endDebt: number;
  quota: number;
}

export interface BonusAllocationResult {
  current: number;
  history: number;
  newDebt: number; // Final_Debt
  quota: number; // 分配额度
  theoreticalBonus: number; // 理论奖金
  ratio: number;
  historyRecords: HistoryRecord[];
}

export function getExpertRatio(category: string): number {
  if (category === '初产专') return 0.5;
  if (category === '中产专') return 0.6;
  if (category === '高产专' || category === '经管员高产专') return 0.06;
  if (category.includes('款专')) return 0.06;
  return 0.05; // 默认
}

export function isExpertCategory(category: string): boolean {
  const c = category || '';
  return c.includes('产专') || c.includes('款专');
}

export function calculateBonusAllocation(
  targetMonth: string,
  user: User,
  allLogs: ValueCreationLog[], // JZCZ + DTCB merged
  resources: MiningResource[],
  users: User[],
  status: AuditStatus
): BonusAllocationResult {
  const category = user.category || '';
  const ratio = getExpertRatio(category);

  if (!isExpertCategory(category)) {
    return {
      current: 0,
      history: 0,
      newDebt: 0,
      quota: 0,
      theoreticalBonus: 0,
      ratio: 0,
      historyRecords: [],
    };
  }

  const isRevenueExpert = category.includes('款专');
  const isProdExpert = category.includes('产专') || category === '经管员高产专';

  const [targetYear, targetMonthStr] = targetMonth.split('-');
  const targetMonthNum = parseInt(targetMonthStr);

  let currentRollingDebt = 0;
  const historyRecords: HistoryRecord[] = [];

  // 从 1 月滚动到目标月的前一个月
  for (let m = 1; m < targetMonthNum; m++) {
    const ym = `${targetYear}-${String(m).padStart(2, '0')}`;
    const mRes = aggregateUserMonthMetrics(allLogs, user, ym, resources, users, [status]);
    let mCurrent = 0;
    let mIncome = 0;
    let mCost = isSalaryActiveForMonth(user, ym) ? getUserSalaryByMonth(user, ym) : 0;

    if (isProdExpert) {
      mIncome = mRes.productionPackage;
      mCost += mRes.b1Cost;
      mCost += mRes.dCost;
      mCost -= mRes.nonEffectiveDeduction;
      mCurrent = mIncome - mCost;
    } else if (isRevenueExpert) {
      mIncome = mRes.revenuePackage;
      mCost += mRes.aCost;
      mCost += mRes.dCost;
      mCost -= mRes.nonEffectiveDeduction;
      mCurrent = mIncome - mCost;
    }
    
    const startDebt = currentRollingDebt;
    let mQuota = 0;

    // 欠产 = 成本 - 收入 (正数表示欠产)
    const mDeficit = mCost - mIncome;
    currentRollingDebt += mDeficit;

    if (currentRollingDebt < 0) {
      // 业绩抵扣完欠产后还有剩余，产生可分配额度
      mQuota = Math.abs(currentRollingDebt);
      currentRollingDebt = 0;
    } else {
      // 仍处于欠产状态或正好抵平
      mQuota = 0;
    }

    historyRecords.push({
      month: ym,
      totalIncome: mIncome,
      totalCost: mCost,
      current: mIncome - mCost, // 业绩 (收入-成本)
      startDebt: startDebt,
      endDebt: currentRollingDebt,
      quota: mQuota,
    });
  }

  const history = currentRollingDebt;

  const cRes = aggregateUserMonthMetrics(allLogs, user, targetMonth, resources, users, [status]);
  
  let currentIncome = 0;
  let currentCost = isSalaryActiveForMonth(user, targetMonth) ? getUserSalaryByMonth(user, targetMonth) : 0;

  if (isProdExpert) {
    currentIncome = cRes.productionPackage;
    currentCost += cRes.b1Cost;
    currentCost += cRes.dCost;
    currentCost -= cRes.nonEffectiveDeduction;
  } else if (isRevenueExpert) {
    currentIncome = cRes.revenuePackage;
    currentCost += cRes.aCost;
    currentCost += cRes.dCost;
    currentCost -= cRes.nonEffectiveDeduction;
  }

  const currentPerformance = currentIncome - currentCost;
  
  let newDebt = history;
  let quota = 0;

  // 当月业绩抵扣历史欠产
  if (currentPerformance > 0) {
    const remaining = currentPerformance - history;
    if (remaining >= 0) {
      newDebt = 0;
      quota = remaining;
    } else {
      newDebt = Math.abs(remaining);
      quota = 0;
    }
  } else {
    newDebt = history + Math.abs(currentPerformance);
    quota = 0;
  }

  const theoreticalBonus = quota * ratio;

  return {
    current: currentPerformance,
    history,
    newDebt,
    quota,
    theoreticalBonus,
    ratio,
    historyRecords,
  };
}
