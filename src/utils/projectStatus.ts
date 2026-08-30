import { MiningResource, ProjectStatus, ResourceStatus } from '../../types';

/**
 * 项目态公式 SSOT (前端第二道闸)
 * 对齐后端：settlementService
 */

export const ARCHIVE_IDLE_MS = 90 * 24 * 60 * 60 * 1000;
export const LIMIT_EPS = 0.5;

export interface AvailableQuota {
  revenueLimit: number;
  valueLimit: number;
  availableRevenue: number;
  availableValue: number;
  confirmedRevenue: number;
  confirmedValue: number;
  pendingRevenue: number;
  pendingValue: number;
  minedRevenue: number;
  minedValue: number;
}

export function getAvailableQuota(resource: MiningResource | null): AvailableQuota {
  if (!resource) {
    return {
      revenueLimit: 0,
      valueLimit: 0,
      availableRevenue: 0,
      availableValue: 0,
      confirmedRevenue: 0,
      confirmedValue: 0,
      pendingRevenue: 0,
      pendingValue: 0,
      minedRevenue: 0,
      minedValue: 0,
    };
  }

  const revenueLimit = Math.max(
    resource.revenueCapacity || 0,
    resource.initialRevenueCapacity || 0,
    resource.initialRevenueLimit || 0
  );
  const valueLimit = Math.max(
    resource.valueCapacity || 0,
    resource.initialValueCapacity || 0,
    resource.initialValueLimit || 0
  );

  const confirmedRevenue = resource.confirmedRevenue || 0;
  const confirmedValue = resource.confirmedValue || 0;
  const pendingRevenue = resource.pendingRevenue || 0;
  const pendingValue = resource.pendingValue || 0;
  const minedRevenue = resource.minedRevenue || 0;
  const minedValue = resource.minedValue || 0;

  return {
    revenueLimit: Math.round(revenueLimit),
    valueLimit: Math.round(valueLimit),
    confirmedRevenue: Math.round(confirmedRevenue),
    confirmedValue: Math.round(confirmedValue),
    pendingRevenue: Math.round(pendingRevenue),
    pendingValue: Math.round(pendingValue),
    minedRevenue: Math.round(minedRevenue),
    minedValue: Math.round(minedValue),
    availableRevenue: Math.round(Math.max(0, revenueLimit - confirmedRevenue - pendingRevenue - minedRevenue)),
    availableValue: Math.round(Math.max(0, valueLimit - confirmedValue - pendingValue - minedValue)),
  };
}

export function getAvailableQuotaMin(resource: MiningResource | null): number {
  const quota = getAvailableQuota(resource);
  return Math.min(quota.availableRevenue, quota.availableValue);
}

export function isMineralCapReached(resource: MiningResource | null): boolean {
  if (!resource) return false;
  
  const quota = getAvailableQuota(resource);
  
  // 须两限 > 0
  if (quota.revenueLimit <= 0 || quota.valueLimit <= 0) return false;

  // 两限相等
  if (Math.abs(quota.revenueLimit - quota.valueLimit) > LIMIT_EPS) return false;

  // confirmed ≈ 限
  const isRevCapped = Math.abs(quota.confirmedRevenue - quota.revenueLimit) <= LIMIT_EPS;
  const isValCapped = Math.abs(quota.confirmedValue - quota.valueLimit) <= LIMIT_EPS;

  // pending ≈ 0
  const isPendingEmpty = quota.pendingRevenue <= LIMIT_EPS && quota.pendingValue <= LIMIT_EPS;

  return isRevCapped && isValCapped && isPendingEmpty;
}

export function isMineralArchived(resource: MiningResource | null): boolean {
  if (!resource) return false;
  return (resource.lifecycleStatus || '').toLowerCase() === 'archived';
}

export function toReachedMs(resource: MiningResource | null): number {
  if (!resource) return 0;
  if (resource.reachedDate) {
    const time = new Date(resource.reachedDate).getTime();
    if (time > 0 && !isNaN(time)) {
      return time;
    }
  }
  if (resource.cappedAt && resource.cappedAt > 0) {
    return resource.cappedAt;
  }
  return 0;
}

export function getSettlingDaysLeft(resource: MiningResource | null): number {
  const reachedMs = toReachedMs(resource);
  if (reachedMs <= 0) return 90;
  const now = Date.now();
  const diffMs = now - reachedMs;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, 90 - diffDays);
}

export function deriveProjectStatus(resource?: MiningResource | null): { status: ProjectStatus; remainingDays?: number } {
  if (!resource) {
    return { status: ProjectStatus.InProgress };
  }

  const lifecycle = (resource.lifecycleStatus || '').toLowerCase();
  
  if (lifecycle === 'archived' || isMineralArchived(resource)) {
    return { status: ProjectStatus.Archived };
  }

  const reachedMs = toReachedMs(resource);
  const isCapped = isMineralCapReached(resource) && reachedMs > 0;

  if (lifecycle === 'settling' || isCapped) {
    return { 
       status: ProjectStatus.Capping, 
       remainingDays: getSettlingDaysLeft(resource) 
     };
  }

  return { status: ProjectStatus.InProgress };
}

export function isProjectWritable(resource?: MiningResource | null): boolean {
  if (!resource) return false;
  const { status } = deriveProjectStatus(resource);
  return status === ProjectStatus.InProgress;
}
