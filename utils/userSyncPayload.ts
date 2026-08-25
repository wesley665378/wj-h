import { User } from '../types';

/**
 * 经营单元归属名称规整
 */
export function normalizeCenter(center?: string | null): string {
  if (!center || typeof center !== 'string') return '';
  return center.trim();
}

/**
 * 用户同步载荷脱敏与清洗 (附录 D.6.3.1)
 * 
 * 规则：
 * 1. 默认剔除 password 敏感明文字段，防止在工作区同步和网络传输中泄漏。
 * 2. 仅在明确指定 opts.includePassword === true (如初始同步或用户首次创建) 时保留。
 * 3. 规整 center 经营单元名称。
 */
export function pickUserForWorkspaceSync(
  user: User | any,
  opts?: { includePassword?: boolean }
): User {
  if (!user) return user;

  const sanitized: any = {
    id: user.id,
    name: user.name,
    userId: user.userId,
    avatar: user.avatar,
    role: user.role,
    center: normalizeCenter(user.center),
    category: user.category,
    secondaryRoles: user.secondaryRoles,
    salaryPackageType: user.salaryPackageType,
    salaryPackage: user.salaryPackage,
    salaryHistory: user.salaryHistory,
    permissions: user.permissions,
    userStatus: user.userStatus,
    mustChangePassword: user.mustChangePassword,
    isFirstLogin: user.isFirstLogin,
    resignDate: user.resignDate,
  };

  // 严格遵守 D.6.3.1：仅在明确配置允许包含密码时携带
  if (opts?.includePassword && user.password) {
    sanitized.password = user.password;
  }

  return sanitized as User;
}

/**
 * 批量脱敏用户列表（剥除密码字段）
 */
export function stripUsersPasswords(users: (User | any)[]): any[] {
  if (!Array.isArray(users)) return [];
  return users.map(u => {
    if (!u) return u;
    const { password, ...rest } = u;
    return rest;
  });
}

/**
 * 客户端下发用户清洗
 */
export function sanitizeUserForClient(user: User): Omit<User, 'password'> {
  const { password, ...rest } = user;
  return rest;
}
