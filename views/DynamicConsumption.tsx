import { UI_TOKENS } from '../src/constants/uiTokens';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, MiningResource, ValueCreationLog, RefineCategory, AuditStatus, Role, RefineType, ProjectStatus } from '../types';
import { Card, Badge, ProjectStatusBadge } from '../src/components/UI';
import { CostPrivacyToggle } from '../src/components/CostPrivacyToggle';
import { useCostPrivacy } from '../src/hooks/useCostPrivacy';
import { XLSX, exportWorkbook, buildExcelFilename } from '../src/utils/excelIo';
import { UI_LABELS } from '../src/constants/uiLabels';
import { TERMINOLOGY } from '../src/constants/terminology';
import { aggregateMiningQuadrantsFromLogs, businessUnitLabelsEqual } from '../src/utils/purification';
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
import { filterAuditLogsByCenter, isLogLinkedToCenterUser, isGlobalReader, parseCenterList, isCenterManagerUser, sortCenterManagers, centerMatch } from '../src/utils/centerScope';
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
  persistWorkspaceWithOverrides?: (overrides?: { logs?: ValueCreationLog[] }, options?: { silent?: boolean; successMessage?: string; loadingMessage?: string; toastId?: string | number }) => Promise<void>;
}

const CostTooltipIcon: React.FC<{ tooltip: string }> = ({ tooltip }) => {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        x: rect.left + rect.width / 2,
        y: rect.top - 6,
      });
      setShow(true);
    }
  };

  const handleMouseLeave = () => {
    setShow(false);
  };

  return (
    <span
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-blue-600 text-[11px] font-semibold cursor-help mx-1 shrink-0 select-none align-middle hover:bg-blue-100 transition-colors"
      title={tooltip}
    >
      i
      {show && coords && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            left: `${coords.x}px`,
            top: `${coords.y}px`,
            transform: 'translate(-50%, -100%)',
            zIndex: 9999,
            backgroundColor: '#1e293b',
            color: '#ffffff',
            borderRadius: '6px',
            padding: '8px 12px',
            width: '240px',
            fontSize: '12px',
            lineHeight: '1.5',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            pointerEvents: 'none',
            whiteSpace: 'normal',
            textAlign: 'left',
            fontWeight: 'normal',
          }}
          className="animate-in fade-in zoom-in-95 duration-100 font-sans text-white"
        >
          {tooltip}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: '4px solid #1e293b',
            }}
          />
        </div>,
        document.body
      )}
    </span>
  );
};

