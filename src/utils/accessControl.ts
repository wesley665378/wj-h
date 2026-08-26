import { User, Role } from '../../types';

export const parseCenterList = (center: string | null | undefined): string[] => {
  if (!center) return [];
  let cleaned = String(center).trim();
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return Array.from(new Set(parsed.flatMap(p => parseCenterList(String(p))).filter(Boolean)));
      }
    } catch {
      cleaned = cleaned.slice(1, -1);
    }
  }
  const parts = cleaned.split(/[,，;；、]/);
  return Array.from(
    new Set(
      parts
        .map(p => p.trim().replace(/^['"\[\]]+|['"\[\]]+$/g, '').trim())
        .filter(p => p.length > 0)
    )
  );
};

/**
 * 经营单元主数据写权限、删矿、人事高危操作 (系统管理员 SSOT)
 * 判定范围：Role.Admin 或 category === '系统管理员'。但 VP 即使历史 role=admin 也禁止写。
 */
export const isSystemAdmin = (user: User | null | undefined): boolean => {
  if (!user) return false;
  if (user.category === 'VP') return false;
  return user.role === Role.Admin || user.category === '系统管理员' || user.category?.toLowerCase() === '系统管理员';
};

/**
 * 全盘只读权限 (读全盘)
 * 判定范围：Admin、npcxie、系统管理员 (去掉了 VP)
 */
export const isGlobalReader = (user: User | null | undefined): boolean => {
  if (!user) return false;
  if (user.category === 'VP') return false;
  return user.role === Role.Admin || 
         user.role === Role.npcxie || 
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

/**
 * 兼容别名：读全盘范围判定
 */
export const isGlobalScope = isGlobalReader;

