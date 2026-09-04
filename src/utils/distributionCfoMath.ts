import { User, ValueCreationLog, MiningResource, AuditStatus, RefineCategory } from '../types';
import { getUserSalaryByMonth } from './business';
import { resolveLogBusinessMonth, resolveLogBusinessDate, isDateInRange } from './dateUtils';
import { isSalaryActiveForMonth } from './employmentStatus';
import { centerMatch } from './centerScope';
import { calculateBonusAllocation } from './bonusAllocation';
import { resolveDynamicCostCategory, getDynamicCostAmount } from './costCategory';

export interface ComputeCfoKuanMetricsParams {
  currentUser: User;
  effectiveMonth: string;
  collectionPackage: number; // 本人、当前时间窗、已确权/入库收款净值（与顶部收款包同源，禁止动态消耗进包）
  productionPackage?: number; // 产兑包（产专分支使用）
  logs: ValueCreationLog[];
  resources: MiningResource[];
  users: User[];
  startDate?: string;
  endDate?: string;
}

export interface CfoKuanMetricsResult {
  monthlySalary: number;
  aCost: number;
  b1Cost: number;
  costPackage: number; // 成本包 (刚性工资 + 消耗，负值对冲)
  totalCost?: number; // 兼容字段
  unitRedundancy: number;
  rawSurplus: number; // 当月结余 = collectionPackage + unitRedundancy + costPackage（可负，禁止 floor 成 0）
  historyDebtSigned: number; // 历史欠产（负数或0，2026-01为0；仅绑历史滚动欠产）
  allocQuota: number; // 奖金额度（分配额度）= max(0, rawSurplus + historyDebtSigned)
  isKuan: boolean;
  isChan: boolean;
  isManagerKuan: boolean;
  formulaDescription: string;
}

/**
 * 前端 CFO 口径强覆写计算核心：
 * 1. 当月结余 rawSurplus = Collection + costPackage
 *    - 款专/经管员高款专：收入用 collectionPackage + unitRedundancy；成本包 costPackage = -(月刚性工资 + A类成本)
 *    - 产专：收入用 productionPackage；成本包 costPackage = -(月刚性工资 + B1类成本)
 * 2. unitRedundancy：仅 category === '经管员高款专' 时计入同中心初/中款专收款专项贡献（amount × 2%）；普通款专为 0；禁止塞入本级计提 out5+coll2
 * 3. 刚性月工资：严格走 getUserSalaryByMonth(currentUser, effectiveMonth)，未在职当月按 0，禁止直接用 user.salaryPackage
 * 4. 历史欠产：historyDebtSigned（当年 1~M-1 滚动，2026-01 为 0，负数展示）
 * 5. 奖金额度：allocQuota = max(0, rawSurplus + historyDebtSigned)
 */
export function computeCfoKuanMetrics(params: ComputeCfoKuanMetricsParams): CfoKuanMetricsResult {
  const {
    currentUser,
    effectiveMonth,
    collectionPackage,
    productionPackage = 0,
    logs,
    resources,
    users,
    startDate,
    endDate
  } = params;

  const userCat = currentUser.category || '';
  const isChan = userCat.includes('产专');
  const isManagerKuan = userCat === '经管员高款专';
  const isKuan = userCat.includes('款专') || isManagerKuan;

  // 1. 刚性工资：按月履历追溯，未在职为 0
  const isSalaryActive = isSalaryActiveForMonth(currentUser, effectiveMonth);
  const monthlySalary = isSalaryActive ? getUserSalaryByMonth(currentUser, effectiveMonth) : 0;

  // 2. 本人当月动态成本（已确权/入库，业务月 == effectiveMonth）
  let aCost = 0;
  let b1Cost = 0;
  const userMonthLogs = logs.filter(
    (l) =>
      l.recordedCollectorId === currentUser.id &&
      resolveLogBusinessMonth(l) === effectiveMonth &&
      (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved)
  );

  userMonthLogs.forEach((l) => {
    const cat = resolveDynamicCostCategory(l);
    const amt = getDynamicCostAmount(l);
    if (cat === 'A') {
      aCost += amt;
    } else if (cat === 'B1') {
      b1Cost += amt;
    }
  });

  // 3. 单元冗余（与价值分配页第二趟口径对齐）
  // 仅经管员高款专：同 center 下其他初/中款专收款专项贡献 (amount × 2%)；禁止塞入本级计提或产专额度
  let unitRedundancy = 0;
  if (isManagerKuan && currentUser.center) {
    const managerCenter = currentUser.center;
    const subKuanUsers = users.filter(
      (u) =>
        u.id !== currentUser.id &&
        (u.category === '初款专' || u.category === '中款专') &&
        centerMatch(u.center, managerCenter)
    );
    const subKuanIds = new Set(subKuanUsers.map((u) => u.id));

    if (subKuanIds.size > 0) {
      const subLogs = logs.filter(
        (l) =>
          l.recordedCollectorId &&
          subKuanIds.has(l.recordedCollectorId) &&
          l.category === RefineCategory.Revenue &&
          (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved) &&
          (startDate && endDate
            ? isDateInRange(resolveLogBusinessDate(l), startDate, endDate)
            : resolveLogBusinessMonth(l) === effectiveMonth)
      );
      unitRedundancy = subLogs.reduce((sum, l) => sum + (l.amount || 0) * 0.02, 0);
    }
  }

  // 4. 成本包与结余计算
  const costOther = isChan ? b1Cost : aCost;
  const costPackage = -(monthlySalary + costOther);
  const totalCost = Math.abs(costPackage);

  // 理论基数公式：TheoryBase = max(0, Collection + CostPackage)
  let rawSurplus = 0;
  if (isChan) {
    rawSurplus = productionPackage + costPackage;
  } else {
    rawSurplus = collectionPackage + unitRedundancy + costPackage;
  }

  // 5. 历史欠产（当年 1 ~ M-1 滚动，每年 1 月清零）
  const allocConfirmed = calculateBonusAllocation(
    effectiveMonth,
    currentUser,
    logs,
    resources,
    users,
    AuditStatus.Confirmed
  );

  // allocConfirmed.history > 0 表示存在欠产，转为负数展示；2026-01 时为 0
  const historyDebtSigned = allocConfirmed.history > 0 ? -allocConfirmed.history : 0;

  // 6. 奖金额度（分配额度）
  const allocQuota = Math.max(0, rawSurplus + historyDebtSigned);

  // 7. 公式说明文案（便于前端展示或调试验收）
  const formulaDescription = isChan
    ? '产兑包 + 成本包'
    : unitRedundancy > 0
    ? '收款包 + 单元冗余 + 成本包'
    : '收款包 + 成本包';

  return {
    monthlySalary,
    aCost,
    b1Cost,
    costPackage,
    totalCost,
    unitRedundancy,
    rawSurplus,
    historyDebtSigned,
    allocQuota,
    isKuan,
    isChan,
    isManagerKuan,
    formulaDescription
  };
}
