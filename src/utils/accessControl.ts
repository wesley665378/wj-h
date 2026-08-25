import { User, Role } from '../../types';

/**
 * 经营单元主数据写权限、删矿、人事高危操作 (系统管理员 SSOT)
 * 判定范围：Role.Admin 或 category === '系统管理员'
 */
export const isSystemAdmin = (user: User | null | undefined): boolean => {
  if (!user) return false;
  return user.role === Role.Admin || user.category === '系统管理员' || user.category?.toLowerCase() === '系统管理员';
};

/**
 * 全盘只读权限 (读全盘)
 * 判定范围：Admin、npcxie、VP、系统管理员
 */
export const isGlobalReader = (user: User | null | undefined): boolean => {
  if (!user) return false;
  return user.role === Role.Admin || 
         user.role === Role.npcxie || 
         user.category === 'VP' || 
         user.category === '系统管理员' ||
         user.category?.toLowerCase() === '系统管理员';
};

/**
 * 侧栏水库、会务留样等全局管理读权限
 * 判定范围：Admin 或 npcxie
 */
export const isAdminOrNpc = (user: User | null | undefined): boolean => {
  if (!user) return false;
  return user.role === Role.Admin || user.role === Role.npcxie;
};