// 卡片通用标题组件
const CardHeader: React.FC<{ title: string; extra?: React.ReactNode }> = ({ title, extra }) => (
  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
    <div className="flex items-center space-x-2">
      <div className="w-1 h-4 bg-blue-600 rounded-full shrink-0" />
      <h3 className="text-sm font-bold text-slate-800 tracking-tight">{title}</h3>
    </div>
    {extra && <div>{extra}</div>}
  </div>
);

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
  const [costCategory, setCostCategory] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [valueConsumptionMode, setValueConsumptionMode] = useState<'B1' | 'B2'>('B1');
  const [dynamicCost, setDynamicCost] = useState<number>(0);
  const [businessDate, setBusinessDate] = useState<string>(() => getLocalDateString());
  const [businessMonth, setBusinessMonth] = useState<string>(() => getLocalMonthString());
  const [leaveDays, setLeaveDays] = useState<number>(0);
  const [workingDays, setWorkingDays] = useState<number>(22);
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [filterMonth, setFilterMonth] = useState<string>(() => getLocalMonthString());
  const [showDeductionChannel, setShowDeductionChannel] = useState<boolean>(false);
  const { modalState, showAlert, showConfirm, closeModal } = useCityGuardianModal();

  useEffect(() => {
    setSelectedOperatorId(user.id);
  }, [user.id]);

  const selectedOperator = useMemo(() => users.find(u => u.id === selectedOperatorId), [users, selectedOperatorId]);
  const availableResources = useMemo(() => {
    if (!selectedOperator) return [];
    return resources.filter(r => {
      if (!isProjectWritable(r)) return false;
      if (selectedCategory === RefineCategory.Revenue) {
        return centerMatch(r.assignedToRevenue, selectedOperator.center) || centerMatch(r.assignedTo, selectedOperator.center);
      } else {
        return centerMatch(r.assignedToValue, selectedOperator.center) || centerMatch(r.assignedTo, selectedOperator.center);
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
    const managers = users.filter(u => isCenterManagerUser(u));
    return sortCenterManagers(managers);
  }, [users]);

  // 获取当前选中的矿山详情
  const selectedResource = useMemo(() => {
    return resources.find(r => r.id === selectedMiningId);
  }, [resources, selectedMiningId]);

  const selectedResourceQuadrants = useMemo(() => {
    if (!selectedResource) return null;
    return aggregateMiningQuadrantsFromLogs(jzczLogsToUse, resources, selectedResource.id, selectedOperator?.center, users);
  }, [selectedResource, jzczLogsToUse, resources, selectedOperator, users]);

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
        return 0.27 + 0.2 + 0.3;
      }
      return 0.53 + 0.60 + 0.50 + 0.52;
    }
    return 1.0;
  }, [selectedCategory, costCategory]);

  const calculatedNetValue = useMemo(() => {
    if (costCategory === 'C') {
      return -(dynamicCost * currentFactor);
    }
    return -dynamicCost;
  }, [dynamicCost, costCategory, currentFactor]);

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
      incentiveImpact: isProdSpec ? '5%产值专项包' : (isCollSpec ? '2%收款专项包' : '个人投资回报率')
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
    const isD = costCategory === 'D';
    
    if ((!isD && !selectedMiningId) || !selectedType || (!recordedCollectorId && !isB2 && !isD) || dynamicCost <= 0) {
      showAlert('请确保“采集主体”、“消耗类型”及“关联信息”已完整填写且金额大于0。');
      return;
    }

    const categoryLabel = costCategory === 'B' && valueConsumptionMode === 'B2' ? 'B2' : costCategory;
    const mineNotice = isD ? '【归属】中心开支（无项目列支）' : `【矿山】${selectedMiningId}`;

    showConfirm(
      `确定提报动态消耗申请？\n\n【类别】${categoryLabel}类消耗\n${mineNotice}\n【金额】${Math.round(dynamicCost).toLocaleString()}\n【归属月份】${businessMonth}`,
      async () => {
        const status = AuditStatus.Pending;
        const confirmationType = '手动确权';

        const newLog: ValueCreationLog = {
          id: `${selectedCategory === RefineCategory.Revenue ? 'J' : 'M'}${(Date.now() % 100000000).toString().padStart(8, '0')}`,
          miningId: isD ? '' : selectedMiningId,
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
          netValue: isD ? -dynamicCost : calculatedNetValue,
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
            toast.error('工作区同步未就绪，请刷新后重试');
            return;
          }
          await persistWorkspaceWithOverrides({ logs: mergedLogs }, { loadingMessage: '申报保存中…', successMessage: '已落库' });
        } catch (err) {
          // Toast handled
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
            toast.error('工作区同步未就绪，请刷新后重试');
            return;
          }
          await persistWorkspaceWithOverrides({ logs: mergedLogs }, { loadingMessage: '对冲申请提交中…', successMessage: '已落库' });
        } catch (err) {
          // Toast handled
        }
      }
    );
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
        'D': log.costCategory === 'D' ? Math.round(log.dynamicCost) : 0,
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
      list = filterAuditLogsByCenter(list, resources, user, users);

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
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-[14px] font-sans text-[13px] text-[#1f2933] animate-in fade-in duration-300 pb-12">
      
      {/* 顶部 Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#d9e2ec]">
        <div className="flex items-center space-x-3">
          <div className="w-[3px] h-5 bg-[#1a56db] rounded-full" />
          <h2 className="text-[16px] font-bold text-slate-800 tracking-tight">动态消耗申报</h2>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-[14px]">
        
        {/* 卡片1：基本信息（包含双列网格字段与内嵌消耗对冲阶梯） */}
        <div className="bg-white rounded-[4px] border border-[#d9e2ec] p-[20px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] space-y-5">
          <CardHeader title="基本信息" />
          
          {/* 双列网格，每个字段带独立淡蓝色边框与浅蓝/浅灰背景 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* 1. 经营单元 */}
            <div className="bg-[#fafbfc] border border-[#b8d0f7] rounded-[4px] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-[13px] text-slate-600 font-medium shrink-0">经营单元</label>
              <select
                value={selectedOperatorId}
                onChange={(e) => setSelectedOperatorId(e.target.value)}
                disabled={!canSelectOthers}
                className="w-full sm:w-auto min-w-[200px] bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-1.5 text-[13px] text-[#1f2933] focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/20 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                required
              >
                {(() => {
                  const seenCenters = new Set<string>();
                  const options: { id: string, center: string }[] = [];
                  const managers = users.filter(u => isCenterManagerUser(u));
                  const sortedManagers = sortCenterManagers(managers);
                  sortedManagers.forEach(u => {
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

            {/* 2. 采集主体（合并对冲比例提示） */}
            <div className="bg-[#fafbfc] border border-[#b8d0f7] rounded-[4px] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-[13px] text-slate-600 font-medium shrink-0">采集主体</label>
              <div className="flex flex-col sm:items-end w-full sm:w-auto">
                <select
                  value={recordedCollectorId}
                  onChange={(e) => setRecordedCollectorId(e.target.value)}
                  disabled={costCategory === 'B' && valueConsumptionMode === 'B2'}
                  className="w-full sm:w-auto min-w-[200px] bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-1.5 text-[13px] text-[#1f2933] focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/20 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                  required={!(costCategory === 'B' && valueConsumptionMode === 'B2')}
                >
                  <option value="">选择采集主体...</option>
                  {collectorPool.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} | {getRoleChineseName(u)}
                    </option>
                  ))}
                </select>
                {/* 选中展示：唐恒 | 中产专 · 5%产值专项包 */}
                {selectedCollector && (
                  <div className="mt-1 text-[12px] text-slate-700 truncate">
                    <span>{selectedCollector.name} | {getRoleChineseName(selectedCollector)}</span>
                    {collectorRoleInfo && collectorRoleInfo.incentiveImpact && (
                      <span className="text-slate-400 font-normal ml-1">· {collectorRoleInfo.incentiveImpact}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 3. 业务日期 */}
            <div className="bg-[#fafbfc] border border-[#b8d0f7] rounded-[4px] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-[13px] text-slate-600 font-medium shrink-0">业务日期</label>
              <input
                type="date"
                value={businessDate}
                onChange={(e) => {
                  setBusinessDate(e.target.value);
                  setBusinessMonth(e.target.value.slice(0, 7));
                }}
                className="w-full sm:w-auto min-w-[200px] bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-1.5 text-[13px] font-mono text-[#1f2933] focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/20 outline-none transition-all cursor-pointer"
                required
              />
            </div>

            {/* 4. 执行类型 */}
            <div className="bg-[#fafbfc] border border-[#b8d0f7] rounded-[4px] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-[13px] text-slate-600 font-medium shrink-0">执行类型</label>
              <div className="text-right">
                {selectedResource ? (() => {
                  const currentUnitForDC = selectedOperator?.center || user.center || '';
                  const et = getExecutionType(selectedResource, currentUnitForDC);
                  const col = getExecutionTypeBadgeColor(et);
                  return (
                    <span 
                      title={EXECUTION_TYPE_EXPLANATIONS[et]}
                      className={`inline-block px-2.5 py-1 rounded-[4px] text-[12px] font-medium border ${col.bg} ${col.text} ${col.border}`}
                    >
                      {et}
                    </span>
                  );
                })() : (
                  <span className="text-slate-400 text-[12px]">未选择矿山</span>
                )}
              </div>
            </div>

            {/* 5. 视角 */}
            <div className="bg-[#fafbfc] border border-[#b8d0f7] rounded-[4px] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-[13px] text-slate-600 font-medium shrink-0">视角</label>
              <span className="text-[13px] text-[#1f2933] font-medium text-right">
                {selectedOperator?.center || user.center || '无'}
              </span>
            </div>

            {/* 6. 冲抵矿山编号 */}
            <div className="bg-[#fafbfc] border border-[#b8d0f7] rounded-[4px] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-[13px] text-slate-600 font-medium shrink-0">冲抵矿山编号</label>
              <select
                value={costCategory === 'D' ? '' : selectedMiningId}
                onChange={(e) => setSelectedMiningId(e.target.value)}
                disabled={costCategory === 'D'}
                className="w-full sm:w-auto min-w-[200px] bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-1.5 text-[13px] text-[#1f2933] focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/20 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                required={costCategory !== 'D'}
              >
                <option value="">{costCategory === 'D' ? 'D类无项目列支（中心开支）' : '匹配 矿山编号...'}</option>
                {availableResources.map(r => <option key={r.id} value={r.id}>{r.id} ({r.types[0]})</option>)}
              </select>
            </div>

            {/* 7. 矿山状态 */}
            <div className="bg-[#fafbfc] border border-[#b8d0f7] rounded-[4px] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-[13px] text-slate-600 font-medium shrink-0">矿山状态</label>
              <div className="text-right">
                {costCategory === 'D' ? (
                  <span className="text-[#1a56db] font-medium text-[12px]">中心开支 (无需矿山)</span>
                ) : selectedResource ? (
                  <ProjectStatusBadge resource={selectedResource} />
                ) : (
                  <span className="text-slate-400 text-[12px]">未选择矿山</span>
                )}
              </div>
            </div>
          </div>

          {/* 分隔线与内嵌消耗对冲阶梯 (横向5卡片排列) */}
          <div className="border-t border-[#d9e2ec] pt-4 space-y-3">
            <div className="flex items-center space-x-2">
              <div className="w-[3px] h-3.5 bg-[#1a56db] rounded-full" />
              <h4 className="text-[13px] font-bold text-slate-800 tracking-tight">消耗对冲阶梯</h4>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
              {/* 1. A */}
              <div
                onClick={() => {
                  setCostCategory('A');
                  setSelectedCategory(RefineCategory.Revenue);
                }}
                className={`p-3 rounded-[4px] cursor-pointer transition-all flex flex-col justify-between space-y-2 border ${
                  costCategory === 'A'
                    ? 'bg-[#e8f0fe] border-[#1a56db] ring-1 ring-[#1a56db]'
                    : 'bg-white border-[#d9e2ec] hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[14px] font-bold ${costCategory === 'A' ? 'text-[#1a56db]' : 'text-slate-800'}`}>
                    A
                  </span>
                  <span className="text-[12px] text-slate-500 font-normal">
                    A类对冲
                  </span>
                </div>
                <div className={`text-right font-mono [font-variant-numeric:tabular-nums] text-[13px] ${costCategory === 'A' ? 'font-bold text-[#1a56db]' : 'text-slate-700'}`}>
                  {maskMoney(costCategory === 'A' ? Math.round(dynamicCost || 0) : 0)}
                </div>
              </div>

              {/* 2. B1 */}
              <div
                onClick={() => {
                  setCostCategory('B');
                  setValueConsumptionMode('B1');
                  setSelectedCategory(RefineCategory.Value);
                }}
                className={`p-3 rounded-[4px] cursor-pointer transition-all flex flex-col justify-between space-y-2 border ${
                  costCategory === 'B' && valueConsumptionMode === 'B1'
                    ? 'bg-[#e8f0fe] border-[#1a56db] ring-1 ring-[#1a56db]'
                    : 'bg-white border-[#d9e2ec] hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[14px] font-bold ${costCategory === 'B' && valueConsumptionMode === 'B1' ? 'text-[#1a56db]' : 'text-slate-800'}`}>
                    B1
                  </span>
                  <span className="text-[12px] text-slate-500 font-normal truncate" title="精准定位采集主体">
                    B1类对冲
                  </span>
                </div>
                <div className={`text-right font-mono [font-variant-numeric:tabular-nums] text-[13px] ${costCategory === 'B' && valueConsumptionMode === 'B1' ? 'font-bold text-[#1a56db]' : 'text-slate-700'}`}>
                  {maskMoney(costCategory === 'B' && valueConsumptionMode === 'B1' ? Math.round(dynamicCost || 0) : 0)}
                </div>
              </div>

              {/* 3. B2 */}
              <div
                onClick={() => {
                  setCostCategory('B');
                  setValueConsumptionMode('B2');
                  setSelectedCategory(RefineCategory.Value);
                }}
                className={`p-3 rounded-[4px] cursor-pointer transition-all flex flex-col justify-between space-y-2 border ${
                  costCategory === 'B' && valueConsumptionMode === 'B2'
                    ? 'bg-[#e8f0fe] border-[#1a56db] ring-1 ring-[#1a56db]'
                    : 'bg-white border-[#d9e2ec] hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[14px] font-bold ${costCategory === 'B' && valueConsumptionMode === 'B2' ? 'text-[#1a56db]' : 'text-slate-800'}`}>
                    B2
                  </span>
                  <span className="text-[12px] text-slate-500 font-normal truncate" title="自动对冲已确权产值">
                    B2类对冲
                  </span>
                </div>
                <div className={`text-right font-mono [font-variant-numeric:tabular-nums] text-[13px] ${costCategory === 'B' && valueConsumptionMode === 'B2' ? 'font-bold text-[#1a56db]' : 'text-slate-700'}`}>
                  {maskMoney(costCategory === 'B' && valueConsumptionMode === 'B2' ? Math.round(dynamicCost || 0) : 0)}
                </div>
              </div>

              {/* 4. C */}
              <div
                onClick={() => {
                  setCostCategory('C');
                }}
                className={`p-3 rounded-[4px] cursor-pointer transition-all flex flex-col justify-between space-y-2 border ${
                  costCategory === 'C'
                    ? 'bg-[#e8f0fe] border-[#1a56db] ring-1 ring-[#1a56db]'
                    : 'bg-white border-[#d9e2ec] hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[14px] font-bold ${costCategory === 'C' ? 'text-[#1a56db]' : 'text-slate-800'}`}>
                    C
                  </span>
                  <span className="text-[12px] text-slate-500 font-normal">
                    C类对冲
                  </span>
                </div>
                <div className={`text-right font-mono [font-variant-numeric:tabular-nums] text-[13px] ${costCategory === 'C' ? 'font-bold text-[#1a56db]' : 'text-slate-700'}`}>
                  {maskMoney(costCategory === 'C' ? Math.round(dynamicCost || 0) : 0)}
                </div>
              </div>

              {/* 5. D（D类标签蓝色加粗，带 info 图标与 Tooltip） */}
              <div
                onClick={() => {
                  setCostCategory('D');
                }}
                className={`p-3 rounded-[4px] cursor-pointer transition-all flex flex-col justify-between space-y-2 border ${
                  costCategory === 'D'
                    ? 'bg-[#e8f0fe] border-[#1a56db] ring-1 ring-[#1a56db]'
                    : 'bg-white border-[#d9e2ec] hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-0.5">
                    <span className="text-[14px] font-bold text-[#1a56db]">
                      D
                    </span>
                    <CostTooltipIcon tooltip="中心开支，无项目列支，按实际发生月人员平均分摊" />
                  </div>
                  <span className="text-[12px] text-slate-500 font-normal">
                    经营单元公摊
                  </span>
                </div>
                <div className={`text-right font-mono [font-variant-numeric:tabular-nums] text-[13px] ${costCategory === 'D' ? 'font-bold text-[#1a56db]' : 'text-slate-700'}`}>
                  {maskMoney(costCategory === 'D' ? Math.round(dynamicCost || 0) : 0)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 卡片2：资产对冲 */}
        {selectedResource && selectedResourceQuadrants && (
          <div className="bg-white rounded-[4px] border border-[#d9e2ec] p-[20px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] space-y-5">
            <CardHeader title="资产对冲" />

            {/* 产值子区块 */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-[12px]">
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-0.5 bg-[#e8f0fe] text-[#1a56db] font-bold rounded-[4px] border border-[#b8d0f7]">
                    产值
                  </span>
                </div>
                <div className="text-slate-600 font-mono [font-variant-numeric:tabular-nums]">
                  产初：<span className="font-semibold text-slate-800">{getInitialValueCapacity(selectedResource).toLocaleString()}</span>
                  <span className="mx-2 text-slate-300">|</span>
                  产当：<span className="font-semibold text-slate-800">{Math.round(getHedgedValueCapacity(selectedResource, logs)).toLocaleString()}</span>
                </div>
              </div>

              {/* 四格统计：待确权 / 已确权 / 未确权 / 矿山入库 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 border border-[#d9e2ec] rounded-[4px] divide-x divide-y sm:divide-y-0 divide-[#d9e2ec] overflow-hidden bg-white">
                <div className="p-3 text-center space-y-1">
                  <div className="text-[12px] text-slate-500 font-medium">{UI_LABELS.PENDING}</div>
                  <div className="text-[15px] font-bold font-mono [font-variant-numeric:tabular-nums] text-slate-800">
                    {selectedResourceQuadrants.value.pending.toLocaleString()}
                  </div>
                </div>
                <div className="p-3 text-center space-y-1">
                  <div className="text-[12px] text-slate-500 font-medium">{UI_LABELS.CONFIRMED}</div>
                  <div className="text-[15px] font-bold font-mono [font-variant-numeric:tabular-nums] text-slate-800">
                    {selectedResourceQuadrants.value.confirmed.toLocaleString()}
                  </div>
                </div>
                <div className="p-3 text-center space-y-1">
                  <div className="text-[12px] text-slate-500 font-medium">{UI_LABELS.UNCONFIRMED}</div>
                  {/* “未确权”金额使用蓝色高亮 (#1a56db) */}
                  <div className="text-[15px] font-bold font-mono [font-variant-numeric:tabular-nums] text-[#1a56db]">
                    {selectedResourceQuadrants.value.unconfirmed.toLocaleString()}
                  </div>
                </div>
                <div className="p-3 text-center space-y-1">
                  <div className="text-[12px] text-slate-500 font-medium">{UI_LABELS.MINED}</div>
                  <div className="text-[15px] font-bold font-mono [font-variant-numeric:tabular-nums] text-slate-800">
                    {selectedResourceQuadrants.value.mined.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-[#d9e2ec] pt-4 space-y-2.5">
              {/* 收款子区块 */}
              <div className="flex items-center justify-between text-[12px]">
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded-[4px] border border-emerald-100">
                    收款
                  </span>
                </div>
                <div className="text-slate-600 font-mono [font-variant-numeric:tabular-nums]">
                  款初：<span className="font-semibold text-slate-800">{getInitialRevenueCapacity(selectedResource).toLocaleString()}</span>
                  <span className="mx-2 text-slate-300">|</span>
                  款当：<span className="font-semibold text-slate-800">{Math.round(getHedgedRevenueCapacity(selectedResource, logs)).toLocaleString()}</span>
                </div>
              </div>

              {/* 四格统计 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 border border-[#d9e2ec] rounded-[4px] divide-x divide-y sm:divide-y-0 divide-[#d9e2ec] overflow-hidden bg-white">
                <div className="p-3 text-center space-y-1">
                  <div className="text-[12px] text-slate-500 font-medium">{UI_LABELS.PENDING}</div>
                  <div className="text-[15px] font-bold font-mono [font-variant-numeric:tabular-nums] text-slate-800">
                    {selectedResourceQuadrants.revenue.pending.toLocaleString()}
                  </div>
                </div>
                <div className="p-3 text-center space-y-1">
                  <div className="text-[12px] text-slate-500 font-medium">{UI_LABELS.CONFIRMED}</div>
                  <div className="text-[15px] font-bold font-mono [font-variant-numeric:tabular-nums] text-slate-800">
                    {selectedResourceQuadrants.revenue.confirmed.toLocaleString()}
                  </div>
                </div>
                <div className="p-3 text-center space-y-1">
                  <div className="text-[12px] text-slate-500 font-medium">{UI_LABELS.UNCONFIRMED}</div>
                  {/* “未确权”金额使用蓝色高亮 (#1a56db) */}
                  <div className="text-[15px] font-bold font-mono [font-variant-numeric:tabular-nums] text-[#1a56db]">
                    {selectedResourceQuadrants.revenue.unconfirmed.toLocaleString()}
                  </div>
                </div>
                <div className="p-3 text-center space-y-1">
                  <div className="text-[12px] text-slate-500 font-medium">{UI_LABELS.MINED}</div>
                  <div className="text-[15px] font-bold font-mono [font-variant-numeric:tabular-nums] text-slate-800">
                    {selectedResourceQuadrants.revenue.mined.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 卡片3：申报积分（单行轻量边框框体） */}
        <div className="bg-[#f4f8fe] border border-[#b8d0f7] rounded-[4px] p-4 flex items-center justify-between gap-4">
          <label className="text-[13px] font-bold text-slate-800 shrink-0">申报积分</label>
          <div className="flex-1 max-w-[240px]">
            <input
              type="number"
              value={dynamicCost || ''}
              onChange={(e) => { 
                setDynamicCost(Number(e.target.value)); 
                if(selectedType === RefineType.NonEffectiveHours) setLeaveDays(0); 
              }}
              className="w-full text-right text-[16px] font-bold font-mono [font-variant-numeric:tabular-nums] text-[#1a56db] bg-white border border-[#b8d0f7] rounded-[4px] px-3.5 py-2 outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/20 transition-all placeholder:text-[#94a3b8]"
              placeholder="0"
              required={selectedCategory === RefineCategory.Revenue}
            />
          </div>
        </div>

        {/* 卡片4：提交操作 */}
        <div className="bg-white rounded-[4px] border border-[#d9e2ec] p-[20px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] space-y-3.5">
          <CardHeader title="提交操作" />
          
          <button
            type="submit"
            className="w-full h-[40px] bg-[#1a56db] hover:bg-[#1447b8] active:bg-[#0f3ba8] text-white font-medium text-[13px] tracking-[2px] rounded-[4px] shadow-sm transition-all cursor-pointer flex items-center justify-center"
          >
            提 交
          </button>

          <button
            type="button"
            onClick={() => setShowDeductionChannel(!showDeductionChannel)}
            className="w-full h-[38px] bg-white hover:bg-slate-50 border border-[#b8d0f7] text-slate-700 font-medium text-[13px] rounded-[4px] transition-all cursor-pointer flex items-center justify-center"
          >
            {showDeductionChannel ? '收起快捷通道' : '非有效工时对冲快捷通道'}
          </button>

          <div className="bg-[#fafbfc] border-l-2 border-[#1a56db] p-3 rounded-[4px] text-[12px] text-slate-600 leading-relaxed">
            该操作将直接从采集人的刚性工资包中扣除对应金额，用于对冲组织运营成本。
          </div>
        </div>

      </form>

      {/* 非有效工时对冲快捷通道（展开时） */}
      {showDeductionChannel && (
        <div className="bg-white rounded-[4px] border border-[#d9e2ec] p-[20px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] space-y-4 animate-in fade-in duration-200">
          <CardHeader title="非有效工时对冲快捷通道" />
          <form onSubmit={handleDeductionSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-slate-600 text-[12px] block mb-1 font-medium">经营单元</label>
                <div className="bg-slate-50 border border-[#b8d0f7] rounded-[4px] px-3 py-1.5 text-[13px] text-slate-800">
                  {users.find(u => u.id === deductionOperatorId)?.center || '未知'}
                </div>
              </div>

              <div>
                <label className="text-slate-600 text-[12px] block mb-1 font-medium">采集主体</label>
                <select 
                  value={deductionCollectorId} 
                  onChange={(e) => setDeductionCollectorId(e.target.value)} 
                  className="w-full bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-1.5 text-[13px] text-slate-800 outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/20 transition-all cursor-pointer"
                  required
                >
                  <option value="">选择采集主体...</option>
                  {collectorPool.map(u => <option key={u.id} value={u.id}>{u.name} | {getRoleChineseName(u)}</option>)}
                </select>
              </div>

              <div>
                <label className="text-slate-600 text-[12px] block mb-1 font-medium">业务日期</label>
                <input
                  type="date"
                  value={businessDate}
                  onChange={(e) => {
                    setBusinessDate(e.target.value);
                    setBusinessMonth(e.target.value.slice(0, 7));
                  }}
                  className="w-full bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-1.5 text-[13px] font-mono text-slate-800 outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/20 transition-all cursor-pointer"
                />
              </div>

              <div>
                <label className="text-slate-600 text-[12px] block mb-1 font-medium">对冲额</label>
                <input 
                  type="number" 
                  value={deductionAmount || ''} 
                  onChange={(e) => setDeductionAmount(Number(e.target.value))} 
                  className="w-full text-right bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-1.5 text-[13px] font-mono font-bold text-[#1a56db] outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/20 transition-all placeholder:text-[#94a3b8]" 
                  placeholder="0" 
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[12px] text-slate-500">
                💡 刚性工资包冲抵对冲扣除
              </span>
              <button
                type="submit"
                className="px-6 py-2 bg-[#1a56db] hover:bg-[#1447b8] text-white rounded-[4px] text-[13px] font-medium transition-all shadow-sm cursor-pointer"
              >
                提交非有效工时对冲
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 成本审计记录表格卡片 */}
      <div className="bg-white rounded-[4px] border border-[#d9e2ec] p-[20px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#d9e2ec]">
          <div className="flex items-center space-x-2">
            <div className="w-[3px] h-4 bg-[#1a56db] rounded-full shrink-0" />
            <h3 id="cost-audit-records-title" className="text-[14px] font-bold text-slate-800 tracking-tight">成本审计记录</h3>
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
              className="px-3.5 py-1.5 bg-[#e8f0fe] text-[#1a56db] border border-[#b8d0f7] rounded-[4px] text-[12px] font-medium hover:bg-blue-100 transition-colors flex items-center shadow-xs cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              导出 Excel
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[4px] border border-[#d9e2ec]">
          <table id="cost-audit-records-table" className="w-full text-left min-w-[1500px] border-collapse text-[12px]">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-[#d9e2ec]">
              <tr>
                <th className="px-3 py-2.5 border-r border-[#d9e2ec]">申报编号</th>
                <th className="px-2.5 py-2.5 text-center border-r border-[#d9e2ec]">业务日期</th>
                <th className="px-2.5 py-2.5 text-center border-r border-[#d9e2ec]">{TERMINOLOGY.BUSINESS_UNIT}</th>
                <th className="px-2.5 py-2.5 text-center border-r border-[#d9e2ec]">{TERMINOLOGY.MINING_RESOURCE_ID}</th>
                <th className="px-2.5 py-2.5 border-r border-[#d9e2ec]">{TERMINOLOGY.LOG_OPERATOR_ID}</th>
                <th className="px-2.5 py-2.5 text-right border-r border-[#d9e2ec]">非效对冲</th>
                <th className="px-2.5 py-2.5 text-right border-r border-[#d9e2ec]">A</th>
                <th className="px-2.5 py-2.5 text-right border-r border-[#d9e2ec]">C积分</th>
                <th className="px-2.5 py-2.5 text-right border-r border-[#d9e2ec]">C权</th>
                <th className="px-2.5 py-2.5 text-right border-r border-[#d9e2ec]">款初/款当</th>
                <th className="px-2.5 py-2.5 text-right border-r border-[#d9e2ec]">产初/产当</th>
                <th className="px-2.5 py-2.5 text-right border-r border-[#d9e2ec]">B1</th>
                <th className="px-2.5 py-2.5 text-right border-r border-[#d9e2ec]">B2积分</th>
                <th className="px-2.5 py-2.5 text-right border-r border-[#d9e2ec]">B2权</th>
                <th className="px-2.5 py-2.5 text-right border-r border-[#d9e2ec]">产初/产当</th>
                <th className="px-2.5 py-2.5 text-right border-r border-[#d9e2ec]">D积分</th>
                <th className="px-2.5 py-2.5 text-center border-r border-[#d9e2ec]">确权日期</th>
                <th className="px-2.5 py-2.5 text-right">确权状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {consumptionLogs.map(log => {
                const { cWeightValue, b2WeightValue, revLimitStr, valLimitCStr, valLimitB2Str } = calculateConsumptionMirrorFields(log, resources, logs);

                return (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2 border-r border-slate-100">
                      <span className="font-mono text-[11px] text-slate-500 block">#{log.id}</span>
                      <span className="text-[10px] text-slate-400">{formatSubmissionTime(log.timestamp)}</span>
                    </td>
                    <td className="px-2.5 py-2 text-center font-mono text-[12px] text-slate-700 border-r border-slate-100">
                      {resolveLogBusinessDate(log)}
                    </td>
                    <td className="px-2.5 py-2 text-center text-slate-700 border-r border-slate-100">
                      {users.find(u => u.id === log.rankId)?.center || '-'}
                    </td>
                    <td className="px-2.5 py-2 text-center border-r border-slate-100">
                      {log.miningId ? (
                        <span className="font-mono font-medium text-slate-800">
                          {log.miningId}
                        </span>
                      ) : (
                        <span className="text-[#1a56db] text-[12px] font-medium">中心开支</span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 border-r border-slate-100">
                      <div className="text-slate-800 font-medium">{users.find(u => u.id === log.recordedCollectorId)?.name || log.recordedCollectorId}</div>
                      <div className="text-[10px] text-slate-400">{log.type}</div>
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono [font-variant-numeric:tabular-nums] border-r border-slate-100">
                      {(log.type === RefineType.NonEffectiveHours || isNonEffectiveHoursEffective(log)) ? maskMoney(Math.round(getNonEffectiveHoursDeduction(log))) : '0'}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono [font-variant-numeric:tabular-nums] border-r border-slate-100">
                      {log.costCategory === 'A' ? maskMoney(Math.round(log.dynamicCost)) : '0'}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono [font-variant-numeric:tabular-nums] border-r border-slate-100">
                      {log.costCategory === 'C' ? maskMoney(Math.round(log.dynamicCost)) : '0'}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono [font-variant-numeric:tabular-nums] border-r border-slate-100">
                      {cWeightValue}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono [font-variant-numeric:tabular-nums] border-r border-slate-100">
                      {revLimitStr}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono [font-variant-numeric:tabular-nums] border-r border-slate-100">
                      {valLimitCStr}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono [font-variant-numeric:tabular-nums] border-r border-slate-100">
                      {(log.costCategory === 'B' && log.valueConsumptionMode === 'B1') ? maskMoney(Math.round(log.dynamicCost)) : '0'}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono [font-variant-numeric:tabular-nums] border-r border-slate-100">
                      {(log.costCategory === 'B' && log.valueConsumptionMode === 'B2') ? maskMoney(Math.round(log.dynamicCost)) : '0'}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono [font-variant-numeric:tabular-nums] border-r border-slate-100">
                      {b2WeightValue}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono [font-variant-numeric:tabular-nums] border-r border-slate-100">
                      {valLimitB2Str}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono [font-variant-numeric:tabular-nums] border-r border-slate-100">
                      {log.costCategory === 'D' ? maskMoney(Math.round(log.dynamicCost)) : '0'}
                    </td>
                    <td className="px-2.5 py-2 text-center font-mono text-slate-500 border-r border-slate-100">
                      {log.confirmedAt ? new Date(log.confirmedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td className="px-2.5 py-2 text-right">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        log.status === AuditStatus.Approved ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 
                        log.status === AuditStatus.Rejected ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-blue-50 text-[#1a56db] border border-blue-200'
                      }`}>
                        {formatAuditStatusLabel(log.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {consumptionLogs.length === 0 && (
                <tr>
                  <td colSpan={18} className="py-12 text-center text-slate-400 text-xs">
                    当前视图无消耗记录
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
