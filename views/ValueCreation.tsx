
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDedupe } from '../src/hooks/useDedupe';
import { useCircuitBreaker } from '../src/hooks/useCircuitBreaker';
import { TIER_COEFFICIENTS, USER_LIST, UI_LABELS } from '@/constants';
import { 
  User, MiningResource, ValueCreationLog, RefineCategory, AuditStatus, Role, RefineType,
  InternalTransaction, TransactionStatus, TransactionType, CircuitBreaker, QuotaSnapshot,
  ProjectStatus
} from '../types';
import { 
  reconcileMiningLogs, 
  sumConfirmedRevenuePackage, 
  sumValueConversionPackage, 
  sumIncomeProductionPackage 
} from '@/utils/reconcileMiningFromLogs';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  Cell, Legend, CartesianGrid, ComposedChart, Line, PieChart, Pie
} from 'recharts';
import { Card, ProgressBar, Badge, ProjectStatusBadge } from '@/components/UI';
import StandardModal from '@/components/StandardModal';
import { TERMINOLOGY } from '@/constants/terminology';
import { aggregateMiningQuadrantsFromLogs, calculateSingleResourceQuadrants } from '@/utils/purification';
import { XLSX, exportWorkbook, buildExcelFilename, EXCEL_IMPORT_MAX_BYTES, EXCEL_IMPORT_MAX_ROWS } from '@/utils/excelIo';
import { calculateHistoricalNetValue, calculateDualTrackCoreMatrices, calculateT1PlusValue, calculateT1PlusRevenue } from '@/utils/business';
import { calculateHedgeCapacitiesAndWeights, normalizeRefineTier, calculateInjectedAmount, getRawInputAmount } from '@/utils/consumptionHedge';
import { deriveProjectStatus, isProjectWritable } from '@/utils/projectStatus';
import { isAdminOrNpc, parseCenterList, canExportExcel, getExportButtonTitle, EXPORT_DISABLED_TOOLTIP } from '@/utils/accessControl';
import { SystemConfig } from '@/types';
import { isSalaryActiveForMonth } from '@/utils/employmentStatus';
import { userCenterMatchesBusinessUnit, businessUnitLabelsEqual } from '@/utils/businessUnitName';
import { isCenterManagerUser, sortCenterManagers } from '@/utils/centerManager';
import { centerMatch, isGlobalReader, filterAuditLogsByCenter } from '@/utils/centerScope';
import { labelBusinessUnit } from '@/utils/statusDisplay';
import { formatCollectorDisplay } from '@/utils/collector';
import { safeGetItem, safeSetItem, safeRemoveItem } from '@/utils/safeLocalStorage';
import { toast } from 'sonner';

