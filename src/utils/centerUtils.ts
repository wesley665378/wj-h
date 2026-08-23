/**
 * 经营单元名称规范化工具
 */
export const normalizeCenter = (rawCenter?: string, existingUnits: string[] = []): string => {
  const trimmed = (rawCenter || '').trim();
  if (!trimmed) return '';
  const normRaw = trimmed.replace(/\s*[\(（](前台|后台)[\)）]/gi, '').replace(/\s+/g, '').toLowerCase();
  
  if (Array.isArray(existingUnits) && existingUnits.length > 0) {
    const matched = existingUnits.find(u => {
      const normU = (u || '').replace(/\s*[\(（](前台|后台)[\)）]/gi, '').replace(/\s+/g, '').toLowerCase();
      return normU === normRaw || (u || '').trim().toLowerCase() === trimmed.toLowerCase();
    });
    if (matched) return matched;
  }
  return trimmed;
};
