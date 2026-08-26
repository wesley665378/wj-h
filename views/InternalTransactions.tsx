
import { UI_TOKENS } from '../src/constants/uiTokens';
import React, { useState, useMemo, useEffect } from 'react';
import { User, Role, MiningResource, InternalTransaction, TransactionType, TransactionStatus, CircuitBreaker, TransactionFailure, RefineCategory, RefineType, AuditStatus, ValueCreationLog } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  Cell, Legend, CartesianGrid, PieChart, Pie 
} from 'recharts';
import { Card, ProgressBar } from '../src/components/UI';
import { XLSX, exportWorkbook } from '../src/utils/excelIo';
import { formatMoney } from '../src/utils/formatMoney';
import { UI_LABELS } from '../src/constants/uiLabels';
import { isSystemAdmin } from '../src/utils/accessControl';
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
import { 
  canonicalizeBusinessUnitLabel, 
  businessUnitLabelsEqual, 
  userCenterMatchesBusinessUnit,
  resolveBusinessUnitName 
} from '../src/utils/businessUnitName';
import { formatAmount } from '../src/utils/formatters';
import { InfoTip } from '../src/components/InfoTip';
import { BusinessDateFilter } from '../src/components/BusinessDateFilter';
import { getExecutionType, getExecutionTypeBadgeColor, EXECUTION_TYPE_EXPLANATIONS } from '../src/utils/executionType';
import { toast } from 'sonner';
import { CityGuardianModal, useCityGuardianModal } from '../src/components/CityGuardianModal';
import TradingTab from './TradingTab';

interface InternalTransactionsProps {
  currentUser: User;
  users: User[];
  resources: MiningResource[];
  logs: ValueCreationLog[];
  transactions: InternalTransaction[];
  onSubmitTransaction: (tx: InternalTransaction | InternalTransaction[], updatedResources?: MiningResource[]) => void;
  onAuditTransaction: (txId: string | string[], status: TransactionStatus, updatedResource?: MiningResource | MiningResource[]) => void;
  onUpdateResource: (res: MiningResource) => void;
  onLogSubmit: (log: any) => void;
  circuitBreakers: CircuitBreaker[];
  onAddCircuitBreaker: (cb: CircuitBreaker) => void;
  onRecoverCircuitBreaker: (id: string) => void;
  businessUnits: string[];
  persistWorkspaceNow?: () => Promise<void>;
  persistWorkspaceWithOverrides?: (overrides?: any) => Promise<void>;
}

const FAILURE_THRESHOLD = 3; // 3 failures within 1 minute
const WINDOW_MS = 60 * 1000;

