import { User, ValueCreationLog, AuditStatus, RefineCategory, RefineType } from '../../types';
import { getUserSalaryByMonth } from './business';

/**
 * 用户是否处于业务停用状态（不能新挂账、不能登录等）
 */
export function isOpsInactive(user: User): boolean {
  return user.userStatus === 'inactive';
}

/**
 * 用户在指定月份是否计薪（刚性工资包）
 * 逻辑：
 * 1. 无 resignDate 且 active -> 计
 * 2. 有 resignDate：resignMonth = resignDate.slice(0,7)；目标月 <= resignMonth -> 计；目标月 > resignMonth -> 不计
 * 3. inactive 但无 resignDate（历史数据）：目标月一律不计（兼容旧行为）
 */
export function isSalaryActiveForMonth(user: User, monthYYYYMM: string): boolean {
  if (user.resignDate) {
    const resignMonth = user.resignDate.slice(0, 7);
    return monthYYYYMM <= resignMonth;
  }
  
  // 历史数据或未设置离职日期的情况
  if (isOpsInactive(user)) {
    return false;
  }
  
  return true;
}

/**
 * 计算离职当月的建议对冲数值
 * 公式：suggested = round( getUserSalaryByMonth(u, resignMonth) / daysInMonth * remainingDaysAfterResign )
 * remainingDays = 当月总天数 - 离职日日号
 */
export function suggestResignHedgeAmount(user: User, resignDate: string): number {
  if (!resignDate) return 0;
  
  const parts = resignDate.split('-');
  const y = parseInt(parts[0]);
  const m = parseInt(parts[1]);
  const d = parseInt(parts[2]);
  
  const resignMonth = resignDate.slice(0, 7);
  const salary = getUserSalaryByMonth(user, resignMonth);
  
  // 获取当月总天数：new Date(y, m, 0) 返回该月最后一天
  const daysInMonth = new Date(y, m, 0).getDate();
  const remainingDays = daysInMonth - d;
  
  if (remainingDays <= 0) return 0;
  
  return Math.round((salary / daysInMonth) * remainingDays);
}

/**
 * 获取离职对冲计算的详细公式描述
 */
export function getResignHedgeFormulaDesc(user: User, resignDate: string): string {
  if (!resignDate) return '';
  
  const parts = resignDate.split('-');
  const y = parseInt(parts[0]);
  const m = parseInt(parts[1]);
  const d = parseInt(parts[2]);
  
  const resignMonth = resignDate.slice(0, 7);
  const salary = getUserSalaryByMonth(user, resignMonth);
  const daysInMonth = new Date(y, m, 0).getDate();
  const remainingDays = daysInMonth - d;
  
  return `计算公式：月薪 ${salary} / 当月天数 ${daysInMonth} × 剩余天数 ${remainingDays} (月末 ${daysInMonth} - 离职日 ${d})`;
}

export function isNonEffectiveHoursEffective(log: ValueCreationLog): boolean {
  if (!log) return false;
  const isTypeMatch = log.type === RefineType.NonEffectiveHours || (log.type as any) === '非有效工时对冲' || (log.type as any) === 'NonEffectiveHours';
  const isStatusMatch = log.status === AuditStatus.Confirmed || log.status === AuditStatus.Approved || (log.status as any) === '已确权' || (log.status as any) === '入库' || (log.status as any) === 'Confirmed' || (log.status as any) === 'Approved';
  return Boolean(isTypeMatch && isStatusMatch);
}

/**
 * 构造离职自动生成的非有效工时对冲日志
 */
export function buildResignNonEffectiveHoursLog(
  user: User, 
  resignDate: string, 
  hedgeAmount: number, 
  operatorId: string
): ValueCreationLog {
  const resignMonth = resignDate.slice(0, 7);
  
  return {
    id: `resign-hedge-${user.id}-${Date.now()}`,
    recordedCollectorId: user.id,
    rankId: operatorId,
    category: RefineCategory.Revenue,
    type: RefineType.NonEffectiveHours,
    amount: 0,
    rawAmount: 0,
    dynamicCost: hedgeAmount,
    netValue: -hedgeAmount,
    businessDate: resignDate,
    month: resignMonth,
    status: AuditStatus.Pending,
    confirmationType: '手动确权',
    miningId: 'FXDC',
    timestamp: Date.now()
  };
}
