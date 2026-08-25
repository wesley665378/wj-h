import { User, MiningResource, ValueCreationLog, InternalTransaction } from '../../types';
import { isGlobalReader } from './accessControl';

export { isSystemAdmin, isGlobalReader as isGlobalScope, isGlobalReader, isAdminOrNpc } from './accessControl';

/**
 * 经营单元数据隔离及作用域过滤工具 (附录 D.7 / E′-0 / A′-7)
 */

/**
 * 按经营单元过滤用户列表
 */
export function filterUsersByCenter(users: User[], currentUser: User | null | undefined): User[] {
  if (!currentUser) return [];
  if (isGlobalReader(currentUser)) return users;
  return users.filter(u => u.center === currentUser.center || isGlobalReader(u));
}

/**
 * 判断资源是否归属于特定经营单元（含多部门逗号分隔）
 */
export function isResourceAssignedToCenter(resource: MiningResource, center: string): boolean {
  if (!center) return false;
  const match = (assigned?: string) => {
    if (!assigned) return false;
    return assigned.split(',').map(c => c.trim()).includes(center);
  };
  return match(resource.assignedTo) || match(resource.assignedToRevenue) || match(resource.assignedToValue);
}

/**
 * 按经营单元过滤矿山资源
 */
export function filterResourcesByCenter(resources: MiningResource[], currentUser: User | null | undefined): MiningResource[] {
  if (!currentUser) return [];
  if (isGlobalReader(currentUser)) return resources;
  if (!currentUser.center) return [];
  return resources.filter(r => isResourceAssignedToCenter(r, currentUser.center));
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
    const resource = resources.find(r => r.id === l.miningId);
    if (!resource) return false;
    return isResourceAssignedToCenter(resource, currentUser.center);
  });
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
  
  const centerUserIds = new Set(users.filter(u => u.center === currentUser.center).map(u => u.id));
  return transactions.filter(t => centerUserIds.has(t.senderId) || centerUserIds.has(t.receiverId));
}