const InternalTransactions: React.FC<InternalTransactionsProps> = ({
  currentUser,
  users,
  resources,
  logs,
  transactions,
  onSubmitTransaction,
  onAuditTransaction,
  onUpdateResource,
  onLogSubmit,
  circuitBreakers,
  onAddCircuitBreaker,
  onRecoverCircuitBreaker,
  businessUnits,
  persistWorkspaceNow,
  persistWorkspaceWithOverrides
}) => {
  const { modalState, showAlert, showConfirm, closeModal } = useCityGuardianModal();
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
  const [activeTab, setActiveTab] = useState<'apply' | 'trading' | 'history' | 'exchange' | 'breakers'>('apply');
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
  const [filterMiningId, setFilterMiningId] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDateRange, setFilterDateRange] = useState({ start: '', end: '' });
  const [selectedTx, setSelectedTx] = useState<InternalTransaction | null>(null);
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  
  // 修改交易时的临时状态
  const [modifyingTx, setModifyingTx] = useState<InternalTransaction | null>(null);
  const [modAmount, setModAmount] = useState<number>(0);
  const [modRevenueAmount, setModRevenueAmount] = useState<number>(0);
  const [modValueAmount, setModValueAmount] = useState<number>(0);
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

  const userList = useMemo(() => {
    return users;
  }, [users]);

  // SSOT: 以 businessUnits 为唯一清单基准构建经营单元列表与主责经管员
  const unitSelectionList = useMemo(() => {
    const rawUnits = Array.isArray(businessUnits) && businessUnits.length > 0 
      ? Array.from(new Set(businessUnits.map(canonicalizeBusinessUnitLabel).filter(Boolean)))
      : Array.from(new Set(userList.map(u => canonicalizeBusinessUnitLabel(u.center)).filter(Boolean)));

    return rawUnits.map(unitName => {
      const unitUsers = userList.filter(u => userCenterMatchesBusinessUnit(u.center, unitName) && u.userStatus !== 'inactive');
      
      // 负责人判定谓词：与后端 isCenterManagerUser 一致 (role=rank，或 category 包含经管员，或职级串含经管员)
      const candidateManagers = unitUsers.filter(u => {
        const r = u.role;
        const cat = u.category || '';
        const title = (u as any).roleTitle || '';
        return (
          r === Role.Rank ||
          cat === '经管员高款专' ||
          cat === '经管员高产专' ||
          cat.includes('经管员') ||
          cat.includes('经营单元管理员') ||
          title.includes('经管员') ||
          title.includes('经营单元管理员')
        );
      });

      let manager: User | null = null;
      if (candidateManagers.length > 0) {
        // 规则固定：优先 role=rank，其次经管员高款专，再经管员高产专；同级取 id / userId 字典序最小
        const getPriorityScore = (u: User) => {
          if (u.role === Role.Rank) return 1;
          if (u.category === '经管员高款专') return 2;
          if (u.category === '经管员高产专') return 3;
          return 4;
        };

        candidateManagers.sort((a, b) => {
          const scoreA = getPriorityScore(a);
          const scoreB = getPriorityScore(b);
          if (scoreA !== scoreB) return scoreA - scoreB;
          const idA = a.userId || a.id || '';
          const idB = b.userId || b.id || '';
          return idA.localeCompare(idB);
        });

        manager = candidateManagers[0];
      }

      const isSelfUnit = !!(currentUser.center && currentUser.center === unitName);

      return {
        unitName,
        manager,
        hasManager: !!manager,
        isSelfUnit
      };
    });
  }, [businessUnits, userList, currentUser.center]);

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
      const u = userList.find(usr => usr.id === rid);
      return u?.center || u?.name || rid;
    });
    return `已选择 ${receiverIds.length} 个单元: ${names.join(', ')}`;
  }, [receiverIds, unitSelectionList, userList]);

  const availableMiningResources = useMemo(() => {
    if (isAdmin) return resources;
    const isAssigned = (assigned: string | undefined, center: string) => {
      if (!assigned) return false;
      return assigned.split(',').map(c => c.trim()).includes(center);
    };
    return resources.filter(r => 
      isAssigned(r.assignedToRevenue, currentUser.center) || 
      isAssigned(r.assignedToValue, currentUser.center) || 
      isAssigned(r.assignedTo, currentUser.center)
    );
  }, [resources, currentUser.center, isAdmin]);

  const pendingTransactions = useMemo(() => {
    return transactions.filter(t => {
      // 接收方确认阶段
      if (t.status === TransactionStatus.PendingTarget) {
        const receiver = userList.find(u => u.id === t.receiverId);
        if (receiver && receiver.center && currentUser.center && receiver.center === currentUser.center) return true;
        if (t.receiverId === currentUser.id) return true;
      }
      
      // 2. 发起方处理退回或验证修改阶段
      if (t.status === TransactionStatus.PendingInitiatorVerify) {
        if (t.senderId === currentUser.id) return true;
      }

      // 3. 管理员终审阶段
      if (t.status === TransactionStatus.PendingAdmin && isAdmin) return true;

      return false;
    });
  }, [transactions, currentUser.id, isAdmin, userList, currentUser.center]);

  const selectedResource = useMemo(() => {
    return resources.find(r => r.id === miningId);
  }, [resources, miningId]);

  const selectedResourceQuadrants = useMemo(() => {
    if (!selectedResource) return null;
    return aggregateMiningQuadrantsFromLogs(logs, resources, selectedResource.id);
  }, [selectedResource, logs, resources]);

  // 自动匹配经营单元逻辑
  useEffect(() => {
    if (selectedResource && type === TransactionType.Resource) {
      const myCenter = currentUser.center;
      let targetCenter = '';

      if (myCenter === selectedResource.assignedToRevenue) {
        targetCenter = selectedResource.assignedToValue || '';
      } 
      else if (myCenter === selectedResource.assignedToValue) {
        targetCenter = selectedResource.assignedToRevenue || '';
      }
      else if (myCenter === selectedResource.assignedTo) {
        if (selectedResource.assignedToRevenue && selectedResource.assignedToRevenue !== myCenter) {
          targetCenter = selectedResource.assignedToRevenue;
        } else if (selectedResource.assignedToValue && selectedResource.assignedToValue !== myCenter) {
          targetCenter = selectedResource.assignedToValue;
        }
      }

      if (targetCenter) {
        const targetItem = unitSelectionList.find(u => u.unitName === targetCenter);
        if (targetItem && targetItem.manager && targetItem.manager.id !== currentUser.id) {
          setReceiverIds([targetItem.manager.id]);
        }
      }
    }
  }, [miningId, selectedResource, type, currentUser.center, currentUser.id, unitSelectionList]);

  // 自动匹配核算配方系数逻辑已删除

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
      const u = userList.find(usr => usr.id === rid);
      return u?.center || u?.name || rid;
    }).join(', ');

    showConfirm(
      `确定发起内部交易指令？\n\n【交易类别】${type}\n【接收节点】${receiverNames}${miningId ? `\n【关联矿山】${miningId}` : ''}\n【业务月份】${selectedMonth}`,
      async () => {
        const newTxs: InternalTransaction[] = [];
        receiverIds.forEach((rid, index) => {
          const newTx: InternalTransaction = {
            id: `TX${(Date.now() + index).toString().slice(-6)}`,
            type,
            senderId: currentUser.id,
            receiverId: rid,
            miningId: type === TransactionType.Resource ? miningId : undefined,
            amount: amount,
            unitPrice: unitPrice > 0 ? unitPrice : undefined,
            revenueAmount: type === TransactionType.Resource ? ((sharedAllocations[rid]?.confirmedRevenue || 0) + (sharedAllocations[rid]?.unconfirmedRevenue || 0)) : undefined,
            valueAmount: type === TransactionType.Resource ? ((sharedAllocations[rid]?.pendingValue || 0) + (sharedAllocations[rid]?.confirmedValue || 0) + (sharedAllocations[rid]?.unconfirmedValue || 0)) : undefined,
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

        showAlert('交易指令已发起，等待接收方验证。');

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
        const sender = userList.find(u => u.id === t.senderId);
        const receiver = userList.find(u => u.id === t.receiverId);
        return sender?.center === currentUser.center || receiver?.center === currentUser.center;
      });
    }
    
    list = list.filter(t => isLogInFilter(t, filterMonth, filterStartDate, filterEndDate));
    
    return list;
  }, [transactions, currentUser.center, isAdmin, userList, filterMonth, filterStartDate, filterEndDate]);

  const filteredExchangeTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (t.type !== TransactionType.Resource) return false;
      const matchesMiningId = !filterMiningId || t.miningId === filterMiningId;
      const matchesType = !filterType || (filterType === '收款' ? (t.revenueAmount || 0) > 0 : (t.valueAmount || 0) > 0);
      const matchesRangeAndMonth = isLogInFilter(t, filterMonth, filterStartDate, filterEndDate);
      const matchesDate = (!filterDateRange.start || t.timestamp >= new Date(filterDateRange.start).getTime()) &&
                          (!filterDateRange.end || t.timestamp <= new Date(filterDateRange.end).getTime());
      const isRelated = isAdmin || t.senderId === currentUser.id || t.receiverId === currentUser.id;
      return matchesMiningId && matchesType && matchesRangeAndMonth && matchesDate && isRelated && t.status === TransactionStatus.Verified;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [transactions, filterMiningId, filterType, filterDateRange, currentUser.id, isAdmin, filterMonth, filterStartDate, filterEndDate]);

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
        const updatedTx = {
          ...modifyingTx,
          amount: modAmount,
          revenueAmount: modRevenueAmount,
          valueAmount: modValueAmount,
          receiverId: modReceiverId,
          status: TransactionStatus.PendingInitiatorVerify // 待发起方验证
        };
        onSubmitTransaction(updatedTx);
        setModifyingTx(null);
        showAlert(`交易 [${modifyingTx.id}] 已修改并重新提交发起方验证！`);
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
          const globalResources = resources;
          const resource = globalResources.find(r => r.id === tx.miningId);
          if (!resource) {
            showAlert(`确认失败：未在全量资源库中找到矿山编号 [${tx.miningId}]。操作已中止，交易状态未变更。`);
            return;
          }

          const receiver = userList.find(u => u.id === tx.receiverId);
          const targetCenter = resolveBusinessUnitName(receiver?.center, businessUnits) || canonicalizeBusinessUnitLabel(receiver?.center);
          if (!targetCenter) {
            showAlert(`确认失败：接收主体 [${receiver?.name || tx.receiverId}] 未配置所属经营单元。操作已中止。`);
            return;
          }

          const appendCenter = (current: string | undefined, centerToAdd: string) => {
            const trimmedToAdd = canonicalizeBusinessUnitLabel(centerToAdd);
            if (!trimmedToAdd) return current || '';
            const centers = (current || '').split(',').map(c => canonicalizeBusinessUnitLabel(c)).filter(Boolean);
            if (!centers.some(c => businessUnitLabelsEqual(c, trimmedToAdd))) {
              centers.push(trimmedToAdd);
            }
            return centers.join(',');
          };

          updatedResource = {
            ...resource,
            assignedTo: appendCenter(resource.assignedTo, targetCenter),
            assignedToRevenue: (tx.revenueAmount && tx.revenueAmount > 0) 
              ? appendCenter(resource.assignedToRevenue, targetCenter) 
              : (resource.assignedToRevenue || ''),
            assignedToValue: (tx.valueAmount && tx.valueAmount > 0) 
              ? appendCenter(resource.assignedToValue, targetCenter) 
              : (resource.assignedToValue || '')
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
      showAlert(`交易 [${tx.id}] 确认成功！${updatedResource ? `矿山 [${tx.miningId}] 已同步指派给 [${userList.find(u => u.id === tx.receiverId)?.center || '接收单元'}]。` : ''}`);
      return;
    }

    onAuditTransaction(tx.id, nextStatus);
    showAlert(`交易 [${tx.id}] 状态更新成功！`);
  };

  const handleBatchAudit = async (action: 'approve' | 'reject' | 'return' | 'modify' | 'withdraw' | 'agree') => {
    for (const id of selectedTxIds) {
      const tx = transactions.find(t => t.id === id);
      if (tx) await handleAudit(tx, action);
    }
    const count = selectedTxIds.length;
    setSelectedTxIds([]);
    showAlert(`批量操作完成！共处理 ${count} 条交易指令。`);
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
    setModAmount(tx.amount);
    setModRevenueAmount(tx.revenueAmount || 0);
    setModValueAmount(tx.valueAmount || 0);
    setModReceiverId(tx.receiverId);
  };

  const exportToExcel = () => {
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
        '发起方': userList.find(u => u.id === tx.senderId)?.center || userList.find(u => u.id === tx.senderId)?.name || tx.senderId,
        '经营单元': userList.find(u => u.id === tx.receiverId)?.center || userList.find(u => u.id === tx.receiverId)?.name || tx.receiverId,
        '流转额度': tx.amount,
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

  const transactionStats = useMemo(() => {
    const typeCounts = transactions.reduce((acc, t) => {
      acc[t.type] = (acc[t.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const typeData = Object.entries(typeCounts).map(([name, value]) => ({ 
      name: name === TransactionType.Resource ? '资源流转' : '其它', 
      value,
      color: '#10B981'
    }));

    const statusCounts = transactions.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

    return { typeData, statusData };
  }, [transactions]);

  if (isNpcxie) {
    return (
      <div className="w-full flex flex-col items-center justify-center p-16 bg-white rounded-3xl border border-slate-200 shadow-sm text-center space-y-4 animate-in fade-in duration-500">
        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center text-3xl font-bold">
          🔒
        </div>
        <h3 className="text-base font-black text-slate-800 tracking-tight">无内部交易访问与操作权限</h3>
        <p className="text-xs text-slate-500 max-w-md leading-relaxed">
          根据系统权责规范，当前智能体账户 (NPCXIE) 的内部交易发起、审核与流转权限已取消。如需处理内部交易，请使用对应经营单元负责人或系统管理账户。
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500 pb-6 text-[14px]">
      {/* 交易统计看板 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <Card title="交易类型分布" className={`bg-white p-8 ${UI_TOKENS.RADIUS_PANEL} shadow-xl`}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={transactionStats.typeData} 
                  dataKey="value" 
                  cx="50%" 
                  cy="50%" 
                  innerRadius={60} 
                  outerRadius={90} 
                  paddingAngle={8} 
                  stroke="none"
                >
                  {transactionStats.typeData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="交易状态透视" className={`lg:col-span-2 bg-white p-8 ${UI_TOKENS.RADIUS_PANEL} shadow-xl`}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={transactionStats.statusData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="value" fill="#3b82f6" radius={[10, 10, 0, 0]} barSize={40}>
                  {transactionStats.statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#3b82f6', '#10B981', '#f43f5e', '#FBBF24', '#8b5cf6'][index % 5]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* 顶部控制栏 */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 ${UI_TOKENS.RADIUS_PANEL} shadow-sm border border-slate-100`}>
        <div>
          <h3 className="text-2xl font-black text-slate-800 tracking-tighter uppercase flex items-center">
            <span className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white mr-4 shadow-lg">🤝</span>
            内部交易流转中心
          </h3>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1 ml-14">
            路由：发起经营单元 - 接收经营单元 - 确认
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          {persistWorkspaceNow && (
            <button
              onClick={async () => {
                await persistWorkspaceNow();
                showAlert('工作区数据已保存');
              }}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[10px] font-black tracking-widest shadow-lg active:scale-95 transition-all flex items-center"
            >
              💾 保存数据
            </button>
          )}

          <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
             <button 
              onClick={() => setActiveTab('apply')}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all ${activeTab === 'apply' ? 'bg-white text-slate-900 shadow-xl scale-105' : 'text-slate-400 hover:text-slate-600'}`}
             >
               发起申请
             </button>
             <button 
              onClick={() => setActiveTab('trading')}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all flex items-center space-x-2 ${activeTab === 'trading' ? 'bg-white text-slate-900 shadow-xl scale-105' : 'text-slate-400 hover:text-slate-600'}`}
             >
               <span>待验证 ({pendingTransactions.length})</span>
             </button>
             <button 
              onClick={() => setActiveTab('history')}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all ${activeTab === 'history' ? 'bg-white text-slate-900 shadow-xl scale-105' : 'text-slate-400 hover:text-slate-600'}`}
             >
               交易记录
             </button>
             <button 
              onClick={() => setActiveTab('exchange')}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all ${activeTab === 'exchange' ? 'bg-white text-slate-900 shadow-xl scale-105' : 'text-slate-400 hover:text-slate-600'}`}
             >
               资源交易
             </button>
          </div>
        </div>
      </div>

      {activeTab === 'apply' && (
        <div className="w-full">
           <div className={`bg-white ${UI_TOKENS.RADIUS_PANEL} shadow-xl border border-slate-100 overflow-hidden`}>
             <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
                <h4 className="text-xl font-black flex items-center tracking-tighter uppercase">
                  <span className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center mr-4 shadow-lg">⚡</span>
                  创建流转指令
                </h4>
             </div>
             
             <form onSubmit={handleSubmit} className="p-10 space-y-8">
                <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setType(TransactionType.Resource)}
                    className="flex-1 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest bg-white text-slate-900 shadow-sm transition-all"
                  >
                    资源交易
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3 md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">矿山编号 (唯一定量)</label>
                    <select
                      value={miningId}
                      onChange={(e) => setMiningId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold outline-none focus:ring-4 focus:ring-indigo-500/10"
                      required
                    >
                      <option value="">选择关联矿山编号...</option>
                      {availableMiningResources.map(r => (
                        <option key={r.id} value={r.id}>{r.id} ({r.status})</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-3 relative md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      接收经营单元
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold text-left flex justify-between items-center outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                      >
                        <span className="truncate">
                          {selectedUnitSummary}
                        </span>
                        <svg className={`w-5 h-5 transition-transform flex-shrink-0 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {isDropdownOpen && (
                        <div className="absolute z-50 mt-2 w-full bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                          <div className="p-3 border-b border-slate-100 bg-slate-50">
                            <input
                              type="text"
                              placeholder="搜索经营单元名称或负责人..."
                              value={receiverSearch}
                              onChange={(e) => setReceiverSearch(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
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
                              <div className="p-6 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
                                未找到匹配的经营单元
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

                {selectedResource && (
                  <div className={`space-y-6 bg-white p-8 ${UI_TOKENS.RADIUS_PANEL} border border-slate-100 shadow-sm animate-in slide-in-from-left-2 duration-300`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-xl font-black text-slate-800 tracking-tighter">{selectedResource.id}</h4>
                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">
                          {selectedResource.types?.join(' / ') || '矿山项目'}
                        </p>
                      </div>
                      <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                        selectedResource.status === '勘探中' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                      }`}>
                        {selectedResource.status}
                      </span>
                    </div>

                    {/* 未确权产值分布 */}
                    <div className="space-y-4">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">未确权产值分布</div>
                      {(() => {
                        const unconfirmedValueByReceiver: Record<string, number> = {};
                        
                        // 1. 还在流转中的产值 (待接收方验证)
                        const pendingTxs = (transactions || []).filter(t => 
                          t.type === TransactionType.Resource && 
                          t.status === TransactionStatus.PendingTarget && 
                          t.miningId === selectedResource.id
                        );
                        pendingTxs.forEach(t => {
                          const receiver = users.find(u => u.id === t.receiverId);
                          const receiverName = receiver?.center || receiver?.name || '未知';
                          const shortName = receiverName.replace('中心', '');
                          unconfirmedValueByReceiver[shortName] = (unconfirmedValueByReceiver[shortName] || 0) + (t.valueAmount || 0);
                        });

                        // 2. 已接收 but 处于“待确权”状态的产值 (联动确权注入的积分)
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
                          return <div className="text-[10px] text-slate-400 italic">暂无未确权产值</div>;
                        }

                        return entries.map(([receiver, amount]) => (
                          <div key={receiver} className="flex justify-between text-[10px] font-bold">
                            <span className="text-slate-600">{receiver}</span>
                            <span className="text-rose-600">{amount.toLocaleString()}</span>
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
                          <div className="space-y-4">
                            <div className="flex justify-between items-center">
                              <h5 className="text-[11px] font-black text-emerald-600 uppercase tracking-widest flex items-center">
                                <span className="mr-2"></span> {UI_LABELS.VALUE}
                              </h5>
                              <span className="text-[10px] font-bold text-slate-400">产初: {getInitialValueCapacity(selectedResource).toLocaleString()} | 产当: {getCurrentValueCapacity(selectedResource, logs).toLocaleString()}</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {[
                                { label: UI_LABELS.PENDING, value: q.value.pending, color: 'text-amber-500' },
                                { label: UI_LABELS.CONFIRMED, value: q.value.confirmed, color: 'text-emerald-500' },
                                { label: UI_LABELS.UNCONFIRMED, value: q.value.unconfirmed, color: 'text-rose-500' },
                                { label: UI_LABELS.MINED, value: q.value.mined, color: 'text-blue-500' }
                              ].map((box, i) => (
                                <div key={i} className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 flex flex-col items-center justify-center space-y-1">
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter text-center leading-tight">{box.label}</span>
                                  <span className={`text-sm font-black font-mono ${box.color}`}>{Math.round(box.value).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="flex justify-between items-center">
                              <h5 className="text-[11px] font-black text-amber-600 uppercase tracking-widest flex items-center">
                                <span className="mr-2"></span> {UI_LABELS.REVENUE}
                              </h5>
                              <span className="text-[10px] font-bold text-slate-400">款初: {getInitialRevenueCapacity(selectedResource).toLocaleString()} | 款当: {getCurrentRevenueCapacity(selectedResource, logs).toLocaleString()}</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {[
                                { label: UI_LABELS.PENDING, value: q.revenue.pending, color: 'text-amber-500' },
                                { label: UI_LABELS.CONFIRMED, value: q.revenue.confirmed, color: 'text-emerald-500' },
                                { label: UI_LABELS.UNCONFIRMED, value: q.revenue.unconfirmed, color: 'text-rose-500' },
                                { label: UI_LABELS.MINED, value: q.revenue.mined, color: 'text-blue-500' }
                              ].map((box, i) => (
                                <div key={i} className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 flex flex-col items-center justify-center space-y-1">
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter text-center leading-tight">{box.label}</span>
                                  <span className={`text-sm font-black font-mono ${box.color}`}>{Math.round(box.value || 0).toLocaleString()}</span>
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
                  <div className="space-y-6 mt-6">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">共享提炼分配 (多部门)</label>
                    <div className="space-y-4">
                      {receiverIds.map(rid => {
                        const unitItem = unitSelectionList.find(u => u.manager?.id === rid);
                        const receiver = userList.find(u => u.id === rid);
                        const unitTitle = unitItem ? `${unitItem.unitName} (${unitItem.manager?.name || '经管员'})` : (receiver?.center ? `${receiver.center} (${receiver.name})` : (receiver?.name || rid));
                        return (
                          <div key={rid} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <span className="text-sm font-black text-slate-700">{unitTitle}</span>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">分配详情</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">已确权收款</label>
                                <input
                                  type="number"
                                  value={sharedAllocations[rid]?.confirmedRevenue || ''}
                                  onChange={(e) => setSharedAllocations({...sharedAllocations, [rid]: {...sharedAllocations[rid], confirmedRevenue: Number(e.target.value)}})}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                                  placeholder="0"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">未确权收款</label>
                                <input
                                  type="number"
                                  value={sharedAllocations[rid]?.unconfirmedRevenue || ''}
                                  onChange={(e) => setSharedAllocations({...sharedAllocations, [rid]: {...sharedAllocations[rid], unconfirmedRevenue: Number(e.target.value)}})}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                                  placeholder="0"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">待确权产值</label>
                                <input
                                  type="number"
                                  value={sharedAllocations[rid]?.pendingValue || ''}
                                  onChange={(e) => setSharedAllocations({...sharedAllocations, [rid]: {...sharedAllocations[rid], pendingValue: Number(e.target.value)}})}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                                  placeholder="0"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">已确权产值</label>
                                <input
                                  type="number"
                                  value={sharedAllocations[rid]?.confirmedValue || ''}
                                  onChange={(e) => setSharedAllocations({...sharedAllocations, [rid]: {...sharedAllocations[rid], confirmedValue: Number(e.target.value)}})}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                                  placeholder="0"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">未确权产值</label>
                                <input
                                  type="number"
                                  value={sharedAllocations[rid]?.unconfirmedValue || ''}
                                  onChange={(e) => setSharedAllocations({...sharedAllocations, [rid]: {...sharedAllocations[rid], unconfirmedValue: Number(e.target.value)}})}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">业务月份</label>
                    <input 
                      type="month" 
                      value={selectedMonth} 
                      onChange={(e) => {
                        setSelectedMonth(e.target.value);
                        if (selectedDate.slice(0, 7) !== e.target.value) {
                          setSelectedDate(`${e.target.value}-01`);
                        }
                      }} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold outline-none focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">业务日期</label>
                    <input 
                      type="date" 
                      value={selectedDate} 
                      onChange={(e) => setSelectedDate(e.target.value)} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold outline-none focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        执行类型
                      </label>
                      {selectedResource && (
                        <span className="text-[9px] text-slate-400 font-medium truncate max-w-[120px]" title={`当前视角: ${currentUser.center || '无'}`}>
                          视角: {currentUser.center || '无'}
                        </span>
                      )}
                    </div>
                    <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 font-bold flex items-center justify-between min-h-[58px]">
                      {selectedResource ? (() => {
                        const currentUnit = currentUser.center || '';
                        const et = getExecutionType(selectedResource, currentUnit);
                        const col = getExecutionTypeBadgeColor(et);
                        return (
                          <div className="flex items-center w-full">
                            <span 
                              title={EXECUTION_TYPE_EXPLANATIONS[et]}
                              className={`px-3 py-1 rounded-xl text-xs font-black border ${col.bg} ${col.text} ${col.border} cursor-help shadow-sm whitespace-nowrap`}
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

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">指令详情与备注</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 min-h-[120px]"
                    placeholder="请输入确权配方调整说明或交易备注..."
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-600 text-white py-6 rounded-[2rem] font-black uppercase tracking-[0.4em] shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center space-x-4"
                >
                  <span>发起交易</span>
                  <span className="text-xl">🚀</span>
                </button>
             </form>
           </div>
        </div>
      )}
      {activeTab === 'trading' && (
        <TradingTab
          selectedMineId={miningId}
          setSelectedMineId={setMiningId}
          selectedMine={selectedMine}
          availableMiningResources={availableMiningResources}
          pendingTransactions={pendingTransactions}
          filteredExchangeTransactions={filteredExchangeTransactions}
          users={users}
          selectedTx={selectedTx}
          setSelectedTx={setSelectedTx}
          onAuditTransaction={handleAudit}
          startModify={startModify}
          modifyingTx={modifyingTx}
          setModifyingTx={setModifyingTx}
          modRevenueAmount={modRevenueAmount}
          setModRevenueAmount={setModRevenueAmount}
          modValueAmount={modValueAmount}
          setModValueAmount={setModValueAmount}
          setShowConfirmModal={handleOpenConfirmModal}
          selectedTxIds={selectedTxIds}
          setSelectedTxIds={setSelectedTxIds}
          exportToExcel={exportToExcel}
          logs={logs}
        />
      )}

      {activeTab === 'breakers' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4">
           <div className={`bg-white ${UI_TOKENS.RADIUS_PANEL} p-10 shadow-xl border border-slate-100`}>
              <div className="flex items-center justify-between mb-10">
                 <h4 className="text-xl font-black text-slate-800 tracking-tighter uppercase">熔断保护监控中心</h4>
                 <div className="flex items-center space-x-2">
                    <span className="w-3 h-3 bg-rose-500 rounded-full animate-pulse"></span>
                    <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">实时监控中</span>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                 <div className="bg-rose-50 p-6 rounded-3xl border border-rose-100">
                    <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-2">当前活跃熔断</p>
                    <p className="text-4xl font-black text-rose-600">{circuitBreakers.filter(cb => cb.status === 'active').length}</p>
                 </div>
                 <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">已恢复单元</p>
                    <p className="text-4xl font-black text-emerald-600">{circuitBreakers.filter(cb => cb.status === 'recovered').length}</p>
                 </div>
                 <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">失败记录 (60s)</p>
                    <p className="text-4xl font-black text-slate-600">{failureLogs.length}</p>
                 </div>
              </div>

              <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead>
                       <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                          <th className="py-4">目标单元</th>
                          <th className="py-4">熔断原因</th>
                          <th className="py-4">类型</th>
                          <th className="py-4">触发时间</th>
                          <th className="py-4">预计恢复</th>
                          <th className="py-4">状态</th>
                          <th className="py-4 text-right">操作</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y">
                       {circuitBreakers.slice().reverse().map(cb => (
                          <tr key={cb.id} className="text-xs font-bold">
                             <td className="py-6">
                                <span className="text-slate-900">{cb.targetName}</span>
                                <p className="text-[9px] text-slate-400 font-mono">ID: {cb.targetId}</p>
                             </td>
                             <td className="py-6 text-rose-500">{cb.reason}</td>
                             <td className="py-6 uppercase tracking-tighter text-[10px]">{cb.type}</td>
                             <td className="py-6 text-slate-500">{new Date(cb.createdAt).toLocaleString()}</td>
                             <td className="py-6 text-slate-500">
                                {cb.status === 'active' ? (
                                   <div className="w-32">
                                     <ProgressBar 
                                       value={currentTime - cb.createdAt} 
                                       max={cb.expiresAt - cb.createdAt} 
                                       color="bg-rose-500" 
                                       className="h-1.5"
                                     />
                                     <p className="text-[8px] font-mono mt-1 text-slate-400">预计 {new Date(cb.expiresAt).toLocaleTimeString()}</p>
                                   </div>
                                ) : '-'}
                              </td>
                             <td className="py-6">
                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${cb.status === 'active' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                   {cb.status === 'active' ? '熔断中' : '已恢复'}
                                </span>
                             </td>
                             <td className="py-6 text-right">
                                {cb.status === 'active' && isAdmin && (
                                   <button 
                                    onClick={() => onRecoverCircuitBreaker(cb.id)}
                                    className="text-indigo-600 hover:underline uppercase text-[10px] font-black"
                                   >
                                     手动恢复
                                   </button>
                                )}
                             </td>
                          </tr>
                       ))}
                       {circuitBreakers.length === 0 && (
                         <tr>
                           <td colSpan={7} className="py-20 text-center text-slate-400 font-black uppercase tracking-widest">暂无熔断记录</td>
                         </tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'exchange' && (
        <div className={`bg-white ${UI_TOKENS.RADIUS_PANEL} border border-slate-100 shadow-xl overflow-hidden animate-in slide-in-from-bottom-4`}>
           <div className="p-8 border-b border-slate-50 flex flex-wrap items-center justify-between gap-4">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.3em]">内部资源实时交易</h4>
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
           <div className="overflow-x-auto">
              <table className="w-full text-left">
                 <thead>
                    <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                       <th className="px-10 py-6">交易ID</th>
                       <th className="px-6 py-6">资源类型</th>
                       <th className="px-6 py-6">数量</th>
                       <th className="px-6 py-6">接收经营单元</th>
                       <th className="px-10 py-6 text-right">操作</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {filteredExchangeTransactions.map(tx => (
                       <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-10 py-6 font-mono text-[10px] font-black text-slate-400">#{tx.id}</td>
                          <td className="px-6 py-6">
                             <span className="text-[9px] font-black px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg uppercase tracking-widest">
                                {tx.type}
                             </span>
                          </td>
                          <td className="px-6 py-6 font-mono font-black text-slate-900">{tx.amount}</td>
                          <td className="px-6 py-6 text-xs font-bold text-slate-800">
                             {userList.find(u => u.id === tx.receiverId)?.center || userList.find(u => u.id === tx.receiverId)?.name || tx.receiverId}
                          </td>
                          <td className="px-10 py-6 text-right">
                             <button onClick={() => setSelectedTx(tx)} className="text-indigo-600 hover:underline text-[10px] font-black uppercase">详情</button>
                          </td>
                       </tr>
                    ))}
                    {filteredExchangeTransactions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-10 py-20 text-center text-slate-400 font-black uppercase tracking-widest">暂无资源交易记录</td>
                      </tr>
                    )}
                 </tbody>
              </table>
           </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className={`bg-white ${UI_TOKENS.RADIUS_PANEL} border border-slate-100 shadow-xl overflow-hidden animate-in slide-in-from-bottom-4`}>
           <div className="p-8 border-b border-slate-50 flex flex-wrap items-center justify-between gap-4">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.3em]">全量流转审计记录</h4>
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
                  className="px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center"
                >
                  <svg className="w-3 h-3 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  导出 Excel
                </button>
              </div>
           </div>
           <div className="overflow-x-auto">
              <table className="w-full text-left">
                 <thead>
                    <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                       <th className="px-10 py-6">指令编号/时间</th>
                       <th className="px-6 py-6">类别/关联资产</th>
                       <th className="px-6 py-6">路由节点</th>
                       <th className="px-6 py-6 text-right">流转度</th>
                       <th className="px-10 py-6 text-right">入库</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {filteredTransactions.slice().reverse().map(tx => (
                       <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-10 py-6">
                             <span className="font-mono text-[10px] font-black text-slate-300 block mb-1">#{tx.id}</span>
                             <span className="text-[9px] font-bold text-slate-500">{new Date(tx.timestamp).toLocaleString()}</span>
                          </td>
                          <td className="px-6 py-6">
                             <span className={`text-[9px] font-black px-3 py-1 rounded-lg uppercase tracking-widest bg-indigo-50 text-indigo-600`}>
                                {tx.type}
                             </span>
                             {tx.miningId && <p className="text-[9px] font-black text-slate-400 mt-2">矿山: {tx.miningId}</p>}
                          </td>
                          <td className="px-6 py-6">
                             <div className="flex items-center space-x-3 text-xs font-bold text-slate-800">
                                <span>{userList.find(u => u.id === tx.senderId)?.center || userList.find(u => u.id === tx.senderId)?.name || tx.senderId}</span>
                                <span className="text-slate-300">→</span>
                                <span>{userList.find(u => u.id === tx.receiverId)?.center || userList.find(u => u.id === tx.receiverId)?.name || tx.receiverId}</span>
                             </div>
                          </td>
                          <td className="px-6 py-6 text-right font-mono font-black text-slate-900">
                             {`${Math.round(tx.amount).toLocaleString()}`}
                          </td>
                          <td className="px-10 py-6 text-right">
                             <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                tx.status === TransactionStatus.Verified ? 'bg-emerald-100 text-emerald-700' :
                                tx.status === TransactionStatus.Rejected ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                             }`}>
                                {tx.status}
                             </span>
                          </td>
                       </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      )}

      <CityGuardianModal state={modalState} onClose={closeModal} />
    </div>
  );
};

export default InternalTransactions;
