import { ValueCreationLog, MiningResource, AuditStatus, RefineCategory, RefineType, User, InternalTransaction, TransactionStatus, Role } from '../../types';
import { resolveLogPackageNet } from './reconcileMiningFromLogs';
import { getUserSalaryByMonth } from './business';
import { resolveLogBusinessMonth, isDateInRange, resolveLogBusinessDate } from './dateUtils';
import { roundMoney } from './formatMoney';
import { centerMatch } from './centerScope';
import { businessUnitLabelsEqual } from './businessUnitName';
import { isSalaryActiveForMonth } from './employmentStatus';

export interface UnitRankingRow {
  unitName: string;
  managers: string;
  
  revenuePackage: number;
  confirmedValuePackage: number;
  pendingLinkageValuePackage: number;
  incomeValuePackage: number; // 收款包 + 已确权产兑包
  
  totalCost: number; // 可控成本
  costPackage: number; // 成本包 (工资包 + 承兑实发)
  totalCostOffset?: number; // 兼容字段
  
  monthlyProfit: number; // 月度盈亏(已确权) = 收产包 - 可控成本 - 直接费用
  yearlyProfit: number; // 年度盈亏(已确权)
  
  // 辅列/在途指标
  inTransitValuePackage: number; // 在途产兑
  inTransitIncomePackage: number; // 含在途收产包
  inTransitMonthlyProfit: number; // 含在途月度盈亏
  inTransitYearlyProfit: number; // 含在途年度盈亏

  rank: number | string;
  isNoActivity: boolean;
}

export interface SingleMonthUnitMetrics {
  unitName: string;
  managers: string;
  revenuePackage: number;
  confirmedValuePackage: number;
  pendingLinkageValuePackage: number;
  costPackage: number; // 成本包 (工资包 + 承兑实发)
  totalCostOffset?: number; // 兼容字段
  aCost: number;
  b1Cost: number;
  b2Cost: number;
  cCost: number;
  dCost: number;
  totalCost: number;
  directCost: number;
  incomeValuePackage: number;
  monthlyProfit: number;
  inTransitValuePackage: number;
  inTransitIncomePackage: number;
  inTransitMonthlyProfit: number;
  
  // Aliases for UnitMonthlyPnLCard compatibility
  row1ValuePackage: number;
  row1IncomeValuePackage: number;
  row1MonthlyProfit: number;
  row2ValuePackage: number;
  row2IncomeValuePackage: number;
  row2MonthlyProfit: number;

  isNoActivity: boolean;
}

export function getUnitManagers(unitName: string, users: User[]): string {
  const unitUsers = users.filter(u => centerMatch(u.center, unitName) && u.userStatus !== 'inactive');
  const managers = unitUsers.filter(u => {
    const cat = (u.category || '').trim();
    // 必须包含「经管员」，但排除含「NPC」的类别（如「经管员NPC」）
    const isManager = cat.includes('经管员');
    const isNpc = cat.toUpperCase().includes('NPC');
    return isManager && !isNpc;
  });

  if (managers.length > 0) {
    return Array.from(new Set(managers.map(m => m.name).filter(Boolean))).join('、');
  }
  return '暂无';
}

export function getUnitManagerCategory(unitName: string, users: User[]): string {
  const unitUsers = users.filter(u => centerMatch(u.center, unitName) && u.userStatus !== 'inactive');
  const managers = unitUsers.filter(u => {
    const cat = (u.category || '').trim();
    return cat.includes('经管员') && !cat.toUpperCase().includes('NPC');
  });

  if (managers.length > 0) {
    return managers[0].category || '其他';
  }
  return '其他';
}

