import { ValueCreationLog, MiningResource, AuditStatus, RefineCategory, User, InternalTransaction, TransactionStatus, Role } from '../../types';
import { resolveLogPackageNet } from './reconcileMiningFromLogs';
import { getUserSalaryByMonth } from './business';
import { resolveLogBusinessMonth, isDateInRange, resolveLogBusinessDate } from './dateUtils';

export interface UnitRankingRow {
  unitName: string;
  managers: string; // 负责人姓名
  rowType: 'total' | 'in_transit'; // 第一行: '含背书合计', 第二行: '收款背书在途'
  
  revenue: number | null; // 收款
  outputValue: number | null; // 产值
  revenuePackage: number | null; // 收款包
  valuePackage: number | null; // 产兑包
  incomeValuePackage: number | null; // 收产包
  
  totalCost: number | null; // 总成本 (工资 + 承兑奖金 + 甲类 + 乙二类)
  
  monthlyProfit: number | null; // 月度盈亏
  yearlyProfit: number | null; // 年度盈亏
  
  rank: number | string | null; // 排名
  isNoActivity?: boolean;
}

export interface SingleMonthUnitMetrics {
  unitName: string;
  managers: string;
  revenuePackage: number;
  confirmedValuePackage: number;
  pendingLinkageValuePackage: number;
  salaryPackage: number;
  bonusPayout: number;
  aCost: number;
  b1Cost: number;
  b2Cost: number;
  cCost: number;
  totalCost: number;
  directCost: number;
  row1ValuePackage: number;
  row1IncomeValuePackage: number;
  row1MonthlyProfit: number;
  row2ValuePackage: number;
  row2IncomeValuePackage: number;
  row2MonthlyProfit: number;
  isNoActivity: boolean;
}

/**
 * 查找经营单元负责人规则 (写死注释)：
 * 优先选取该单元在职的经营单元管理员 / 经管员高款专 / 经管员高产专；
 * 多人时以顿号拼接姓名，无则显示 '暂无'。
 */
export function getUnitManagers(unitName: string, users: User[]): string {
  const unitUsers = users.filter(u => u.center === unitName && u.userStatus !== 'inactive');
  const managers = unitUsers.filter(u => {
    const cat = u.category || '';
    return (
      cat.includes('经管员') ||
      cat.includes('管理员') ||
      u.role === Role.Admin ||
      u.role === Role.Rank
    );
  });

  if (managers.length > 0) {
    return Array.from(new Set(managers.map(m => m.name))).join('、');
  }
  return '暂无';
}

