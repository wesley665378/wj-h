
import { ValueCreationLog, MiningResource, RefineCategory, AuditStatus, User } from '../../types';
import { calculateHistoricalNetValue } from './business';

export const resolveLogPackageNet = (log: ValueCreationLog, resources: MiningResource[], users: User[]) => {
  return calculateHistoricalNetValue(log, resources, users);
};

export const sumConfirmedRevenuePackage = (logs: ValueCreationLog[], resources: MiningResource[], users: User[]) => {
  return logs
    .filter(l => l.category === RefineCategory.Revenue && l.status === AuditStatus.Confirmed)
    .reduce((sum, l) => sum + resolveLogPackageNet(l, resources, users), 0);
};

export const sumValueConversionPackage = (logs: ValueCreationLog[], resources: MiningResource[], users: User[]) => {
  return logs
    .filter(l => l.category === RefineCategory.Value && (
      l.status === AuditStatus.Confirmed || 
      (l.status === AuditStatus.Pending && l.confirmationType === '联动确权')
    ))
    .reduce((sum, l) => sum + resolveLogPackageNet(l, resources, users), 0);
};

export const sumIncomeProductionPackage = (logs: ValueCreationLog[], resources: MiningResource[], users: User[]) => {
  return sumConfirmedRevenuePackage(logs, resources, users) + sumValueConversionPackage(logs, resources, users);
};

export const reconcileMiningLogs = (logs: ValueCreationLog[], resources: MiningResource[]) => {
  return resources.map(res => {
    const relevantLogs = logs.filter(l => l.miningId === res.id);
    
    // 基础口径：排除成本消耗类
    const confirmedLogs = relevantLogs.filter(l => 
      l.status === AuditStatus.Confirmed && 
      l.costCategory !== 'C' &&
      !(l.costCategory === 'B' && l.valueConsumptionMode === 'B2')
    );

    const pendingValueSum = relevantLogs
      .filter(l => l.category === RefineCategory.Value && l.status === AuditStatus.Pending)
      .reduce((sum, l) => sum + (l.amount || 0), 0);

    const confirmedRevenueSum = confirmedLogs
      .filter(l => l.category === RefineCategory.Revenue)
      .reduce((sum, l) => sum + (l.amount || 0), 0);

    const confirmedValueSum = confirmedLogs
      .filter(l => l.category === RefineCategory.Value)
      .reduce((sum, l) => sum + (l.amount || 0), 0);

    // 自动转换额度 (联动确权)
    const capacityRemaining = res.revenueCapacity - confirmedValueSum;
    const actualAmountToConvert = capacityRemaining <= 0 
      ? 0 
      : Math.min(pendingValueSum, Math.max(0, confirmedRevenueSum - confirmedValueSum));

    return {
      miningId: res.id,
      pendingValueSum,
      confirmedRevenueSum,
      confirmedValueSum,
      capacityRemaining,
      actualAmountToConvert
    };
  });
};

