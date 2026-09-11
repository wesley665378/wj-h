import { User, ValueCreationLog, MiningResource, AuditStatus, ValueEfficiencySnapshot, RefineCategory, Role } from '../../types';
import { calculateHistoricalNetValue, getUserSalaryByMonth } from './business';
import { aggregateUserMonthMetrics, calculateUserDCost, calculateBonusAllocation } from './bonusAllocation';
import { isLogInFilter, resolveLogBusinessMonth } from './dateUtils';
import { isNonEffectiveHoursEffective, isSalaryActiveForMonth } from './employmentStatus';
import { getNonEffectiveHoursDeduction } from './nonEffectiveHours';
import { isDynamicCostLog } from './costCategory';

export interface EvaluationResult extends ValueEfficiencySnapshot {
  tierLabel: string;
  tierColor: string;
  contributionStatus: '优秀' | '观察' | '预警';
  historyDebt?: number;
  historyDebtUpper?: number;
  historyDebtLower?: number;
  baseSalary: number;
  aCost: number;
  b1Cost: number;
  b2Cost: number;
  cCost: number;
  dCost: number;
  nonEffectiveDeduction: number;
  confirmedValueConfirmed?: number;
  pendingValueConfirmed?: number;
  isProdExpert?: boolean;
  isRevenueExpert?: boolean;
  monthlyIncomeUpper?: number;
  monthlyIncomeLower?: number;
  contributionUpper?: number;
  contributionLower?: number;
  monthlyEfficiencyUpper?: number;
  monthlyEfficiencyLower?: number;
  yearlyIncomeUpper?: number;
  yearlyIncomeLower?: number;
  yearlyContribution?: number;
  yearlyContributionUpper?: number;
  yearlyContributionLower?: number;
  yearlyEfficiencyUpper?: number;
  yearlyEfficiencyLower?: number;
  tierUpper?: string;
  tierLower?: string;
  tierLabelUpper?: string;
  tierLabelLower?: string;
}

/**
 * 计算单个用户在指定月份的月度成本包明细
 */
export function computeUserMonthlyCost(
  user: User,
  logs: ValueCreationLog[],
  resources: MiningResource[],
  allUsers: User[],
  monthStr: string
): {
  monthlyCost: number;
  baseSalary: number;
  aCost: number;
  b1Cost: number;
  b2Cost: number;
  cCost: number;
  dCost: number;
  nonEffectiveDeduction: number;
} {
  // 不在职月份，成本计 0
  if (!isSalaryActiveForMonth(user, monthStr)) {
    return {
      monthlyCost: 0,
      baseSalary: 0,
      aCost: 0,
      b1Cost: 0,
      b2Cost: 0,
      cCost: 0,
      dCost: 0,
      nonEffectiveDeduction: 0,
    };
  }

  const ymMetrics = aggregateUserMonthMetrics(
    logs,
    user,
    monthStr,
    resources,
    allUsers,
    [AuditStatus.Confirmed, AuditStatus.Approved]
  );

  const category = user.category || '';
  const isRevenueExpert = category.includes('款专');
  const isProdExpert = category.includes('产专') || category === '经管员高产专';

  const baseSalary = getUserSalaryByMonth(user, monthStr);
  let monthlyCost = baseSalary;
  if (isRevenueExpert) {
    monthlyCost += ymMetrics.aCost;
  } else if (isProdExpert) {
    monthlyCost += ymMetrics.b1Cost;
  }
  monthlyCost += ymMetrics.dCost;
  monthlyCost -= ymMetrics.nonEffectiveDeduction;

  return {
    monthlyCost,
    baseSalary,
    aCost: ymMetrics.aCost,
    b1Cost: ymMetrics.b1Cost,
    b2Cost: ymMetrics.b2Cost,
    cCost: ymMetrics.cCost,
    dCost: ymMetrics.dCost,
    nonEffectiveDeduction: ymMetrics.nonEffectiveDeduction,
  };
}

/**
 * 计算单个用户的综合价值评价
 */
