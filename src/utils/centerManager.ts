import { User, Role } from '../types';

/**
 * SSOT 谓词：判断用户是否为经营单元负责人
 * 规则：
 * - 纳入：category 为 经管员高款专/经管员高产专，或 category 含「经管员」「经营单元管理员」
 * - 禁止：role===rank（一律 false）、离职、VP/NPC/系统管理员/经管员NPC/水库管理员
 * - 禁止：仅凭 初款专/高产专 等无「经管员」的 category
 */
export function isCenterManagerUser(user: User | null | undefined): boolean {
  if (!user) return false;

  // 1. 离职防护
  if (user.userStatus === 'inactive' || (user as any).status === 'inactive') return false;

  // 2. 经营单元负责人禁止 role = rank (一律 false)
  if (user.role === Role.Rank || (user.role as string) === 'rank') return false;

  const role = (user.role as string) || '';
  const category = (user.category as string) || '';

  // 3. 禁止：VP / NPC / 系统管理员 / 经管员NPC / 水库管理员 / reservoir_manager
  if (
    role === Role.NPC ||
    role === Role.npcxie ||
    role === (Role as any).VP ||
    role === 'vp' ||
    role === 'npc' ||
    role === 'reservoir_manager' || 
    category === 'VP' ||
    category === 'NPC' ||
    category === '系统管理员' ||
    category === '水库管理员' ||
    category === '经管员NPC'
  ) {
    return false;
  }

  // 4. 纳入条件：仅基于 category 明确标识
  const isManagerCategory =
    category === '经管员高款专' ||
    category === '经管员高产专' ||
    category === '经营单元管理员' ||
    category === '经管员';

  if (!isManagerCategory) {
    return false;
  }

  return true;
}

/**
 * 多负责人优先级排序：高款专 > 高产专 > 其它经管员；同级 userId/id 字典序最小
 */
export function getCenterManagerPriorityScore(user: User): number {
  const category = user.category || '';
  if (category === '经管员高款专' || (category.includes('经管员') && category.includes('款'))) {
    return 1;
  }
  if (category === '经管员高产专' || (category.includes('经管员') && category.includes('产'))) {
    return 2;
  }
  return 3;
}

export function sortCenterManagers(users: User[]): User[] {
  return [...users].sort((a, b) => {
    const scoreA = getCenterManagerPriorityScore(a);
    const scoreB = getCenterManagerPriorityScore(b);
    if (scoreA !== scoreB) {
      return scoreA - scoreB;
    }
    const idA = a.userId || a.id || '';
    const idB = b.userId || b.id || '';
    return idA.localeCompare(idB);
  });
}

export function findCenterManager(candidateUsers: User[]): User | null {
  const managers = candidateUsers.filter(isCenterManagerUser);
  if (managers.length === 0) return null;
  return sortCenterManagers(managers)[0];
}
