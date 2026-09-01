import {
  User,
  ValueCreationLog,
  InternalTransaction,
  MiningResource,
  CircuitBreaker,
  SystemOperationLog,
  MeetingSample,
  AcceptanceRecord,
  Role,
} from '../../types';
import { buildValueEfficiencySnapshots } from '../utils/valueEfficiencySnapshots';
import { buildJzfpSnapshot } from '../utils/jzfpSnapshot';
import { pickUserForWorkspaceSync } from '../utils/userSyncPayload';
import { isSystemAdmin } from '../utils/accessControl';

export interface BuildSyncPayloadInput {
  managedUsers?: User[];
  logs?: ValueCreationLog[];
  dtcbLogs?: ValueCreationLog[];
  transactions?: InternalTransaction[];
  miningResources?: MiningResource[];
  circuitBreakers?: CircuitBreaker[];
  systemLogs?: any[];
  fhctzRecords?: any[];
  settlementPayouts?: any[];
  valueEfficiencySnapshots?: any[];
  systemConfig?: any;
}

export function buildSyncPayload(input: BuildSyncPayloadInput) {
  return {
    users: input.managedUsers,
    logs: input.logs,
    dtcb: input.dtcbLogs,
    transactions: input.transactions,
    miningResources: input.miningResources,
    circuitBreakers: input.circuitBreakers,
    systemLogs: input.systemLogs,
    fhctzRecords: input.fhctzRecords,
    settlementPayouts: input.settlementPayouts,
    valueEfficiencySnapshots: input.valueEfficiencySnapshots,
    systemConfig: input.systemConfig,
  };
}

export interface BuildAppSyncPayloadInput {
  managedUsers: User[];
  logs: ValueCreationLog[];
  transactions: InternalTransaction[];
  miningResources: MiningResource[];
  circuitBreakers: CircuitBreaker[];
  systemLogs: SystemOperationLog[];
  meetingSamples: MeetingSample[];
  acceptanceRecords: AcceptanceRecord[];
  filterMonth: string;
  currentUser: User | null;
  includePassword?: boolean;
  overrides?: Partial<{
    users: User[];
    logs: ValueCreationLog[];
    transactions: InternalTransaction[];
    miningResources: MiningResource[];
    circuitBreakers: CircuitBreaker[];
    meetingSamples: MeetingSample[];
    acceptanceRecords: AcceptanceRecord[];
    importBatchId: string;
  }>;
}

/** 从 App 当前 state 构建 sync payload，persist 与防抖 sync 共用 */
export function buildAppSyncPayload(input: BuildAppSyncPayloadInput): Record<string, unknown> {
  const { overrides, includePassword, currentUser } = input;
  const isAdmin = isSystemAdmin(currentUser);

  const nextUsers = overrides?.users ?? input.managedUsers;
  
  // 1. 数据清洗：确保同步给后端的 center/category 是标准口径（还原回填）
  // 即使是 admin 同步，也要确保不把展示层的“水库管理员”写回数据库的“统筹水库管理员”
  const sanitizedUsers = nextUsers.map(u => {
    let rawCenter = u.center;
    // 如果 center 包含括号（resolveBusinessUnitName 的典型特征），尝试还原
    if (rawCenter?.includes(' (')) {
      rawCenter = rawCenter.split(' (')[0].trim();
    }
    
    return {
      ...pickUserForWorkspaceSync(u, { includePassword }),
      center: rawCenter,
      category: u.category === '水库管理员' ? '统筹水库管理员' : u.category // 逆向还原：水库管理员 -> 统筹水库管理员
    };
  });

  const nextLogs = overrides?.logs ?? input.logs;
  const nextTxs = overrides?.transactions ?? input.transactions;
  const nextRes = overrides?.miningResources ?? input.miningResources;
  const nextCBs = overrides?.circuitBreakers ?? input.circuitBreakers;
  const nextSamples = overrides?.meetingSamples ?? input.meetingSamples;
  const nextAcc = overrides?.acceptanceRecords ?? input.acceptanceRecords;

  const dtcbLogs = nextLogs ? nextLogs.filter(l => l.confirmationType === '手动确权') : undefined;
  const jzczLogs = nextLogs ? nextLogs.filter(l => l.confirmationType !== '手动确权') : undefined;
  // 快照延迟或移除：自动 sync 不附带 valueEfficiencySnapshots / jzfp，大幅缩减 payload 与前端计算开销
  const snapshots = undefined;
  const jzfpSnapshots = undefined;

  const isInitialUsersPlaceholder = 
    sanitizedUsers.length === 0 || 
    (sanitizedUsers.length <= 3 && sanitizedUsers.every(u => u.id === 'admin' || u.id === '1635' || u.id === 'npcxie'));

  const payload: Record<string, any> = {
    ...buildSyncPayload({
      managedUsers: sanitizedUsers as User[],
      logs: jzczLogs,
      dtcbLogs: dtcbLogs,
      transactions: nextTxs,
      miningResources: nextRes,
      circuitBreakers: nextCBs,
      systemLogs: overrides ? undefined : input.systemLogs,
      fhctzRecords: overrides ? undefined : [],
      settlementPayouts: overrides ? undefined : [],
      valueEfficiencySnapshots: snapshots,
      systemConfig: undefined,
    }),
    acceptanceRecords: nextAcc,
    jzfp: jzfpSnapshots,
    rdq: nextCBs,
    meetingSamples: nextSamples,
    importBatchId: overrides?.importBatchId,
    import_batch_id: overrides?.importBatchId,
  };

  // 关键修复：非 Admin 用户强制省略 users 字段，防止触发后端快照比对 403
  if (!isAdmin || isInitialUsersPlaceholder || overrides) {
    if (!overrides?.users) {
      delete payload.users;
    }
  }

  // 清除 undefined 字段和空数组
  Object.keys(payload).forEach(key => {
    if (payload[key] === undefined) {
      delete payload[key];
    } else if (Array.isArray(payload[key]) && payload[key].length === 0) {
      delete payload[key];
    }
  });

  return payload;
}