export function computePersonEvaluation(
  user: User,
  logs: ValueCreationLog[],
  resources: MiningResource[],
  allUsers: User[],
  filterMonth: string,
  startDate?: string,
  endDate?: string
): EvaluationResult {
  const refMonth = startDate ? startDate.slice(0, 7) : filterMonth;
  const currentYear = refMonth.split('-')[0];
  
  // 匹配规则：recordedCollectorId 优先，其次是 rankId 回退
  const matchUser = (l: ValueCreationLog) => l.recordedCollectorId === user.id || (!l.recordedCollectorId && l.rankId === user.id);

  // 状态检查辅助函数
  const isConfirmedOrApproved = (status?: any) => 
    status === AuditStatus.Confirmed || 
    status === AuditStatus.Approved || 
    (status as string) === '已确权' || 
    (status as string) === '入库';

  // 产专待确权联动判断：必须同时为待确权且确权方式为「联动确权」
  const isLinkedPending = (l: ValueCreationLog) => 
    (l.status === AuditStatus.Pending || (l.status as string) === '待确权') && 
    (l.confirmationType === '联动确权' || (l.confirmationType as string) === '联动');

  const userCat = user.category || '';
  const isRevenueExpert = userCat.includes('款专');
  const isProdExpert = userCat.includes('产专') || userCat === '经管员高产专';

  // --- 1. 月度收产包计算 ---
  let monthlyIncome = 0;
  let confirmedValueConfirmed = 0;
  let pendingValueConfirmed = 0;
  let monthlyIncomeUpper = 0;
  let monthlyIncomeLower = 0;

  if (isProdExpert) {
    // 产专（双行口径）：
    // 现金行：仅已确权或入库产值
    const prodConfirmedMonthlyLogs = logs.filter(l => 
      matchUser(l) && 
      !isDynamicCostLog(l) &&
      (l.category === RefineCategory.Value || (l.category as string) === '产值') &&
      isConfirmedOrApproved(l.status) &&
      isLogInFilter(l, filterMonth, startDate, endDate)
    );
    // 虚拟行待确权增量：仅待确权且 confirmationType === '联动确权'
    const prodLinkedPendingMonthlyLogs = logs.filter(l => 
      matchUser(l) && 
      !isDynamicCostLog(l) &&
      (l.category === RefineCategory.Value || (l.category as string) === '产值') &&
      isLinkedPending(l) &&
      isLogInFilter(l, filterMonth, startDate, endDate)
    );

    confirmedValueConfirmed = prodConfirmedMonthlyLogs.reduce((acc, log) => {
      return acc + calculateHistoricalNetValue(log, resources, allUsers);
    }, 0);

    pendingValueConfirmed = prodLinkedPendingMonthlyLogs.reduce((acc, log) => {
      return acc + calculateHistoricalNetValue(log, resources, allUsers);
    }, 0);

    monthlyIncomeLower = confirmedValueConfirmed;
    monthlyIncomeUpper = confirmedValueConfirmed + pendingValueConfirmed;
    monthlyIncome = monthlyIncomeLower;
  } else if (isRevenueExpert) {
    // 款专：仅已确权或入库的收款，不含任何待确权收款
    const revenueMonthlyLogs = logs.filter(l => 
      matchUser(l) && 
      !isDynamicCostLog(l) &&
      (l.category === RefineCategory.Revenue || (l.category as string) === '收款') &&
      isConfirmedOrApproved(l.status) &&
      isLogInFilter(l, filterMonth, startDate, endDate)
    );

    monthlyIncome = revenueMonthlyLogs.reduce((acc, log) => {
      return acc + calculateHistoricalNetValue(log, resources, allUsers);
    }, 0);

    monthlyIncomeLower = monthlyIncome;
    monthlyIncomeUpper = monthlyIncome;
  } else {
    // 通用回退
    const generalMonthlyLogs = logs.filter(l => 
      matchUser(l) && 
      !isDynamicCostLog(l) &&
      isConfirmedOrApproved(l.status) &&
      isLogInFilter(l, filterMonth, startDate, endDate)
    );
    monthlyIncome = generalMonthlyLogs.reduce((acc, log) => {
      return acc + calculateHistoricalNetValue(log, resources, allUsers);
    }, 0);
    monthlyIncomeLower = monthlyIncome;
    monthlyIncomeUpper = monthlyIncome;
  }

  // --- 2. 月度成本包计算 ---
  let monthlyCostDetail: ReturnType<typeof computeUserMonthlyCost>;
  if (startDate || endDate) {
    // 自定义起止日期的成本筛选
    const costLogs = logs.filter(l => 
      l.recordedCollectorId === user.id &&
      isDynamicCostLog(l) &&
      [AuditStatus.Confirmed, AuditStatus.Approved].includes(l.status as AuditStatus) &&
      isLogInFilter(l, filterMonth, startDate, endDate)
    );
    let aCost = 0, b1Cost = 0, b2Cost = 0, cCost = 0;
    costLogs.forEach(l => {
      if (l.costCategory === 'A') aCost += l.dynamicCost || 0;
      else if (l.costCategory === 'B') {
        if (l.valueConsumptionMode === 'B1') b1Cost += l.dynamicCost || 0;
        else if (l.valueConsumptionMode === 'B2') b2Cost += l.dynamicCost || 0;
      } else if (l.costCategory === 'C') cCost += l.dynamicCost || 0;
    });

    const nonEffectiveDeduction = (user.category === 'VP') ? 0 : logs
      .filter(l => 
        matchUser(l) &&
        [AuditStatus.Confirmed, AuditStatus.Approved].includes(l.status as AuditStatus) &&
        isNonEffectiveHoursEffective(l) &&
        isLogInFilter(l, filterMonth, startDate, endDate)
      )
      .reduce((acc, l) => acc + getNonEffectiveHoursDeduction(l), 0);

    const dCost = calculateUserDCost(
      user,
      logs,
      allUsers,
      refMonth,
      [AuditStatus.Confirmed, AuditStatus.Approved],
      startDate,
      endDate
    );

    const baseSalary = isSalaryActiveForMonth(user, refMonth) ? getUserSalaryByMonth(user, refMonth) : 0;
    let mCost = baseSalary;
    if (isRevenueExpert) mCost += aCost;
    else if (isProdExpert) mCost += b1Cost;
    mCost += dCost;
    mCost -= nonEffectiveDeduction;

    monthlyCostDetail = {
      monthlyCost: mCost,
      baseSalary,
      aCost,
      b1Cost,
      b2Cost,
      cCost,
      dCost,
      nonEffectiveDeduction,
    };
  } else {
    monthlyCostDetail = computeUserMonthlyCost(user, logs, resources, allUsers, refMonth);
  }

  const {
    monthlyCost,
    baseSalary,
    aCost,
    b1Cost,
    b2Cost,
    cCost,
    dCost,
    nonEffectiveDeduction
  } = monthlyCostDetail;

  // --- 3. 年度收产包与成本包计算 ---
  let yearlyIncome = 0;
  let yearlyIncomeUpper = 0;
  let yearlyIncomeLower = 0;

  if (isProdExpert) {
    const prodConfirmedYearlyLogs = logs.filter(l => 
      matchUser(l) && 
      !isDynamicCostLog(l) &&
      (l.category === RefineCategory.Value || (l.category as string) === '产值') &&
      isConfirmedOrApproved(l.status) &&
      resolveLogBusinessMonth(l).startsWith(currentYear) &&
      resolveLogBusinessMonth(l) <= refMonth
    );
    const prodLinkedPendingYearlyLogs = logs.filter(l => 
      matchUser(l) && 
      !isDynamicCostLog(l) &&
      (l.category === RefineCategory.Value || (l.category as string) === '产值') &&
      isLinkedPending(l) &&
      resolveLogBusinessMonth(l).startsWith(currentYear) &&
      resolveLogBusinessMonth(l) <= refMonth
    );

    const yearlyConfirmedValue = prodConfirmedYearlyLogs.reduce((acc, log) => {
      return acc + calculateHistoricalNetValue(log, resources, allUsers);
    }, 0);

    const yearlyPendingValue = prodLinkedPendingYearlyLogs.reduce((acc, log) => {
      return acc + calculateHistoricalNetValue(log, resources, allUsers);
    }, 0);

    yearlyIncomeLower = yearlyConfirmedValue;
    yearlyIncomeUpper = yearlyConfirmedValue + yearlyPendingValue;
    yearlyIncome = yearlyIncomeLower;
  } else if (isRevenueExpert) {
    const revenueYearlyLogs = logs.filter(l => 
      matchUser(l) && 
      !isDynamicCostLog(l) &&
      (l.category === RefineCategory.Revenue || (l.category as string) === '收款') &&
      isConfirmedOrApproved(l.status) &&
      resolveLogBusinessMonth(l).startsWith(currentYear) &&
      resolveLogBusinessMonth(l) <= refMonth
    );

    yearlyIncome = revenueYearlyLogs.reduce((acc, log) => {
      return acc + calculateHistoricalNetValue(log, resources, allUsers);
    }, 0);

    yearlyIncomeLower = yearlyIncome;
    yearlyIncomeUpper = yearlyIncome;
  } else {
    const generalYearlyLogs = logs.filter(l => 
      matchUser(l) && 
      !isDynamicCostLog(l) &&
      isConfirmedOrApproved(l.status) &&
      resolveLogBusinessMonth(l).startsWith(currentYear) &&
      resolveLogBusinessMonth(l) <= refMonth
    );
    yearlyIncome = generalYearlyLogs.reduce((acc, log) => {
      return acc + calculateHistoricalNetValue(log, resources, allUsers);
    }, 0);
    yearlyIncomeLower = yearlyIncome;
    yearlyIncomeUpper = yearlyIncome;
  }

  // 年度成本 = 逐月累加业务年度内实际在职月份的月成本（不在职月份不计入）
  let yearlyCost = 0;
  const targetYear = currentYear;
  const targetMonthNum = parseInt(refMonth.split('-')[1]);
  for (let m = 1; m <= targetMonthNum; m++) {
    const monthStr = `${targetYear}-${String(m).padStart(2, '0')}`;
    const mCostDetail = computeUserMonthlyCost(user, logs, resources, allUsers, monthStr);
    yearlyCost += mCostDetail.monthlyCost;
  }

  // --- 4. 损益、效率与分档派生 ---
  const baselineMonthlyIncome = isProdExpert ? monthlyIncomeLower : monthlyIncome;
  const baselineYearlyIncome = isProdExpert ? yearlyIncomeLower : yearlyIncome;

  const efficiency = monthlyCost > 0 ? baselineMonthlyIncome / monthlyCost : 0;
  const yearlyEfficiency = yearlyCost > 0 ? baselineYearlyIncome / yearlyCost : 0;
  const contribution = baselineMonthlyIncome - monthlyCost;
  const fixedRatio = baselineMonthlyIncome > 0 ? (monthlyCost / baselineMonthlyIncome) * 100 : 0;

  const contributionUpper = monthlyIncomeUpper - monthlyCost;
  const contributionLower = monthlyIncomeLower - monthlyCost;
  const monthlyEfficiencyUpper = monthlyCost > 0 ? monthlyIncomeUpper / monthlyCost : 0;
  const monthlyEfficiencyLower = monthlyCost > 0 ? monthlyIncomeLower / monthlyCost : 0;

  const yearlyContribution = baselineYearlyIncome - yearlyCost;
  const yearlyContributionUpper = yearlyIncomeUpper - yearlyCost;
  const yearlyContributionLower = yearlyIncomeLower - yearlyCost;
  const yearlyEfficiencyUpper = yearlyCost > 0 ? yearlyIncomeUpper / yearlyCost : 0;
  const yearlyEfficiencyLower = yearlyCost > 0 ? yearlyIncomeLower / yearlyCost : 0;

  const getTierFromEff = (eff: number) => {
    if (eff > 2.5) return { tier: 'S', tierLabel: '卓越级', tierColor: 'text-amber-500' };
    if (eff >= 1.5) return { tier: 'A', tierLabel: '进取级', tierColor: 'text-blue-500' };
    if (eff >= 1.2) return { tier: 'B', tierLabel: '稳健级', tierColor: 'text-emerald-500' };
    return { tier: 'C', tierLabel: '改进级', tierColor: 'text-rose-500' };
  };

  const upperTierInfo = getTierFromEff(monthlyEfficiencyUpper);
  const lowerTierInfo = getTierFromEff(monthlyEfficiencyLower);
  const defaultTierInfo = getTierFromEff(efficiency);

  // 历史欠产（当年 1 ~ M-1 滚动，每年 1 月清零；负数表示欠产）
  let historyDebt = 0;
  let historyDebtUpper = 0;
  let historyDebtLower = 0;
  try {
    const allocConfirmed = calculateBonusAllocation(
      refMonth,
      user,
      logs,
      resources,
      allUsers,
      AuditStatus.Confirmed
    );
    const allocApproved = calculateBonusAllocation(
      refMonth,
      user,
      logs,
      resources,
      allUsers,
      AuditStatus.Approved
    );
    historyDebtLower = allocConfirmed.history > 0 ? -allocConfirmed.history : 0;
    historyDebtUpper = allocApproved.history > 0 ? -allocApproved.history : 0;
    historyDebt = historyDebtLower;
  } catch {
    historyDebt = 0;
    historyDebtUpper = 0;
    historyDebtLower = 0;
  }

  return {
    userId: user.id,
    userName: user.name,
    category: user.category || '奋斗者',
    filterMonth: refMonth,
    monthlyIncome,
    monthlyCost,
    monthlyEfficiency: efficiency,
    historyDebt,
    historyDebtUpper,
    historyDebtLower,
    yearlyIncome,
    yearlyCost,
    yearlyEfficiency,
    tier: defaultTierInfo.tier,
    tierLabel: defaultTierInfo.tierLabel,
    tierColor: defaultTierInfo.tierColor,
    contribution,
    fixedRatio,
    timestamp: Date.now(),
    contributionStatus: contribution > 0 ? '优秀' : (contribution > -1000 ? '观察' : '预警'),
    baseSalary,
    aCost,
    b1Cost,
    b2Cost,
    cCost,
    dCost,
    nonEffectiveDeduction,
    confirmedValueConfirmed,
    pendingValueConfirmed,
    isProdExpert,
    isRevenueExpert,
    monthlyIncomeUpper,
    monthlyIncomeLower,
    contributionUpper,
    contributionLower,
    monthlyEfficiencyUpper,
    monthlyEfficiencyLower,
    yearlyIncomeUpper,
    yearlyIncomeLower,
    yearlyContribution,
    yearlyContributionUpper,
    yearlyContributionLower,
    yearlyEfficiencyUpper,
    yearlyEfficiencyLower,
    tierUpper: upperTierInfo.tier,
    tierLower: lowerTierInfo.tier,
    tierLabelUpper: upperTierInfo.tierLabel,
    tierLabelLower: lowerTierInfo.tierLabel,
  };
}

