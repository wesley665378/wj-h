import { User, ValueCreationLog, MiningResource, AuditStatus, ValueEfficiencySnapshot, RefineCategory, Role } from '../../types';
import { calculateHistoricalNetValue, getUserSalaryByMonth } from './business';
import { aggregateUserMonthMetrics } from './bonusAllocation';
import { isLogInFilter, resolveLogBusinessMonth } from './dateUtils';
import { isNonEffectiveHoursEffective, isSalaryActiveForMonth } from './employmentStatus';
import { getNonEffectiveHoursDeduction } from './nonEffectiveHours';

export interface EvaluationResult extends ValueEfficiencySnapshot {
  tierLabel: string;
  tierColor: string;
  contributionStatus: '优秀' | '观察' | '预警';
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

  // 收入包口径对齐 reconcileMiningFromLogs.ts (仅计算已确权/已入库的收款/产值)
  const isIncomeLog = (l: ValueCreationLog) => {
    const isRevenue = l.category === RefineCategory.Revenue && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved);
    const isValue = l.category === RefineCategory.Value && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved);
    return isRevenue || isValue;
  };

  // 月度流水 (支持自定义起止日期筛选，或者默认按月筛选)
  const monthlyLogs = logs.filter(l => 
    matchUser(l) && 
    isIncomeLog(l) &&
    isLogInFilter(l, filterMonth, startDate, endDate)
  );

  // 月度收入计算
  const monthlyIncome = monthlyLogs.reduce((acc, log) => {
    return acc + calculateHistoricalNetValue(log, resources, allUsers);
  }, 0);

  // 月度成本包计算
  let monthlyCostDetail: ReturnType<typeof computeUserMonthlyCost>;
  if (startDate || endDate) {
    // 自定义起止日期的成本筛选
    const costLogs = logs.filter(l => 
      l.recordedCollectorId === user.id &&
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

    const category = user.category || '';
    const isRevenueExpert = category.includes('款专');
    const isProdExpert = category.includes('产专') || category === '经管员高产专';

    const nonEffectiveDeduction = (user.category === 'VP') ? 0 : logs
      .filter(l => 
        matchUser(l) &&
        [AuditStatus.Confirmed, AuditStatus.Approved].includes(l.status as AuditStatus) &&
        isNonEffectiveHoursEffective(l) &&
        isLogInFilter(l, filterMonth, startDate, endDate)
      )
      .reduce((acc, l) => acc + getNonEffectiveHoursDeduction(l), 0);

    const dLogsInPeriod = logs.filter(l =>
      l.costCategory === 'D' &&
      [AuditStatus.Confirmed, AuditStatus.Approved].includes(l.status as AuditStatus) &&
      isLogInFilter(l, filterMonth, startDate, endDate)
    );
    const totalDCostInPeriod = dLogsInPeriod.reduce((acc, l) => acc + (l.dynamicCost || 0), 0);
    const activeUserCount = allUsers.filter(u => u.status !== '离职' && u.category !== '系统管理员' && u.role !== Role.Admin).length || 1;
    const dCost = totalDCostInPeriod / activeUserCount;

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

  // 年度流水 (从 1 月至 refMonth 业务年度内)
  const yearlyLogs = logs.filter(l => 
    matchUser(l) && 
    isIncomeLog(l) &&
    resolveLogBusinessMonth(l).startsWith(currentYear) &&
    resolveLogBusinessMonth(l) <= refMonth
  );

  const yearlyIncome = yearlyLogs.reduce((acc, log) => {
    return acc + calculateHistoricalNetValue(log, resources, allUsers);
  }, 0);

  // 年度成本 = 逐月累加业务年度内实际在职月份的月成本（不在职月份不计入）
  let yearlyCost = 0;
  const targetYear = currentYear;
  const targetMonthNum = parseInt(refMonth.split('-')[1]);
  for (let m = 1; m <= targetMonthNum; m++) {
    const monthStr = `${targetYear}-${String(m).padStart(2, '0')}`;
    const mCostDetail = computeUserMonthlyCost(user, logs, resources, allUsers, monthStr);
    yearlyCost += mCostDetail.monthlyCost;
  }

  // 效率与贡献
  const efficiency = monthlyCost > 0 ? monthlyIncome / monthlyCost : 0;
  const yearlyEfficiency = yearlyCost > 0 ? yearlyIncome / yearlyCost : 0;
  const contribution = monthlyIncome - monthlyCost;
  const fixedRatio = monthlyIncome > 0 ? (monthlyCost / monthlyIncome) * 100 : 0;

  // 产值类确权情况统计 (用于 InfoTip 产兑包明细提示 及 产专双行计算)
  const valueLogs = logs.filter(l => 
    matchUser(l) && 
    l.category === RefineCategory.Value &&
    isLogInFilter(l, filterMonth, startDate, endDate)
  );

  const confirmedValueConfirmed = valueLogs
    .filter(l => l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved)
    .reduce((acc, log) => acc + calculateHistoricalNetValue(log, resources, allUsers), 0);

  const pendingValueConfirmed = valueLogs
    .filter(l => l.status === AuditStatus.Pending)
    .reduce((acc, log) => acc + calculateHistoricalNetValue(log, resources, allUsers), 0);

  const userCat = user.category || '';
  const isProdExpert = userCat.includes('产专') || userCat === '经管员高产专';
  const isRevenueExpert = userCat.includes('款专');

  const monthlyIncomeUpper = isProdExpert ? (confirmedValueConfirmed + pendingValueConfirmed) : monthlyIncome;
  const monthlyIncomeLower = isProdExpert ? confirmedValueConfirmed : monthlyIncome;
  const contributionUpper = monthlyIncomeUpper - monthlyCost;
  const contributionLower = monthlyIncomeLower - monthlyCost;
  const monthlyEfficiencyUpper = monthlyCost > 0 ? monthlyIncomeUpper / monthlyCost : 0;
  const monthlyEfficiencyLower = monthlyCost > 0 ? monthlyIncomeLower / monthlyCost : 0;

  // 年度产值拆分 (产专)
  const yearlyValueLogs = logs.filter(l => 
    matchUser(l) && 
    l.category === RefineCategory.Value &&
    resolveLogBusinessMonth(l).startsWith(currentYear) &&
    resolveLogBusinessMonth(l) <= refMonth
  );

  const yearlyConfirmedValue = yearlyValueLogs
    .filter(l => l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved)
    .reduce((acc, log) => acc + calculateHistoricalNetValue(log, resources, allUsers), 0);

  const yearlyPendingValue = yearlyValueLogs
    .filter(l => l.status === AuditStatus.Pending)
    .reduce((acc, log) => acc + calculateHistoricalNetValue(log, resources, allUsers), 0);

  const yearlyIncomeUpper = isProdExpert ? (yearlyConfirmedValue + yearlyPendingValue) : yearlyIncome;
  const yearlyIncomeLower = isProdExpert ? yearlyConfirmedValue : yearlyIncome;
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

  // 能级阈值：>2.5 S，>=1.5 A，>=1.2 B，否则 C (维持现状)
  let tier = 'C';
  let tierLabel = '改进级';
  let tierColor = 'text-rose-500';

  if (efficiency > 2.5) {
    tier = 'S';
    tierLabel = '卓越级';
    tierColor = 'text-amber-500';
  } else if (efficiency >= 1.5) {
    tier = 'A';
    tierLabel = '进取级';
    tierColor = 'text-blue-500';
  } else if (efficiency >= 1.2) {
    tier = 'B';
    tierLabel = '稳健级';
    tierColor = 'text-emerald-500';
  }

  return {
    userId: user.id,
    userName: user.name,
    category: user.category || '奋斗者',
    filterMonth: refMonth,
    monthlyIncome,
    monthlyCost,
    monthlyEfficiency: efficiency,
    yearlyIncome,
    yearlyCost,
    yearlyEfficiency,
    tier,
    tierLabel,
    tierColor,
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
    // 1. 排除离职人员
    if (u.userStatus === 'inactive') return false;

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
