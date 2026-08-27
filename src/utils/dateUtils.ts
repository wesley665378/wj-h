/**
 * 计算机本地时区日期工具函数
 * 
 * 严格遵循【产品规则】：
 * 1. 业务日期/业务月份：一律本机本地时区 getFullYear() / getMonth() + 1 / getDate() 拼接 YYYY-MM-DD / YYYY-MM。
 *    禁止使用 toISOString().slice(0, 10|7) 或 split('T')[0]（避免东八区等时区因 UTC 转换导致凌晨错日/错月）。
 * 2. 统计筛选优先级：month -> businessDate -> 本地 timestamp 推月（与 resolveLogBusinessMonth 一致）。
 * 3. 提交日期 / 提报日期：记录系统操作时刻 timestamp (Date.now())，不得把提交时刻当成业务日。
 */

/**
 * 获取本地时区的 YYYY-MM-DD 格式日期字符串
 */
export function getLocalDateString(input?: Date | number | string): string {
  const d = input ? new Date(input) : new Date();
  if (isNaN(d.getTime())) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 获取本地时区的 YYYY-MM 格式月份字符串
 */
export function getLocalMonthString(input?: Date | number | string): string {
  const d = input ? new Date(input) : new Date();
  if (isNaN(d.getTime())) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * 解析日志/单据的归属业务月份
 * 优先级：month -> businessDate (前7位) -> 本地 timestamp 推算
 */
export function resolveLogBusinessMonth(log?: { month?: string; businessDate?: string; timestamp?: number | string | Date } | null): string {
  if (!log) return getLocalMonthString();
  if (log.businessDate && typeof log.businessDate === 'string' && log.businessDate.trim() !== '') {
    return log.businessDate.trim().slice(0, 7);
  }
  if (log.month && typeof log.month === 'string' && log.month.trim() !== '') {
    return log.month.trim().slice(0, 7);
  }
  if (log.timestamp) {
    return getLocalMonthString(log.timestamp);
  }
  return getLocalMonthString();
}

/**
 * 统一过滤逻辑：判断日志是否落在筛选范围
 */
export function isLogInFilter(
  log?: { month?: string; businessDate?: string; timestamp?: number | string | Date; deleted?: boolean } | null,
  filterMonth?: string,
  filterStartDate?: string,
  filterEndDate?: string
): boolean {
  if (!log || log.deleted) return false;
  if (filterStartDate || filterEndDate) {
    const bDate = resolveLogBusinessDate(log);
    return isDateInRange(bDate, filterStartDate, filterEndDate);
  }
  if (filterMonth) {
    const bMonth = resolveLogBusinessMonth(log);
    return bMonth === filterMonth;
  }
  return true;
}

/**
 * 解析日志/单据的归属业务日期
 * 优先级：businessDate -> 本地 timestamp 推算日期
 */
export function resolveLogBusinessDate(log?: { businessDate?: string; timestamp?: number | string | Date } | null): string {
  if (!log) return getLocalDateString();
  if (log.businessDate && typeof log.businessDate === 'string' && log.businessDate.trim() !== '') {
    return log.businessDate.trim();
  }
  if (log.timestamp) {
    return getLocalDateString(log.timestamp);
  }
  return getLocalDateString();
}

/**
 * 格式化系统提交/提报时间为本地字符串
 */
export function formatSubmissionTime(timestamp?: number | string | Date | null): string {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

/**
 * 格式化系统提交/提报日期为本地日期字符串
 */
export function formatSubmissionDate(timestamp?: number | string | Date | null): string {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

/**
 * 判断日期字符串 (YYYY-MM-DD) 是否在 [startDate, endDate] 范围内 (闭区间)
 */
export function isDateInRange(targetDate: string, startDate?: string, endDate?: string): boolean {
  if (!targetDate) return false;
  const d = targetDate.trim().slice(0, 10);
  if (startDate && d < startDate) return false;
  if (endDate && d > endDate) return false;
  return true;
}
