/**
 * 经营单元名称规范化与比较工具 (SSOT)
 */

export function canonicalizeBusinessUnitLabel(raw: string | undefined | null): string {
  if (!raw) return '';
  let s = raw.trim();
  if (!s) return '';
  // 统一括号为半角
  s = s.replace(/（/g, '(').replace(/）/g, ')');
  // 规整 "(前台)" / "(后台)" 前后的空格
  s = s.replace(/\s*\(\s*(前台|后台)\s*\)/gi, ' ($1)');
  return s;
}

export function businessUnitBaseKey(raw: string | undefined | null): string {
  if (!raw) return '';
  const s = canonicalizeBusinessUnitLabel(raw);
  // 去除 (前台) 或 (后台) 后的基名，转大写方便匹配
  return s.replace(/\s*\(\s*(前台|后台)\s*\)/gi, '').trim().toUpperCase();
}

export function businessUnitLabelsEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  const ca = canonicalizeBusinessUnitLabel(a);
  const cb = canonicalizeBusinessUnitLabel(b);
  if (!ca && !cb) return true;
  if (!ca || !cb) return false;
  return ca.toUpperCase() === cb.toUpperCase();
}

export function businessUnitListHas(list: string[] = [], target: string | undefined | null): boolean {
  if (!target) return false;
  const cTarget = canonicalizeBusinessUnitLabel(target);
  return list.some(u => businessUnitLabelsEqual(u, cTarget));
}

export function removeBusinessUnitFromList(list: string[] = [], unitToRemove: string | undefined | null): string[] {
  if (!unitToRemove) return list;
  return list.filter(u => !businessUnitLabelsEqual(u, unitToRemove));
}

/**
 * 判断用户 center 是否匹配给定的经营单元
 */
export function userCenterMatchesBusinessUnit(userCenter: string | undefined | null, unitName: string | undefined | null): boolean {
  if (!userCenter || !unitName) return false;
  return businessUnitLabelsEqual(userCenter, unitName) || businessUnitBaseKey(userCenter) === businessUnitBaseKey(unitName);
}

/**
 * 将用户输入/Excel 原文解析为 units 中已有规范名；
 * 若无匹配则返回 canonicalizeBusinessUnitLabel(raw) 作为新名。
 */
export function resolveBusinessUnitName(
  raw: string | undefined | null,
  existingUnits: string[] = [],
): string {
  const canonical = canonicalizeBusinessUnitLabel(raw);
  if (!canonical) return '';

  const list = existingUnits ?? [];
  // 1. 规范名完全一致
  const exact = list.find((u) => businessUnitLabelsEqual(u, canonical));
  if (exact) return canonicalizeBusinessUnitLabel(exact);

  // 2. 基名一致（如 Excel「YJ」→ 列表已有「YJ (前台)」）
  const base = businessUnitBaseKey(canonical);
  const byBase = list.find((u) => businessUnitBaseKey(u) === base);
  if (byBase) return canonicalizeBusinessUnitLabel(byBase);

  return canonical;
}
