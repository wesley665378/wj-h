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

/**
 * 导出权限关闭时的通用悬停提示文案 (SSOT)
 */
export const EXPORT_DISABLED_TOOLTIP = '管理员已关闭导出功能';

/**
 * 判断当前用户是否具备导出 Excel 权限
 * 
 * 权限规则 (SSOT):
 * 1. Admin/npcxie 不受开关限制，始终可导出 (返回 true)。
 * 2. 普通账号（非 Admin/npcxie）：
 *    - 当 exportEnabled 开关显式设为 false 时：返回 false（按钮置灰禁用，悬停显示「管理员已关闭导出功能」）
 *    - 当 exportEnabled 开关为 true 或未配置时：默认返回 true（允许正常导出）
 * 
 * @param user 当前登录用户
 * @param configOrEnabled 系统配置对象、布尔值或 undefined
 * @returns boolean 是否允许导出
 */
export const canExportExcel = (
  user: User | null | undefined,
  configOrEnabled?: { exportEnabled?: boolean; [key: string]: any } | boolean | null
): boolean => {
  if (!user) return false;

  // 1. Admin / npcxie 不受开关限制，始终可导出
  if (isAdminOrNpc(user) || isSystemAdmin(user)) {
    return true;
  }

  // 2. 普通账号：检查开关状态
  if (typeof configOrEnabled === 'boolean') {
    return configOrEnabled;
  }

  if (configOrEnabled && typeof configOrEnabled === 'object') {
    if (typeof configOrEnabled.exportEnabled === 'boolean') {
      return configOrEnabled.exportEnabled;
    }
  }

  // 默认开启
  return true;
};

/**
 * 统一获取导出按钮的 title 属性 (悬停提示)
 * @param canExport 是否有导出权限
 * @param defaultTitle 正常状态下的默认提示
 */
export const getExportButtonTitle = (
  canExport: boolean,
  defaultTitle: string = '导出 EXCEL'
): string => {
  if (!canExport) {
    return EXPORT_DISABLED_TOOLTIP;
  }
  return defaultTitle;
};

