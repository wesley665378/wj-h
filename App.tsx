
import { safeSetItem, safeGetItem, safeRemoveItem } from './src/utils/safeLocalStorage';
import React, { useState, useEffect, useMemo } from 'react';
import { isAdminOrNpc, isGlobalReader, isSystemAdmin, parseCenterList } from './src/utils/accessControl';
import { filterUsersByCenter, filterResourcesByCenter, filterLogsByCenter, filterAuditLogsByCenter, filterTransactionsByCenter, isResourceAssignedToCenter, isCenterManagerUser } from './src/utils/centerScope';
import { isVirtualDeductionMiningId } from './src/utils/virtualDeduction';
import { TERM_FILTERED_LOGS, TERM_AUDIT_LOGS } from './src/constants/terminology';
import { useCityGuardianModal, CityGuardianModal } from './src/components/CityGuardianModal';
import { User, Role, MiningResource, ValueCreationLog, AuditStatus, RefineCategory, RefineType, InternalTransaction, TransactionStatus, SystemOperationLog, CircuitBreaker, ResourceStatus, QuotaSnapshot, AcceptanceRecord, MeetingSample, JydyUnit } from './types';
import { canonicalizeBusinessUnitLabel, resolveBusinessUnitName } from './src/utils/businessUnitName';
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
import { 
  fetchWorkspaceData, 
  syncWorkspace, 
  putAuditLog, 
  loginWithApi, 
  saveMeetingSampleApi,
  toastApiError,
  deleteMiningResource,
  updateResource,
  setAuthToken,
  clearAuthToken,
  fetchSessionUser,
  changePasswordApi,
  getAuthToken,
  fetchJydyList,
  syncJydyList
} from './src/api';
import { useSessionMeta } from './src/hooks/useSessionMeta';
import { useCircuitBreaker } from './src/hooks/useCircuitBreaker';
import { buildSyncPayload, buildAppSyncPayload } from './src/app/workspaceSync';
import { getLocalDateString, getLocalMonthString } from './src/utils/dateUtils';
import { roundMoney } from './src/utils/formatMoney';

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
    if (import.meta.env.VITE_USE_LOCAL_AUTH === 'true') {
      try {
        const saved = safeGetItem('shihe_user');
        return saved ? JSON.parse(saved) : null;
      } catch (e) {
        console.error('Failed to parse user from localStorage', e);
        return null;
      }
    }
    return null;
  });
  
  const [jydyUnits, setJydyUnits] = useState<JydyUnit[]>([]);

  const [managedUsers, setManagedUsers] = useState<User[]>(INITIAL_USERS);
  const [meetingSamples, setMeetingSamples] = useState<MeetingSample[]>([]);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [isLegalOpen, setIsLegalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<'agreement' | 'privacy'>('agreement');

  // Unified session sync hook (IP, time, operation logs, clear state)
  const { clientIp, currentTime, systemLogs, addSystemLog, clearSessionState } = useSessionMeta(currentUser);
  const { modalState, showAlert, showConfirm, closeModal } = useCityGuardianModal();

  const [syncRetryTrigger, setSyncRetryTrigger] = useState(0);
  const {
    isBroken: isSyncBroken,
    retryAfter: syncRetryAfter,
    recordFailure: recordSyncFailure,
    recordSuccess: recordSyncSuccess,
    failureCount: syncFailureCount
  } = useCircuitBreaker();

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
      setJydyUnits([]);
      setMeetingSamples([]);

      try {
        const [data, jydyData] = await Promise.all([
          fetchWorkspaceData(),
          fetchJydyList().catch(err => {
            console.error('Failed to fetch jydy list:', err);
            return [];
          })
        ]);

        if (jydyData && Array.isArray(jydyData)) {
          setJydyUnits(jydyData);
        }

        if (data) {
          // 原子化更新数据
          let fetchedUnits = jydyData.length > 0 ? jydyData.map(u => u.name) : [];
          if (data.managedUsers && Array.isArray(data.managedUsers)) {
            const backfilledUsers = data.managedUsers.map((u: any) => ({
              ...u,
              category: u.category === '统筹水库管理员' ? '水库管理员' : u.category,
              center: resolveBusinessUnitName(u.center, fetchedUnits) || u.center,
            }));
            setManagedUsers(backfilledUsers);
          }
          
          const rawLogs = [...(data.logs || []), ...(data.dtcb || [])];
          if (rawLogs.length > 0) {
            const backfilledLogs = rawLogs
              .filter((l: any) => l !== null && !l.deleted && l.deleted !== 1)
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
            if (import.meta.env.VITE_USE_LOCAL_AUTH === 'true') {
              try {
                safeSetItem('shihe_circuit_breakers', JSON.stringify(data.circuitBreakers));
              } catch (e) {
                console.warn(e);
              }
            }
          } else if (data.rdq && Array.isArray(data.rdq)) {
            setCircuitBreakers(data.rdq);
            if (import.meta.env.VITE_USE_LOCAL_AUTH === 'true') {
              try {
                safeSetItem('shihe_circuit_breakers', JSON.stringify(data.rdq));
              } catch (e) {
                console.warn(e);
              }
            }
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
        toastApiError(err, '工作区加载失败，当前可能为缓存数据');
        // GET workspace 失败后禁止自动 sync，因此保持 workspaceLoaded 为 false
        setWorkspaceLoaded(false);
      }
    };
    fetchWorkspace();
    
    // 清除已废弃的数据
    if (import.meta.env.VITE_USE_LOCAL_AUTH === 'true') {
      safeRemoveItem('shihe_business_units');
    }
    
    return () => {};
  }, [currentUser]);

  const [miningResources, setMiningResources] = useState<MiningResource[]>([]);
  const [logs, setLogs] = useState<ValueCreationLog[]>([]);
  const [transactions, setTransactions] = useState<InternalTransaction[]>([]);
  const [acceptanceRecords, setAcceptanceRecords] = useState<AcceptanceRecord[]>([]);
  const [circuitBreakers, setCircuitBreakers] = useState<CircuitBreaker[]>(() => {
    if (import.meta.env.VITE_USE_LOCAL_AUTH === 'true') {
      try {
        const saved = safeGetItem('shihe_circuit_breakers');
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('kanban');
  const [processingLogIds, setProcessingLogIds] = useState<Set<string>>(new Set());
  const [quotaSnapshots, setQuotaSnapshots] = useState<Record<string, QuotaSnapshot>>({});
  const [filterMonth, setFilterMonth] = useState<string>(() => getLocalMonthString());

  const lastSyncedFingerprintRef = React.useRef<string>('');
  const isAutoSyncPausedRef = React.useRef<boolean>(false);

  const setPauseAutoSync = React.useCallback((paused: boolean) => {
    isAutoSyncPausedRef.current = paused;
    (window as any).__PAUSE_AUTO_SYNC__ = paused;
  }, []);

  const getWorkspaceFingerprint = React.useCallback((overrides?: any) => {
    const currentUsers = overrides?.users ?? managedUsers;
    const currentLogs = overrides?.logs ?? logs;
    const currentTxs = overrides?.transactions ?? transactions;
    const currentRes = overrides?.miningResources ?? miningResources;
    const currentCBs = overrides?.circuitBreakers ?? circuitBreakers;
    const currentSamples = overrides?.meetingSamples ?? meetingSamples;
    const currentRecords = overrides?.acceptanceRecords ?? acceptanceRecords;

    return [
      currentUsers.length, currentUsers[currentUsers.length - 1]?.id, currentUsers[currentUsers.length - 1]?.category,
      currentLogs.length, currentLogs[currentLogs.length - 1]?.id, currentLogs[currentLogs.length - 1]?.status, currentLogs[currentLogs.length - 1]?.dynamicCost,
      currentTxs.length, currentTxs[currentTxs.length - 1]?.id, currentTxs[currentTxs.length - 1]?.status,
      currentRes.length, currentRes[currentRes.length - 1]?.id, currentRes[currentRes.length - 1]?.version,
      currentCBs.length, currentCBs[currentCBs.length - 1]?.id, currentCBs[currentCBs.length - 1]?.status,
      systemLogs.length,
      currentSamples.length,
      currentRecords.length,
      filterMonth
    ].join('|');
  }, [managedUsers, logs, transactions, miningResources, circuitBreakers, systemLogs, meetingSamples, acceptanceRecords, filterMonth]);

  const updateLastSyncedFingerprint = React.useCallback((overrides?: any) => {
    lastSyncedFingerprintRef.current = getWorkspaceFingerprint(overrides);
  }, [getWorkspaceFingerprint]);

  const persistWorkspaceWithOverrides = React.useCallback(async (overrides?: {
    transactions?: InternalTransaction[];
    miningResources?: MiningResource[];
    logs?: ValueCreationLog[];
    users?: User[];
    circuitBreakers?: CircuitBreaker[];
    meetingSamples?: MeetingSample[];
    acceptanceRecords?: AcceptanceRecord[];
    jydyUnits?: JydyUnit[];
    importBatchId?: string;
  }, options?: { silent?: boolean; successMessage?: string; loadingMessage?: string; toastId?: string | number }) => {
    if (!currentUser) return;
    if (!workspaceLoaded) {
      toast.error('工作区尚未加载完成，请稍后再试');
      return;
    }

    let toastId: string | number | undefined = options?.toastId;
    if (!options?.silent && !toastId) {
      toastId = toast.loading(options?.loadingMessage || '保存中…');
    }

    const payload = buildAppSyncPayload({
      managedUsers,
      logs,
      transactions,
      miningResources,
      circuitBreakers,
      systemLogs,
      meetingSamples,
      acceptanceRecords,
      filterMonth,
      currentUser,
      overrides,
      includePassword: overrides?.users ? overrides.users.some(u => typeof (u as any).password === 'string' && (u as any).password.length > 0) : false
    });

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('REQUEST_TIMEOUT_60S')), 60000);
      });

      const syncPromise = Promise.all([
        syncWorkspace(payload),
        overrides?.jydyUnits ? syncJydyList(overrides.jydyUnits) : Promise.resolve({ success: true }),
      ]);

      const results = await Promise.race([syncPromise, timeoutPromise]);
      const [syncRes] = results;
      if (syncRes && (syncRes as any).success === false) {
        throw new Error((syncRes as any).error || '数据同步失败');
      }

      updateLastSyncedFingerprint(overrides);

      if (toastId) {
        toast.success(options?.successMessage || '已落库', { id: toastId });
      } else if (!options?.silent) {
        toast.success(options?.successMessage || '已落库');
      }
    } catch (err: any) {
      console.error('Data sync error:', err);
      const is60sTimeout = err?.message === 'REQUEST_TIMEOUT_60S';
      const friendlyMsg = is60sTimeout
        ? '请求超时（60秒）。后端可能仍在处理或已完成落库，请稍后刷新页面核对处理进度，切勿重复提交！'
        : (err.message || '工作区数据同步失败');

      if (toastId) {
        toast.error(friendlyMsg, { id: toastId });
      } else {
        toastApiError(err, friendlyMsg);
      }
      throw err;
    }
  }, [currentUser, workspaceLoaded, managedUsers, logs, transactions, miningResources, circuitBreakers, meetingSamples, filterMonth, acceptanceRecords, systemLogs, updateLastSyncedFingerprint]);

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
      const revenueBasedLimit = Math.max(0, roundMoney(res.confirmedRevenue - res.confirmedValue));
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
              amount: roundMoney(remainingToConvert),
              dynamicCost: roundMoney(item.log.dynamicCost * ratio),
              cClassCost: item.log.cClassCost ? roundMoney(item.log.cClassCost * ratio) : undefined,
              netValue: roundMoney(item.log.netValue * ratio),
              status: AuditStatus.Confirmed,
              confirmedAt: Date.now(),
              confirmationType: '联动确权'
            };
      
            nextLogs[item.index] = {
              ...item.log,
              amount: roundMoney(logAmount - remainingToConvert),
              dynamicCost: roundMoney(item.log.dynamicCost * (1 - ratio)),
              cClassCost: item.log.cClassCost ? roundMoney(item.log.cClassCost * (1 - ratio)) : undefined,
              netValue: roundMoney(item.log.netValue * (1 - ratio)),
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
          updatedRes.pendingValue = Math.max(0, roundMoney(updatedRes.pendingValue - actualConvertedAmount));
          updatedRes.confirmedValue = roundMoney(updatedRes.confirmedValue + actualConvertedAmount);
          updatedRes.unconfirmedValue = Math.max(0, roundMoney(updatedRes.valueCapacity - updatedRes.confirmedValue - updatedRes.pendingValue));
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

  const processAudit = React.useCallback(async (
    logId: string,
    status: AuditStatus,
    verifiedAmount?: number,
    auditNotes?: string,
  ) => {
    const oldLog = logs.find(l => l && l.id === logId);
    if (!oldLog) return;

    // 1. 按钮禁用/连点保护
    setProcessingLogIds(prev => new Set(prev).add(logId));

    try {
      // 2. 调用统一接口层确权
      const extras = verifiedAmount != null || auditNotes ? { verifiedAmount, auditNotes } : undefined;
      const res = await putAuditLog(logId, status, extras);
      if (!res) {
        throw new Error('确权服务未返回有效数据');
      }
      const { log: serverLog, resource, snapshot, linkedLogs = [], recalibratedLogs = [] } = res;
      const targetLog = serverLog ? { ...oldLog, ...serverLog } : { ...oldLog, status, confirmedAt: Date.now() };

      // 3. 更新界面数据 (确权响应驱动，服务端权威合并)
      setLogs(prevLogs => {
        let updatedLogs = prevLogs.map(l => (l && l.id === logId) ? targetLog : l).filter(Boolean);

        // 合并服务端联动确权产出的关联日志
        if (linkedLogs && Array.isArray(linkedLogs) && linkedLogs.length > 0) {
          const validLinked = linkedLogs.filter(Boolean);
          const linkedMap = new Map(validLinked.map(l => [l.id, l]));
          updatedLogs = updatedLogs.map(l => (l && linkedMap.has(l.id)) ? { ...l, ...linkedMap.get(l.id)! } : l);
          const existingIds = new Set(updatedLogs.map(l => l.id));
          for (const ll of validLinked) {
            if (ll && ll.id && !existingIds.has(ll.id)) {
              updatedLogs.push(ll);
              existingIds.add(ll.id);
            }
          }
        }

        // 合并服务端重算产出的对冲日志
        if (recalibratedLogs && Array.isArray(recalibratedLogs) && recalibratedLogs.length > 0) {
          const validRecal = recalibratedLogs.filter(Boolean);
          const recalMap = new Map(validRecal.map(l => [l.id, l]));
          updatedLogs = updatedLogs.map(l => (l && recalMap.has(l.id)) ? { ...l, ...recalMap.get(l.id)! } : l);
        } else if (targetLog && targetLog.miningId && !isVirtualDeductionMiningId(targetLog.miningId) && targetLog.miningId !== '统筹池') {
          // 前端对冲补算: 使用 applyConsumptionHedgeToLogs 传入完整的 jzcz 和 dtcb
          const currentResources = [...miningResources.map(r => (resource && r && r.id === resource.id) ? resource : r)];
          const dtcbLogs = updatedLogs.filter(l => l && l.confirmationType === '手动确权');
          const jzczLogs = updatedLogs.filter(l => l && l.confirmationType !== '手动确权');
          const reHedgedJzcz = applyConsumptionHedgeToLogs(
            targetLog.miningId, 
            jzczLogs, 
            dtcbLogs, 
            currentResources, 
            managedUsers
          );
          if (reHedgedJzcz && Array.isArray(reHedgedJzcz)) {
            const reHedgedMap = new Map(reHedgedJzcz.filter(Boolean).map(l => [l.id, l]));
            updatedLogs = updatedLogs.map(l => (l && reHedgedMap.has(l.id)) ? { ...l, ...reHedgedMap.get(l.id)! } : l);
          }
        }

        return updatedLogs.filter(Boolean);
      });

      if (resource && resource.id) {
        setMiningResources(prevResources => prevResources.map(r => (r && r.id === resource.id) ? resource : r));
        if (snapshot) {
          setQuotaSnapshots(prev => ({ ...prev, [resource.id]: snapshot }));
        }
      }

      addSystemLog('价值确权', `将流水 ${logId} 的状态更新为 ${status} (后端执行${linkedLogs && linkedLogs.length > 0 ? `，联动确权 ${linkedLogs.length} 条记录` : ''})`);
      toast.success('确权成功');
    } catch (err: any) {
      console.error('Audit failed:', err);
      toastApiError(err, '确权操作失败');
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
  }, [processLogsSubmission, addSystemLog]);

  const onLogSubmit = React.useCallback((newLogs: ValueCreationLog | ValueCreationLog[], options?: { isImport?: boolean; skipSystemLogs?: boolean }) => {
    const logsToAdd = Array.isArray(newLogs) ? newLogs : [newLogs];
    processLogsSubmission(logsToAdd);
    if (options?.isImport) {
      addSystemLog('批量导入', `成功批量导入确权了 ${logsToAdd.length} 条价值创造记录`);
    } else if (!options?.skipSystemLogs) {
      logsToAdd.forEach(log => {
        addSystemLog('产出申报', `提交了 ${log.amount} 积分的 ${log.category} 产出申报`);
      });
    }
  }, [processLogsSubmission, addSystemLog]);

  const onConsumptionSubmit = React.useCallback((newLog: ValueCreationLog | ValueCreationLog[]) => {
    const logsArray = Array.isArray(newLog) ? newLog : [newLog];
    processLogsSubmission(logsArray);
    logsArray.forEach(log => {
      const isHedge = log.status === AuditStatus.Confirmed && log.costCategory === 'C';
      addSystemLog('成本消耗', `提交了 ${log.dynamicCost} 积分 of ${log.costCategory} 成本消耗${isHedge ? ' (并触发动态对冲)' : ''}`);
    });
  }, [processLogsSubmission, addSystemLog]);

  const onSubmitTransaction = React.useCallback(async (txOrTxs: InternalTransaction | InternalTransaction[], updatedResources?: MiningResource[]) => {
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

    if (updatedResources && updatedResources.length > 0) {
      setMiningResources(prev => {
        const next = [...prev];
        for (const item of updatedResources) {
          const index = next.findIndex(r => r.id === item.id);
          if (index >= 0) {
            next[index] = item;
          } else {
            next.push(item);
          }
        }
        return next;
      });
    }
    try {
      await persistWorkspaceWithOverrides({ 
        transactions: nextTxs, 
        miningResources: updatedResources 
      }, { successMessage: '内部交易提交成功' });
    } catch (err: any) {
      toastApiError(err, '内部交易同步失败');
    }
    for (const tx of txList) {
      addSystemLog('内部交易', `发起了/修改了 ${tx.amount} 额度的 ${tx.type} 交易 (${tx.id})`);
    }
  }, [addSystemLog, persistWorkspaceWithOverrides]);

  const onAuditTransaction = React.useCallback(async (txIdOrList: string | string[], status: TransactionStatus, updatedResource?: MiningResource | MiningResource[]) => {
    const idList = Array.isArray(txIdOrList) ? txIdOrList : [txIdOrList];
    let nextTxs: InternalTransaction[] = [];
    setTransactions(prev => {
      nextTxs = prev.map(t => idList.includes(t.id) ? { ...t, status } : t);
      return nextTxs;
    });
    
    let resListToSync: MiningResource[] | undefined = undefined;
    if (updatedResource) {
      const resList = Array.isArray(updatedResource) ? updatedResource : [updatedResource];
      resListToSync = resList;
      setMiningResources(prev => {
        const ids = new Set(prev.map(r => r.id));
        return [
          ...prev.map(r => resList.find(x => x.id === r.id) || r),
          ...resList.filter(x => !ids.has(x.id))
        ];
      });
    }
    try {
      await persistWorkspaceWithOverrides({ 
        transactions: nextTxs, 
        miningResources: resListToSync // 仅同步变更的矿山资源，不要带全量 miningResources 避免非管理员403
      }, { successMessage: '交易审核成功' });
    } catch (err: any) {
      toastApiError(err, '交易审核同步失败');
    }
    idList.forEach(id => addSystemLog('交易审核', `将交易 ${id} 的状态更新为 ${status}`));
  }, [addSystemLog, persistWorkspaceWithOverrides]);

  const onAddCircuitBreaker = React.useCallback(async (cb: CircuitBreaker) => {
    let nextCBs: CircuitBreaker[] = [];
    setCircuitBreakers(prev => {
      const exists = prev.some(item => item.id === cb.id);
      nextCBs = exists ? prev.map(item => item.id === cb.id ? cb : item) : [...prev, cb];
      if (import.meta.env.VITE_USE_LOCAL_AUTH === 'true') {
        try {
          safeSetItem('shihe_circuit_breakers', JSON.stringify(nextCBs));
        } catch (e) {
          console.warn(e);
        }
      }
      return nextCBs;
    });
    try {
      await persistWorkspaceWithOverrides({ circuitBreakers: nextCBs }, { successMessage: '熔断触发成功' });
    } catch (err: any) {
      toastApiError(err, '熔断触发同步失败');
    }
    addSystemLog('熔断触发', `对 ${cb.targetName} 触发了熔断，原因：${cb.reason}`);
  }, [addSystemLog, persistWorkspaceWithOverrides]);

  const onRecoverCircuitBreaker = React.useCallback(async (id: string) => {
    let nextCBs: CircuitBreaker[] = [];
    let cbItem: CircuitBreaker | undefined;
    setCircuitBreakers(prev => {
      cbItem = prev.find(c => c.id === id);
      nextCBs = prev.map(cb => cb.id === id ? { ...cb, status: 'recovered' as const } : cb);
      if (import.meta.env.VITE_USE_LOCAL_AUTH === 'true') {
        try {
          safeSetItem('shihe_circuit_breakers', JSON.stringify(nextCBs));
        } catch (e) {
          console.warn(e);
        }
      }
      return nextCBs;
    });
    try {
      await persistWorkspaceWithOverrides({ circuitBreakers: nextCBs }, { successMessage: '熔断恢复成功' });
    } catch (err: any) {
      toastApiError(err, '熔断恢复同步失败');
    }
    if (cbItem && cbItem.status === 'active') {
      addSystemLog('熔断恢复', `恢复了 ${cbItem.targetName} 的熔断`);
    }
  }, [addSystemLog, persistWorkspaceWithOverrides]);

  const onAddResource = React.useCallback(async (res: MiningResource) => {
    const nextRes = [...miningResources, res];
    if (nextRes.length === 0) {
      toast.error('本地矿山列表为空，拒绝同步');
      return;
    }
    setMiningResources(nextRes);
    try {
      await persistWorkspaceWithOverrides({ miningResources: nextRes }, { successMessage: '新增资源成功' });
    } catch (err: any) {
      toastApiError(err, '新增资源同步失败');
    }
    addSystemLog('资源管理', `新增了矿山资源 ${res.id}`);
  }, [addSystemLog, persistWorkspaceWithOverrides, miningResources]);

  const onUpdateResource = React.useCallback(async (res: MiningResource) => {
    try {
      await updateResource(res.id, res);
      setMiningResources(prev => prev.map(r => r.id === res.id ? res : r));
      toast.success('更新资源成功');
      addSystemLog('资源管理', `更新了矿山资源 ${res.id}`);
    } catch (err: any) {
      toastApiError(err, '更新矿山资源失败');
      throw err;
    }
  }, [addSystemLog]);

  const onDeleteResource = React.useCallback(async (id: string) => {
    try {
      await deleteMiningResource(id);
      setMiningResources(prev => prev.filter(r => r.id !== id));
      toast.success('删除资源成功');
      addSystemLog('资源管理', `删除了矿山资源 ${id}`);
      return true;
    } catch (err: any) {
      toastApiError(err, '删除矿山资源失败');
      return false;
    }
  }, [addSystemLog]);

  const onDeleteLog = React.useCallback((logId: string) => {
    showConfirm(`确定要删除审计记录 #${logId} 吗？此操作不可逆！`, async () => {
      const nowStr = new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      let previousLogs: ValueCreationLog[] = [];
      let nextLogs: ValueCreationLog[] = [];

      setLogs(prev => {
        previousLogs = prev;
        nextLogs = prev.map(l => l.id === logId ? { ...l, deleted: true, deletedAt: nowStr } : l);
        return nextLogs;
      });

      addSystemLog("删除审计记录", "删除编号 #" + logId + "，时间: " + nowStr);

      try {
        await persistWorkspaceWithOverrides({ logs: nextLogs });
        showAlert('已删除');
      } catch (err: any) {
        setLogs(previousLogs);
        toastApiError(err, '删除流水失败');
      }
    });
  }, [addSystemLog, showConfirm, showAlert, persistWorkspaceWithOverrides]);

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
    try {
      await changePasswordApi(userId, newPassword, oldPassword);
      addSystemLog('安全设置', `用户 ${userId} 成功修改了密码`);
      
      // 更新当前用户状态，避免再次弹出改密弹窗
      if (currentUser && currentUser.id === userId) {
        setCurrentUser(prev => prev ? { ...prev, mustChangePassword: false, isFirstLogin: false } : null);
      }
      
      return true;
    } catch (err) {
      toastApiError(err);
      return false;
    }
  }, [addSystemLog, currentUser]);

  const onAuthenticate = React.useCallback(async (userId: string, password: string): Promise<User | null> => {
    try {
      const data = await loginWithApi(userId, password);
      if (data && data.user) {
        addSystemLog('用户登录', `用户 ${data.user.name} (${data.user.userId || data.user.id}) 成功登录系统`, data.user, data.clientIp);
        return data.user;
      }
      return null;
    } catch (err: any) {
      console.error('登录异常:', err);
      if (err.status === 403) {
        return Promise.reject(new Error(err.message || '账号已被锁定或已离职'));
      }
      return null;
    }
  }, [addSystemLog]);

  const onClearTestData = React.useCallback(() => {
    setLogs([]);
    setMiningResources(INITIAL_MINING_RESOURCES);
    setManagedUsers(INITIAL_USERS);
    setTransactions([]);
    safeSetItem('cleared_test_data_v2', 'true');
    addSystemLog('系统维护', '清空了所有测试数据并重置资源状态');
  }, [addSystemLog]);

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

  // 2. 数据处理与初始加载 (仅本地单机模式读取/初始化 localStorage)
  useEffect(() => {
    if (import.meta.env.VITE_USE_LOCAL_AUTH === 'true') {
      if (!safeGetItem('cleared_test_data_v2')) {
        onClearTestData();
        return;
      }

      try {
        const savedResources = safeGetItem('shihe_resources');
        if (savedResources) setMiningResources(JSON.parse(savedResources));
      } catch (e) {
        console.warn('Failed to parse shihe_resources from localStorage', e);
      }

      try {
        const savedTransactions = safeGetItem('shihe_transactions');
        if (savedTransactions) setTransactions(JSON.parse(savedTransactions));
      } catch (e) {
        console.warn('Failed to parse shihe_transactions from localStorage', e);
      }
    }
  }, [onClearTestData]);

  // 3. 数据持久化与后端同步 (500ms 去抖动，动静分离与静默同步)
  useEffect(() => {
    // 导入或特别操作期间暂停自动 sync，规避并发与重复写库
    if (isAutoSyncPausedRef.current || (window as any).__PAUSE_AUTO_SYNC__) {
      return;
    }

    const currentFingerprint = getWorkspaceFingerprint();

    // 显式写库已更新 fingerprint 或数据未变动，跳过自动 sync 避免重复请求
    if (currentFingerprint === lastSyncedFingerprintRef.current) {
      return;
    }

    const syncData = async () => {
      // 门禁：未登录或未完成首次加载，不允许同步写
      if (!currentUser || !workspaceLoaded) return;
      if (isSyncBroken) {
        console.log('自动同步已熔断，等待自动重试中...');
        return;
      }

      try {
        const payload = buildAppSyncPayload({
          managedUsers,
          logs,
          transactions,
          miningResources,
          circuitBreakers,
          systemLogs,
          meetingSamples,
          acceptanceRecords,
          filterMonth,
          currentUser,
          includePassword: false
        });
        
        await syncWorkspace(payload);
        recordSyncSuccess();
        lastSyncedFingerprintRef.current = currentFingerprint;
      } catch (err: any) {
        console.error('自动同步数据失败:', err);
        const retryCallback = () => {
          setSyncRetryTrigger(prev => prev + 1);
        };
        recordSyncFailure(retryCallback);
        
        const nextCount = syncFailureCount + 1;
        const waitMinutes = nextCount === 1 ? 5 : nextCount === 2 ? 10 : 30;
        toast.error(`自动同步失败，系统将在 ${waitMinutes} 分钟后自动重试`, { id: 'auto-sync-breaker' });
      }
    };

    // 只有在加载完成后才执行同步
    if (currentUser && workspaceLoaded) {
      const timer = setTimeout(syncData, 500); // 500ms 防抖，响应迅速且不频繁
      
      if (import.meta.env.VITE_USE_LOCAL_AUTH === 'true') {
        // E′-6 规则澄清: shihe_* 本地缓存仅作为客户端前端暂存与开发环境保底，非权威主账本；服务端 API 接口及工作区同步 payload 为权威源。
        safeSetItem('shihe_managed_users', JSON.stringify(managedUsers));
      }

      return () => clearTimeout(timer);
    }
  }, [managedUsers, logs, transactions, miningResources, circuitBreakers, systemLogs, meetingSamples, acceptanceRecords, filterMonth, currentUser, workspaceLoaded, getWorkspaceFingerprint, isSyncBroken, syncFailureCount, syncRetryTrigger, recordSyncFailure, recordSyncSuccess]);

  useEffect(() => {
    if (import.meta.env.VITE_USE_LOCAL_AUTH === 'true') {
      try {
        safeSetItem('shihe_resources', JSON.stringify(miningResources));
        safeSetItem('shihe_circuit_breakers', JSON.stringify(circuitBreakers));
        safeSetItem('shihe_user', JSON.stringify(currentUser));
      } catch (e) {
        console.warn('Failed to save state to localStorage', e);
      }
    }
  }, [miningResources, circuitBreakers, currentUser]);

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
  }, [addSystemLog]);

  const handleSwitchUser = (user: User) => {
    addSystemLog('切换智能体', `从 ${currentUser.name} 切换到 ${user.name}`, user);
    setCurrentUser(user);
    
    const isAllowed = checkUserPermission(user, activeTab);
    if (!isAllowed) {
      setActiveTab('kanban');
    }
  };

  const handleLogout = () => {
    if (currentUser) {
      addSystemLog('退出登录', `用户 ${currentUser.name} 退出系统登录`, currentUser);
    }
    clearSessionState();
    setCurrentUser(null);
    setWorkspaceLoaded(false);
    setManagedUsers(INITIAL_USERS);
    setLogs([]);
    setTransactions([]);
    setMiningResources([]);
    setMeetingSamples([]);
  };

  // F5 session restoration
  useEffect(() => {
    const restoreSession = async () => {
      const token = getAuthToken();
      if (!token) {
        if (currentUser) {
          handleLogout();
        }
        return;
      }
      try {
        const user = await fetchSessionUser();
        setCurrentUser(user);
        if (import.meta.env.VITE_USE_LOCAL_AUTH === 'true') {
          try {
            safeSetItem('shihe_user', JSON.stringify(user));
          } catch (e) {
            console.warn('Failed to save shihe_user to localStorage:', e);
          }
        }
      } catch (err) {
        console.error('Session verification failed on mount:', err);
        clearAuthToken();
        handleLogout();
        toast.error('会话已过期，请重新登录');
      }
    };
    restoreSession();
  }, []);

  const isAdminOrNPC = currentUser ? isAdminOrNpc(currentUser) : false;
  const isGlobal = currentUser ? isGlobalReader(currentUser) : false;
  
  const filteredUsers = useMemo(() => {
    return filterUsersByCenter(managedUsers, currentUser);
  }, [managedUsers, currentUser]);

  const filteredResources = useMemo(() => {
    return filterResourcesByCenter(miningResources, currentUser);
  }, [miningResources, currentUser]);

  // 日志网关 1：${TERM_FILTERED_LOGS} (仅 jzcz 价值创造，供价值动态流 / 收款轨与产值轨展示)
  const filteredLogs = useMemo(() => {
    return filterLogsByCenter(logs, miningResources, currentUser);
  }, [logs, miningResources, currentUser]);

  // 日志网关 2：${TERM_AUDIT_LOGS} (jzcz ∪ dtcb 动态消耗，供成本确权待办与审计)
  const auditLogs = useMemo(() => {
    return filterAuditLogsByCenter(logs, miningResources, currentUser, managedUsers);
  }, [logs, miningResources, currentUser, managedUsers]);

  const filteredTransactions = useMemo(() => {
    return filterTransactionsByCenter(transactions, currentUser, managedUsers);
  }, [transactions, currentUser, managedUsers]);

  const filteredCircuitBreakers = useMemo(() => {
    if (!currentUser) return [];
    if (isGlobal) return circuitBreakers;
    const centerUserIds = new Set(filteredUsers.map(u => u.id));
    const resourceIds = new Set(filteredResources.map(r => r.id));
    const centers = parseCenterList(currentUser.center);
    return circuitBreakers.filter(cb => 
      centerUserIds.has(cb.targetId) || 
      resourceIds.has(cb.targetId) || 
      (cb.targetName && centers.some(c => cb.targetName.toUpperCase().includes(c)))
    );
  }, [circuitBreakers, filteredUsers, filteredResources, currentUser, isGlobal]);

  const onSaveMeetingSample = React.useCallback(async (sample: MeetingSample): Promise<boolean> => {
    try {
      const res = await saveMeetingSampleApi(sample);
      if (res && res.success) {
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

  const effectiveBusinessUnits = useMemo(() => {
    return jydyUnits.map(u => u.name);
  }, [jydyUnits]);

  const tabProps = useMemo(() => {
    if (!currentUser) return {} as any;
    return {
      kanban: { 
        logs: auditLogs, 
        jzczLogs: filteredLogs,
        auditLogs: auditLogs,
        resources: filteredResources, 
        users: managedUsers, 
        currentUser, 
        transactions: filteredTransactions,
        onSystemAdjustment,
        onSwitchTab: setActiveTab,
        units: effectiveBusinessUnits,
        meetingSamples,
        onSaveMeetingSample
      },
      creation: { 
        user: currentUser, 
        users: filteredUsers,
        resources: filteredResources, 
        logs: filteredLogs, 
        onLogSubmit, 
        onSwitchTab: setActiveTab,
        transactions: filteredTransactions,
        onAuditTransaction,
        onAddCircuitBreaker,
        quotaSnapshots,
        processingLogIds,
        persistWorkspaceWithOverrides,
        onPauseAutoSync: setPauseAutoSync
      },
      consumption: { 
        user: currentUser, 
        users: filteredUsers, 
        resources: filteredResources, 
        logs: auditLogs, 
        jzczLogs: filteredLogs.filter(l => l.confirmationType !== '手动确权'),
        dtcbLogs: auditLogs.filter(l => l.confirmationType === '手动确权'),
        onLogSubmit: onConsumptionSubmit,
        persistWorkspaceWithOverrides,
        updateLastSyncedFingerprint
      },
      audit: { 
        user: currentUser, 
        logs: auditLogs, 
        users: filteredUsers,
        resources: filteredResources,
        onAudit: processAudit,
        processingLogIds,
        onDeleteLog,
        onRefreshWorkspace: async () => {
          try {
            const data = await fetchWorkspaceData();
            if (data) {
              if (data.logs || data.dtcb) {
                const combined = [...(data.logs || []), ...(data.dtcb || [])];
                setLogs(combined);
              }
              if (data.transactions) setTransactions(data.transactions);
              if (data.miningResources) setMiningResources(data.miningResources);
              if (data.acceptanceRecords) setAcceptanceRecords(data.acceptanceRecords);
              
              const currentUnits = jydyUnits.map(u => u.name);
              if (data.managedUsers) {
                setManagedUsers(data.managedUsers.map((u: any) => ({
                  ...u,
                  center: resolveBusinessUnitName(u.center, currentUnits) || u.center,
                })));
              }
            }
          } catch (err) {
            console.error('Failed to refresh workspace in audit tab:', err);
          }
        }
      },
      transactions: { 
        currentUser, 
        users: filteredUsers, 
        managerUsers: managedUsers,
        managerCandidates: managedUsers,
        resources: filteredResources, 
        allResources: miningResources,
        transactions: filteredTransactions, 
        logs: auditLogs,
        jzczLogs: filteredLogs,
        onSubmitTransaction,
        onAuditTransaction,
        onUpdateResource,
        onLogSubmit,
        circuitBreakers: filteredCircuitBreakers,
        onAddCircuitBreaker,
        onRecoverCircuitBreaker,
        units: effectiveBusinessUnits,
        persistWorkspaceNow,
        persistWorkspaceWithOverrides
      },
      resources: { 
        user: currentUser, 
        resources: filteredResources,
        logs: auditLogs,
        dtcbLogs: auditLogs.filter(l => l.confirmationType === '手动确权' || !!l.costCategory || !!(l as any).consumptionType),
        transactions: filteredTransactions,
        managedUsers: managedUsers,
        onAddResource,
        onUpdateResource,
        onDeleteResource,
        units: effectiveBusinessUnits
      },
      reservoir: { 
        logs: filteredLogs,
        auditLogs: auditLogs,
        resources: filteredResources,
        users: filteredUsers,
        transactions: filteredTransactions,
        units: effectiveBusinessUnits,
        currentUser
      },
      evaluation: { 
        users: filteredUsers, 
        logs: auditLogs,
        auditLogs: auditLogs, 
        resources: filteredResources, 
        currentTime,
        onFilterMonthChange: setFilterMonth,
        currentUser: currentUser
      },
      distribution: { 
        logs: auditLogs, 
        users: filteredUsers, 
        currentUser, 
        transactions: filteredTransactions, 
        resources: filteredResources, 
        onSubmitTransaction,
        acceptanceRecords,
      },
      account: { currentUser, logs: auditLogs, transactions: filteredTransactions, resources: filteredResources, users: filteredUsers },
      personnel: { 
        user: currentUser,
        users: filteredUsers, 
        onUpdateUsers,
        onUpdatePassword,
        onClearTestData,
        jydyUnits: jydyUnits,
        onUpdateJydyUnits: setJydyUnits,
        persist: persistWorkspaceWithOverrides,
        allLogs: auditLogs,
        onAppendLog: (log: ValueCreationLog) => {
          setLogs(prev => {
            const next = [...prev, log];
            persistWorkspaceWithOverrides({ logs: next });
            return next;
          });
        }
      }
    };
  }, [filteredLogs, auditLogs, filteredResources, filteredUsers, managedUsers, miningResources, jydyUnits, transactions, currentUser, currentTime, logs,
       onSystemAdjustment, onLogSubmit, onConsumptionSubmit, processAudit, onSubmitTransaction, 
       onAuditTransaction, onAddResource, onUpdateResource, onDeleteResource, onUpdateUsers, onClearTestData,
       circuitBreakers, onAddCircuitBreaker, onRecoverCircuitBreaker, persistWorkspaceWithOverrides, updateLastSyncedFingerprint]);

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
          <div className="flex flex-wrap justify-around content-around p-10 opacity-[0.03]" style={{ gap: '250px', minHeight: '100%' }}>
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
      <CityGuardianModal state={modalState} onClose={closeModal} />
    </div>
  );
};

export default App;
