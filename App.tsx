
import React, { useState, useEffect, useMemo } from 'react';
import { User, Role, MiningResource, ValueCreationLog, AuditStatus, RefineCategory, RefineType, InternalTransaction, TransactionStatus, SystemOperationLog, CircuitBreaker, ResourceStatus, QuotaSnapshot, AcceptanceRecord, MeetingSample } from './types';
import Dashboard from './views/Dashboard';
import ValueCreation from './views/ValueCreation';
import { calculateHistoricalNetValue, checkUserPermission } from './src/utils/business';
import { applyConsumptionHedgeToLogs } from './src/utils/consumptionHedge';
import Auditing from './views/Auditing';
import ResourceManagement from './views/ResourceManagement';
import Reservoir from './views/Reservoir';
import Evaluation from './views/Evaluation';
import Distribution from './views/Distribution';
import PersonnelPool from './views/PersonnelPool';
import InternalTransactions from './views/InternalTransactions';
import { buildValueEfficiencySnapshots } from './src/utils/valueEfficiencySnapshots';
import { buildJzfpSnapshot } from './src/utils/jzfpSnapshot';
import DynamicConsumption from './views/DynamicConsumption';
import MyAccount from './views/MyAccount';
import SystemInstructions from './views/SystemInstructions';
import Sidebar from './components/Sidebar';
import Login from './components/Login';
import ErrorBoundary from './components/ErrorBoundary';
import ChangePasswordModal from './src/components/ChangePasswordModal';
import SystemAnnouncement from './src/components/SystemAnnouncement';
import SiteFooter from './components/SiteFooter';
import LegalOverlay from './components/LegalOverlay';
import { Toaster, toast } from 'sonner';
import { auditLog } from './src/services/api';
import { getLocalDateString, getLocalMonthString } from './src/utils/dateUtils';

const INITIAL_USERS: User[] = [
  { id: 'admin', userId: 'admin', name: '系统管理员', role: Role.Admin, category: '系统管理员', salaryPackageType: 'NPC工资包', userStatus: 'active' },
  { id: "1635", userId: "1635", name: "平台管理员", role: Role.Admin, category: "系统管理员", salaryPackageType: "NPC工资包", userStatus: "active" },
  { id: 'npcxie', userId: 'npcxie', name: 'npcxie', role: Role.npcxie, category: 'NPC', salaryPackageType: 'NPC工资包', userStatus: 'active' }
];

