import { ValueCreationLog } from '../types';

/**
 * 判定单条流水是否属于价值创造 (jzcz)
 * 口径：confirmationType 不是「手动确权」且不是「系统兜底确权」
 */
export function shouldPersistLogToJzcz(log?: ValueCreationLog | null): boolean {
  if (!log) return false;
  const cType = (log.confirmationType as string) || '';
  return cType !== '手动确权' && cType !== '系统兜底确权';
}

export function filterLogsForJzczSync(logs: ValueCreationLog[]): ValueCreationLog[] {
  if (!logs || !Array.isArray(logs)) return [];
  return logs.filter(shouldPersistLogToJzcz);
}
