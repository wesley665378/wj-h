import { isDynamicCostLog } from './costCategory';

export { roundMoney, formatMoney, formatAmount, formatCurrency, roundRatio, formatRatio, formatPercent } from './formatMoney';

/**
 * 统一确权类型展示格式化：
 * 1. 手动确权 → 消耗确权（仅展示；落库/过滤仍用 confirmationType === '手动确权'）
 * 2. 联动确权 / 历史自动确权 → 联动确权
 * 3. 收款确权 → 收款确权
 * 统一入口，禁止各处手写 if。
 */
export function formatConfirmationType(
  confirmationTypeOrLog?: string | null | Record<string, any>,
  options?: {
    category?: string;
    dynamicCost?: number;
    isRevenue?: boolean;
    isDynamicCost?: boolean;
  }
): string {
  let confirmationType: string | null | undefined;
  let category: string | undefined = options?.category;
  let dynamicCost: number | undefined = options?.dynamicCost;
  let isRevenue: boolean | undefined = options?.isRevenue;
  let isDynamicCost: boolean | undefined = options?.isDynamicCost;

  if (typeof confirmationTypeOrLog === 'object' && confirmationTypeOrLog !== null) {
    const log = confirmationTypeOrLog;
    confirmationType = log.confirmationType;
    category = category ?? log.category;
    dynamicCost = dynamicCost ?? log.dynamicCost;
    if (isDynamicCost === undefined) {
      isDynamicCost = isDynamicCostLog(log as any);
    }
  } else if (typeof confirmationTypeOrLog === 'string') {
    confirmationType = confirmationTypeOrLog;
  }

  // 1. 手动确权 / 消耗确权 / 动态消耗类流水（或明确指定 isDynamicCost / 含有 dynamicCost > 0）
  if (
    confirmationType === '手动确权' ||
    confirmationType === '消耗确权' ||
    isDynamicCost ||
    (dynamicCost !== undefined && dynamicCost > 0)
  ) {
    return '消耗确权';
  }

  // 2. 联动确权（包含历史自动确权、产值类单据）
  if (
    confirmationType === '自动确权' ||
    confirmationType === '联动确权' ||
    confirmationType === '联动' ||
    category === 'Value' ||
    category === '产值'
  ) {
    return '联动确权';
  }

  // 3. 收款确权（包含收款类单据、options.isRevenue）
  if (
    confirmationType === '收款确权' ||
    isRevenue ||
    category === 'Revenue' ||
    category === '收款'
  ) {
    return '收款确权';
  }

  if (confirmationType) {
    return confirmationType;
  }

  return '联动确权';
}

