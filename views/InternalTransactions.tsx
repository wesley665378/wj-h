
import { UI_TOKENS } from '../src/constants/uiTokens';
import React, { useState, useMemo, useEffect } from 'react';
import { User, Role, MiningResource, InternalTransaction, TransactionType, TransactionStatus, CircuitBreaker, TransactionFailure, RefineCategory, RefineType, AuditStatus, ValueCreationLog, SystemConfig } from '../types';
import { parseCenterList, centerMatch, isResourceAssignedToCenter } from '../src/utils/centerScope';
import { ProgressBar } from '../src/components/UI';
import { useDedupe } from '../src/hooks/useDedupe';
import { XLSX, exportWorkbook } from '../src/utils/excelIo';
import { formatMoney } from '../src/utils/formatMoney';
import { UI_LABELS } from '../src/constants/uiLabels';
import { isSystemAdmin, canExportExcel, getExportButtonTitle, EXPORT_DISABLED_TOOLTIP } from '../src/utils/accessControl';
import { aggregateMiningQuadrantsFromLogs } from '../src/utils/purification';
import { getInitialRevenueCapacity, getInitialValueCapacity, getCurrentRevenueCapacity, getCurrentValueCapacity } from '../src/utils/miningCapacity';
import {
  getLocalDateString,
  getLocalMonthString,
  resolveLogBusinessDate,
  resolveLogBusinessMonth,
  formatSubmissionDate,
  formatSubmissionTime,
  isDateInRange,
  isLogInFilter,
} from '../src/utils/dateUtils';
import { toast } from 'sonner';
import { 
  canonicalizeBusinessUnitLabel, 
  businessUnitLabelsEqual, 
  userCenterMatchesBusinessUnit,
  resolveBusinessUnitName,
  businessUnitBaseKey
} from '../src/utils/businessUnitName';
import { formatAmount } from '../src/utils/formatters';
import { InfoTip } from '../src/components/InfoTip';
import { BusinessDateFilter } from '../src/components/BusinessDateFilter';
import { getExecutionType, getExecutionTypeBadgeColor, EXECUTION_TYPE_EXPLANATIONS } from '../src/utils/executionType';
import { CityGuardianModal, useCityGuardianModal } from '../src/components/CityGuardianModal';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isCenterManagerUser, sortCenterManagers } from '../src/utils/centerManager';
import { TradingTab } from './TradingTab';

interface InternalTransactionsProps {
  currentUser: User;
  users: User[];
  managerUsers?: User[];
  managerCandidates?: User[];
  resources: MiningResource[];
  allResources?: MiningResource[];
  logs: ValueCreationLog[];
  jzczLogs?: ValueCreationLog[];
  transactions: InternalTransaction[];
  onSubmitTransaction: (tx: InternalTransaction | InternalTransaction[], updatedResources?: MiningResource[]) => void;
  onAuditTransaction: (txId: string | string[], status: TransactionStatus, updatedResource?: MiningResource | MiningResource[]) => void;
  onUpdateResource: (res: MiningResource) => void;
  onLogSubmit: (log: any) => void;
  circuitBreakers: CircuitBreaker[];
  onAddCircuitBreaker: (cb: CircuitBreaker) => void;
  onRecoverCircuitBreaker: (id: string) => void;
  units: string[];
  persistWorkspaceNow?: () => Promise<void>;
  persistWorkspaceWithOverrides?: (overrides?: any) => Promise<void>;
  systemConfig?: SystemConfig;
}

const FAILURE_THRESHOLD = 3; // 3 failures within 1 minute
const WINDOW_MS = 60 * 1000;

