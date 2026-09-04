import { ValueCreationLog, AuditStatus } from '../types';

export type DynamicCostCategory = 'A' | 'B1' | 'B2' | 'C' | 'D';

export const DYNAMIC_COST_CATEGORY_META: Record<
  DynamicCostCategory,
  { label: string; desc: string; color: string; bg: string; border: string; text: string }
> = {
  A: {
    label: 'A类 · 款专类报销',
    desc: '款专类报销 · 精准定位采集主体',
    color: '#1a56db',
    bg: 'bg-blue-50/60',
    border: 'border-blue-200',
    text: 'text-blue-700',
  },
  B1: {
    label: 'B1类 · 产专类报销',
    desc: '产专类报销 · 精准定位采集主体',
    color: '#0284c7',
    bg: 'bg-sky-50/60',
    border: 'border-sky-200',
    text: 'text-sky-700',
  },
  B2: {
    label: 'B2类 · 产专运维消耗',
    desc: '产专类项目运维消耗 · 自动对冲已确权产值',
    color: '#059669',
    bg: 'bg-emerald-50/60',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
  },
  C: {
    label: 'C类 · C类对冲',
    desc: '跨单元/指定矿山对冲消耗',
    color: '#d97706',
    bg: 'bg-amber-50/60',
    border: 'border-amber-200',
    text: 'text-amber-700',
  },
  D: {
    label: 'D类 · 经营单元公摊',
    desc: '经营单元公摊，按实际发生月人员平均分摊',
    color: '#dc2626',
    bg: 'bg-rose-50/60',
    border: 'border-rose-200',
    text: 'text-rose-700',
  },
};

/**
 * 判定单条流水是否属于动态消耗侧流水
 * 判定满足任一即可：
 * 1. confirmationType === '手动确权'
 * 2. 或存在 costCategory (且属于成本分类)
 * 3. 或存在 consumptionType (若字段有值)
 */
export function isDynamicCostLog(log?: ValueCreationLog | null): boolean {
  if (!log) return false;
  if (log.confirmationType === '手动确权') return true;
  if (Boolean((log as any).consumptionType)) return true;
  if (log.costCategory && ['A', 'B', 'C', 'D'].includes(log.costCategory)) return true;
  return false;
}

/**
 * 判定动态消耗五类（与动态消耗页同构，禁止自造第六类）
 * A: costCategory === 'A'
 * B1: costCategory === 'B' && valueConsumptionMode === 'B1' (缺少 valueConsumptionMode 时默认归入 B1)
 * B2: costCategory === 'B' && valueConsumptionMode === 'B2'
 * C: costCategory === 'C'
 * D: costCategory === 'D'
 * 非消耗行、无 costCategory 的创造流水返回 null
 */
export function resolveDynamicCostCategory(log?: ValueCreationLog | null): DynamicCostCategory | null {
  if (!log) return null;
  if (!isDynamicCostLog(log)) return null;

  const costCat = log.costCategory;
  if (costCat === 'A') return 'A';
  if (costCat === 'B') {
    if (log.valueConsumptionMode === 'B2') return 'B2';
    // costCategory === 'B' 缺少 valueConsumptionMode 时归入 B1 并全页一致
    return 'B1';
  }
  if (costCat === 'C') return 'C';
  if (costCat === 'D') return 'D';

  return null;
}

/**
 * 动态消耗侧状态判定：
 * 状态默认只计已确权 (AuditStatus.Confirmed / '已确权')；
 * 若入库 (AuditStatus.Approved / '入库') 也算成本侧已落地，与动态消耗列表已有口径对齐
 */
export function isDynamicCostConfirmedOrApproved(status: any): boolean {
  return (
    status === AuditStatus.Confirmed ||
    status === AuditStatus.Approved ||
    status === '已确权' ||
    status === '入库'
  );
}

/**
 * 获取单笔消耗金额：Math.round(Number(dynamicCost) || 0) 的绝对值
 */
export function getDynamicCostAmount(log?: ValueCreationLog | null): number {
  if (!log) return 0;
  return Math.abs(Math.round(Number(log.dynamicCost) || 0));
}

