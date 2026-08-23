/**
 * 城市守护者统一金额与数字展示及计算圆整工具
 * 
 * 附录 S · §一 第 7 条 规范要求：
 * 1. 积分/额度/包/工资/产初·款初/占用/可用提炼量：录入、计算、落库、展示一律四舍五入为整数（Math.round 等价）。
 * 2. 展示统一 formatMoney(value) 或 formatAmount(value)（二者均输出 0 位小数千分位）。
 * 3. 计算/落库/门禁汇总：统一 roundMoney(n)；每笔落库前圆整，汇总后再 roundMoney 一次防浮点。
 * 4. 权重/比例/ROI/C权/B2权/提纯系数：可保留小数；用 roundRatio 或 formatRatio/formatPercent；禁止对权重 roundMoney。
 * 5. 禁止 UI/弹窗/导出出现 ¥、￥、$、「元」「万元」；只显示纯数字/千分位数字。
 */

/**
 * 金额/额度圆整为整数
 */
export function roundMoney(value: number | string | undefined | null): number {
  if (value === undefined || value === null || value === '') return 0;
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num) || !isFinite(num)) return 0;
  return Math.round(num);
}

/**
 * 格式化整数金额（0 位小数千分位，无货币符号）
 * @example formatMoney(12345.67) -> "12,346"
 */
export function formatMoney(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === '') return '0';
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num) || !isFinite(num)) return '0';
  return Math.round(num).toLocaleString('zh-CN');
}

/**
 * 格式化整数金额别名（与 formatMoney 等价）
 */
export const formatAmount = formatMoney;
export const formatCurrency = formatMoney;

/**
 * 比例/系数/权重圆整（保留指定位小数，默认 6 位或 2 位）
 */
export function roundRatio(value: number | string | undefined | null, decimals = 6): number {
  if (value === undefined || value === null || value === '') return 0;
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num) || !isFinite(num)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * 格式化比率/系数 (如 投资回报率 ROI 1.52)
 */
export function formatRatio(value: number | string | undefined | null, decimals = 2): string {
  if (value === undefined || value === null || value === '') return '0.00';
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num) || !isFinite(num)) return '0.00';
  return num.toFixed(decimals);
}

/**
 * 格式化百分比 (如 85.5%)
 */
export function formatPercent(value: number | string | undefined | null, decimals = 1): string {
  if (value === undefined || value === null || value === '') return '0%';
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num) || !isFinite(num)) return '0%';
  return `${num.toFixed(decimals)}%`;
}
