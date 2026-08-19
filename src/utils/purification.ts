import { ValueCreationLog, MiningResource, AuditStatus, RefineCategory } from '../../types';

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

/**
 * 获取每笔流水在四格中的入账量，基于 amount 原始值，禁止二次乘以 0.933 
 */
export function getQuadrantLedgerAmount(log: ValueCreationLog): number {
  return log.amount || 0;
}

/**
 * 计算单个矿山的四象限价值数据
 */
export function calculateSingleResourceQuadrants(
  resource: MiningResource,
  logs: ValueCreationLog[]
): MiningQuadrants {
  const relevantLogs = logs.filter(l => l.miningId === resource.id);

  // 1. 本矿已确认的C类与B2类动态成本，用于扣减当期容量上限
  const confirmedCLogs = relevantLogs.filter(
    l => l.costCategory === 'C' && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved)
  );
  const existingC = confirmedCLogs.reduce((sum, l) => sum + (l.dynamicCost || 0), 0);

  const confirmedB2Logs = relevantLogs.filter(
    l => l.costCategory === 'B' && l.valueConsumptionMode === 'B2' && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved)
  );
  const existingB2 = confirmedB2Logs.reduce((sum, l) => sum + (l.dynamicCost || 0), 0);

  // 款初/款当/产初/产当
  const initialRevCap = resource.initialRevenueCapacity !== undefined ? resource.initialRevenueCapacity : resource.revenueCapacity || 0;
  const initialValueCap = resource.initialValueCapacity !== undefined ? resource.initialValueCapacity : resource.valueCapacity || 0;

  const revenueCapacity = Math.max(0, initialRevCap - existingC);
  const valueCapacity = Math.max(0, initialValueCap - existingC - existingB2);

  // 2. 正常流水的确权统计 (排除C类、B2类等在矿山本身的普通提炼)
  const normLogs = relevantLogs.filter(
    l => l.costCategory !== 'C' && !(l.costCategory === 'B' && l.valueConsumptionMode === 'B2')
  );

  const pendingRevenue = normLogs
    .filter(l => l.category === RefineCategory.Revenue && l.status === AuditStatus.Pending)
    .reduce((sum, l) => sum + getQuadrantLedgerAmount(l), 0);

  const confirmedRevenue = normLogs
    .filter(l => l.category === RefineCategory.Revenue && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved))
    .reduce((sum, l) => sum + getQuadrantLedgerAmount(l), 0);

  const unconfirmedRevenue = Math.max(0, revenueCapacity - confirmedRevenue - pendingRevenue);
  const minedRevenue = resource.minedRevenue || 0;

  const pendingValue = normLogs
    .filter(l => l.category === RefineCategory.Value && l.status === AuditStatus.Pending)
    .reduce((sum, l) => sum + getQuadrantLedgerAmount(l), 0);

  const confirmedValue = normLogs
    .filter(l => l.category === RefineCategory.Value && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved))
    .reduce((sum, l) => sum + getQuadrantLedgerAmount(l), 0);

  const unconfirmedValue = Math.max(0, valueCapacity - confirmedValue - pendingValue);
  const minedValue = resource.minedValue || 0;

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
  miningId?: string
): MiningQuadrants {
  if (miningId) {
    const resource = resources.find(r => r.id === miningId);
    if (resource) {
      return calculateSingleResourceQuadrants(resource, logs);
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
    const singles = calculateSingleResourceQuadrants(r, logs);
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