export function computeUnitSingleMonth(
  unitName: string,
  monthStr: string, // YYYY-MM
  users: User[],
  auditLogs: ValueCreationLog[],
  resources: MiningResource[],
  transactions: InternalTransaction[],
  selectedMonth?: string,
  startDate?: string,
  endDate?: string
): SingleMonthUnitMetrics {
  // 查找采集人：id 或 userId 都要能命中；同时兼顾 name 容错
  const findCollector = (collectorId?: string) => {
    if (!collectorId) return undefined;
    const cleanId = String(collectorId).trim();
    return users.find(u => 
      u && (
        String(u.id).trim() === cleanId || 
        (u.userId && String(u.userId).trim() === cleanId) ||
        (u.name && String(u.name).trim() === cleanId)
      )
    );
  };

  // 唯一归属：只按流水的 recordedCollectorId → 对应用户的 center 匹配经营单元；严禁使用矿山指派、rankId 或日志松散 center 灌包
  const isLogBelongsToUnit = (l: ValueCreationLog) => {
    const collectorId = l.recordedCollectorId;
    if (!collectorId) return false;
    const collector = findCollector(collectorId);
    if (!collector) return false;
    return centerMatch(collector.center, unitName);
  };

  // 入月逻辑：resolveLogBusinessMonth 优先 businessDate -> month -> timestamp
  const monthLogs = auditLogs.filter(l => {
    if (startDate && endDate && monthStr === selectedMonth) {
      return isDateInRange(resolveLogBusinessDate(l), startDate, endDate);
    }
    return resolveLogBusinessMonth(l) === monthStr;
  });

  // 排除：非有效工时、有 costCategory 的消耗；不要用 confirmationType==='手动确权' 一刀切剔除创造流水
  const isLogToExclude = (l: ValueCreationLog) => {
    return (
      l.type === RefineType.NonEffectiveHours ||
      (l.type as string) === '非有效工时' ||
      (l.type as string) === 'NonEffectiveHours' ||
      Boolean(l.costCategory)
    );
  };

  // category 兼容：「收款」/ Revenue、「产值」/ Value
  const isRevenueCategory = (cat: any) =>
    cat === RefineCategory.Revenue ||
    cat === '收款' ||
    cat === 'Revenue' ||
    cat === 'revenue';

  const isValueCategory = (cat: any) =>
    cat === RefineCategory.Value ||
    cat === '产值' ||
    cat === 'Value' ||
    cat === 'value';

  // 状态兼容：已确权/入库/Confirmed/Approved
  const isConfirmedOrApproved = (status: any) =>
    status === AuditStatus.Confirmed ||
    status === AuditStatus.Approved ||
    status === '已确权' ||
    status === '入库' ||
    status === 'Confirmed' ||
    status === 'Approved' ||
    status === 'confirmed' ||
    status === 'approved';

  const isPendingStatus = (status: any) =>
    status === AuditStatus.Pending ||
    status === '待确权' ||
    status === 'Pending' ||
    status === 'pending';

  const isLinkageType = (confType: any, logObj: any) =>
    confType === '联动确权' ||
    confType === '联动' ||
    confType === 'Linkage' ||
    logObj?.isLinkage === true;

  // 收款包：category = '收款' 且状态为已确权或入库；不计待确权收款
  const revenueLogs = monthLogs.filter(l => 
    isRevenueCategory(l.category) &&
    !isLogToExclude(l) &&
    isConfirmedOrApproved(l.status) &&
    isLogBelongsToUnit(l)
  );
  let revenuePackage = revenueLogs.reduce((sum, l) => sum + resolveLogPackageNet(l, resources, users), 0);

  // 已确权产兑包：类别为产值；状态为已确权或入库（与收款对称）
  const confirmedValueLogs = monthLogs.filter(l => 
    isValueCategory(l.category) &&
    !isLogToExclude(l) &&
    isConfirmedOrApproved(l.status) &&
    isLogBelongsToUnit(l)
  );
  let confirmedValuePackage = confirmedValueLogs.reduce((sum, l) => sum + resolveLogPackageNet(l, resources, users), 0);

  // 待确权产兑包（在途）：类别为产值；状态为待确权，且确权方式为联动确权
  const pendingLinkageValueLogs = monthLogs.filter(l => 
    isValueCategory(l.category) &&
    !isLogToExclude(l) &&
    isPendingStatus(l.status) &&
    isLinkageType(l.confirmationType, l) &&
    isLogBelongsToUnit(l)
  );
  let pendingLinkageValuePackage = pendingLinkageValueLogs.reduce((sum, l) => sum + resolveLogPackageNet(l, resources, users), 0);

  // 若按上述采集人仍为 0，加一层水库单元明细同款归集后再汇总（同一文件内，避免因微小匹配差异整列全0）
  if (revenuePackage === 0) {
    const fallbackRevLogs = monthLogs.filter(l => {
      if (isLogToExclude(l)) return false;
      if (!isRevenueCategory(l.category)) return false;
      if (!isConfirmedOrApproved(l.status)) return false;
      const collector = users.find(u => u && (u.id === l.recordedCollectorId || u.userId === l.recordedCollectorId));
      return collector ? centerMatch(collector.center, unitName) : false;
    });
    if (fallbackRevLogs.length > 0) {
      revenuePackage = fallbackRevLogs.reduce((sum, l) => sum + resolveLogPackageNet(l, resources, users), 0);
    }
  }

  if (confirmedValuePackage === 0) {
    const fallbackValLogs = monthLogs.filter(l => {
      if (isLogToExclude(l)) return false;
      if (!isValueCategory(l.category)) return false;
      if (!isConfirmedOrApproved(l.status)) return false;
      const collector = users.find(u => u && (u.id === l.recordedCollectorId || u.userId === l.recordedCollectorId));
      return collector ? centerMatch(collector.center, unitName) : false;
    });
    if (fallbackValLogs.length > 0) {
      confirmedValuePackage = fallbackValLogs.reduce((sum, l) => sum + resolveLogPackageNet(l, resources, users), 0);
    }
  }

  if (pendingLinkageValuePackage === 0) {
    const fallbackPendingLogs = monthLogs.filter(l => {
      if (isLogToExclude(l)) return false;
      if (!isValueCategory(l.category)) return false;
      if (!isPendingStatus(l.status) || !isLinkageType(l.confirmationType, l)) return false;
      const collector = users.find(u => u && (u.id === l.recordedCollectorId || u.userId === l.recordedCollectorId));
      return collector ? centerMatch(collector.center, unitName) : false;
    });
    if (fallbackPendingLogs.length > 0) {
      pendingLinkageValuePackage = fallbackPendingLogs.reduce((sum, l) => sum + resolveLogPackageNet(l, resources, users), 0);
    }
  }

  // 工资包
  const unitActiveUsers = users.filter(u => 
    centerMatch(u.center, unitName) && 
    isSalaryActiveForMonth(u, monthStr) && 
    u.category !== 'VP' && 
    u.role !== Role.ReservoirManager
  );
  const salaryPackage = unitActiveUsers.reduce((sum, u) => sum + getUserSalaryByMonth(u, monthStr), 0);

  // 承兑实发奖金
  const verifiedTxs = transactions.filter(t => {
    if (t.status !== TransactionStatus.Verified) return false;
    if (startDate && endDate && monthStr === selectedMonth) {
      const bDate = t.businessDate || (t.timestamp ? new Date(t.timestamp).toLocaleDateString() : '');
      const cleanDate = bDate.replace(/\//g, '-');
      return isDateInRange(cleanDate, startDate, endDate);
    }
    let txMonth = t.month;
    if (!txMonth && t.timestamp) {
      const d = new Date(t.timestamp);
      txMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    if (txMonth !== monthStr) return false;
    const desc = t.description || '';
    return desc.includes('登记承兑发放') || desc.includes('承兑') || desc.includes('实发奖金') || t.id.startsWith('TX-PAYOUT');
  });

  const bonusPayout = verifiedTxs.reduce((sum, t) => {
    const receiver = users.find(u => u.id === t.receiverId || u.userId === t.receiverId);
    if (receiver && centerMatch(receiver.center, unitName)) {
      return sum + (t.amount || 0);
    }
    if (businessUnitLabelsEqual(t.receiverId, unitName)) {
      return sum + (t.amount || 0);
    }
    return sum;
  }, 0);

  // 动态消耗
  const confirmedConsumptionLogs = monthLogs.filter(l => 
    isConfirmedOrApproved(l.status) &&
    isLogBelongsToUnit(l)
  );

  const aCost = confirmedConsumptionLogs
    .filter(l => l.costCategory === 'A')
    .reduce((sum, l) => sum + (l.dynamicCost || 0), 0);

  const b1Cost = confirmedConsumptionLogs
    .filter(l => l.costCategory === 'B' && l.valueConsumptionMode === 'B1')
    .reduce((sum, l) => sum + (l.dynamicCost || 0), 0);

  const b2Cost = confirmedConsumptionLogs
    .filter(l => l.costCategory === 'B' && l.valueConsumptionMode === 'B2')
    .reduce((sum, l) => sum + (l.dynamicCost || 0), 0);

  const cCost = confirmedConsumptionLogs
    .filter(l => l.costCategory === 'C')
    .reduce((sum, l) => sum + (l.dynamicCost || 0), 0);

  const dCost = confirmedConsumptionLogs
    .filter(l => l.costCategory === 'D')
    .reduce((sum, l) => sum + (l.dynamicCost || 0), 0);

  // 成本包 = 工资包 + 承兑实发
  const costPackage = salaryPackage + bonusPayout;
  const totalCostOffset = costPackage;
  // 可控成本 = 成本包 + 甲类 + 乙二类
  const totalCost = costPackage + aCost + b2Cost;
  const directCost = cCost + b1Cost + dCost;

  // 已确权收产包 = 收款包 + 已确权产兑包
  const incomeValuePackage = revenuePackage + confirmedValuePackage;
  // 月度盈亏(已确权) = 已确权收产包 - 可控成本 - 直接费用
  const monthlyProfit = incomeValuePackage - totalCost - directCost;

  // 在途指标
  const inTransitValuePackage = confirmedValuePackage + pendingLinkageValuePackage;
  const inTransitIncomePackage = revenuePackage + inTransitValuePackage;
  const inTransitMonthlyProfit = inTransitIncomePackage - totalCost - directCost;

  const isNoActivity = (
    costPackage === 0 &&
    revenuePackage === 0 &&
    confirmedValuePackage === 0 &&
    pendingLinkageValuePackage === 0 &&
    aCost === 0 && b1Cost === 0 && b2Cost === 0 && cCost === 0
  );

  return {
    unitName,
    managers: getUnitManagers(unitName, users),
    revenuePackage,
    confirmedValuePackage,
    pendingLinkageValuePackage,
    costPackage,
    totalCostOffset,
    aCost,
    b1Cost,
    b2Cost,
    cCost,
    dCost,
    totalCost,
    directCost,
    incomeValuePackage,
    monthlyProfit,
    inTransitValuePackage,
    inTransitIncomePackage,
    inTransitMonthlyProfit,
    row1ValuePackage: confirmedValuePackage,
    row1IncomeValuePackage: incomeValuePackage,
    row1MonthlyProfit: monthlyProfit,
    row2ValuePackage: inTransitValuePackage,
    row2IncomeValuePackage: inTransitIncomePackage,
    row2MonthlyProfit: inTransitMonthlyProfit,
    isNoActivity
  };
}

export function computeBusinessUnitProfitRanking(
  units: string[],
  selectedMonth: string, // YYYY-MM
  users: User[],
  auditLogs: ValueCreationLog[],
  resources: MiningResource[],
  transactions: InternalTransaction[],
  startDate?: string,
  endDate?: string
): UnitRankingRow[] {
  // units 必须来自完整经营单元列表（jydy / businessUnits 的 center 名），如为空则从 users 中聚合所有中心
  let effectiveUnits = (units || []).filter(Boolean);
  if (effectiveUnits.length === 0) {
    const set = new Set<string>();
    users.forEach(u => {
      if (u.center && u.center !== '统筹水库' && u.center !== '公司' && u.center !== '总部') {
        set.add(u.center);
      }
    });
    effectiveUnits = Array.from(set);
  }
  if (effectiveUnits.length === 0) return [];

  const [yearStr, monthNumStr] = selectedMonth.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const currentMonthNum = parseInt(monthNumStr, 10) || (new Date().getMonth() + 1);

  const monthsInYearToSelected: string[] = [];
  for (let m = 1; m <= currentMonthNum; m++) {
    monthsInYearToSelected.push(`${year}-${String(m).padStart(2, '0')}`);
  }

  const currentMonthMetrics = effectiveUnits.map(unitName => 
    computeUnitSingleMonth(unitName, selectedMonth, users, auditLogs, resources, transactions, selectedMonth, startDate, endDate)
  );

  const yearlyConfirmedProfitMap: Record<string, number> = {};
  const yearlyInTransitProfitMap: Record<string, number> = {};
  effectiveUnits.forEach(unitName => {
    let confSum = 0;
    let transitSum = 0;
    monthsInYearToSelected.forEach(mStr => {
      const mMetrics = computeUnitSingleMonth(unitName, mStr, users, auditLogs, resources, transactions, selectedMonth, startDate, endDate);
      confSum += mMetrics.monthlyProfit;
      transitSum += mMetrics.inTransitMonthlyProfit;
    });
    yearlyConfirmedProfitMap[unitName] = confSum;
    yearlyInTransitProfitMap[unitName] = transitSum;
  });

  // 主排序键：主排序只能使用「月度盈亏(已确权)」降序；绝对禁止用含在途的盈亏作为主排名依据。
  const sortedMetrics = [...currentMonthMetrics].sort((a, b) => {
    if (a.isNoActivity !== b.isNoActivity) {
      return a.isNoActivity ? 1 : -1;
    }
    if (Math.abs(a.monthlyProfit - b.monthlyProfit) > 0.0001) {
      return b.monthlyProfit - a.monthlyProfit;
    }
    const aYearly = yearlyConfirmedProfitMap[a.unitName] || 0;
    const bYearly = yearlyConfirmedProfitMap[b.unitName] || 0;
    if (Math.abs(aYearly - bYearly) > 0.0001) {
      return bYearly - aYearly;
    }
    if (Math.abs(a.incomeValuePackage - b.incomeValuePackage) > 0.0001) {
      return b.incomeValuePackage - a.incomeValuePackage;
    }
    return a.unitName.localeCompare(b.unitName, 'zh-CN');
  });

  const rows: UnitRankingRow[] = [];
  let currentRank = 1;

  sortedMetrics.forEach((m) => {
    const yearlyProfit = yearlyConfirmedProfitMap[m.unitName] || 0;
    const yearlyInTransitProfit = yearlyInTransitProfitMap[m.unitName] || 0;
    const assignedRank = m.isNoActivity ? '—' : currentRank++;

    rows.push({
      unitName: m.unitName,
      managers: m.managers,
      revenuePackage: roundMoney(m.revenuePackage),
      confirmedValuePackage: roundMoney(m.confirmedValuePackage),
      pendingLinkageValuePackage: roundMoney(m.pendingLinkageValuePackage),
      incomeValuePackage: roundMoney(m.incomeValuePackage),
      totalCost: roundMoney(m.totalCost),
      costPackage: roundMoney(m.costPackage ?? m.totalCostOffset ?? 0),
      totalCostOffset: roundMoney(m.costPackage ?? m.totalCostOffset ?? 0),
      monthlyProfit: roundMoney(m.monthlyProfit),
      yearlyProfit: roundMoney(yearlyProfit),
      inTransitValuePackage: roundMoney(m.inTransitValuePackage),
      inTransitIncomePackage: roundMoney(m.inTransitIncomePackage),
      inTransitMonthlyProfit: roundMoney(m.inTransitMonthlyProfit),
      inTransitYearlyProfit: roundMoney(yearlyInTransitProfit),
      rank: assignedRank,
      isNoActivity: m.isNoActivity
    });
  });

  return rows;
}
