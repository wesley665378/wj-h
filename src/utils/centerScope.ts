import { User, MiningResource, ValueCreationLog, InternalTransaction } from '../../types';
import { isGlobalReader, parseCenterList } from './accessControl';
import { isVirtualDeductionMiningId } from './virtualDeduction';
import { userCenterMatchesBusinessUnit } from './businessUnitName';

export { isSystemAdmin, isGlobalReader as isGlobalScope, isGlobalReader, isAdminOrNpc, parseCenterList } from './accessControl';
export { isCenterManagerUser, sortCenterManagers, findCenterManager } from './centerManager';

/**
 * 经营单元数据隔离及作用域过滤工具 (附录 D.7 / E′-0 / A′-7)
 */

export function centerMatch(centerA?: string | null, centerB?: string | null): boolean {
  if (!centerA || !centerB) return false;
  const listA = parseCenterList(centerA);
  const listB = parseCenterList(centerB);
  return listA.some(a => listB.some(b => userCenterMatchesBusinessUnit(a, b)));
}

/**
 * 按经营单元过滤用户列表
 */
export function filterUsersByCenter(users: User[], currentUser: User | null | undefined): User[] {
  if (!currentUser) return [];
  if (isGlobalReader(currentUser)) return users;
  if (!currentUser.center) return [];
  return users.filter(u => {
    if (isGlobalReader(u)) return true;
    return centerMatch(u.center, currentUser.center);
  });
}

/**
 * 判断资源是否归属于特定经营单元（含多部门逗号/其他分隔符分隔，以及 VP 的多选单元，支持基名模糊匹配）
 */
export function isResourceAssignedToCenter(resource: MiningResource, center: string | null | undefined): boolean {
  if (!center) return false;
  const assignedMatch = centerMatch(resource.assignedTo, center) || 
         centerMatch(resource.assignedToRevenue, center) || 
         centerMatch(resource.assignedToValue, center);
  
  if (assignedMatch) return true;

  if (resource.quotas && resource.quotas.length > 0) {
    return resource.quotas.some(q => centerMatch(q.centerId, center));
  }
  
  return false;
}

/**
 * 按经营单元过滤矿山资源（禁止为 FXDC 等虚拟占位矿山建主档）
 */
export function filterResourcesByCenter(resources: MiningResource[], currentUser: User | null | undefined): MiningResource[] {
  if (!currentUser) return [];
  const validResources = (resources || []).filter(r => r && !isVirtualDeductionMiningId(r.id));
  if (isGlobalReader(currentUser)) return validResources;
  if (!currentUser.center) return [];
  return validResources.filter(r => isResourceAssignedToCenter(r, currentUser.center));
}

/**
 * 按经营单元过滤日志数据 (仅 jzcz)
 */
export function filterLogsByCenter(
  logs: ValueCreationLog[],
  resources: MiningResource[],
  currentUser: User | null | undefined
): ValueCreationLog[] {
  if (!currentUser) return [];
  if (isGlobalReader(currentUser)) return logs;
  if (!currentUser.center) return [];
  
  return logs.filter(l => {
    if (!l) return false;
    if (isVirtualDeductionMiningId(l.miningId)) return false; // jzcz 不含 FXDC 类虚拟对冲流水
    const resource = resources.find(r => r.id === l.miningId);
    if (!resource) return false;
    return isResourceAssignedToCenter(resource, currentUser.center);
  });
}

/**
 * 判断单条日志的人员归属 (recordedCollectorId / rankId) 或矿山资源归属是否属于本经营单元
 */
export function isLogLinkedToCenterUser(
  log: ValueCreationLog | null | undefined,
  centerUserIds: Set<string>,
  resources: MiningResource[] = [],
  userCenter?: string
): boolean {
  if (!log) return false;

  // 1. 虚拟占位矿山流水 (FXDC / SYSTEM_DEDUCTION): 仅按人员归属
  if (isVirtualDeductionMiningId(log.miningId)) {
    if (log.recordedCollectorId && centerUserIds?.has(log.recordedCollectorId)) return true;
    if (log.rankId && centerUserIds?.has(log.rankId)) return true;
    return false;
  }

  // 2. 常规流水: 检查人员归属 OR 矿山资源归属
  if (log.recordedCollectorId && centerUserIds?.has(log.recordedCollectorId)) return true;
  if (log.rankId && centerUserIds?.has(log.rankId)) return true;
  if (log.miningId && resources.length > 0 && userCenter) {
    const resource = resources.find(r => r.id === log.miningId);
    if (resource && isResourceAssignedToCenter(resource, userCenter)) return true;
  }
  return false;
}

/**
 * dtcb / auditLogs 收窄：必须用 filterAuditLogsByCenter（人员归属优先），禁止对 FXDC 类流水用纯 filterLogsByCenter
 */
export function filterAuditLogsByCenter(
  logs: ValueCreationLog[],
  resources: MiningResource[],
  currentUser: User | null | undefined,
  users: User[] = []
): ValueCreationLog[] {
  if (!currentUser) return [];
  if (isGlobalReader(currentUser)) return logs;
  if (!currentUser.center) return [];

  const centerUserIds = new Set<string>();
  users.filter(u => {
    if (!u) return false;
    return centerMatch(u.center, currentUser.center);
  }).forEach(u => {
    if (u.id) centerUserIds.add(u.id);
    if (u.userId) centerUserIds.add(u.userId);
  });
  if (currentUser.id) centerUserIds.add(currentUser.id);
  if (currentUser.userId) centerUserIds.add(currentUser.userId);

  return (logs || []).filter(l => isLogLinkedToCenterUser(l, centerUserIds, resources, currentUser.center));
}

/**
 * 按经营单元过滤内部交易数据
 */
export function filterTransactionsByCenter(
  transactions: InternalTransaction[],
  currentUser: User | null | undefined,
  users: User[] = []
): InternalTransaction[] {
  if (!currentUser) return [];
  if (isGlobalReader(currentUser)) return transactions;
  if (!currentUser.center) return [];
  
  const userMap = new Map<string, User>(users.map(u => [u.id, u]));
  
  return transactions.filter(t => {
    const sender = userMap.get(t.senderId);
    const receiver = userMap.get(t.receiverId);
    
    return centerMatch(sender?.center, currentUser.center) || centerMatch(receiver?.center, currentUser.center);
  });
}
