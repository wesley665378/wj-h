import { MiningResource, ProjectStatus, ResourceStatus } from '../../types';

/**
 * 项目态公式 SSOT (前端第二道闸)
 * 对齐后端：settlementService
 * 禁止写 99% 触顶规则
 */

export const ARCHIVE_IDLE_MS = 90 * 24 * 60 * 60 * 1000;
const LIMIT_EPS = 0.5;

export function getAvailableQuota(resource: MiningResource | null): number {
  if (!resource) return 0;
  const revCap = resource.revenueCapacity || 0;
  const valCap = resource.valueCapacity || 0;
  const confirmedRev = resource.confirmedRevenue || 0;
  const confirmedVal = resource.confirmedValue || 0;
  const pendingRev = resource.pendingRevenue || 0;
  const pendingVal = resource.pendingValue || 0;
  return Math.min(Math.max(0, revCap - confirmedRev - pendingRev), Math.max(0, valCap - confirmedVal - pendingVal));
}

export function isMineralCapReached(resource: MiningResource | null): boolean {
  if (!resource) return false;
  
  const revCap = resource.revenueCapacity || 0;
  const valCap = resource.valueCapacity || 0;
  const confirmedRev = resource.confirmedRevenue || 0;
  const confirmedVal = resource.confirmedValue || 0;
  const pendingRev = resource.pendingRevenue || 0;
  const pendingVal = resource.pendingValue || 0;

  // 两初限相等
  if (Math.abs(revCap - valCap) > LIMIT_EPS) return false;

  const isRevCapped = Math.abs(confirmedRev - revCap) <= LIMIT_EPS && pendingRev <= LIMIT_EPS;
  const isValCapped = Math.abs(confirmedVal - valCap) <= LIMIT_EPS && pendingVal <= LIMIT_EPS;

  return isRevCapped && isValCapped;
}

export function isMineralArchived(resource: MiningResource | null): boolean {
  if (!resource) return true;
  return (resource.lifecycleStatus || '').toLowerCase() === 'archived';
}

export function toReachedMs(resource: MiningResource | null): number {
  if (!resource) return 0;
  if (resource.cappedAt && resource.cappedAt > 0) {
    return resource.cappedAt;
  }
  if (resource.reachedDate) {
    const time = new Date(resource.reachedDate).getTime();
    if (time > 0 && !isNaN(time)) {
      return time;
    }
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
    return { status: ProjectStatus.Archived };
  }

  if (isMineralArchived(resource)) {
    return { status: ProjectStatus.Archived };
  }

  const reachedMs = toReachedMs(resource);
  const isCapped = isMineralCapReached(resource) && reachedMs > 0;
  const isStockIn = resource.status === ResourceStatus.StockIn;

  if (isCapped || isStockIn) {
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
