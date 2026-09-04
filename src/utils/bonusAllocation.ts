import {
  AuditStatus,
  MiningResource,
  RefineCategory,
  User,
  ValueCreationLog,
  Role,
} from '../../types';
import { calculateHistoricalNetValue, getUserSalaryByMonth } from './business';
import { resolveLogBusinessMonth, isLogInFilter } from './dateUtils';
import { isNonEffectiveHoursEffective, isSalaryActiveForMonth } from './employmentStatus';
import { getNonEffectiveHoursDeduction } from './nonEffectiveHours';
import { centerMatch } from './centerScope';

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

function findUserById(users: User[], id?: string): User | undefined {
  if (!id) return undefined;
  const cleanId = String(id).trim();
  if (!cleanId) return undefined;
  return users.find(u =>
    u && (
      String(u.id).trim() === cleanId ||
      (u.userId && String(u.userId).trim() === cleanId) ||
      (u.name && String(u.name).trim() === cleanId)
    )
  );
}

/**
 * 解析流水的归属经营单元中心名称
 * 优先采集人，其次提报人
 */
export function resolveLogBusinessUnitCenter(
  log: ValueCreationLog,
  users: User[]
): string | undefined {
  // 1. 优先根据采集人判断归属单元
  const collector = findUserById(users, log.recordedCollectorId);
  if (collector?.center) return collector.center;

  // 2. 其次根据提报人 (rankId / operatorId) 判断归属单元
  const submitter = findUserById(users, log.rankId) || findUserById(users, (log as any).operatorId);
  if (submitter?.center) return submitter.center;

  // 3. 流水本身附带的 center / businessUnit 字段
  if ((log as any).center) return (log as any).center;
  if ((log as any).businessUnit) return (log as any).businessUnit;

  return undefined;
}

/**
 * 判断用户是否为指定单元在岗采集主体（含款专/产专；排除 Admin/系统管理员/离职/无 center）
 */
export function isUnitActiveCollector(
  u: User,
  unitCenter?: string,
  month?: string
): boolean {
  if (!u) return false;
  if (!u.center || !u.center.trim()) return false;
  if (u.center === '统筹水库' || u.center === '公司' || u.center === '总部') return false;

  // 必须匹配目标单元
  if (unitCenter && !centerMatch(u.center, unitCenter)) return false;

  // 排除 Admin 与系统管理员
  if (u.role === Role.Admin || (u.role as string) === 'admin') return false;
  const cat = u.category || '';
  if (cat === '系统管理员' || cat.includes('系统管理员')) return false;
  if (cat.includes('管理员') && !cat.includes('款专') && !cat.includes('产专')) return false;

  // 排除 NPC 与产值代录
  const name = u.name || '';
  if (cat === 'NPC' || cat.includes('NPC') || u.role === Role.NPC || u.role === Role.npcxie || name === 'NPC' || name === 'npcxie') return false;
  if (cat.includes('产值代录') || name.includes('产值代录')) return false;

  // 排除离职
  if (u.status === '离职' || u.userStatus === 'inactive') return false;
  if (month && !isSalaryActiveForMonth(u, month)) return false;

  // 必须为采集主体（含款专/产专）
  const isCollector =
    cat.includes('款专') ||
    cat.includes('产专') ||
    u.role === Role.RevenueCollector ||
    u.role === Role.ValueCollector ||
    u.role === Role.Collector;

  return isCollector;
}

function isStatusMatch(status: any, filter: AuditStatus[]): boolean {
  if (!status) return false;
  if (filter.includes(status as AuditStatus)) return true;
  for (const s of filter) {
    if (s === AuditStatus.Confirmed && (status === '已确权' || status === 'Confirmed' || status === 'confirmed')) return true;
    if (s === AuditStatus.Approved && (status === '入库' || status === 'Approved' || status === 'approved')) return true;
    if (s === AuditStatus.Pending && (status === '待确权' || status === 'Pending' || status === 'pending')) return true;
  }
  return false;
}

