
import React, { useState, useEffect, useMemo } from 'react';
import { TIER_COEFFICIENTS } from '../src/constants/coefficients';
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
} from '../src/utils/reconcileMiningFromLogs';
import { USER_LIST } from '../constants';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  Cell, Legend, CartesianGrid, ComposedChart, Line, PieChart, Pie
} from 'recharts';
import { Card, ProgressBar, Badge, ProjectStatusBadge } from '../src/components/UI';
import StandardModal from '../src/components/StandardModal';
import { UI_LABELS } from '../src/constants/uiLabels';
import { aggregateMiningQuadrantsFromLogs } from '../src/utils/purification';
import * as XLSX from 'xlsx';
import { calculateHistoricalNetValue, calculateDualTrackCoreMatrices, calculateT1PlusValue, calculateT1PlusRevenue } from '../src/utils/business';
import { deriveProjectStatus, isProjectWritable } from '../src/utils/projectStatus';
import { syncWorkspace } from '../src/services/api';
import { toast } from 'sonner';
import { CityGuardianModal, useCityGuardianModal } from '../src/components/CityGuardianModal';
import { Info, AlertCircle, CheckCircle2, X } from 'lucide-react';
import {
  getInitialRevenueCapacity,
  getInitialValueCapacity,
  getCurrentRevenueCapacity,
  getCurrentValueCapacity
} from '../src/utils/miningCapacity';
import { getExecutionType, getExecutionTypeBadgeColor, EXECUTION_TYPE_EXPLANATIONS } from '../src/utils/executionType';
import {
  getLocalDateString,
  getLocalMonthString,
  resolveLogBusinessDate,
  resolveLogBusinessMonth,
  formatSubmissionDate,
  formatSubmissionTime,
  isDateInRange,
} from '../src/utils/dateUtils';
import { formatAmount } from '../src/utils/formatters';
import { InfoTip } from '../src/components/InfoTip';
import { BusinessDateFilter } from '../src/components/BusinessDateFilter';

// Audit Modal Component
const AuditModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  data: { metric: string; original: number; target: number }[];
}> = ({ isOpen, onClose, onConfirm, data }) => {
  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onClose}
      title="城市守护者"
      subtitle="提报数据核对与确权审计"
      maxWidthClassName="max-w-lg"
    >
      <div className="space-y-6">
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
  onLogSubmit: (log: ValueCreationLog | ValueCreationLog[]) => void;
  onSwitchTab?: (tab: string) => void;
  transactions?: InternalTransaction[];
  onConfirmTransaction?: (id: string, status: TransactionStatus) => void;
  circuitBreakers?: CircuitBreaker[];
  onAddCircuitBreaker?: (cb: CircuitBreaker) => void;
  quotaSnapshots?: Record<string, QuotaSnapshot>;
  processingLogIds?: Set<string>;
}

type TimePeriod = 'monthly' | 'quarterly' | 'yearly';

export const tierDisplayMap: Record<string, { name: string, desc: string }> = {
  A: { name: 'T1 级提炼 (企项配方)', desc: '默认结算方式 (高产专 53% / 产专 48%)' },
  B: { name: 'T2 级提炼 (招采配方)', desc: '招标采购结算 (高产专 60% / 产专 55%)' },
  C: { name: 'T3 级提炼 (安评配方)', desc: '安全评价结算 (高产专 50% / 产专 40%)' },
  D: { name: 'T4 级提炼 (检测配方)', desc: '电气检测结算 (高产专 52% / 产专 52%)' }
};

