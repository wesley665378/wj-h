import { MiningResource, ValueCreationLog, AuditStatus, RefineCategory, RefineType, User } from '../../types';
import { getInitialRevenueCapacity, getInitialValueCapacity } from './miningCapacity';
import { TIER_COEFFICIENTS } from '../constants/coefficients';

/**
 * 获取单笔提报记录的真实注入积分 (SSOT)
 * - 产值端：为原始注入基数 rawAmount（回退为 amount）；
 * - 收款端：为原始输入金额提纯值 rawAmount * 0.933（回退为已提纯 amount）。
 */
export function calculateInjectedAmount(log?: ValueCreationLog | null): number {
  if (!log) return 0;
  const categoryStr = log.category as string;
  const typeStr = log.type as string;
  const isRevenue =
    categoryStr === RefineCategory.Revenue ||
    categoryStr === 'Revenue' ||
    categoryStr === '收款' ||
    typeStr === 'Revenue' ||
    typeStr === '收款';

  if (isRevenue) {
    return log.rawAmount !== undefined && log.rawAmount !== null
      ? Math.round(Number(log.rawAmount) * 0.933)
      : Math.round(Number(log.amount) || 0);
  }
  return log.rawAmount !== undefined && log.rawAmount !== null
    ? Math.round(Number(log.rawAmount))
    : Math.round(Number(log.amount) || 0);
}

/**
 * 获取单笔提报记录的原始输入金额（输入收款/输入产值）
 */
export function getRawInputAmount(log?: ValueCreationLog | null): number {
  if (!log) return 0;
  if (log.rawAmount !== undefined && log.rawAmount !== null && Number(log.rawAmount) > 0) {
    return Math.round(Number(log.rawAmount));
  }
  const categoryStr = log.category as string;
  const typeStr = log.type as string;
  const isRevenue =
    categoryStr === RefineCategory.Revenue ||
    categoryStr === 'Revenue' ||
    categoryStr === '收款' ||
    typeStr === 'Revenue' ||
    typeStr === '收款';

  if (isRevenue && log.amount) {
    return Math.round(Number(log.amount) / 0.933);
  }
  return Math.round(Number(log.amount) || 0);
}

export function calculateAccruedCosts(miningId: string, allLogs: ValueCreationLog[]) {
  const resourceLogs = (allLogs || []).filter(l => 
    l && 
    l.miningId === miningId && 
    (l.status === AuditStatus.Approved || l.status === AuditStatus.Confirmed || (l.status as string) === '已确权' || (l.status as string) === 'Confirmed' || (l.status as string) === 'Approved' || (l.status as string) === '入库')
  );

  const C = resourceLogs
    .filter(l => l && l.costCategory === 'C')
    .reduce((sum, l) => sum + (l.dynamicCost !== undefined && l.dynamicCost !== null ? Number(l.dynamicCost) : (Number(l.amount) || 0)), 0);

  const B2 = resourceLogs
    .filter(l => l && l.costCategory === 'B' && l.valueConsumptionMode === 'B2')
    .reduce((sum, l) => sum + (l.dynamicCost !== undefined && l.dynamicCost !== null ? Number(l.dynamicCost) : (Number(l.amount) || 0)), 0);

  return { C, B2 };
}

export function calculateHedgeCapacitiesAndWeights(resource?: MiningResource | null, allLogs?: ValueCreationLog[] | null) {
  if (!resource || !resource.id) {
    return {
      revInitial: 0,
      valInitial: 0,
      revCurrent: 0,
      valCurrent: 0,
      cWeightRev: 1,
      cWeightVal: 1,
      b2Weight: 1,
      C: 0,
      B2: 0,
      N: 0
    };
  }

  const { C, B2 } = calculateAccruedCosts(resource.id, allLogs || []);
  const revInitial = getInitialRevenueCapacity(resource);
  const valInitial = getInitialValueCapacity(resource);

  // N = round(款初) (款初已是净值)
  const N = Math.round(revInitial);

  // C权 = (N − ΣC) / N (N=0 时 C权=1)
  const cWeight = N > 0 ? Math.max(0, (N - C) / N) : 1;

  // B2权 = (N − ΣC − ΣB2) / (N − ΣC) (N−ΣC=0 时 B2权=1)
  const denominatorB2 = N - C;
  const b2Weight = denominatorB2 > 0 ? Math.max(0, (denominatorB2 - B2) / denominatorB2) : 1;

  // 款当 = max(0, 款初 - C)
  const revCurrent = Math.max(0, revInitial - C);
  // 产当 = max(0, 产初 - C - B2)
  const valCurrent = Math.max(0, valInitial - C - B2);

  return {
    revInitial,
    valInitial,
    revCurrent,
    valCurrent,
    cWeightRev: cWeight,
    cWeightVal: cWeight,
    b2Weight,
    C,
    B2,
    N
  };
}

/**
 * 提炼阶梯归一化函数
 * 兼容历史数据（A/B/C）与新阶梯（T1/T2/T3），缺省为 T3。
 * 注意：本函数仅用于创造侧提炼阶梯判断，不得用于判断消耗 C/B2。
 */
export function normalizeRefineTier(costCategory?: string | null): 'T1' | 'T2' | 'T3' {
  if (!costCategory) return 'T3';
  const val = String(costCategory).trim().toUpperCase();
  if (val === 'A' || val === 'T1') return 'T1';
  if (val === 'B' || val === 'T2') return 'T2';
  if (val === 'C' || val === 'T3') return 'T3';
  return 'T3';
}

