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

export interface BuildSyncPayloadInput {
  managedUsers?: User[];
  logs?: ValueCreationLog[];
  dtcbLogs?: ValueCreationLog[];
  transactions?: InternalTransaction[];
  miningResources?: MiningResource[];
  businessUnits?: string[];
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
    businessUnits: input.businessUnits,
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
  businessUnits: string[];
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
    businessUnits: string[];
    circuitBreakers: CircuitBreaker[];
    meetingSamples: MeetingSample[];
    acceptanceRecords: AcceptanceRecord[];
  }>;
}

/** 从 App 当前 state 构建 sync payload，persist 与防抖 sync 共用 */
export function buildAppSyncPayload(input: BuildAppSyncPayloadInput): Record<string, unknown> {
  const { overrides, includePassword } = input;
  const nextUsers = overrides?.users ?? input.managedUsers;
  // Use utility to handle password stripping based on includePassword option
  const cleanedUsers = nextUsers.map(u => pickUserForWorkspaceSync(u, { includePassword }));

  const nextLogs = overrides?.logs ?? input.logs;
  const nextTxs = overrides?.transactions ?? input.transactions;
  const nextRes = overrides?.miningResources ?? input.miningResources;
  const nextCBs = overrides?.circuitBreakers ?? input.circuitBreakers;
  const nextSamples = overrides?.meetingSamples ?? input.meetingSamples;
  const nextAcc = overrides?.acceptanceRecords ?? input.acceptanceRecords;
  const nextUnits = overrides?.businessUnits ?? input.businessUnits;

  const dtcbLogs = nextLogs.filter(l => l.confirmationType === '手动确权');
  const jzczLogs = nextLogs.filter(l => l.confirmationType !== '手动确权');
  const snapshots = buildValueEfficiencySnapshots(cleanedUsers, nextLogs, nextRes, input.filterMonth);
  const jzfpSnapshots = buildJzfpSnapshot(cleanedUsers, nextLogs, input.filterMonth);

  const canSendBusinessUnits = input.currentUser?.role === Role.Admin && nextUnits && nextUnits.length > 0;

  const isInitialUsersPlaceholder = 
    cleanedUsers.length === 0 || 
    (cleanedUsers.length <= 3 && cleanedUsers.every(u => u.id === 'admin' || u.id === '1635' || u.id === 'npcxie'));

  const payload: Record<string, any> = {
    ...buildSyncPayload({
      managedUsers: cleanedUsers,
      logs: jzczLogs,
      dtcbLogs: dtcbLogs,
      transactions: nextTxs,
      miningResources: nextRes,
      businessUnits: canSendBusinessUnits ? nextUnits : undefined,
      circuitBreakers: nextCBs,
      systemLogs: input.systemLogs,
      fhctzRecords: [],
      settlementPayouts: [],
      valueEfficiencySnapshots: snapshots,
      systemConfig: undefined,
    }),
    acceptanceRecords: nextAcc,
    jzfp: jzfpSnapshots,
    rdq: nextCBs,
    meetingSamples: nextSamples,
  };

  if (!canSendBusinessUnits) {
    delete payload.businessUnits;
    delete payload.townCenters;
  }

  if (isInitialUsersPlaceholder) {
    delete payload.users;
  }

  // Anti-Data-Loss (防清库) Safeguard:
  // "sync 禁止传 [] 给 settlementPayouts/cdtz、dtcb、fhctz、jzfp、zhjzpj"
  // "无数据必须省略字段，不得写死 settlementPayouts:[]、fhctzRecords:[]"
  const keysToOmitIfEmpty = [
    'settlementPayouts',
    'miningResources',   // cdtz
    'dtcb',
    'fhctzRecords',      // fhctz
    'fhctz',
    'jzfp',
    'valueEfficiencySnapshots', // zhjzpj
    'logs',
    'transactions',
    'circuitBreakers',
    'rdq',
    'meetingSamples',
    'acceptanceRecords'
  ];

  for (const key of keysToOmitIfEmpty) {
    if (payload[key] !== undefined) {
      if (Array.isArray(payload[key]) && payload[key].length === 0) {
        delete payload[key];
      }
    }
  }

  return payload;
}

