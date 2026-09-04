import { User, ValueCreationLog, AuditStatus } from '../../types';

export interface JzfpSnapshot {
  id: string;
  userId: string;
  userName: string;
  category: string;
  month: string;
  totalIncome: number;
  costPackage: number; // 成本包
  totalCost?: number; // 兼容字段
  netBonus: number;
  historyDebt: number;
  timestamp: number;
}

export function buildJzfpSnapshot(
  users: User[],
  logs: ValueCreationLog[],
  targetMonth: string
): JzfpSnapshot[] {
  const [targetYearStr, targetMonthStr] = (targetMonth || new Date().toISOString().slice(0, 7)).split('-');
  const targetYear = targetYearStr || new Date().getFullYear().toString();
  const targetMonthNum = parseInt(targetMonthStr || '1', 10);

  const targetExperts = users.filter(u => {
    const cat = u.category || '';
    return cat.includes('产专') || cat.includes('款专') || cat.includes('经管员');
  });

  return targetExperts.map(user => {
    const cat = user.category || '';
    const isRevenueExpert = cat.includes('款专');
    const isProdExpert = cat.includes('产专') || cat === '经管员高产专';

    let ratio = 0.05;
    if (cat === '初产专') ratio = 0.5;
    else if (cat === '中产专') ratio = 0.6;
    else if (cat === '高产专' || cat === '经管员高产专' || cat.includes('款专')) ratio = 0.06;

    let rollingDebt = 0;

    // 1月到目标月前一个月 滚动计算历史欠产
    for (let m = 1; m < targetMonthNum; m++) {
      const ym = `${targetYear}-${String(m).padStart(2, '0')}`;
      const mLogs = logs.filter(l => 
        l.recordedCollectorId === user.id && 
        (l.month === ym || new Date(Number(l.timestamp)).toISOString().slice(0, 7) === ym) && 
        (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved || (l.status as string) === '已确权' || (l.status as string) === '入库')
      );

      let mIncome = 0;
      let mCost = user.salaryPackage || 0;

      if (isProdExpert) {
        mIncome = mLogs.filter(l => (l.category as string) === 'Value' || (l.category as string) === '产值').reduce((s, l) => s + (Number(l.netValue) || Number(l.amount) * 0.1), 0);
        mCost += mLogs.filter(l => l.costCategory === 'B' && l.valueConsumptionMode === 'B1').reduce((s, l) => s + (Number(l.dynamicCost) || 0), 0);
      } else if (isRevenueExpert) {
        mIncome = mLogs.filter(l => (l.category as string) === 'Revenue' || (l.category as string) === '收款').reduce((s, l) => s + (Number(l.netValue) || Number(l.amount) * 0.1), 0);
        mCost += mLogs.filter(l => l.costCategory === 'A').reduce((s, l) => s + (Number(l.dynamicCost) || 0), 0);
      }

      const mDeficit = mCost - mIncome;
      rollingDebt += mDeficit;
      if (rollingDebt < 0) {
        rollingDebt = 0;
      }
    }

    const historyDebt = Math.round(rollingDebt);

    // 当月计算
    const currentLogs = logs.filter(l => 
      l.recordedCollectorId === user.id && 
      (l.month === targetMonth || new Date(Number(l.timestamp)).toISOString().slice(0, 7) === targetMonth) && 
      (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved || (l.status as string) === '已确权' || (l.status as string) === '入库')
    );

    let currentIncome = 0;
    let currentCost = user.salaryPackage || 0;

    if (isProdExpert) {
      currentIncome = currentLogs.filter(l => (l.category as string) === 'Value' || (l.category as string) === '产值').reduce((s, l) => s + (Number(l.netValue) || Number(l.amount) * 0.1), 0);
      currentCost += currentLogs.filter(l => l.costCategory === 'B' && l.valueConsumptionMode === 'B1').reduce((s, l) => s + (Number(l.dynamicCost) || 0), 0);
    } else if (isRevenueExpert) {
      currentIncome = currentLogs.filter(l => (l.category as string) === 'Revenue' || (l.category as string) === '收款').reduce((s, l) => s + (Number(l.netValue) || Number(l.amount) * 0.1), 0);
      currentCost += currentLogs.filter(l => l.costCategory === 'A').reduce((s, l) => s + (Number(l.dynamicCost) || 0), 0);
    }

    const currentSurplus = Math.round(currentIncome - currentCost);
    let quota = 0;

    if (currentSurplus > 0) {
      const rem = currentSurplus - historyDebt;
      if (rem >= 0) {
        quota = rem;
      } else {
        quota = 0;
      }
    } else {
      quota = 0;
    }

    const theoreticalBonus = Math.round(quota * ratio);

    return {
      id: `${user.id}_${targetMonth}`,
      userId: user.id,
      userName: user.name,
      category: user.category || '',
      month: targetMonth,
      totalIncome: Math.round(currentIncome),
      costPackage: Math.round(currentCost),
      totalCost: Math.round(currentCost),
      netBonus: theoreticalBonus,
      historyDebt,
      timestamp: Date.now()
    };
  });
}
