import { UI_TOKENS } from '../src/constants/uiTokens';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, MiningResource, ValueCreationLog, RefineCategory, AuditStatus, Role, RefineType, ProjectStatus, SystemConfig } from '../types';
import { Card, Badge, ProjectStatusBadge } from '../src/components/UI';
import { CostPrivacyToggle } from '../src/components/CostPrivacyToggle';
import { useCostPrivacy } from '../src/hooks/useCostPrivacy';
import { XLSX, exportWorkbook, buildExcelFilename } from '../src/utils/excelIo';
import { canExportExcel, getExportButtonTitle, EXPORT_DISABLED_TOOLTIP } from '../src/utils/accessControl';
import { UI_LABELS } from '../src/constants/uiLabels';
import { TERMINOLOGY } from '../src/constants/terminology';
import { useDedupe } from '../src/hooks/useDedupe';
import { useCircuitBreaker } from '../src/hooks/useCircuitBreaker';
import { aggregateMiningQuadrantsFromLogs, businessUnitLabelsEqual } from '../src/utils/purification';
import { isProjectWritable, deriveProjectStatus } from '../src/utils/projectStatus';
import { isNonEffectiveHoursEffective } from '../src/utils/employmentStatus';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
import { persistDtcbLogs } from '../src/api';
import { toastApiError } from '../src/api/client';

// Helper component for the expandable 3-tier theoretical value
const TieredValueDisplay: React.FC<{ value: number }> = ({ value }) => {
  const [expanded, setExpanded] = useState(false);
  const v100 = Math.round(value);
  const v80 = Math.round(value * 0.8);
  const v60 = Math.round(value * 0.6);

  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-1">
        <span className="font-bold text-slate-800 tabular-nums">{v100.toLocaleString()}</span>
        <button 
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="text-slate-400 hover:text-blue-600 p-0.5"
        >
          {expanded ? '▴' : '▾'}
        </button>
      </div>
      {expanded && (
        <div className="mt-1 pt-1 border-t border-slate-100 w-full space-y-0.5 text-[9px] animate-in slide-in-from-top-1">
          <div className="flex justify-between text-slate-400"><span className="text-slate-300">60%</span><span className="tabular-nums font-mono">{v60.toLocaleString()}</span></div>
          <div className="flex justify-between text-slate-400"><span className="text-slate-300">80%</span><span className="tabular-nums font-mono">{v80.toLocaleString()}</span></div>
          <div className="flex justify-between text-slate-500 font-medium"><span className="text-slate-400">100%</span><span className="tabular-nums font-mono">{v100.toLocaleString()}</span></div>
          <div className="text-[8px] text-slate-300 mt-1 truncate">情景参考，不代表实际发放</div>
        </div>
      )}
    </div>
  );
};