export function getLogRefineFactor(log: ValueCreationLog, resource?: MiningResource, collector?: User): number {
  if (!log) return 0;
  const categoryStr = log.category as string;
  if (resource) {
    if (categoryStr === RefineCategory.Value || categoryStr === 'Value' || categoryStr === '产值') {
      if (resource.refineTypeFactors?.[log.type]?.customValueFactor !== undefined) {
        return resource.refineTypeFactors[log.type]!.customValueFactor!;
      } else if (resource.customValueFactor !== undefined) {
        return resource.customValueFactor;
      }
    } else if (categoryStr === RefineCategory.Revenue || categoryStr === 'Revenue' || categoryStr === '收款') {
      if (resource.refineTypeFactors?.[log.type]?.customRevenueFactor !== undefined) {
        return resource.refineTypeFactors[log.type]!.customRevenueFactor!;
      } else if (resource.customRevenueFactor !== undefined) {
        return resource.customRevenueFactor;
      }
    }
  }

  const isHighValueExpert = collector ? ((collector.category || '').includes('高产专') || ((collector.secondaryRoles as string[]) || []).includes('高产专')) : false;
  const isHighRevenueExpert = collector ? ((collector.category || '').includes('高款专') || ((collector.secondaryRoles as string[]) || []).includes('高款专')) : false;
  const isRevenueSpecialist = collector ? ((collector.category || '').includes('款专') || ((collector.secondaryRoles as string[]) || []).includes('款专')) : false;

  const tier = normalizeRefineTier(log.costCategory);
  if (categoryStr === RefineCategory.Value || categoryStr === 'Value' || categoryStr === '产值') {
    const coeffs = isHighValueExpert ? TIER_COEFFICIENTS.VALUE_MANAGER : TIER_COEFFICIENTS.VALUE_CHAN;
    if (tier === 'T1') return coeffs.Enterprise;
    if (tier === 'T2') return coeffs.Bidding;
    if (tier === 'T3') return coeffs.SafetyEval;
    return coeffs.SafetyEval;
  } else {
    const coeffs = isHighRevenueExpert ? TIER_COEFFICIENTS.REVENUE_HIGH : isRevenueSpecialist ? TIER_COEFFICIENTS.REVENUE_MID_INITIAL : TIER_COEFFICIENTS.REVENUE_HIGH;
    if (tier === 'T1') return coeffs.Enterprise;
    if (tier === 'T2') return coeffs.Bidding;
    if (tier === 'T3') return coeffs.SafetyEval;
    return coeffs.SafetyEval;
  }
}

/**
 * @SSOT 统一对冲算法
 * 不重算待确权、入库、C/B2/A 消耗单、其他矿。同一 id 覆盖，保留 rawAmount。
 */
export function applyConsumptionHedgeToLogs(
  miningId: string,
  jzczLogs: ValueCreationLog[],
  dtcbLogs: ValueCreationLog[],
  resources: MiningResource[],
  managedUsers: User[]
): ValueCreationLog[] {
  if (!jzczLogs || !Array.isArray(jzczLogs)) return [];
  const resource = (resources || []).find(r => r && r.id === miningId);
  if (!resource) return jzczLogs;

  const combinedLogs = [...(jzczLogs || []).filter(Boolean), ...(dtcbLogs || []).filter(Boolean)];
  const { cWeightRev, cWeightVal, b2Weight } = calculateHedgeCapacitiesAndWeights(resource, combinedLogs);

  return jzczLogs.map(log => {
    if (!log) return log;
    if (log.miningId !== miningId) return log;

    // 排除成本类消耗单 (C, A, B2)
    if (
      log.costCategory === 'C' || 
      log.costCategory === 'A' || 
      (log.costCategory === 'B' && log.valueConsumptionMode === 'B2')
    ) {
      return log;
    }

    // 不重算待确权！仅重算已确权/已审核记录
    const isApprovedOrConfirmed = 
      log.status === AuditStatus.Approved || 
      log.status === AuditStatus.Confirmed || 
      (log.status as string) === '已确权' || 
      (log.status as string) === 'Confirmed' ||
      (log.status as string) === 'Approved' ||
      (log.status as string) === '入库';

    if (!isApprovedOrConfirmed) {
      return log;
    }

    const categoryStr = log.category as string;
    const isRevenue = categoryStr === RefineCategory.Revenue || categoryStr === 'Revenue' || categoryStr === '收款';
    const collector = managedUsers.find(u => u.id === log.recordedCollectorId);
    const factor = getLogRefineFactor(log, resource, collector);

    // 保留 rawAmount: 产值基数=rawAmount（没有就用 amount）。收款基数=rawAmount×0.933（没有 rawAmount 就用已提纯 amount）
    const rawAmount = log.rawAmount !== undefined && log.rawAmount !== null ? Number(log.rawAmount) : Number(log.amount);
    
    const baseAmount = isRevenue 
      ? (log.rawAmount !== undefined && log.rawAmount !== null ? Number(log.rawAmount) * 0.933 : Number(log.amount))
      : rawAmount;

    // 收款：只乘 C权；产值：始终乘 C权 × B2权
    const weight = isRevenue
      ? cWeightRev
      : cWeightVal * b2Weight;

    const newAmount = Math.round(baseAmount * weight);
    const newNetValue = Math.round(baseAmount * weight * factor);

    return {
      ...log,
      rawAmount,
      amount: newAmount,
      netValue: newNetValue,
      cClassRatio: cWeightRev,
      b2ClassRatio: isRevenue ? 1 : b2Weight
    };
  });
}