const IMPORT_IN_PROGRESS_KEY = 'vc_import_in_progress';
import { CityGuardianModal, useCityGuardianModal } from '@/components/CityGuardianModal';
import { Info, AlertCircle, CheckCircle2, X, ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react';

interface FailedImportRow {
  lineNum: number;
  miningId: string;
  categoryStr: string;
  businessDateStr: string;
  collectorStr: string;
  rawAmountStr: string;
  reason: string;
}

function parseBusinessDateStr(val: any): { dateObj: Date | null; formattedStr: string } {
  if (val === undefined || val === null || String(val).trim() === '') {
    return { dateObj: null, formattedStr: '' };
  }

  // Handle numeric Excel date serial number (e.g. 45678)
  if (typeof val === 'number' || (!isNaN(Number(val)) && !String(val).includes('-') && !String(val).includes('/'))) {
    const serial = Number(val);
    if (serial > 10000 && serial < 100000) {
      const utcDays = Math.floor(serial - 25569);
      const utcValue = utcDays * 86400;
      const dateInfo = new Date(utcValue * 1000);
      const y = dateInfo.getUTCFullYear();
      const m = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dateInfo.getUTCDate()).padStart(2, '0');
      const formatted = `${y}-${m}-${d}`;
      return { dateObj: new Date(formatted), formattedStr: formatted };
    }
  }

  // Handle string formats like "2026/1/30", "2026-01-30", "2026/01/30"
  const rawStr = String(val).trim().replace(/\//g, '-');
  const parts = rawStr.split('-');
  if (parts.length === 3) {
    const y = parts[0].trim();
    const m = parts[1].trim().padStart(2, '0');
    const d = parts[2].trim().padStart(2, '0');
    if (y.length === 4 && !isNaN(Number(y)) && !isNaN(Number(m)) && !isNaN(Number(d))) {
      const formatted = `${y}-${m}-${d}`;
      const dateObj = new Date(formatted);
      if (!isNaN(dateObj.getTime())) {
        return { dateObj, formattedStr: formatted };
      }
    }
  }

  // General Date parsing fallback
  const fallbackDate = new Date(rawStr);
  if (!isNaN(fallbackDate.getTime())) {
    const y = fallbackDate.getFullYear();
    const m = String(fallbackDate.getMonth() + 1).padStart(2, '0');
    const d = String(fallbackDate.getDate()).padStart(2, '0');
    return { dateObj: fallbackDate, formattedStr: `${y}-${m}-${d}` };
  }

  return { dateObj: null, formattedStr: String(val).trim() };
}
import {
  getInitialRevenueCapacity,
  getInitialValueCapacity,
  getCurrentRevenueCapacity,
  getCurrentValueCapacity
} from '@/utils/miningCapacity';
import {
  importNetAmount,
  importBatchNetFromRawSum,
  importGroupKey,
  importGroupQuotaExceeded,
  importAlreadyAtOrOverLimit,
  importGroupPostOccupancy,
  formatImportQuotaExceededReason,
  allocateImportRowAmounts,
} from '@/utils/importQuotaCheck';
import { getExecutionType, getExecutionTypeBadgeColor, EXECUTION_TYPE_EXPLANATIONS } from '@/utils/executionType';
import {
  getLocalDateString,
  getLocalMonthString,
  resolveLogBusinessDate,
  resolveLogBusinessMonth,
  formatSubmissionDate,
  formatSubmissionTime,
  isDateInRange,
  isLogInFilter,
} from '@/utils/dateUtils';
import { formatMoney, roundMoney } from '@/utils/formatMoney';
import { InfoTip } from '@/components/InfoTip';
import { BusinessDateFilter } from '@/components/BusinessDateFilter';

// Audit Modal Component
const AuditModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  data: { metric: string; original: number; target: number }[];
}> = ({ isOpen, onClose, onConfirm, data }) => {
  const cRow = data.find(d => d.metric === 'C权');
  const isLowC = cRow ? cRow.target < 0.8 : false;

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onClose}
      title="城市守护者"
      subtitle="提报数据核对与确权审计"
      maxWidthClassName="max-w-lg"
    >
      <div className="space-y-6">
        {isLowC && cRow && (
          <div className="p-4 bg-amber-50 border border-amber-200/80 rounded-2xl flex items-start gap-3 text-amber-900 shadow-sm">
            <span className="text-xl">⚠️</span>
            <div className="text-xs font-bold leading-relaxed">
              <p className="font-black text-amber-950 mb-0.5">风险提示</p>
              <p>当前 C 权值为 {cRow.target.toFixed(4)}，当前 C 权低于 0.8，请确认是否继续提交。</p>
            </div>
          </div>
        )}
        <div className="overflow-x-auto border border-slate-100 rounded-xl custom-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left font-black text-[10px] text-slate-500 uppercase tracking-widest p-4">指标名称</th>
                <th className="text-right font-black text-[10px] text-slate-500 uppercase tracking-widest p-4">原始值</th>
                <th className="text-right font-black text-[10px] text-slate-500 uppercase tracking-widest p-4">目标值</th>
                <th className="text-right font-black text-[10px] text-slate-500 uppercase tracking-widest p-4">差异值</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 font-bold text-slate-800">{row.metric}</td>
                  <td className="text-right p-4 font-semibold text-slate-600 font-mono">{row.original.toFixed(3)}</td>
                  <td className="text-right p-4 font-semibold text-slate-900 font-mono">{row.target.toFixed(3)}</td>
                  <td className={`text-right p-4 font-bold font-mono ${(row.target - row.original) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {(row.target - row.original).toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <button 
            type="button"
            onClick={onClose} 
            className="px-6 py-3 border border-slate-200 hover:bg-slate-50 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-600 transition-all focus:outline-none"
          >
            返回修改
          </button>
          <button 
            type="button"
            onClick={onConfirm} 
            className="px-6 py-3 bg-slate-900 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95 focus:outline-none"
          >
            确认提交
          </button>
        </div>
      </div>
    </StandardModal>
  );
};

interface ValueCreationProps {
  user: User;
  users?: User[];
  resources: MiningResource[];
  logs: ValueCreationLog[];
  onLogSubmit: (log: ValueCreationLog | ValueCreationLog[], options?: { isImport?: boolean; skipSystemLogs?: boolean }) => void;
  onSwitchTab?: (tab: string) => void;
  transactions?: InternalTransaction[];
  onConfirmTransaction?: (id: string, status: TransactionStatus) => void;
  circuitBreakers?: CircuitBreaker[];
  onAddCircuitBreaker?: (cb: CircuitBreaker) => void;
  quotaSnapshots?: Record<string, QuotaSnapshot>;
  processingLogIds?: Set<string>;
  persistWorkspaceWithOverrides?: (overrides?: { logs?: ValueCreationLog[]; importBatchId?: string }, options?: { silent?: boolean; successMessage?: string; loadingMessage?: string; toastId?: string | number }) => Promise<void>;
  onPauseAutoSync?: (paused: boolean) => void;
  systemConfig?: SystemConfig;
}

type TimePeriod = 'monthly' | 'quarterly' | 'yearly';

export const tierDisplayMap: Record<string, { name: string, desc: string }> = {
  T1: { name: 'T1 级提炼 (企项配方)', desc: '默认结算方式 (高产专 53% / 产专 48%)' },
  T2: { name: 'T2 级提炼 (招采配方)', desc: '招标采购结算 (高产专 60% / 产专 55%)' },
  T3: { name: 'T3 级提炼 (安评配方)', desc: '安全评价结算 (高产专 50% / 产专 40%)' },
  A: { name: 'T1 级提炼 (企项配方)', desc: '默认结算方式 (高产专 53% / 产专 48%)' },
  B: { name: 'T2 级提炼 (招采配方)', desc: '招标采购结算 (高产专 60% / 产专 55%)' },
  C: { name: 'T3 级提炼 (安评配方)', desc: '安全评价结算 (高产专 50% / 产专 40%)' },
  D: { name: 'T4 级提炼 (检测配方)', desc: '电气检测结算 (高产专 52% / 产专 52%)' }
};

const ValueCreation: React.FC<ValueCreationProps> = ({ 
  user, users = [], resources, logs, onLogSubmit, transactions = [], onConfirmTransaction, circuitBreakers = [], onAddCircuitBreaker,
  quotaSnapshots = {}, processingLogIds = new Set(), persistWorkspaceWithOverrides, onPauseAutoSync, systemConfig
}) => {
  const canExport = useMemo(() => canExportExcel(user, systemConfig), [user, systemConfig]);
  const miningReconciliations = useMemo(() => reconcileMiningLogs(logs, resources), [logs, resources]);

  const [managedUsers, setManagedUsers] = useState<User[]>([]);
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>(user.id);
  const [selectedCollectors, setSelectedCollectors] = useState<{ id: string, amount: number, rawAmount?: number }[]>([]);
  const [selectedMiningId, setSelectedMiningId] = useState('');
  const [miningSearchTerm, setMiningSearchTerm] = useState('');
  const { modalState, showAlert, showConfirm, closeModal } = useCityGuardianModal();
  const { isLocked } = useDedupe(500);
  const { isBroken, retryAfter, recordFailure, recordSuccess } = useCircuitBreaker();
  const [selectedRefineType, setSelectedRefineType] = useState<RefineType>(RefineType.Enterprise);
  const [selectedCategory, setSelectedCategory] = useState<RefineCategory>(RefineCategory.Revenue);
  const [selectedTier, setSelectedTier] = useState<string>('T1');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('企业项目');
  const [error, setError] = useState('');
  const [recordTab, setRecordTab] = useState<'revenue' | 'linkedPending' | 'confirmed'>('revenue');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(() => getLocalMonthString()); // YYYY-MM
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [auditData, setAuditData] = useState<{ metric: string; original: number; target: number }[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString()); // YYYY-MM-DD
  const [filterMonth, setFilterMonth] = useState<string>(() => getLocalMonthString()); // 记录筛选月份
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedOperatorId, recordTab, filterMonth, filterStartDate, filterEndDate]);

  useEffect(() => {
    setSelectedOperatorId(user.id);
  }, [user.id]);

  useEffect(() => {
    const resource = resources.find(r => r.id === selectedMiningId);
    if (resource) {
      const prefix = (resource.id || '').charAt(0).toUpperCase();
      if (prefix === 'A') {
        setSelectedTier('T1');
        setSelectedSubCategory('企业项目');
        setSelectedRefineType(RefineType.Enterprise);
      } else if (prefix === 'B') {
        setSelectedTier('T2');
        setSelectedSubCategory('招采项目');
        setSelectedRefineType(RefineType.Bidding);
      } else if (prefix === 'C') {
        setSelectedTier('T3');
        setSelectedSubCategory('安全评价');
        setSelectedRefineType(RefineType.SafetyEval);
      } else if (resource.types && resource.types.length > 0) {
        setSelectedRefineType(resource.types[0]);
      }
    } else {
      setSelectedRefineType('' as RefineType);
    }
  }, [selectedMiningId, resources]);

  // 使用单一源头同步 RefineType, Tier, SubCategory
  useEffect(() => {
    // 映射逻辑
    const mappings: Partial<Record<RefineType, { tier: string, subCategory: string }>> = {
      [RefineType.Enterprise]: { tier: 'T1', subCategory: '企业项目' },
      [RefineType.Bidding]: { tier: 'T2', subCategory: '招标采购项目' },
      [RefineType.SafetyEval]: { tier: 'T3', subCategory: '安全评价' },
      [RefineType.OccHealthElectric]: { tier: 'T3', subCategory: '职业卫生/电气检测' },
      [RefineType.OccHealth]: { tier: 'T3', subCategory: '职业卫生' },
      [RefineType.Outsourced]: { tier: 'T1', subCategory: '战略性外派' },
      [RefineType.EmergencyG]: { tier: 'T1', subCategory: '应急演练（G)' },
      [RefineType.TrainingG]: { tier: 'T1', subCategory: '培训（G）' },
      [RefineType.NonEffectiveHours]: { tier: 'T1', subCategory: '企业项目' }
    };

    const mapping = mappings[selectedRefineType];
    if (mapping) {
      if (selectedTier !== mapping.tier) setSelectedTier(mapping.tier);
      if (selectedSubCategory !== mapping.subCategory) setSelectedSubCategory(mapping.subCategory);
    }
  }, [selectedRefineType]);


  const getCClassCostForResource = React.useCallback((status: AuditStatus) => {
    if (selectedMiningId) {
      return logs
        .filter(l => 
          l.miningId === selectedMiningId && 
          l.costCategory === 'C' && 
          l.dynamicCost > 0 && 
          l.status === status
        )
        .reduce((sum, l) => sum + l.dynamicCost, 0);
    }
    return 0;
  }, [selectedMiningId, logs]);

  const getB2ClassCostForResource = React.useCallback((status: AuditStatus) => {
    if (selectedMiningId) {
      return logs
        .filter(l => 
          l.miningId === selectedMiningId && 
          l.costCategory === 'B' && 
          l.valueConsumptionMode === 'B2' &&
          l.dynamicCost > 0 && 
          l.status === status
        )
        .reduce((sum, l) => sum + l.dynamicCost, 0);
    }
    return 0;
  }, [selectedMiningId, logs]);

  const getCClassCostForCollector = React.useCallback((collectorId: string) => {
    // 保持兼容性，但现在返回资源维度的总消耗
    return getCClassCostForResource(AuditStatus.Confirmed) + getCClassCostForResource(AuditStatus.Approved) +
           getB2ClassCostForResource(AuditStatus.Confirmed) + getB2ClassCostForResource(AuditStatus.Approved);
  }, [getCClassCostForResource, getB2ClassCostForResource]);

  useEffect(() => {
    setManagedUsers(users && users.length > 0 ? users : []);
  }, [users]);

  const canSelectOthers = useMemo(() => {
    return isCenterManagerUser(user) || user.category === '系统管理员' || user.role === Role.Admin;
  }, [user]);

  const businessUnitManagers = useMemo(() => {
    const managers = managedUsers.filter(u => isCenterManagerUser(u));
    return sortCenterManagers(managers);
  }, [managedUsers]);

  useEffect(() => {
    // 自动匹配当前智能体账号所属经营单元
    if (user.center) {
      // Search within businessUnitManagers to ensure we only pick valid ones
      const businessUnitRep = businessUnitManagers.find(u => {
        return isCenterManagerUser(u) && centerMatch(u.center, user.center);
      });
      if (businessUnitRep) {
        setSelectedOperatorId(businessUnitRep.id);
      } else if (isCenterManagerUser(user) || user.category === '系统管理员' || user.role === Role.Admin) {
        setSelectedOperatorId(user.id);
      } else {
        // 如果当前用户不是负责人且没找到对应负责人，清空以防止非法提交
        setSelectedOperatorId('');
      }
    } else {
      setSelectedOperatorId(user.id);
    }
  }, [user.id, user.center, businessUnitManagers]);
  const isRevenueExpert = (u: User) => ['初款专', '中款专', '高款专', '经管员高款专'].includes(u.category || '') || (u.category || '').includes('高款专-') || (u.secondaryRoles || []).includes('高款专');
  const isValueExpert = (u: User) => ['初产专', '中产专', '高产专', '经管员高产专'].includes(u.category || '') || (u.category || '').includes('高产专-') || (u.secondaryRoles || []).includes('高产专');

  const collectorPool = useMemo(() => managedUsers.filter(u => {
    const isCollector = isRevenueExpert(u) || isValueExpert(u) || [Role.Operator, Role.RevenueCollector, Role.ValueCollector].includes(u.role);
    if (!isCollector) return false;
    const currentMonth = selectedDate ? selectedDate.slice(0, 7) : getLocalMonthString();
    if (!isSalaryActiveForMonth(u, currentMonth)) return false;
    // 注入积分 采集主体 只显示 同一 经营单元 采集主体列表
    if (user.center) {
      if (!centerMatch(u.center, user.center)) return false;
    }
    return true;
  }), [managedUsers, user.center, selectedDate]);
  
  const isCategoryLocked = useMemo(() => {
    return selectedCollectors.some(c => {
      const u = managedUsers.find(user => user.id === c.id);
      return u && (isRevenueExpert(u) || isValueExpert(u));
    });
  }, [selectedCollectors, managedUsers]);

  // 自动匹配提炼属性类别并锁定
  // 规则：最后一个选中的专员决定锁定类别。如果同时存在，以后选中的为准。
  useEffect(() => {
    if (selectedCollectors.length > 0) {
      // 从后往前找最后一个专员，决定锁定类别
      for (let i = selectedCollectors.length - 1; i >= 0; i--) {
        const c = selectedCollectors[i];
        const u = managedUsers.find(user => user.id === c.id);
        if (u) {
          const isRevenue = isRevenueExpert(u);
          const isWood = isValueExpert(u);
          
          if (isRevenue && !isWood) {
            setSelectedCategory(RefineCategory.Revenue);
            break;
          }
          if (isWood && !isRevenue) {
            setSelectedCategory(RefineCategory.Value);
            break;
          }
          // 如果既是收款又是产值专家（兼任），则由当前选中的 selectedCategory 决定（不强制切换）
        }
      }
    }
  }, [selectedCollectors, managedUsers]);

  useEffect(() => {
    const isRev = selectedCategory === RefineCategory.Revenue;
    setSelectedCollectors(prev => {
      let changed = false;
      const next = prev.map(sc => {
        const raw = sc.rawAmount !== undefined && sc.rawAmount !== null ? sc.rawAmount : sc.amount;
        const expectedAmount = importNetAmount(raw, isRev);
        if (sc.amount !== expectedAmount || sc.rawAmount !== raw) {
          changed = true;
          return { ...sc, rawAmount: raw, amount: expectedAmount };
        }
        return sc;
      });
      return changed ? next : prev;
    });
  }, [selectedCategory]);

  const selectedOperator = useMemo(() => managedUsers.find(u => u.id === selectedOperatorId), [managedUsers, selectedOperatorId]);
  const availableResources = useMemo(() => {
    if (!selectedOperator) return [];
    return resources.filter(r => {
      // 仅进行中状态可提报
      if (!isProjectWritable(r)) return false;
      
      if (selectedCategory === RefineCategory.Revenue) {
        return centerMatch(r.assignedToRevenue, selectedOperator.center) || centerMatch(r.assignedTo, selectedOperator.center);
      } else {
        return centerMatch(r.assignedToValue, selectedOperator.center) || centerMatch(r.assignedTo, selectedOperator.center);
      }
    });
  }, [resources, selectedOperator, selectedCategory]);

  // 计算当前选中的矿山详情
  const selectedResource = useMemo(() => {
    return resources.find(r => r.id === selectedMiningId);
  }, [resources, selectedMiningId]);

  useEffect(() => {
    if (selectedMiningId && !availableResources.some(r => r.id === selectedMiningId)) {
      setSelectedMiningId('');
    }
  }, [availableResources, selectedMiningId]);

  // 矿山占用同源：基于实际流水 logs 统一计算已确权、待确权及已提炼占用量，避免与 JSON 分叉
  const mineralOccupancy = useMemo(() => {
    // VC-03-F: 使用 SSOT 统一口径
    const q = aggregateMiningQuadrantsFromLogs(logs, resources, selectedResource?.id, user.center, managedUsers);
    return {
      confirmedRevenue: q.revenue.confirmed,
      pendingRevenue: q.revenue.pending,
      confirmedValue: q.value.confirmed,
      pendingValue: q.value.pending,
      minedRevenue: q.revenue.mined,
      minedValue: q.value.mined,
      unconfirmedRevenue: q.revenue.unconfirmed,
      unconfirmedValue: q.value.unconfirmed
    };
  }, [selectedResource, logs, resources, user.center, managedUsers]);

  // 计算最高可提炼量（剩余额度）
  const maxAllowed = useMemo(() => {
    if (!selectedResource) return 0;
    return selectedCategory === RefineCategory.Revenue ? mineralOccupancy.unconfirmedRevenue : mineralOccupancy.unconfirmedValue;
  }, [selectedResource, selectedCategory, mineralOccupancy]);

  // 计算从内部交易中接收到的积分上限 (仅针对接收方)
  const isOriginalOwner = useMemo(() => {
    if (!selectedResource || !user.center) return false;
    if (selectedCategory === RefineCategory.Revenue) {
      return centerMatch(selectedResource.assignedToRevenue, user.center) || centerMatch(selectedResource.assignedTo, user.center);
    } else {
      return centerMatch(selectedResource.assignedToValue, user.center) || centerMatch(selectedResource.assignedTo, user.center);
    }
  }, [selectedResource, user.center, selectedCategory]);

  const userCenterUsers = useMemo(() => {
    if (!user.center) return new Set([user.id]);
    return new Set(managedUsers.filter(u => centerMatch(u.center, user.center)).map(u => u.id));
  }, [managedUsers, user.center, user.id]);

  const receivedLimit = useMemo(() => {
    if (!selectedMiningId || !user.id) return Infinity;
    
    // 过滤出接收方属于当前接收经营单元的已确权资源交易（认 receiverId 本人或同 center 用户）
    const receivedTxs = transactions.filter(tx => 
      (tx.receiverId === user.id || userCenterUsers.has(tx.receiverId)) && 
      tx.miningId === selectedMiningId && 
      tx.status === TransactionStatus.Verified &&
      tx.type === TransactionType.Resource
    );

    if (receivedTxs.length > 0) {
      if (selectedCategory === RefineCategory.Revenue) {
        const totalRevenue = receivedTxs.reduce((sum, tx) => sum + (tx.revenueAmount || 0), 0);
        return Math.round(totalRevenue); // 面值 1:1，禁止对交易额再 ×0.933
      } else {
        const totalValue = receivedTxs.reduce((sum, tx) => sum + (tx.valueAmount || 0), 0);
        return Math.round(totalValue); // 面值 1:1
      }
    }
    
    // 如果是管理员或原始所有者，不受交易限制（受物理上限限制）
    if (user.role === Role.Admin || isOriginalOwner) return Infinity;

    return 0; // 既不是原始所有者也没收到交易，不能提报
  }, [transactions, selectedMiningId, user.id, user.role, userCenterUsers, selectedCategory, isOriginalOwner]);

  // 计算已注入累计积分（属于本单元该矿该轨流水，含待审/已确权等现有门禁范围）
  const alreadyInjected = useMemo(() => {
    if (!selectedMiningId || !user.id) return 0;
    return logs
      .filter(l => 
        l.miningId === selectedMiningId && 
        (l.recordedCollectorId === user.id || userCenterUsers.has(l.recordedCollectorId || '')) && 
        l.category === selectedCategory &&
        (l.status === AuditStatus.Pending || l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved)
      )
      .reduce((sum, l) => sum + Number(l.amount || 0), 0);
  }, [logs, selectedMiningId, user.id, userCenterUsers, selectedCategory]);

  const remainingQuota = useMemo(() => {
    if (receivedLimit === Infinity) return maxAllowed;
    return Math.max(0, receivedLimit - alreadyInjected);
  }, [receivedLimit, alreadyInjected, maxAllowed]);

  const isRefineTypeCustomFactor = useMemo(() => {
    if (!selectedResource || !selectedRefineType) return false;
    if (selectedCategory === RefineCategory.Value) {
      return selectedResource.refineTypeFactors?.[selectedRefineType as RefineType]?.customValueFactor !== undefined;
    } else {
      return selectedResource.refineTypeFactors?.[selectedRefineType as RefineType]?.customRevenueFactor !== undefined;
    }
  }, [selectedResource, selectedCategory, selectedRefineType]);

  const isResourceCustomFactor = useMemo(() => {
    if (!selectedResource) return false;
    if (selectedCategory === RefineCategory.Value) {
      return selectedResource.customValueFactor !== undefined;
    } else {
      return selectedResource.customRevenueFactor !== undefined;
    }
  }, [selectedResource, selectedCategory]);

  const hasCustomFactor = isRefineTypeCustomFactor || isResourceCustomFactor;

  // 1. 核心核算算法：角色 * 资产 * 阶梯
  const getFactorForCollector = React.useCallback((collectorId: string) => {
    // 优先从矿山私有配方中获取系数
    if (selectedResource) {
      if (selectedCategory === RefineCategory.Value) {
        if (selectedRefineType && selectedResource.refineTypeFactors?.[selectedRefineType as RefineType]?.customValueFactor !== undefined) {
          return selectedResource.refineTypeFactors[selectedRefineType as RefineType]!.customValueFactor;
        }
        if (selectedResource.customValueFactor !== undefined) {
          return selectedResource.customValueFactor;
        }
      }
      if (selectedCategory === RefineCategory.Revenue) {
        if (selectedRefineType && selectedResource.refineTypeFactors?.[selectedRefineType as RefineType]?.customRevenueFactor !== undefined) {
          return selectedResource.refineTypeFactors[selectedRefineType as RefineType]!.customRevenueFactor;
        }
        if (selectedResource.customRevenueFactor !== undefined) {
          return selectedResource.customRevenueFactor;
        }
      }
    }

    const collector = managedUsers.find(u => u.id === collectorId);
    if (!collector) return 0;

    const isHighValueExpert = (collector.category || '').includes('高产专') || (collector.secondaryRoles || []).includes('高产专');
    const isHighRevenueExpert = (collector.category || '').includes('高款专') || (collector.secondaryRoles || []).includes('高款专');
    const isRevenueSpecialist = isRevenueExpert(collector);

    // ... (Keep existing coeffs logic check if needed or just use coefficients)
    const vCoeffs = isHighValueExpert ? TIER_COEFFICIENTS.VALUE_MANAGER : TIER_COEFFICIENTS.VALUE_CHAN;

    const tier = normalizeRefineTier(selectedTier);
    if (selectedCategory === RefineCategory.Value) {
      if (tier === 'T1') return vCoeffs.Enterprise;
      if (tier === 'T2') return vCoeffs.Bidding;
      if (tier === 'T3') return vCoeffs.SafetyEval;
      return vCoeffs.OccHealth;
    }

    const rCoeffs = isHighRevenueExpert ? TIER_COEFFICIENTS.REVENUE_HIGH : TIER_COEFFICIENTS.REVENUE_MID_INITIAL;

    if (tier === 'T1') return rCoeffs.Enterprise;
    if (tier === 'T2') return rCoeffs.Bidding;
    if (tier === 'T3') return rCoeffs.SafetyEval;
    return rCoeffs.SafetyEval; // Default
  }, [selectedCategory, selectedTier, managedUsers, selectedResource, selectedRefineType]);

  const getHedgeWeight = React.useCallback((collectorId: string, amount: number) => {
    if (!selectedResource) return { cWeight: 1, b2Weight: 1, combined: 1 };

    const allResourceLogs = logs.filter(l => l && l.miningId === selectedMiningId && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved));
    const hedgeInfo = calculateHedgeCapacitiesAndWeights(selectedResource, allResourceLogs);
    
    const isRevenue = selectedCategory === RefineCategory.Revenue;
    const cWeight = hedgeInfo.cWeightRev;
    const b2Weight = hedgeInfo.b2Weight;

    return {
      cWeight,
      b2Weight,
      combined: isRevenue ? cWeight : cWeight * b2Weight
    };
  }, [selectedCategory, selectedResource, logs, selectedMiningId]);

  const calculateNetValueForCollector = React.useCallback((collectorId: string, amount: number) => {
    const factor = getFactorForCollector(collectorId);
    const weights = getHedgeWeight(collectorId, amount);
    
    // 统一公式：总预测收款包 = 注入积分 * [复合对冲权重] * 提炼因子
    // 特殊逻辑：产专角色提报款项时，需通过 C 和 B2 双重对冲
    return amount * weights.combined * factor;
  }, [getFactorForCollector, getHedgeWeight]);

  const totalNetValue = useMemo(() => {
    return selectedCollectors.reduce((sum, c) => sum + calculateNetValueForCollector(c.id, c.amount), 0);
  }, [selectedCollectors, calculateNetValueForCollector]);

  // 2. 成本分摊统计：计算所有采集主体的历史总提报行数
  const collectorLineStats = useMemo(() => {
    const stats: Record<string, number> = {};
    logs.forEach(l => {
      if (l.recordedCollectorId) {
        stats[l.recordedCollectorId] = (stats[l.recordedCollectorId] || 0) + 1;
      }
    });
    return stats;
  }, [logs]);

  // 3. 角色与采集主体效能透视图表数据
  const performanceData = useMemo(() => {
    const now = Date.now();
    const filterMs = timePeriod === 'monthly' ? 30 * 24 * 3600 * 1000 : 
                     timePeriod === 'quarterly' ? 90 * 24 * 3600 * 1000 : 
                     365 * 24 * 3600 * 1000;
    
    const approvedLogs = logs.filter(l => l.status === AuditStatus.Approved && (now - l.timestamp) < filterMs);
    
    // 按角色汇总
    const roleMap: Record<string, { income: number; cost: number; count: number }> = {
      '款专': { income: 0, cost: 0, count: 0 },
      '产专': { income: 0, cost: 0, count: 0 },
      '经理': { income: 0, cost: 0, count: 0 }
    };

    // 按具体采集主体汇总 (Top 8 排行)
    const personMap: Record<string, { name: string; income: number; cost: number; roi: number }> = {};

    approvedLogs.forEach(log => {
      const collector = managedUsers.find(u => u.id === log.recordedCollectorId);
      if (!collector) return;

      const roleName = isRevenueExpert(collector) ? '款专' : 
                       isValueExpert(collector) ? '产专' : '经理';
      
      const salaryPackage = collector.salaryPackage || 0;
      const totalLines = collectorLineStats[collector.id] || 1;
      const costPerEntry = salaryPackage / totalLines;

      const finalValue = calculateHistoricalNetValue(log, resources, managedUsers);

      // 角色汇总更新
      roleMap[roleName].income += finalValue;
      roleMap[roleName].cost += costPerEntry;
      roleMap[roleName].count += 1;

      // 采集主体汇总更新
      if (!personMap[collector.id]) {
        personMap[collector.id] = { name: collector.name, income: 0, cost: collector.salaryPackage || 1, roi: 0 };
      }
      personMap[collector.id].income += finalValue;
    });

    const roleChart = Object.entries(roleMap).map(([name, data]) => ({
      name,
      '价值创造': Math.round(data.income),
      '投资回报率对标': parseFloat((data.income / (data.cost || 1)).toFixed(2))
    }));

    const personChart = Object.values(personMap)
      .map(p => ({
        name: p.name,
        '个人产出': Math.round(p.income),
        '个人投资回报率': parseFloat((p.income / (p.cost || 1)).toFixed(2))
      }))
      .sort((a, b) => b.个人投资回报率 - a.个人投资回报率)
      .slice(0, 8);

    // 按资产类别汇总
    const categoryMap: Record<string, number> = {
      '收款': approvedLogs.filter(l => l.category === RefineCategory.Revenue).reduce((acc, curr) => acc + calculateHistoricalNetValue(curr, resources, managedUsers), 0),
      '产值': approvedLogs.filter(l => l.category === RefineCategory.Value).reduce((acc, curr) => acc + calculateHistoricalNetValue(curr, resources, managedUsers), 0)
    };
    const categoryChart = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));

    return { roleChart, personChart, categoryChart };
  }, [logs, managedUsers, timePeriod, collectorLineStats]);

  const dataIntegrityStatus = useMemo(() => {
    if (!selectedResource) return { ok: true, msg: '等待选择矿山', stats: null };
    
    const allResourceLogs = logs.filter(l => l && l.miningId === selectedMiningId && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved));
    const hedgeInfo = calculateHedgeCapacitiesAndWeights(selectedResource, allResourceLogs);

    const pendingC = getCClassCostForResource(AuditStatus.Pending);
    const pendingB2 = getB2ClassCostForResource(AuditStatus.Pending);
    
    return { 
      ok: true, 
      msg: '数据源同步中',
      stats: { 
        currentC: hedgeInfo.C, 
        currentB2: hedgeInfo.B2, 
        pendingC, 
        pendingB2, 
        cWeight: hedgeInfo.cWeightRev, 
        b2Weight: hedgeInfo.b2Weight 
      }
    };
  }, [selectedResource, getCClassCostForResource, getB2ClassCostForResource, logs, selectedMiningId, selectedCategory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked('vc-submit')) return;

    // 熔断锁定判定
    const activeBreaker = (circuitBreakers || []).find(cb => 
      cb.targetId === user.id && 
      cb.status === 'active' && 
      Date.now() < cb.expiresAt
    );
    if (activeBreaker) {
      const remainingMinutes = Math.ceil((activeBreaker.expiresAt - Date.now()) / (60 * 1000));
      showAlert(`提交拦截：您当前处于熔断锁定期（剩余约 ${remainingMinutes} 分钟）。\n原因：${activeBreaker.reason}`);
      return;
    }

    if (!selectedMiningId || selectedCollectors.length === 0) {
      showAlert('请确保“采集主体”及“关联矿产”已选择。');
      return;
    }

    if (!isAdminOrNpc(user) && selectedResource) {
      const allowedStr = selectedCategory === RefineCategory.Revenue ? selectedResource.assignedToRevenue : selectedResource.assignedToValue;
      if (!centerMatch(allowedStr, user.center) && !centerMatch(selectedResource.assignedTo, user.center)) {
        showAlert(`权限不足：矿山 [${selectedResource.id}] 的${selectedCategory === RefineCategory.Revenue ? '收款' : '产值'}权限未指派给您所在的单元 [${user.center}]。`);
        return;
      }
    }
    
    // 自动联动填充校验逻辑
    const totalAmount = selectedCollectors.reduce((sum, c) => sum + c.amount, 0);
    if (totalAmount <= 0) {
      showAlert('申报积分必须大于0，请填写有效的采集积分。');
      return;
    }

    // 强制读取最新实时数据见 getCClassCostForResource / getB2ClassCostForResource
    const realtimeC = getCClassCostForResource(AuditStatus.Confirmed) + getCClassCostForResource(AuditStatus.Approved);
    const realtimeB2 = getB2ClassCostForResource(AuditStatus.Confirmed) + getB2ClassCostForResource(AuditStatus.Approved);

    setAuditData([
        { metric: '申报积分', original: totalAmount, target: totalAmount },
        ...(selectedCategory === RefineCategory.Revenue ? [] : [{ metric: 'B2权', original: 0, target: realtimeB2 }]),
        { metric: 'C权', original: 0, target: realtimeC },
    ]);
    setIsAuditOpen(true);
  };

  const confirmSubmit = async () => {
    setIsAuditOpen(false);
    
    // 熔断锁定判定
    const activeBreaker = (circuitBreakers || []).find(cb => 
      cb.targetId === user.id && 
      cb.status === 'active' && 
      Date.now() < cb.expiresAt
    );
    if (activeBreaker) {
      const remainingMinutes = Math.ceil((activeBreaker.expiresAt - Date.now()) / (60 * 1000));
      showAlert(`提交拦截：您当前处于熔断锁定期（剩余约 ${remainingMinutes} 分钟）。\n原因：${activeBreaker.reason}`);
      return;
    }
    
    const totalAmount = selectedCollectors.reduce((sum, c) => sum + c.amount, 0);
    if (totalAmount <= 0) return showAlert('总积分必须大于0');

    if (selectedResource) {
      // 1. 物理上限校验
      const purifiedTotalAmount = totalAmount;
      if (purifiedTotalAmount > maxAllowed + 0.01) { // 允许 0.01 误差
        const initialCap = selectedCategory === RefineCategory.Value 
          ? Math.round(getInitialValueCapacity(selectedResource))
          : Math.round(getInitialRevenueCapacity(selectedResource));
        const confirmed = selectedCategory === RefineCategory.Value
          ? Math.round(mineralOccupancy.confirmedValue)
          : Math.round(mineralOccupancy.confirmedRevenue);
        const pending = selectedCategory === RefineCategory.Value
          ? Math.round(mineralOccupancy.pendingValue)
          : Math.round(mineralOccupancy.pendingRevenue);
        const mined = selectedCategory === RefineCategory.Value
          ? Math.round(mineralOccupancy.minedValue)
          : Math.round(mineralOccupancy.minedRevenue);
        const maxVal = Math.round(maxAllowed);

        const calcFormula = selectedCategory === RefineCategory.Value
          ? `产初(${initialCap}) - 已确(${confirmed}) - 待确(${pending}) - 入库(${mined}) = 最高可提炼量(${maxVal})`
          : `款初(${initialCap}) - 已确(${confirmed}) - 待确(${pending}) - 入库(${mined}) = 最高可提炼量(${maxVal})`;

        showAlert(`超额限制：本次注入提纯后积分（${Math.round(purifiedTotalAmount)}）超过了当前最高可提炼量（${maxVal}）。\n\n核算口径：\n${calcFormula}`);
        return;
      }
      
      // 2. 内部交易接收上限校验 (单次校验)
      if (receivedLimit !== Infinity && totalAmount > receivedLimit) {
        const reason = `单次注入积分（${Math.round(totalAmount).toLocaleString()}）超过了从内部交易接收到的对应资源上限（${Math.round(receivedLimit).toLocaleString()}）。`;
        
        if (onAddCircuitBreaker) {
          onAddCircuitBreaker({
            id: `CB${Date.now()}`,
            targetId: user.id, // 锁定具体用户 id
            targetName: user.name,
            reason: `[价值创造熔断] ${reason} | 矿山:${selectedMiningId}`,
            type: 'both',
            status: 'active',
            createdAt: Date.now(),
            expiresAt: Date.now() + 30 * 60 * 1000 // 30 分钟
          });
        }
        
        showAlert(`熔断触发：${reason}\n系统已暂停您的提报功能（锁定期 30 分钟），请联系管理员。`);
        return; // 拒绝提报
      }

      // 3. 内部交易接收上限校验 (累计校验)
      if (receivedLimit !== Infinity && (alreadyInjected + totalAmount > receivedLimit)) {
        const reason = `累计注入积分（${Math.round(alreadyInjected + totalAmount).toLocaleString()}）超过了从内部交易接收到的资源总量（${Math.round(receivedLimit).toLocaleString()}）。已注入：${Math.round(alreadyInjected).toLocaleString()}，本次申请：${Math.round(totalAmount).toLocaleString()}。`;
        
        if (onAddCircuitBreaker) {
          const txIds = transactions
            .filter(tx => (tx.receiverId === user.id || userCenterUsers.has(tx.receiverId)) && tx.miningId === selectedMiningId && tx.status === TransactionStatus.Verified)
            .map(tx => tx.id)
            .join(', ');

          onAddCircuitBreaker({
            id: `CB${Date.now()}`,
            targetId: user.id, // 锁定具体用户 id
            targetName: user.name,
            reason: `[价值创造熔断] ${reason} | 关联交易:${txIds}`,
            type: 'both',
            status: 'active',
            createdAt: Date.now(),
            expiresAt: Date.now() + 30 * 60 * 1000 // 30 分钟
          });
        }
        
        showAlert(`熔断触发：${reason}\n系统已暂停您的提报功能（锁定期 30 分钟），请联系管理员。`);
        return; // 拒绝提报
      }

      if (selectedCategory === RefineCategory.Value) {
        const { status } = deriveProjectStatus(selectedResource);
        if (status !== ProjectStatus.InProgress) {
          showAlert(`该项目处于${status}状态，无法继续提报产值。`);
          return;
        }
        if (selectedResource.valueDepleted) {
          showAlert('该矿山产出已满，无法继续提报。');
          return;
        }
      }

      // 4. 节奏控制限额校验 (仅针对产值类 + 战略性外派)
      if (selectedCategory === RefineCategory.Value && selectedRefineType === RefineType.Outsourced && selectedResource.monthlyQuota !== undefined) {
        const monthlyUsed = selectedResource.monthlyUsed || 0;
        if (monthlyUsed + totalAmount > selectedResource.monthlyQuota + 0.01) {
          showAlert(`本月(N=${selectedResource.rhythmMonthN})授权额度不足。\n当前已录入：${formatMoney(monthlyUsed)}\n本次尝试：${formatMoney(totalAmount)}\n本月上限：${formatMoney(selectedResource.monthlyQuota)}\n\n请联系经营单元更新提炼指令或调整月份。`);
          return;
        }
      }
    }

    const logsToSubmit: ValueCreationLog[] = [];
    
    // Preliminary calculation for K-factor
    const isValueCategory = selectedCategory === RefineCategory.Value;
    const preCalculated = selectedCollectors.map(c => {
        const collector = managedUsers.find(u => u.id === c.id);
        const isHighExpert = collector && (isValueExpert(collector) || isRevenueExpert(collector)); // Simplification for now based on user request
        const weights = getHedgeWeight(c.id, c.amount);
        const factor = getFactorForCollector(c.id);
        
        let pPre = 0;
        if (isValueCategory) {
            pPre = calculateT1PlusValue(c.amount, !!isHighExpert, selectedTier as any, weights.cWeight, weights.b2Weight);
        } else {
            pPre = calculateT1PlusRevenue(c.amount, !!isHighExpert, selectedTier as any, weights.cWeight);
        }
        return { ...c, pPre };
    });

    const totalPPre = preCalculated.reduce((sum, c) => sum + c.pPre, 0);
    const kFactor = (isValueCategory && totalPPre > (getCurrentValueCapacity(selectedResource) || 0)) 
        ? (getCurrentValueCapacity(selectedResource) / totalPPre) 
        : 1.0;

    selectedCollectors.forEach((c, index) => {
        if (c.amount > 0) {
            const pre = preCalculated.find(p => p.id === c.id);
            const netValue = pre ? pre.pPre * kFactor : 0;
            const cCost = getCClassCostForCollector(c.id);
            const weights = getHedgeWeight(c.id, c.amount);
            
            const status = AuditStatus.Pending;
            const confirmationType = selectedCategory === RefineCategory.Value ? '联动确权' : '收款确权';

            logsToSubmit.push({
                id: `${selectedCategory === RefineCategory.Revenue ? 'J' : 'M'}${(Date.now() % 100000000 + index).toString().padStart(8, '0')}`,
                miningId: selectedMiningId,
                rankId: selectedOperatorId,
                recordedCollectorId: c.id,
                category: selectedCategory,
                type: selectedRefineType as RefineType || RefineType.Enterprise,
                costCategory: selectedTier as any,
                amount: c.amount,
                rawAmount: c.rawAmount ?? c.amount,
                dynamicCost: 0,
                cClassCost: cCost,
                cClassRatio: weights.cWeight,
                b2ClassRatio: weights.b2Weight,
                netValue: netValue,
                timestamp: Date.now(),
                status: status,
                confirmationType: confirmationType as any,
                month: selectedMonth,
                businessDate: selectedDate
            });
        }
    });

    if (logsToSubmit.length > 0) {
      onLogSubmit(logsToSubmit);
      try {
        if (!persistWorkspaceWithOverrides) {
          toast.error('工作区同步未就绪，请刷新后重试');
          return;
        }
        const payloadLogs = logsToSubmit;
        
        const executeSync = async () => {
          await persistWorkspaceWithOverrides({ logs: payloadLogs }, { loadingMessage: '提报落库中…', successMessage: '已落库' });
          recordSuccess();
        };

        if (isBroken) {
          showAlert(`系统处于熔断状态，请等待至 ${new Date(retryAfter!).toLocaleTimeString()} 后重试。`);
          return;
        }

        try {
          await executeSync();
        } catch (err) {
          recordFailure(executeSync);
        }
      } catch (err) {
        // Handled inside persistWorkspaceWithOverrides via toast
      }
    }

    setSelectedCollectors([]);
    setError('');
  };

  const scopeLogs = useMemo(() => {
    let list = (logs || []).filter(Boolean);
    const isAdmin = isGlobalReader(user);
    if (!isAdmin) {
      if (user.center) {
        list = filterAuditLogsByCenter(list, resources, user, managedUsers);
      } else {
        list = list.filter(l => l.rankId === user.id || l.recordedCollectorId === user.id);
      }
    }
    list = list.filter(l => isLogInFilter(l, filterMonth, filterStartDate, filterEndDate));
    return list;
  }, [logs, user, resources, managedUsers, filterMonth, filterStartDate, filterEndDate]);

  const summaryRevenuePackage = useMemo(() => {
    return sumConfirmedRevenuePackage(scopeLogs, resources, managedUsers);
  }, [scopeLogs, resources, managedUsers]);

  const summaryValuePackage = useMemo(() => {
    return sumValueConversionPackage(scopeLogs, resources, managedUsers);
  }, [scopeLogs, resources, managedUsers]);

  const summaryIncomePackage = useMemo(() => {
    return sumIncomeProductionPackage(scopeLogs, resources, managedUsers);
  }, [scopeLogs, resources, managedUsers]);

  const quadrantData = useMemo(() => {
    return aggregateMiningQuadrantsFromLogs(logs, resources, selectedResource?.id, user.center, managedUsers);
  }, [logs, resources, selectedResource, user.center, managedUsers]);

  const filteredLogs = useMemo(() => {
    let list = (logs || []).filter(Boolean).reverse();
    const isAdmin = isGlobalReader(user);
    if (!isAdmin) {
      if (user.center) {
        list = filterAuditLogsByCenter(list, resources, user, managedUsers);
      } else {
        list = list.filter(l => l.rankId === user.id || l.recordedCollectorId === user.id);
      }
    }
    list = list.filter(l => isLogInFilter(l, filterMonth, filterStartDate, filterEndDate));

    if (recordTab === 'revenue') {
      return list.filter(l => l.category === RefineCategory.Revenue && l.status === AuditStatus.Pending);
    } else if (recordTab === 'linkedPending') {
      return list.filter(l => l.category === RefineCategory.Value && l.status === AuditStatus.Pending && l.confirmationType === '联动确权');
    } else if (recordTab === 'confirmed') {
      return list.filter(l => l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved);
    } else {
      return [];
    }
  }, [logs, user, resources, managedUsers, recordTab, filterMonth, filterStartDate, filterEndDate]);

  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredLogs.slice(start, start + PAGE_SIZE);
  }, [filteredLogs, currentPage, PAGE_SIZE]);

  const getLogRefineFactor = (log: ValueCreationLog, resource?: MiningResource, collector?: User): number => {
    if (!log) return 0;
    if (resource) {
      if (log.category === RefineCategory.Value) {
        if (resource.refineTypeFactors?.[log.type]?.customValueFactor !== undefined) {
          return resource.refineTypeFactors[log.type]!.customValueFactor!;
        } else if (resource.customValueFactor !== undefined) {
          return resource.customValueFactor;
        }
      } else if (log.category === RefineCategory.Revenue) {
        if (resource.refineTypeFactors?.[log.type]?.customRevenueFactor !== undefined) {
          return resource.refineTypeFactors[log.type]!.customRevenueFactor!;
        } else if (resource.customRevenueFactor !== undefined) {
          return resource.customRevenueFactor;
        }
      }
    }

    const isHighValueExpert = collector ? ((collector.category || '').includes('高产专') || ((collector.secondaryRoles as string[]) || []).includes('高产专')) : false;
    const isHighRevenueExpert = collector ? ((collector.category || '').includes('高款专') || ((collector.secondaryRoles as string[]) || []).includes('高款专')) : false;
    const isRevenueSpecialist = collector ? ((collector.category || '').includes('款专') || ((collector.secondaryRoles as string[]) || []).includes('款专')) : false;

    const tier = normalizeRefineTier(log.costCategory);
    if (log.category === RefineCategory.Value) {
      const coeffs = isHighValueExpert ? TIER_COEFFICIENTS.VALUE_MANAGER : TIER_COEFFICIENTS.VALUE_CHAN;
      if (tier === 'T1') return coeffs.Enterprise;
      if (tier === 'T2') return coeffs.Bidding;
      if (tier === 'T3') return coeffs.SafetyEval;
      return coeffs.SafetyEval;
    } else {
      const coeffs = isHighRevenueExpert ? TIER_COEFFICIENTS.REVENUE_HIGH : isRevenueSpecialist ? TIER_COEFFICIENTS.REVENUE_MID_INITIAL : TIER_COEFFICIENTS.REVENUE_HIGH;
      if (tier === 'T1') return coeffs.Enterprise;
      if (tier === 'T2') return coeffs.Bidding;
      if (tier === 'T3') return coeffs.SafetyEval;
      return coeffs.SafetyEval;
    }
  };


  const handleDownloadTemplate = () => {
    const templateData = [{
      '矿山编号': 'R001',
      '类别': '收款', // 或 产值
      '业务日期': new Date().toISOString().slice(0, 10),
      '采集主体': '工号或姓名(张三)',
      '注入数值': 10000,
      '提炼类型': '企业项目',
      '成本档位': 'T1',
      '操作员': '当前登入账号(可选)'
    }];
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "导入模板");
    exportWorkbook(workbook, "价值创造批量导入模板.xlsx");
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [failedImportRows, setFailedImportRows] = useState<FailedImportRow[]>([]);
  const [pendingImportLogs, setPendingImportLogs] = useState<ValueCreationLog[]>([]);
  const [isImportResultModalOpen, setIsImportResultModalOpen] = useState(false);
  const [isPersistingImport, setIsPersistingImport] = useState(false);
  const [importPersistCount, setImportPersistCount] = useState(0);
  const [persistSeconds, setPersistSeconds] = useState(0);
  const [importBatchId, setImportBatchId] = useState<string>('');

  // F9: 刷新复原检测，防止重复提交
  useEffect(() => {
    try {
      const raw = safeGetItem(IMPORT_IN_PROGRESS_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.timestamp && Date.now() - data.timestamp < 10 * 60 * 1000) {
          toast.warning('上次批量导入可能未正常完成，请刷新页面核对结果，切勿重复提交！', {
            duration: 8000,
            id: 'import-in-progress-warning'
          });
        }
        safeRemoveItem(IMPORT_IN_PROGRESS_KEY);
      }
    } catch (e) {
      safeRemoveItem(IMPORT_IN_PROGRESS_KEY);
    }
  }, []);

  // F5: 导入落库计时器
  useEffect(() => {
    let timer: any = null;
    if (isPersistingImport) {
      setPersistSeconds(0);
      timer = setInterval(() => {
        setPersistSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setPersistSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPersistingImport]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleDownloadFailedRows = () => {
    if (failedImportRows.length === 0) return;
    const dataToExport = failedImportRows.map(row => ({
      '行号': row.lineNum,
      '矿山编号': row.miningId,
      '类别': row.categoryStr,
      '采集主体': row.collectorStr,
      '业务日期': row.businessDateStr,
      '注入数值': row.rawAmountStr,
      '失败原因': row.reason
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "导入失败明细");
    exportWorkbook(workbook, buildExcelFilename("价值创造批量导入失败明细"));
  };

  const handleDownloadDuplicateRows = () => {
    const duplicateRows = failedImportRows.filter(row => row.reason === '重复记录');
    if (duplicateRows.length === 0) return;
    const dataToExport = duplicateRows.map(row => ({
      '行号': row.lineNum,
      '矿山编号': row.miningId,
      '类别': row.categoryStr,
      '采集主体': row.collectorStr,
      '业务日期': row.businessDateStr,
      '注入数值': row.rawAmountStr,
      '失败原因': row.reason
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "重复记录清单");
    exportWorkbook(workbook, buildExcelFilename("价值创造批量导入重复清单"));
  };

  const handleConfirmExecuteImport = async () => {
    if (pendingImportLogs.length === 0) return;
    setIsImportResultModalOpen(false);

    const batchId = importBatchId || `import_batch_${Date.now()}_${user?.id || 'anon'}`;
    const logsToSubmit = pendingImportLogs.map(log => ({
      ...log,
      batchId: log.batchId || batchId
    }));

    setIsPersistingImport(true);
    setImportPersistCount(logsToSubmit.length);

    safeSetItem(IMPORT_IN_PROGRESS_KEY, JSON.stringify({
      batchId,
      count: logsToSubmit.length,
      timestamp: Date.now()
    }));

    if (onPauseAutoSync) onPauseAutoSync(true);
    (window as any).__PAUSE_AUTO_SYNC__ = true;

    const TIMEOUT_MS = 60000;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('REQUEST_TIMEOUT_60S')), TIMEOUT_MS);
    });

    try {
      if (typeof persistWorkspaceWithOverrides === 'function') {
        const payloadLogs = logsToSubmit;
        
        await Promise.race([
          persistWorkspaceWithOverrides(
            { logs: payloadLogs, importBatchId: batchId },
            { silent: true }
          ),
          timeoutPromise
        ]);
      } else {
        throw new Error('工作区持久化服务未就绪');
      }

      // 落库成功后才合并本地 logs，只写一条汇总系统日志
      onLogSubmit(logsToSubmit, { isImport: true });
      setIsPersistingImport(false);
      toast.success(`成功导入 ${logsToSubmit.length} 条待确权记录`);
      setPendingImportLogs([]);
      setFailedImportRows([]);
      setImportBatchId('');
    } catch (err: any) {
      setIsPersistingImport(false);
      const is60sTimeout = err?.message === 'REQUEST_TIMEOUT_60S';
      const rawMsg = err?.message || '网络或系统异常';
      const isTimeoutOrNetwork = is60sTimeout || rawMsg.includes('超时') || rawMsg.includes('网络') || rawMsg.includes('504') || rawMsg.includes('502') || rawMsg.includes('Fetch') || rawMsg.includes('fetch');
      
      const friendlyMessage = isTimeoutOrNetwork
        ? `批量导入落库超时（60秒）或网络异常。后端可能仍在后台处理或已部分写入，请稍后刷新页面核对已处理进度，切勿重复提交！`
        : `批量导入落库失败：${rawMsg}。数据可能已部分写入，请刷新后核对是否重复。`;

      toast.error(friendlyMessage, { duration: 10000, id: 'import-persist-error-toast' });
    } finally {
      safeRemoveItem(IMPORT_IN_PROGRESS_KEY);
      if (onPauseAutoSync) onPauseAutoSync(false);
      (window as any).__PAUSE_AUTO_SYNC__ = false;
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > EXCEL_IMPORT_MAX_BYTES) {
      toast.error(`文件大小不能超过 ${EXCEL_IMPORT_MAX_BYTES / 1024 / 1024}MB`);
      return;
    }

    setImportLoading(true);
    const newBatchId = `import_batch_${Date.now()}_${user?.id || 'anon'}`;
    setImportBatchId(newBatchId);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<any>(worksheet);

      if (rows.length > EXCEL_IMPORT_MAX_ROWS) {
        toast.error(`一次最多导入 ${EXCEL_IMPORT_MAX_ROWS} 行`);
        return;
      }

      interface StagingRow {
        lineNum: number;
        miningId: string;
        category: RefineCategory;
        categoryStr: string;
        rawAmount: number;
        businessDateStr: string;
        collectorStr: string;
        collector: User;
        resource: MiningResource;
        refineType: RefineType;
        tierStr: string;
        operatorIdToUse: string;
        cWeight: number;
        b2Weight: number;
        isHighExpert: boolean;
        mStr: string;
        logPayload: ValueCreationLog;
      }

      const stagingRows: StagingRow[] = [];
      const logsToSubmit: ValueCreationLog[] = [];
      const failedRows: FailedImportRow[] = [];
      const seenImportKeys = new Set<string>();
      const miningTotalMap = new Map<string, { [RefineCategory.Value]: number, [RefineCategory.Revenue]: number }>();

      const resourceOccupancyMap = new Map<string, {
        revenueCapacity: number;
        currentRevenueOccupancy: number;
        accumulatedRawRevenue: number;
        valueCapacity: number;
        currentValueOccupancy: number;
        accumulatedRawValue: number;
      }>();

      resources.forEach(r => {
        const quads = calculateSingleResourceQuadrants(r, logs);
        resourceOccupancyMap.set(r.id, {
          revenueCapacity: Math.round(quads.revenue.capacity),
          currentRevenueOccupancy: Math.round(quads.revenue.confirmed + quads.revenue.pending),
          accumulatedRawRevenue: 0,
          valueCapacity: Math.round(quads.value.capacity),
          currentValueOccupancy: Math.round(quads.value.confirmed + quads.value.pending),
          accumulatedRawValue: 0
        });
      });

      // 阶段 1：逐行前置校验 (不含组级额度)
      let lineNum = 1;
      for (const row of rows) {
        lineNum++;
        
        // Clean key names: trim space and strip UTF-8 BOM (\uFEFF)
        const cleanedRow: Record<string, any> = {};
        if (row && typeof row === 'object') {
          for (const k of Object.keys(row)) {
            const cleanedKey = k.replace(/^\uFEFF/, '').trim();
            cleanedRow[cleanedKey] = row[k];
          }
        }

        const miningId = cleanedRow['矿山编号']?.toString().trim() || '';
        const categoryStr = cleanedRow['类别']?.toString().trim() || '';
        const rawBusinessDateInput = cleanedRow['业务日期'];
        const collectorStr = cleanedRow['采集主体']?.toString().trim() || '';
        // 兼容顺序：注入数值 → 注入金额 → 输入数值 → 输入金额
        const rawAmountVal = cleanedRow['注入数值'] ?? cleanedRow['注入金额'] ?? cleanedRow['输入数值'] ?? cleanedRow['输入金额'];
        const rawAmount = parseFloat(rawAmountVal);
        const refineTypeStr = cleanedRow['提炼类型']?.toString().trim();
        const tierStr = cleanedRow['成本档位']?.toString().trim() || 'T1';
        const operatorStr = cleanedRow['操作员']?.toString().trim();

        // Check required fields
        const missingFields: string[] = [];
        if (!miningId) missingFields.push('矿山编号');
        if (!categoryStr) missingFields.push('类别');
        if (rawBusinessDateInput === undefined || rawBusinessDateInput === null || String(rawBusinessDateInput).trim() === '') {
          missingFields.push('业务日期');
        }
        if (!collectorStr) missingFields.push('采集主体');
        if (rawAmountVal === undefined || rawAmountVal === null || String(rawAmountVal).trim() === '' || isNaN(rawAmount) || rawAmount <= 0) {
          missingFields.push('注入数值(须>0)');
        }

        const { dateObj: bDate, formattedStr: businessDateStr } = parseBusinessDateStr(rawBusinessDateInput);

        if (missingFields.length > 0) {
          failedRows.push({
            lineNum,
            miningId: miningId || '-',
            categoryStr: categoryStr || '-',
            businessDateStr: businessDateStr || '-',
            collectorStr: collectorStr || '-',
            rawAmountStr: isNaN(rawAmount) ? (rawAmountVal?.toString() || '-') : formatMoney(Math.round(rawAmount)),
            reason: `缺少必填项: ${missingFields.join('、')}`
          });
          continue;
        }

        if (!bDate) {
          failedRows.push({
            lineNum,
            miningId,
            categoryStr,
            businessDateStr: businessDateStr || String(rawBusinessDateInput),
            collectorStr,
            rawAmountStr: isNaN(rawAmount) ? '-' : formatMoney(Math.round(rawAmount)),
            reason: `业务日期格式无效`
          });
          continue;
        }

        const resource = resources.find(r => r.id === miningId);
        if (!resource) {
          failedRows.push({
            lineNum,
            miningId,
            categoryStr,
            businessDateStr,
            collectorStr,
            rawAmountStr: isNaN(rawAmount) ? '-' : formatMoney(Math.round(rawAmount)),
            reason: `找不到矿山 [${miningId}]`
          });
          continue;
        }
        if (!isProjectWritable(resource)) {
          failedRows.push({
            lineNum,
            miningId,
            categoryStr,
            businessDateStr,
            collectorStr,
            rawAmountStr: isNaN(rawAmount) ? '-' : formatMoney(Math.round(rawAmount)),
            reason: `矿山 [${miningId}] 状态不可提报`
          });
          continue;
        }

        const { status } = deriveProjectStatus(resource);
        if (status !== ProjectStatus.InProgress) {
          failedRows.push({
            lineNum,
            miningId,
            categoryStr,
            businessDateStr,
            collectorStr,
            rawAmountStr: isNaN(rawAmount) ? '-' : formatMoney(Math.round(rawAmount)),
            reason: `矿山 [${miningId}] 处于${status}状态`
          });
          continue;
        }

        const category = categoryStr === '产值' ? RefineCategory.Value : (categoryStr === '收款' ? RefineCategory.Revenue : null);
        if (!category) {
          failedRows.push({
            lineNum,
            miningId,
            categoryStr,
            businessDateStr,
            collectorStr,
            rawAmountStr: isNaN(rawAmount) ? '-' : formatMoney(Math.round(rawAmount)),
            reason: `类别必须是 收款 或 产值`
          });
          continue;
        }
        
        if (category === RefineCategory.Value && resource.valueDepleted) {
          failedRows.push({
            lineNum,
            miningId,
            categoryStr,
            businessDateStr,
            collectorStr,
            rawAmountStr: isNaN(rawAmount) ? '-' : formatMoney(Math.round(rawAmount)),
            reason: `矿山产出已满，无法继续提报产值`
          });
          continue;
        }

        // Match collector against id, userId, name, or userName
        const targetCollector = collectorStr.toLowerCase();
        const collector = managedUsers.find(u =>
          u.id.toLowerCase() === targetCollector ||
          (u.userId && u.userId.toLowerCase() === targetCollector) ||
          u.name.toLowerCase() === targetCollector ||
          ((u as any).userName && (u as any).userName.toLowerCase() === targetCollector)
        );
        if (!collector) {
          failedRows.push({
            lineNum,
            miningId,
            categoryStr,
            businessDateStr,
            collectorStr,
            rawAmountStr: isNaN(rawAmount) ? '-' : formatMoney(Math.round(rawAmount)),
            reason: `找不到采集主体 [${collectorStr}]`
          });
          continue;
        }

        if (category === RefineCategory.Revenue) {
           if (!centerMatch(resource.assignedToRevenue, collector.center) && !centerMatch(resource.assignedTo, collector.center)) {
              failedRows.push({
                lineNum,
                miningId,
                categoryStr,
                businessDateStr,
                collectorStr,
                rawAmountStr: isNaN(rawAmount) ? '-' : formatMoney(Math.round(rawAmount)),
                reason: `采集主体不具备该矿山的收款权限`
              });
              continue;
           }
        } else {
           if (!centerMatch(resource.assignedToValue, collector.center) && !centerMatch(resource.assignedTo, collector.center)) {
              failedRows.push({
                lineNum,
                miningId,
                categoryStr,
                businessDateStr,
                collectorStr,
                rawAmountStr: isNaN(rawAmount) ? '-' : formatMoney(Math.round(rawAmount)),
                reason: `采集主体不具备该矿山的产值权限`
              });
              continue;
           }
        }

        const bDateObj = bDate || new Date(businessDateStr);
        const mStr = `${bDateObj.getFullYear()}-${String(bDateObj.getMonth() + 1).padStart(2, '0')}`;

        // 防重校验：同一矿山编号 + 同一采集主体 + 同一业务月份 + 同一注入积分（原始数值）
        const dedupeKey = `${miningId}_${collector.id}_${mStr}_${Math.round(rawAmount)}`;
        if (seenImportKeys.has(dedupeKey)) {
          failedRows.push({
            lineNum,
            miningId,
            categoryStr,
            businessDateStr,
            collectorStr,
            rawAmountStr: isNaN(rawAmount) ? '-' : formatMoney(Math.round(rawAmount)),
            reason: '重复记录'
          });
          continue;
        }
        seenImportKeys.add(dedupeKey);

        const operatorObj = operatorStr ? managedUsers.find(u =>
          u.id.toLowerCase() === operatorStr.toLowerCase() ||
          (u.userId && u.userId.toLowerCase() === operatorStr.toLowerCase()) ||
          u.name.toLowerCase() === operatorStr.toLowerCase() ||
          ((u as any).userName && (u as any).userName.toLowerCase() === operatorStr.toLowerCase())
        ) : user;
        const operatorIdToUse = operatorObj?.id || user.id;

        let refineType = refineTypeStr as RefineType;
        if (!refineType) {
           if (miningId.startsWith('A')) refineType = RefineType.Enterprise;
           else if (miningId.startsWith('B')) refineType = RefineType.Bidding;
           else if (miningId.startsWith('C')) refineType = RefineType.SafetyEval;
           else refineType = resource.types?.[0] || RefineType.Enterprise;
        }
        
        let factor = 0;
        if (category === RefineCategory.Value) {
          if (refineType && resource.refineTypeFactors?.[refineType]?.customValueFactor !== undefined) factor = resource.refineTypeFactors[refineType]!.customValueFactor;
          else if (resource.customValueFactor !== undefined) factor = resource.customValueFactor;
        } else {
          if (refineType && resource.refineTypeFactors?.[refineType]?.customRevenueFactor !== undefined) factor = resource.refineTypeFactors[refineType]!.customRevenueFactor;
          else if (resource.customRevenueFactor !== undefined) factor = resource.customRevenueFactor;
        }

        if (factor === 0) {
          const isHighValueExpert = (collector.category || '').includes('高产专') || (collector.secondaryRoles || []).includes('高产专');
          const isHighRevenueExpert = (collector.category || '').includes('高款专') || (collector.secondaryRoles || []).includes('高款专');
          const vCoeffs = isHighValueExpert ? TIER_COEFFICIENTS.VALUE_MANAGER : TIER_COEFFICIENTS.VALUE_CHAN;
          const rCoeffs = isHighRevenueExpert ? TIER_COEFFICIENTS.REVENUE_HIGH : TIER_COEFFICIENTS.REVENUE_MID_INITIAL;
          const tier = normalizeRefineTier(tierStr);

          if (category === RefineCategory.Value) {
            if (tier === 'T1') factor = vCoeffs.Enterprise;
            else if (tier === 'T2') factor = vCoeffs.Bidding;
            else if (tier === 'T3') factor = vCoeffs.SafetyEval;
            else factor = vCoeffs.OccHealth;
          } else {
            if (tier === 'T1') factor = rCoeffs.Enterprise;
            else if (tier === 'T2') factor = rCoeffs.Bidding;
            else if (tier === 'T3') factor = rCoeffs.SafetyEval;
            else factor = rCoeffs.SafetyEval;
          }
        }

        const allResourceLogs = logs.filter(l => l && l.miningId === miningId && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved));
        const hedgeInfo = calculateHedgeCapacitiesAndWeights(resource, allResourceLogs);
        const cWeight = hedgeInfo.cWeightRev;
        const b2Weight = hedgeInfo.b2Weight;

        const isHighExpert = isValueExpert(collector) || isRevenueExpert(collector);
        const initialNetAmount = importNetAmount(rawAmount, category);
        let pPre = 0;
        if (category === RefineCategory.Value) {
            pPre = calculateT1PlusValue(initialNetAmount, !!isHighExpert, tierStr as any, cWeight, b2Weight);
        } else {
            pPre = calculateT1PlusRevenue(initialNetAmount, !!isHighExpert, tierStr as any, cWeight);
        }
        
        const currentCap = getCurrentValueCapacity(resource) || 0;
        const kFactor = (category === RefineCategory.Value && pPre > currentCap)
           ? (currentCap / pPre)
           : 1.0;
        
        const netValue = pPre * kFactor;

        let cClassCostStr = '';
        if (collector.category) {
          const parts = collector.category.split('/');
          cClassCostStr = parts[parts.length - 1] || 'C0';
        } else {
          cClassCostStr = 'C0';
        }

        if (!miningTotalMap.has(miningId)) {
            miningTotalMap.set(miningId, { [RefineCategory.Value]: 0, [RefineCategory.Revenue]: 0 });
        }
        miningTotalMap.get(miningId)![category] += Math.round(rawAmount);

        if (category === RefineCategory.Value && refineType === RefineType.Outsourced && resource.monthlyQuota !== undefined) {
            const monthlyUsed = resource.monthlyUsed || 0;
            if (monthlyUsed + miningTotalMap.get(miningId)![category] > Math.round(resource.monthlyQuota)) {
                failedRows.push({
                  lineNum,
                  miningId,
                  categoryStr,
                  businessDateStr,
                  collectorStr,
                  rawAmountStr: isNaN(rawAmount) ? '-' : formatMoney(Math.round(rawAmount)),
                  reason: `矿山 [${miningId}] 本月外派额度不足`
                });
                miningTotalMap.get(miningId)![category] -= Math.round(rawAmount);
                continue;
            }
        }

        const logPayload: ValueCreationLog = {
          id: `${category === RefineCategory.Revenue ? 'J' : 'M'}${(Date.now() % 100000000 + lineNum).toString().padStart(8, '0')}`,
          batchId: newBatchId,
          miningId: miningId,
          rankId: operatorIdToUse,
          recordedCollectorId: collector.id,
          category: category,
          type: refineType,
          costCategory: tierStr as any,
          amount: initialNetAmount,
          rawAmount: rawAmount,
          dynamicCost: 0,
          cClassCost: getCClassCostForCollector(collector.id),
          cClassRatio: cWeight,
          b2ClassRatio: b2Weight,
          netValue: netValue,
          timestamp: Date.now(),
          status: AuditStatus.Pending,
          confirmationType: (category === RefineCategory.Value ? '联动确权' : '收款确权') as any,
          month: mStr,
          businessDate: businessDateStr
        };

        stagingRows.push({
          lineNum,
          miningId,
          category,
          categoryStr,
          rawAmount,
          businessDateStr,
          collectorStr,
          collector,
          resource,
          refineType,
          tierStr,
          operatorIdToUse,
          cWeight,
          b2Weight,
          isHighExpert,
          mStr,
          logPayload
        });
      }

      // 阶段 2：按组额度预检（AB.5.1～AB.5.5）与残差归集（AB.5.6）
      // 1. 分组维度：仅按“矿山编号 + 轨（收款/产值）”，不区分采集主体、业务月份
      const groupMap = new Map<string, StagingRow[]>();
      for (const row of stagingRows) {
        const gKey = importGroupKey(row.miningId, row.category);
        if (!groupMap.has(gKey)) {
          groupMap.set(gKey, []);
        }
        groupMap.get(gKey)!.push(row);
      }

      for (const [, groupRows] of groupMap.entries()) {
        const firstRow = groupRows[0];
        const { miningId, category } = firstRow;
        const isRev = category === RefineCategory.Revenue;
        const occInfo = resourceOccupancyMap.get(miningId);

        const currOcc = occInfo ? (isRev ? occInfo.currentRevenueOccupancy : occInfo.currentValueOccupancy) : 0;
        const cap = occInfo ? (isRev ? occInfo.revenueCapacity : occInfo.valueCapacity) : -1;
        
        // 2. 对组内本次导入的原始数值（rawAmount）先求和，得到该矿山该轨的本次导入合计
        const batchRawSum = groupRows.reduce((sum, r) => sum + r.rawAmount, 0);
        // 3. 将合计数值进行统一折算取整，得到本次导入的组净值 (收款*0.933，产值1:1，禁止逐笔取整后累加)
        const batchNet = importBatchNetFromRawSum(batchRawSum, isRev);

        // 检查 1：当前是否已超限
        if (importAlreadyAtOrOverLimit(currOcc, cap)) {
          // 整组失败，每一行进入 failedRows
          for (const r of groupRows) {
            failedRows.push({
              lineNum: r.lineNum,
              miningId: r.miningId,
              categoryStr: r.categoryStr,
              businessDateStr: r.businessDateStr,
              collectorStr: r.collectorStr,
              rawAmountStr: formatMoney(Math.round(r.rawAmount)),
              reason: '该矿已超限，禁止导入'
            });
            if (miningTotalMap.has(miningId)) {
              miningTotalMap.get(miningId)![category] -= Math.round(r.rawAmount);
            }
          }
          continue;
        }

        // 检查 2：导入后是否超过矿山上限 (净值 ≤ 上限 → 通过；> 上限 → 超限拦截)
        if (importGroupQuotaExceeded(currOcc, batchNet, cap)) {
          const postBatchOcc = importGroupPostOccupancy(currOcc, batchNet);
          const reason = formatImportQuotaExceededReason(currOcc, postBatchOcc, cap, batchNet);
          // 整组失败，每一行进入 failedRows
          for (const r of groupRows) {
            failedRows.push({
              lineNum: r.lineNum,
              miningId: r.miningId,
              categoryStr: r.categoryStr,
              businessDateStr: r.businessDateStr,
              collectorStr: r.collectorStr,
              rawAmountStr: formatMoney(Math.round(r.rawAmount)),
              reason
            });
            if (miningTotalMap.has(miningId)) {
              miningTotalMap.get(miningId)![category] -= Math.round(r.rawAmount);
            }
          }
          continue;
        }

        // 阶段 2 校验通过：更新组内累计占用
        if (occInfo) {
          if (isRev) {
            occInfo.accumulatedRawRevenue += batchRawSum;
            occInfo.currentRevenueOccupancy += batchNet;
          } else {
            occInfo.accumulatedRawValue += batchRawSum;
            occInfo.currentValueOccupancy += batchNet;
          }
        }

        // 残差归集（AB.5.6）：组内行金额之和必须等于组净值，末行吸收残差
        const rawAmounts = groupRows.map(r => r.rawAmount);
        const allocatedAmounts = allocateImportRowAmounts(rawAmounts, isRev);

        for (let idx = 0; idx < groupRows.length; idx++) {
          const r = groupRows[idx];
          const finalAmount = allocatedAmounts[idx];

          // 重新计算与 finalAmount 对应的确权指标与 netValue
          let pPre = 0;
          if (r.category === RefineCategory.Value) {
            pPre = calculateT1PlusValue(finalAmount, !!r.isHighExpert, r.tierStr as any, r.cWeight, r.b2Weight);
          } else {
            pPre = calculateT1PlusRevenue(finalAmount, !!r.isHighExpert, r.tierStr as any, r.cWeight);
          }
          const currentCap = getCurrentValueCapacity(r.resource) || 0;
          const kFactor = (r.category === RefineCategory.Value && pPre > currentCap)
             ? (currentCap / pPre)
             : 1.0;
          const netValue = pPre * kFactor;

          r.logPayload.amount = finalAmount;
          r.logPayload.netValue = netValue;
          logsToSubmit.push(r.logPayload);
        }
      }

      failedRows.sort((a, b) => a.lineNum - b.lineNum);

      setFailedImportRows(failedRows);
      setPendingImportLogs(logsToSubmit);
      setIsImportResultModalOpen(true);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      if (toast) toast.error('解析文件失败：' + (err as Error).message);
      else alert('解析文件失败：' + (err as Error).message);
    } finally {
      setImportLoading(false);
    }
  };

  const exportToExcel = () => {
    if (!canExport) {
      toast.error(EXPORT_DISABLED_TOOLTIP);
      return;
    }

    const dataToExport = filteredLogs.map(log => {
      const collector = managedUsers.find(u => u.id === log.recordedCollectorId);
      const resource = resources.find(r => r.id === log.miningId);
      const operator = managedUsers.find(u => u.id === log.rankId);
      
      const weightInfo = getHedgeWeight(log.recordedCollectorId || '', log.amount);
      const cWeight = log.cClassRatio !== undefined ? log.cClassRatio : weightInfo.cWeight;
      const b2Weight = log.b2ClassRatio !== undefined ? log.b2ClassRatio : weightInfo.b2Weight;
      const factor = getLogRefineFactor(log, resource, collector);
      const rawAmount = log.rawAmount || log.amount || 0;

      let valuePackageDisplay = '—';
      let revenuePackageDisplay = '—';

      if (log.category === RefineCategory.Value) {
        const preHedge = rawAmount * factor;
        const postHedge = preHedge * cWeight * b2Weight;
        const hasHedge = cWeight < 1 || b2Weight < 1;
        valuePackageDisplay = hasHedge
          ? `${formatMoney(preHedge)} → ${formatMoney(postHedge)}`
          : `${formatMoney(postHedge)}`;
      } else if (log.category === RefineCategory.Revenue) {
        const preHedge = calculateInjectedAmount(log) * factor;
        const postHedge = preHedge * cWeight;
        const hasHedge = cWeight < 1;
        revenuePackageDisplay = hasHedge
          ? `${formatMoney(preHedge)} → ${formatMoney(postHedge)}`
          : `${formatMoney(postHedge)}`;
      }

      const displayInjection = calculateInjectedAmount(log);

      return {
        '矿山编号': log.miningId,
        '类别': log.category === RefineCategory.Revenue ? '收款' : '产值',
        '编号': log.id,
        '业务日期': resolveLogBusinessDate(log),
        '提交日期': formatSubmissionDate(log.timestamp),
        '经营单元': labelBusinessUnit(operator?.center),
        '采集主体': formatCollectorDisplay(log.recordedCollectorId, managedUsers),
        '确权类型': log.confirmationType || '手动确权',
        '输入数值': getRawInputAmount(log),
        '注入积分': displayInjection,
        'C权': cWeight < 0.8 ? `${cWeight.toFixed(4)} (低)` : cWeight.toFixed(4),
        'B2权': log.category === RefineCategory.Revenue ? '—' : b2Weight.toFixed(4),
        '产兑包': valuePackageDisplay,
        '收款包': revenuePackageDisplay,
        '确权日期': log.confirmedAt ? new Date(log.confirmedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-',
        '状态': log.status
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "入库记录");
    exportWorkbook(workbook, buildExcelFilename("价值确权入库记录"));
  };

  if (!user || !resources || !logs) {
    return (
      <div className="py-20 flex justify-center items-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">加载价值提炼仪表盘...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 md:space-y-6 lg:space-y-8 animate-in fade-in duration-500 pb-6">
      <AuditModal isOpen={isAuditOpen} onClose={() => setIsAuditOpen(false)} onConfirm={confirmSubmit} data={auditData} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 md:gap-6">
          <h3 className="text-base md:text-lg font-bold text-slate-800 tracking-tighter uppercase">价值创造申报</h3>
          {selectedResource && (
            <div className="flex items-center space-x-2 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 animate-in fade-in slide-in-from-left-2 transition-all">
               <span className="relative flex h-2 w-2">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
               </span>
               <span className="text-[9px] font-black text-emerald-700 uppercase tracking-tighter">
                 {dataIntegrityStatus.msg}: 
                 {selectedCategory === RefineCategory.Revenue ? (
                   <span className="ml-1 font-mono">C权({dataIntegrityStatus.stats?.cWeight != null ? dataIntegrityStatus.stats.cWeight.toFixed(4) : '1.0000'})</span>
                 ) : (
                   <span className="ml-1 font-mono">C权({dataIntegrityStatus.stats?.cWeight != null ? dataIntegrityStatus.stats.cWeight.toFixed(4) : '1.0000'}) | B2权({dataIntegrityStatus.stats?.b2Weight != null ? dataIntegrityStatus.stats.b2Weight.toFixed(4) : '1.0000'})</span>
                 )}
               </span>
               <span className="ml-2 text-[8px] font-bold text-emerald-500 bg-white px-1.5 rounded border border-emerald-100">单一数据源实时校验已开启</span>
            </div>
          )}
        </div>
        <span className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest self-start sm:self-center">终端：{user.name}</span>
      </div>

      {/* 申报区 */}
      <Card title="提交提炼价值确权" noPadding>
        <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4 md:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {/* 第 1 行 - 左：采集主体 */}
            <div className="flex flex-col space-y-1.5 sm:col-span-1 lg:col-span-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4">
                采集主体 <span className="text-rose-500 ml-1 font-bold">*</span>
              </label>
              <select 
                value="" 
                onChange={(e) => {
                  const id = e.target.value;
                  const newCollector = collectorPool.find(u => u.id === id);
                  if (id && newCollector && !selectedCollectors.find(c => c.id === id)) {
                    const isNewRevenueSpec = isRevenueExpert(newCollector);
                    const isNewValueSpec = isValueExpert(newCollector);

                    const hasSelectedRevenueSpec = selectedCollectors.some(sc => {
                      const existing = managedUsers.find(mu => mu.id === sc.id);
                      return existing && isRevenueExpert(existing);
                    });
                    const hasSelectedValueSpec = selectedCollectors.some(sc => {
                      const existing = managedUsers.find(mu => mu.id === sc.id);
                      return existing && isValueExpert(existing);
                    });

                    if (isNewRevenueSpec && hasSelectedValueSpec) {
                      showAlert('款专与产专不能同时提报。');
                      return;
                    }
                    if (isNewValueSpec && hasSelectedRevenueSpec) {
                      showAlert('款专与产专不能同时提报。');
                      return;
                    }

                    // 禁止同时选择多个款专
                    if (isNewRevenueSpec && hasSelectedRevenueSpec) {
                      showAlert('禁止同时选择多个款专（初/中/高款专只能选择其一）。');
                      return;
                    }

                    setSelectedCollectors([...selectedCollectors, { id, amount: 0, rawAmount: 0 }]);
                  }
                }} 
                className="w-full bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all font-bold text-slate-800 h-10 cursor-pointer" 
                required={selectedCollectors.length === 0}
              >
                <option value="">请选择采集主体</option>
                {collectorPool.filter(u => {
                  const isAlreadySelected = selectedCollectors.find(c => c.id === u.id);
                  if (isAlreadySelected) return false;
                  
                  const isRevenueSpec = isRevenueExpert(u);
                  const isWoodSpec = isValueExpert(u);

                  const hasSelectedRevenueSpec = selectedCollectors.some(sc => {
                    const existing = managedUsers.find(mu => mu.id === sc.id);
                    return existing && isRevenueExpert(existing);
                  });
                  const hasSelectedValueSpec = selectedCollectors.some(sc => {
                    const existing = managedUsers.find(mu => mu.id === sc.id);
                    return existing && isValueExpert(existing);
                  });

                  // 款专与产专互斥
                  if (hasSelectedRevenueSpec && (isRevenueSpec || isWoodSpec)) return false;
                  if (hasSelectedValueSpec && isRevenueSpec) return false;
                  
                  // 过滤逻辑：如果当前已选定类别（无论是手动还是自动），则下拉列表应过滤掉不属于该类别的非专员主体
                  if (selectedCategory === RefineCategory.Revenue) {
                    if (u.role === Role.ValueCollector && !isWoodSpec) return false;
                  } else if (selectedCategory === RefineCategory.Value) {
                    if (u.role === Role.RevenueCollector && !isRevenueSpec) return false;
                  }
                  
                  return true;
                }).map(u => <option key={u.id} value={u.id}>{formatCollectorDisplay(u)}{u.secondaryRoles?.length ? ` (兼: ${u.secondaryRoles.join(',')})` : ''}</option>)}
              </select>
            </div>

            {/* 第 1 行 - 右：提报类型 (主体自动锁定收款/产值，锁定态显示“已根据主体自动匹配”) */}
            <div className="flex flex-col space-y-1.5 sm:col-span-1 lg:col-span-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between h-4">
                <span>提报类型 <span className="text-rose-500 ml-1 font-bold">*</span></span>
                {isCategoryLocked && (
                  <span className="text-[9px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    已根据主体自动匹配
                  </span>
                )}
              </label>
              {isCategoryLocked ? (
                <div className="w-full bg-slate-50 border border-slate-200 rounded-[4px] px-3 py-2 text-[13px] font-bold text-slate-500 h-10 flex items-center shadow-inner">
                  {selectedCategory === RefineCategory.Revenue ? "收款类" : "产值类"}
                </div>
              ) : (
                <div className="flex border border-[#b8d0f7] rounded-[4px] overflow-hidden h-10 shadow-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(RefineCategory.Revenue)}
                    className={`flex-1 text-[12px] font-bold transition-all ${
                      selectedCategory === RefineCategory.Revenue 
                        ? 'bg-slate-900 text-white' 
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    收款类
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(RefineCategory.Value)}
                    className={`flex-1 text-[12px] font-bold transition-all ${
                      selectedCategory === RefineCategory.Value 
                        ? 'bg-slate-900 text-white' 
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    产值类
                  </button>
                </div>
              )}
            </div>

            {/* 第 2 行：矿山编号 (整行 col-span-1 sm:col-span-2 lg:col-span-4) */}
            <div className="flex flex-col space-y-1.5 col-span-1 sm:col-span-2 lg:col-span-4 relative">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4">
                矿山编号 <span className="text-rose-500 ml-1 font-bold">*</span>
              </label>
              <div className="flex flex-col space-y-2 relative">
                <select 
                  value={selectedMiningId} 
                  onChange={(e) => {
                    setSelectedMiningId(e.target.value);
                    setMiningSearchTerm('');
                  }} 
                  className={`w-full min-w-48 bg-white border ${availableResources.length === 0 ? 'border-rose-300' : 'border-[#b8d0f7]'} rounded-[4px] px-3 py-2 text-[13px] outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all font-bold text-slate-800 h-10 cursor-pointer`}
                  required
                >
                  <option value="">{availableResources.length === 0 ? '暂无可用矿山' : '请选择矿山编号...'}</option>
                  {availableResources.map(r => {
                    const { status } = deriveProjectStatus(r);
                    const uq = aggregateMiningQuadrantsFromLogs(logs, resources, r.id, user.center, managedUsers);
                    const unitRemaining = selectedCategory === RefineCategory.Value ? uq.value.unconfirmed : uq.revenue.unconfirmed;
                    const typeTag = selectedCategory === RefineCategory.Value ? '产值' : '收款';
                    const isFull = selectedCategory === RefineCategory.Value && unitRemaining <= 0 && status === ProjectStatus.InProgress;

                    return (
                      <option key={r.id} value={r.id} disabled={isFull}>
                        {r.id} | {typeTag} | {status}{isFull ? ' [已满]' : ''}
                      </option>
                    );
                  })}
                </select>
                {!selectedMiningId && (
                  <p className="text-[11px] text-amber-600 font-medium bg-amber-50/50 border border-amber-200/60 rounded px-2.5 py-1 mt-1 flex items-center">
                    <span className="mr-1 text-[12px]">ℹ️</span>
                    {availableResources.length === 0 
                      ? "当前主体暂无可用矿山，请先确认主体或经营单元。" 
                      : "请先选择对应的矿山编号以完成价值申报。"}
                  </p>
                )}
                {selectedMiningId && (
                  <div className="w-full bg-slate-50 border border-slate-200 p-3 rounded-md shadow-sm space-y-2">
                    <div className="flex justify-between items-center text-[9px] font-bold">
                       <span className="text-slate-500">款初: <span className="text-indigo-600">{formatMoney(getInitialRevenueCapacity(selectedResource))}</span> | 款当: <span className="text-amber-600">{formatMoney(getCurrentRevenueCapacity(selectedResource, logs))}</span></span>
                       <span className="text-slate-500">产初: <span className="text-indigo-600">{formatMoney(getInitialValueCapacity(selectedResource))}</span> | 产当: <span className="text-emerald-600">{formatMoney(getCurrentValueCapacity(selectedResource, logs))}</span></span>
                    </div>
                    <div className="flex justify-between items-center text-[9px] font-bold">
                       <span className="text-slate-500">已注入累计: <span className="text-blue-600">{formatMoney(alreadyInjected)}</span></span>
                       <span className="text-slate-500">剩余接收额度: <span className={(receivedLimit !== Infinity && remainingQuota < selectedCollectors.reduce((s, c) => s + c.amount, 0)) ? "text-rose-600" : "text-emerald-600"}>
                        {receivedLimit === Infinity ? '无交易限制' : formatMoney(remainingQuota)}
                       </span></span>
                    </div>
                    {receivedLimit !== Infinity && (alreadyInjected + selectedCollectors.reduce((s, c) => s + c.amount, 0) > receivedLimit) && (
                      <p className="text-[9px] font-black text-rose-600 animate-pulse flex items-center">
                        <span className="mr-1">⚠️</span> 累计注入超出接收总量，触发熔断
                      </p>
                    )}
                  </div>
                )}
                <div className="flex items-center space-x-2 w-full">
                  <input 
                    type="text" 
                    placeholder="搜索编号..." 
                    title="输入矿山编号进行快速搜索"
                    value={miningSearchTerm}
                    onChange={(e) => setMiningSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const term = miningSearchTerm;
                        if ((term || '').trim() === '') return;
                        const match = availableResources.find(r => 
                          r.id?.toLowerCase().includes((term || '').toLowerCase())
                        );
                        if (match) {
                          setSelectedMiningId(match.id);
                        } else {
                          toast.error('未找到对应矿山编号');
                        }
                      }
                    }}
                    className="flex-1 w-full min-w-[120px] bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all font-bold text-slate-800 h-10"
                  />
                  <button 
                    type="button"
                    onClick={() => {
                      const term = miningSearchTerm;
                      if ((term || '').trim() === '') return;
                      const match = availableResources.find(r => 
                        r.id?.toLowerCase().includes((term || '').toLowerCase())
                      );
                      if (match) {
                        setSelectedMiningId(match.id);
                      } else {
                        toast.error('未找到对应矿山编号');
                      }
                    }}
                    className="h-10 px-3 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded-[4px] text-[12px] font-bold transition-colors whitespace-nowrap flex items-center shrink-0"
                  >
                    搜索
                  </button>
                </div>
              </div>
            </div>

            {/* 第 3 行 - Col 1: 业务日期 (必填，带红星) */}
            <div className="flex flex-col space-y-1.5 col-span-1 sm:col-span-1 lg:col-span-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4">
                业务日期 <span className="text-rose-500 ml-1 font-bold">*</span>
              </label>
              <input 
                type="date" 
                value={selectedDate} 
                onChange={(e) => {
                  const date = e.target.value;
                  setSelectedDate(date);
                  if (date) setSelectedMonth(date.slice(0, 7));
                }} 
                className="w-full bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all font-bold text-slate-800 h-10 cursor-pointer" 
                required
              />
            </div>

            {/* 第 3 行 - Col 2: 提炼配方 (只读) */}
            <div className="flex flex-col space-y-1.5 col-span-1 sm:col-span-1 lg:col-span-1">
              <div className="flex items-center space-x-1.5 h-4">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">提炼配方</label>
                {selectedResource && (
                  hasCustomFactor ? (
                    <span className="text-[8px] font-black text-emerald-600 animate-pulse bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 whitespace-nowrap">协议配方</span>
                  ) : (
                    <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 whitespace-nowrap">标准配方</span>
                  )
                )}
              </div>
              <div className={`w-full border rounded-[4px] px-3 py-2 text-[13px] flex items-center h-10 font-bold ${
                !selectedResource 
                  ? 'bg-slate-50 border-[#b8d0f7] text-slate-400 font-normal'
                  : hasCustomFactor 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                    : 'bg-slate-50 border-[#b8d0f7] text-slate-700'
              }`}>
                {selectedResource ? (
                  <span>{selectedTier || 'T1'}</span>
                ) : (
                  <span>—</span>
                )}
              </div>
            </div>

            {/* 第 3 行 - Col 3: 提炼类型 (只读) */}
            <div className="flex flex-col space-y-1.5 col-span-1 sm:col-span-1 lg:col-span-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4">提炼类型</label>
              <div className="w-full bg-slate-50 border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] flex items-center h-10 font-bold text-slate-700">
                {selectedResource ? (
                  <span>{selectedRefineType}</span>
                ) : (
                  <span className="text-slate-400 font-normal">—</span>
                )}
              </div>
            </div>

            {/* 第 3 行 - Col 4: 执行类型 (只读，随矿山+经营单元自动计算) */}
            <div className="flex flex-col space-y-1.5 col-span-1 sm:col-span-1 lg:col-span-1">
              <div className="flex items-center justify-between h-4">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  执行类型
                </label>
                {selectedResource && (
                  <span className="text-[9px] text-slate-400 font-medium truncate max-w-[100px]" title={`当前视角: ${selectedOperator?.center || user.center || '无'}`}>
                    {selectedOperator?.center || user.center || '无'}
                  </span>
                )}
              </div>
              <div className="w-full bg-slate-50 border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] flex items-center h-10 shadow-xs">
                {selectedResource ? (() => {
                  const currentUnitForVC = selectedOperator?.center || user.center || '';
                  const et = getExecutionType(selectedResource, currentUnitForVC);
                  const col = getExecutionTypeBadgeColor(et);
                  return (
                    <div className="flex items-center w-full">
                      <span 
                        title={EXECUTION_TYPE_EXPLANATIONS[et]}
                        className={`px-2 py-0.5 rounded text-[10px] font-black border ${col.bg} ${col.text} ${col.border} cursor-help shadow-sm whitespace-nowrap`}
                      >
                        {et}
                      </span>
                    </div>
                  );
                })() : (
                  <span className="text-slate-400 font-normal text-[12px]">—</span>
                )}
              </div>
            </div>

          </div>

          {/* 第二行：矿山资源进度条 */}
          {selectedResource && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-8 bg-slate-50/50 p-4 rounded-sm border border-slate-100 animate-in slide-in-from-left-2 duration-300">
               <ProgressBar 
                 label=" 收款目前矿山资源进度" 
                 subLabel={(mineralOccupancy.confirmedRevenue + mineralOccupancy.minedRevenue) >= getCurrentRevenueCapacity(selectedResource) ? "已采集" : `${formatMoney(mineralOccupancy.confirmedRevenue + mineralOccupancy.minedRevenue)} / ${formatMoney(getCurrentRevenueCapacity(selectedResource))}`}
                 value={Math.min(mineralOccupancy.confirmedRevenue + mineralOccupancy.minedRevenue, getCurrentRevenueCapacity(selectedResource))}
                 max={getCurrentRevenueCapacity(selectedResource)}
                 color="bg-amber-500"
               />
               <ProgressBar 
                 label=" 产值目前矿山资源进度" 
                 subLabel={(mineralOccupancy.confirmedValue + mineralOccupancy.minedValue) >= getCurrentValueCapacity(selectedResource) ? "已采集" : `${formatMoney(mineralOccupancy.confirmedValue + mineralOccupancy.minedValue)} / ${formatMoney(getCurrentValueCapacity(selectedResource))}`}
                 value={Math.min(mineralOccupancy.confirmedValue + mineralOccupancy.minedValue, getCurrentValueCapacity(selectedResource))}
                 max={getCurrentValueCapacity(selectedResource)}
                 color="bg-emerald-500"
               />
            </div>
          )}



          <div className="space-y-4">
            {(() => {
              const hasAnyHedge = selectedCollectors.some(sc => {
                const w = getHedgeWeight(sc.id, sc.amount);
                if (selectedCategory === RefineCategory.Revenue) {
                  return w.cWeight < 1;
                }
                return w.cWeight < 1 || w.b2Weight < 1;
              });
              
              return selectedCollectors.map((c) => {
                const user = managedUsers.find(u => u.id === c.id);
                const weights = getHedgeWeight(c.id, c.amount);
                const hasHedge = selectedCategory === RefineCategory.Revenue ? weights.cWeight < 1 : (weights.cWeight < 1 || weights.b2Weight < 1);

                return (
                  <div key={c.id} className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end bg-slate-50 p-4 rounded-sm border border-slate-200 relative group">
                    <button
                      type="button"
                      onClick={() => setSelectedCollectors(selectedCollectors.filter(sc => sc.id !== c.id))}
                      className="absolute -top-2 -right-2 bg-rose-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                      ×
                    </button>
                    <div className={`${
                      hasAnyHedge ? 'lg:col-span-4' : 'lg:col-span-5'
                    } space-y-1`}>
                      <label className="text-[10px] font-bold text-blue-600 uppercase">注入积分主体</label>
                      <div className="flex items-center bg-white border border-slate-200 rounded-sm px-3 py-1.5 h-10">
                        <span className="text-xs font-bold text-slate-700">
                          {formatCollectorDisplay(user || c.id, managedUsers)}
                        </span>
                      </div>
                    </div>
                    <div className={`${hasAnyHedge ? 'lg:col-span-2' : 'lg:col-span-3'} space-y-1`}>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">
                        {selectedCategory === RefineCategory.Value ? '输入产值' : '输入收款'}
                      </label>
                      <input
                        type="number"
                        value={c.rawAmount !== undefined ? (c.rawAmount || '') : (c.amount || '')}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const isRev = selectedCategory === RefineCategory.Revenue;
                          setSelectedCollectors(selectedCollectors.map(sc => 
                            sc.id === c.id 
                              ? { 
                                  ...sc, 
                                  rawAmount: val, 
                                  amount: importNetAmount(val, isRev) 
                                } 
                              : sc
                          ));
                        }}
                        className="w-full border border-slate-300 rounded-sm px-3 py-1.5 text-sm font-bold font-mono focus:border-blue-900 outline-none h-10"
                        placeholder="0"
                      />
                    </div>
                    <div className="lg:col-span-2 space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">注入积分</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={c.amount || ''}
                          readOnly
                          disabled
                          className="w-full border border-slate-200 bg-slate-100 text-slate-500 rounded-sm px-3 py-1.5 text-sm font-bold font-mono outline-none h-10 cursor-not-allowed"
                          placeholder="0"
                          required
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[9px] font-bold font-mono uppercase">积分</span>
                      </div>
                    </div>
                    {/* 显示 C权 和 B2权 (当有对冲时且不是收款类) */}
                    {hasAnyHedge && (
                      selectedCategory === RefineCategory.Revenue ? (
                        <div className="lg:col-span-2 space-y-1">
                          <label className={`text-[10px] font-bold uppercase ${weights.cWeight < 1 ? 'text-amber-600' : 'text-slate-400'}`}>C权</label>
                          <div className="relative">
                            <input
                              type="text"
                              value={weights.cWeight < 1 ? weights.cWeight.toFixed(4) : '1.0000'}
                              readOnly
                              className={`w-full border border-slate-200 bg-slate-50 rounded-sm px-2 py-1.5 text-xs font-bold font-mono outline-none cursor-not-allowed h-10 ${weights.cWeight < 1 ? 'text-rose-500' : 'text-slate-400'}`}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="lg:col-span-2 grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <label className={`text-[10px] font-bold uppercase ${weights.cWeight < 1 ? 'text-amber-600' : 'text-slate-400'}`}>C权</label>
                              <InfoTip 
                                title="C权"
                                content={
                                  <div className="space-y-1">
                                    <p>计算：(N − ΣC) / N</p>
                                    <p className="text-[10px] text-slate-400">N = round(款初)</p>
                                  </div>
                                }
                              />
                            </div>
                            <div className="relative">
                              <input
                                type="text"
                                value={weights.cWeight < 1 ? weights.cWeight.toFixed(4) : '1.0000'}
                                readOnly
                                className={`w-full border border-slate-200 bg-slate-50 rounded-sm px-2 py-1.5 text-xs font-bold font-mono outline-none cursor-not-allowed h-10 ${weights.cWeight < 1 ? 'text-rose-500' : 'text-slate-400'}`}
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <label className={`text-[10px] font-bold uppercase ${weights.b2Weight < 1 ? 'text-blue-600' : 'text-slate-400'}`}>B2权</label>
                              <InfoTip 
                                title="B2权"
                                content="计算：(N − ΣC − ΣB2) / (N − ΣC)"
                              />
                            </div>
                            <div className="relative">
                              <input
                                type="text"
                                value={weights.b2Weight < 1 ? weights.b2Weight.toFixed(4) : '1.0000'}
                                readOnly
                                className={`w-full border border-slate-200 bg-slate-50 rounded-sm px-2 py-1.5 text-xs font-bold font-mono outline-none cursor-not-allowed h-10 ${weights.b2Weight < 1 ? 'text-rose-500' : 'text-slate-400'}`}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    )}
                    <div className="lg:col-span-2 space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">
                        {user && isValueExpert(user) ? '产兑包' : (user && isRevenueExpert(user) ? '收款包' : '收款包/产兑包')}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={formatMoney(calculateNetValueForCollector(c.id, c.amount))}
                          readOnly
                          className="w-full border border-slate-200 bg-slate-50 rounded-sm px-2 py-1.5 text-sm font-bold font-mono outline-none cursor-not-allowed h-10"
                        />
                      </div>
                    </div>
                  </div>
                );
              });
            })()}

            {selectedCategory === RefineCategory.Value && selectedResource && selectedCollectors.length > 0 && (() => {
              const totalInput = selectedCollectors.reduce((sum, c) => sum + c.amount, 0);
              const currentPending = mineralOccupancy.pendingValue;
              const currentConfirmed = mineralOccupancy.confirmedValue;
              const totalPending = currentPending + totalInput;
              const capacityRemaining = getCurrentRevenueCapacity(selectedResource) - currentConfirmed;
              const revenueBasedLimit = Math.max(0, mineralOccupancy.confirmedRevenue - currentConfirmed);
              const conversionAmount = capacityRemaining <= 0 ? 0 : Math.min(totalPending, revenueBasedLimit);
              const finalPending = totalPending - conversionAmount;
              const finalConfirmed = currentConfirmed + conversionAmount;
              const remainingUnconfirmed = Math.max(0, getCurrentValueCapacity(selectedResource) - finalConfirmed - finalPending);
              const confirmationRate = Math.round((finalConfirmed / (getCurrentValueCapacity(selectedResource) || 1)) * 100);

              return (
                <div className="bg-emerald-50 p-4 rounded-sm border border-emerald-200 mt-2 space-y-3">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-bold text-emerald-800 uppercase">矿山资源确权预览 (实时计算)</p>
                    <span className="text-[8px] font-bold text-emerald-600 bg-white px-2 py-0.5 rounded border border-emerald-100">自动确权机制已激活</span>
                  </div>
                  
                  <div className="bg-white/60 p-2 rounded border border-emerald-200/50">
                    <p className="text-[8px] font-black text-slate-800 font-mono">
                      确权核算公式：本次提报积分 ({totalInput}) 将直接计入待确权产值，并触发联动转换：min(待确权产值总和, 已确权收款总和 - 已确权产值总和)。当 (款当 - 已确权产值总和) &lt;= 0 时，转换额度为 0。
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-white p-2 rounded border border-emerald-100">
                      <p className="text-[8px] text-emerald-500 font-bold uppercase mb-1">当前已确权</p>
                      <p className="text-sm font-black text-emerald-700 font-mono">{formatMoney(currentConfirmed)}</p>
                    </div>
                    <div className="bg-emerald-100 p-2 rounded border border-emerald-300">
                      <p className="text-[8px] text-emerald-600 font-bold uppercase mb-1">预计已确权</p>
                      <p className="text-sm font-black text-emerald-800 font-mono">
                        {formatMoney(finalConfirmed)}
                      </p>
                    </div>
                    <div className="bg-amber-50 p-2 rounded border border-amber-200 flex flex-col justify-center">
                      <p className="text-[8px] text-amber-600 font-bold uppercase mb-1">预计待确权</p>
                      <p className="text-sm font-black text-amber-700 font-mono">
                        {formatMoney(finalPending)}
                      </p>
                      <div className="text-[8px] text-amber-600/80 mt-1 font-mono leading-tight border-t border-amber-200/50 pt-1">
                        <p>原待确权: {formatMoney(currentPending)}</p>
                        <p>+ 本次提报: {formatMoney(totalInput)}</p>
                        <p>- 联动转换: {formatMoney(conversionAmount)}</p>
                      </div>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-100">
                      <p className="text-[8px] text-slate-400 font-bold uppercase mb-1">剩余未确权</p>
                      <p className="text-sm font-black text-slate-600 font-mono">
                        {formatMoney(remainingUnconfirmed)}
                      </p>
                    </div>
                  </div>

                  <div className="text-[8px] text-emerald-600/70 font-bold uppercase pt-2 border-t border-emerald-100 flex justify-between">
                    <span>产当：{formatMoney(getCurrentValueCapacity(selectedResource))}</span>
                    <span>预计确权率：{confirmationRate}%</span>
                  </div>
                </div>
              );
            })()}

            {selectedCollectors.length > 0 && (
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="text-center px-4 py-2 bg-slate-100 rounded-sm">
                    <p className="text-[8px] font-bold text-slate-400 uppercase">总注入积分</p>
                    <p className="text-lg font-black text-slate-800 font-mono">{formatMoney(selectedCollectors.reduce((sum, c) => sum + c.amount, 0))}</p>
                  </div>
                  <div className="text-center px-4 py-2 bg-emerald-50 rounded-sm border border-emerald-100 relative group">
                    <p className="text-[8px] font-bold text-emerald-600 uppercase">
                      {(() => {
                        if (selectedCollectors.length > 0) {
                          const firstUser = managedUsers.find(u => u.id === selectedCollectors[0].id);
                          if (firstUser && isValueExpert(firstUser)) return '总产兑包';
                          if (firstUser && isRevenueExpert(firstUser)) return '总收款包';
                        }
                        return '总收款包/产兑包';
                      })()}
                    </p>
                    <p className="text-lg font-black text-emerald-700 font-mono">+{formatMoney(totalNetValue)}</p>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-4 py-2 bg-slate-900 border border-slate-700 text-white text-[9px] font-bold rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">
                      <div className="space-y-1">
                        <p className="border-b border-slate-700 pb-1 text-blue-400">核算路径分析</p>
                        <p>基础公式：注入积分 * 提炼权重</p>
                        {hasCustomFactor ? (
                          <div className="text-emerald-400 flex items-center">
                            <span className="mr-1 inline-block w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0"></span>
                            <span>使用{isRefineTypeCustomFactor ? '专属协议' : '全局协议'}: {
                              (() => {
                                if (selectedCategory === RefineCategory.Value) {
                                  if (selectedRefineType && selectedResource!.refineTypeFactors?.[selectedRefineType as RefineType]?.customValueFactor !== undefined) {
                                    return `${(selectedResource!.refineTypeFactors[selectedRefineType as RefineType]!.customValueFactor! * 100).toFixed(0)}%`;
                                  }
                                  return `${(selectedResource!.customValueFactor! * 100).toFixed(0)}%`;
                                } else {
                                  if (selectedRefineType && selectedResource!.refineTypeFactors?.[selectedRefineType as RefineType]?.customRevenueFactor !== undefined) {
                                    return `${(selectedResource!.refineTypeFactors[selectedRefineType as RefineType]!.customRevenueFactor! * 100).toFixed(0)}%`;
                                  }
                                  return `${(selectedResource!.customRevenueFactor! * 100).toFixed(0)}%`;
                                }
                              })()
                            }</span>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-slate-400 italic">使用系统默认提炼结算方式：{tierDisplayMap[selectedTier]?.name || `${selectedTier}类`}</p>
                            <p className="text-[10px] text-slate-500 font-mono">({tierDisplayMap[selectedTier]?.desc})</p>
                          </div>
                        )}
                        {selectedCategory === RefineCategory.Revenue && <p className="text-rose-400">叠加：C类对冲权重</p>}
                      </div>
                    </div>
                  </div>
                </div>
                <button 
                  type="submit" 
                  disabled={selectedCollectors.length === 0 || maxAllowed <= 0}
                  className={`px-10 py-3 font-black text-xs uppercase tracking-widest rounded-sm transition-all shadow-xl active:scale-95 ${
                    (selectedCollectors.length === 0 || maxAllowed <= 0) 
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                      : 'bg-slate-900 text-white hover:bg-blue-600'
                  }`}
                >
                  {maxAllowed <= 0 ? '资源已枯竭/满额' : '提交提炼价值确权'}
                </button>
              </div>
            )}
          </div>
        </form> {/* MARKER_END */}
      </Card>

      {/* 入库记录与效能看板 */}
      <Card 
        title="价值确权记录" 
        noPadding
        headerAction={
          <div className="flex items-center space-x-2">
            
            <button 
              onClick={handleDownloadTemplate}
              className="px-3 py-1 text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 rounded-sm hover:bg-amber-100 transition-colors flex items-center"
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              模板
            </button>
            <input 
              type="file" 
              accept=".xlsx,.xls,.csv" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleImport} 
            />
            <button 
              onClick={handleImportClick}
              disabled={importLoading || isPersistingImport}
              className="px-3 py-1 text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200 rounded-sm hover:bg-blue-100 transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              {importLoading ? '解析中...' : isPersistingImport ? '落库中...' : '导入'}
            </button>
            <button 
              onClick={exportToExcel}
              disabled={!canExport}
              title={getExportButtonTitle(canExport, '导出 EXCEL')}
              className={`px-3 py-1 text-[10px] font-bold border rounded-sm transition-colors flex items-center ${
                !canExport
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                  : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 cursor-pointer'
              }`}
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
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
             <div className="flex bg-slate-200 p-0.5 rounded-sm">
              <button onClick={() => setRecordTab('revenue')} title="查看收款确权记录" className={`px-4 py-1 text-[10px] font-bold rounded-sm ${recordTab === 'revenue' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>收款确权</button>
              <button onClick={() => setRecordTab('linkedPending')} title="查看待联动确权记录" className={`px-4 py-1 text-[10px] font-bold rounded-sm ${recordTab === 'linkedPending' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>联动确权</button>
              <button onClick={() => setRecordTab('confirmed')} title="查看已完成确权的记录" className={`px-4 py-1 text-[10px] font-bold rounded-sm ${recordTab === 'confirmed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>确权记录</button>
            </div>
          </div>
        }
      >
        {/* 价值动态流 (收款轨/产值轨) */}
        <div className="p-6 bg-slate-50/50 border-b border-slate-200 space-y-4">
          <div className="border-b border-slate-200 pb-2">
            <h4 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-blue-600 rounded-sm"></span>
              {UI_LABELS.VALUE_FLOW} <span className="text-[10px] font-bold text-slate-500 px-2 py-0.5 bg-slate-100 rounded">
                {selectedResource ? `矿山: ${selectedResource.id}` : '系统累计'}
              </span>
            </h4>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* 收款 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-yellow-700 uppercase tracking-widest flex items-center">
                  <span className="w-1.5 h-3.5 bg-yellow-500 mr-2 rounded-full"></span>
                  {UI_LABELS.REVENUE}
                </span>
                <span className="text-[10px] font-bold text-slate-400">{UI_LABELS.REVENUE}当限: {formatMoney(quadrantData.revenue.capacity)}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.PENDING}</p>
                  <p className="text-xs font-black text-amber-600 font-mono">{formatMoney(quadrantData.revenue.pending)}</p>
                </div>
                <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.CONFIRMED}</p>
                  <p className="text-xs font-black text-emerald-600 font-mono">{formatMoney(quadrantData.revenue.confirmed)}</p>
                </div>
                <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.UNCONFIRMED}</p>
                  <p className="text-xs font-black text-rose-600 font-mono">{formatMoney(quadrantData.revenue.unconfirmed)}</p>
                </div>
                <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.MINED}</p>
                  <p className="text-xs font-black text-blue-600 font-mono">{formatMoney(quadrantData.revenue.mined)}</p>
                </div>
              </div>
            </div>

            {/* 产值 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-rose-700 uppercase tracking-widest flex items-center">
                  <span className="w-1.5 h-3.5 bg-rose-500 mr-2 rounded-full"></span>
                  {UI_LABELS.VALUE}
                </span>
                <span className="text-[10px] font-bold text-slate-400">{UI_LABELS.VALUE}当限: {formatMoney(quadrantData.value.capacity)}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.PENDING}</p>
                  <p className="text-xs font-black text-amber-600 font-mono">{formatMoney(quadrantData.value.pending)}</p>
                </div>
                <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.CONFIRMED}</p>
                  <p className="text-xs font-black text-emerald-600 font-mono">{formatMoney(quadrantData.value.confirmed)}</p>
                </div>
                <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.UNCONFIRMED}</p>
                  <p className="text-xs font-black text-rose-600 font-mono">{formatMoney(quadrantData.value.unconfirmed)}</p>
                </div>
                <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.MINED}</p>
                  <p className="text-xs font-black text-blue-600 font-mono">{formatMoney(quadrantData.value.mined)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 确权统计摘要 (收产包/收款包/产兑包 - netValue 口径) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 bg-slate-55 border-b border-slate-200">
          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 p-4 rounded-sm border border-indigo-200 shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider mb-1">收产包</p>
              <p className="text-2xl font-black text-indigo-900 font-mono">{formatMoney(summaryIncomePackage)}</p>
            </div>
            <p className="text-[9px] text-indigo-500 mt-2 font-medium">公式: 收款包 + 产兑包</p>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 p-4 rounded-sm border border-amber-200 shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-[10px] text-amber-700 font-bold uppercase tracking-wider mb-1">收款包</p>
              <p className="text-2xl font-black text-amber-900 font-mono">{formatMoney(summaryRevenuePackage)}</p>
            </div>
            <p className="text-[9px] text-amber-500 mt-2 font-medium">公式: 收款包合计</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-4 rounded-sm border border-emerald-200 shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider mb-1">产兑包</p>
              <p className="text-2xl font-black text-emerald-950 font-mono">{formatMoney(summaryValuePackage)}</p>
            </div>
            <p className="text-[9px] text-emerald-600 mt-2 font-medium">公式: 产兑包合计</p>
          </div>
        </div>



        {/* 移动端卡片视图 (Narrow Screen Card View) */}
        <div className="block md:hidden space-y-3 p-2">
          {paginatedLogs.map(log => {
            if (!log) return null;
            const collector = managedUsers.find(u => u.id === log.recordedCollectorId);
            const resource = resources.find(r => r.id === log.miningId);
            const operator = managedUsers.find(u => u.id === log.rankId);
            
            const weightInfo = getHedgeWeight(log.recordedCollectorId || '', log.amount);
            const cWeight = log.cClassRatio !== undefined ? log.cClassRatio : weightInfo.cWeight;
            const b2Weight = log.b2ClassRatio !== undefined ? log.b2ClassRatio : weightInfo.b2Weight;
            const factor = getLogRefineFactor(log, resource, collector);
            const rawAmount = log.rawAmount || log.amount || 0;

            const isValueLine = log.category === RefineCategory.Value;
            const isRevenueLine = log.category === RefineCategory.Revenue;

            const valPreHedge = rawAmount * factor;
            const valPostHedge = valPreHedge * cWeight * b2Weight;
            const valHasHedge = cWeight < 1 || b2Weight < 1;

            const revPreHedge = calculateInjectedAmount(log) * factor;
            const revPostHedge = revPreHedge * cWeight;
            const revHasHedge = cWeight < 1;

            const displayInjection = calculateInjectedAmount(log);

            return (
              <div key={log.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs space-y-2 text-[11px]">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant={log.category === RefineCategory.Revenue ? 'warning' : 'success'}>
                      {log.category === RefineCategory.Revenue ? '收款' : '产值'}
                    </Badge>
                    <span className="font-mono font-bold text-slate-800">{log.miningId}</span>
                    <span className="font-mono text-slate-400 text-[10px]">#{log.id}</span>
                  </div>
                  <Badge variant={
                    log.status === AuditStatus.Approved ? 'success' : 
                    log.status === AuditStatus.Rejected ? 'error' : 
                    log.status === AuditStatus.Confirmed ? 'info' : 'warning'
                  }>
                    {log.status === AuditStatus.Approved ? '入库' : log.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 text-slate-700">
                  <div>
                    <span className="text-slate-400 text-[10px] block">{TERMINOLOGY.BUSINESS_UNIT} / 收集人</span>
                    <span className="font-bold">{labelBusinessUnit(operator?.center)} · {formatCollectorDisplay(log.recordedCollectorId, managedUsers)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 text-[10px] block">
                      {log.category === RefineCategory.Value ? '输入产值' : '输入收款'}
                    </span>
                    <span className="font-mono font-bold text-slate-800">{formatMoney(getRawInputAmount(log))}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 text-[10px] block">注入积分</span>
                    <span className="font-mono font-bold text-slate-900">{formatMoney(displayInjection)}</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-2 rounded-lg grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className="text-slate-400">C权 / B2权: </span>
                    <span className={`font-mono font-bold ${cWeight < 0.8 ? 'text-amber-800 bg-amber-100 px-1 rounded' : 'text-slate-800'}`} title={cWeight < 0.8 ? "当前 C 权低于 0.8，请确认风险。" : undefined}>
                      {cWeight.toFixed(4)}{cWeight < 0.8 ? ' (低)' : ''} / {isRevenueLine ? '—' : b2Weight.toFixed(4)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400">确权类型: </span>
                    <span className="font-bold text-slate-700">{log.confirmationType || '手动确权'}</span>
                  </div>
                  <div className="col-span-2 flex justify-between items-center border-t border-slate-100 pt-1 mt-1">
                    <span className="text-slate-500 font-bold">{isValueLine ? '产兑包' : '收款包'}:</span>
                    <span className={`font-mono font-bold ${isValueLine ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {isValueLine ? (
                        valHasHedge ? `${formatMoney(valPreHedge)} → ${formatMoney(valPostHedge)}` : formatMoney(valPostHedge)
                      ) : (
                        revHasHedge ? `${formatMoney(revPreHedge)} → ${formatMoney(revPostHedge)}` : formatMoney(revPostHedge)
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-[9px] text-slate-400 pt-1">
                  <span>业务: {resolveLogBusinessDate(log)}</span>
                  <span>提交: {formatSubmissionDate(log.timestamp)}</span>
                </div>
              </div>
            );
          })}
          {filteredLogs.length === 0 && (
            <div className="px-6 py-12 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest">{UI_LABELS.EMPTY_DEFAULT}</div>
          )}
        </div>

        {/* 桌面端表格视图 (Desktop Table View) */}
        <div className="hidden md:block overflow-x-auto border-b border-slate-100 pb-2 custom-scrollbar">
          <table className="w-full text-left whitespace-nowrap min-w-max">
            <thead className="bg-white z-10 shadow-sm">
              <tr className="bg-slate-50/90 text-[9px] font-bold text-slate-400 uppercase border-b border-slate-200">
                <th className="px-2 py-4">矿山编号</th>
                <th className="px-2 py-4">类别</th>
                <th className="px-2 py-4">编号</th>
                <th className="px-2 py-4 hidden md:table-cell">业务日期</th>
                <th className="px-2 py-4 hidden md:table-cell">提交日期</th>
                <th className="px-2 py-4">{TERMINOLOGY.BUSINESS_UNIT}</th>
                <th className="px-2 py-4">{TERMINOLOGY.LOG_OPERATOR_ID}</th>
                <th className="px-2 py-4">确权类型</th>
                <th className="px-2 py-4 text-right">输入数值</th>
                <th className="px-2 py-4 text-right">注入积分</th>
                <th className="px-2 py-4 text-right">C权</th>
                <th className="px-2 py-4 text-right">B2权</th>
                <th className="px-2 py-4 text-right">产兑包</th>
                <th className="px-2 py-4 text-right">收款包</th>
                <th className="px-2 py-4 hidden md:table-cell">确权日期</th>
                <th className="px-2 py-4">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedLogs.map(log => {
                if (!log) return null;
                const collector = managedUsers.find(u => u.id === log.recordedCollectorId);
                const resource = resources.find(r => r.id === log.miningId);
                const operator = managedUsers.find(u => u.id === log.rankId);
                
                const weightInfo = getHedgeWeight(log.recordedCollectorId || '', log.amount);
                const cWeight = log.cClassRatio !== undefined ? log.cClassRatio : weightInfo.cWeight;
                const b2Weight = log.b2ClassRatio !== undefined ? log.b2ClassRatio : weightInfo.b2Weight;
                const factor = getLogRefineFactor(log, resource, collector);
                const rawAmount = log.rawAmount || log.amount || 0;

                const isValueLine = log.category === RefineCategory.Value;
                const isRevenueLine = log.category === RefineCategory.Revenue;

                // 产值对冲前: rawAmount × 提炼因子
                const valPreHedge = rawAmount * factor;
                const valPostHedge = valPreHedge * cWeight * b2Weight;
                const valHasHedge = cWeight < 1 || b2Weight < 1;

                // 收款对冲前: 注入积分 × 提炼因子
                const revPreHedge = calculateInjectedAmount(log) * factor;
                const revPostHedge = revPreHedge * cWeight;
                const revHasHedge = cWeight < 1;

                const displayInjection = calculateInjectedAmount(log);

                return (
                  <tr key={log.id} className="text-[10px] hover:bg-slate-50 transition-colors">
                    <td className="px-2 py-4">
                       <div className="flex flex-col">
                          <span className="text-[10px] font-mono font-bold text-slate-600">{log.miningId}</span>
                          {resource && (
                            <div className="flex h-1 w-24 bg-slate-100 rounded-full overflow-hidden mt-1 shadow-inner">
                               <div style={{ width: `${((log.category === RefineCategory.Revenue ? resource.pendingRevenue : resource.pendingValue) / ((log.category === RefineCategory.Revenue ? getCurrentRevenueCapacity(resource) : getCurrentValueCapacity(resource)) + (log.category === RefineCategory.Revenue ? resource.minedRevenue : resource.minedValue) || 1)) * 100}%` }} className="bg-amber-400 h-full" />
                               <div style={{ width: `${((log.category === RefineCategory.Revenue ? resource.confirmedRevenue : resource.confirmedValue) / ((log.category === RefineCategory.Revenue ? getCurrentRevenueCapacity(resource) : getCurrentValueCapacity(resource)) + (log.category === RefineCategory.Revenue ? resource.minedRevenue : resource.minedValue) || 1)) * 100}%` }} className="bg-emerald-500 h-full" />
                               <div style={{ width: `${((log.category === RefineCategory.Revenue ? resource.unconfirmedRevenue : resource.unconfirmedValue) / ((log.category === RefineCategory.Revenue ? getCurrentRevenueCapacity(resource) : getCurrentValueCapacity(resource)) + (log.category === RefineCategory.Revenue ? resource.minedRevenue : resource.minedValue) || 1)) * 100}%` }} className="bg-slate-300 h-full" />
                               <div style={{ width: `${((log.category === RefineCategory.Revenue ? resource.minedRevenue : resource.minedValue) / ((log.category === RefineCategory.Revenue ? getCurrentRevenueCapacity(resource) : getCurrentValueCapacity(resource)) + (log.category === RefineCategory.Revenue ? resource.minedRevenue : resource.minedValue) || 1)) * 100}%` }} className="bg-blue-500 h-full" />
                            </div>
                          )}
                       </div>
                    </td>
                    <td className="px-2 py-4">
                      <Badge variant={log.category === RefineCategory.Revenue ? 'warning' : 'success'}>
                        {log.category === RefineCategory.Revenue ? ' 收款' : ' 产值'}
                      </Badge>
                    </td>
                    <td className="px-2 py-4 font-mono text-slate-400">{log.id}</td>
                    <td className="px-2 py-4 text-slate-500 font-bold hidden md:table-cell">{resolveLogBusinessDate(log)}</td>
                    <td className="px-2 py-4 text-slate-400 hidden md:table-cell">{formatSubmissionDate(log.timestamp)}</td>
                    <td className="px-2 py-4 text-slate-600">{labelBusinessUnit(operator?.center)}</td>
                    <td className="px-2 py-4">
                      <span className="font-bold text-slate-700">{formatCollectorDisplay(log.recordedCollectorId, managedUsers)}</span>
                    </td>
                    <td className="px-2 py-4">
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold">
                        {log.confirmationType || '手动确权'}
                      </span>
                    </td>
                    <td className="px-2 py-4 text-right font-mono font-bold text-slate-700">{formatMoney(getRawInputAmount(log))}</td>
                    <td className="px-2 py-4 text-right font-mono font-bold text-slate-700">{formatMoney(displayInjection)}</td>
                    <td className={`px-2 py-4 text-right font-mono font-black ${cWeight < 0.8 ? 'bg-amber-100/60 text-amber-900' : 'text-slate-900 bg-slate-50/50'}`} title={cWeight < 0.8 ? "当前 C 权低于 0.8，请确认风险。" : undefined}>
                      <span className="inline-flex items-center justify-end gap-1">
                        {cWeight.toFixed(4)}
                        {cWeight < 0.8 && (
                          <span className="px-1 py-0.2 text-[9px] bg-amber-500 text-white rounded font-black shadow-sm" title="当前 C 权低于 0.8，请确认风险。">
                            ⚠️ 低
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-2 py-4 text-right font-mono font-black text-slate-900 bg-slate-50/50">
                      {isRevenueLine ? '—' : b2Weight.toFixed(4)}
                    </td>
                    <td className="px-2 py-4 text-right font-mono font-bold text-emerald-600">
                      {isValueLine ? (
                        valHasHedge
                          ? `${formatMoney(valPreHedge)} → ${formatMoney(valPostHedge)}`
                          : formatMoney(valPostHedge)
                      ) : '—'}
                    </td>
                    <td className="px-2 py-4 text-right font-mono font-bold text-amber-600">
                      {isRevenueLine ? (
                        revHasHedge
                          ? `${formatMoney(revPreHedge)} → ${formatMoney(revPostHedge)}`
                          : formatMoney(revPostHedge)
                      ) : '—'}
                    </td>
                    <td className="px-2 py-4 text-slate-500 font-mono hidden md:table-cell">
                      {log.confirmedAt ? new Date(log.confirmedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td className="px-2 py-4">
                      <Badge variant={
                        log.status === AuditStatus.Approved ? 'success' : 
                        log.status === AuditStatus.Rejected ? 'error' : 
                        log.status === AuditStatus.Confirmed ? 'info' : 'warning'
                      }>
                        {log.status === AuditStatus.Approved ? '入库' : log.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={16} className="px-6 py-20 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest">{UI_LABELS.EMPTY_DEFAULT}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Unified Pagination for both Mobile and Desktop */}
        {Math.ceil(filteredLogs.length / PAGE_SIZE) > 1 && (
          <div className="flex items-center justify-between px-6 py-4 bg-white border-t border-slate-100">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              显示 {Math.min(filteredLogs.length, (currentPage - 1) * PAGE_SIZE + 1)}-{Math.min(filteredLogs.length, currentPage * PAGE_SIZE)} / 共 {filteredLogs.length} 条
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
                  <span className="text-[10px] font-bold text-slate-400">{Math.ceil(filteredLogs.length / PAGE_SIZE)}</span>
                </div>
                <button 
                  disabled={currentPage === Math.ceil(filteredLogs.length / PAGE_SIZE)}
                  onClick={() => {
                    setCurrentPage(prev => Math.min(Math.ceil(filteredLogs.length / PAGE_SIZE), prev + 1));
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

      {/* 批量导入解析结果与校验失败明细弹窗 */}
      <StandardModal
        isOpen={isImportResultModalOpen}
        onClose={() => setIsImportResultModalOpen(false)}
        title="批量导入解析结果"
        subtitle={
          <div className="flex items-center gap-2 mt-1 text-xs">
            <span className="font-medium text-slate-600">总数据: {pendingImportLogs.length + failedImportRows.length} 条</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
              校验通过 {pendingImportLogs.length} 条
            </span>
            {failedImportRows.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold border border-rose-200">
                失败 {failedImportRows.length} 条
              </span>
            )}
            {failedImportRows.some(r => r.reason === '重复记录') && (
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold border border-amber-200">
                重复 {failedImportRows.filter(r => r.reason === '重复记录').length} 条
              </span>
            )}
          </div>
        }
        maxWidthClassName="max-w-3xl"
      >
        <StandardModal.Body className="space-y-4">
          {failedImportRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-rose-50 border border-rose-200 p-3 rounded-md">
                <div className="flex items-center gap-2 text-rose-800 text-xs font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>
                    发现 {failedImportRows.length} 行无法通过校验的异常数据
                    {failedImportRows.some(r => r.reason === '重复记录') && (
                      <span className="text-amber-800 ml-1">
                        (含 {failedImportRows.filter(r => r.reason === '重复记录').length} 条重复记录)
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {failedImportRows.some(r => r.reason === '重复记录') && (
                    <button
                      type="button"
                      onClick={handleDownloadDuplicateRows}
                      className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold border border-amber-300 rounded shadow-sm transition-colors flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      下载重复清单 (.xlsx)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDownloadFailedRows}
                    className="px-3 py-1 bg-white hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-300 rounded shadow-sm transition-colors flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    下载失败明细 (.xlsx)
                  </button>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-md bg-white shadow-inner">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="p-2 font-bold text-slate-600 w-16">行号</th>
                      <th className="p-2 font-bold text-slate-600 w-24">矿山编号</th>
                      <th className="p-2 font-bold text-slate-600 w-16">类别</th>
                      <th className="p-2 font-bold text-slate-600 w-24">采集主体</th>
                      <th className="p-2 font-bold text-slate-600 w-24">业务日期</th>
                      <th className="p-2 font-bold text-slate-600 w-20">输入数值</th>
                      <th className="p-2 font-bold text-slate-600">失败原因</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {failedImportRows.map((item, idx) => (
                      <tr key={idx} className={`hover:bg-rose-50/50 transition-colors ${item.reason === '重复记录' ? 'bg-amber-50/30' : ''}`}>
                        <td className="p-2 font-mono text-slate-500 font-bold">#{item.lineNum}</td>
                        <td className="p-2 font-mono text-slate-700 font-bold">{item.miningId}</td>
                        <td className="p-2 text-slate-700">{item.categoryStr}</td>
                        <td className="p-2 text-slate-700">{item.collectorStr}</td>
                        <td className="p-2 font-mono text-slate-600">{item.businessDateStr}</td>
                        <td className="p-2 font-mono text-slate-700">{item.rawAmountStr}</td>
                        <td className={`p-2 font-bold ${item.reason === '重复记录' ? 'text-amber-700' : 'text-rose-600'}`}>
                          {item.reason === '重复记录' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-bold">
                              重复记录
                            </span>
                          ) : item.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {pendingImportLogs.length > 0 ? (
            <div className="bg-emerald-50/80 border border-emerald-200 p-4 rounded-md text-xs space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>有 {pendingImportLogs.length} 条数据通过校验，点击下方按钮开始导入</span>
              </div>
              <p className="text-slate-600">
                点击【确认导入并落库】将执行原子落库操作。
                {failedImportRows.length > 0 && " (校验失败的行将被忽略)"}
              </p>
            </div>
          ) : (
            <div className="bg-slate-100 p-4 rounded-md text-center text-xs text-slate-500 font-medium">
              没有符合导入条件的有效记录，请检查 Excel 文件修改后重试。
            </div>
          )}
        </StandardModal.Body>

        <StandardModal.Footer className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsImportResultModalOpen(false)}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
          >
            {pendingImportLogs.length > 0 ? '取消' : '关闭'}
          </button>
          {pendingImportLogs.length > 0 && (
            <button
              type="button"
              onClick={handleConfirmExecuteImport}
              className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded shadow-md transition-colors flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              确认导入并落库 ({pendingImportLogs.length} 条)
            </button>
          )}
        </StandardModal.Footer>
      </StandardModal>

      {/* 批量落库等待遮罩 */}
      {isPersistingImport && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 p-6 max-w-sm w-full text-center space-y-5">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto border border-blue-100 shadow-inner">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-800 tracking-tight">正在落库，请勿关闭页面…</h3>
              <p className="text-xs text-slate-500 font-medium">
                准备写入 <span className="font-mono font-bold text-blue-600">{importPersistCount}</span> 条记录 {persistSeconds > 0 && `(${persistSeconds}s)`}
              </p>
            </div>
            {/* Indeterminate progress bar */}
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden relative">
              <div className="absolute inset-y-0 bg-blue-600 rounded-full animate-pulse w-full"></div>
            </div>
            {persistSeconds >= 30 ? (
              <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-xs text-amber-800 font-bold space-y-1">
                <p>仍在处理中，请勿关闭页面，可稍后刷新核对结果</p>
              </div>
            ) : (
              <p className="text-[10px] text-slate-400">正在与服务器进行原子化事务同步，请稍候</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ValueCreation;
