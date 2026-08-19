import { User, Role, ValueCreationLog, MiningResource, RefineCategory, AuditStatus } from '../../types';
import { TIER_COEFFICIENTS } from '../constants/coefficients';
import {
  getInitialRevenueCapacity,
  getInitialValueCapacity,
  getCurrentRevenueCapacity,
  getCurrentValueCapacity,
  getCWeightRevenue,
  getCWeightValue,
  getB2WeightValue
} from './miningCapacity';
 
export interface DualTrackMiningContext {
  miningId: string;
  originalRevenueLimit: number;
  npcRevenueStatus: '100%' | '据实';
  npcRevenueOverrideValue: number;
  totalConfirmedRevenue: number;
  cRevenuePointsList: number[];
  
  originalValueLimit: number;
  npcValueStatus: '100%' | '据实';
  npcValueOverrideValue: number;
  totalConfirmedValue: number;
  cValuePointsList: number[];
}

export function calculateDualTrackCoreMatrices(mining: DualTrackMiningContext) {
  const updatedRevenueLimit = Math.max(
    mining.npcRevenueStatus === '据实' ? mining.npcRevenueOverrideValue : mining.originalRevenueLimit,
    mining.totalConfirmedRevenue
  );

  const updatedValueLimit = Math.max(
    mining.npcValueStatus === '据实' ? mining.npcValueOverrideValue : mining.originalValueLimit,
    mining.totalConfirmedValue
  );

  const sumCRevenuePoints = mining.cRevenuePointsList.reduce((sum, p) => sum + p, 0);
  const sumCValuePoints = mining.cValuePointsList.reduce((sum, p) => sum + p, 0);

  const cRevenueWeight = updatedRevenueLimit > 0 
    ? Math.max(0, (updatedRevenueLimit - sumCRevenuePoints) / updatedRevenueLimit)
    : 0;

  const cValueWeight = updatedValueLimit > 0 
    ? Math.max(0, (updatedValueLimit - sumCValuePoints) / updatedValueLimit)
    : 0;

  return {
    updatedRevenueLimit: Number(updatedRevenueLimit.toFixed(2)),
    updatedValueLimit: Number(updatedValueLimit.toFixed(2)),
    cRevenueWeight: Number(cRevenueWeight.toFixed(6)),
    cValueWeight: Number(cValueWeight.toFixed(6))
  };
}

interface KFactorValueTrackContext {
  miningId: string;
  updatedValueLimit: number;
  b2PointsList: number[];
  experts: Array<{
    expertId: string;
    rank: 'Junior' | 'Mid' | 'High';
    initialValue: number;
  }>;
}

export function calculateT1PlusRevenue(amount: number, isHighExpert: boolean, tier: 'A' | 'B' | 'C', cWeight: number) {
  const coeffs = isHighExpert ? TIER_COEFFICIENTS.REVENUE_HIGH : TIER_COEFFICIENTS.REVENUE_MID_INITIAL;
  const rates = { A: coeffs.Enterprise, B: coeffs.Bidding, C: coeffs.SafetyEval };
  const rate = rates[tier] || coeffs.SafetyEval;
  // REMOVED: TIER_COEFFICIENTS.BASE_LOSS
  return amount * rate * cWeight;
}

export function calculateT1PlusValue(amount: number, isHighExpert: boolean, tier: 'A' | 'B' | 'C' | 'D', cWeight: number, b2Weight: number) {
  const coeffs = isHighExpert ? TIER_COEFFICIENTS.VALUE_MANAGER : TIER_COEFFICIENTS.VALUE_CHAN;
  const rates = { A: coeffs.Enterprise, B: coeffs.Bidding, C: coeffs.SafetyEval, D: coeffs.OccHealth };
  const rate = rates[tier] || coeffs.OccHealth;
  // REMOVED: TIER_COEFFICIENTS.BASE_LOSS
  return amount * rate * cWeight * b2Weight;
}

