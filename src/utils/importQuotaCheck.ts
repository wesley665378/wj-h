import { RefineCategory } from '../../types';
import { formatMoney } from './formatMoney';

/**
 * 单行折算函数：输入原始金额 rawAmount 与 类别/轨（收款/产值）转换为净值
 * - 收款 (Revenue): Math.round(rawAmount * 0.933)
 * - 产值 (Value): Math.round(rawAmount) (1:1，不乘 0.933)
 */
export function importNetAmount(
  rawAmount: number,
  categoryOrIsRevenue: RefineCategory | string | boolean = RefineCategory.Revenue
): number {
  const isRevenue =
    typeof categoryOrIsRevenue === 'boolean'
      ? categoryOrIsRevenue
      : categoryOrIsRevenue === RefineCategory.Revenue ||
        categoryOrIsRevenue === 'Revenue' ||
        categoryOrIsRevenue === '收款' ||
        categoryOrIsRevenue === '款初' ||
        categoryOrIsRevenue === '收款上限' ||
        categoryOrIsRevenue === '收款额度';
  const num = Number(rawAmount) || 0;
  return isRevenue ? Math.round(num * 0.933) : Math.round(num);
}

/**
 * 组级批量原始数值合计折算函数：
 * - 收款: Math.round(batchRawSum * 0.933)
 * - 产值: Math.round(batchRawSum)
 */
export function importBatchNetFromRawSum(
  batchRawSum: number,
  categoryOrIsRevenue: RefineCategory | string | boolean = RefineCategory.Revenue
): number {
  return importNetAmount(batchRawSum, categoryOrIsRevenue);
}

/**
 * 批量导入分组键生成：仅按“矿山编号 + 轨（收款/产值）”
 */
export function importGroupKey(
  miningId: string,
  categoryOrIsRevenue: RefineCategory | string | boolean
): string {
  const isRev =
    typeof categoryOrIsRevenue === 'boolean'
      ? categoryOrIsRevenue
      : categoryOrIsRevenue === RefineCategory.Revenue ||
        categoryOrIsRevenue === 'Revenue' ||
        categoryOrIsRevenue === '收款';
  return `${miningId.trim()}__${isRev ? 'REV' : 'VAL'}`;
}

/**
 * 矿山当前占用是否已达到或超过上限 (若 cap < 0 则表示无限额)
 */
export function importAlreadyAtOrOverLimit(currOcc: number, cap: number): boolean {
  if (cap < 0) return false;
  return Math.round(currOcc) >= Math.round(cap);
}

/**
 * 计算组级导入后的总占用 (全整数)
 */
export function importGroupPostOccupancy(currOcc: number, batchNet: number): number {
  return Math.round(currOcc) + Math.round(batchNet);
}

/**
 * 判断组级导入后是否超过矿山上限
 * 规则：净值 ≤ 上限 → 通过 (包括相等)；净值 > 上限 → 超限拦截
 */
export function importGroupQuotaExceeded(
  currOcc: number,
  batchNet: number,
  cap: number
): boolean {
  if (cap < 0) return false;
  return importGroupPostOccupancy(currOcc, batchNet) > Math.round(cap);
}

/**
 * 格式化超限失败原因文案（五段全整数，含超出数值）
 * 格式：占用将超过初限：当前 X，本批 Y，本批后 Z，上限 W，超出 E
 */
export function formatImportQuotaExceededReason(
  currOcc: number,
  postBatchOcc: number,
  cap: number,
  batchNet?: number
): string {
  const c = Math.round(currOcc);
  const p = Math.round(postBatchOcc);
  const limit = Math.round(cap);
  const net = batchNet !== undefined ? Math.round(batchNet) : Math.round(p - c);
  const excess = Math.max(0, p - limit);
  return `占用将超过初限：当前 ${formatMoney(c)}，本批 ${formatMoney(net)}，本批后 ${formatMoney(p)}，上限 ${formatMoney(limit)}，超出 ${formatMoney(excess)}`;
}

/**
 * 残差归集函数 (AB.5.6)
 * - 组内各行先使用 importNetAmount(rawAmount) 计算
 * - 组内行金额之和必须等于组净值 (batchNet = importBatchNetFromRawSum(ΣrawAmount, isRevenue))
 * - 末行吸收残差 (batchNet - 前N-1行合计)
 * - 禁止出现负数
 */
export function allocateImportRowAmounts(
  rawAmounts: number[],
  categoryOrIsRevenue: RefineCategory | string | boolean = RefineCategory.Revenue
): number[] {
  if (!rawAmounts || rawAmounts.length === 0) return [];
  const isRev =
    typeof categoryOrIsRevenue === 'boolean'
      ? categoryOrIsRevenue
      : categoryOrIsRevenue === RefineCategory.Revenue ||
        categoryOrIsRevenue === 'Revenue' ||
        categoryOrIsRevenue === '收款';

  if (rawAmounts.length === 1) {
    return [Math.max(0, importBatchNetFromRawSum(rawAmounts[0], isRev))];
  }

  const rawSum = rawAmounts.reduce((sum, r) => sum + (Number(r) || 0), 0);
  const batchNet = importBatchNetFromRawSum(rawSum, isRev);

  const result: number[] = [];
  let allocatedSum = 0;

  for (let i = 0; i < rawAmounts.length - 1; i++) {
    const rowNet = Math.max(0, importNetAmount(rawAmounts[i], isRev));
    result.push(rowNet);
    allocatedSum += rowNet;
  }

  // 末行吸收残差
  const lastRowAmount = batchNet - allocatedSum;
  if (lastRowAmount < 0) {
    // 保护性处理，若末行为负，将末行设为0，并向前借减保证总和等于 batchNet 且不出现负数
    result.push(0);
    let excess = -lastRowAmount;
    for (let i = result.length - 2; i >= 0 && excess > 0; i--) {
      const reducible = result[i];
      const reduce = Math.min(reducible, excess);
      result[i] -= reduce;
      excess -= reduce;
    }
  } else {
    result.push(lastRowAmount);
  }

  return result;
}
