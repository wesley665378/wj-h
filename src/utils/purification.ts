import { ValueCreationLog, MiningResource, AuditStatus, RefineCategory, User } from '../../types';
import { businessUnitLabelsEqual } from './businessUnitName';
import { parseCenterList } from './accessControl';
import { centerMatch } from './centerScope';
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
  logs: ValueCreationLog[],
  centerId?: string | null,
  users: User[] = []
): MiningQuadrants {
  // DB-02b-F: 如果指定了 centerId，过滤流水口径 (仅计入归属本单元的采集主体流水)
  const centerUserIds = new Set<string>();
  if (centerId) {
    users.forEach(u => {
      if (centerMatch(u.center, centerId)) {
        centerUserIds.add(u.id);
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
    l => l.costCategory === 'C' && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved)
  );
  const existingC = confirmedCLogs.reduce((sum, l) => sum + (l.dynamicCost || 0), 0);

  const confirmedB2Logs = relevantLogs.filter(
    l => l.costCategory === 'B' && l.valueConsumptionMode === 'B2' && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved)
  );
  const existingB2 = confirmedB2Logs.reduce((sum, l) => sum + (l.dynamicCost || 0), 0);

  // 款初/款当/产初/产当
  // 🛑 DB-02-F 修复：如果指定了经营单元，优先从该单元的配额（quotas）获取上限
  let initialRevCap = resource.initialRevenueCapacity !== undefined ? resource.initialRevenueCapacity : resource.revenueCapacity || 0;
  let initialValueCap = resource.initialValueCapacity !== undefined ? resource.initialValueCapacity : resource.valueCapacity || 0;
  let minedRevenue = resource.minedRevenue || 0;
  let minedValue = resource.minedValue || 0;

  if (centerId && resource.quotas && resource.quotas.length > 0) {
    const matchingQuotas = resource.quotas.filter(item => 
      centerMatch(item.centerId, centerId)
    );
    if (matchingQuotas.length > 0) {
      initialRevCap = matchingQuotas.reduce((sum, q) => sum + (q.revenueQuota || 0), 0);
      initialValueCap = matchingQuotas.reduce((sum, q) => sum + (q.valueQuota || 0), 0);
      // DB-02c-F: mined 也采用单元配额口径
      minedRevenue = matchingQuotas.reduce((sum, q) => sum + (q.minedRevenue || 0), 0);
      minedValue = matchingQuotas.reduce((sum, q) => sum + (q.minedValue || 0), 0);
    } else {
      // DB-01-GAP-F: 当矿有 quotas 但当前单元无条目时，回退为 0 (禁止回退整矿容量)
      initialRevCap = 0;
      initialValueCap = 0;
      minedRevenue = 0;
      minedValue = 0;
    }
  }

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

  const pendingValue = normLogs
    .filter(l => l.category === RefineCategory.Value && l.status === AuditStatus.Pending)
    .reduce((sum, l) => sum + getQuadrantLedgerAmount(l), 0);

  const confirmedValue = normLogs
    .filter(l => l.category === RefineCategory.Value && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved))
    .reduce((sum, l) => sum + getQuadrantLedgerAmount(l), 0);

  const unconfirmedValue = Math.max(0, valueCapacity - confirmedValue - pendingValue);

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