export const calculateHistoricalNetValue = (log: ValueCreationLog, resources: MiningResource[], managedUsers: User[]) => {
  if (!log) return 0;
  const resource = resources.find(r => r && r.id === log.miningId);
  const collector = managedUsers.find(u => u && u.id === log.recordedCollectorId);
  
  if (!collector) return log.netValue || 0;

  const isHighValueExpert = (collector.category || '').includes('高产专') || (collector.secondaryRoles as string[] || []).includes('高产专');
  const isHighRevenueExpert = (collector.category || '').includes('高款专') || (collector.secondaryRoles as string[] || []).includes('高款专');
  const isRevenueSpecialist = (collector.category || '').includes('款专') || (collector.secondaryRoles as string[] || []).includes('款专');

  let factor = 0;
  if (resource) {
    if (log.category === RefineCategory.Value) {
      if (resource.refineTypeFactors?.[log.type]?.customValueFactor !== undefined) {
        factor = resource.refineTypeFactors[log.type]!.customValueFactor!;
      } else if (resource.customValueFactor !== undefined) {
        factor = resource.customValueFactor;
      }
    } else if (log.category === RefineCategory.Revenue) {
      if (resource.refineTypeFactors?.[log.type]?.customRevenueFactor !== undefined) {
        factor = resource.refineTypeFactors[log.type]!.customRevenueFactor!;
      } else if (resource.customRevenueFactor !== undefined) {
        factor = resource.customRevenueFactor;
      }
    }
  }

  if (factor === 0) {
    const tier = log.costCategory || 'C';
    if (log.category === RefineCategory.Value) {
      // Use TIER_COEFFICIENTS here
      const coeffs = isHighValueExpert ? TIER_COEFFICIENTS.VALUE_MANAGER : TIER_COEFFICIENTS.VALUE_CHAN;
      if (tier === 'A') factor = coeffs.Enterprise;
      else if (tier === 'B') factor = coeffs.Bidding;
      else if (tier === 'C') factor = coeffs.SafetyEval;
      else if (tier === 'D') factor = coeffs.OccHealth;
      else factor = coeffs.SafetyEval;
    } else {
      const coeffs = isHighRevenueExpert ? TIER_COEFFICIENTS.REVENUE_HIGH : isRevenueSpecialist ? TIER_COEFFICIENTS.REVENUE_MID_INITIAL : TIER_COEFFICIENTS.REVENUE_HIGH;
      if (tier === 'A') factor = coeffs.Enterprise;
      else if (tier === 'B') factor = coeffs.Bidding;
      else if (tier === 'C') factor = coeffs.SafetyEval;
      else factor = coeffs.SafetyEval;
    }
  }

  const weight = log.cClassRatio || 1;
  const b2Weight = log.category === RefineCategory.Value ? (log.b2ClassRatio || 1) : 1;
  const baseAmount = log.rawAmount || log.amount; 
  return baseAmount * weight * b2Weight * factor;
};

import { applyConsumptionHedgeToLogs } from './consumptionHedge';

export { applyConsumptionHedgeToLogs };
export function recalibrateLogsForMiningId(
  miningId: string, 
  allLogs: ValueCreationLog[], 
  resources: MiningResource[],
  managedUsers: User[]
): ValueCreationLog[] {
  return applyConsumptionHedgeToLogs(miningId, allLogs, allLogs, resources, managedUsers);
}


export const getPurityInfo = (revenue: number, value: number, pendingValue: number, valueLimit: number) => {
  if (revenue === 0 && (pendingValue + value) > 0) {
    return { label: '重点监控', color: 'text-rose-600', color500: 'text-rose-500', bg: 'bg-rose-100', icon: '🔴', isRed: true };
  }
  if (revenue > 0 && value === valueLimit && value > 0 && (revenue / value) > 0 && (revenue / value) < 1) {
    return { label: '尾款清收', color: 'text-orange-600', color500: 'text-orange-500', bg: 'bg-orange-100', icon: '🟡', isRed: false };
  }
  if (revenue > 0 && (value + pendingValue) === 0) {
    return { label: '优质预付', color: 'text-emerald-600', color500: 'text-emerald-500', bg: 'bg-emerald-100', icon: '🟢', isRed: false };
  }
  if (value === 0 && revenue === 0 && pendingValue === 0) {
    return { label: '无产值', color: 'text-slate-400', color500: 'text-slate-400', bg: 'bg-slate-100', icon: '⚪', isRed: false };
  }
  return { label: '平稳运营', color: 'text-blue-600', color500: 'text-blue-500', bg: 'bg-blue-100', icon: '🔵', isRed: false };
};

export const calculateConsumptionMirrorFields = (log: ValueCreationLog, resources: MiningResource[], allLogs: ValueCreationLog[]) => {
  const res = resources.find(r => r.id === log.miningId);
  if (!res) {
    return {
      cWeightValue: '1.0000',
      b2WeightValue: '-',
      revLimitStr: '-',
      valLimitCStr: '-',
      valLimitB2Str: '-'
    };
  }
  
  const cw = log.category === RefineCategory.Revenue ? getCWeightRevenue(res, allLogs) : getCWeightValue(res, allLogs);
  const bw = getB2WeightValue(res, allLogs);
  const cWeightValue = cw < 1 ? cw.toFixed(4) : '1.0000';
  const b2WeightValue = log.category === RefineCategory.Revenue ? '-' : (bw < 1 ? bw.toFixed(4) : '1.0000');

  const initialRev = getInitialRevenueCapacity(res);
  const currentRev = getCurrentRevenueCapacity(res);
  const revLimitStr = `${Math.round(initialRev).toLocaleString()} / ${Math.round(currentRev).toLocaleString()}`;

  const initialVal = getInitialValueCapacity(res);
  const currentVal = getCurrentValueCapacity(res);
  const valLimitCStr = `${Math.round(initialVal).toLocaleString()} / ${Math.round(currentVal).toLocaleString()}`;
  const valLimitB2Str = `${Math.round(initialVal).toLocaleString()} / ${Math.round(currentVal).toLocaleString()}`;

  return {
    cWeightValue,
    b2WeightValue,
    revLimitStr,
    valLimitCStr,
    valLimitB2Str
  };
};

