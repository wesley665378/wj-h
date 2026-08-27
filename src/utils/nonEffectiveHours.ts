import { ValueCreationLog, RefineType } from '../types';
import { isNonEffectiveHoursEffective } from './employmentStatus';

export function getNonEffectiveHoursDeduction(log: ValueCreationLog): number {
  const isTypeMatch = log.type === RefineType.NonEffectiveHours || (log.type as any) === '非有效工时对冲' || (log.type as any) === 'NonEffectiveHours';
  if (!isTypeMatch) return 0;
  
  const v = (log as any).verifiedAmount;
  if (v != null && Number(v) > 0) return Number(v);
  if (log.dynamicCost > 0) return log.dynamicCost;
  return Math.abs(Number(log.netValue) || 0);
}