/**
 * 计算单个用户应分摊的 D 类消耗
 * 规则：
 * 1. 仅摊给本经营单元内采集主体（排除 Admin/系统管理员/离职/无 center）
 * 2. ΣD 按流水归属经营单元分组（采集人/提报人 center，centerMatch）
 * 3. 分母 = 该单元在岗采集主体人数
 * 4. 每人 dCost = 本单元ΣD / 本单元采集主体人数
 */
export function calculateUserDCost(
  user: User,
  logs: ValueCreationLog[],
  users: User[],
  month: string,
  statusFilter: AuditStatus[] = [AuditStatus.Confirmed, AuditStatus.Approved],
  startDate?: string,
  endDate?: string
): number {
  if (!user || !user.center) return 0;

  // 仅摊给本经营单元内采集主体：非在岗采集主体分摊为 0
  if (!isUnitActiveCollector(user, user.center, month)) {
    return 0;
  }

  // 筛选该月份/时间段内所有 D 类流水
  const dLogs = logs.filter(l => {
    if (l.costCategory !== 'D') return false;
    if (!isStatusMatch(l.status, statusFilter)) return false;
    if (startDate || endDate) {
      return isLogInFilter(l, month, startDate, endDate);
    }
    return resolveLogBusinessMonth(l) === month;
  });

  // 筛选归属于本经营单元的 D 类流水（采集人/提报人 center，centerMatch）
  const unitDLogs = dLogs.filter(l => {
    const logCenter = resolveLogBusinessUnitCenter(l, users);
    return logCenter ? centerMatch(logCenter, user.center) : false;
  });

  // 本单元 ΣD
  const totalUnitD = unitDLogs.reduce((acc, l) => acc + (l.dynamicCost || 0), 0);
  if (totalUnitD <= 0) return 0;

  // 分母 = 该单元在岗采集主体（含款专/产专；排除 Admin/系统管理员/离职/无 center）
  const seenUserIds = new Set<string>();
  const unitCollectors = users.filter(u => {
    if (!u || !u.id) return false;
    if (seenUserIds.has(u.id)) return false;
    if (isUnitActiveCollector(u, user.center, month)) {
      seenUserIds.add(u.id);
      return true;
    }
    return false;
  });

  const denominator = unitCollectors.length;
  if (denominator <= 0) return 0;

  // 每人 dCost = 本单元ΣD / 本单元采集主体人数
  return totalUnitD / denominator;
}

