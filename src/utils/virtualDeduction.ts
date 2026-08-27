/**
 * 占位矿山编号 SSOT：FXDC（历史 SYSTEM_DEDUCTION 读库须兼容，统一用 isVirtualDeductionMiningId 判断）
 */
export function isVirtualDeductionMiningId(miningId?: string | null): boolean {
  if (!miningId) return false;
  const upper = miningId.toUpperCase().trim();
  return upper === 'FXDC' || upper === 'SYSTEM_DEDUCTION' || upper.includes('DEDUCTION') || upper.includes('FXDC');
}