export enum PermissionCluster {
  Collection = 'Collection',
  Value = 'Value',
  Management = 'Management',
  System = 'System'
}

export const RANK_CONFIG: Record<string, { cluster: PermissionCluster; salaryType: string; defaultPermissions: string[] }> = {
  '初款专': { 
    cluster: PermissionCluster.Collection, 
    salaryType: '收款工资包',
    defaultPermissions: ['kanban', 'consumption', 'creation', 'transactions', 'distribution', 'evaluation', 'account']
  },
  '中款专': { 
    cluster: PermissionCluster.Collection, 
    salaryType: '收款工资包',
    defaultPermissions: ['kanban', 'consumption', 'creation', 'transactions', 'distribution', 'evaluation', 'account']
  },
  '高款专': { 
    cluster: PermissionCluster.Collection, 
    salaryType: '收款工资包',
    defaultPermissions: ['kanban', 'consumption', 'creation', 'transactions', 'distribution', 'evaluation', 'account']
  },
  '初产专': { 
    cluster: PermissionCluster.Value, 
    salaryType: '产值工资包',
    defaultPermissions: ['kanban', 'consumption', 'creation', 'transactions', 'distribution', 'evaluation', 'account']
  },
  '中产专': { 
    cluster: PermissionCluster.Value, 
    salaryType: '产值工资包',
    defaultPermissions: ['kanban', 'consumption', 'creation', 'transactions', 'distribution', 'evaluation', 'account']
  },
  '高产专': { 
    cluster: PermissionCluster.Value, 
    salaryType: '产值工资包',
    defaultPermissions: ['kanban', 'consumption', 'creation', 'transactions', 'distribution', 'evaluation', 'account']
  },
  '经管员高款专': { 
    cluster: PermissionCluster.Collection, 
    salaryType: '经管员工资包',
    defaultPermissions: ['kanban', 'consumption', 'creation', 'transactions', 'distribution', 'evaluation', 'account']
  },
  '经管员高产专': { 
    cluster: PermissionCluster.Value, 
    salaryType: '经管员工资包',
    defaultPermissions: ['kanban', 'consumption', 'creation', 'transactions', 'distribution', 'evaluation', 'account']
  },
  '水库管理员': { 
    cluster: PermissionCluster.Management, 
    salaryType: 'NPC工资包',
    defaultPermissions: ['kanban', 'evaluation', 'distribution', 'reservoir', 'account']
  },
  'NPC': { 
    cluster: PermissionCluster.Management, 
    salaryType: 'NPC工资包',
    defaultPermissions: ['kanban', 'resources', 'audit', 'transactions', 'personnel', 'evaluation', 'distribution', 'reservoir', 'account']
  },
  '系统管理员': { 
    cluster: PermissionCluster.System, 
    salaryType: 'NPC工资包',
    defaultPermissions: ['kanban', 'resources', 'audit', 'transactions', 'personnel', 'distribution', 'evaluation', 'consumption', 'creation', 'account']
  }
};

export const checkUserPermission = (user: User, menuId: string): boolean => {
  const isAdmin = user.role === Role.Admin || user.category === '系统管理员';
  
  if (isAdmin) return true;

  const isNpcxie = user.role === Role.npcxie || user.category === 'NPC';
  if (isNpcxie && menuId === 'personnel') return false;

  if (user.permissions && user.permissions.length > 0) {
    return user.permissions.includes(menuId);
  }

  const rank = user.category;
  if (rank && RANK_CONFIG[rank]) {
    return RANK_CONFIG[rank].defaultPermissions.includes(menuId);
  }

  if (menuId === 'kanban') return true;

  return false;
};

/**
 * @businessRule 根据历史履历获取指定月份的刚性工资包
 * @description 优先匹配 effectiveMonth <= month 的最晚一条记录；若无记录则返回当前 salaryPackage
 */
export function getUserSalaryByMonth(user: User, month: string): number {
  if (!user.salaryHistory || user.salaryHistory.length === 0) {
    return user.salaryPackage || 0;
  }
  
  // 按照生效月份降序排列
  const sortedHistory = [...user.salaryHistory].sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth));
  
  // 查找生效月小于等于目标月的第一条记录
  const record = sortedHistory.find(h => h.effectiveMonth <= month);
  
  if (record) return record.salary;
  
  // 如果目标月早于所有记录，返回最早的一条记录（或者 0，取决于业务理解，这里返回最早记录以保证历史追溯）
  return sortedHistory[sortedHistory.length - 1].salary;
}
