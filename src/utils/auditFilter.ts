import { ValueCreationLog, User, AuditStatus, RefineCategory, Role } from '../types';
import { isSystemAdmin } from './accessControl';
import { isDynamicCostLog } from './costCategory';
import { isLogInFilter, getLocalMonthString } from './dateUtils';

/**
 * 判断日志是否为【待确权的收款单据】
 */
export function isRevenuePendingLog(log: ValueCreationLog, user: User): boolean {
  if (!log || log.status !== AuditStatus.Pending) return false;
  if (log.category !== RefineCategory.Revenue || isDynamicCostLog(log)) return false;
  const isAdmin = isSystemAdmin(user);
  const isNpcxie = user.role === Role.npcxie;
  return isAdmin || isNpcxie;
}

/**
 * 判断日志是否为【待确权的动态消耗单据】
 */
export function isConsumptionPendingLog(log: ValueCreationLog): boolean {
  if (!log || log.status !== AuditStatus.Pending) return false;
  return isDynamicCostLog(log);
}

/**
 * 判断日志是否为【待确权的产值联动单据】（仅算 Pending 状态）
 */
export function isLinkedPendingLog(log: ValueCreationLog): boolean {
  if (!log || log.status !== AuditStatus.Pending) return false;
  return log.category === RefineCategory.Value && !isDynamicCostLog(log);
}

export interface AuditPendingCounts {
  pendingRevenueCount: number;
  pendingConsumptionCount: number;
  pendingLinkedCount: number;
  totalPendingCount: number;
}

/**
 * 统一计算价值确权（Audit）下的待办角标及各项待办统计
 */
export function calculateAuditPendingCounts(
  logs: ValueCreationLog[],
  user: User,
  month: string = getLocalMonthString(),
  startDate: string = '',
  endDate: string = ''
): AuditPendingCounts {
  let pendingRevenueCount = 0;
  let pendingConsumptionCount = 0;
  let pendingLinkedCount = 0;

  if (!logs || !logs.length || !user) {
    return {
      pendingRevenueCount: 0,
      pendingConsumptionCount: 0,
      pendingLinkedCount: 0,
      totalPendingCount: 0,
    };
  }

  for (const log of logs) {
    if (!log) continue;
    if (!isLogInFilter(log, month, startDate, endDate)) continue;

    if (isRevenuePendingLog(log, user)) {
      pendingRevenueCount++;
    } else if (isConsumptionPendingLog(log)) {
      pendingConsumptionCount++;
    } else if (isLinkedPendingLog(log)) {
      pendingLinkedCount++;
    }
  }

  return {
    pendingRevenueCount,
    pendingConsumptionCount,
    pendingLinkedCount,
    totalPendingCount: pendingRevenueCount + pendingConsumptionCount + pendingLinkedCount,
  };
}
