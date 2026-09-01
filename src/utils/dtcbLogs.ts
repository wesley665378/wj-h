import { ValueCreationLog } from '../types';

/**
 * 判定单条流水是否属于动态消耗 (dtcb)
 * 口径：仅动态消耗，confirmationType === '手动确权'
 */
export function shouldPersistLogToDtcb(log?: ValueCreationLog | null): boolean {
  if (!log) return false;
  return log.confirmationType === '手动确权';
}

export function filterLogsForDtcbSync(logs: ValueCreationLog[]): ValueCreationLog[] {
  if (!logs || !Array.isArray(logs)) return [];
  return logs.filter(shouldPersistLogToDtcb);
}