interface DynamicConsumptionProps {
  user: User;
  users: User[];
  resources: MiningResource[];
  logs: ValueCreationLog[];
  jzczLogs?: ValueCreationLog[];
  dtcbLogs?: ValueCreationLog[];
  onLogSubmit: (log: ValueCreationLog | ValueCreationLog[]) => void;
  persistWorkspaceWithOverrides?: (overrides?: { logs?: ValueCreationLog[] }, options?: { silent?: boolean; successMessage?: string; loadingMessage?: string; toastId?: string | number }) => Promise<void>;
  updateLastSyncedFingerprint?: () => void;
  systemConfig?: SystemConfig;
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
  user, users, resources, logs, jzczLogs, dtcbLogs, onLogSubmit, persistWorkspaceWithOverrides, updateLastSyncedFingerprint, systemConfig 
}) => {
  const canExport = useMemo(() => canExportExcel(user, systemConfig), [user, systemConfig]);
  const { isCostVisible, toggleCostVisible, maskMoney, maskText } = useCostPrivacy();
  const { isLocked } = useDedupe(500);
  const { isBroken, retryAfter, recordFailure, recordSuccess } = useCircuitBreaker();

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
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedOperatorId, filterStartDate, filterEndDate, filterMonth, activeTab]);
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
    if (isLocked('dc-submit')) return;
    const isB2 = costCategory === 'B' && valueConsumptionMode === 'B2';
    const isD = costCategory === 'D';
    
    if (selectedType !== RefineType.NonEffectiveHours && !costCategory) {
      showAlert('请选择消耗类别（A/B1/B2/C/D）。');
      return;
    }

    if ((!isD && !selectedMiningId) || !selectedType || (!recordedCollectorId && !isB2 && !isD) || dynamicCost <= 0) {
      showAlert('请确保“采集主体”、“消耗类型”及“关联信息”已完整填写且数值大于0。');
      return;
    }

    const categoryLabel = costCategory === 'B' && valueConsumptionMode === 'B2' ? 'B2' : costCategory;
    const mineNotice = isD ? '【归属】经营单元公摊（无项目列支）' : `【矿山】${selectedMiningId}`;

    showConfirm(
      `确定提报动态消耗申请？\n\n【类别】${categoryLabel}类消耗\n${mineNotice}\n【数值】${Math.round(dynamicCost).toLocaleString()}\n【归属月份】${businessMonth}`,
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
          costCategory: selectedType === RefineType.NonEffectiveHours ? undefined : costCategory,
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
        
        const nextDtcb = [...dtcbLogsToUse, newLog];
        const payload = isGlobalReader(user) ? nextDtcb : [newLog];
        const toastId = toast.loading('申报保存中…');
        
        const executeSync = async () => {
          const res = await persistDtcbLogs(payload);
          recordSuccess();
          if (res && res.workspaceVersion !== undefined) {
            (window as any).workspaceVersion = res.workspaceVersion;
          }
          if (updateLastSyncedFingerprint) {
            setTimeout(() => updateLastSyncedFingerprint(), 0);
          }
          toast.success('已落库', { id: toastId });
        };

        if (isBroken) {
          showAlert(`系统处于熔断状态，请等待至 ${new Date(retryAfter!).toLocaleTimeString()} 后重试。`);
          return;
        }

        try {
          await executeSync();
        } catch (err: any) {
          recordFailure(executeSync);
          toastApiError(err, '申报保存失败');
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
    if (isLocked('dc-deduction-submit')) return;
    if (!deductionCollectorId || deductionAmount <= 0) {
      showAlert('请选择采集主体并输入有效对冲积分。');
      return;
    }

    showConfirm(
      `确定提交非有效工时对冲申请？\n\n【对冲数值】${Math.round(deductionAmount).toLocaleString()}\n【归属月份】${businessMonth}`,
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
        const toastId = toast.loading('对冲申请提交中…');
        try {
          const nextDtcb = [...dtcbLogsToUse, deductionLog];
          const payload = isGlobalReader(user) ? nextDtcb : [deductionLog];
          const res = await persistDtcbLogs(payload);
          if (res && res.workspaceVersion !== undefined) {
            (window as any).workspaceVersion = res.workspaceVersion;
          }
          if (updateLastSyncedFingerprint) {
            setTimeout(() => updateLastSyncedFingerprint(), 0);
          }
          toast.success('已落库', { id: toastId });
        } catch (err: any) {
          toastApiError(err, '对冲申请提交失败');
          toast.dismiss(toastId);
        }
      }
    );
  };

  const exportToExcel = () => {
    if (!canExport) {
      toast.error(EXPORT_DISABLED_TOOLTIP);
      return;
    }
    const dataToExport = consumptionLogs.map(log => {
      const { cWeightValue, b2WeightValue, revLimitStr, valLimitCStr, valLimitB2Str } = calculateConsumptionMirrorFields(log, resources, logs);

      return {
        '申报编号': log.id.startsWith('#') ? log.id : `#${log.id}`,
        '业务日期': resolveLogBusinessDate(log),
        '经营单元': users.find(u => u.id === log.rankId)?.center || '-',
        '提报时间': formatSubmissionTime(log.timestamp),
        '矿山编号': log.miningId,
        '采集主体': formatCollectorDisplay(log.recordedCollectorId, users),
        '非效对冲': (log.type === RefineType.NonEffectiveHours || isNonEffectiveHoursEffective(log)) ? Math.round(getNonEffectiveHoursDeduction(log)) : 0,
        'A': log.costCategory === 'A' ? Math.round(log.dynamicCost) : 0,
        'C': log.costCategory === 'C' ? Math.round(log.dynamicCost) : 0,
        'C权': Number(cWeightValue) < 0.8 ? `${cWeightValue} (低)` : cWeightValue,
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
    
    // Status Filter
    if (activeTab === 'pending') list = list.filter(l => l.status === AuditStatus.Pending);
    else if (activeTab === 'approved') list = list.filter(l => l.status === AuditStatus.Approved);
    else if (activeTab === 'rejected') list = list.filter(l => l.status === AuditStatus.Rejected);

    // Existing Center/Operator filter
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
  }, [dtcbLogsToUse, resources, user, users, activeTab, selectedOperatorId, filterStartDate, filterEndDate, filterMonth]);

  const paginatedConsumptionLogs = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return consumptionLogs.slice(start, start + PAGE_SIZE);
  }, [consumptionLogs, currentPage]);

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 font-sans text-[13px] text-[#1f2933] animate-in fade-in duration-300 pb-12">
      
      {/* 申报表单卡片 */}
      <Card 
        title="动态消耗申报" 
        noPadding
        headerAction={
          <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-md border border-slate-200/60">
            <button
              type="button"
              onClick={() => setShowDeductionChannel(false)}
              className={`px-3 py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${
                !showDeductionChannel 
                  ? 'bg-white text-blue-600 shadow-xs border border-slate-200/50' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              常规动态消耗
            </button>
            <button
              type="button"
              onClick={() => setShowDeductionChannel(true)}
              className={`px-3 py-1.5 text-xs font-bold rounded transition-all cursor-pointer flex items-center gap-1.5 ${
                showDeductionChannel 
                  ? 'bg-rose-600 text-white shadow-xs' 
                  : 'text-rose-600 hover:bg-rose-50'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>
              非有效工时对冲 (FXDC)
            </button>
          </div>
        }
      >
        {showDeductionChannel ? (
          <form onSubmit={handleDeductionSubmit} className="p-4 md:p-6 space-y-6">
            <div className="bg-rose-50/70 border border-rose-200/80 p-4 rounded-md space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-rose-500"></span>
                  非有效工时对冲申报通道（FXDC）
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-200/80 text-rose-800">
                  冲抵刚性工资包
                </span>
              </div>
              <p className="text-xs text-rose-700/90 leading-relaxed">
                用于离职或非有效工时等场景的刚性工资包冲减。提交后生成待确权单据（矿山编号：FXDC），审核通过后自动从对应经营单元和采集主体刚性中扣减。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
              {/* 1. 经营单元 */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4">
                  经营单元 <span className="text-rose-500 ml-1 font-bold">*</span>
                </label>
                <select
                  value={deductionOperatorId}
                  onChange={(e) => setDeductionOperatorId(e.target.value)}
                  disabled={!canSelectOthers}
                  className="w-full bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] font-bold text-slate-800 focus:outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer h-10 placeholder:text-[#94a3b8]"
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

              {/* 2. 采集主体 */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4">
                  采集主体 <span className="text-rose-500 ml-1 font-bold">*</span>
                </label>
                <select
                  value={deductionCollectorId}
                  onChange={(e) => setDeductionCollectorId(e.target.value)}
                  className="w-full bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] font-bold text-slate-800 focus:outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all cursor-pointer h-10 placeholder:text-[#94a3b8]"
                  required
                >
                  <option value="">选择采集主体...</option>
                  {collectorPool.map(u => (
                    <option key={u.id} value={u.id}>
                      {formatCollectorDisplay(u)}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. 业务日期 */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4">
                  业务日期 <span className="text-rose-500 ml-1 font-bold">*</span>
                </label>
                <input
                  type="date"
                  value={businessDate}
                  onChange={(e) => {
                    const date = e.target.value;
                    setBusinessDate(date);
                    if (date) setBusinessMonth(date.slice(0, 7));
                  }}
                  className="w-full bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] font-mono font-bold text-slate-800 focus:outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all cursor-pointer h-10"
                  required
                />
              </div>

              {/* 4. 矿山编号 (固定为 FXDC) */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4">
                  冲抵矿山编号
                </label>
                <div className="flex items-center bg-rose-50 border border-rose-200 rounded-[4px] px-3 py-2 h-10 text-[13px] font-mono font-bold text-rose-700">
                  FXDC (非有效工时对冲)
                </div>
              </div>
            </div>

            {/* 对冲积分与提交 */}
            <div className="border-t border-slate-100 pt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4">
                    对冲积分数值 <span className="text-rose-500 ml-1 font-bold">*</span>
                  </label>
                  <input
                    type="number"
                    value={deductionAmount || ''}
                    onChange={(e) => setDeductionAmount(Number(e.target.value))}
                    className="w-full text-right text-base font-bold font-mono [font-variant-numeric:tabular-nums] text-rose-600 bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 h-10 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 transition-all placeholder:text-[#94a3b8]"
                    placeholder="0"
                    min="1"
                    required
                  />
                </div>

                <div className="flex items-end sm:pt-5.5">
                  <button
                    type="submit"
                    className="w-full h-10 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs uppercase tracking-widest rounded-[4px] shadow-sm transition-all cursor-pointer flex items-center justify-center"
                  >
                    提交对冲申请 (FXDC)
                  </button>
                </div>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-6">
          
          {/* 基本信息栅格 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {/* 1. 经营单元 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4">
                经营单元 <span className="text-rose-500 ml-1 font-bold">*</span>
              </label>
              <select
                value={selectedOperatorId}
                onChange={(e) => setSelectedOperatorId(e.target.value)}
                disabled={!canSelectOthers}
                className="w-full bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] font-bold text-slate-800 focus:outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer h-10 placeholder:text-[#94a3b8]"
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

            {/* 2. 采集主体 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4">
                采集主体 <span className="text-rose-500 ml-1 font-bold">*</span>
              </label>
              <select
                value={recordedCollectorId}
                onChange={(e) => setRecordedCollectorId(e.target.value)}
                disabled={costCategory === 'B' && valueConsumptionMode === 'B2'}
                className="w-full bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] font-bold text-slate-800 focus:outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer h-10 placeholder:text-[#94a3b8]"
                required={!(costCategory === 'B' && valueConsumptionMode === 'B2')}
              >
                <option value="">选择采集主体...</option>
                {collectorPool.map(u => (
                  <option key={u.id} value={u.id}>
                    {formatCollectorDisplay(u)}
                  </option>
                ))}
              </select>
              {selectedCollector && (
                <div className="text-[11px] text-slate-500 truncate mt-1">
                  <span className="font-bold text-slate-700">{formatCollectorDisplay(selectedCollector)}</span>
                  {collectorRoleInfo && collectorRoleInfo.incentiveImpact && (
                    <span className="text-slate-400 font-normal ml-1">· {collectorRoleInfo.incentiveImpact}</span>
                  )}
                </div>
              )}
            </div>

            {/* 3. 业务日期 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4">
                业务日期 <span className="text-rose-500 ml-1 font-bold">*</span>
              </label>
              <input
                type="date"
                value={businessDate}
                onChange={(e) => {
                  const date = e.target.value;
                  setBusinessDate(date);
                  if (date) setBusinessMonth(date.slice(0, 7));
                }}
                className="w-full bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] font-mono font-bold text-slate-800 focus:outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all cursor-pointer h-10 placeholder:text-[#94a3b8]"
                required
              />
            </div>

            {/* 4. 视角 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4">
                视角
              </label>
              <div className="flex items-center bg-slate-50 border border-[#b8d0f7] rounded-[4px] px-3 py-2 h-10 text-[13px] font-bold text-slate-800">
                {selectedOperator?.center || user.center || '无'}
              </div>
            </div>

            {/* 5. 冲抵矿山编号 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4">
                冲抵矿山编号 <span className="text-rose-500 ml-1 font-bold">*</span>
              </label>
              <select
                value={costCategory === 'D' ? '' : selectedMiningId}
                onChange={(e) => setSelectedMiningId(e.target.value)}
                disabled={costCategory === 'D'}
                className="w-full bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] font-bold text-slate-800 focus:outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer h-10 placeholder:text-[#94a3b8]"
                required={costCategory !== 'D'}
              >
                <option value="">{costCategory === 'D' ? 'D类无项目列支（经营单元公摊）' : '匹配 矿山编号...'}</option>
                {availableResources.map(r => <option key={r.id} value={r.id}>{r.id} ({r.types[0]})</option>)}
              </select>
            </div>

            {/* 6. 执行类型 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4">
                执行类型
              </label>
              <div className="flex items-center bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 h-10">
                {selectedResource ? (() => {
                  const currentUnitForDC = selectedOperator?.center || user.center || '';
                  const et = getExecutionType(selectedResource, currentUnitForDC);
                  const col = getExecutionTypeBadgeColor(et);
                  return (
                    <span 
                      title={EXECUTION_TYPE_EXPLANATIONS[et]}
                      className={`inline-block px-2 py-0.5 rounded-sm text-[11px] font-bold border ${col.bg} ${col.text} ${col.border}`}
                    >
                      {et}
                    </span>
                  );
                })() : (
                  <span className="text-slate-400 text-xs">未选择矿山</span>
                )}
              </div>
            </div>

            {/* 7. 矿山状态 */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4">
                矿山状态
              </label>
              <div className="flex items-center bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 h-10">
                {costCategory === 'D' ? (
                  <span className="text-[#1a56db] font-bold text-xs">经营单元公摊 (无需矿山)</span>
                ) : selectedResource ? (
                  <ProjectStatusBadge resource={selectedResource} />
                ) : (
                  <span className="text-slate-400 text-xs">未选择矿山</span>
                )}
              </div>
            </div>
          </div>

          {/* 消耗对冲阶梯 */}
          <div className="border-t border-slate-100 pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                消耗对冲阶梯
              </span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {/* 1. A */}
              <div
                onClick={() => {
                  setCostCategory('A');
                  setSelectedCategory(RefineCategory.Revenue);
                }}
                className={`p-3 rounded-sm cursor-pointer transition-all flex flex-col items-center justify-between text-center space-y-1.5 border ${
                  costCategory === 'A'
                    ? 'bg-blue-50/60 border-[#1a56db] ring-1 ring-[#1a56db] shadow-xs'
                    : 'bg-white border-[#b8d0f7] hover:bg-slate-50'
                }`}
              >
                <div className={`text-sm font-black ${costCategory === 'A' ? 'text-[#1a56db]' : 'text-slate-800'}`}>
                  A
                </div>
                <div className="text-[11px] text-slate-400 font-medium">
                  款专类报销
                </div>
                <div className={`w-full font-mono [font-variant-numeric:tabular-nums] text-xs ${costCategory === 'A' ? 'font-black text-[#1a56db]' : 'font-bold text-slate-700'}`}>
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
                className={`p-3 rounded-sm cursor-pointer transition-all flex flex-col items-center justify-between text-center space-y-1.5 border ${
                  costCategory === 'B' && valueConsumptionMode === 'B1'
                    ? 'bg-blue-50/60 border-[#1a56db] ring-1 ring-[#1a56db] shadow-xs'
                    : 'bg-white border-[#b8d0f7] hover:bg-slate-50'
                }`}
              >
                <div className={`text-sm font-black ${costCategory === 'B' && valueConsumptionMode === 'B1' ? 'text-[#1a56db]' : 'text-slate-800'}`}>
                  B1
                </div>
                <div className="text-[11px] text-slate-400 font-medium truncate w-full" title="产专类报销 · 精准定位采集主体">
                  产专类报销
                </div>
                <div className={`w-full font-mono [font-variant-numeric:tabular-nums] text-xs ${costCategory === 'B' && valueConsumptionMode === 'B1' ? 'font-black text-[#1a56db]' : 'font-bold text-slate-700'}`}>
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
                className={`p-3 rounded-sm cursor-pointer transition-all flex flex-col items-center justify-between text-center space-y-1.5 border ${
                  costCategory === 'B' && valueConsumptionMode === 'B2'
                    ? 'bg-blue-50/60 border-[#1a56db] ring-1 ring-[#1a56db] shadow-xs'
                    : 'bg-white border-[#b8d0f7] hover:bg-slate-50'
                }`}
              >
                <div className={`text-sm font-black ${costCategory === 'B' && valueConsumptionMode === 'B2' ? 'text-[#1a56db]' : 'text-slate-800'}`}>
                  B2
                </div>
                <div className="text-[11px] text-slate-400 font-medium truncate w-full" title="产专类项目运维消耗 · 自动对冲已确权产值">
                  产专类项目运维消耗
                </div>
                <div className={`w-full font-mono [font-variant-numeric:tabular-nums] text-xs ${costCategory === 'B' && valueConsumptionMode === 'B2' ? 'font-black text-[#1a56db]' : 'font-bold text-slate-700'}`}>
                  {maskMoney(costCategory === 'B' && valueConsumptionMode === 'B2' ? Math.round(dynamicCost || 0) : 0)}
                </div>
              </div>

              {/* 4. C */}
              <div
                onClick={() => {
                  if (selectedResource && selectedOperator && 
                      selectedResource.assignedToRevenue !== selectedOperator.center) {
                    return; // 禁用
                  }
                  setCostCategory('C');
                }}
                className={`p-3 rounded-sm cursor-pointer transition-all flex flex-col items-center justify-between text-center space-y-1.5 border ${
                  costCategory === 'C'
                    ? 'bg-blue-50/60 border-[#1a56db] ring-1 ring-[#1a56db] shadow-xs'
                    : selectedResource && selectedOperator && selectedResource.assignedToRevenue !== selectedOperator.center
                    ? 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-50'
                    : 'bg-white border-[#b8d0f7] hover:bg-slate-50'
                }`}
              >
                <div className={`text-sm font-black ${costCategory === 'C' ? 'text-[#1a56db]' : 'text-slate-800'}`}>
                  C
                </div>
                <div className="text-[11px] text-slate-400 font-medium">
                  C类对冲
                </div>
                <div className={`w-full font-mono [font-variant-numeric:tabular-nums] text-xs ${costCategory === 'C' ? 'font-black text-[#1a56db]' : 'font-bold text-slate-700'}`}>
                  {maskMoney(costCategory === 'C' ? Math.round(dynamicCost || 0) : 0)}
                </div>
              </div>

              {/* 5. D */}
              <div
                onClick={() => {
                  setCostCategory('D');
                }}
                className={`p-3 rounded-sm cursor-pointer transition-all flex flex-col items-center justify-between text-center space-y-1.5 border ${
                  costCategory === 'D'
                    ? 'bg-blue-50/60 border-[#1a56db] ring-1 ring-[#1a56db] shadow-xs'
                    : 'bg-white border-[#b8d0f7] hover:bg-slate-50'
                }`}
              >
                <div className="text-sm font-black text-[#1a56db]">
                  D
                </div>
                <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400 font-medium w-full">
                  <span>经营单元公摊</span>
                  <CostTooltipIcon tooltip="经营单元公摊，无项目列支，按实际发生月人员平均分摊" />
                </div>
                <div className={`w-full font-mono [font-variant-numeric:tabular-nums] text-xs ${costCategory === 'D' ? 'font-black text-[#1a56db]' : 'font-bold text-slate-700'}`}>
                  {maskMoney(costCategory === 'D' ? Math.round(dynamicCost || 0) : 0)}
                </div>
              </div>
            </div>
          </div>

          {/* 申报积分与提交按钮区 */}
          <div className="border-t border-slate-100 pt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4">
                  申报积分 <span className="text-rose-500 ml-1 font-bold">*</span>
                </label>
                <input
                  type="number"
                  value={dynamicCost || ''}
                  onChange={(e) => { 
                    setDynamicCost(Number(e.target.value)); 
                    if(selectedType === RefineType.NonEffectiveHours) setLeaveDays(0); 
                  }}
                  className="w-full text-right text-base font-bold font-mono [font-variant-numeric:tabular-nums] text-[#1a56db] bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 h-10 focus:outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all placeholder:text-[#94a3b8]"
                  placeholder="0"
                  required={selectedCategory === RefineCategory.Revenue}
                />
              </div>

              <div className="flex items-end sm:pt-5.5">
                <button
                  type="submit"
                  className="w-full h-10 bg-slate-900 hover:bg-blue-600 active:scale-95 text-white font-black text-xs uppercase tracking-widest rounded-[4px] shadow-sm transition-all cursor-pointer flex items-center justify-center"
                >
                  提 交
                </button>
              </div>
            </div>

            <div className="bg-slate-50 border-l-2 border-[#1a56db] p-3 rounded-[4px] text-xs text-slate-500 leading-relaxed">
              该操作将直接从采集人的刚性工资包中扣除对应数值，用于对冲组织运营成本。
            </div>
          </div>

        </form>
        )}
      </Card>

      {/* 成本审计记录表格卡片 */}
      <Card
        title="成本审计记录"
        headerAction={
          <div className="flex flex-wrap items-center gap-2">
            {([
              { id: 'all', label: '全部' },
              { id: 'pending', label: '待确权' },
              { id: 'approved', label: '已确权' },
              { id: 'rejected', label: '已驳回' }
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-[10px] font-black rounded-[4px] transition-all ${
                  activeTab === tab.id 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
            <CostPrivacyToggle size="sm" />
            <button 
              id="export-excel-btn"
              onClick={exportToExcel}
              disabled={!canExport}
              title={getExportButtonTitle(canExport, '导出 EXCEL')}
              className={`px-3 py-1 border rounded-sm text-[10px] font-bold transition-colors flex items-center shadow-xs ${
                !canExport
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                  : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 cursor-pointer'
              }`}
            >
              导出 EXCEL
            </button>
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
                setFilterMonth(getLocalMonthString());
                setFilterStartDate('');
                setFilterEndDate('');
              }}
            />
          </div>
        }
        noPadding
      >
        <div className="overflow-x-auto">
          <table id="cost-audit-records-table" className="w-full text-left min-w-[1500px] border-collapse">
            <thead className="bg-slate-50/90 text-slate-400 text-[9px] font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-3 py-3 border-r border-slate-200/60">申报编号</th>
                <th className="px-2.5 py-3 text-center border-r border-slate-200/60">业务日期</th>
                <th className="px-2.5 py-3 text-center border-r border-slate-200/60">{TERMINOLOGY.BUSINESS_UNIT}</th>
                <th className="px-2.5 py-3 text-center border-r border-slate-200/60">{TERMINOLOGY.MINING_RESOURCE_ID}</th>
                <th className="px-3 py-3 border-r border-slate-200/60 whitespace-nowrap min-w-[130px]">{TERMINOLOGY.LOG_OPERATOR_ID}</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-200/60 whitespace-nowrap">FXDC</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-200/60 whitespace-nowrap">A</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-200/60 whitespace-nowrap">C积分</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-200/60 whitespace-nowrap">C权</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-200/60 whitespace-nowrap">款初/款当</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-200/60 whitespace-nowrap">产初/产当</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-200/60 whitespace-nowrap">B1</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-200/60 whitespace-nowrap">B2积分</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-200/60 whitespace-nowrap">B2权</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-200/60 whitespace-nowrap">D积分</th>
                <th className="px-2.5 py-3 text-center border-r border-slate-200/60 whitespace-nowrap">确权日期</th>
                <th className="px-3 py-3 text-center whitespace-nowrap min-w-[90px]">确权状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-[10px]">
              {paginatedConsumptionLogs.map(log => {
                const { cWeightValue, b2WeightValue, revLimitStr, valLimitCStr, valLimitB2Str } = calculateConsumptionMirrorFields(log, resources, logs);

                return (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-3 border-r border-slate-100 font-mono text-[10px]">
                      <span className="font-bold text-slate-700 block">{log.id.startsWith('#') ? log.id : `#${log.id}`}</span>
                    </td>
                    <td className="px-2.5 py-3 text-center font-mono text-slate-700 border-r border-slate-100">
                      {resolveLogBusinessDate(log)}
                    </td>
                    <td className="px-2.5 py-3 text-center font-bold text-slate-700 border-r border-slate-100">
                      {users.find(u => u.id === log.rankId)?.center || '-'}
                    </td>
                    <td className="px-2.5 py-3 text-center border-r border-slate-100">
                      {log.miningId ? (
                        <span className="font-mono font-bold text-slate-800">{log.miningId}</span>
                      ) : (
                        <span className="text-[#1a56db] font-bold">经营单元公摊</span>
                      )}
                    </td>
                    <td className="px-3 py-3 border-r border-slate-100 whitespace-nowrap min-w-[130px]">
                      <div className="font-bold text-slate-700 whitespace-nowrap">{formatCollectorDisplay(log.recordedCollectorId, users)}</div>
                      <div className="text-[9px] text-slate-400 font-normal whitespace-nowrap">{log.type}</div>
                      {(() => {
                        const collector = users.find(u => u.id === log.recordedCollectorId);
                        if (collector?.category === '高款专') {
                          const unitAmount = Math.round(logs
                            .filter(l => l.rankId === log.rankId && l.miningId === log.miningId)
                            .reduce((sum, l) => sum + (l.amount || 0) + (l.rawAmount || 0), 0));
                          return (
                            <div className="mt-1 px-1 py-0.5 border border-slate-200 border-dashed rounded-[2px] text-[8px] text-slate-400 text-center">
                              经营单元本级：{unitAmount.toLocaleString()}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </td>
                    
                    {/* 数值列：如果是FXDC则特殊处理 */}
                    {log.type === RefineType.NonEffectiveHours || isNonEffectiveHoursEffective(log) ? (
                      <>
                        <td className="px-2.5 py-3 text-right font-mono font-bold text-rose-600 border-r border-slate-100 whitespace-nowrap">{maskMoney(Math.round(getNonEffectiveHoursDeduction(log)))}</td>
                        <td colSpan={10} className="px-2.5 py-3 text-center text-[#bbb] italic border-r border-slate-100">—</td>
                      </>
                    ) : (
                      <>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-300 border-r border-slate-100">—</td>
                        {/* A: 理论（额度）列 */}
                        <td className="px-2.5 py-3 text-right border-r border-slate-100">
                          {log.costCategory === 'A' ? <TieredValueDisplay value={log.dynamicCost} /> : '—'}
                        </td>
                        <td className="px-2.5 py-3 text-right font-mono font-bold text-slate-700 border-r border-slate-100 whitespace-nowrap">{log.costCategory === 'C' ? maskMoney(Math.round(log.dynamicCost)) : '—'}</td>
                        <td className={`px-2.5 py-3 text-right font-mono border-r border-slate-100 whitespace-nowrap ${Number(cWeightValue) < 0.8 ? 'bg-amber-100/60 text-amber-900 font-bold' : 'text-slate-600'}`} title={Number(cWeightValue) < 0.8 ? "当前 C 权低于 0.8，请确认风险。" : undefined}>
                          <span className="inline-flex items-center justify-end gap-1">
                            {cWeightValue || '—'}
                            {Number(cWeightValue) < 0.8 && (
                              <span className="px-1 py-0.2 text-[9px] bg-amber-500 text-white rounded font-black shadow-sm" title="当前 C 权低于 0.8，请确认风险。">
                                ⚠️ 低
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-600 border-r border-slate-100 whitespace-nowrap">{revLimitStr || '—'}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-600 border-r border-slate-100 whitespace-nowrap">{valLimitCStr || '—'}</td>
                        <td className="px-2.5 py-3 text-right font-mono font-bold text-slate-700 border-r border-slate-100 whitespace-nowrap">{(log.costCategory === 'B' && log.valueConsumptionMode === 'B1') ? maskMoney(Math.round(log.dynamicCost)) : '—'}</td>
                        <td className="px-2.5 py-3 text-right font-mono font-bold text-slate-700 border-r border-slate-100 whitespace-nowrap">{(log.costCategory === 'B' && log.valueConsumptionMode === 'B2') ? maskMoney(Math.round(log.dynamicCost)) : '—'}</td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-600 border-r border-slate-100 whitespace-nowrap">{b2WeightValue || '—'}</td>
                        <td className="px-2.5 py-3 text-right font-mono font-bold text-slate-700 border-r border-slate-100 whitespace-nowrap">{log.costCategory === 'D' ? maskMoney(Math.round(log.dynamicCost)) : '—'}</td>
                      </>
                    )}

                    <td className="px-2.5 py-3 text-center font-mono text-slate-500 border-r border-slate-100 text-[9px] whitespace-nowrap">
                      {log.confirmedAt ? new Date(log.confirmedAt).toLocaleDateString('zh-CN') : '-'}
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap min-w-[90px]">
                      <Badge variant={log.status === AuditStatus.Approved ? 'success' : log.status === AuditStatus.Rejected ? 'error' : 'info'}>
                        {formatAuditStatusLabel(log.status)}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {consumptionLogs.length === 0 && (
                <tr>
                  <td colSpan={17} className="px-6 py-20 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest">
                    {UI_LABELS.EMPTY_DEFAULT}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {Math.ceil(consumptionLogs.length / PAGE_SIZE) > 1 && (
          <div className="flex items-center justify-between px-6 py-4 bg-white border-t border-slate-100">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              显示 {Math.min(consumptionLogs.length, (currentPage - 1) * PAGE_SIZE + 1)}-{Math.min(consumptionLogs.length, currentPage * PAGE_SIZE)} / 共 {consumptionLogs.length} 条
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <button 
                  disabled={currentPage === 1}
                  onClick={() => {
                    setCurrentPage(prev => Math.max(1, prev - 1));
                  }}
                  className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={18} className="text-slate-600" />
                </button>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-xs font-black text-slate-900">{currentPage}</span>
                  <span className="text-[10px] font-bold text-slate-400">/</span>
                  <span className="text-[10px] font-bold text-slate-400">{Math.ceil(consumptionLogs.length / PAGE_SIZE)}</span>
                </div>
                <button 
                  disabled={currentPage === Math.ceil(consumptionLogs.length / PAGE_SIZE)}
                  onClick={() => {
                    setCurrentPage(prev => Math.min(Math.ceil(consumptionLogs.length / PAGE_SIZE), prev + 1));
                  }}
                  className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={18} className="text-slate-600" />
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <CityGuardianModal state={modalState} onClose={closeModal} />
    </div>
  );
};

export default DynamicConsumption;
