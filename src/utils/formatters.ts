/**
 * 城市守护者统一金额与数字展示格式化器
 * 
 * 规范要求：
 * 1. 金额：一律走统一整数金额格式，四舍五入取整后按中文千分位展示 (如 12,345)，禁止页面私自写两位小数或非标千分位。
 * 2. 比例/系数/倍数：如 ROI、产出贡献比等无量纲数值，按指定位小数展示 (默认两位)。
 */

/**
 * 格式化整数金额（千分位）
 * 传入数字或字符串，四舍五入取整后输出标准千分位字符串。
 * @example formatAmount(12345.67) -> "12,346"
 * @example formatAmount(0) -> "0"
 * @example formatAmount(null) -> "0"
 */
export function formatAmount(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === '') return '0';
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return '0';
  return Math.round(num).toLocaleString('zh-CN');
}

/**
 * 格式化货币金额 (带 ¥ 前缀)
 * @example formatCurrency(12345) -> "¥12,345"
 */
export function formatCurrency(value: number | string | undefined | null): string {
  return `¥${formatAmount(value)}`;
}

/**
 * 格式化比率/系数 (如 投资回报率 1.52)
 * @param value 数值
 * @param decimals 小数位数，默认为 2
 */
export function formatRatio(value: number | string | undefined | null, decimals = 2): string {
  if (value === undefined || value === null || value === '') return '0.00';
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return '0.00';
  return num.toFixed(decimals);
}

/**
 * 格式化百分比 (如 85.5%)
 */
export function formatPercent(value: number | string | undefined | null, decimals = 1): string {
  if (value === undefined || value === null || value === '') return '0%';
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return '0%';
  return `${num.toFixed(decimals)}%`;
}