/**
 * 汇总计算所有在职采集主体的综合评价（包含款专与产专，仅排除管理员、NPC与产值代录）
 */
export function computeAllEvaluations(
  users: User[],
  logs: ValueCreationLog[],
  resources: MiningResource[],
  filterMonth: string,
  startDate?: string,
  endDate?: string
): EvaluationResult[] {
  // 正确过滤（在职采集主体）：
  // 保留：
  // - userStatus 不是 inactive
  // - 职级 category 含「款专」或「产专」（含：初/中/高款专、初/中/高产专、经管员高款专、经管员高产专）
  // 排除：
  // - NPC、Role.npcxie、category === 'NPC'
  // - Role.Admin、category 含「管理员」（系统管理员/水库管理员/经营单元管理员等）
  // - category 或姓名含「产值代录」（只排除代录，不要用 Role.ValueCollector 当排除条件）
  // 不要再写：role === Role.ValueCollector 就 return false。
  const activeUsers = users.filter(u => {
    // 1. 排除离职人员（根据目标月份动态判断计薪与在职状态）
    if (!isSalaryActiveForMonth(u, filterMonth)) return false;

    const cat = u.category || '';
    const name = u.name || '';
    const role = u.role;

    // 2. 排除 NPC
    if (cat === 'NPC' || cat.includes('NPC') || role === Role.NPC || role === Role.npcxie || name === 'NPC' || name === 'npcxie') return false;

    // 3. 排除 Role.Admin 与 category 含“管理员”
    if (role === Role.Admin || cat.includes('管理员')) return false;

    // 4. 排除 category 或姓名含“产值代录”
    if (cat.includes('产值代录') || name.includes('产值代录')) return false;

    // 5. 必须为在职采集主体：category 包含“款专”或“产专”
    // （例如：初款专、中款专、高款专、经管员高款专、初产专、中产专、高产专、经管员高产专）
    const isExpert = cat.includes('款专') || cat.includes('产专');
    if (!isExpert) return false;

    return true;
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[computeAllEvaluations] Filtered users total: ${users.length} -> active experts: ${activeUsers.length} (diff: -${users.length - activeUsers.length})`);
  }

  return activeUsers.map(user => 
    computePersonEvaluation(user, logs, resources, users, filterMonth, startDate, endDate)
  ).sort((a, b) => b.contribution - a.contribution);
}
