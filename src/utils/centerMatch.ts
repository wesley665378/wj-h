/**
 * 经营单元名称底层匹配与规整工具 (大写 + trim)
 */

export function normalizeCenter(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw.trim().toUpperCase();
}

export function normalizeCenterList(list: (string | undefined | null)[] = []): string[] {
  return Array.from(
    new Set(
      list
        .map(normalizeCenter)
        .filter(Boolean)
    )
  );
}

export function includesCenter(list: (string | undefined | null)[] = [], target: string | undefined | null): boolean {
  const normTarget = normalizeCenter(target);
  if (!normTarget) return false;
  return list.some(item => normalizeCenter(item) === normTarget);
}