/**
 * 计算单个经营单元在指定月份的各项基准指标
 */
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
  const managers = getUnitManagers(unitName, users);

  // 1. 采集人属于该经营单元的用户 ID 集合
  const unitUserIds = new Set(
    users.filter(u => u.center === unitName).map(u => u.id)
  );

  // 2. 筛选当月日志
  const monthLogs = auditLogs.filter(l => {
    if (startDate && endDate && monthStr === selectedMonth) {
      return isDateInRange(resolveLogBusinessDate(l), startDate, endDate);
    }
    return resolveLogBusinessMonth(l) === monthStr;
  });

  // 2.1 收款包：不拆待确权/已确权；类别为收款；状态为已确权或入库；按采集人所属经营单元汇总。
  const revenueLogs = monthLogs.filter(l => 
    l.category === RefineCategory.Revenue &&
    (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved) &&
    ((l.recordedCollectorId && unitUserIds.has(l.recordedCollectorId)) || (l as any).center === unitName || (l as any).unit === unitName)
  );
  const revenuePackage = revenueLogs.reduce((sum, l) => sum + resolveLogPackageNet(l, resources, users), 0);

  // 2.2 已确权产兑包：类别为产值；状态为已确权。
  const confirmedValueLogs = monthLogs.filter(l => 
    l.category === RefineCategory.Value &&
    l.status === AuditStatus.Confirmed &&
    ((l.recordedCollectorId && unitUserIds.has(l.recordedCollectorId)) || (l as any).center === unitName || (l as any).unit === unitName)
  );
  const confirmedValuePackage = confirmedValueLogs.reduce((sum, l) => sum + resolveLogPackageNet(l, resources, users), 0);

  // 2.3 待确权产兑包：类别为产值；状态为待确权，且确权方式为联动确权（收款背书在途）。人工待审产值不得计入！
  const pendingLinkageValueLogs = monthLogs.filter(l => 
    l.category === RefineCategory.Value &&
    l.status === AuditStatus.Pending &&
    (l.confirmationType === '联动确权' || (l as any).isLinkage === true) &&
    ((l.recordedCollectorId && unitUserIds.has(l.recordedCollectorId)) || (l as any).center === unitName || (l as any).unit === unitName)
  );
  const pendingLinkageValuePackage = pendingLinkageValueLogs.reduce((sum, l) => sum + resolveLogPackageNet(l, resources, users), 0);

  // 2.4 工资：本单元在职人员工资包按月汇总，排除水库管理员。
  const unitActiveUsers = users.filter(u => 
    u.center === unitName && 
    u.userStatus !== 'inactive' && 
    u.category !== '水库管理员' && 
    u.role !== Role.ReservoirManager
  );
  const salaryPackage = unitActiveUsers.reduce((sum, u) => sum + getUserSalaryByMonth(u, monthStr), 0);

  // 2.5 承兑奖金：当月承兑台账实发，按发放对象所属经营单元归集；禁止用理论奖金；无所属单元则不计入任一单元。
  const verifiedTxs = transactions.filter(t => {
    if (t.status !== TransactionStatus.Verified) return false;
    
    if (startDate && endDate && monthStr === selectedMonth) {
      const bDate = t.businessDate || (t.timestamp ? new Date(t.timestamp).toLocaleDateString() : '');
      const cleanDate = bDate.replace(/\//g, '-');
      return isDateInRange(cleanDate, startDate, endDate);
    }

    // 时间匹配：通过 tx.month 或 timestamp 转成的 YYYY-MM
    let txMonth = t.month;
    if (!txMonth && t.timestamp) {
      const d = new Date(t.timestamp);
      txMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    if (txMonth !== monthStr) return false;

    // 承兑/实发奖金判断
    const desc = t.description || '';
    const isPayoutTx = desc.includes('登记承兑发放') || desc.includes('承兑') || desc.includes('实发奖金') || t.id.startsWith('TX-PAYOUT');
    return isPayoutTx;
  });

  const bonusPayout = verifiedTxs.reduce((sum, t) => {
    const receiver = users.find(u => u.id === t.receiverId || u.userId === t.receiverId);
    if (receiver && receiver.center === unitName) {
      return sum + (t.amount || 0);
    }
    if (t.receiverId === unitName) {
      return sum + (t.amount || 0);
    }
    return sum;
  }, 0);

  // 2.6 动态消耗：已确权/入库，按采集人所属经营单元归集
  const confirmedConsumptionLogs = monthLogs.filter(l => 
    (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved) &&
    ((l.recordedCollectorId && unitUserIds.has(l.recordedCollectorId)) || (l as any).center === unitName || (l as any).unit === unitName)
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

  // 2.7 总成本与直接费用
  // 总成本＝工资＋承兑奖金＋甲类＋乙二类
  const totalCost = salaryPackage + bonusPayout + aCost + b2Cost;

  // 直接费用＝丙类＋乙一类
  const directCost = cCost + b1Cost;

  // 第一行「已确权」：只含已确权
  const row1ValuePackage = confirmedValuePackage;

  // 第一行收产包 = 收款包 + 第一行产兑包
  const row1IncomeValuePackage = revenuePackage + row1ValuePackage;

  // 第一行月度盈亏 = 第一行收产包 - 总成本 - 直接费用
  const row1MonthlyProfit = row1IncomeValuePackage - totalCost - directCost;

  // 第二行「已确权+待确权」：产兑包 = 已确权 + 联动待确权
  const row2ValuePackage = confirmedValuePackage + pendingLinkageValuePackage;

  // 第二行收产包 = 收款包 + 第二行产兑包
  const row2IncomeValuePackage = revenuePackage + row2ValuePackage;

  // 第二行月度盈亏 = 第二行收产包 - 总成本 - 直接费用
  const row2MonthlyProfit = row2IncomeValuePackage - totalCost - directCost;

  // 判断是否无活动（无工资且无包/无成本）
  const isNoActivity = (
    salaryPackage === 0 &&
    revenuePackage === 0 &&
    confirmedValuePackage === 0 &&
    pendingLinkageValuePackage === 0 &&
    bonusPayout === 0 &&
    aCost === 0 && b1Cost === 0 && b2Cost === 0 && cCost === 0
  );

  return {
    unitName,
    managers,
    revenuePackage,
    confirmedValuePackage,
    pendingLinkageValuePackage,
    salaryPackage,
    bonusPayout,
    aCost,
    b1Cost,
    b2Cost,
    cCost,
    totalCost,
    directCost,
    row1ValuePackage,
    row1IncomeValuePackage,
    row1MonthlyProfit,
    row2ValuePackage,
    row2IncomeValuePackage,
    row2MonthlyProfit,
    isNoActivity
  };
}

/**
 * 主计算函数：计算所有经营单元的双行数据与盈利排名
 */
export function computeBusinessUnitProfitRanking(
  businessUnits: string[],
  selectedMonth: string, // YYYY-MM
  users: User[],
  auditLogs: ValueCreationLog[],
  resources: MiningResource[],
  transactions: InternalTransaction[],
  startDate?: string,
  endDate?: string
): UnitRankingRow[] {
  if (!businessUnits || businessUnits.length === 0) return [];

  // 解析年份与选择月份的 1~m 月列表
  const [yearStr, monthNumStr] = selectedMonth.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const currentMonthNum = parseInt(monthNumStr, 10) || (new Date().getMonth() + 1);

  const monthsInYearToSelected: string[] = [];
  for (let m = 1; m <= currentMonthNum; m++) {
    monthsInYearToSelected.push(`${year}-${String(m).padStart(2, '0')}`);
  }

  // 1. 计算每个单元在选定月份的单月指标
  const currentMonthMetrics = businessUnits.map(unitName => 
    computeUnitSingleMonth(unitName, selectedMonth, users, auditLogs, resources, transactions, selectedMonth, startDate, endDate)
  );

  // 2. 计算每个单元从当年 1 月至选定月的年度累计盈亏 (区分口径)
  const yearlyConfirmedProfitMap: Record<string, number> = {};
  const yearlyTotalProfitMap: Record<string, number> = {};
  businessUnits.forEach(unitName => {
    let row1YearSum = 0;
    let row2YearSum = 0;
    monthsInYearToSelected.forEach(mStr => {
      const mMetrics = computeUnitSingleMonth(unitName, mStr, users, auditLogs, resources, transactions, selectedMonth, startDate, endDate);
      row1YearSum += mMetrics.row1MonthlyProfit;
      row2YearSum += mMetrics.row2MonthlyProfit;
    });
    yearlyConfirmedProfitMap[unitName] = row1YearSum;
    yearlyTotalProfitMap[unitName] = row2YearSum;
  });

  // 3. 排序与排名逻辑 (基于第二行月度盈亏排序)
  const sortedMetrics = [...currentMonthMetrics].sort((a, b) => {
    if (a.isNoActivity !== b.isNoActivity) {
      return a.isNoActivity ? 1 : -1; // 无活动的排在后面
    }
    if (Math.abs(a.row2MonthlyProfit - b.row2MonthlyProfit) > 0.0001) {
      return b.row2MonthlyProfit - a.row2MonthlyProfit;
    }
    const aYearly = yearlyTotalProfitMap[a.unitName] || 0;
    const bYearly = yearlyTotalProfitMap[b.unitName] || 0;
    if (Math.abs(aYearly - bYearly) > 0.0001) {
      return bYearly - aYearly;
    }
    if (Math.abs(a.row2IncomeValuePackage - b.row2IncomeValuePackage) > 0.0001) {
      return b.row2IncomeValuePackage - a.row2IncomeValuePackage;
    }
    return a.unitName.localeCompare(b.unitName, 'zh-CN');
  });

  // 4. 构建双行展示数据，并赋排名
  const rows: UnitRankingRow[] = [];
  let currentRank = 1;

  sortedMetrics.forEach((m) => {
    const yearlyConfirmedProfit = yearlyConfirmedProfitMap[m.unitName] || 0;
    const yearlyTotalProfit = yearlyTotalProfitMap[m.unitName] || 0;
    const assignedRank = m.isNoActivity ? '—' : currentRank++;

    // 第一行：「已确权」
    rows.push({
      unitName: m.unitName,
      managers: m.managers,
      rowType: 'total',
      revenue: Math.round(m.revenuePackage),
      outputValue: Math.round(m.confirmedValuePackage),
      revenuePackage: Math.round(m.revenuePackage),
      valuePackage: Math.round(m.row1ValuePackage),
      incomeValuePackage: Math.round(m.row1IncomeValuePackage),
      totalCost: Math.round(m.totalCost),
      monthlyProfit: Math.round(m.row1MonthlyProfit),
      yearlyProfit: Math.round(yearlyConfirmedProfit),
      rank: assignedRank,
      isNoActivity: m.isNoActivity
    });

    // 第二行：「已确权+待确权」
    rows.push({
      unitName: m.unitName,
      managers: m.managers,
      rowType: 'in_transit',
      revenue: Math.round(m.revenuePackage), // 收款包两行同值
      outputValue: Math.round(m.confirmedValuePackage + m.pendingLinkageValuePackage), // 已确权+联动待确权
      revenuePackage: Math.round(m.revenuePackage), // 收款包两行同值
      valuePackage: Math.round(m.row2ValuePackage), // 已确权+联动待确权
      incomeValuePackage: Math.round(m.row2IncomeValuePackage), // 收产
      totalCost: Math.round(m.totalCost), // 成本也填
      monthlyProfit: Math.round(m.row2MonthlyProfit), // 月度盈亏
      yearlyProfit: Math.round(yearlyTotalProfit), // 年度盈亏
      rank: assignedRank, // 排名按第二行排序后的对应数值
      isNoActivity: m.isNoActivity
    });
  });

  return rows;
}
