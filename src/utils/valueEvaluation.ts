import { User, ValueCreationLog, MiningResource, AuditStatus, ValueEfficiencySnapshot, RefineCategory, Role } from '../../types';
import { calculateHistoricalNetValue, getUserSalaryByMonth } from './business';
import { aggregateUserMonthMetrics } from './bonusAllocation';

export interface EvaluationResult extends ValueEfficiencySnapshot {
  tierLabel: string;
  tierColor: string;
  contributionStatus: '优秀' | '观察' | '预警';
  baseSalary: number;
  aCost: number;
  b1Cost: number;
  b2Cost: number;
  cCost: number;
}

/**
 * 计算单个用户的综合价值评价
 */
export function computePersonEvaluation(
  user: User,
  logs: ValueCreationLog[],
  resources: MiningResource[],
  allUsers: User[],
  filterMonth: string
): EvaluationResult {
  const currentYear = filterMonth.split('-')[0];
  
  // 匹配规则：recordedCollectorId 优先，其次是 rankId 回退
  const matchUser = (l: ValueCreationLog) => l.recordedCollectorId === user.id || (!l.recordedCollectorId && l.rankId === user.id);

  // 收入包口径对齐 reconcileMiningFromLogs.ts (保持现状)
  const isIncomeLog = (l: ValueCreationLog) => {
    const isRevenue = l.category === RefineCategory.Revenue && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved);
    const isValue = l.category === RefineCategory.Value && (
      l.status === AuditStatus.Confirmed || 
      l.status === AuditStatus.Approved ||
      (l.status === AuditStatus.Pending && l.confirmationType === '联动确权')
    );
    return isRevenue || isValue;
  };

  // 月度流水
  const monthlyLogs = logs.filter(l => 
    matchUser(l) && 
    isIncomeLog(l) &&
    l.month === filterMonth
  );

  // 年度流水 (至当前月)
  const yearlyLogs = logs.filter(l => 
    matchUser(l) && 
    isIncomeLog(l) &&
    l.month &&
    l.month.startsWith(currentYear) &&
    l.month <= filterMonth
  );

  // 收入计算 (维持现状)
  const monthlyIncome = monthlyLogs.reduce((acc, log) => {
    return acc + calculateHistoricalNetValue(log, resources, allUsers);
  }, 0);

  const yearlyIncome = yearlyLogs.reduce((acc, log) => {
    return acc + calculateHistoricalNetValue(log, resources, allUsers);
  }, 0);

  // 成本计算：复用 aggregateUserMonthMetrics，款专成本=工资+A，产专成本=工资+B1，完美对账分配侧
  const category = user.category || '';
  const isRevenueExpert = category.includes('款专');
  const isProdExpert = category.includes('产专') || category === '经管员高产专';

  const mMetrics = aggregateUserMonthMetrics(
    logs,
    user,
    filterMonth,
    resources,
    allUsers,
    [AuditStatus.Confirmed, AuditStatus.Approved]
  );

  const baseSalary = getUserSalaryByMonth(user, filterMonth);
  let monthlyCost = baseSalary;
  if (isRevenueExpert) {
    monthlyCost += mMetrics.aCost;
  } else if (isProdExpert) {
    monthlyCost += mMetrics.b1Cost;
  }
  
  // 年度成本 = 从 1 月到 filterMonth 累计月度成本 (工资 + A/B1)
  let yearlyCost = 0;
  const targetYear = filterMonth.split('-')[0];
  const targetMonthNum = parseInt(filterMonth.split('-')[1]);
  for (let m = 1; m <= targetMonthNum; m++) {
    const monthStr = `${targetYear}-${String(m).padStart(2, '0')}`;
    const ymMetrics = aggregateUserMonthMetrics(
      logs,
      user,
      monthStr,
      resources,
      allUsers,
      [AuditStatus.Confirmed, AuditStatus.Approved]
    );
    let mCost = getUserSalaryByMonth(user, monthStr);
    if (isRevenueExpert) {
      mCost += ymMetrics.aCost;
    } else if (isProdExpert) {
      mCost += ymMetrics.b1Cost;
    }
    yearlyCost += mCost;
  }

  // 效率与贡献
  const efficiency = monthlyCost > 0 ? monthlyIncome / monthlyCost : 0;
  const yearlyEfficiency = yearlyCost > 0 ? yearlyIncome / yearlyCost : 0;
  const contribution = monthlyIncome - monthlyCost;
  const fixedRatio = monthlyIncome > 0 ? (monthlyCost / monthlyIncome) * 100 : 0;

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
    filterMonth,
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
    aCost: mMetrics.aCost,
    b1Cost: mMetrics.b1Cost,
    b2Cost: mMetrics.b2Cost,
    cCost: mMetrics.cCost || 0
  };
}

/**
 * 汇总计算所有在职采集主体的综合评价（包含款专与产专，仅排除管理员、NPC与产值代录）
 */
export function computeAllEvaluations(
  users: User[],
  logs: ValueCreationLog[],
  resources: MiningResource[],
  filterMonth: string
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
    computePersonEvaluation(user, logs, resources, users, filterMonth)
  ).sort((a, b) => b.contribution - a.contribution);
}
