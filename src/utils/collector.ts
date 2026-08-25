import { SYS_C, SYS_B2, LEGACY_SYSTEM_B2 } from '../constants/systemCollectors';
import { User } from '../../types';

/** 展示归一：旧 SYSTEM_B2 → SYS_B2；禁止再出现 sys_B2 */
export function formatCollectorDisplay(id: string | undefined, users: User[]): string {
  if (!id) return '-';
  if (id === LEGACY_SYSTEM_B2 || id === SYS_B2) return SYS_B2;
  if (id === SYS_C) return SYS_C;
  // 可选：兼容脏数据小写
  if (id === 'sys_B2' || id === 'sys_C') return id === 'sys_B2' ? SYS_B2 : SYS_C;
  return users.find(u => u.id === id)?.name || id;
}

/** 提交时解析写侧采集码 */
export function resolveSystemCollectorIdForWrite(opts: {
  costCategory?: string;
  valueConsumptionMode?: string;
  recordedCollectorId?: string;
}): string {
  if (opts.costCategory === 'C') return SYS_C;
  if (opts.costCategory === 'B' && opts.valueConsumptionMode === 'B2') return SYS_B2;
  return opts.recordedCollectorId || '';
}
