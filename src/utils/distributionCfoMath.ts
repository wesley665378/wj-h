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
  productionPackage?: number; // 产兑包（现金：已确权/入库产值净值）
  centerLevelBonus?: number; // 外部传入的经营单元本级（若有优先使用）
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
  centerLevelBonus: number; // 经营单元本级 = Σ(incentiveOutput5 + incentiveCollection2)
  unitRedundancy: number; // 兼容过渡字段（与 centerLevelBonus 同值，禁止下游双加）
  levelAdd: number; // 实际并入结余的本级加项（仅经管员高款专/高产专/经管员高产专计入）
  rawSurplus: number; // 当月结余 = 收产包 + levelAdd + costPackage（可负，禁止 floor 成 0）
  historyDebtSigned: number; // 历史欠产（负数或0，2026-01为0；仅绑历史滚动欠产）
  allocQuota: number; // 奖金额度（分配额度）= max(0, rawSurplus + historyDebtSigned)
  isKuan: boolean;
  isChan: boolean;
  isManagerKuan: boolean;
  isEligibleForCenterBonus: boolean;
  formulaDescription: string;
}

/**
 * 前端 CFO 口径计算核心（2026-09 经营单元本级统一规范）：
 * 1. 经营单元本级 centerLevelBonus = Σ(incentiveOutput5 + incentiveCollection2)，按矿 assignedTo 归属单元
 * 2. 结余收入加项 levelAdd:
 *    - 适用对象（经管员高款专、经管员高产专、高产专）：levelAdd = centerLevelBonus
 *    - 其他人（初/中款专、高款专、初/中产专等）：展示 centerLevelBonus，但结余加项 levelAdd = 0
 * 3. 废止独立「单元冗余」unitRedundancy 作为第二加项；输出 unitRedundancy 仅作同值兼容，禁止 double-add
 * 4. 成本包 costPackage:
 *    - 款专：costPackage = -(月刚性工资 + A类成本)
 *    - 产专：costPackage = -(月刚性工资 + B1类成本)
 * 5. rawSurplus（适用对象）= collectionPackage / productionPackage + levelAdd + costPackage（可负，禁止 floor 成 0）
 * 6. allocQuota = max(0, rawSurplus + historyDebtSigned)
 */
export function computeCfoKuanMetrics(params: ComputeCfoKuanMetricsParams): CfoKuanMetricsResult {
  const {
    currentUser,
    effectiveMonth,
    collectionPackage,
    productionPackage = 0,
    centerLevelBonus: customCenterLevelBonus,
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

  // 适用并入结余加项的对象：经管员高款专、经管员高产专、高产专
  const isEligibleForCenterBonus = 
    userCat === '经管员高款专' || 
    userCat === '经管员高产专' || 
    userCat === '高产专';

  // 1. 刚性工资：按月履历追溯，未在职为 0
  const isSalaryActive = isSalaryActiveForMonth(currentUser, effectiveMonth);
  const monthlySalary = isSalaryActive ? getUserSalaryByMonth(currentUser, effectiveMonth) : 0;

  // 2. 本人当月动态成本（已确权/入库，业务月 == effectiveMonth）
  let aCost = 0;
  let b1Cost = 0;
  const userMonthLogs = (logs || []).filter(
    (l) =>
      l.recordedCollectorId === currentUser.id &&
      (startDate && endDate 
        ? isDateInRange(resolveLogBusinessDate(l), startDate, endDate)
        : resolveLogBusinessMonth(l) === effectiveMonth) &&
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

  // 3. 经营单元本级计算：Σ(incentiveOutput5 + incentiveCollection2)
  let centerLevelBonus = 0;
  if (customCenterLevelBonus !== undefined && customCenterLevelBonus !== null) {
    centerLevelBonus = customCenterLevelBonus;
  } else if (currentUser.center) {
    const managerCenter = currentUser.center;
    centerLevelBonus = (resources || [])
      .filter((r) => centerMatch(r.assignedTo, managerCenter))
      .reduce((sum, r) => sum + (r.incentiveOutput5 || 0) + (r.incentiveCollection2 || 0), 0);
  }

  // 实际加项：仅适用对象并入结余
  const levelAdd = isEligibleForCenterBonus ? centerLevelBonus : 0;

  // 4. 成本包与结余计算
  const costOther = isChan ? b1Cost : aCost;
  const costPackage = -(monthlySalary + costOther);
  const totalCost = Math.abs(costPackage);

  // 当月结余 rawSurplus (可负，禁止 floor 成 0)
  let rawSurplus = 0;
  if (isChan) {
    rawSurplus = productionPackage + levelAdd + costPackage;
  } else {
    rawSurplus = collectionPackage + levelAdd + costPackage;
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

  // 7. 公式说明文案
  let formulaDescription = '';
  if (isChan) {
    formulaDescription = levelAdd > 0 
      ? '产兑包（现金） + 经营单元本级 + 成本包' 
      : '产兑包（现金） + 成本包';
  } else {
    formulaDescription = levelAdd > 0 
      ? '当期收款包 + 经营单元本级 + 成本包' 
      : '当期收款包 + 成本包';
  }

  return {
    monthlySalary,
    aCost,
    b1Cost,
    costPackage,
    totalCost,
    centerLevelBonus,
    unitRedundancy: centerLevelBonus, // 兼容过渡同值
    levelAdd,
    rawSurplus,
    historyDebtSigned,
    allocQuota,
    isKuan,
    isChan,
    isManagerKuan,
    isEligibleForCenterBonus,
    formulaDescription
  };
}
