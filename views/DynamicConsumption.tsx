
import { UI_TOKENS } from '../src/constants/uiTokens';
import React, { useState, useEffect, useMemo } from 'react';
import { User, MiningResource, ValueCreationLog, RefineCategory, AuditStatus, Role, RefineType, ProjectStatus } from '../types';
import { Card, Badge, ProjectStatusBadge } from '../src/components/UI';
// (Eye/EyeOff removed)
import { CostPrivacyToggle } from '../src/components/CostPrivacyToggle';
import { useCostPrivacy } from '../src/hooks/useCostPrivacy';
import { XLSX, exportWorkbook, buildExcelFilename } from '../src/utils/excelIo';
import { UI_LABELS } from '../src/constants/uiLabels';
import { TERMINOLOGY } from '../src/constants/terminology';
import { aggregateMiningQuadrantsFromLogs } from '../src/utils/purification';
import { isProjectWritable, deriveProjectStatus } from '../src/utils/projectStatus';
import { isNonEffectiveHoursEffective } from '../src/utils/employmentStatus';
import { toast } from 'sonner';
import { CityGuardianModal, useCityGuardianModal } from '../src/components/CityGuardianModal';
import { calculateConsumptionMirrorFields } from '../src/utils/business';
import { formatCollectorDisplay } from '../src/utils/collector';
import { formatAuditStatusLabel } from '../src/utils/statusDisplay';
import { resolveSystemCollectorIdForWrite } from '../src/utils/collector';
import {
  getInitialRevenueCapacity,
  getInitialValueCapacity,
  getCurrentRevenueCapacity,
  getCurrentValueCapacity,
  getCWeightRevenue,
  getCWeightValue,
  getB2WeightValue,
  getHedgedRevenueCapacity,
  getHedgedValueCapacity
} from '../src/utils/miningCapacity';
import { getNonEffectiveHoursDeduction } from '../src/utils/nonEffectiveHours';
import {
  getLocalDateString,
  getLocalMonthString,
  resolveLogBusinessDate,
  resolveLogBusinessMonth,
  formatSubmissionTime,
  formatSubmissionDate,
  isDateInRange,
  isLogInFilter,
} from '../src/utils/dateUtils';
import { formatAmount, formatRatio, formatPercent } from '../src/utils/formatters';
import { calculateHedgeCapacitiesAndWeights } from '../src/utils/consumptionHedge';
import { filterAuditLogsByCenter, isLogLinkedToCenterUser, isGlobalReader, parseCenterList, isCenterManagerUser, sortCenterManagers } from '../src/utils/centerScope';
import { InfoTip } from '../src/components/InfoTip';
import { BusinessDateFilter } from '../src/components/BusinessDateFilter';
import { getExecutionType, getExecutionTypeBadgeColor, EXECUTION_TYPE_EXPLANATIONS } from '../src/utils/executionType';

interface DynamicConsumptionProps {
  user: User;
  users: User[];
  resources: MiningResource[];
  logs: ValueCreationLog[];
  jzczLogs?: ValueCreationLog[];
  dtcbLogs?: ValueCreationLog[];
  onLogSubmit: (log: ValueCreationLog | ValueCreationLog[]) => void;
  persistWorkspaceWithOverrides?: (overrides?: { logs?: ValueCreationLog[] }) => Promise<void>;
}

