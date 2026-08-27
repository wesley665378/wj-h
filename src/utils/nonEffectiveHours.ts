import { ValueCreationLog } from '../types';
import { isNonEffectiveHoursEffective } from './employmentStatus';

export function getNonEffectiveHoursDeduction(log: ValueCreationLog): number {
  if (!isNonEffectiveHoursEffective(log)) return 0;
  const v = (log as any).verifiedAmount;
  if (v != null && Number(v) > 0) return Number(v);
  if (log.dynamicCost > 0) return log.dynamicCost;
  return Math.abs(Number(log.netValue) || 0);
}