const INITIAL_MINING_RESOURCES: MiningResource[] = [
  { 
    id: 'KS001', 
    initialRevenueCapacity: 9330000,
    initialValueCapacity: 9330000,
    types: [RefineType.Enterprise],
    valueCapacity: 9330000, // 10000000 * 0.933 (Unified benchmark)
    revenueCapacity: 9330000, // 10000000 * 0.933
    minedRevenue: 0,
    minedValue: 0,
    assignedTo: '经营单元-001',
    status: ResourceStatus.Exploring,
    pendingValue: 0,
    confirmedValue: 0,
    unconfirmedValue: 0,
    valueDepleted: false,
    pendingRevenue: 0,
    confirmedRevenue: 0,
    unconfirmedRevenue: 0,
    revenueDepleted: false,
    incentiveOutput5: 0,
    incentiveCollection2: 0
  }
];

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('shihe_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error('Failed to parse user from localStorage', e);
      return null;
    }
  });
  
  const [businessUnits, setBusinessUnits] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('shihe_business_units');
      const parsed = saved ? JSON.parse(saved) : ['RC', '经营单元-001'];
      return Array.isArray(parsed) ? parsed : ['RC', '经营单元-001'];
    } catch (e) {
      console.error('Failed to parse business units', e);
      return ['RC', '经营单元-001'];
    }
  });

  const [managedUsers, setManagedUsers] = useState<User[]>(INITIAL_USERS);
  const [meetingSamples, setMeetingSamples] = useState<MeetingSample[]>([]);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [isLegalOpen, setIsLegalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<'agreement' | 'privacy'>('agreement');

  const handleOpenLegal = (tab: 'agreement' | 'privacy') => {
    setLegalTab(tab);
    setIsLegalOpen(true);
  };
  
  // 从后端获取初始数据
  useEffect(() => {
    const fetchWorkspace = async () => {
      // 切换账号或状态变化时，首先锁定写操作并重置状态
      setWorkspaceLoaded(false);
      
      if (!currentUser) return;

      // 清理前一个会话的数据快照，防止新账号短暂看到旧数据
      setManagedUsers(INITIAL_USERS);
      setLogs([]);
      setTransactions([]);
      setMiningResources([]);
      setBusinessUnits(['RC', '经营单元-001']);
      setMeetingSamples([]);

      try {
        let data = null;
        const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/workspace`);
        if (res.ok) {
          data = await res.json();
        }

        if (data) {
          // 原子化更新数据
          if (data.managedUsers && Array.isArray(data.managedUsers)) {
            const backfilledUsers = data.managedUsers.map((u: any) => ({
              ...u,
              category: u.category === '统筹水库管理员' ? '水库管理员' : u.category
            }));
            setManagedUsers(backfilledUsers);
          }
          if (data.logs && Array.isArray(data.logs)) {
            const backfilledLogs = data.logs
              .filter((l: any) => l !== null)
              .map((l: any) => {
                const recalculatedNetValue = calculateHistoricalNetValue(l, data.miningResources || [], data.managedUsers || []);
                return {
                  ...l,
                  month: l.month || getLocalMonthString(l.timestamp),
                  businessDate: l.businessDate || getLocalDateString(l.timestamp),
                  rawAmount: l.rawAmount ?? l.amount ?? 0,
                  dynamicCost: l.dynamicCost ?? 0,
                  netValue: recalculatedNetValue !== 0 ? recalculatedNetValue : (l.netValue ?? 0)
                };
              });
            setLogs(backfilledLogs);
          }
          if (data.transactions && Array.isArray(data.transactions)) {
            const backfilledTxs = data.transactions.map((tx: any) => ({
              ...tx,
              month: tx.month || getLocalMonthString(tx.timestamp),
              businessDate: tx.businessDate || getLocalDateString(tx.timestamp)
            }));
            setTransactions(backfilledTxs);
          }
          if (data.miningResources && Array.isArray(data.miningResources)) {
            const backfilledResources = data.miningResources.map((r: any) => ({
              ...r,
              // 统一步骤：加载时即完成0.933提纯转换（注：已在入库时提纯，此处仅加载无需再次乘0.933）
              revenueCapacity: r.revenueCapacity,
              valueCapacity: r.valueCapacity,
              incentiveOutput5: r.incentiveOutput5 ?? 0,
              incentiveCollection2: r.incentiveCollection2 ?? 0,
              pendingValue: r.pendingValue ?? 0,
              confirmedValue: r.confirmedValue ?? 0,
              unconfirmedValue: r.unconfirmedValue ?? 0,
              pendingRevenue: r.pendingRevenue ?? 0,
              confirmedRevenue: r.confirmedRevenue ?? 0,
              unconfirmedRevenue: r.unconfirmedRevenue ?? 0,
            }));
            setMiningResources(backfilledResources);
          }
          if (data.acceptanceRecords && Array.isArray(data.acceptanceRecords)) {
            setAcceptanceRecords(data.acceptanceRecords);
          }
          if (data.circuitBreakers && Array.isArray(data.circuitBreakers)) {
            setCircuitBreakers(data.circuitBreakers);
            localStorage.setItem('shihe_circuit_breakers', JSON.stringify(data.circuitBreakers));
          } else if (data.rdq && Array.isArray(data.rdq)) {
            setCircuitBreakers(data.rdq);
            localStorage.setItem('shihe_circuit_breakers', JSON.stringify(data.rdq));
          }
          if (data.meetingSamples && Array.isArray(data.meetingSamples)) {
            setMeetingSamples(data.meetingSamples);
          }
          // 最后且关键：标记工作区已就绪
          setWorkspaceLoaded(true);
        } else {
          // 如果没有数据，也要标记就绪以允许使用初始数据
          setWorkspaceLoaded(true);
        }
      } catch (err) {
        console.error('无法从后端获取工作区数据:', err);
        // 发生错误时，依然标记为就绪，以便用户能继续操作（使用本地缓存或初始数据）
        setWorkspaceLoaded(true);
      }
    };
    fetchWorkspace();
    
    // 执行 SQL 迁移 (静默)
    fetch(`${import.meta.env.VITE_API_BASE || ''}/api/admin/migrate`, { method: 'POST' }).catch(() => {});
    
    // 清除已废弃的数据
    const currentUnits = localStorage.getItem('shihe_business_units');
    if (currentUnits) {
      let units = JSON.parse(currentUnits);
      const toRemove = ['经营单元-001', '经营单元-002', '统筹池'];
      if (units.some((t: string) => toRemove.includes(t))) {
        units = units.filter((t: string) => !toRemove.includes(t));
        localStorage.setItem('shihe_business_units', JSON.stringify(units));
        setBusinessUnits(units);
      }
    }
    
    return () => {};
  }, [currentUser]);

  const [miningResources, setMiningResources] = useState<MiningResource[]>([]);
  const [logs, setLogs] = useState<ValueCreationLog[]>([]);
  const [transactions, setTransactions] = useState<InternalTransaction[]>([]);
  const [acceptanceRecords, setAcceptanceRecords] = useState<AcceptanceRecord[]>([]);
  const [circuitBreakers, setCircuitBreakers] = useState<CircuitBreaker[]>(() => {
    const saved = localStorage.getItem('shihe_circuit_breakers');
    return saved ? JSON.parse(saved) : [];
  });
  const [clientIp, setClientIp] = useState<string>('127.0.0.1');
  const [systemLogs, setSystemLogs] = useState<SystemOperationLog[]>(() => {
    const saved = localStorage.getItem('shihe_system_logs');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((l: any) => ({
            ...l,
            ip: l.ip || '127.0.0.1'
          }));
        }
      } catch (e) {
        console.error('Failed to parse cached system logs:', e);
      }
    }
    return [];
  });
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());

  // Real-time clock ticker according to client computer system time
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch client IP on mount
  useEffect(() => {
    const fetchIp = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/client-ip`);
        if (res.ok) {
          const data = await res.json();
          if (data.ip) {
            setClientIp(data.ip);
          }
        }
      } catch (err) {
        console.warn('Could not fetch client IP:', err);
      }
    };
    fetchIp();
  }, []);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('kanban');
  const [processingLogIds, setProcessingLogIds] = useState<Set<string>>(new Set());
  const [quotaSnapshots, setQuotaSnapshots] = useState<Record<string, QuotaSnapshot>>({});
  const [filterMonth, setFilterMonth] = useState<string>(() => getLocalMonthString());

  // 模拟服务端密码存储 (仅在内存中，不持久化)
  const [mockPasswords, setMockPasswords] = useState<Record<string, string>>({
    'admin': '123',
    '1635': '123',
    'sh888': '123',
    'npcxie': '123'
  });

  const addSystemLog = (action: string, details: string, user: User | null = currentUser, customIp?: string) => {
    const newLog: SystemOperationLog = {
      id: `SYS${Date.now().toString().slice(-6)}`,
      userId: user?.id || 'system',
      userName: user?.name || '系统',
      action,
      details,
      timestamp: Date.now(),
      ip: customIp || clientIp || '127.0.0.1'
    };
    setSystemLogs(prev => [newLog, ...prev].slice(0, 500)); // Keep last 500 logs
  };

  const persistWorkspaceWithOverrides = React.useCallback(async (overrides?: {
    transactions?: InternalTransaction[];
    miningResources?: MiningResource[];
    logs?: ValueCreationLog[];
    users?: User[];
    circuitBreakers?: CircuitBreaker[];
    meetingSamples?: MeetingSample[];
  }) => {
    if (!currentUser) return;
    const nextUsers = overrides?.users ?? managedUsers;
    const nextLogs = overrides?.logs ?? logs;
    const nextTxs = overrides?.transactions ?? transactions;
    const nextRes = overrides?.miningResources ?? miningResources;
    const nextCBs = overrides?.circuitBreakers ?? circuitBreakers;
    const nextSamples = overrides?.meetingSamples ?? meetingSamples;

    const dtcbLogs = nextLogs.filter(l => l.confirmationType === '手动确权');
    const jzczLogs = nextLogs.filter(l => l.confirmationType !== '手动确权');
    const snapshots = buildValueEfficiencySnapshots(nextUsers, nextLogs, nextRes, filterMonth);
    const jzfpSnapshots = buildJzfpSnapshot(nextUsers, nextLogs, filterMonth);

    try {
      await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/workspace/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          users: nextUsers,
          dtcb: dtcbLogs,
          logs: jzczLogs,
          transactions: nextTxs,
          miningResources: nextRes,
          valueEfficiencySnapshots: snapshots,
          acceptanceRecords,
          jzfp: jzfpSnapshots,
          circuitBreakers: nextCBs,
          rdq: nextCBs,
          meetingSamples: nextSamples
        })
      });
    } catch (err) {
      console.error('Data sync error:', err);
    }
  }, [currentUser, managedUsers, logs, transactions, miningResources, circuitBreakers, meetingSamples, filterMonth, acceptanceRecords]);

  const persistWorkspaceNow = React.useCallback(async () => {
    await persistWorkspaceWithOverrides();
  }, [persistWorkspaceWithOverrides]);

  const calculateResourceImpact = (res: MiningResource, log: ValueCreationLog, oldStatus: AuditStatus | null, newStatus: AuditStatus): MiningResource => {
    // 产能相关计算全部从浏览器移除，直接返回原对象
    return res;
  };

  /**
   * 自动联动确权函数（过渡/仅本地嵌入式兜底使用；远程模式禁用此函数修改状态，写库以服务端 applyTimberLinkage 为准）
   * 过滤口径严格与服务端一致：产值 (RefineCategory.Value) + 待确权 (AuditStatus.Pending) + confirmationType === '联动确权'
   */
  const performTimberLinkage = React.useCallback((currentLogs: ValueCreationLog[], currentResources: MiningResource[]): { updatedLogs: ValueCreationLog[], updatedResources: MiningResource[] } => {
    let nextLogs = [...currentLogs];
    let nextResources = [...currentResources];
    let logsChanged = false;
    let resourcesChanged = false;

    // 1. Pre-group logs by miningId for fast lookup
    const logsByMiningId = new Map<string, { index: number, log: ValueCreationLog }[]>();
    nextLogs.forEach((log, index) => {
      if (!logsByMiningId.has(log.miningId)) {
        logsByMiningId.set(log.miningId, []);
      }
      logsByMiningId.get(log.miningId)!.push({ index, log });
    });

    // 2. Linkage logic (Pending Value -> Confirmed Value)
    nextResources = nextResources.map(res => {
      const capacityRemaining = res.revenueCapacity - res.confirmedValue;
      const revenueBasedLimit = Math.max(0, Number((res.confirmedRevenue - res.confirmedValue).toFixed(2)));
      const actualAmountToConvert = capacityRemaining <= 0 ? 0 : Math.min(res.pendingValue, revenueBasedLimit);
      
      if (actualAmountToConvert > 0) {
        let remainingToConvert = actualAmountToConvert;
        let actualConvertedAmount = 0;

        const miningLogs = logsByMiningId.get(res.id) || [];
        // 过滤口径与后端严格一致：产值 + 待确权 + confirmationType === '联动确权'
        const pendingLogs = miningLogs
          .filter(item => 
            item.log.category === RefineCategory.Value && 
            item.log.status === AuditStatus.Pending &&
            item.log.confirmationType === '联动确权'
          )
          .sort((a, b) => (a.log.timestamp || 0) - (b.log.timestamp || 0));

        const newLogsToAdd: ValueCreationLog[] = [];

        for (const item of pendingLogs) {
          if (remainingToConvert <= 0.01) break;

          const logAmount = item.log.amount || item.log.dynamicCost || 0;
          if (logAmount <= 0) continue;

          if (logAmount <= remainingToConvert + 0.01) {
            nextLogs[item.index] = { ...item.log, status: AuditStatus.Confirmed, confirmedAt: Date.now(), confirmationType: '联动确权' };
            remainingToConvert -= logAmount;
            actualConvertedAmount += logAmount;
            logsChanged = true;
          } else {
            const ratio = remainingToConvert / logAmount;
            const confirmedLog: ValueCreationLog = {
              ...item.log,
              id: `M${(Date.now() % 100000000).toString().padStart(8, '0')}`,
              amount: Number(remainingToConvert.toFixed(2)),
              dynamicCost: Number((item.log.dynamicCost * ratio).toFixed(2)),
              cClassCost: item.log.cClassCost ? Number((item.log.cClassCost * ratio).toFixed(2)) : undefined,
              netValue: Number((item.log.netValue * ratio).toFixed(2)),
              status: AuditStatus.Confirmed,
              confirmedAt: Date.now(),
              confirmationType: '联动确权'
            };
      
            nextLogs[item.index] = {
              ...item.log,
              amount: Number((logAmount - remainingToConvert).toFixed(2)),
              dynamicCost: Number((item.log.dynamicCost * (1 - ratio)).toFixed(2)),
              cClassCost: item.log.cClassCost ? Number((item.log.cClassCost * (1 - ratio)).toFixed(2)) : undefined,
              netValue: Number((item.log.netValue * (1 - ratio)).toFixed(2)),
            };

            newLogsToAdd.push(confirmedLog);
            actualConvertedAmount += remainingToConvert;
            remainingToConvert = 0;
            logsChanged = true;
          }
        }

        if (newLogsToAdd.length > 0) {
          nextLogs.push(...newLogsToAdd);
        }

        if (actualConvertedAmount > 0) {
          resourcesChanged = true;
          const updatedRes = { ...res };
          updatedRes.pendingValue = Math.max(0, Number((updatedRes.pendingValue - actualConvertedAmount).toFixed(2)));
          updatedRes.confirmedValue = Number((updatedRes.confirmedValue + actualConvertedAmount).toFixed(2));
          updatedRes.unconfirmedValue = Math.max(0, Number((updatedRes.valueCapacity - updatedRes.confirmedValue - updatedRes.pendingValue).toFixed(2)));
          return updatedRes;
        }
      }
      return res;
    });

    // 产能相关计算全部从浏览器移除，前端不再写矿山汇总
    return { 
      updatedLogs: logsChanged ? nextLogs : currentLogs, 
      updatedResources: currentResources // 不再写矿山汇总
    };
  }, []);

  // 辅助函数：根据类型和类别获取因子 (与 ValueCreation 逻辑对齐)
  const getLogFactor = (type: RefineType, category: RefineCategory) => {
    // 简化版：由于 App.tsx 难以获取所有用户的具体职级，我们使用标准因子
    // 在实际业务中，这应该由 ValueCreation 计算并存入日志，或者这里动态匹配
    if (category === RefineCategory.Revenue) {
      if (type === RefineType.Bidding) return 0.20;
      if (type === RefineType.SafetyEval) return 0.30;
      return 0.27;
    } else {
      if (type === RefineType.Bidding) return 0.55;
      if (type === RefineType.SafetyEval) return 0.40;
      return 0.48; // Default Enterprise
    }
  };

  const processLogsSubmission = React.useCallback((newLogs: ValueCreationLog[]) => {
    setLogs(prevLogs => {
      let nextLogs = [...prevLogs, ...newLogs];
      const affectedMiningIds = Array.from(new Set(newLogs.map(l => l.miningId)));

      affectedMiningIds.forEach(miningId => {
        const dtcbLogs = nextLogs.filter(l => l.confirmationType === '手动确权');
        const jzczLogs = nextLogs.filter(l => l.confirmationType !== '手动确权');
        const reHedgedJzcz = applyConsumptionHedgeToLogs(miningId, jzczLogs, dtcbLogs, miningResources, managedUsers);
        const reHedgedMap = new Map(reHedgedJzcz.map(l => [l.id, l]));
        nextLogs = nextLogs.map(l => reHedgedMap.has(l.id) ? reHedgedMap.get(l.id)! : l);
      });

      return nextLogs;
    });
  }, [miningResources, managedUsers]);

  const processAudit = React.useCallback(async (logId: string, status: AuditStatus) => {
    const oldLog = logs.find(l => l.id === logId);
    if (!oldLog) return;

    // 1. 按钮禁用/连点保护
    setProcessingLogIds(prev => new Set(prev).add(logId));

    try {
      // 2. 调用后端接口确权（包含服务端 applyTimberLinkage 返回的 linkedLogs 及 recalibratedLogs）
      const { log, resource, snapshot, linkedLogs = [], recalibratedLogs = [] } = await auditLog(logId, status);

      // 3. 更新界面数据 (确权响应驱动，服务端权威合并)
      setLogs(prevLogs => {
        let updatedLogs = prevLogs.map(l => l.id === logId ? log : l);

        // 合并服务端联动确权产出的关联日志
        if (linkedLogs && linkedLogs.length > 0) {
          const linkedMap = new Map(linkedLogs.map(l => [l.id, l]));
          updatedLogs = updatedLogs.map(l => linkedMap.has(l.id) ? linkedMap.get(l.id)! : l);
          const existingIds = new Set(updatedLogs.map(l => l.id));
          for (const ll of linkedLogs) {
            if (!existingIds.has(ll.id)) {
              updatedLogs.push(ll);
            }
          }
        }

        // 合并服务端重算产出的对冲日志
        if (recalibratedLogs && recalibratedLogs.length > 0) {
          const recalMap = new Map(recalibratedLogs.map(l => [l.id, l]));
          updatedLogs = updatedLogs.map(l => recalMap.has(l.id) ? recalMap.get(l.id)! : l);
        } else {
          // 前端对冲补算: 使用 applyConsumptionHedgeToLogs 传入完整的 jzcz 和 dtcb
          const currentResources = [...miningResources.map(r => r.id === resource.id ? resource : r)];
          const dtcbLogs = updatedLogs.filter(l => l.confirmationType === '手动确权');
          const jzczLogs = updatedLogs.filter(l => l.confirmationType !== '手动确权');
          const reHedgedJzcz = applyConsumptionHedgeToLogs(
            log.miningId, 
            jzczLogs, 
            dtcbLogs, 
            currentResources, 
            managedUsers
          );
          const reHedgedMap = new Map(reHedgedJzcz.map(l => [l.id, l]));
          updatedLogs = updatedLogs.map(l => reHedgedMap.has(l.id) ? reHedgedMap.get(l.id)! : l);
        }

        return updatedLogs;
      });
      setMiningResources(prevResources => prevResources.map(r => r.id === resource.id ? resource : r));
      setQuotaSnapshots(prev => ({ ...prev, [resource.id]: snapshot }));

      addSystemLog('价值确权', `将流水 ${logId} 的状态更新为 ${status} (后端执行${linkedLogs && linkedLogs.length > 0 ? `，联动确权 ${linkedLogs.length} 条记录` : ''})`);
      toast.success('确权成功');
    } catch (err: any) {
      console.error('Audit failed:', err);
      if (err.status === 403) {
        toast.error('操作禁止：矿山已归档');
      } else if (err.status === 409) {
        toast.error('状态冲突或容量余额不足');
      } else {
        toast.error(err.message || '确权操作失败');
      }
    } finally {
      // 4. 清除正在处理的标记
      setProcessingLogIds(prev => {
        const next = new Set(prev);
        next.delete(logId);
        return next;
      });
    }
  }, [logs, miningResources, managedUsers, addSystemLog]);

  const onSystemAdjustment = React.useCallback((log: ValueCreationLog, details: string) => {
    processLogsSubmission([log]);
    addSystemLog('系统调节', details);
  }, [processLogsSubmission]);

  const onLogSubmit = React.useCallback((newLogs: ValueCreationLog | ValueCreationLog[]) => {
    const logsToAdd = Array.isArray(newLogs) ? newLogs : [newLogs];
    processLogsSubmission(logsToAdd);
    logsToAdd.forEach(log => {
      addSystemLog('产出申报', `提交了 ${log.amount} 积分的 ${log.category} 产出申报`);
    });
  }, [processLogsSubmission]);

  const onConsumptionSubmit = React.useCallback((newLog: ValueCreationLog | ValueCreationLog[]) => {
    const logsArray = Array.isArray(newLog) ? newLog : [newLog];
    processLogsSubmission(logsArray);
    logsArray.forEach(log => {
      const isHedge = log.status === AuditStatus.Confirmed && log.costCategory === 'C';
      addSystemLog('成本消耗', `提交了 ${log.dynamicCost} 积分 of ${log.costCategory} 成本消耗${isHedge ? ' (并触发动态对冲)' : ''}`);
    });
  }, [processLogsSubmission]);

  const onSubmitTransaction = React.useCallback((txOrTxs: InternalTransaction | InternalTransaction[], updatedResources?: MiningResource[]) => {
    const txList = Array.isArray(txOrTxs) ? txOrTxs : [txOrTxs];
    if (txList.length === 0) return;

    let nextTxs: InternalTransaction[] = [];
    setTransactions(prev => {
      let current = [...prev];
      for (const tx of txList) {
        const index = current.findIndex(t => t.id === tx.id);
        if (index >= 0) {
          current[index] = tx;
        } else {
          current.push(tx);
        }
      }
      nextTxs = current;
      return nextTxs;
    });

    const nextRes = updatedResources || miningResources;
    if (updatedResources) {
      setMiningResources(updatedResources);
    }
    persistWorkspaceWithOverrides({ transactions: nextTxs, miningResources: nextRes });
    for (const tx of txList) {
      addSystemLog('内部交易', `发起了/修改了 ${tx.amount} 额度的 ${tx.type} 交易 (${tx.id})`);
    }
  }, [miningResources, addSystemLog, persistWorkspaceWithOverrides]);

  const onAuditTransaction = React.useCallback((txIdOrList: string | string[], status: TransactionStatus, updatedResource?: MiningResource | MiningResource[]) => {
    const idList = Array.isArray(txIdOrList) ? txIdOrList : [txIdOrList];
    let nextTxs: InternalTransaction[] = [];
    setTransactions(prev => {
      nextTxs = prev.map(t => idList.includes(t.id) ? { ...t, status } : t);
      return nextTxs;
    });
    let nextRes = miningResources;
    if (updatedResource) {
      const resList = Array.isArray(updatedResource) ? updatedResource : [updatedResource];
      nextRes = miningResources.map(r => {
        const found = resList.find(item => item.id === r.id);
        return found || r;
      });
      setMiningResources(nextRes);
    }
    persistWorkspaceWithOverrides({ transactions: nextTxs, miningResources: nextRes });
    idList.forEach(id => addSystemLog('交易审核', `将交易 ${id} 的状态更新为 ${status}`));
  }, [miningResources, addSystemLog, persistWorkspaceWithOverrides]);

  const onAddCircuitBreaker = React.useCallback((cb: CircuitBreaker) => {
    setCircuitBreakers(prev => {
      const exists = prev.some(item => item.id === cb.id);
      const next = exists ? prev.map(item => item.id === cb.id ? cb : item) : [...prev, cb];
      localStorage.setItem('shihe_circuit_breakers', JSON.stringify(next));
      persistWorkspaceWithOverrides({ circuitBreakers: next });
      return next;
    });
    addSystemLog('熔断触发', `对 ${cb.targetName} 触发了熔断，原因：${cb.reason}`);
  }, [addSystemLog, persistWorkspaceWithOverrides]);

  const onRecoverCircuitBreaker = React.useCallback((id: string) => {
    setCircuitBreakers(prev => {
      const next = prev.map(cb => cb.id === id ? { ...cb, status: 'recovered' as const } : cb);
      localStorage.setItem('shihe_circuit_breakers', JSON.stringify(next));
      persistWorkspaceWithOverrides({ circuitBreakers: next });
      const cbItem = prev.find(c => c.id === id);
      if (cbItem && cbItem.status === 'active') {
        addSystemLog('熔断恢复', `恢复了 ${cbItem.targetName} 的熔断`);
      }
      return next;
    });
  }, [addSystemLog, persistWorkspaceWithOverrides]);

  const onAddResource = React.useCallback((res: MiningResource) => {
    setMiningResources(prev => {
      const next = [...prev, res];
      persistWorkspaceWithOverrides({ miningResources: next });
      return next;
    });
    addSystemLog('资源管理', `新增了矿山资源 ${res.id}`);
  }, []);

  const onUpdateResource = React.useCallback((res: MiningResource) => {
    setMiningResources(prev => {
      const next = prev.map(r => r.id === res.id ? res : r);
      persistWorkspaceWithOverrides({ miningResources: next });
      return next;
    });
    addSystemLog('资源管理', `更新了矿山资源 ${res.id}`);
  }, []);

  const onDeleteResource = React.useCallback((id: string) => {
    setMiningResources(prev => prev.filter(r => r.id !== id));
    addSystemLog('资源管理', `删除了矿山资源 ${id}`);
  }, []);

  const onDeleteLog = React.useCallback((logId: string) => {
    const nowStr = new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, deleted: true, deletedAt: nowStr } : l));
    toast.success("审计记录 #" + logId + " 已删除");
    addSystemLog("删除审计记录", "删除编号 #" + logId + "，时间: " + nowStr);
  }, [addSystemLog]);

  const onUpdateUsers = React.useCallback((newUsers: User[]) => {
    setManagedUsers(newUsers);
    // 如果当前登录用户在更新列表中，同步更新当前用户信息（勿用空 permissions 盖掉当前会话）
    if (currentUser) {
      const updatedSelf = newUsers.find(u => u.id === currentUser.id);
      if (updatedSelf) {
        setCurrentUser(prev => {
          if (!prev) return updatedSelf;
          let finalPermissions = updatedSelf.permissions;
          if ((!finalPermissions || finalPermissions.length === 0) && (prev.permissions && prev.permissions.length > 0)) {
            finalPermissions = prev.permissions;
          }
          return {
            ...updatedSelf,
            permissions: finalPermissions
          };
        });
      }
    }
    addSystemLog('用户管理', `同步了 ${newUsers.length} 位用户信息`);
  }, [currentUser, addSystemLog]);

  const onUpdatePassword = React.useCallback(async (userId: string, newPassword: string, oldPassword?: string): Promise<boolean> => {
    // 模拟服务端鉴权与更新
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 如果提供了旧密码，则进行校验 (用户自改)
    if (oldPassword !== undefined) {
      if (mockPasswords[userId] !== oldPassword) {
        return false;
      }
    }

    // 模拟更新成功
    setMockPasswords(prev => ({ ...prev, [userId]: newPassword }));
    console.log(`[API] Updating password for user ${userId} to: ${'*'.repeat(newPassword.length)}`);
    addSystemLog('安全设置', `用户 ${userId} 修改了登录密码`);
    return true;
  }, [mockPasswords, addSystemLog]);

  const onAuthenticate = React.useCallback(async (userId: string, password: string): Promise<User | null> => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password })
      });
      
      const data = await res.json();
      if (res.ok) {
        if (data.clientIp) {
          setClientIp(data.clientIp);
        }
        addSystemLog('用户登录', `用户 ${data.user.name} (${data.user.userId || data.user.id}) 成功登录系统`, data.user, data.clientIp);
        return data.user;
      } else {
        if (res.status === 403) {
          // 账号已离职锁定
          return Promise.reject(new Error(data.error));
        }
        return null;
      }
    } catch (err) {
      console.error('登录异常:', err);
      return null;
    }
  }, [addSystemLog]);

  const onClearTestData = React.useCallback(() => {
    setLogs([]);
    setMiningResources(INITIAL_MINING_RESOURCES);
    setManagedUsers(INITIAL_USERS);
    setTransactions([]);
    setSystemLogs([]);
    localStorage.setItem('cleared_test_data_v2', 'true');
    addSystemLog('系统维护', '清空了所有测试数据并重置资源状态');
  }, []);

  useEffect(() => {
    // 远程模式（VITE_USE_LOCAL_AUTH !== 'true'）：禁止自动改 logs / miningResources
    // 仅本地嵌入式（VITE_USE_LOCAL_AUTH === 'true'）可保留前端联动兜底；远程不得本地改 status/confirmationType
    if (import.meta.env.VITE_USE_LOCAL_AUTH === 'true') {
      const { updatedLogs, updatedResources } = performTimberLinkage(logs, miningResources);
      
      if (updatedLogs !== logs) {
        setLogs(updatedLogs);
      }
      
      if (updatedResources !== miningResources) {
        setMiningResources(updatedResources);
      }
    }
  }, [logs, miningResources, performTimberLinkage]);

  // 1. 每日自动入库校验：不自动把满 90 天记录批量入库 (依据最新要求已停用前端自动入库)

  // 2. 数据处理与初始加载
  useEffect(() => {
    if (!localStorage.getItem('cleared_test_data_v2')) {
      onClearTestData();
      return;
    }

    const savedResources = localStorage.getItem('shihe_resources');
    if (savedResources) setMiningResources(JSON.parse(savedResources));

    const savedTransactions = localStorage.getItem('shihe_transactions');
    if (savedTransactions) setTransactions(JSON.parse(savedTransactions));

    const savedSystemLogs = localStorage.getItem('shihe_system_logs');
    if (savedSystemLogs) setSystemLogs(JSON.parse(savedSystemLogs));
  }, [onClearTestData]);

  // 3. 数据持久化与后端同步 (去抖动)
  useEffect(() => {
    const syncData = async () => {
      // 门禁：未登录或未完成首次加载，不允许同步写
      if (!currentUser || !workspaceLoaded) return;

      try {
        const dtcbLogs = logs.filter(l => l.confirmationType === '手动确权');
        const jzczLogs = logs.filter(l => l.confirmationType !== '手动确权');
        const snapshots = buildValueEfficiencySnapshots(managedUsers, logs, miningResources, filterMonth);
        const jzfpSnapshots = buildJzfpSnapshot(managedUsers, logs, filterMonth);
        
        const response = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/workspace/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            users: managedUsers,
            dtcb: dtcbLogs,
            logs: jzczLogs,
            transactions,
            miningResources,
            valueEfficiencySnapshots: snapshots,
            acceptanceRecords,
            jzfp: jzfpSnapshots,
            meetingSamples
          })
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      } catch (err) {
        console.error('数据同步失败:', err);
      }
    };

    // 只有在加载完成后才执行同步
    if (currentUser && workspaceLoaded) {
      const timer = setTimeout(syncData, 2000); // 修改为 2 秒，优化同步响应速度
      
      localStorage.setItem('shihe_managed_users', JSON.stringify(managedUsers));
      localStorage.setItem('shihe_logs', JSON.stringify(logs));
      localStorage.setItem('shihe_transactions', JSON.stringify(transactions));
      localStorage.setItem('shihe_business_units', JSON.stringify(businessUnits));

      return () => clearTimeout(timer);
    }
  }, [managedUsers, logs, transactions, businessUnits, miningResources, filterMonth, currentUser, workspaceLoaded]);

  useEffect(() => {
    localStorage.setItem('shihe_resources', JSON.stringify(miningResources));
    localStorage.setItem('shihe_circuit_breakers', JSON.stringify(circuitBreakers));
    localStorage.setItem('shihe_user', JSON.stringify(currentUser));
    localStorage.setItem('shihe_system_logs', JSON.stringify(systemLogs));
  }, [miningResources, circuitBreakers, currentUser, systemLogs]);

  // 自动恢复过期的熔断
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setCircuitBreakers(prev => {
        let changed = false;
        const next = prev.map(cb => {
          if (cb.status === 'active' && cb.expiresAt <= now) {
            changed = true;
            return { ...cb, status: 'recovered' as const };
          }
          return cb;
        });
        if (changed) {
          addSystemLog('系统维护', '自动恢复了过期的熔断保护记录');
        }
        return changed ? next : prev;
      });
    }, 30000); // 每 30 秒检查一次
    return () => clearInterval(interval);
  }, []);

  const handleSwitchUser = (user: User) => {
    addSystemLog('切换智能体', `从 ${currentUser.name} 切换到 ${user.name}`, user);
    setCurrentUser(user);
    
    const isOperator = user.role === Role.Operator;
    const isRevenueCollector = user.role === Role.RevenueCollector || user.category?.includes('款专');
    const isValueCollector = user.role === Role.ValueCollector || user.category?.includes('产专');
    const isNpcxie = user.role === Role.npcxie;
    const isAdmin = user.role === Role.Admin;
    const isReservoirManager = user.role === Role.Admin || user.role === Role.ReservoirManager;
    const isCenter = user.role === Role.Rank;

    const isAllowed = checkUserPermission(user, activeTab);
    if (!isAllowed) {
      setActiveTab('kanban');
    }
  };

  const handleLogout = () => {
    if (currentUser) {
      addSystemLog('退出登录', `用户 ${currentUser.name} 退出系统登录`, currentUser);
    }
    setCurrentUser(null);
    setWorkspaceLoaded(false);
    // 立即清理本地敏感状态，避免账号切换时数据残留
    setManagedUsers(INITIAL_USERS);
    setLogs([]);
    setTransactions([]);
    setMiningResources([]);
    setBusinessUnits(['RC', '经营单元-001']);
    setMeetingSamples([]);
    // 保持公共主数据，不清除 shihe_resources
    // 确保登出后切换账号干净，但公共静态资产数据仍可利用或由下一次会签自动重新初始化
    localStorage.removeItem('shihe_user');
    localStorage.removeItem('shihe_managed_users');
    localStorage.removeItem('shihe_logs');
    localStorage.removeItem('shihe_transactions');
    localStorage.removeItem('shihe_business_units');
    // 如果有其他持久化状态，也应在此清理
    localStorage.removeItem('shihe_circuit_breakers');
  };

  const isAdminOrNPC = currentUser?.role === Role.Admin || currentUser?.role === Role.npcxie;
  
  const filteredUsers = useMemo(() => {
    if (!currentUser) return [];
    if (isAdminOrNPC) return managedUsers;
    return managedUsers.filter(u => u.center === currentUser.center || u.role === Role.Admin || u.role === Role.npcxie);
  }, [managedUsers, currentUser, isAdminOrNPC]);

  const filteredResources = useMemo(() => {
    if (!currentUser) return [];
    if (isAdminOrNPC) return miningResources;
    return miningResources.filter(r => {
      const isAssigned = (assigned: string | undefined, center: string) => {
        if (!assigned) return false;
        return assigned.split(',').map(c => c.trim()).includes(center);
      };
      return isAssigned(r.assignedTo, currentUser.center) || 
             isAssigned(r.assignedToRevenue, currentUser.center) || 
             isAssigned(r.assignedToValue, currentUser.center);
    });
  }, [miningResources, currentUser, isAdminOrNPC]);

  const filteredLogs = useMemo(() => {
    if (!currentUser) return [];
    if (isAdminOrNPC) return logs;
    return logs.filter(l => {
      const resource = miningResources.find(r => r.id === l.miningId);
      if (!resource) return false;
      const isAssigned = (assigned: string | undefined, center: string) => {
        if (!assigned) return false;
        return assigned.split(',').map(c => c.trim()).includes(center);
      };
      return isAssigned(resource.assignedTo, currentUser.center) || 
             isAssigned(resource.assignedToRevenue, currentUser.center) || 
             isAssigned(resource.assignedToValue, currentUser.center);
    });
  }, [logs, miningResources, currentUser, isAdminOrNPC]);

  const auditLogs = useMemo(() => {
    if (!currentUser) return [];
    if (isAdminOrNPC) return logs;
    const centerUserIds = new Set(filteredUsers.map(u => u.id));
    
    return logs.filter(l => {
      // 1. 本经营单元人员提交/关联的算力与成本记录 (确保 DTCB 不被漏掉)
      if (l.recordedCollectorId && centerUserIds.has(l.recordedCollectorId)) return true;
      if (l.rankId && centerUserIds.has(l.rankId)) return true;
      
      // 2. 本经营单元关联的矿山资源记录 (JZCZ 产出)
      if (l.miningId) {
        const resource = miningResources.find(r => r.id === l.miningId);
        if (!resource) return false;
        const isAssigned = (assigned: string | undefined, center: string) => {
          if (!assigned) return false;
          return assigned.split(',').map(c => c.trim()).includes(center);
        };
        return isAssigned(resource.assignedTo, currentUser.center) || 
               isAssigned(resource.assignedToRevenue, currentUser.center) || 
               isAssigned(resource.assignedToValue, currentUser.center);
      }
      return false;
    });
  }, [logs, miningResources, filteredUsers, currentUser, isAdminOrNPC]);

  const filteredDtcbLogs = useMemo(() => {
    return filteredLogs.filter(l => l.confirmationType === '手动确权');
  }, [filteredLogs]);

  const filteredTransactions = useMemo(() => {
    if (!currentUser) return [];
    if (isAdminOrNPC) return transactions;
    const centerUserIds = new Set(filteredUsers.map(u => u.id));
    return transactions.filter(tx => 
      centerUserIds.has(tx.senderId) || centerUserIds.has(tx.receiverId)
    );
  }, [transactions, filteredUsers, currentUser, isAdminOrNPC]);

  const filteredCircuitBreakers = useMemo(() => {
    if (!currentUser) return [];
    if (isAdminOrNPC) return circuitBreakers;
    const centerUserIds = new Set(filteredUsers.map(u => u.id));
    const resourceIds = new Set(filteredResources.map(r => r.id));
    return circuitBreakers.filter(cb => 
      centerUserIds.has(cb.targetId) || resourceIds.has(cb.targetId) || (cb.targetName && currentUser.center && cb.targetName.includes(currentUser.center))
    );
  }, [circuitBreakers, filteredUsers, filteredResources, currentUser, isAdminOrNPC]);

  const onSaveMeetingSample = React.useCallback(async (sample: MeetingSample): Promise<boolean> => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/meeting-samples`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sample)
      });
      if (res.ok) {
        setMeetingSamples(prev => {
          const idx = prev.findIndex(s => s.id === sample.id);
          const next = idx !== -1 ? prev.map(s => s.id === sample.id ? sample : s) : [...prev, sample];
          persistWorkspaceWithOverrides({ meetingSamples: next });
          return next;
        });
        addSystemLog('会务留样', `生成并冻结了【${sample.label}】(${sample.periodKey}) 数据`);
        return true;
      }
      return false;
    } catch (err) {
      console.error('保存会务留样失败:', err);
      return false;
    }
  }, [addSystemLog, persistWorkspaceWithOverrides]);

  const tabProps = useMemo(() => {
    if (!currentUser) return {} as any;
    return {
      kanban: { 
        logs: filteredLogs, 
        resources: filteredResources, 
        users: filteredUsers, 
        currentUser, 
        transactions,
        onSystemAdjustment,
        onSwitchTab: setActiveTab,
        businessUnits: businessUnits,
        meetingSamples,
        onSaveMeetingSample
      },
      creation: { 
        user: currentUser, 
        resources: filteredResources, 
        logs: filteredLogs, 
        onLogSubmit, 
        onSwitchTab: setActiveTab,
        transactions,
        onAuditTransaction,
        onAddCircuitBreaker,
        quotaSnapshots,
        processingLogIds
      },
      consumption: { 
        user: currentUser, 
        users: filteredUsers, 
        resources: filteredResources, 
        logs: filteredLogs, 
        jzczLogs: filteredLogs.filter(l => l.confirmationType !== '手动确权'),
        dtcbLogs: filteredLogs.filter(l => l.confirmationType === '手动确权'),
        onLogSubmit: onConsumptionSubmit 
      },
      audit: { 
        user: currentUser, 
        logs: filteredLogs, 
        users: filteredUsers,
        resources: filteredResources,
        onAudit: processAudit,
        processingLogIds,
        onDeleteLog,
        onRefreshWorkspace: async () => {
          const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/workspace`);
          if (res.ok) {
            const data = await res.json();
            if (data.logs) setLogs(data.logs);
            if (data.managedUsers) setManagedUsers(data.managedUsers);
            if (data.transactions) setTransactions(data.transactions);
            if (data.miningResources) setMiningResources(data.miningResources);
            if (data.acceptanceRecords) setAcceptanceRecords(data.acceptanceRecords);
          }
        }
      },
      transactions: { 
        currentUser, 
        users: filteredUsers, 
        allUsers: managedUsers,
        resources: isAdminOrNPC ? miningResources : filteredResources, 
        allResources: miningResources,
        transactions: filteredTransactions, 
        allTransactions: transactions,
        logs: filteredLogs,
        onSubmitTransaction,
        onAuditTransaction,
        onUpdateResource,
        onLogSubmit,
        circuitBreakers: filteredCircuitBreakers,
        onAddCircuitBreaker,
        onRecoverCircuitBreaker,
        businessUnits: businessUnits,
        persistWorkspaceNow,
        persistWorkspaceWithOverrides
      },
      resources: { 
        user: currentUser, 
        resources: isAdminOrNPC ? miningResources : filteredResources,
        logs: isAdminOrNPC ? logs : filteredLogs,
        dtcbLogs: (isAdminOrNPC ? logs : filteredLogs).filter(l => l.confirmationType === '手动确权' || !!l.costCategory || !!(l as any).consumptionType),
        transactions: isAdminOrNPC ? transactions : filteredTransactions,
        managedUsers: isAdminOrNPC ? managedUsers : filteredUsers,
        onAddResource,
        onUpdateResource,
        onDeleteResource,
        businessUnits: businessUnits
      },
      reservoir: { 
        logs: filteredLogs,
        auditLogs: auditLogs,
        resources: isAdminOrNPC ? miningResources : filteredResources,
        users: isAdminOrNPC ? managedUsers : filteredUsers,
        transactions: isAdminOrNPC ? transactions : filteredTransactions,
        businessUnits,
        currentUser
      },
      evaluation: { 
        users: filteredUsers, 
        logs: auditLogs,
        auditLogs: auditLogs, 
        resources: filteredResources, 
        currentTime,
        onFilterMonthChange: setFilterMonth
      },
      distribution: { 
        logs: filteredLogs, 
        users: filteredUsers, 
        currentUser, 
        transactions, 
        resources: filteredResources, 
        onSubmitTransaction,
        acceptanceRecords,
        onAddAcceptanceRecord: (rec: AcceptanceRecord) => setAcceptanceRecords(prev => [...prev, rec])
      },
      account: { currentUser, logs: filteredLogs, transactions, resources: filteredResources, users: filteredUsers },
      personnel: { 
        user: currentUser,
        users: filteredUsers, 
        onUpdateUsers,
        onUpdatePassword,
        onClearTestData,
        businessUnits: businessUnits,
        onUpdateBusinessUnits: setBusinessUnits
      }
    };
  }, [filteredLogs, auditLogs, filteredResources, filteredUsers, managedUsers, businessUnits, transactions, currentUser, systemLogs, currentTime, 
       onSystemAdjustment, onLogSubmit, onConsumptionSubmit, processAudit, onSubmitTransaction, 
       onAuditTransaction, onAddResource, onUpdateResource, onDeleteResource, onUpdateUsers, onClearTestData,
       circuitBreakers, onAddCircuitBreaker, onRecoverCircuitBreaker]);

  const components = useMemo(() => {
    if (!currentUser) return {} as any;
    return {
      kanban: <Dashboard {...tabProps.kanban} />,
      creation: <ValueCreation {...tabProps.creation} />,
      consumption: <DynamicConsumption {...tabProps.consumption} />,
      audit: <Auditing {...tabProps.audit} />,
      transactions: <InternalTransactions {...tabProps.transactions} />,
      resources: <ResourceManagement {...tabProps.resources} />,
      reservoir: <Reservoir {...tabProps.reservoir} />,
      evaluation: <Evaluation {...tabProps.evaluation} />,
      distribution: <Distribution {...tabProps.distribution} />,
      account: <MyAccount {...tabProps.account} />,
      personnel: <PersonnelPool {...tabProps.personnel} />,
      instructions: <SystemInstructions />
    };
  }, [tabProps, currentUser]);

  const renderContent = () => {
    if (!currentUser) return null;
    return components[activeTab] || components.kanban;
  };

  const handleLoginSuccess = React.useCallback((loggedInUser: User) => {
    setCurrentUser(loggedInUser);
    const AUTO_ACCOUNT_CATEGORIES = ['经管员高款专', '经管员高产专', '经管员NPC', 'VP'];
    if (
      loggedInUser.mustChangePassword || 
      (loggedInUser.category && AUTO_ACCOUNT_CATEGORIES.includes(loggedInUser.category) && (loggedInUser.password === '66668888' || loggedInUser.isFirstLogin !== false))
    ) {
      setTimeout(() => {
        toast.info(`🔐 首次登录提示：您的职级 (${loggedInUser.category}) 账号使用初始默认密码 66668888，请及时修改密码！`, { duration: 8000 });
        setIsChangePasswordModalOpen(true);
      }, 500);
    }
  }, []);

  if (!currentUser) {
    return <Login onLogin={handleLoginSuccess} onAuthenticate={onAuthenticate} />;
  }

  return (
    <div className="flex h-screen bg-slate-900 text-white overflow-hidden font-sans relative">
      <Toaster position="top-center" richColors />
      
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}

      <div className={`fixed inset-y-0 left-0 z-[70] transform transition-transform duration-300 lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar 
          user={currentUser} 
          activeTab={activeTab} 
          setActiveTab={(tab) => {
            setActiveTab(tab);
            setIsMobileMenuOpen(false);
          }}
          onUpdateAvatar={(avatarUrl) => {
            const updatedUser = { ...currentUser, avatar: avatarUrl };
            setCurrentUser(updatedUser);
            setManagedUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
          }}
        />
      </div>

      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50 text-slate-900 relative">
        {/* 背景水印 */}
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden select-none">
          <div className="flex flex-wrap justify-around content-around p-10 opacity-[0.1]" style={{ gap: '250px', minHeight: '100%' }}>
            {Array.from({ length: 16 }).map((_, i) => (
              <div 
                key={i} 
                className="text-slate-900 font-black whitespace-nowrap transform -rotate-12 text-[68px] md:text-[108px]"
              >
                {currentUser.name} {currentTime.getFullYear()}/{currentTime.getMonth() + 1}/{currentTime.getDate()}
              </div>
            ))}
          </div>
        </div>

        <header className="h-16 border-b bg-white/80 backdrop-blur-md flex items-center justify-between px-4 md:px-8 sticky top-0 z-40 shadow-sm">
          <div className="flex items-center space-x-3 md:space-x-4">
             <button 
               onClick={() => setIsMobileMenuOpen(true)}
               className="p-2 hover:bg-slate-100 rounded-xl lg:hidden text-slate-600"
             >
               <span className="text-xl">☰</span>
             </button>
             <h2 className="font-black text-slate-800 tracking-tighter text-sm md:text-base truncate max-w-[200px] md:max-w-none flex items-center">
               <div className="flex-shrink-0 w-8 h-8 md:w-9 md:h-9 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center mr-3 shadow-md border border-white/20">
                 <span className="text-white font-black text-sm md:text-base tracking-tighter transform italic">CS</span>
               </div>
               城市守护者价值循环智能体
             </h2>
             <span className="hidden md:block h-4 w-px bg-slate-200"></span>
             <div className="hidden md:flex items-center space-x-2 font-bold text-slate-400">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="uppercase tracking-widest font-black text-[10px]">系统运行正常</span>
             </div>
          </div>
          
          <div className="flex items-center space-x-2 md:space-x-5">
            <SystemAnnouncement currentUser={currentUser} onSystemLog={(action, details) => addSystemLog(action, details)} />
            <span className="h-4 w-px bg-slate-200 hidden sm:inline"></span>
            <button 
              onClick={() => setIsChangePasswordModalOpen(true)}
              className="text-slate-500 hover:text-slate-900 font-black text-[10px] uppercase tracking-widest flex items-center"
            >
              <span className="mr-1.5">🔑</span>
              修改密码
            </button>
            <button 
              onClick={handleLogout}
              className="text-slate-500 hover:text-slate-900 font-black text-[10px] uppercase tracking-widest flex items-center"
            >
              <span className="mr-2">🚪</span>
              退出登录
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto custom-scrollbar relative z-10 flex flex-col justify-between">
          <div className="w-full p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 lg:space-y-8 flex-1">
            <ErrorBoundary>
              {renderContent()}
            </ErrorBoundary>
          </div>
          {/* 登录后：SiteFooter 挂在主内容区 overflow-auto 容器末尾，禁止与可滚区并列的 shrink-0 贴底条 */}
          <SiteFooter onOpenLegal={handleOpenLegal} className="border-t border-slate-200/60 bg-white/40 mt-8 pt-4 pb-8" />
        </div>
      </main>
      <ChangePasswordModal 
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
        onUpdate={(oldPassword, newPassword) => onUpdatePassword(currentUser.id, newPassword, oldPassword)}
      />
      <LegalOverlay
        isOpen={isLegalOpen}
        onClose={() => setIsLegalOpen(false)}
        defaultTab={legalTab}
      />
    </div>
  );
};

export default App;
