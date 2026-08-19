import { MiningResource, ValueCreationLog, AuditStatus, RefineCategory, User } from '../../types';
import { getInitialRevenueCapacity, getInitialValueCapacity } from './miningCapacity';
import { TIER_COEFFICIENTS } from '../constants/coefficients';

export function calculateAccruedCosts(miningId: string, allLogs: ValueCreationLog[]) {
  const resourceLogs = (allLogs || []).filter(l => 
    l && 
    l.miningId === miningId && 
    (l.status === AuditStatus.Approved || l.status === AuditStatus.Confirmed || (l.status as string) === '已确权' || (l.status as string) === 'Confirmed' || (l.status as string) === 'Approved' || (l.status as string) === '入库')
  );

  const C = resourceLogs
    .filter(l => l.costCategory === 'C')
    .reduce((sum, l) => sum + (l.dynamicCost !== undefined && l.dynamicCost !== null ? Number(l.dynamicCost) : (Number(l.amount) || 0)), 0);

  const B2 = resourceLogs
    .filter(l => l.costCategory === 'B' && l.valueConsumptionMode === 'B2')
    .reduce((sum, l) => sum + (l.dynamicCost !== undefined && l.dynamicCost !== null ? Number(l.dynamicCost) : (Number(l.amount) || 0)), 0);

  return { C, B2 };
}

export function calculateHedgeCapacitiesAndWeights(resource: MiningResource, allLogs: ValueCreationLog[]) {
  if (!resource) {
    return {
      revInitial: 0,
      valInitial: 0,
      revCurrent: 0,
      valCurrent: 0,
      cWeightRev: 1,
      cWeightVal: 1,
      b2Weight: 1,
      C: 0,
      B2: 0
    };
  }

  const { C, B2 } = calculateAccruedCosts(resource.id, allLogs);
  const revInitial = getInitialRevenueCapacity(resource);
  const valInitial = getInitialValueCapacity(resource);

  const revCurrent = Math.max(0, revInitial - C);
  const valCurrent = Math.max(0, valInitial - C - B2);

  const cWeightRev = revInitial > 0 ? Math.max(0, (revInitial - C) / revInitial) : 1;
  const cWeightVal = valInitial > 0 ? Math.max(0, (valInitial - C) / valInitial) : 1;
  const b2Weight = valInitial > 0 ? Math.max(0, (valInitial - B2) / valInitial) : 1;

  return {
    revInitial,
    valInitial,
    revCurrent,
    valCurrent,
    cWeightRev,
    cWeightVal,
    b2Weight,
    C,
    B2
  };
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

  const tier = log.costCategory || 'C';
  if (categoryStr === RefineCategory.Value || categoryStr === 'Value' || categoryStr === '产值') {
    const coeffs = isHighValueExpert ? TIER_COEFFICIENTS.VALUE_MANAGER : TIER_COEFFICIENTS.VALUE_CHAN;
    if (tier === 'A') return coeffs.Enterprise;
    if (tier === 'B') return coeffs.Bidding;
    if (tier === 'C') return coeffs.SafetyEval;
    if (tier === 'D') return coeffs.OccHealth;
    return coeffs.SafetyEval;
  } else {
    const coeffs = isHighRevenueExpert ? TIER_COEFFICIENTS.REVENUE_HIGH : isRevenueSpecialist ? TIER_COEFFICIENTS.REVENUE_MID_INITIAL : TIER_COEFFICIENTS.REVENUE_HIGH;
    if (tier === 'A') return coeffs.Enterprise;
    if (tier === 'B') return coeffs.Bidding;
    if (tier === 'C') return coeffs.SafetyEval;
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
  const resource = resources.find(r => r.id === miningId);
  if (!resource) return jzczLogs;

  const combinedLogs = [...jzczLogs, ...dtcbLogs];
  const { cWeightRev, cWeightVal, b2Weight } = calculateHedgeCapacitiesAndWeights(resource, combinedLogs);

  return jzczLogs.map(log => {
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

    // 权重: 已确权收款流水：只乘 C权(款)；已确权产值流水：乘 B2权，若 C权(产)<1 则再乘 C权(产)
    const weight = isRevenue
      ? cWeightRev
      : b2Weight * (cWeightVal < 1 ? cWeightVal : 1);

    const newAmount = Math.round(baseAmount * weight);
    const newNetValue = Math.round(newAmount * factor);

    return {
      ...log,
      rawAmount,
      amount: newAmount,
      netValue: newNetValue,
      cClassRatio: isRevenue ? cWeightRev : cWeightVal,
      b2ClassRatio: isRevenue ? 1 : b2Weight
    };
  });
}
