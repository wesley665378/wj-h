
import { ValueCreationLog, MiningResource, RefineCategory, AuditStatus, User } from '../../types';
import { calculateHistoricalNetValue } from './business';

export const resolveLogPackageNet = (log: ValueCreationLog, resources: MiningResource[], users: User[]) => {
  return calculateHistoricalNetValue(log, resources, users);
};

const isRevenueCategory = (cat: any) =>
  cat === RefineCategory.Revenue || cat === '收款' || cat === 'Revenue' || cat === 'revenue';

const isValueCategory = (cat: any) =>
  cat === RefineCategory.Value || cat === '产值' || cat === 'Value' || cat === 'value';

const isConfirmedOrApproved = (status: any) =>
  status === AuditStatus.Confirmed ||
  status === AuditStatus.Approved ||
  status === '已确权' ||
  status === '入库' ||
  status === 'Confirmed' ||
  status === 'Approved' ||
  status === 'confirmed' ||
  status === 'approved';

const isPendingStatus = (status: any) =>
  status === AuditStatus.Pending ||
  status === '待确权' ||
  status === 'Pending' ||
  status === 'pending';

const isLinkageType = (confType: any, logObj: any) =>
  confType === '联动确权' ||
  confType === '联动' ||
  confType === 'Linkage' ||
  logObj?.isLinkage === true;

export const sumConfirmedRevenuePackage = (logs: ValueCreationLog[], resources: MiningResource[], users: User[]) => {
  return logs
    .filter(l => isRevenueCategory(l.category) && isConfirmedOrApproved(l.status) && !l.costCategory)
    .reduce((sum, l) => sum + resolveLogPackageNet(l, resources, users), 0);
};

export const sumValueConversionPackage = (logs: ValueCreationLog[], resources: MiningResource[], users: User[]) => {
  return logs
    .filter(l => 
      isValueCategory(l.category) && 
      !l.costCategory &&
      (isConfirmedOrApproved(l.status) || (isPendingStatus(l.status) && isLinkageType(l.confirmationType, l)))
    )
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

