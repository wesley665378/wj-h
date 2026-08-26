import { User, MiningResource, ValueCreationLog, InternalTransaction } from '../../types';
import { isGlobalReader, parseCenterList } from './accessControl';

export { isSystemAdmin, isGlobalReader as isGlobalScope, isGlobalReader, isAdminOrNpc, parseCenterList } from './accessControl';

/**
 * 经营单元数据隔离及作用域过滤工具 (附录 D.7 / E′-0 / A′-7)
 */

export function centerMatch(centerA?: string | null, centerB?: string | null): boolean {
  if (!centerA || !centerB) return false;
  const listA = parseCenterList(centerA);
  const listB = parseCenterList(centerB);
  return listA.some(c => listB.includes(c));
}

/**
 * 按经营单元过滤用户列表
 */
export function filterUsersByCenter(users: User[], currentUser: User | null | undefined): User[] {
  if (!currentUser) return [];
  if (isGlobalReader(currentUser)) return users;
  const centers = parseCenterList(currentUser.center);
  if (centers.length === 0) return [];
  return users.filter(u => {
    if (isGlobalReader(u)) return true;
    const uCenters = parseCenterList(u.center);
    return uCenters.some(c => centers.includes(c));
  });
}

/**
 * 判断资源是否归属于特定经营单元（含多部门逗号/其他分隔符分隔，以及 VP 的多选单元）
 */
export function isResourceAssignedToCenter(resource: MiningResource, center: string | null | undefined): boolean {
  if (!center) return false;
  const targetCenters = parseCenterList(center);
  if (targetCenters.length === 0) return false;

  const match = (assigned?: string) => {
    if (!assigned) return false;
    const assignedList = parseCenterList(assigned);
    return targetCenters.some(tc => assignedList.includes(tc));
  };

  return match(resource.assignedTo) || match(resource.assignedToRevenue) || match(resource.assignedToValue);
}

/**
 * 按经营单元过滤矿山资源
 */
export function filterResourcesByCenter(resources: MiningResource[], currentUser: User | null | undefined): MiningResource[] {
  if (!currentUser) return [];
  if (isGlobalReader(currentUser)) return resources;
  const centers = parseCenterList(currentUser.center);
  if (centers.length === 0) return [];
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
  const centers = parseCenterList(currentUser.center);
  if (centers.length === 0) return [];
  
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
  const centers = parseCenterList(currentUser.center);
  if (centers.length === 0) return [];
  
  const userMap = new Map<string, User>(users.map(u => [u.id, u]));
  
  return transactions.filter(t => {
    const sender = userMap.get(t.senderId);
    const receiver = userMap.get(t.receiverId);
    
    const senderCenters = sender ? parseCenterList(sender.center) : [];
    const receiverCenters = receiver ? parseCenterList(receiver.center) : [];
    
    return senderCenters.some(c => centers.includes(c)) || receiverCenters.some(c => centers.includes(c));
  });
}
