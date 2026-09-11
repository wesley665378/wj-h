import { ValueCreationLog, MiningResource, AuditStatus, RefineCategory, User } from '../../types';
import { businessUnitLabelsEqual } from './businessUnitName';
import { parseCenterList } from './accessControl';
import { centerMatch } from './centerScope';
import { isDynamicCostLog, isCreationCategoryLog } from './costCategory';
export { businessUnitLabelsEqual, parseCenterList };

export interface QuadrantData {
  capacity: number;
  pending: number;
  confirmed: number;
  unconfirmed: number;
  mined: number;
}

export interface MiningQuadrants {
  revenue: QuadrantData;
  value: QuadrantData;
}

import {
  importNetAmount
} from './importQuotaCheck';
export { importNetAmount };

/**
 * 判断单条流水是否属于创造端正常提炼流水（非动态消耗）
 * 创造流水（category 为收款/Revenue 或产值/Value）成色档保留计入四格；
 * 消耗流水（手动确权、SYS_C/SYS_B2、真 A/B/C/D 消耗）排除。
 */
export function isCreationMiningLog(log?: ValueCreationLog | null): boolean {
  if (!log) return false;
  if (!isCreationCategoryLog(log)) return false;
  if (isDynamicCostLog(log)) return false;
  return true;
}

/**
 * 获取每笔流水在四格中的入账量，基于 amount 原始值，禁止二次乘以 0.933 
 */
export function getQuadrantLedgerAmount(log: ValueCreationLog): number {
  return log.amount || 0;
}

/**
 * 辅助状态判断：是否处于已确权状态（不含入库）
 */
function isConfirmedStatus(status: any): boolean {
  return status === AuditStatus.Confirmed || status === '已确权' || status === 'Confirmed' || status === 'confirmed';
}

/**
 * 辅助状态判断：是否处于入库状态
 */
function isApprovedStatus(status: any): boolean {
  return status === AuditStatus.Approved || status === '入库' || status === 'Approved' || status === 'approved';
}

/**
 * 辅助状态判断：是否处于待确权状态
 */
function isPendingStatus(status: any): boolean {
  return status === AuditStatus.Pending || status === '待确权' || status === 'Pending' || status === 'pending';
}

const isRevenueCategory = (cat: any) =>
  cat === RefineCategory.Revenue || cat === '收款' || cat === 'Revenue' || cat === 'revenue';

const isValueCategory = (cat: any) =>
  cat === RefineCategory.Value || cat === '产值' || cat === 'Value' || cat === 'value';

/**
 * 计算单个矿山的四象限价值数据
 */
