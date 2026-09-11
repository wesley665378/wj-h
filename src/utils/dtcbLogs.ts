import { ValueCreationLog, RefineType } from '../types';

/**
 * 判定单条流水是否属于动态消耗 (dtcb)
 * 口径：confirmationType==='手动确权' 且 (dynamicCost>0 或 type 为非有效工时对冲)。
 * D 类有 dynamicCost 的仍进 dtcb。禁止把落库改成「消耗确权」
 */
export function shouldPersistLogToDtcb(log?: ValueCreationLog | null): boolean {
  if (!log) return false;
  if (log.confirmationType !== '手动确权') return false;
  const cost = Number(log.dynamicCost) || 0;
  const isNonEffective =
    log.type === RefineType.NonEffectiveHours ||
    (log.type as any) === 'NonEffectiveHours' ||
    (log.type as any) === '非有效工时' ||
    (log.type as any) === '非有效工时对冲';
  return cost > 0 || isNonEffective;
}

export function filterLogsForDtcbSync(logs: ValueCreationLog[]): ValueCreationLog[] {
  if (!logs || !Array.isArray(logs)) return [];
  return logs.filter(shouldPersistLogToDtcb);
}