export function aggregateUserMonthMetrics(
  logs: ValueCreationLog[],
  user: User,
  month: string,
  resources: MiningResource[],
  users: User[],
  statusFilter: AuditStatus[], // e.g., [AuditStatus.Confirmed, AuditStatus.Approved]
  startDate?: string,
  endDate?: string
): UserMetricsResult {
  let revenuePackage = 0;
  let productionPackage = 0;
  let aCost = 0;
  let b1Cost = 0;
  let b2Cost = 0;
  let cCost = 0;
  let nonEffectiveDeduction = 0;

  const isMatchCollector = (l: ValueCreationLog, u: User) => {
    return (
      l.recordedCollectorId === u.id ||
      l.recordedCollectorId === u.userId ||
      (u.name && l.recordedCollectorId === u.name) ||
      (!l.recordedCollectorId && (l.rankId === u.id || l.rankId === u.userId || (u.name && l.rankId === u.name)))
    );
  };

  const isLogTimeMatch = (l: ValueCreationLog) => {
    if (startDate || endDate) {
      return isLogInFilter(l, month, startDate, endDate);
    }
    return resolveLogBusinessMonth(l) === month;
  };

  const userLogs = logs.filter(
    (l) =>
      isMatchCollector(l, user) &&
      isLogTimeMatch(l) &&
      isStatusMatch(l.status, statusFilter)
  );

  userLogs.forEach((l) => {
    if (l.category === RefineCategory.Revenue || (l.category as string) === '收款') {
      revenuePackage += calculateHistoricalNetValue(l, resources, users);
    } else if (l.category === RefineCategory.Value || (l.category as string) === '产值') {
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

  const dCost = calculateUserDCost(user, logs, users, month, statusFilter, startDate, endDate);

  if (user.category !== 'VP') {
    const nonEffLogs = logs.filter(
      (l) =>
        isMatchCollector(l, user) &&
        isLogTimeMatch(l) &&
        isStatusMatch(l.status, statusFilter) &&
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
  costPackage: number; // 成本包
  totalCost?: number; // 兼容字段
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

export function calculateBonusAllocationForMonths(
  months: string[],
  user: User,
  allLogs: ValueCreationLog[], // JZCZ + DTCB merged
  resources: MiningResource[],
  users: User[],
  status: AuditStatus
): BonusAllocationResult {
  const category = user.category || '';
  const ratio = getExpertRatio(category);

  if (!isExpertCategory(category) || !months || months.length === 0) {
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

  const startMonth = months[0];
  const [startYear, startMonthStr] = startMonth.split('-');
  const startMonthNum = parseInt(startMonthStr, 10);

  let currentRollingDebt = 0;
  const historyRecords: HistoryRecord[] = [];

  // 从 1 月滚动到查询区间起始月的前一个月（当年内按月滚动，每年 1 月清零）
  for (let m = 1; m < startMonthNum; m++) {
    const ym = `${startYear}-${String(m).padStart(2, '0')}`;
    const mRes = aggregateUserMonthMetrics(allLogs, user, ym, resources, users, [status]);
    let mIncome = 0;
    let mCost = isSalaryActiveForMonth(user, ym) ? getUserSalaryByMonth(user, ym) : 0;

    if (isProdExpert) {
      mIncome = mRes.productionPackage;
      mCost += mRes.b1Cost;
      mCost += mRes.dCost;
      mCost -= mRes.nonEffectiveDeduction;
    } else if (isRevenueExpert) {
      mIncome = mRes.revenuePackage;
      mCost += mRes.aCost;
      mCost += mRes.dCost;
      mCost -= mRes.nonEffectiveDeduction;
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
      costPackage: mCost,
      totalCost: mCost,
      current: mIncome - mCost, // 业绩 (收入-成本)
      startDebt: startDebt,
      endDebt: currentRollingDebt,
      quota: mQuota,
    });
  }

  const history = currentRollingDebt;

  // 动态累加多月份的收入与成本包：Cost Package = sum(Salary_i + ACost_i/B1Cost_i + DCost_i - NonEffective_i)
  let totalIncome = 0;
  let costPackage = 0;

  for (const mStr of months) {
    const mRes = aggregateUserMonthMetrics(allLogs, user, mStr, resources, users, [status]);
    const mSalary = isSalaryActiveForMonth(user, mStr) ? getUserSalaryByMonth(user, mStr) : 0;
    let mIncome = 0;
    let mMonthCost = mSalary;

    if (isProdExpert) {
      mIncome = mRes.productionPackage;
      mMonthCost += mRes.b1Cost + mRes.dCost - mRes.nonEffectiveDeduction;
    } else if (isRevenueExpert) {
      mIncome = mRes.revenuePackage;
      mMonthCost += mRes.aCost + mRes.dCost - mRes.nonEffectiveDeduction;
    }

    totalIncome += mIncome;
    costPackage += mMonthCost;
  }

  const currentPerformance = totalIncome - costPackage;
  
  let newDebt = history;
  let quota = 0;

  // 区间业绩抵扣起始点前的历史欠产
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

export function calculateBonusAllocation(
  targetMonth: string,
  user: User,
  allLogs: ValueCreationLog[], // JZCZ + DTCB merged
  resources: MiningResource[],
  users: User[],
  status: AuditStatus
): BonusAllocationResult {
  return calculateBonusAllocationForMonths(
    [targetMonth],
    user,
    allLogs,
    resources,
    users,
    status
  );
}