export function calculateSingleResourceQuadrants(
  resource: MiningResource,
  logs: ValueCreationLog[],
  centerId?: string | null,
  users: User[] = []
): MiningQuadrants {
  // DB-02b-F: 如果指定了 centerId，过滤流水口径 (仅计入归属本单元的采集主体流水)
  // centerUserIds 同时加入 id 与 userId
  const centerUserIds = new Set<string>();
  if (centerId) {
    users.forEach(u => {
      if (centerMatch(u.center, centerId)) {
        if (u.id) centerUserIds.add(u.id);
        if (u.userId) centerUserIds.add(u.userId);
      }
    });
  }

  const relevantLogs = logs.filter(l => {
    if (l.miningId !== resource.id) return false;
    // 如果指定了单元，流水必须属于该单元的用户
    if (centerId && l.recordedCollectorId) {
      return centerUserIds.has(l.recordedCollectorId);
    }
    return true;
  });

  // 1. 本矿已确认的C类与B2类动态成本，用于扣减当期容量上限
  const confirmedCLogs = relevantLogs.filter(
    l => isDynamicCostLog(l) && l.costCategory === 'C' && (isConfirmedStatus(l.status) || isApprovedStatus(l.status))
  );
  const existingC = confirmedCLogs.reduce((sum, l) => sum + (l.dynamicCost || 0), 0);

  const confirmedB2Logs = relevantLogs.filter(
    l => isDynamicCostLog(l) && l.costCategory === 'B' && l.valueConsumptionMode === 'B2' && (isConfirmedStatus(l.status) || isApprovedStatus(l.status))
  );
  const existingB2 = confirmedB2Logs.reduce((sum, l) => sum + (l.dynamicCost || 0), 0);

  // 款初/款当/产初/产当
  let initialRevCap = resource.initialRevenueCapacity !== undefined ? resource.initialRevenueCapacity : resource.revenueCapacity || 0;
  let initialValueCap = resource.initialValueCapacity !== undefined ? resource.initialValueCapacity : resource.valueCapacity || 0;

  if (centerId && resource.quotas && resource.quotas.length > 0) {
    const matchingQuotas = resource.quotas.filter(item => 
      centerMatch(item.centerId, centerId)
    );
    if (matchingQuotas.length > 0) {
      initialRevCap = matchingQuotas.reduce((sum, q) => sum + (q.revenueQuota || 0), 0);
      initialValueCap = matchingQuotas.reduce((sum, q) => sum + (q.valueQuota || 0), 0);
    } else {
      initialRevCap = 0;
      initialValueCap = 0;
    }
  }

  const revenueCapacity = Math.max(0, initialRevCap - existingC);
  const valueCapacity = Math.max(0, initialValueCap - existingC - existingB2);

  // 2. 正常创造流水的确权统计 (保留收款/产值创造单，排除纯动态消耗)
  const normLogs = relevantLogs.filter(l => isCreationMiningLog(l));

  // 待确权 = Pending
  const pendingRevenue = normLogs
    .filter(l => isRevenueCategory(l.category) && isPendingStatus(l.status))
    .reduce((sum, l) => sum + getQuadrantLedgerAmount(l), 0);

  // 已确权 = Confirmed / 已确权（不含入库）
  const confirmedRevenue = normLogs
    .filter(l => isRevenueCategory(l.category) && isConfirmedStatus(l.status))
    .reduce((sum, l) => sum + getQuadrantLedgerAmount(l), 0);

  // 入库 = Approved / 入库，用流水 amount 汇总
  const minedRevenue = normLogs
    .filter(l => isRevenueCategory(l.category) && isApprovedStatus(l.status))
    .reduce((sum, l) => sum + getQuadrantLedgerAmount(l), 0);

  // 未确权 = max(0, 当限 − 待 − 已 − 入)
  const unconfirmedRevenue = Math.max(0, revenueCapacity - confirmedRevenue - pendingRevenue - minedRevenue);

  // 待确权产值 = Pending
  const pendingValue = normLogs
    .filter(l => isValueCategory(l.category) && isPendingStatus(l.status))
    .reduce((sum, l) => sum + getQuadrantLedgerAmount(l), 0);

  // 已确权产值 = Confirmed / 已确权（不含入库）
  const confirmedValue = normLogs
    .filter(l => isValueCategory(l.category) && isConfirmedStatus(l.status))
    .reduce((sum, l) => sum + getQuadrantLedgerAmount(l), 0);

  // 入库产值 = Approved / 入库，用流水 amount 汇总
  const minedValue = normLogs
    .filter(l => isValueCategory(l.category) && isApprovedStatus(l.status))
    .reduce((sum, l) => sum + getQuadrantLedgerAmount(l), 0);

  // 未确权产值 = max(0, 当限 − 待 − 已 − 入)
  const unconfirmedValue = Math.max(0, valueCapacity - confirmedValue - pendingValue - minedValue);

  return {
    revenue: {
      capacity: revenueCapacity,
      pending: pendingRevenue,
      confirmed: confirmedRevenue,
      unconfirmed: unconfirmedRevenue,
      mined: minedRevenue
    },
    value: {
      capacity: valueCapacity,
      pending: pendingValue,
      confirmed: confirmedValue,
      unconfirmed: unconfirmedValue,
      mined: minedValue
    }
  };
}

/**
 * 依据全量特定矿山 / 汇总的多款矿山与纯 jzcz（filteredLogs）流水，计算价值动态流四格
 */
export function aggregateMiningQuadrantsFromLogs(
  logs: ValueCreationLog[],
  resources: MiningResource[],
  miningId?: string,
  centerId?: string | null,
  users: User[] = []
): MiningQuadrants {
  // DB-02d-F: 如果 centerId 是多单元整串，尝试解析。
  // 注意：如果 centerId 为空，则不进行单元过滤
  const actualCenterId = centerId;

  if (miningId) {
    const resource = resources.find(r => r.id === miningId);
    if (resource) {
      return calculateSingleResourceQuadrants(resource, logs, actualCenterId, users);
    }
    return {
      revenue: { capacity: 0, pending: 0, confirmed: 0, unconfirmed: 0, mined: 0 },
      value: { capacity: 0, pending: 0, confirmed: 0, unconfirmed: 0, mined: 0 }
    };
  }

  // 汇总所有矿山的四格值
  const totals = {
    revenue: { capacity: 0, pending: 0, confirmed: 0, unconfirmed: 0, mined: 0 },
    value: { capacity: 0, pending: 0, confirmed: 0, unconfirmed: 0, mined: 0 }
  };

  for (const r of resources) {
    const singles = calculateSingleResourceQuadrants(r, logs, actualCenterId, users);
    totals.revenue.capacity += singles.revenue.capacity;
    totals.revenue.pending += singles.revenue.pending;
    totals.revenue.confirmed += singles.revenue.confirmed;
    totals.revenue.unconfirmed += singles.revenue.unconfirmed;
    totals.revenue.mined += singles.revenue.mined;

    totals.value.capacity += singles.value.capacity;
    totals.value.pending += singles.value.pending;
    totals.value.confirmed += singles.value.confirmed;
    totals.value.unconfirmed += singles.value.unconfirmed;
    totals.value.mined += singles.value.mined;
  }

  return totals;
}