const InternalTransactions: React.FC<InternalTransactionsProps> = ({
  currentUser,
  users,
  managerUsers,
  managerCandidates,
  resources,
  allResources,
  logs,
  jzczLogs,
  transactions,
  onSubmitTransaction,
  onAuditTransaction,
  onUpdateResource,
  onLogSubmit,
  circuitBreakers,
  onAddCircuitBreaker,
  onRecoverCircuitBreaker,
  units,
  persistWorkspaceNow,
  persistWorkspaceWithOverrides,
  systemConfig
}) => {
  const canExport = useMemo(() => canExportExcel(currentUser, systemConfig), [currentUser, systemConfig]);
  const { modalState, showAlert, showConfirm, closeModal } = useCityGuardianModal();
  const { isLocked } = useDedupe(500);
  const [type, setType] = useState<TransactionType>(TransactionType.Resource);
  const [receiverIds, setReceiverIds] = useState<string[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [receiverSearch, setReceiverSearch] = useState('');
  const [miningId, setMiningId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [revenueAmount, setRevenueAmount] = useState<number>(0);
  const [valueAmount, setValueAmount] = useState<number>(0);
  const [sharedAllocations, setSharedAllocations] = useState<Record<string, { 
    confirmedRevenue: number, 
    unconfirmedRevenue: number, 
    pendingValue: number, 
    confirmedValue: number, 
    unconfirmedValue: number 
  }>>({});

  useEffect(() => {
    const newAllocations = { ...sharedAllocations };
    receiverIds.forEach(id => {
      if (!newAllocations[id]) {
        newAllocations[id] = { 
          confirmedRevenue: 0, 
          unconfirmedRevenue: 0, 
          pendingValue: 0, 
          confirmedValue: 0, 
          unconfirmedValue: 0 
        };
      }
    });
    // Remove receivers that are no longer selected
    Object.keys(newAllocations).forEach(id => {
      if (!receiverIds.includes(id)) {
        delete newAllocations[id];
      }
    });
    setSharedAllocations(newAllocations);
  }, [receiverIds]);
  const [description, setDescription] = useState('');
  const [valueQuadrants, setValueQuadrants] = useState({ q1: 0, q2: 0, q3: 0, q4: 0 });
  const [revenueQuadrants, setRevenueQuadrants] = useState({ q1: 0, q2: 0, q3: 0 });
  const [activeTab, setActiveTab] = useState<'trading' | 'apply' | 'history'>('apply');
  const [showBreakersPanel, setShowBreakersPanel] = useState(false);
  const [showAdvancedAllocation, setShowAdvancedAllocation] = useState(false);
  const [hasInitializedTab, setHasInitializedTab] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => getLocalMonthString());
  const [currentTime, setCurrentTime] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());
  const [filterMonth, setFilterMonth] = useState<string>(() => getLocalMonthString());
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [selectedTx, setSelectedTx] = useState<InternalTransaction | null>(null);
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  
  // 修改交易时的临时状态
  const [modifyingTx, setModifyingTx] = useState<InternalTransaction | null>(null);
  const [modAmount, setModAmount] = useState<number>(0);
  const [modRevenueAmount, setModRevenueAmount] = useState<number>(0);
  const [modValueAmount, setModValueAmount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, filterMonth, filterStartDate, filterEndDate]);
  const [modReceiverId, setModReceiverId] = useState<string>('');
  const selectedMine = useMemo(() => resources.find(r => r.id === miningId), [resources, miningId]);

  // 模拟 Redis 滑动窗口失败记录
  const [failureLogs, setFailureLogs] = useState<TransactionFailure[]>([]);

  const isNpcxie = currentUser.role === Role.npcxie;
  const isAdmin = isSystemAdmin(currentUser);

  // 检查熔断状态
  const checkBreaker = (targetId: string, type: 'initiation' | 'confirmation') => {
    const activeBreaker = circuitBreakers.find(cb => 
      cb.targetId === targetId && 
      cb.status === 'active' && 
      (cb.type === type || cb.type === 'both') &&
      cb.expiresAt > Date.now()
    );
    return activeBreaker;
  };

  // 记录失败并触发熔断
  const recordFailure = (targetId: string, targetName: string, reason: string, failureType: TransactionFailure['reason'] = 'other') => {
    const now = Date.now();
    const newFailure: TransactionFailure = {
      id: `FAIL${now.toString().slice(-6)}`,
      targetId,
      timestamp: now,
      reason: failureType
    };

    const updatedFailures = [...failureLogs, newFailure].filter(f => f.timestamp > now - WINDOW_MS);
    setFailureLogs(updatedFailures);

    const targetFailures = updatedFailures.filter(f => f.targetId === targetId);
    if (targetFailures.length >= FAILURE_THRESHOLD) {
      const newBreaker: CircuitBreaker = {
        id: `CB${now.toString().slice(-6)}`,
        targetId,
        targetName,
        reason: `检测到异常失败频率: ${reason}`,
        type: 'both',
        status: 'active',
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000 // 默认熔断 30 分钟
      };
      onAddCircuitBreaker(newBreaker);
      return true;
    }
    return false;
  };

  const managerSource = useMemo(() => managerCandidates ?? managerUsers ?? users, [managerCandidates, managerUsers, users]);

  const userList = useMemo(() => {
    return users;
  }, [users]);

  // SSOT: 以经营单元权威清单 (jydy 派生) 为唯一基准构建经营单元列表与主责经管员
  const unitSelectionList = useMemo(() => {
    // units 此时已是由 App.tsx 统一由 jydy 派生的 effectiveBusinessUnits
    const rawUnits = Array.isArray(units) && units.length > 0 
      ? Array.from(new Set(units.map(canonicalizeBusinessUnitLabel).filter(Boolean)))
      : Array.from(new Set(managerSource.map(u => canonicalizeBusinessUnitLabel(u.center)).filter(Boolean)));

    return rawUnits.map(unitName => {
      const unitUsers = managerSource.filter(u => userCenterMatchesBusinessUnit(u.center, unitName) && u.userStatus !== 'inactive');
      
      // SSOT 负责人判定谓词：排查 role=rank，仅纳入符合条件的经管员
      const candidateManagers = unitUsers.filter(isCenterManagerUser);

      let manager: User | null = null;
      if (candidateManagers.length > 0) {
        manager = sortCenterManagers(candidateManagers)[0];
      }

      const isSelfUnit = !!(currentUser.center && centerMatch(currentUser.center, unitName));

      return {
        unitName,
        manager,
        hasManager: !!manager,
        isSelfUnit
      };
    });
  }, [units, managerSource, currentUser.center]);

  const displayUnitList = useMemo(() => {
    // 跨单元流转：排除本账号所属单元（避免自己流转给自己）
    return unitSelectionList.filter(item => !item.isSelfUnit);
  }, [unitSelectionList]);

  const filteredDisplayUnits = useMemo(() => {
    if (!receiverSearch.trim()) return displayUnitList;
    const query = receiverSearch.trim().toLowerCase();
    return displayUnitList.filter(item => {
      const matchUnit = item.unitName.toLowerCase().includes(query);
      const matchManager = item.manager?.name?.toLowerCase().includes(query) || false;
      return matchUnit || matchManager;
    });
  }, [displayUnitList, receiverSearch]);

  const selectedUnitSummary = useMemo(() => {
    if (receiverIds.length === 0) return '请选择接收经营单元...';
    const names = receiverIds.map(rid => {
      const item = unitSelectionList.find(u => u.manager?.id === rid);
      if (item) return item.unitName;
      const u = managerSource.find(usr => usr.id === rid);
      return u?.center || u?.name || rid;
    });
    return `已选择 ${receiverIds.length} 个单元: ${names.join(', ')}`;
  }, [receiverIds, unitSelectionList, managerSource]);

  const pendingTransactions = useMemo(() => {
    return transactions.filter(t => {
      // 1. 接收方确认阶段 (IT-02-F 修复多单元与基名匹配)
      if (t.status === TransactionStatus.PendingTarget) {
        const receiver = managerSource.find(u => u.id === t.receiverId);
        if (receiver && centerMatch(receiver.center, currentUser.center)) return true;
        if (t.receiverId === currentUser.id) return true;
        if (centerMatch(t.receiverId, currentUser.center)) return true;
        if (t.senderId === currentUser.id) return true;
      }
      
      // 2. 发起方处理退回或验证修改阶段 (IT-04-F 增加对 Returned 状态支持)
      if (t.status === TransactionStatus.PendingInitiatorVerify || t.status === TransactionStatus.Returned) {
        const sender = managerSource.find(u => u.id === t.senderId);
        if (t.senderId === currentUser.id) return true;
        if (sender && centerMatch(sender.center, currentUser.center)) return true;
        if (centerMatch(t.senderId, currentUser.center)) return true;
      }

      // 3. 管理员终审阶段
      if (t.status === TransactionStatus.PendingAdmin && isAdmin) return true;

      return false;
    });
  }, [transactions, currentUser.id, isAdmin, managerSource, currentUser.center]);

  const activeBreakers = useMemo(() => {
    return circuitBreakers.filter(cb => cb.status === 'active' && cb.expiresAt > Date.now());
  }, [circuitBreakers, currentTime]);

  useEffect(() => {
    if (!hasInitializedTab && transactions && transactions.length > 0) {
      if (pendingTransactions.length > 0) {
        setActiveTab('trading');
      }
      setHasInitializedTab(true);
    }
  }, [pendingTransactions, hasInitializedTab, transactions]);

  const availableMiningResources = useMemo(() => {
    const base = isAdmin ? (allResources || resources) : resources.filter(r => isResourceAssignedToCenter(r, currentUser.center));
    const pendingMiningIds = new Set(pendingTransactions.map(t => t.miningId).filter(Boolean));
    const allRes = allResources || resources;
    const injectedRes = allRes.filter(r => pendingMiningIds.has(r.id));

    const map = new Map<string, MiningResource>();
    base.forEach(r => map.set(r.id, r));
    injectedRes.forEach(r => {
      if (!map.has(r.id)) {
        map.set(r.id, r);
      }
    });
    return Array.from(map.values());
  }, [resources, allResources, currentUser.center, isAdmin, pendingTransactions]);

  const selectedResource = useMemo(() => {
    return resources.find(r => r.id === miningId);
  }, [resources, miningId]);

  const valueLogs = useMemo(() => {
    return jzczLogs ?? logs.filter(l => l.confirmationType !== '手动确权');
  }, [jzczLogs, logs]);

  const selectedResourceQuadrants = useMemo(() => {
    if (!selectedResource) return null;
    return aggregateMiningQuadrantsFromLogs(valueLogs, resources, selectedResource.id, currentUser.center, users);
  }, [selectedResource, valueLogs, resources, currentUser.center, users]);

  // 自动匹配经营单元逻辑 (IT-05-F)
  useEffect(() => {
    if (selectedResource && type === TransactionType.Resource) {
      let targetCenter = '';

      const isMyRevenue = centerMatch(selectedResource.assignedToRevenue, currentUser.center);
      const isMyValue = centerMatch(selectedResource.assignedToValue, currentUser.center);
      const isMyGeneral = centerMatch(selectedResource.assignedTo, currentUser.center);

      if (isMyRevenue) {
        targetCenter = selectedResource.assignedToValue || '';
      } 
      else if (isMyValue) {
        targetCenter = selectedResource.assignedToRevenue || '';
      }
      else if (isMyGeneral) {
        if (selectedResource.assignedToRevenue && !centerMatch(selectedResource.assignedToRevenue, currentUser.center)) {
          targetCenter = selectedResource.assignedToRevenue;
        } else if (selectedResource.assignedToValue && !centerMatch(selectedResource.assignedToValue, currentUser.center)) {
          targetCenter = selectedResource.assignedToValue;
        }
      }

      if (targetCenter) {
        const targetItem = unitSelectionList.find(u => centerMatch(u.unitName, targetCenter));
        if (targetItem && targetItem.manager && targetItem.manager.id !== currentUser.id) {
          setReceiverIds([targetItem.manager.id]);
        }
      }
    }
  }, [miningId, selectedResource, type, currentUser.center, currentUser.id, unitSelectionList]);

  // 自动匹配核算配方系数逻辑已删除

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked('it-submit')) return;

    // 熔断检查
    const breaker = checkBreaker(currentUser.id, 'initiation');
    if (breaker) {
      showAlert(`发起失败：您当前处于熔断锁定期。原因：${breaker.reason}`);
      return;
    }

    if (receiverIds.length === 0) {
      showAlert('请至少选择一个接收经营单元');
      return;
    }
    
    if (type === TransactionType.Resource) {
      if (!miningId) {
        showAlert('请选择关联项目/矿山编号');
        return;
      }
    }

    // 熔断保护：同一矿山：单笔或总额不超过矿山款初/产初
    if (type === TransactionType.Resource && miningId && selectedResource) {
      const totalRevenueInThisTx = Object.values(sharedAllocations).reduce((sum, a) => sum + (a.confirmedRevenue || 0) + (a.unconfirmedRevenue || 0), 0);
      const totalValueInThisTx = Object.values(sharedAllocations).reduce((sum, a) => sum + (a.pendingValue || 0) + (a.confirmedValue || 0) + (a.unconfirmedValue || 0), 0);
      
      const existingTxsForMine = transactions.filter(t => t.miningId === miningId && t.status !== TransactionStatus.Rejected);
      const totalRevenue = existingTxsForMine.reduce((sum, t) => sum + (t.revenueAmount || 0), 0) + totalRevenueInThisTx;
      const totalValue = existingTxsForMine.reduce((sum, t) => sum + (t.valueAmount || 0), 0) + totalValueInThisTx;

      const initialRev = getInitialRevenueCapacity(selectedResource);
      const initialVal = getInitialValueCapacity(selectedResource);

      if (totalRevenue > initialRev || totalValue > initialVal) {
        recordFailure(currentUser.id, currentUser.name, `矿山[${miningId}]资源超限`, 'resource_limit_exceeded');
        showAlert(`交易失败：矿山[${miningId}]资源超限。当前款初: ${Math.round(initialRev)}, 产初: ${Math.round(initialVal)}`);
        return;
      }
    }

    const receiverNames = receiverIds.map(rid => {
      const item = unitSelectionList.find(u => u.manager?.id === rid);
      if (item) return item.unitName;
      const u = managerSource.find(usr => usr.id === rid);
      return u?.center || u?.name || rid;
    }).join(', ');

    showConfirm(
      `确定发起内部交易指令？\n\n【交易类别】${type}\n【接收节点】${receiverNames}${miningId ? `\n【关联矿山】${miningId}` : ''}`,
      async () => {
        const newTxs: InternalTransaction[] = [];
        receiverIds.forEach((rid, index) => {
          const revAmt = type === TransactionType.Resource ? ((sharedAllocations[rid]?.confirmedRevenue || 0) + (sharedAllocations[rid]?.unconfirmedRevenue || 0)) : (revenueAmount || 0);
          const valAmt = type === TransactionType.Resource ? ((sharedAllocations[rid]?.pendingValue || 0) + (sharedAllocations[rid]?.confirmedValue || 0) + (sharedAllocations[rid]?.unconfirmedValue || 0)) : (valueAmount || 0);
          const totalAmount = revAmt + valAmt > 0 ? (revAmt + valAmt) : amount;

          const newTx: InternalTransaction = {
            id: `TX${(Date.now() + index).toString().slice(-6)}`,
            type,
            senderId: currentUser.id,
            receiverId: rid,
            miningId: type === TransactionType.Resource ? miningId : undefined,
            amount: totalAmount,
            unitPrice: unitPrice > 0 ? unitPrice : undefined,
            revenueAmount: revAmt,
            valueAmount: valAmt,
            confirmedRevenue: sharedAllocations[rid]?.confirmedRevenue,
            unconfirmedRevenue: sharedAllocations[rid]?.unconfirmedRevenue,
            pendingValue: sharedAllocations[rid]?.pendingValue,
            confirmedValue: sharedAllocations[rid]?.confirmedValue,
            unconfirmedValue: sharedAllocations[rid]?.unconfirmedValue,
            description: description,
            timestamp: Date.now() + index,
            status: TransactionStatus.PendingTarget,
            valueQuadrants: type === TransactionType.Resource ? valueQuadrants : undefined,
            revenueQuadrants: type === TransactionType.Resource ? revenueQuadrants : undefined,
            month: selectedMonth,
            businessDate: selectedDate
          };
          newTxs.push(newTx);
        });

        if (newTxs.length > 0) {
          onSubmitTransaction(newTxs);
        }

        setReceiverIds([]);
        setMiningId('');
        setAmount(0);
        setUnitPrice(0);
        setRevenueAmount(0);
        setModAmount(0);
        setSharedAllocations({});
        setValueQuadrants({ q1: 0, q2: 0, q3: 0, q4: 0 });
        setRevenueQuadrants({ q1: 0, q2: 0, q3: 0 });
        setDescription('');
      }
    );
  };

  const filteredTransactions = useMemo(() => {
    let list = transactions;
    if (!isAdmin) {
      list = list.filter(t => {
        const sender = managerSource.find(u => u.id === t.senderId);
        const receiver = managerSource.find(u => u.id === t.receiverId);
        
        return centerMatch(sender?.center, currentUser.center) || 
               centerMatch(receiver?.center, currentUser.center);
      });
    }
    
    list = list.filter(t => isLogInFilter(t, filterMonth, filterStartDate, filterEndDate));
    
    return list;
  }, [transactions, currentUser.center, isAdmin, managerSource, filterMonth, filterStartDate, filterEndDate]);

  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredTransactions.slice().reverse().slice(start, start + PAGE_SIZE);
  }, [filteredTransactions, currentPage]);

  const handleAudit = async (tx: InternalTransaction, action: 'approve' | 'reject' | 'return' | 'modify' | 'withdraw' | 'agree') => {
    let nextStatus = tx.status;

    if (action === 'reject') {
      nextStatus = TransactionStatus.Rejected;
    } 
    else if (action === 'withdraw') {
      nextStatus = TransactionStatus.Rejected; // 撤回视为取消/拒绝
    }
    else if (action === 'return') {
      nextStatus = TransactionStatus.Returned; // 接收人退回给发起人
    }
    else if (action === 'modify') {
      // 接收人修改后提交
      if (modifyingTx) {
        const revAmt = modRevenueAmount || 0;
        const valAmt = modValueAmount || 0;
        const totalAmount = revAmt + valAmt > 0 ? (revAmt + valAmt) : modAmount;
        const updatedTx = {
          ...modifyingTx,
          amount: totalAmount,
          revenueAmount: revAmt,
          valueAmount: valAmt,
          receiverId: modReceiverId,
          status: TransactionStatus.PendingInitiatorVerify // 待发起方验证
        };
        onSubmitTransaction(updatedTx);
        setModifyingTx(null);
        toast.success(`交易 [${modifyingTx.id}] 已修改并重新提交发起方验证！`);
        return;
      }
    }
    else if (action === 'agree') {
      // 发起人同意变更
      nextStatus = TransactionStatus.PendingNpcxie;
    }
    else if (action === 'approve') {
      // 熔断检查 (接收方/当前操作用户)
      if (tx.status === TransactionStatus.PendingTarget) {
        const userBreaker = checkBreaker(currentUser.id, 'confirmation');
        const receiverBreaker = checkBreaker(tx.receiverId, 'confirmation');
        const breaker = userBreaker || receiverBreaker;
        if (breaker) {
          showAlert(`确认失败：处于熔断锁定期。原因：${breaker.reason}`);
          return;
        }
      }

      let updatedResource: MiningResource | undefined = undefined;

      // 状态流转逻辑
      if (tx.status === TransactionStatus.PendingTarget) {
        // 根据业务规则：资源交易接收方确认即直接确权
        if (tx.type === TransactionType.Resource) {
          nextStatus = TransactionStatus.Verified;
          console.log(`[内部交易] 资源交易 ${tx.id} 已直接确权 (跳过后续审核)`);
        }
        
        // 当接收方确认时，执行矿山指派写入逻辑（矿山编号不变）
        if (tx.miningId) {
          const globalResources = allResources || resources;
          const resource = globalResources.find(r => r.id === tx.miningId);
          if (!resource) {
            showAlert(`确认失败：未在全量资源库中找到矿山编号 [${tx.miningId}]。操作已中止，交易状态未变更。`);
            return;
          }

          const receiver = managerSource.find(u => u.id === tx.receiverId);
          let targetCenter = resolveBusinessUnitName(receiver?.center, units) || 
            canonicalizeBusinessUnitLabel(receiver?.center) || 
            resolveBusinessUnitName(tx.receiverId, units) || 
            canonicalizeBusinessUnitLabel(tx.receiverId);

          // 确认时 appendCenter 使用的 targetCenter 必须与当前用户 center 基名一致（调用 userCenterMatchesBusinessUnit 或 businessUnitBaseKey），避免因「(前台)/(后台)」后缀导致匹配失败
          if (currentUser.center && (userCenterMatchesBusinessUnit(currentUser.center, targetCenter) || businessUnitBaseKey(currentUser.center) === businessUnitBaseKey(targetCenter) || centerMatch(currentUser.center, targetCenter))) {
            targetCenter = canonicalizeBusinessUnitLabel(currentUser.center);
          }

          if (!targetCenter) {
            showAlert(`确认失败：接收主体 [${receiver?.name || tx.receiverId}] 未配置所属经营单元。操作已中止。`);
            return;
          }

          const appendCenter = (current: string | undefined, centerToAdd: string) => {
            const trimmedToAdd = canonicalizeBusinessUnitLabel(centerToAdd);
            if (!trimmedToAdd) return current || '';
            const centers = (current || '').split(',').map(c => canonicalizeBusinessUnitLabel(c)).filter(Boolean);
            if (!centers.some(c => userCenterMatchesBusinessUnit(c, trimmedToAdd) || businessUnitBaseKey(c) === businessUnitBaseKey(trimmedToAdd) || centerMatch(c, trimmedToAdd))) {
              centers.push(trimmedToAdd);
            }
            return centers.join(',');
          };

          const receivedRevenue = tx.revenueAmount !== undefined ? tx.revenueAmount : (tx.amount || 0);
          const receivedValue = tx.valueAmount !== undefined ? tx.valueAmount : (tx.amount || 0);

          updatedResource = {
            ...resource,
            assignedTo: appendCenter(resource.assignedTo, targetCenter),
            assignedToRevenue: (tx.revenueAmount && tx.revenueAmount > 0) 
              ? appendCenter(resource.assignedToRevenue, targetCenter) 
              : (resource.assignedToRevenue || ''),
            assignedToValue: (tx.valueAmount && tx.valueAmount > 0) 
              ? appendCenter(resource.assignedToValue, targetCenter) 
              : (resource.assignedToValue || ''),
            // 🛑 修复：严禁覆写矿山级容量字段 (revenueCapacity, valueCapacity 等)，保持物理上限不变
            quotas: (() => {
              // 识别发起单元 (用于从发起方扣减额度)
              const sender = managerSource.find(u => u.id === tx.senderId);
              const sourceCenter = resolveBusinessUnitName(sender?.center, units) || canonicalizeBusinessUnitLabel(sender?.center);
              
              let currentQuotas = [...(resource.quotas || [])];
              
              // 1. 处理接收方 (targetCenter): 增量累加额度
              const targetIdx = currentQuotas.findIndex(q => centerMatch(q.centerId, targetCenter));
              if (targetIdx > -1) {
                currentQuotas[targetIdx] = {
                  ...currentQuotas[targetIdx],
                  revenueQuota: (currentQuotas[targetIdx].revenueQuota || 0) + receivedRevenue,
                  valueQuota: (currentQuotas[targetIdx].valueQuota || 0) + receivedValue,
                };
              } else {
                currentQuotas.push({
                  centerId: targetCenter,
                  revenueQuota: receivedRevenue,
                  valueQuota: receivedValue,
                  minedRevenue: 0,
                  minedValue: 0
                });
              }

              // 2. 处理发起方 (sourceCenter): 对应扣减额度 (确保矿山总额度在各单元间守恒)
              if (sourceCenter && !centerMatch(sourceCenter, targetCenter)) {
                const sourceIdx = currentQuotas.findIndex(q => centerMatch(q.centerId, sourceCenter));
                if (sourceIdx > -1) {
                  currentQuotas[sourceIdx] = {
                    ...currentQuotas[sourceIdx],
                    revenueQuota: Math.max(0, (currentQuotas[sourceIdx].revenueQuota || 0) - receivedRevenue),
                    valueQuota: Math.max(0, (currentQuotas[sourceIdx].valueQuota || 0) - receivedValue),
                  };
                }
              }
              
              return currentQuotas;
            })()
          };
          console.log(`[内部交易] 矿山编号 ${tx.miningId} 已将接收单元 [${targetCenter}] 写入指派`);
        }
      } else if (tx.status === TransactionStatus.Returned) {
        nextStatus = TransactionStatus.PendingTarget; // 发起人重新提交
      } else if (tx.status === TransactionStatus.PendingNpcxie) {
        nextStatus = TransactionStatus.PendingAdmin;
      } else if (tx.status === TransactionStatus.PendingAdmin) {
        nextStatus = TransactionStatus.Verified;
      }

      onAuditTransaction(tx.id, nextStatus, updatedResource);
      return;
    }

    onAuditTransaction(tx.id, nextStatus);
  };

  const handleBatchAudit = async (action: 'approve' | 'reject' | 'return' | 'modify' | 'withdraw' | 'agree') => {
    for (const id of selectedTxIds) {
      const tx = transactions.find(t => t.id === id);
      if (tx) await handleAudit(tx, action);
    }
    const count = selectedTxIds.length;
    setSelectedTxIds([]);
    toast.success(`批量处理完成 (${count}条)`);
  };

  const handleOpenConfirmModal = (modal: { 
    show?: boolean; 
    txId?: string; 
    batch?: boolean; 
    action?: 'approve' | 'reject' | 'return' | 'modify' | 'withdraw' | 'agree';
    title?: string;
    message?: string;
    onConfirm?: () => void;
  }) => {
    if (!modal || modal.show === false) return;
    const msg = modal.message || '您确定要执行此操作吗？此操作可能无法撤销。';
    showConfirm(
      msg,
      () => {
        if (modal.onConfirm) {
          modal.onConfirm();
        } else if (modal.batch && modal.action) {
          handleBatchAudit(modal.action);
        } else if (modal.txId && modal.action) {
          const tx = transactions.find(t => t.id === modal.txId);
          if (tx) handleAudit(tx, modal.action);
        }
      }
    );
  };

  const startModify = (tx: InternalTransaction) => {
    setModifyingTx(tx);
    setModAmount((tx.revenueAmount || 0) + (tx.valueAmount || 0) || tx.amount);
    setModRevenueAmount(tx.revenueAmount || 0);
    setModValueAmount(tx.valueAmount || 0);
    setModReceiverId(tx.receiverId);
  };

  const exportToExcel = () => {
    if (!canExport) {
      toast.error(EXPORT_DISABLED_TOOLTIP);
      return;
    }
    let dataToExport = [];
    let fileName = "";
    
    if (activeTab === 'history') {
      dataToExport = filteredTransactions.map(tx => ({
        '指令编号': tx.id,
        '业务日期': tx.businessDate || resolveLogBusinessDate(tx),
        '提交日期': formatSubmissionDate(tx.timestamp),
        '提交时间': formatSubmissionTime ? formatSubmissionTime(tx.timestamp) : new Date(tx.timestamp).toLocaleTimeString(),
        '交易类型': tx.type,
        '关联矿山': tx.miningId || 'N/A',
        '发起方': managerSource.find(u => u.id === tx.senderId)?.center || managerSource.find(u => u.id === tx.senderId)?.name || tx.senderId,
        '经营单元': managerSource.find(u => u.id === tx.receiverId)?.center || managerSource.find(u => u.id === tx.receiverId)?.name || tx.receiverId,
        '收款额度': tx.revenueAmount || 0,
        '产值额度': tx.valueAmount || 0,
        '合计流转额度': (tx.revenueAmount || 0) + (tx.valueAmount || 0) || tx.amount,
        '状态': tx.status,
        '备注': tx.description
      }));
      fileName = `内部交易记录_${new Date().toLocaleDateString()}.xlsx`;
    }

    if (dataToExport.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "交易记录");
    exportWorkbook(workbook, fileName);
  };

  if (isNpcxie) {
    return (
      <div className="w-full flex flex-col items-center justify-center p-16 bg-white rounded-3xl border border-slate-200 shadow-sm text-center space-y-4 animate-in fade-in duration-500">
        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center text-3xl font-bold">
          🔒
        </div>
        <h3 className="text-base font-black text-slate-800 tracking-tight">无内部交易访问与操作权限</h3>
        <p className="text-xs text-slate-500 max-w-md leading-relaxed">
          根据系统权责规范，当前智能体帐户 (NPCXIE) 的内部交易发起、审核与流转权限已取消。如需处理内部交易，请使用对应经营单元负责人或系统管理帐户。
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500 pb-6 text-[14px]">
      {/* 顶部控制栏 */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 ${UI_TOKENS.RADIUS_PANEL} shadow-xs border border-slate-200`}>
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white text-base font-bold shadow-xs">
            🔄
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              内部交易划转工作台
            </h3>
            <p className="text-xs text-slate-500">
              跨经营单元资源流转、确权指令验证与划转统计
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {persistWorkspaceNow && (
            <button
              onClick={async () => {
                await persistWorkspaceNow();
                toast.success('工作区数据已保存');
              }}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center space-x-1"
            >
              <span>💾</span>
              <span>保存数据</span>
            </button>
          )}

          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button 
              onClick={() => setActiveTab('trading')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeTab === 'trading' 
                  ? 'bg-white text-indigo-600 shadow-xs border-b-2 border-indigo-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>待办</span>
              {pendingTransactions.length > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full">
                  {pendingTransactions.length}
                </span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('apply')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'apply' 
                  ? 'bg-white text-indigo-600 shadow-xs border-b-2 border-indigo-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              发起
            </button>

            <button 
              onClick={() => setActiveTab('history')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'history' 
                  ? 'bg-white text-indigo-600 shadow-xs border-b-2 border-indigo-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              记录
            </button>
          </div>

          <button 
            onClick={() => setShowBreakersPanel(!showBreakersPanel)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 border ${
              activeBreakers.length > 0 
                ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100' 
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span>⚡ 熔断</span>
            {activeBreakers.length > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-mono px-1.5 py-0.2 rounded-full">
                {activeBreakers.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 熔断状态横幅 / 展开列表 */}
      {activeBreakers.length > 0 && !showBreakersPanel && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center space-x-2">
            <span className="text-amber-500 font-bold">⚠️</span>
            <span>当前有 <strong className="text-amber-700 font-bold">{activeBreakers.length}</strong> 个经营单元处于熔断控制中，对应方向交易已被暂停。</span>
          </div>
          <button
            onClick={() => setShowBreakersPanel(true)}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-all shadow-xs"
          >
            查看熔断详情
          </button>
        </div>
      )}

      {showBreakersPanel && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <span className="text-base">⚡</span>
              <h3 className="text-sm font-bold text-slate-900">熔断保护状态与恢复清单</h3>
            </div>
            <button
              onClick={() => setShowBreakersPanel(false)}
              className="text-xs text-slate-400 hover:text-slate-600 font-bold px-2 py-1"
            >
              ✕ 关闭
            </button>
          </div>

          <div className="max-h-60 overflow-auto border border-slate-100 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2">目标单元</th>
                  <th className="px-3 py-2">熔断原因</th>
                  <th className="px-3 py-2">类型</th>
                  <th className="px-3 py-2">触发时间</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {circuitBreakers.slice().reverse().map(cb => (
                  <tr key={cb.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-bold text-slate-800">
                      {cb.targetName}
                      <span className="block text-[10px] text-slate-400 font-mono font-normal">ID: {cb.targetId}</span>
                    </td>
                    <td className="px-3 py-2 text-rose-600">{cb.reason}</td>
                    <td className="px-3 py-2 uppercase text-slate-500">{cb.type}</td>
                    <td className="px-3 py-2 text-slate-500 font-mono">{new Date(cb.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        cb.status === 'active' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {cb.status === 'active' ? '熔断中' : '已恢复'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {cb.status === 'active' && isAdmin && (
                        <button
                          onClick={() => onRecoverCircuitBreaker(cb.id)}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] rounded transition-all"
                        >
                          手动恢复
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {circuitBreakers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs">暂无熔断记录</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'apply' && (
        <div className="w-full">
           <div className={`bg-white ${UI_TOKENS.RADIUS_PANEL} shadow-sm border border-slate-200 overflow-hidden`}>
             <div className="bg-slate-900 px-6 py-4 text-white flex justify-between items-center">
                <h4 className="text-base font-bold flex items-center tracking-tight">
                  <span className="w-8 h-8 bg-indigo-500/20 text-indigo-400 rounded-lg flex items-center justify-center mr-3 text-sm">⚡</span>
                  创建流转指令
                </h4>
             </div>
             
             <form onSubmit={handleSubmit} className="p-6 space-y-5">
                <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setType(TransactionType.Resource)}
                    className="flex-1 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest bg-white text-slate-900 shadow-sm transition-all"
                  >
                    资源交易
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider h-4 flex items-center">矿山编号 (唯一定量)</label>
                    <select
                      value={miningId}
                      onChange={(e) => setMiningId(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-[13px] font-bold text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 transition-all cursor-pointer h-10"
                      required
                    >
                      <option value="">选择关联矿山编号...</option>
                      {availableMiningResources.map(r => (
                        <option key={r.id} value={r.id}>{r.id} ({r.status})</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5 relative md:col-span-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider h-4 flex items-center">
                      接收经营单元
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-[13px] font-bold text-slate-800 text-left flex justify-between items-center outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 transition-all h-10 cursor-pointer"
                      >
                        <span className="truncate">
                          {selectedUnitSummary}
                        </span>
                        <svg className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {isDropdownOpen && (
                        <div className="absolute z-50 mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                          <div className="p-3 border-b border-slate-100 bg-slate-50">
                            <input
                              type="text"
                              placeholder="搜索经营单元名称或负责人..."
                              value={receiverSearch}
                              onChange={(e) => setReceiverSearch(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-[13px] font-bold outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 h-10"
                            />
                          </div>
                          <div className="p-2 divide-y divide-slate-50">
                            {filteredDisplayUnits.map(item => {
                              const isChecked = item.hasManager && receiverIds.includes(item.manager!.id);
                              return (
                                <label 
                                  key={item.unitName} 
                                  className={`flex items-center space-x-3 p-3 rounded-xl transition-colors group ${
                                    !item.hasManager 
                                      ? 'opacity-60 cursor-not-allowed bg-slate-50/40' 
                                      : 'cursor-pointer hover:bg-slate-50'
                                  }`}
                                  title={!item.hasManager ? '该单元未配置经管员' : undefined}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={!item.hasManager}
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (!item.hasManager || !item.manager) return;
                                      if (e.target.checked) {
                                        setReceiverIds(prev => [...prev, item.manager!.id]);
                                      } else {
                                        setReceiverIds(prev => prev.filter(id => id !== item.manager!.id));
                                      }
                                    }}
                                    className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all disabled:opacity-40"
                                  />
                                  <div className="flex flex-col flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-sm font-black text-slate-800 group-hover:text-indigo-600 transition-colors truncate">
                                        {item.unitName}
                                      </span>
                                      {item.hasManager ? (
                                        <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100 flex-shrink-0">
                                          {item.manager!.name} ({item.manager!.category || item.manager!.role || '经管员'})
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100 flex-shrink-0">
                                          未配置经管员
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                            {filteredDisplayUnits.length === 0 && (
                              <div className="px-6 py-12 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest">
                                {UI_LABELS.EMPTY_DEFAULT}
                              </div>
                            )}
                          </div>
                          <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                            <button 
                              type="button"
                              onClick={() => setReceiverIds([])}
                              className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:underline"
                            >
                              清空选择
                            </button>
                            <button 
                              type="button"
                              onClick={() => setIsDropdownOpen(false)}
                              className="bg-slate-900 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                            >
                              确认
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* 点击外部关闭下拉框 */}
                    {isDropdownOpen && <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />}
                  </div>
                </div>

                {/* 高级分配折叠面板 */}
                {(selectedResource || (miningId && receiverIds.length > 0)) && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedAllocation(!showAdvancedAllocation)}
                      className="w-full px-4 py-3 bg-slate-100 hover:bg-slate-200/80 flex items-center justify-between text-xs font-bold text-slate-700 transition-all border-b border-slate-200 cursor-pointer"
                    >
                      <span className="flex items-center space-x-2">
                        <span>⚙️</span>
                        <span>高级分配与容量摘要 (四象限/共享分配/未确权分布)</span>
                      </span>
                      <span className="text-slate-500 font-mono text-[11px]">
                        {showAdvancedAllocation ? '▲ 收起' : '▼ 展开'}
                      </span>
                    </button>

                    {showAdvancedAllocation && (
                      <div className="p-4 space-y-4 bg-white animate-in fade-in duration-200">
                        {selectedResource && (
                          <div className={`space-y-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs`}>
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="text-base font-bold text-slate-800 tracking-tight">{selectedResource.id}</h4>
                                <p className="text-slate-400 text-xs font-medium mt-0.5">
                                  {selectedResource.types?.join(' / ') || '矿山项目'}
                                </p>
                              </div>
                              <span className={`px-3 py-1 rounded-lg text-xs font-bold ${
                                selectedResource.status === '勘探中' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                {selectedResource.status}
                              </span>
                            </div>

                            {/* 未确权产值分布 */}
                            <div className="space-y-3">
                              <div className="text-xs font-bold text-slate-500 border-b border-slate-100 pb-2">未确权产值分布</div>
                              {(() => {
                                const unconfirmedValueByReceiver: Record<string, number> = {};
                                
                                const pendingTxs = (transactions || []).filter(t => 
                                  t.type === TransactionType.Resource && 
                                  t.status === TransactionStatus.PendingTarget && 
                                  t.miningId === selectedResource.id
                                );
                                pendingTxs.forEach(t => {
                                  const receiver = managerSource.find(u => u.id === t.receiverId);
                                  const receiverName = receiver?.center || receiver?.name || '未知';
                                  const shortName = receiverName.replace('中心', '');
                                  unconfirmedValueByReceiver[shortName] = (unconfirmedValueByReceiver[shortName] || 0) + (t.valueAmount || 0);
                                });

                                const pendingLogs = logs.filter(l => 
                                  l.miningId === selectedResource.id && 
                                  l.category === RefineCategory.Value && 
                                  l.status === AuditStatus.Pending
                                );
                                pendingLogs.forEach(l => {
                                  const collector = users.find(u => u.id === l.recordedCollectorId);
                                  const centerName = collector?.center || collector?.name || '未知';
                                  const shortName = centerName.replace('中心', '');
                                  unconfirmedValueByReceiver[shortName] = (unconfirmedValueByReceiver[shortName] || 0) + (l.amount || 0);
                                });

                                const entries = Object.entries(unconfirmedValueByReceiver);
                                if (entries.length === 0) {
                                  return <div className="text-xs text-slate-400 italic">暂无未确权产值</div>;
                                }

                                return entries.map(([receiver, amount]) => (
                                  <div key={receiver} className="flex justify-between text-xs font-medium">
                                    <span className="text-slate-600">{receiver}</span>
                                    <span className="text-rose-600 font-bold">{amount.toLocaleString()}</span>
                                  </div>
                                ));
                              })()}
                            </div>

                            {(() => {
                              const q = selectedResourceQuadrants || {
                                value: { pending: 0, confirmed: 0, unconfirmed: 0, mined: 0 },
                                revenue: { pending: 0, confirmed: 0, unconfirmed: 0, mined: 0 }
                              };
                              return (
                                <>
                                  <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                      <h5 className="text-xs font-bold text-emerald-600 flex items-center">
                                        {UI_LABELS.VALUE}
                                      </h5>
                                      <span className="text-xs text-slate-400">产初: {getInitialValueCapacity(selectedResource).toLocaleString()} | 产当: {getCurrentValueCapacity(selectedResource, valueLogs).toLocaleString()}</span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                      {[
                                        { label: UI_LABELS.PENDING, value: q.value.pending, color: 'text-amber-600' },
                                        { label: UI_LABELS.CONFIRMED, value: q.value.confirmed, color: 'text-emerald-600' },
                                        { label: UI_LABELS.UNCONFIRMED, value: q.value.unconfirmed, color: 'text-rose-600' },
                                        { label: UI_LABELS.MINED, value: q.value.mined, color: 'text-blue-600' }
                                      ].map((box, i) => (
                                        <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col items-center justify-center space-y-0.5">
                                          <span className="text-[10px] font-bold text-slate-400 text-center leading-tight">{box.label}</span>
                                          <span className={`text-xs font-bold font-mono ${box.color}`}>{Math.round(box.value).toLocaleString()}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                      <h5 className="text-xs font-bold text-amber-600 flex items-center">
                                        {UI_LABELS.REVENUE}
                                      </h5>
                                      <span className="text-xs text-slate-400">款初: {getInitialRevenueCapacity(selectedResource).toLocaleString()} | 款当: {getCurrentRevenueCapacity(selectedResource, valueLogs).toLocaleString()}</span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                      {[
                                        { label: UI_LABELS.PENDING, value: q.revenue.pending, color: 'text-amber-600' },
                                        { label: UI_LABELS.CONFIRMED, value: q.revenue.confirmed, color: 'text-emerald-600' },
                                        { label: UI_LABELS.UNCONFIRMED, value: q.revenue.unconfirmed, color: 'text-rose-600' },
                                        { label: UI_LABELS.MINED, value: q.revenue.mined, color: 'text-blue-600' }
                                      ].map((box, i) => (
                                        <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col items-center justify-center space-y-0.5">
                                          <span className="text-[10px] font-bold text-slate-400 text-center leading-tight">{box.label}</span>
                                          <span className={`text-xs font-bold font-mono ${box.color}`}>{Math.round(box.value || 0).toLocaleString()}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        )}

                        {miningId && receiverIds.length > 0 && (
                          <div className="space-y-4 pt-2 border-t border-slate-100">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-slate-700">共享提炼分配 (多部门)</label>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!miningId || receiverIds.length === 0) return;
                                  const q = aggregateMiningQuadrantsFromLogs(valueLogs, availableMiningResources, miningId, currentUser.center, users);
                                  const count = receiverIds.length;
                                  const newAllocations: Record<string, any> = {};
                                  receiverIds.forEach((rid) => {
                                    const factor = 1 / count;
                                    newAllocations[rid] = {
                                      confirmedRevenue: Math.round((q.revenue.confirmed || 0) * factor),
                                      unconfirmedRevenue: Math.round((q.revenue.unconfirmed || 0) * factor),
                                      pendingValue: Math.round((q.value.pending || 0) * factor),
                                      confirmedValue: Math.round((q.value.confirmed || 0) * factor),
                                      unconfirmedValue: Math.round((q.value.unconfirmed || 0) * factor),
                                    };
                                  });
                                  setSharedAllocations(newAllocations);
                                  toast.success("已成功同步 价值动态流 内容至多部门共享分配");
                                }}
                                className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 border border-indigo-200/60"
                              >
                                <span>同步价值动态流内容</span>
                              </button>
                            </div>

                            <div className="space-y-3">
                              {receiverIds.map(rid => {
                                const unitItem = unitSelectionList.find(u => u.manager?.id === rid);
                                const receiver = managerSource.find(u => u.id === rid);
                                const unitTitle = unitItem ? `${unitItem.unitName} (${unitItem.manager?.name || '经管员'})` : (receiver?.center ? `${receiver.center} (${receiver.name})` : (receiver?.name || rid));
                                return (
                                  <div key={rid} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                                    <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                                      <span className="text-xs font-bold text-slate-800">{unitTitle}</span>
                                      <span className="text-[10px] text-slate-400 font-mono">ID: {rid}</span>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500">已确权收款</label>
                                        <input
                                          type="number"
                                          value={sharedAllocations[rid]?.confirmedRevenue || ''}
                                          onChange={(e) => setSharedAllocations({...sharedAllocations, [rid]: {...sharedAllocations[rid], confirmedRevenue: Number(e.target.value)}})}
                                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                                          placeholder="0"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500">未确权收款</label>
                                        <input
                                          type="number"
                                          value={sharedAllocations[rid]?.unconfirmedRevenue || ''}
                                          onChange={(e) => setSharedAllocations({...sharedAllocations, [rid]: {...sharedAllocations[rid], unconfirmedRevenue: Number(e.target.value)}})}
                                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                                          placeholder="0"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500">待确权产值</label>
                                        <input
                                          type="number"
                                          value={sharedAllocations[rid]?.pendingValue || ''}
                                          onChange={(e) => setSharedAllocations({...sharedAllocations, [rid]: {...sharedAllocations[rid], pendingValue: Number(e.target.value)}})}
                                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                                          placeholder="0"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500">已确权产值</label>
                                        <input
                                          type="number"
                                          value={sharedAllocations[rid]?.confirmedValue || ''}
                                          onChange={(e) => setSharedAllocations({...sharedAllocations, [rid]: {...sharedAllocations[rid], confirmedValue: Number(e.target.value)}})}
                                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                                          placeholder="0"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500">未确权产值</label>
                                        <input
                                          type="number"
                                          value={sharedAllocations[rid]?.unconfirmedValue || ''}
                                          onChange={(e) => setSharedAllocations({...sharedAllocations, [rid]: {...sharedAllocations[rid], unconfirmedValue: Number(e.target.value)}})}
                                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                                          placeholder="0"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500">业务日期</label>
                    <input 
                      type="date" 
                      value={selectedDate} 
                      onChange={(e) => {
                        const date = e.target.value;
                        setSelectedDate(date);
                        if (date) {
                          setSelectedMonth(date.slice(0, 7));
                        }
                      }} 
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between h-4">
                      <label className="text-xs font-bold text-slate-500">
                        执行类型
                      </label>
                      {selectedResource && (
                        <span className="text-xs text-slate-400 font-medium truncate max-w-[120px]" title={`当前视角: ${currentUser.center || '无'}`}>
                          视角: {currentUser.center || '无'}
                        </span>
                      )}
                    </div>
                    <div className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold flex items-center justify-between h-10 shadow-xs">
                      {selectedResource ? (() => {
                        const currentUnit = currentUser.center || '';
                        const et = getExecutionType(selectedResource, currentUnit);
                        const col = getExecutionTypeBadgeColor(et);
                        return (
                          <div className="flex items-center w-full">
                            <span 
                              title={EXECUTION_TYPE_EXPLANATIONS[et]}
                              className={`px-3 py-1 rounded-lg text-xs font-bold border ${col.bg} ${col.text} ${col.border} cursor-help whitespace-nowrap`}
                            >
                              {et}
                            </span>
                          </div>
                        );
                      })() : (
                        <span className="text-slate-400 font-medium text-xs">请先选择矿山</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500">指令详情与备注</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl p-3 font-medium text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 min-h-[90px]"
                    placeholder="请输入确权配方调整说明或交易备注..."
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-sm shadow-sm transition-all flex items-center justify-center space-x-2 active:scale-98 cursor-pointer"
                >
                  <span>发起交易</span>
                  <span>🚀</span>
                </button>
             </form>
           </div>
        </div>
      )}

      {activeTab === 'trading' && (
        <TradingTab
          currentUserId={currentUser.id}
          currentUser={currentUser}
          pendingTransactions={pendingTransactions}
          users={users}
          managerSource={managerSource}
          managerCandidates={managerCandidates}
          isAdmin={isAdmin}
          onAuditTransaction={onAuditTransaction}
          onHandleAudit={handleAudit}
          onStartModify={startModify}
          onNavigateToApply={() => setActiveTab('apply')}
        />
      )}

      {activeTab === 'history' && (
        <div className={`bg-white ${UI_TOKENS.RADIUS_PANEL} border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-200`}>
           <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <h4 className="text-sm font-bold text-slate-900">全量流转审计记录</h4>
              <div className="flex flex-wrap items-center gap-3">
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
                <button 
                  onClick={exportToExcel}
                  disabled={!canExport}
                  title={getExportButtonTitle(canExport, '导出 Excel')}
                  className={`px-3 py-1.5 border rounded-lg text-xs font-bold transition-all flex items-center ${
                    !canExport
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 cursor-pointer'
                  }`}
                >
                  <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  导出 Excel
                </button>
              </div>
           </div>

           <div className="relative max-h-[calc(100vh-14rem)] overflow-auto">
              <table className="w-full text-left border-collapse text-xs">
                 <thead className="sticky top-0 z-20 bg-slate-100 border-b border-slate-200 text-slate-700 font-bold whitespace-nowrap shadow-xs">
                    <tr>
                       <th className="sticky left-0 bg-slate-100 z-40 border-r border-slate-200/80 px-4 py-2.5 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">指令编号/时间</th>
                       <th className="px-4 py-2.5">类别/关联资产</th>
                       <th className="px-4 py-2.5">路由节点</th>
                       <th className="px-4 py-2.5 text-right">流转额度</th>
                       <th className="px-4 py-2.5 text-right">状态</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                    {paginatedTransactions.map(tx => (
                       <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors group">
                          <td className="sticky left-0 bg-white group-hover:bg-slate-50 z-30 border-r border-slate-200/80 px-4 py-2.5 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">
                             <span className="font-mono text-xs font-bold text-slate-700 block">#{tx.id}</span>
                             <span className="text-[10px] text-slate-400 font-mono">{tx.businessDate} ({tx.month})</span>
                          </td>
                          <td className="px-4 py-2.5">
                             <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                                {tx.type}
                             </span>
                             {tx.miningId && <span className="text-xs text-slate-500 font-medium ml-2">矿山: {tx.miningId}</span>}
                          </td>
                          <td className="px-4 py-2.5">
                             <div className="flex items-center space-x-2 text-xs font-medium text-slate-800">
                                <span className="font-bold">{managerSource.find(u => u.id === tx.senderId)?.center || managerSource.find(u => u.id === tx.senderId)?.name || tx.senderId}</span>
                                <span className="text-slate-400">→</span>
                                <span className="font-bold">{managerSource.find(u => u.id === tx.receiverId)?.center || managerSource.find(u => u.id === tx.receiverId)?.name || tx.receiverId}</span>
                              </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                             {`${Math.round(tx.amount).toLocaleString()}`}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                             <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                                tx.status === TransactionStatus.Verified ? 'bg-emerald-100 text-emerald-700' :
                                tx.status === TransactionStatus.Rejected ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                             }`}>
                                {tx.status}
                             </span>
                          </td>
                       </tr>
                    ))}
                    {paginatedTransactions.length === 0 && (
                       <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-slate-400 text-xs">暂无历史流转记录</td>
                       </tr>
                    )}
                 </tbody>
              </table>
           </div>

           {/* Pagination Controls */}
           {(() => {
             const currentTasksLength = filteredTransactions.length;
             if (currentTasksLength <= PAGE_SIZE) return null;
             return (
               <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-slate-100 text-xs">
                 <div className="text-xs text-slate-500">
                   显示 {Math.min(currentTasksLength, (currentPage - 1) * PAGE_SIZE + 1)}-{Math.min(currentTasksLength, currentPage * PAGE_SIZE)} / 共 {currentTasksLength} 条
                 </div>
                 <div className="flex items-center gap-2">
                   <button 
                     disabled={currentPage === 1}
                     onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                     className="px-2 py-1 rounded hover:bg-slate-100 border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed font-bold"
                   >
                     上一页
                   </button>
                   <span className="font-mono font-bold text-slate-700">{currentPage} / {Math.ceil(currentTasksLength / PAGE_SIZE)}</span>
                   <button 
                     disabled={currentPage === Math.ceil(currentTasksLength / PAGE_SIZE)}
                     onClick={() => setCurrentPage(prev => Math.min(Math.ceil(currentTasksLength / PAGE_SIZE), prev + 1))}
                     className="px-2 py-1 rounded hover:bg-slate-100 border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed font-bold"
                   >
                     下一页
                   </button>
                 </div>
               </div>
             );
           })()}
        </div>
      )}

      <CityGuardianModal state={modalState} onClose={closeModal} />
    </div>
  );
};

export default InternalTransactions;