const DynamicConsumption: React.FC<DynamicConsumptionProps> = ({ 
  user, users, resources, logs, jzczLogs, dtcbLogs, onLogSubmit, persistWorkspaceWithOverrides 
}) => {
  const { isCostVisible, toggleCostVisible, maskMoney, maskText } = useCostPrivacy();

  const jzczLogsToUse = useMemo(() => {
    return jzczLogs || logs.filter(l => l.confirmationType !== '手动确权');
  }, [jzczLogs, logs]);

  const dtcbLogsToUse = useMemo(() => {
    return dtcbLogs || logs.filter(l => l.confirmationType === '手动确权');
  }, [dtcbLogs, logs]);

  const getRoleChineseName = (userOrRole?: User | Role | string): string => {
    if (!userOrRole) return '采集主体';
    if (typeof userOrRole === 'object') {
      if (userOrRole.category) return userOrRole.category;
      return getRoleChineseName(userOrRole.role);
    }
    switch (userOrRole) {
      case Role.Admin:
      case 'admin':
        return '系统管理员';
      case Role.Rank:
      case 'rank':
        return '经营单元负责人';
      case Role.Operator:
      case 'operator':
        return '经管员';
      case Role.npcxie:
      case 'npcxie':
      case Role.NPC:
      case 'NPC':
        return 'NPC';
      case Role.RevenueCollector:
      case 'revenue_collector':
        return '收款专家';
      case Role.ValueCollector:
      case 'value_collector':
        return '产值专家';
      case Role.ReservoirManager:
      case 'reservoir_manager':
        return '水库管理员';
      case Role.Collector:
      case 'collector':
        return '采集主体';
      default:
        return String(userOrRole);
    }
  };

  const [selectedOperatorId, setSelectedOperatorId] = useState<string>(user.id);
  const [recordedCollectorId, setRecordedCollectorId] = useState<string>('');
  const [selectedMiningId, setSelectedMiningId] = useState('');
  const [selectedType, setSelectedType] = useState<RefineType | ''>(RefineType.Enterprise);
  const [selectedCategory, setSelectedCategory] = useState<RefineCategory>(RefineCategory.Revenue);
  const [costCategory, setCostCategory] = useState<'A' | 'B' | 'C'>('A');
  const [valueConsumptionMode, setValueConsumptionMode] = useState<'B1' | 'B2'>('B1');
  const [dynamicCost, setDynamicCost] = useState<number>(0);
  const [businessDate, setBusinessDate] = useState<string>(() => getLocalDateString());
  const [businessMonth, setBusinessMonth] = useState<string>(() => getLocalMonthString());
  const [leaveDays, setLeaveDays] = useState<number>(0);
  const [workingDays, setWorkingDays] = useState<number>(22);
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [filterMonth, setFilterMonth] = useState<string>(() => getLocalMonthString());
  const { modalState, showAlert, showConfirm, closeModal } = useCityGuardianModal();

  useEffect(() => {
    setSelectedOperatorId(user.id);
  }, [user.id]);

  const selectedOperator = useMemo(() => users.find(u => u.id === selectedOperatorId), [users, selectedOperatorId]);
  const availableResources = useMemo(() => {
    if (!selectedOperator) return [];
    return resources.filter(r => {
      if (!isProjectWritable(r)) return false;
      const isAssigned = (assigned: string | undefined, center: string) => {
        if (!assigned) return false;
        return assigned.split(',').map(c => c.trim()).includes(center);
      };
      if (selectedCategory === RefineCategory.Revenue) {
        return isAssigned(r.assignedToRevenue, selectedOperator.center) || isAssigned(r.assignedTo, selectedOperator.center);
      } else {
        return isAssigned(r.assignedToValue, selectedOperator.center) || isAssigned(r.assignedTo, selectedOperator.center);
      }
    });
  }, [resources, selectedOperator, selectedCategory]);

  const collectorPool = useMemo(() => {
    return users.filter(u => ['初款专', '中款专', '高款专', '初产专', '中产专', '高产专'].includes(u.category || '') || [Role.Operator, Role.RevenueCollector, Role.ValueCollector].includes(u.role));
  }, [users]);

  const canSelectOthers = useMemo(() => {
    return isCenterManagerUser(user) || user.category === '系统管理员' || user.role === Role.Admin;
  }, [user]);

  const businessUnitManagers = useMemo(() => {
    const managers = users.filter(u => isCenterManagerUser(u) || u.category === '系统管理员' || u.role === Role.Admin);
    return sortCenterManagers(managers);
  }, [users]);

  // 获取当前选中的矿山详情
  const selectedResource = useMemo(() => {
    return resources.find(r => r.id === selectedMiningId);
  }, [resources, selectedMiningId]);

  const selectedResourceQuadrants = useMemo(() => {
    if (!selectedResource) return null;
    return aggregateMiningQuadrantsFromLogs(jzczLogsToUse, resources, selectedResource.id);
  }, [selectedResource, jzczLogsToUse, resources]);

  useEffect(() => {
    if (availableResources.length > 0) {
      const isCurrentValid = availableResources.some(r => r.id === selectedMiningId);
      if (!selectedMiningId || !isCurrentValid) {
        setSelectedMiningId(availableResources[0].id);
      }
    }
  }, [availableResources, selectedMiningId]);

  // 矿山编号前缀与提炼类型映射
  useEffect(() => {
    const resource = resources.find(r => r.id === selectedMiningId);
    if (resource) {
      const prefix = resource.id.charAt(0).toUpperCase();
      if (prefix === 'A') setSelectedType(RefineType.Enterprise);
      else if (prefix === 'B') setSelectedType(RefineType.Bidding);
      else if (prefix === 'C') setSelectedType(RefineType.OccHealth);
    }
  }, [selectedMiningId, resources]);

  // 获取当前选中的权重 (对冲后权重)
  const hedgeInfo = useMemo(() => {
    if (!selectedResource) return null;
    const allResourceLogs = logs.filter(l => l && l.miningId === selectedMiningId && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved));
    return calculateHedgeCapacitiesAndWeights(selectedResource, allResourceLogs);
  }, [selectedResource, logs, selectedMiningId]);

  const revenueWeight = hedgeInfo ? hedgeInfo.cWeightRev : 1;
  const valueWeight = hedgeInfo ? hedgeInfo.b2Weight : 1;

  const sharedWeight = useMemo(() => {
    return selectedCategory === RefineCategory.Revenue ? revenueWeight : valueWeight;
  }, [selectedCategory, revenueWeight, valueWeight]);

  // 获取当前矿产适用的提炼系数（用于C类消耗预览）
  const currentFactor = useMemo(() => {
    if (costCategory === 'C') {
      if (selectedCategory === RefineCategory.Revenue) {
        // 收款专家 = (C * 0.27) + (C * 0.2) + (C * 0.3) = 0.77
        return 0.27 + 0.2 + 0.3;
      }
      // 产值专家 = (C * 0.53) + (C * 0.60) + (C * 0.50) + (C * 0.52) = 2.15
      return 0.53 + 0.60 + 0.50 + 0.52;
    }
    return 1.0; // A/B类消耗系数为1
  }, [selectedCategory, costCategory]);

  const calculatedNetValue = useMemo(() => {
    if (costCategory === 'C') {
      return -(dynamicCost * currentFactor);
    }
    return -dynamicCost;
  }, [dynamicCost, costCategory, currentFactor]);

  const affectedExecutors = useMemo(() => {
    if (!selectedResource || (costCategory !== 'C' && !(costCategory === 'B' && valueConsumptionMode === 'B2'))) return [];
    
    // Find all relevant value creation logs for this mining resource (Confirmed or Approved ONLY, jzcz ∪ dtcb)
    const relevantLogs = logs.filter(l => 
      l.miningId === selectedResource.id && 
      (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved) &&
      (l.category === RefineCategory.Revenue || l.category === RefineCategory.Value)
    );

    // Group by recordedCollectorId
    const executorMap: Record<string, { 
      name: string, 
      revenue: number, 
      value: number, 
      revenueAmount: number, 
      valueAmount: number,
      afterRevenue: number,
      afterValue: number,
      afterRevenueAmount: number,
      afterValueAmount: number
    }> = {};
    
    relevantLogs.forEach(log => {
      const execId = log.recordedCollectorId || log.rankId;
      if (!execId) return;
      if (!executorMap[execId]) {
        // Find user name
        const userObj = users.find(u => u.id === execId);
        executorMap[execId] = { 
          name: userObj ? userObj.name : execId, 
          revenue: 0, 
          value: 0, 
          revenueAmount: 0, 
          valueAmount: 0,
          afterRevenue: 0,
          afterValue: 0,
          afterRevenueAmount: 0,
          afterValueAmount: 0
        };
      }
      if (log.category === RefineCategory.Revenue) {
        executorMap[execId].revenue += (log.netValue || 0);
        executorMap[execId].revenueAmount += (log.amount || 0);
      } else {
        executorMap[execId].value += (log.netValue || 0);
        executorMap[execId].valueAmount += (log.amount || 0);
      }
    });

    if (costCategory === 'C') {
      return Object.values(executorMap).map(exec => {
        // C 对冲影响收款和产值
        return {
          ...exec,
          afterRevenue: Math.round(exec.revenue * revenueWeight),
          afterRevenueAmount: Math.round(exec.revenueAmount * revenueWeight),
          afterValue: Math.round(exec.value * (revenueWeight * valueWeight)), // C权 * B2权
          afterValueAmount: Math.round(exec.valueAmount * (revenueWeight * valueWeight))
        };
      }).filter(e => e.revenue > 0 || e.value > 0);
    } else if (costCategory === 'B' && valueConsumptionMode === 'B2') {
      // B2 对冲仅影响产值权重
      return Object.values(executorMap).map(exec => ({
        ...exec,
        afterRevenue: Math.round(exec.revenue),
        afterRevenueAmount: Math.round(exec.revenueAmount),
        afterValue: Math.round(exec.value * valueWeight),
        afterValueAmount: Math.round(exec.valueAmount * valueWeight)
      })).filter(e => e.value > 0);
    }

    return [];
  }, [selectedResource, costCategory, valueConsumptionMode, logs, users, dynamicCost]);

  const selectedCollector = useMemo(() => {
    return users.find(u => u.id === recordedCollectorId);
  }, [users, recordedCollectorId]);

  const collectorRoleInfo = useMemo(() => {
    if (!selectedCollector) return null;
    const cat = selectedCollector.category || '';
    const isProdSpec = cat.includes('产专');
    const isCollSpec = cat.includes('款专');
    const isJuniorOrMid = cat.includes('初') || cat.includes('中');
    
    return {
      isSpecialist: isProdSpec || isCollSpec || isJuniorOrMid,
      label: isProdSpec ? '产值专家' : (isCollSpec ? '收款专家' : (isJuniorOrMid ? '骨干专家' : '普通用户')),
      incentiveImpact: isProdSpec ? '对冲 5% 产值专项包' : (isCollSpec ? '对冲 2% 收款专项包' : '冲抵个人投资回报率')
    };
  }, [selectedCollector]);

  useEffect(() => {
    if (selectedType === RefineType.NonEffectiveHours && selectedCollector && leaveDays > 0) {
      const dailySalary = (selectedCollector.salaryPackage || 0) / workingDays;
      setDynamicCost(Math.round(dailySalary * leaveDays));
    }
  }, [selectedType, selectedCollector, leaveDays, workingDays]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isB2 = costCategory === 'B' && valueConsumptionMode === 'B2';
    
    if (!selectedMiningId || !selectedType || (!recordedCollectorId && !isB2) || dynamicCost <= 0) {
      showAlert('请确保“采集主体”、“消耗类型”及“关联矿产”已完整填写且金额大于0。');
      return;
    }

    const categoryLabel = costCategory === 'B' && valueConsumptionMode === 'B2' ? 'B2' : costCategory;

    showConfirm(
      `确定提报动态消耗申请？\n\n【类别】${categoryLabel}类消耗\n【矿山】${selectedMiningId}\n【金额】${Math.round(dynamicCost).toLocaleString()}\n【归属月份】${businessMonth}`,
      async () => {
        // 动态消耗申请统一进入待确权状态，且由 npcxie 手动确权
        const status = AuditStatus.Pending;
        const confirmationType = '手动确权';

        const newLog: ValueCreationLog = {
          id: `${selectedCategory === RefineCategory.Revenue ? 'J' : 'M'}${(Date.now() % 100000000).toString().padStart(8, '0')}`,
          miningId: selectedMiningId,
          rankId: selectedOperatorId,
          recordedCollectorId: resolveSystemCollectorIdForWrite({
            costCategory: costCategory,
            valueConsumptionMode: selectedCategory === RefineCategory.Value && costCategory === 'B' ? valueConsumptionMode : undefined,
            recordedCollectorId: recordedCollectorId
          }),
          category: selectedCategory,
          type: selectedType as RefineType,
          costCategory: costCategory,
          valueConsumptionMode: selectedCategory === RefineCategory.Value && costCategory === 'B' ? valueConsumptionMode : undefined,
          amount: 0,
          rawAmount: 0,
          dynamicCost: dynamicCost,
          netValue: calculatedNetValue,
          timestamp: Date.now(),
          businessDate: businessDate,
          month: businessDate.slice(0, 7),
          status: status,
          confirmationType: confirmationType as any
        };

        onLogSubmit(newLog);
        setDynamicCost(0);
        const nextJzcz = [...jzczLogsToUse, newLog];
        const nextDtcb = dtcbLogsToUse;
        const mergedLogs = [...(nextJzcz ?? []), ...(nextDtcb ?? [])];
        try {
          if (!persistWorkspaceWithOverrides) {
            showAlert('工作区同步未就绪，请刷新后重试');
            return;
          }
          await persistWorkspaceWithOverrides({ logs: mergedLogs });
          showAlert(`[${categoryLabel}] 动态消耗申报成功并写入数据库！`);
        } catch (err) {
          showAlert('动态消耗申报写库失败：' + ((err as Error).message || '网络问题'));
        }
      }
    );
  };

  const [deductionAmount, setDeductionAmount] = useState<number>(0);
  const [deductionCollectorId, setDeductionCollectorId] = useState<string>('');
  const [deductionOperatorId, setDeductionOperatorId] = useState<string>(user.id);

  useEffect(() => {
    setDeductionOperatorId(user.id);
  }, [user.id]);

  const handleDeductionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deductionCollectorId || deductionAmount <= 0) {
      showAlert('请选择采集主体并输入有效对冲积分。');
      return;
    }

    showConfirm(
      `确定提交非有效工时对冲申请？\n\n【对冲金额】${Math.round(deductionAmount).toLocaleString()}\n【归属月份】${businessMonth}`,
      async () => {
          const deductionLog: ValueCreationLog = {
            id: `J${(Date.now() % 100000000).toString().padStart(8, '0')}`,
            miningId: 'FXDC',
            rankId: deductionOperatorId,
            recordedCollectorId: deductionCollectorId,
            category: RefineCategory.Revenue, 
            type: RefineType.NonEffectiveHours,
            amount: 0,
            rawAmount: 0,
            dynamicCost: deductionAmount,
            netValue: -deductionAmount,
            timestamp: Date.now(),
            businessDate: businessDate,
            month: businessDate.slice(0, 7),
            status: AuditStatus.Pending,
            confirmationType: '手动确权'
          };

        onLogSubmit(deductionLog);
        setDeductionAmount(0);
        const nextDtcb = [...dtcbLogsToUse.filter((l) => l.id !== deductionLog.id), deductionLog];
        const mergedLogs = [...(jzczLogsToUse ?? []), ...nextDtcb];
        try {
          if (!persistWorkspaceWithOverrides) {
            showAlert('工作区同步未就绪，请刷新后重试');
            return;
          }
          await persistWorkspaceWithOverrides({ logs: mergedLogs });
          showAlert('非有效工时对冲申请成功并落库，等待审核冲抵刚性工资包。');
        } catch (err) {
          showAlert('对冲申请写库失败，请重试');
        }
      }
    );
  };

  const getWeightForLog = (log: ValueCreationLog) => {
    const res = resources.find(r => r.id === log.miningId);
    if (!res) return 1;

    if (log.costCategory === 'C') {
      return log.category === RefineCategory.Revenue 
        ? getCWeightRevenue(res, logs) 
        : getCWeightValue(res, logs);
    }
    
    if (log.costCategory === 'B' && log.valueConsumptionMode === 'B2') {
      return getB2WeightValue(res, logs);
    }

    return 1;
  };

  const exportToExcel = () => {
    const dataToExport = consumptionLogs.map(log => {
      const { cWeightValue, b2WeightValue, revLimitStr, valLimitCStr, valLimitB2Str } = calculateConsumptionMirrorFields(log, resources, logs);

      return {
        '申报编号': log.id,
        '业务日期': resolveLogBusinessDate(log),
        '经营单元': users.find(u => u.id === log.rankId)?.center || '-',
        '提报时间': formatSubmissionTime(log.timestamp),
        '矿山编号': log.miningId,
        '采集主体': formatCollectorDisplay(log.recordedCollectorId, users),
        '非效对冲': (log.type === RefineType.NonEffectiveHours || isNonEffectiveHoursEffective(log)) ? Math.round(getNonEffectiveHoursDeduction(log)) : 0,
        'A': log.costCategory === 'A' ? Math.round(log.dynamicCost) : 0,
        'C': log.costCategory === 'C' ? Math.round(log.dynamicCost) : 0,
        'C权': cWeightValue,
        '款初/款当': revLimitStr,
        '产初/产当': valLimitCStr,
        'B1': (log.costCategory === 'B' && log.valueConsumptionMode === 'B1') ? Math.round(log.dynamicCost) : 0,
        'B2': (log.costCategory === 'B' && log.valueConsumptionMode === 'B2') ? Math.round(log.dynamicCost) : 0,
        'B2权': b2WeightValue,
        '产初/产当 ': valLimitB2Str,
        '确权日期': log.confirmedAt ? new Date(log.confirmedAt).toLocaleString() : '-',
        '确权状态': formatAuditStatusLabel(log.status)
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "消耗审计记录");
    exportWorkbook(workbook, buildExcelFilename("成本审计记录"));
  };

  const consumptionLogs = useMemo(() => {
    let list = dtcbLogsToUse.filter(l => (l.dynamicCost > 0 || l.type === RefineType.NonEffectiveHours));
    const isAdmin = isGlobalReader(user);
    if (!isAdmin) {
      const centers = parseCenterList(user.center);
      const centerUserIds = new Set(
        users.filter(u => {
          if (!u) return false;
          const uCenters = parseCenterList(u.center);
          return uCenters.some(c => centers.includes(c));
        }).map(u => u.id)
      );
      if (user.id) centerUserIds.add(user.id);

      list = list.filter(l => isLogLinkedToCenterUser(l, centerUserIds, resources, user.center));

      if (selectedOperatorId) {
        list = list.filter(l => l.rankId === selectedOperatorId || l.recordedCollectorId === selectedOperatorId);
      }
    } else if (selectedOperatorId) {
      list = list.filter(l => l.rankId === selectedOperatorId || l.recordedCollectorId === selectedOperatorId);
    }
    list = list.slice().reverse();
    list = list.filter(l => isLogInFilter(l, filterMonth, filterStartDate, filterEndDate));
    return list;
  }, [dtcbLogsToUse, resources, user, users, selectedOperatorId, filterStartDate, filterEndDate, filterMonth]);

  return (
    <div className="w-full space-y-6 md:space-y-10 animate-in fade-in duration-500 pb-6 text-sm md:text-base">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-2 h-8 bg-rose-600 rounded-full"></div>
          <h3 className="text-xl md:text-2xl font-black text-slate-800 tracking-tighter uppercase">动态消耗</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        <div className="lg:col-span-12 space-y-8">
          <div className={`bg-white rounded-2xl md:${UI_TOKENS.RADIUS_PANEL} shadow-xl border border-slate-100 overflow-hidden`}>
          <div className="bg-slate-900 p-4 md:p-8 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h4 className="text-lg md:text-xl font-black flex items-center tracking-tighter uppercase">
              <span className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center mr-4 shadow-lg">🧾</span>
              消耗申报录入
            </h4>
          </div>
          
          <form onSubmit={handleSubmit} className="p-4 md:p-10 space-y-6 md:space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
               <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center">
                    <span className="mr-2">🏢</span> 经营单元
                  </label>
                  <select
                    value={selectedOperatorId}
                    onChange={(e) => setSelectedOperatorId(e.target.value)}
                    disabled={!canSelectOthers}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-rose-500 disabled:opacity-40 disabled:bg-slate-100 disabled:cursor-not-allowed text-xs"
                    required
                  >
                    {(() => {
                      const seenCenters = new Set<string>();
                      const options: { id: string, center: string }[] = [];
                      
                      // 优先展示经理/管理员作为代表
                      const managers = users.filter(u => isCenterManagerUser(u) || u.category === '系统管理员' || u.role === Role.Admin);
                      const sortedManagers = sortCenterManagers(managers);
                      sortedManagers.forEach(u => {
                        if (u.center && !seenCenters.has(u.center)) {
                          seenCenters.add(u.center);
                          options.push({ id: u.id, center: u.center });
                        }
                      });
                      
                      // 补全其他单元
                      users.forEach(u => {
                        if (u.center && !seenCenters.has(u.center)) {
                          seenCenters.add(u.center);
                          options.push({ id: u.id, center: u.center });
                        }
                      });

                      return options.sort((a,b) => a.center.localeCompare(b.center)).map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.center}</option>
                      ));
                    })()}
                  </select>
               </div>
               <div className="space-y-2">
                  <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest ml-1 flex items-center">
                    <span className="mr-2">👤</span> 采集主体
                  </label>
                  <select
                    value={recordedCollectorId}
                    onChange={(e) => setRecordedCollectorId(e.target.value)}
                    disabled={costCategory === 'B' && valueConsumptionMode === 'B2'}
                    className="w-full bg-blue-50/40 border border-blue-100 rounded-xl px-4 py-3 font-bold outline-none focus:border-blue-500 disabled:opacity-40 disabled:bg-slate-100 disabled:cursor-not-allowed text-xs"
                    required={!(costCategory === 'B' && valueConsumptionMode === 'B2')}
                  >
                    <option value="">选择采集主体...</option>
                    {collectorPool.map(u => <option key={u.id} value={u.id}>{u.name} | {getRoleChineseName(u)}</option>)}
                  </select>
                  {collectorRoleInfo && (
                    <div className="mt-2 flex items-center justify-between px-3 py-2 bg-blue-100/50 rounded-lg border border-blue-200 animate-in fade-in slide-in-from-top-1 duration-300">
                      <span className="text-[10px] font-black text-blue-700 uppercase tracking-tighter">
                        {collectorRoleInfo.label} 标识已激活
                      </span>
                      <span className="text-[9px] font-bold text-blue-600 italic">
                        {collectorRoleInfo.incentiveImpact}
                      </span>
                    </div>
                  )}
               </div>

               <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center">
                    <span className="mr-2">🗓️</span> 业务日期 <span className="text-rose-500 ml-1 font-bold">*</span>
                  </label>
                  <input
                    type="date"
                    value={businessDate}
                    onChange={(e) => {
                      setBusinessDate(e.target.value);
                      setBusinessMonth(e.target.value.slice(0, 7));
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono text-xs font-bold text-slate-700 outline-none focus:border-rose-500"
                    title="业务日期按系统时间记录"
                  />
               </div>

               <div className="space-y-2">
                  <div className="flex items-center justify-between h-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      执行类型
                    </label>
                    {selectedResource && (
                      <span className="text-[9px] text-slate-400 font-medium truncate max-w-[120px]" title={`当前视角: ${selectedOperator?.center || user.center || '无'}`}>
                        视角: {selectedOperator?.center || user.center || '无'}
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs flex items-center justify-between h-[46px] shadow-sm">
                    {selectedResource ? (() => {
                      const currentUnitForDC = selectedOperator?.center || user.center || '';
                      const et = getExecutionType(selectedResource, currentUnitForDC);
                      const col = getExecutionTypeBadgeColor(et);
                      return (
                        <div className="flex items-center w-full">
                          <span 
                            title={EXECUTION_TYPE_EXPLANATIONS[et]}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-black border ${col.bg} ${col.text} ${col.border} cursor-help shadow-sm whitespace-nowrap`}
                          >
                            {et}
                          </span>
                        </div>
                      );
                    })() : (
                      <span className="text-slate-400 font-medium text-[11px]">请先选择矿山编号</span>
                    )}
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">冲抵矿山编号</label>
                <select
                  value={selectedMiningId}
                  onChange={(e) => setSelectedMiningId(e.target.value)}
                  className="w-full min-w-48 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-rose-500"
                  required
                >
                  <option value="">匹配 矿山编号...</option>
                  {availableResources.map(r => <option key={r.id} value={r.id}>{r.id} ({r.types[0]})</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">矿山状态</label>
                <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-600 flex items-center">
                  {selectedResource ? (
                    <ProjectStatusBadge resource={selectedResource} />
                  ) : (
                    <span className="text-slate-300 italic">请先选择矿山...</span>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">资产对冲类别</label>
                <div className={`flex bg-slate-50 p-1 rounded-xl border border-slate-200 h-12 ${costCategory === 'C' ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                  <button
                    type="button"
                    disabled={costCategory === 'C'}
                    onClick={() => { setSelectedCategory(RefineCategory.Revenue); if(costCategory==='B') setCostCategory('A'); }}
                    className={`flex-1 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all ${selectedCategory === RefineCategory.Revenue ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                  >
                    收款
                  </button>
                  <button
                    type="button"
                    disabled={costCategory === 'C'}
                    onClick={() => { setSelectedCategory(RefineCategory.Value); if(costCategory==='A' || costCategory==='C') setCostCategory('B'); }}
                    className={`flex-1 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all ${selectedCategory === RefineCategory.Value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                  >
                    产值
                  </button>
                </div>
              </div>
            </div>

            {/* 价值动态流 */}
            {selectedResource && selectedResourceQuadrants && (
              <div className={`space-y-6 bg-slate-50 p-4 md:p-8 rounded-2xl md:${UI_TOKENS.RADIUS_PANEL} border border-slate-100 animate-in slide-in-from-bottom-4 duration-500`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* 产值 */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest"> {UI_LABELS.VALUE}</span>
                      <span className="text-[9.5px] font-bold text-slate-500">产初: <span className="font-mono text-emerald-700">{getInitialValueCapacity(selectedResource).toLocaleString()}</span> | 产当: <span className="font-mono text-emerald-600">{Math.round(getHedgedValueCapacity(selectedResource, logs)).toLocaleString()}</span></span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.PENDING}</p>
                        <p className="text-xs font-black text-amber-600 font-mono">{selectedResourceQuadrants.value.pending.toLocaleString()}</p>
                      </div>
                      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.CONFIRMED}</p>
                        <p className="text-xs font-black text-emerald-600 font-mono">{selectedResourceQuadrants.value.confirmed.toLocaleString()}</p>
                      </div>
                      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.UNCONFIRMED}</p>
                        <p className="text-xs font-black text-rose-600 font-mono">{selectedResourceQuadrants.value.unconfirmed.toLocaleString()}</p>
                      </div>
                      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.MINED}</p>
                        <p className="text-xs font-black text-blue-600 font-mono">{selectedResourceQuadrants.value.mined.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  {/* 收款 */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-yellow-700 uppercase tracking-widest"> {UI_LABELS.REVENUE}</span>
                      <span className="text-[9.5px] font-bold text-slate-500">款初: <span className="font-mono text-yellow-700">{getInitialRevenueCapacity(selectedResource).toLocaleString()}</span> | 款当: <span className="font-mono text-yellow-600">{Math.round(getHedgedRevenueCapacity(selectedResource, logs)).toLocaleString()}</span></span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.PENDING}</p>
                        <p className="text-xs font-black text-amber-600 font-mono">{selectedResourceQuadrants.revenue.pending.toLocaleString()}</p>
                      </div>
                      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.CONFIRMED}</p>
                        <p className="text-xs font-black text-emerald-600 font-mono">{selectedResourceQuadrants.revenue.confirmed.toLocaleString()}</p>
                      </div>
                      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.UNCONFIRMED}</p>
                        <p className="text-xs font-black text-rose-600 font-mono">{selectedResourceQuadrants.revenue.unconfirmed.toLocaleString()}</p>
                      </div>
                      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.MINED}</p>
                        <p className="text-xs font-black text-blue-600 font-mono">{selectedResourceQuadrants.revenue.mined.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="space-y-2">
                  <label className="text-[10px] font-black text-rose-500 uppercase tracking-widest ml-1">申报积分</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={dynamicCost || ''}
                      onChange={(e) => { setDynamicCost(Number(e.target.value)); if(selectedType === RefineType.NonEffectiveHours) setLeaveDays(0); }}
                      className="w-full text-2xl font-black bg-rose-50/20 border border-rose-100 rounded-xl px-4 py-3 font-mono outline-none focus:border-rose-500 text-rose-600"
                      placeholder="0.00"
                      required={selectedCategory === RefineCategory.Revenue}
                    />
                  </div>
               </div>
            </div>

            <div className="space-y-4">
              {costCategory !== 'C' && (
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">消耗对冲阶梯 C</p>
              )}
              <div className="flex gap-4">
                {selectedCategory === RefineCategory.Revenue ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setCostCategory('A')}
                      className={`flex-1 py-4 rounded-2xl font-black text-xl border transition-all ${costCategory === 'A' ? 'bg-rose-600 border-rose-600 text-white shadow-lg scale-105' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                    >
                      A
                    </button>
                    <button
                      type="button"
                      onClick={() => setCostCategory('C')}
                      className={`flex-1 py-4 rounded-2xl font-black text-xl border transition-all ${costCategory === 'C' ? 'bg-amber-500 border-amber-500 text-white shadow-lg scale-105' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                    >
                      C
                    </button>
                  </>
                ) : (
                  <div className="flex-1 space-y-4">
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => setCostCategory('B')}
                        className={`flex-1 py-4 rounded-2xl font-black text-xl border transition-all ${costCategory === 'B' ? 'bg-rose-600 border-rose-600 text-white shadow-lg scale-105' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                      >
                        B
                      </button>
                      <button
                        type="button"
                        onClick={() => setCostCategory('C')}
                        className={`flex-1 py-4 rounded-2xl font-black text-xl border transition-all ${costCategory === 'C' ? 'bg-amber-500 border-amber-500 text-white shadow-lg scale-105' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                      >
                        C
                      </button>
                    </div>
                    {costCategory === 'B' && (
                      <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 h-10">
                          <button
                            type="button"
                            onClick={() => setValueConsumptionMode('B1')}
                            className={`flex-1 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all ${valueConsumptionMode === 'B1' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400'}`}
                          >
                            模式 B1
                          </button>
                          <button
                            type="button"
                            onClick={() => setValueConsumptionMode('B2')}
                            className={`flex-1 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all ${valueConsumptionMode === 'B2' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}
                          >
                            模式 B2
                          </button>
                        </div>
                        <div className="px-4 py-3 bg-slate-50 rounded-xl border border-slate-100 text-[9px] font-bold text-slate-500 space-y-1">
                          <p className={valueConsumptionMode === 'B1' ? 'text-rose-600' : ''}>
                            <span className="mr-1">📌</span> B1: 费用精准定位采集主体，作为个人投资回报率核算硬性对冲因子。
                          </p>
                          <p className={valueConsumptionMode === 'B2' ? 'text-emerald-600' : ''}>
                            <span className="mr-1">🔄</span> B2: 自动对冲已确权产值（按矿山编号）。
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button type="submit" className="w-full bg-slate-900 text-white py-4 md:py-6 rounded-2xl md:rounded-[2rem] font-black uppercase tracking-[0.2em] md:tracking-[0.4em] shadow-2xl hover:bg-rose-600 transition-all flex items-center justify-center space-x-4 active:scale-95">
              <span>提交</span>
            </button>
          </form>
        </div>
      </div>
    </div>

      {/* 非有效工时对冲快捷通道 - 独立行布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-12">
          <div className={`bg-white rounded-2xl md:${UI_TOKENS.RADIUS_PANEL} shadow-xl border border-rose-100 overflow-hidden bg-rose-50/5 h-full`}>
            <div className="bg-rose-600 p-4 md:p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h4 className="text-lg font-black flex items-center tracking-tighter uppercase">
                <span className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center mr-3">✂️</span>
                非有效工时对冲快捷通道
              </h4>
              <span className="text-[9px] font-bold bg-white/20 px-2 py-1 rounded uppercase self-start sm:self-auto">刚性工资包冲抵</span>
            </div>
            <form onSubmit={handleDeductionSubmit} className="p-4 md:p-8 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-rose-600 uppercase tracking-widest">经营单元</label>
                  <div className="w-full bg-slate-50 border border-rose-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700">
                    {users.find(u => u.id === deductionOperatorId)?.center || '未知'}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-rose-600 uppercase tracking-widest flex items-center justify-between">
                    <span>采集主体</span>
                    {deductionCollectorId && (
                      <span className="text-[9px] font-extrabold text-rose-600 bg-rose-100/60 px-2 py-0.5 rounded">
                        {getRoleChineseName(users.find(u => u.id === deductionCollectorId))}
                      </span>
                    )}
                  </label>
                  <select 
                    value={deductionCollectorId} 
                    onChange={(e) => setDeductionCollectorId(e.target.value)} 
                    className="w-full bg-white border border-rose-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-rose-500"
                    required
                  >
                    <option value="">选择采集主体...</option>
                    {collectorPool.map(u => <option key={u.id} value={u.id}>{u.name} | {getRoleChineseName(u)}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-rose-600 uppercase tracking-widest flex items-center">
                    业务日期 <span className="text-rose-500 ml-1 font-bold">*</span>
                  </label>
                  <input
                    type="date"
                    value={businessDate}
                    onChange={(e) => {
                      setBusinessDate(e.target.value);
                      setBusinessMonth(e.target.value.slice(0, 7));
                    }}
                    className="w-full bg-white border border-rose-200 rounded-xl px-3 py-2 text-xs font-bold font-mono outline-none focus:border-rose-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-rose-600 uppercase tracking-widest">对冲额</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={deductionAmount || ''} 
                      onChange={(e) => setDeductionAmount(Number(e.target.value))} 
                      className="w-full border border-rose-200 rounded-xl px-4 py-2 text-base font-black font-mono focus:border-rose-500 outline-none text-rose-700" 
                      placeholder="0.00" 
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-rose-100/50 p-4 rounded-2xl border border-rose-100">
                <p className="text-[10px] text-rose-700 font-bold leading-relaxed">
                  💡 该操作将直接从采集人的刚性工资包中扣除对应金额，用于对冲组织运营成本。
                </p>
                <button type="submit" className="w-full sm:w-auto px-10 py-3 bg-rose-600 text-white rounded-xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 active:scale-95">
                  非有效工时对冲
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className={`bg-white rounded-2xl md:${UI_TOKENS.RADIUS_PANEL} border border-slate-100 shadow-sm overflow-hidden`}>
        <div className="p-4 md:p-8 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <h4 id="cost-audit-records-title" className="text-sm font-black text-slate-900 uppercase tracking-widest">成本审计记录</h4>
            <CostPrivacyToggle size="sm" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BusinessDateFilter
              month={filterStartDate || filterEndDate ? '' : filterMonth}
              onMonthChange={(m) => {
                setFilterMonth(m);
                setFilterStartDate('');
                setFilterEndDate('');
              }}
              startDate={filterStartDate}
              endDate={filterEndDate}
              onDateRangeChange={(s, e) => {
                setFilterStartDate(s);
                setFilterEndDate(e);
                setFilterMonth('');
              }}
              onClear={() => {
                setFilterMonth('');
                setFilterStartDate('');
                setFilterEndDate('');
              }}
            />

            <button 
              id="export-excel-btn"
              onClick={exportToExcel}
              className="px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center"
            >
              <svg className="w-3 h-3 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              导出
            </button>
          </div>
        </div>
        <div className="overflow-x-auto -mx-4 px-4 md:-mx-10 md:px-10">
          <table id="cost-audit-records-table" className="w-full text-left min-w-[1600px] border-collapse">
            <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-4 py-4 md:py-6">申报编号</th>
                <th className="px-3 py-6 text-center">业务日期</th>
                <th className="px-4 py-6 text-center">{TERMINOLOGY.BUSINESS_UNIT}</th>
                <th className="px-4 py-6 text-center">{TERMINOLOGY.MINING_RESOURCE_ID}</th>
                <th className="px-4 py-6 font-bold text-slate-800">{TERMINOLOGY.LOG_OPERATOR_ID}</th>
                <th className="px-3 py-6 text-right text-indigo-600">非效对冲</th>
                <th className="px-3 py-6 text-right text-blue-600">A</th>
                <th className="px-3 py-6 text-right text-amber-600">C积分</th>
                <th className="px-4 py-6 text-right text-amber-700">C权</th>
                <th className="px-4 py-6 text-right text-amber-800">款初/款当</th>
                <th className="px-4 py-6 text-right text-amber-900">产初/产当</th>
                <th className="px-3 py-6 text-right text-rose-600">B1</th>
                <th className="px-3 py-6 text-right text-emerald-600">B2积分</th>
                <th className="px-4 py-6 text-right text-emerald-700">B2权</th>
                <th className="px-4 py-6 text-right text-emerald-800">产初/产当</th>
                <th className="px-6 py-6 text-center">确权日期</th>
                <th className="px-6 py-6 text-right">确权状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {consumptionLogs.map(log => {
                const { cWeightValue, b2WeightValue, revLimitStr, valLimitCStr, valLimitB2Str } = calculateConsumptionMirrorFields(log, resources, logs);

                return (
                  <tr key={log.id} className="hover:bg-rose-50/30 transition-colors group">
                    <td className="px-4 py-4 md:py-6">
                      <span className="font-mono text-[10px] font-black text-slate-300 block mb-1 group-hover:text-rose-400">#{log.id}</span>
                      <span className="text-[8px] font-bold text-slate-400">{formatSubmissionTime(log.timestamp)}</span>
                    </td>
                    <td className="px-3 py-6 text-center">
                      <span className="font-mono text-xs font-bold text-slate-700">
                        {resolveLogBusinessDate(log)}
                      </span>
                    </td>
                    <td className="px-4 py-6 text-center">
                      <span className="text-xs font-bold text-slate-600">
                        {users.find(u => u.id === log.rankId)?.center || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-6 text-center">
                      <span className="inline-block px-3 py-1 bg-slate-900 text-white rounded-lg font-mono text-[10px] font-black shadow-sm">
                        {log.miningId}
                      </span>
                    </td>
                    <td className="px-4 py-6">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-xs font-black text-slate-900">{users.find(u => u.id === log.recordedCollectorId)?.name || log.recordedCollectorId}</span>
                        <span className="text-[8px] px-2 py-0.5 rounded font-black bg-slate-100 text-slate-500">{log.type}</span>
                      </div>
                    </td>
                    <td className="px-3 py-6 text-right font-mono font-bold text-indigo-600">
                      {(log.type === RefineType.NonEffectiveHours || isNonEffectiveHoursEffective(log)) ? maskMoney(Math.round(getNonEffectiveHoursDeduction(log))) : '-'}
                    </td>
                    <td className="px-3 py-6 text-right font-mono font-bold text-blue-600">
                      {log.costCategory === 'A' ? maskMoney(Math.round(log.dynamicCost)) : '-'}
                    </td>
                    <td className="px-3 py-6 text-right font-mono font-bold text-amber-600 font-black">
                      {log.costCategory === 'C' ? maskMoney(Math.round(log.dynamicCost)) : '-'}
                    </td>
                    <td className="px-4 py-6 text-right font-mono font-black text-amber-700 bg-amber-50/20">
                      {cWeightValue}
                    </td>
                    <td className="px-4 py-6 text-right font-mono font-bold text-amber-800 bg-amber-50/10">
                      {revLimitStr}
                    </td>
                    <td className="px-4 py-6 text-right font-mono font-bold text-amber-900 bg-amber-50/15">
                      {valLimitCStr}
                    </td>
                    <td className="px-3 py-6 text-right font-mono font-bold text-rose-600">
                      {(log.costCategory === 'B' && log.valueConsumptionMode === 'B1') ? maskMoney(Math.round(log.dynamicCost)) : '-'}
                    </td>
                    <td className="px-3 py-6 text-right font-mono font-bold text-emerald-600 font-black">
                      {(log.costCategory === 'B' && log.valueConsumptionMode === 'B2') ? maskMoney(Math.round(log.dynamicCost)) : '-'}
                    </td>
                    <td className="px-4 py-6 text-right font-mono font-black text-emerald-700 bg-emerald-50/20">
                      {b2WeightValue}
                    </td>
                    <td className="px-4 py-6 text-right font-mono font-bold text-emerald-800 bg-emerald-50/10">
                      {valLimitB2Str}
                    </td>
                    <td className="px-6 py-6 text-center">
                      <span className="text-[10px] font-mono font-bold text-slate-500 whitespace-nowrap">
                        {log.confirmedAt ? new Date(log.confirmedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                      </span>
                    </td>
                    <td className="px-6 py-6 text-right">
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                        log.status === AuditStatus.Approved ? 'bg-emerald-100 text-emerald-700' : 
                        log.status === AuditStatus.Rejected ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {formatAuditStatusLabel(log.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {consumptionLogs.length === 0 && (
                <tr>
                   <td colSpan={17} className="py-20 text-center opacity-20 text-xs font-black uppercase tracking-widest">
                      当前终端无消耗记录
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <CityGuardianModal state={modalState} onClose={closeModal} />
    </div>
  );
};

export default DynamicConsumption;