const ValueCreation: React.FC<ValueCreationProps> = ({ 
  user, users = [], resources, logs, onLogSubmit, transactions = [], onConfirmTransaction, circuitBreakers = [], onAddCircuitBreaker,
  quotaSnapshots = {}, processingLogIds = new Set()
}) => {
  const miningReconciliations = useMemo(() => reconcileMiningLogs(logs, resources), [logs, resources]);

  const [managedUsers, setManagedUsers] = useState<User[]>([]);
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>(user.id);
  const [selectedCollectors, setSelectedCollectors] = useState<{ id: string, amount: number, rawAmount?: number }[]>([]);
  const [selectedMiningId, setSelectedMiningId] = useState('');
  const [miningSearchTerm, setMiningSearchTerm] = useState('');
  const { modalState, showAlert, showConfirm, closeModal } = useCityGuardianModal();
  const [selectedRefineType, setSelectedRefineType] = useState<RefineType>(RefineType.Enterprise);
  const [selectedCategory, setSelectedCategory] = useState<RefineCategory>(RefineCategory.Revenue);
  const [selectedTier, setSelectedTier] = useState<string>('A');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('企业项目');
  const [error, setError] = useState('');
  const [recordTab, setRecordTab] = useState<'revenue' | 'linkedPending' | 'confirmed' | 'history'>('revenue');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(() => getLocalMonthString()); // YYYY-MM
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [auditData, setAuditData] = useState<{ metric: string; original: number; target: number }[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString()); // YYYY-MM-DD
  const [filterMonth, setFilterMonth] = useState<string>(() => getLocalMonthString()); // 记录筛选月份
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  useEffect(() => {
    setSelectedOperatorId(user.id);
  }, [user.id]);

  useEffect(() => {
    const resource = resources.find(r => r.id === selectedMiningId);
    if (resource) {
      const prefix = resource.id.charAt(0).toUpperCase();
      if (prefix === 'A') {
        setSelectedTier('A');
        setSelectedSubCategory('企业项目');
        setSelectedRefineType(RefineType.Enterprise);
      } else if (prefix === 'B') {
        setSelectedTier('B');
        setSelectedSubCategory('招采项目');
        setSelectedRefineType(RefineType.Bidding);
      } else if (prefix === 'C') {
        setSelectedTier('C');
        setSelectedSubCategory('安全评价');
        setSelectedRefineType(RefineType.SafetyEval);
      } else if (prefix === 'D') {
        setSelectedTier('D');
        setSelectedSubCategory('职业卫生/电气检测');
        setSelectedRefineType(RefineType.OccHealthElectric);
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
      [RefineType.Enterprise]: { tier: 'A', subCategory: '企业项目' },
      [RefineType.Bidding]: { tier: 'B', subCategory: '招标采购项目' },
      [RefineType.SafetyEval]: { tier: 'C', subCategory: '安全评价' },
      [RefineType.OccHealthElectric]: { tier: 'D', subCategory: '职业卫生/电气检测' },
      [RefineType.OccHealth]: { tier: 'D', subCategory: '职业卫生' },
      [RefineType.Outsourced]: { tier: 'A', subCategory: '战略性外派' },
      [RefineType.EmergencyG]: { tier: 'A', subCategory: '应急演练（G)' },
      [RefineType.TrainingG]: { tier: 'A', subCategory: '培训（G）' },
      [RefineType.NonEffectiveHours]: { tier: 'A', subCategory: '企业项目' }
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
    if (users && users.length > 0) {
      setManagedUsers(users);
    } else {
      const saved = localStorage.getItem('shihe_managed_users');
      setManagedUsers(saved ? JSON.parse(saved) : USER_LIST);
    }
  }, [users]);

  const canSelectOthers = useMemo(() => {
    return user.role === Role.Rank || user.category === '系统管理员' || user.role === Role.Admin;
  }, [user]);

  const businessUnitManagers = useMemo(() => managedUsers.filter(u => 
    (u.userStatus !== 'inactive') &&
    (u.role === Role.Rank || u.category === '系统管理员' || user.role === Role.Admin)
  ), [managedUsers, user.role]);

  useEffect(() => {
    // 自动匹配当前智能体帐号所属经营单元
    if (user.center) {
      // Search within businessUnitManagers to ensure we only pick valid ones
      const businessUnitRep = businessUnitManagers.find(u => u.center === user.center && u.role === Role.Rank);
      if (businessUnitRep) {
        setSelectedOperatorId(businessUnitRep.id);
      } else {
        setSelectedOperatorId(user.id);
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
    if (u.userStatus === 'inactive') return false;
    // 注入积分 采集主体 只显示 同一 经营单元 采集主体列表
    if (user.center && u.center !== user.center) return false;
    return true;
  }), [managedUsers, user.center]);
  
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

  const selectedOperator = useMemo(() => managedUsers.find(u => u.id === selectedOperatorId), [managedUsers, selectedOperatorId]);
  const availableResources = useMemo(() => {
    if (!selectedOperator) return [];
    return resources.filter(r => {
      // 仅进行中状态可提报
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
    if (!selectedResource) {
      return { confirmedRevenue: 0, pendingRevenue: 0, confirmedValue: 0, pendingValue: 0, minedRevenue: 0, minedValue: 0 };
    }

    const resourceLogs = logs.filter(l => 
      l && l.miningId === selectedResource.id && 
      l.costCategory !== 'C' && 
      !(l.costCategory === 'B' && l.valueConsumptionMode === 'B2')
    );

    const confirmedRevenue = resourceLogs
      .filter(l => l.category === RefineCategory.Revenue && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved))
      .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

    const pendingRevenue = resourceLogs
      .filter(l => l.category === RefineCategory.Revenue && l.status === AuditStatus.Pending)
      .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

    const confirmedValue = resourceLogs
      .filter(l => l.category === RefineCategory.Value && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved))
      .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

    const pendingValue = resourceLogs
      .filter(l => l.category === RefineCategory.Value && l.status === AuditStatus.Pending)
      .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

    const minedRevenue = Number(selectedResource.minedRevenue) || 0;
    const minedValue = Number(selectedResource.minedValue) || 0;

    return {
      confirmedRevenue,
      pendingRevenue,
      confirmedValue,
      pendingValue,
      minedRevenue,
      minedValue
    };
  }, [selectedResource, logs]);

  // 计算最高可提炼量（剩余额度）
  const maxAllowed = useMemo(() => {
    // 优先使用后端快照数据
    if (selectedMiningId && quotaSnapshots[selectedMiningId]) {
      const snap = quotaSnapshots[selectedMiningId];
      return selectedCategory === RefineCategory.Revenue ? snap.revenue.available : snap.value.available;
    }

    if (!selectedResource) return 0;
    
    if (selectedCategory === RefineCategory.Revenue) {
      const initial = getInitialRevenueCapacity(selectedResource);
      return Math.max(0, Number(initial) - mineralOccupancy.minedRevenue - mineralOccupancy.confirmedRevenue - mineralOccupancy.pendingRevenue);
    } else {
      const initial = getInitialValueCapacity(selectedResource);
      return Math.max(0, Number(initial) - mineralOccupancy.minedValue - mineralOccupancy.confirmedValue - mineralOccupancy.pendingValue);
    }
  }, [selectedResource, selectedMiningId, selectedCategory, quotaSnapshots, mineralOccupancy]);

  // 计算从内部交易中接收到的积分上限 (仅针对接收方)
  const isOriginalOwner = useMemo(() => {
    if (!selectedResource || !user.center) return false;
    if (selectedCategory === RefineCategory.Revenue) {
      return selectedResource.assignedToRevenue?.split(',').map(c => c.trim()).includes(user.center) || 
             selectedResource.assignedTo?.split(',').map(c => c.trim()).includes(user.center);
    } else {
      return selectedResource.assignedToValue?.split(',').map(c => c.trim()).includes(user.center) ||
             selectedResource.assignedTo?.split(',').map(c => c.trim()).includes(user.center);
    }
  }, [selectedResource, user.center, selectedCategory]);

  const userCenterUsers = useMemo(() => {
    if (!user.center) return new Set([user.id]);
    return new Set(managedUsers.filter(u => u.center === user.center).map(u => u.id));
  }, [managedUsers, user.center, user.id]);

  const receivedLimit = useMemo(() => {
    if (!selectedMiningId || !user.id) return Infinity;
    
    // 过滤出接收方属于当前接收经营单元的已确权资源交易
    const receivedTxs = transactions.filter(tx => 
      (tx.receiverId === user.id || userCenterUsers.has(tx.receiverId)) && 
      tx.miningId === selectedMiningId && 
      tx.status === TransactionStatus.Verified &&
      tx.type === TransactionType.Resource
    );

    if (receivedTxs.length > 0) {
      if (selectedCategory === RefineCategory.Revenue) {
        const totalRawRevenue = receivedTxs.reduce((sum, tx) => sum + (tx.revenueAmount || 0), 0);
        return Math.round(totalRawRevenue * 0.933);
      } else {
        const totalValue = receivedTxs.reduce((sum, tx) => sum + (tx.valueAmount || 0), 0);
        return Math.round(totalValue);
      }
    }
    
    // 如果是管理员或原始所有者，不受交易限制（受物理上限限制）
    if (user.role === Role.Admin || isOriginalOwner) return Infinity;

    return 0; // 既不是原始所有者也没收到交易，不能提报
  }, [transactions, selectedMiningId, user.id, user.role, userCenterUsers, selectedCategory, isOriginalOwner]);

  // 计算已注入累计积分
  const alreadyInjected = useMemo(() => {
    if (!selectedMiningId || !user.id) return 0;
    return logs
      .filter(l => 
        l.miningId === selectedMiningId && 
        l.recordedCollectorId === user.id && 
        l.category === selectedCategory &&
        (l.status === AuditStatus.Pending || l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved)
      )
      .reduce((sum, l) => sum + Number(l.amount), 0);
  }, [logs, selectedMiningId, user.id, selectedCategory]);

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

    if (selectedCategory === RefineCategory.Value) {
      if (selectedTier === 'A') return vCoeffs.Enterprise;
      if (selectedTier === 'B') return vCoeffs.Bidding;
      if (selectedTier === 'C') return vCoeffs.SafetyEval;
      if (selectedTier === 'D') return vCoeffs.OccHealth;
      return vCoeffs.OccHealth;
    }

    const rCoeffs = isHighRevenueExpert ? TIER_COEFFICIENTS.REVENUE_HIGH : TIER_COEFFICIENTS.REVENUE_MID_INITIAL;

    if (selectedTier === 'A') return rCoeffs.Enterprise;
    if (selectedTier === 'B') return rCoeffs.Bidding;
    if (selectedTier === 'C') return rCoeffs.SafetyEval;
    return rCoeffs.SafetyEval; // Default
  }, [selectedCategory, selectedTier, managedUsers, selectedResource, selectedRefineType]);

  const getHedgeWeight = React.useCallback((collectorId: string, amount: number) => {
    const isValue = selectedCategory === RefineCategory.Value;
    const collector = managedUsers.find(u => u.id === collectorId);
    const isProdSpecialist = collector && isValueExpert(collector);

    if (!selectedResource) return { cWeight: 1, b2Weight: 1, combined: 1 };

    // 获取并计算双轨矩阵
    const allResourceLogs = logs.filter(l => l && l.miningId === selectedMiningId && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved));
    const allCPoints = allResourceLogs.filter(l => l.costCategory === 'C').map(l => l.dynamicCost || 0);

    const matrices = calculateDualTrackCoreMatrices({
      miningId: selectedMiningId || '',
      originalRevenueLimit: getInitialRevenueCapacity(selectedResource),
      npcRevenueStatus: selectedResource.category === '据实' ? '据实' : '100%',
      npcRevenueOverrideValue: getCurrentRevenueCapacity(selectedResource),
      totalConfirmedRevenue: selectedResource.confirmedRevenue || 0,
      cRevenuePointsList: allCPoints, // 使用全部 C 消耗进行计算
      originalValueLimit: getInitialValueCapacity(selectedResource),
      npcValueStatus: selectedResource.category === '据实' ? '据实' : '100%',
      npcValueOverrideValue: getCurrentValueCapacity(selectedResource),
      totalConfirmedValue: selectedResource.confirmedValue || 0,
      cValuePointsList: allCPoints // 使用全部 C 消耗进行计算
    });
    
    // B2对冲的“定向性”约束：B2消耗作用于产值权重。如果是收款类，则 B2 对冲权重不参与计算，设为 1
    const isRevenue = selectedCategory === RefineCategory.Revenue;
    let b2Weight = 1;
    if (!isRevenue) {
      const approvedB2 = getB2ClassCostForResource(AuditStatus.Approved);
      const confirmedB2 = getB2ClassCostForResource(AuditStatus.Confirmed);
      const totalB2 = approvedB2 + confirmedB2;
      
      const approvedC = getCClassCostForResource(AuditStatus.Approved);
      const confirmedC = getCClassCostForResource(AuditStatus.Confirmed);
      const totalC = approvedC + confirmedC;
      
      // 计算 B2 权重时排除 C 类消耗，获得 C 对冲后的余额上限作为基准
      const valueLimit = matrices.updatedValueLimit;
      const limitCAdjusted = Math.max(0, valueLimit - totalC);
      b2Weight = limitCAdjusted > 0 ? Math.max(0, (limitCAdjusted - totalB2) / limitCAdjusted) : 1;
    }
    
    // 逻辑判定：
    // 1. 产值类 (Value)：始终受 C 和 B2 复合影响
    // 2. 收款类 (Revenue)：仅受 C 影响，不参与 B2 对冲
    const activeCWeight = isRevenue ? matrices.cRevenueWeight : matrices.cValueWeight;
    
    // 返回包含两个权重的对象
    return {
      cWeight: activeCWeight,
      b2Weight: b2Weight,
      combined: isRevenue 
        ? activeCWeight
        : (selectedCategory === RefineCategory.Value || isProdSpecialist 
          ? Math.min(1, activeCWeight * b2Weight)
          : activeCWeight)
    };
  }, [selectedCategory, selectedResource, getCClassCostForResource, getB2ClassCostForResource, managedUsers, isValueExpert, logs, selectedMiningId]);

  const calculateNetValueForCollector = React.useCallback((collectorId: string, amount: number) => {
    const factor = getFactorForCollector(collectorId);
    const weights = getHedgeWeight(collectorId, amount);
    
    // 统一公式：总预测收入包 = 注入积分 * 0.933 * [复合对冲权重] * 提炼因子
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
    
    const currentC = getCClassCostForResource(AuditStatus.Confirmed) + getCClassCostForResource(AuditStatus.Approved);
    const currentB2 = getB2ClassCostForResource(AuditStatus.Confirmed) + getB2ClassCostForResource(AuditStatus.Approved);
    
    // Check against resource state if applicable (internal consistency)
    // Here we can also verify if there are any pending logs that might affect future calculations
    const pendingC = getCClassCostForResource(AuditStatus.Pending);
    const pendingB2 = getB2ClassCostForResource(AuditStatus.Pending);
    
    // Calculate real-time weights for display
    const allResourceLogs = logs.filter(l => l && l.miningId === selectedMiningId && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved));
    const allCPoints = allResourceLogs.filter(l => l.costCategory === 'C').map(l => l.dynamicCost || 0);

    const matrices = calculateDualTrackCoreMatrices({
      miningId: selectedMiningId || '',
      originalRevenueLimit: getInitialRevenueCapacity(selectedResource),
      npcRevenueStatus: selectedResource.category === '据实' ? '据实' : '100%',
      npcRevenueOverrideValue: getCurrentRevenueCapacity(selectedResource),
      totalConfirmedRevenue: selectedResource.confirmedRevenue || 0,
      cRevenuePointsList: allCPoints,
      originalValueLimit: getInitialValueCapacity(selectedResource),
      npcValueStatus: selectedResource.category === '据实' ? '据实' : '100%',
      npcValueOverrideValue: getCurrentValueCapacity(selectedResource),
      totalConfirmedValue: selectedResource.confirmedValue || 0,
      cValuePointsList: allCPoints
    });

    const valueLimit = matrices.updatedValueLimit;
    const limitCAdjusted = Math.max(0, valueLimit - currentC);
    const b2Weight = limitCAdjusted > 0 ? Math.max(0, (limitCAdjusted - currentB2) / limitCAdjusted) : 1;
    const activeCWeight = selectedCategory === RefineCategory.Revenue ? matrices.cRevenueWeight : matrices.cValueWeight;

    return { 
      ok: true, 
      msg: '数据源同步中',
      stats: { currentC, currentB2, pendingC, pendingB2, cWeight: activeCWeight, b2Weight }
    };
  }, [selectedResource, getCClassCostForResource, getB2ClassCostForResource, logs, selectedMiningId, selectedCategory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

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
        ...(selectedCategory === RefineCategory.Revenue ? [] : [{ metric: 'B2对冲权重', original: 0, target: realtimeB2 }]),
        { metric: 'C对冲权重', original: 0, target: realtimeC },
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
        showAlert(`超额限制：本次注入提纯后积分（${Math.round(purifiedTotalAmount).toLocaleString()}）超过了当前最高可提炼量（${Math.round(maxAllowed).toLocaleString()}）。\n\n核算逻辑：预计资源储量上限 - 已确 - 待确 = 最高提炼量。`);
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
            .filter(tx => tx.receiverId === user.id && tx.miningId === selectedMiningId && tx.status === TransactionStatus.Verified)
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
          showAlert(`本月(N=${selectedResource.rhythmMonthN})授权额度不足。\n当前已录入：${Math.round(monthlyUsed).toLocaleString()}\n本次尝试：${Math.round(totalAmount).toLocaleString()}\n本月上限：${Math.round(selectedResource.monthlyQuota).toLocaleString()}\n\n请联系经营单元更新提炼指令或调整月份。`);
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
                rawAmount: c.amount,
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
        await syncWorkspace({ logs: [...logs, ...logsToSubmit] });
        showAlert(`提报指令提交成功并已落库！共提交 ${logsToSubmit.length} 条数据，预审中...`);
      } catch (err) {
        showAlert('提报落库失败，请稍后重试');
      }
    }

    setSelectedCollectors([]);
    setError('');
  };

  const scopeLogs = useMemo(() => {
    let list = logs.filter(l => l.rankId === selectedOperatorId || l.recordedCollectorId === selectedOperatorId);
    if (filterStartDate && filterEndDate) {
      list = list.filter(l => isDateInRange(resolveLogBusinessDate(l), filterStartDate, filterEndDate));
    } else if (filterMonth) {
      list = list.filter(l => l.month === filterMonth || resolveLogBusinessMonth(l) === filterMonth);
    }
    return list;
  }, [logs, selectedOperatorId, filterMonth, filterStartDate, filterEndDate]);

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
    return aggregateMiningQuadrantsFromLogs(logs, resources, selectedResource?.id);
  }, [logs, resources, selectedResource]);

  const filteredLogs = useMemo(() => {
    let list = logs.filter(l => l && (l.rankId === selectedOperatorId || l.recordedCollectorId === selectedOperatorId)).reverse();
    
    if (filterStartDate && filterEndDate) {
      list = list.filter(l => isDateInRange(resolveLogBusinessDate(l), filterStartDate, filterEndDate));
    } else if (filterMonth) {
      list = list.filter(l => l.month === filterMonth || resolveLogBusinessMonth(l) === filterMonth);
    }

    if (recordTab === 'revenue') {
      return list.filter(l => l.category === RefineCategory.Revenue && l.status === AuditStatus.Pending);
    } else if (recordTab === 'linkedPending') {
      return list.filter(l => l.category === RefineCategory.Value && l.status === AuditStatus.Pending && l.confirmationType === '联动确权');
    } else if (recordTab === 'confirmed') {
      return list.filter(l => l.status === AuditStatus.Confirmed);
    } else if (recordTab === 'history') {
      return list.filter(l => l.status === AuditStatus.Approved || l.status === AuditStatus.Rejected);
    } else {
      return [];
    }
  }, [logs, selectedOperatorId, recordTab, filterMonth, filterStartDate, filterEndDate]);

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

    const tier = log.costCategory || 'C';
    if (log.category === RefineCategory.Value) {
      const coeffs = isHighValueExpert ? TIER_COEFFICIENTS.VALUE_MANAGER : TIER_COEFFICIENTS.VALUE_CHAN;
      if (tier === 'A') return coeffs.Enterprise;
      if (tier === 'B') return coeffs.Bidding;
      if (tier === 'C') return coeffs.SafetyEval;
      if (tier === 'D') return coeffs.OccHealth;
      return coeffs.SafetyEval;
    } else {
      const coeffs = isHighRevenueExpert ? TIER_COEFFICIENTS.REVENUE_HIGH : isRevenueSpecialist ? TIER_COEFFICIENTS.REVENUE_MID_INITIAL : TIER_COEFFICIENTS.REVENUE_HIGH;
      if (tier === 'A') return coeffs.Enterprise;
      if (tier === 'B') return coeffs.Bidding;
      if (tier === 'C') return coeffs.SafetyEval;
      return coeffs.SafetyEval;
    }
  };

  const exportToExcel = () => {
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
          ? `${Math.round(preHedge)} → ${Math.round(postHedge)}`
          : `${Math.round(postHedge)}`;
      } else if (log.category === RefineCategory.Revenue) {
        const preHedge = rawAmount * 0.933 * factor;
        const postHedge = preHedge * cWeight;
        const hasHedge = cWeight < 1;
        revenuePackageDisplay = hasHedge
          ? `${Math.round(preHedge)} → ${Math.round(postHedge)}`
          : `${Math.round(postHedge)}`;
      }

      const isLogRev = log.category === RefineCategory.Revenue;
      const displayInjection = isLogRev
        ? (log.rawAmount != null ? Math.round(log.rawAmount * 0.933) : Math.round(log.amount || 0))
        : (log.rawAmount != null ? log.rawAmount : log.amount || 0);

      return {
        '矿山编号': log.miningId,
        '类别': log.category === RefineCategory.Revenue ? '收款' : '产值',
        '编号': log.id,
        '业务日期': resolveLogBusinessDate(log),
        '提交日期': formatSubmissionDate(log.timestamp),
        '经营单元': operator?.center || log.rankId,
        '采集主体': `${collector?.name || log.recordedCollectorId} (${collector?.category || '未定义'})`,
        '确权类型': log.confirmationType || '手动确权',
        '注入积分': displayInjection,
        'C对冲权重': cWeight.toFixed(4),
        'B2对冲权重': log.category === RefineCategory.Revenue ? '—' : b2Weight.toFixed(4),
        '产兑包': valuePackageDisplay,
        '收款包': revenuePackageDisplay,
        '确权日期': log.confirmedAt ? new Date(log.confirmedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-',
        '状态': log.status
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "入库记录");
    XLSX.writeFile(workbook, `价值确权入库记录_${new Date().toLocaleDateString()}.xlsx`);
  };

  if (!user || !resources || !logs) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">加载价值提炼仪表盘...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 md:space-y-6 lg:space-y-8 animate-in fade-in duration-500 pb-20">
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
                   <span className="ml-1 font-mono">C对冲权重({dataIntegrityStatus.stats?.cWeight != null ? dataIntegrityStatus.stats.cWeight.toFixed(4) : '1.0000'})</span>
                 ) : (
                   <span className="ml-1 font-mono">C对冲权重({dataIntegrityStatus.stats?.cWeight != null ? dataIntegrityStatus.stats.cWeight.toFixed(4) : '1.0000'}) | B2对冲权重({dataIntegrityStatus.stats?.b2Weight != null ? dataIntegrityStatus.stats.b2Weight.toFixed(4) : '1.0000'})</span>
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
          <div className="grid grid-cols-4 gap-4 md:gap-5">
            {/* Row 1 - Left Column: 采集主体 */}
            <div className="flex flex-col space-y-1.5 col-span-2">
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
                className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-xs outline-none focus:border-blue-900 focus:ring-2 focus:ring-blue-100 transition-all font-bold text-slate-800 h-10" 
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
                }).map(u => <option key={u.id} value={u.id}>{u.name} / {u.category}{u.secondaryRoles?.length ? ` (兼: ${u.secondaryRoles.join(',')})` : ''}</option>)}
              </select>
            </div>

            {/* Row 1 - Right Column: 矿山编号 */}
            <div className="flex flex-col space-y-1.5 col-span-2 relative">
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
                  className="w-full min-w-48 bg-white border border-slate-300 rounded-md px-3 py-2 text-xs outline-none focus:border-blue-900 focus:ring-2 focus:ring-blue-100 transition-all font-bold text-slate-800 h-10" 
                  required
                >
                  <option value="">自动匹配矿山编号...</option>
                  {availableResources.map(r => {
                    const { status } = deriveProjectStatus(r);
                    return (
                      <option key={r.id} value={r.id} disabled={selectedCategory === RefineCategory.Value && r.valueDepleted}>
                        {r.id} | [{status}] | 产当: {getCurrentValueCapacity(r)} (已确: {r.confirmedValue}) | 款当: {getCurrentRevenueCapacity(r)} (已确: {r.confirmedRevenue}) {selectedCategory === RefineCategory.Value && r.valueDepleted ? '[已满]' : ''}
                      </option>
                    );
                  })}
                </select>
                {selectedMiningId && (
                  <div className="w-full bg-slate-50 border border-slate-200 p-3 rounded-md shadow-sm space-y-2">
                    <div className="flex justify-between items-center text-[9px] font-bold">
                       <span className="text-slate-500">款初: <span className="text-indigo-600">{getInitialRevenueCapacity(selectedResource).toLocaleString()}</span> | 款当: <span className="text-amber-600">{getCurrentRevenueCapacity(selectedResource, logs).toLocaleString()}</span></span>
                       <span className="text-slate-500">产初: <span className="text-indigo-600">{getInitialValueCapacity(selectedResource).toLocaleString()}</span> | 产当: <span className="text-emerald-600">{getCurrentValueCapacity(selectedResource, logs).toLocaleString()}</span></span>
                    </div>
                    <div className="flex justify-between items-center text-[9px] font-bold">
                       <span className="text-slate-500">已注入累计: <span className="text-blue-600">{alreadyInjected.toLocaleString()}</span></span>
                       <span className="text-slate-500">剩余接收额度: <span className={(receivedLimit !== Infinity && remainingQuota < selectedCollectors.reduce((s, c) => s + c.amount, 0)) ? "text-rose-600" : "text-emerald-600"}>
                        {receivedLimit === Infinity ? '无交易限制' : remainingQuota.toLocaleString()}
                       </span></span>
                    </div>
                    {receivedLimit !== Infinity && (alreadyInjected + selectedCollectors.reduce((s, c) => s + c.amount, 0) > receivedLimit) && (
                      <p className="text-[9px] font-black text-rose-600 animate-pulse flex items-center">
                        <span className="mr-1">⚠️</span> 累计注入超出接收总量，触发熔断
                      </p>
                    )}
                  </div>
                )}
                <input 
                  type="text" 
                  placeholder="搜索编号..." 
                  title="输入矿山编号进行快速搜索"
                  value={miningSearchTerm}
                  onChange={(e) => {
                    const term = e.target.value;
                    setMiningSearchTerm(term);
                    if (term.trim() === '') return;
                    const match = availableResources.find(r => 
                      r.id.toLowerCase().includes(term.toLowerCase())
                    );
                    if (match) {
                      setSelectedMiningId(match.id);
                    }
                  }}
                  className="w-full min-w-48 bg-white border border-slate-300 rounded-md px-3 py-2 text-xs outline-none focus:border-blue-900 focus:ring-2 focus:ring-blue-100 transition-all font-bold text-slate-800 h-10"
                />
              </div>
            </div>

            {/* Row 2 - Col 1: 提炼配方 */}
            <div className="flex flex-col space-y-1.5 col-span-1">
              <div className="flex items-center space-x-1.5 h-4">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">提炼配方</label>
                {hasCustomFactor ? (
                  <span className="text-[8px] font-black text-emerald-600 animate-pulse bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 whitespace-nowrap">协议配方</span>
                ) : selectedResource && (
                  <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 whitespace-nowrap">标准配方</span>
                )}
              </div>
              <select 
                value={selectedTier} 
                onChange={(e) => setSelectedTier(e.target.value)} 
                className={`w-full border rounded-md px-3 py-2 text-xs outline-none ${
                  hasCustomFactor ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' : 'bg-slate-100 border-slate-200 text-slate-400'
                } cursor-not-allowed h-10`}
                disabled={true}
              >
                <option value="A">T1</option>
                <option value="B">T2</option>
                <option value="C">T3</option>
                {selectedCategory === RefineCategory.Value && (
                  <option value="D">T4</option>
                )}
              </select>
              {isRefineTypeCustomFactor && (
                <div className="mt-1 text-[9px] font-black text-emerald-600 animate-fade-in flex items-center">
                  <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1 animate-pulse"></span>
                  <span>专属自定义配方[类型]</span>
                </div>
              )}
              {!isRefineTypeCustomFactor && isResourceCustomFactor && (
                <div className="mt-1 text-[9px] font-black text-emerald-600 animate-fade-in flex items-center">
                  <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1 animate-pulse"></span>
                  <span>专属自定义配方</span>
                </div>
              )}
            </div>

            {/* Row 2 - Col 2: 提炼类型 */}
            <div className="flex flex-col space-y-1.5 col-span-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4">提炼类型</label>
              <select value={selectedRefineType} onChange={(e) => setSelectedRefineType(e.target.value as RefineType)} className="w-full bg-slate-100 border border-slate-200 rounded-md px-3 py-2 text-xs outline-none text-slate-400 cursor-not-allowed h-10" required disabled={true}>
                {selectedResource ? selectedResource.types.map(type => (
                  <option key={type} value={type}>{type}</option>
                )) : Object.values(RefineType).filter(t => t !== RefineType.NonEffectiveHours).map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Row 2 - Col 3: 业务日期 */}
            <div className="flex flex-col space-y-1.5 col-span-1">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center h-4">
                业务日期 <span className="text-rose-500 ml-1 font-bold">*</span>
              </label>
              <input 
                type="date" 
                value={selectedDate} 
                onChange={(e) => setSelectedDate(e.target.value)} 
                className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-xs outline-none focus:border-blue-900 focus:ring-2 focus:ring-blue-100 transition-all font-bold text-slate-800 h-10" 
                required
              />
            </div>

            {/* Row 2 - Col 4: 执行类型 */}
            <div className="flex flex-col space-y-1.5 col-span-1">
              <div className="flex items-center justify-between h-4">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  执行类型
                </label>
                {selectedResource && (
                  <span className="text-[9px] text-slate-400 font-medium truncate max-w-[120px]" title={`当前视角: ${selectedOperator?.center || user.center || '无'}`}>
                    视角: {selectedOperator?.center || user.center || '无'}
                  </span>
                )}
              </div>
              <div className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs flex items-center justify-between h-10 shadow-sm">
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
                  <span className="text-slate-400 font-medium text-[11px]">请先选择矿山编号</span>
                )}
              </div>
            </div>


          </div>

          {/* 第二行：矿山资源进度条 */}
          {selectedResource && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-8 bg-slate-50/50 p-4 rounded-sm border border-slate-100 animate-in slide-in-from-left-2 duration-300">
               <ProgressBar 
                 label=" 收款目前矿山资源进度" 
                 subLabel={(mineralOccupancy.confirmedRevenue + mineralOccupancy.minedRevenue) >= getCurrentRevenueCapacity(selectedResource) ? "已采集" : `${Math.round(mineralOccupancy.confirmedRevenue + mineralOccupancy.minedRevenue).toLocaleString()} / ${Math.round(getCurrentRevenueCapacity(selectedResource)).toLocaleString()}`}
                 value={Math.min(mineralOccupancy.confirmedRevenue + mineralOccupancy.minedRevenue, getCurrentRevenueCapacity(selectedResource))}
                 max={getCurrentRevenueCapacity(selectedResource)}
                 color="bg-amber-500"
               />
               <ProgressBar 
                 label=" 产值目前矿山资源进度" 
                 subLabel={(mineralOccupancy.confirmedValue + mineralOccupancy.minedValue) >= getCurrentValueCapacity(selectedResource) ? "已采集" : `${Math.round(mineralOccupancy.confirmedValue + mineralOccupancy.minedValue).toLocaleString()} / ${Math.round(getCurrentValueCapacity(selectedResource)).toLocaleString()}`}
                 value={Math.min(mineralOccupancy.confirmedValue + mineralOccupancy.minedValue, getCurrentValueCapacity(selectedResource))}
                 max={getCurrentValueCapacity(selectedResource)}
                 color="bg-emerald-500"
               />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 items-end">
            <div className="lg:col-span-12 space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">提炼属性类别</label>
              <div className="flex border border-slate-300 rounded-sm overflow-hidden h-10">
                <button
                  type="button"
                  disabled={isCategoryLocked}
                  onClick={() => setSelectedCategory(RefineCategory.Revenue)}
                  className={`flex-1 text-[10px] font-bold transition-all ${selectedCategory === RefineCategory.Revenue ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'} ${isCategoryLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  收款类
                </button>
                <button
                  type="button"
                  disabled={isCategoryLocked}
                  onClick={() => setSelectedCategory(RefineCategory.Value)}
                  className={`flex-1 text-[10px] font-bold transition-all ${selectedCategory === RefineCategory.Value ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'} ${isCategoryLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  产值类
                </button>
              </div>
            </div>
          </div>

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
                          {user?.id.startsWith('M') ? '产值 ' : (user?.id.startsWith('J') ? '收款 ' : '')}
                          {user?.name} | ****
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
                                  amount: isRev ? Math.round(val * 0.933) : val 
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
                    {/* 显示 C对冲权重 和 B2对冲权重 (当有对冲时且不是收款类) */}
                    {hasAnyHedge && (
                      selectedCategory === RefineCategory.Revenue ? (
                        <div className="lg:col-span-2 space-y-1">
                          <label className={`text-[10px] font-bold uppercase ${weights.cWeight < 1 ? 'text-amber-600' : 'text-slate-400'}`}>C对冲权重</label>
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
                            <label className={`text-[10px] font-bold uppercase ${weights.cWeight < 1 ? 'text-amber-600' : 'text-slate-400'}`}>C对冲权重</label>
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
                            <label className={`text-[10px] font-bold uppercase ${weights.b2Weight < 1 ? 'text-blue-600' : 'text-slate-400'}`}>B2对冲权重</label>
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
                          value={calculateNetValueForCollector(c.id, c.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                  
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-white p-2 rounded border border-emerald-100">
                      <p className="text-[8px] text-emerald-500 font-bold uppercase mb-1">当前已确权</p>
                      <p className="text-sm font-black text-emerald-700 font-mono">{Math.round(currentConfirmed).toLocaleString()}</p>
                    </div>
                    <div className="bg-emerald-100 p-2 rounded border border-emerald-300">
                      <p className="text-[8px] text-emerald-600 font-bold uppercase mb-1">预计已确权</p>
                      <p className="text-sm font-black text-emerald-800 font-mono">
                        {Math.round(finalConfirmed).toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-amber-50 p-2 rounded border border-amber-200 flex flex-col justify-center">
                      <p className="text-[8px] text-amber-600 font-bold uppercase mb-1">预计待确权</p>
                      <p className="text-sm font-black text-amber-700 font-mono">
                        {Math.round(finalPending).toLocaleString()}
                      </p>
                      <div className="text-[8px] text-amber-600/80 mt-1 font-mono leading-tight border-t border-amber-200/50 pt-1">
                        <p>原待确权: {Math.round(currentPending).toLocaleString()}</p>
                        <p>+ 本次提报: {Math.round(totalInput).toLocaleString()}</p>
                        <p>- 联动转换: {Math.round(conversionAmount).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-100">
                      <p className="text-[8px] text-slate-400 font-bold uppercase mb-1">剩余未确权</p>
                      <p className="text-sm font-black text-slate-600 font-mono">
                        {Math.round(remainingUnconfirmed).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="text-[8px] text-emerald-600/70 font-bold uppercase pt-2 border-t border-emerald-100 flex justify-between">
                    <span>产当：{Math.round(getCurrentValueCapacity(selectedResource)).toLocaleString()}</span>
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
                    <p className="text-lg font-black text-slate-800 font-mono">{selectedCollectors.reduce((sum, c) => sum + c.amount, 0).toLocaleString()}</p>
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
                    <p className="text-lg font-black text-emerald-700 font-mono">+{Math.round(totalNetValue).toLocaleString()}</p>
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
              onClick={exportToExcel}
              className="px-3 py-1 text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-sm hover:bg-emerald-100 transition-colors flex items-center"
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
                setFilterMonth('');
                setFilterStartDate('');
                setFilterEndDate('');
              }}
            />
             <div className="flex bg-slate-200 p-0.5 rounded-sm">
              <button onClick={() => setRecordTab('revenue')} title="查看收款确权记录" className={`px-4 py-1 text-[10px] font-bold rounded-sm ${recordTab === 'revenue' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>收款确权</button>
              <button onClick={() => setRecordTab('linkedPending')} title="查看待联动确权记录" className={`px-4 py-1 text-[10px] font-bold rounded-sm ${recordTab === 'linkedPending' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>联动确权</button>
              <button onClick={() => setRecordTab('confirmed')} title="查看已确权但未入库的记录" className={`px-4 py-1 text-[10px] font-bold rounded-sm ${recordTab === 'confirmed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>已确权记录</button>
              <button onClick={() => setRecordTab('history')} title="查看已完成确权的入库记录" className={`px-4 py-1 text-[10px] font-bold rounded-sm ${recordTab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>已库记录</button>
            </div>
          </div>
        }
      >
        {/* 价值动态流 */}
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
                <span className="text-[10px] font-bold text-slate-400">{UI_LABELS.REVENUE}当限: {Math.round(quadrantData.revenue.capacity).toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.PENDING}</p>
                  <p className="text-xs font-black text-amber-600 font-mono">{Math.round(quadrantData.revenue.pending).toLocaleString()}</p>
                </div>
                <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.CONFIRMED}</p>
                  <p className="text-xs font-black text-emerald-600 font-mono">{Math.round(quadrantData.revenue.confirmed).toLocaleString()}</p>
                </div>
                <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.UNCONFIRMED}</p>
                  <p className="text-xs font-black text-rose-600 font-mono">{Math.round(quadrantData.revenue.unconfirmed).toLocaleString()}</p>
                </div>
                <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.MINED}</p>
                  <p className="text-xs font-black text-blue-600 font-mono">{Math.round(quadrantData.revenue.mined).toLocaleString()}</p>
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
                <span className="text-[10px] font-bold text-slate-400">{UI_LABELS.VALUE}当限: {Math.round(quadrantData.value.capacity).toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.PENDING}</p>
                  <p className="text-xs font-black text-amber-600 font-mono">{Math.round(quadrantData.value.pending).toLocaleString()}</p>
                </div>
                <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.CONFIRMED}</p>
                  <p className="text-xs font-black text-emerald-600 font-mono">{Math.round(quadrantData.value.confirmed).toLocaleString()}</p>
                </div>
                <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.UNCONFIRMED}</p>
                  <p className="text-xs font-black text-rose-600 font-mono">{Math.round(quadrantData.value.unconfirmed).toLocaleString()}</p>
                </div>
                <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.MINED}</p>
                  <p className="text-xs font-black text-blue-600 font-mono">{Math.round(quadrantData.value.mined).toLocaleString()}</p>
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
              <p className="text-2xl font-black text-indigo-900 font-mono">{Math.round(summaryIncomePackage).toLocaleString()}</p>
            </div>
            <p className="text-[9px] text-indigo-500 mt-2 font-medium">公式: 收款包 + 产兑包 (与看板「收产包」主数据精确对齐)</p>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 p-4 rounded-sm border border-amber-200 shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-[10px] text-amber-700 font-bold uppercase tracking-wider mb-1">收款包</p>
              <p className="text-2xl font-black text-amber-900 font-mono">{Math.round(summaryRevenuePackage).toLocaleString()}</p>
            </div>
            <p className="text-[9px] text-amber-500 mt-2 font-medium">公式: 收款包合计</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-4 rounded-sm border border-emerald-200 shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider mb-1">产兑包</p>
              <p className="text-2xl font-black text-emerald-950 font-mono">{Math.round(summaryValuePackage).toLocaleString()}</p>
            </div>
            <p className="text-[9px] text-emerald-600 mt-2 font-medium">公式: 产兑包合计</p>
          </div>
        </div>

        {/* 核心效能透视看板 (按角色、按采集主体) */}
        {recordTab === 'history' && (
          <div className="p-6 bg-slate-50/50 border-b border-slate-200 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center space-x-4">
                 <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-[0.2em] flex items-center">
                    <span className="w-1.5 h-4 bg-blue-600 mr-2 rounded-full"></span>
                    角色与个人采集效能透视
                 </h4>
              </div>
              <div className="flex bg-slate-200 p-0.5 rounded-sm">
                {(['monthly', 'quarterly', 'yearly'] as const).map(p => (
                  <button key={p} onClick={() => setTimePeriod(p)} className={`px-4 py-1 text-[9px] font-black uppercase rounded-sm transition-all ${timePeriod === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>
                    {p === 'monthly' ? '月度' : p === 'quarterly' ? '季度' : '年度'}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-8 max-w-2xl">
              {/* 资产视角图表 */}
              <div className="space-y-4">
                 <div className="bg-white p-5 border border-slate-200 rounded-sm shadow-sm h-full flex flex-col">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4">资产类别产出分布</p>
                    <div className="flex-1 min-h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie 
                            data={performanceData.categoryChart} 
                            dataKey="value" 
                            cx="50%" 
                            cy="50%" 
                            innerRadius={50} 
                            outerRadius={80} 
                            paddingAngle={5} 
                            stroke="none"
                          >
                            <Cell fill="#FBBF24" />
                            <Cell fill="#10B981" />
                          </Pie>
                          <Tooltip contentStyle={{ fontSize: 10, borderRadius: 0 }} />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 'bold' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100">
                       <p className="text-[8px] font-bold text-slate-400 uppercase">资产结构实时统计</p>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto overflow-y-auto max-h-[600px] border-b border-slate-100 pb-2 custom-scrollbar">
          <table className="w-full text-left whitespace-nowrap min-w-max">
            <thead className="sticky top-0 bg-white z-10 shadow-sm">
              <tr className="bg-slate-50/90 text-[9px] font-bold text-slate-400 uppercase border-b border-slate-200">
                <th className="px-2 py-4">矿山编号</th>
                <th className="px-2 py-4">类别</th>
                <th className="px-2 py-4">编号</th>
                <th className="px-2 py-4">业务日期</th>
                <th className="px-2 py-4">提交日期</th>
                <th className="px-2 py-4">经营单元</th>
                <th className="px-2 py-4">采集主体</th>
                <th className="px-2 py-4">确权类型</th>
                <th className="px-2 py-4 text-right">注入积分</th>
                <th className="px-2 py-4 text-right">C对冲权重</th>
                <th className="px-2 py-4 text-right">B2对冲权重</th>
                <th className="px-2 py-4 text-right">产兑包</th>
                <th className="px-2 py-4 text-right">收款包</th>
                <th className="px-2 py-4">确权日期</th>
                <th className="px-2 py-4">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map(log => {
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

                // 收款对冲前: rawAmount × 0.933 × 提炼因子
                const revPreHedge = rawAmount * 0.933 * factor;
                const revPostHedge = revPreHedge * cWeight;
                const revHasHedge = cWeight < 1;

                const displayInjection = isRevenueLine
                  ? (log.rawAmount != null ? Math.round(log.rawAmount * 0.933) : Math.round(log.amount || 0))
                  : (log.rawAmount != null ? log.rawAmount : log.amount || 0);

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
                    <td className="px-2 py-4 text-slate-500 font-bold">{resolveLogBusinessDate(log)}</td>
                    <td className="px-2 py-4 text-slate-400">{formatSubmissionDate(log.timestamp)}</td>
                    <td className="px-2 py-4 text-slate-600">{operator?.center || log.rankId}</td>
                    <td className="px-2 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-700">{collector?.name || log.recordedCollectorId}</span>
                        <span className="text-[9px] text-slate-400 font-normal">{collector?.category || '未定义'}</span>
                      </div>
                    </td>
                    <td className="px-2 py-4">
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold">
                        {log.confirmationType || '手动确权'}
                      </span>
                    </td>
                    <td className="px-2 py-4 text-right font-mono font-bold text-slate-700">{displayInjection.toLocaleString()}</td>
                    <td className="px-2 py-4 text-right font-mono font-black text-slate-900 bg-slate-50/50">
                      {cWeight.toFixed(4)}
                    </td>
                    <td className="px-2 py-4 text-right font-mono font-black text-slate-900 bg-slate-50/50">
                      {isRevenueLine ? '—' : b2Weight.toFixed(4)}
                    </td>
                    <td className="px-2 py-4 text-right font-mono font-bold text-emerald-600">
                      {isValueLine ? (
                        valHasHedge
                          ? `${Math.round(valPreHedge).toLocaleString()} → ${Math.round(valPostHedge).toLocaleString()}`
                          : Math.round(valPostHedge).toLocaleString()
                      ) : '—'}
                    </td>
                    <td className="px-2 py-4 text-right font-mono font-bold text-amber-600">
                      {isRevenueLine ? (
                        revHasHedge
                          ? `${Math.round(revPreHedge).toLocaleString()} → ${Math.round(revPostHedge).toLocaleString()}`
                          : Math.round(revPostHedge).toLocaleString()
                      ) : '—'}
                    </td>
                    <td className="px-2 py-4 text-slate-500 font-mono">
                      {log.confirmedAt ? new Date(log.confirmedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td className="px-2 py-4">
                      <Badge variant={
                        log.status === AuditStatus.Approved ? 'success' : 
                        log.status === AuditStatus.Rejected ? 'error' : 
                        log.status === AuditStatus.Confirmed ? 'info' : 'warning'
                      }>
                        {log.status === AuditStatus.Approved ? '已入库' : log.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={15} className="px-6 py-20 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest">暂无确权数据记录</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <CityGuardianModal state={modalState} onClose={closeModal} />
    </div>
  );
};

export default ValueCreation;
