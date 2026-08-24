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
  const { overrides } = input;
  const nextUsers = overrides?.users ?? input.managedUsers;
  const nextLogs = overrides?.logs ?? input.logs;
  const nextTxs = overrides?.transactions ?? input.transactions;
  const nextRes = overrides?.miningResources ?? input.miningResources;
  const nextCBs = overrides?.circuitBreakers ?? input.circuitBreakers;
  const nextSamples = overrides?.meetingSamples ?? input.meetingSamples;
  const nextAcc = overrides?.acceptanceRecords ?? input.acceptanceRecords;
  const nextUnits = overrides?.businessUnits ?? input.businessUnits;

  const dtcbLogs = nextLogs.filter(l => l.confirmationType === '手动确权');
  const jzczLogs = nextLogs.filter(l => l.confirmationType !== '手动确权');
  const snapshots = buildValueEfficiencySnapshots(nextUsers, nextLogs, nextRes, input.filterMonth);
  const jzfpSnapshots = buildJzfpSnapshot(nextUsers, nextLogs, input.filterMonth);

  const canWriteTownCenters = input.currentUser?.role === Role.Admin || input.currentUser?.role === Role.npcxie;

  return {
    ...buildSyncPayload({
      managedUsers: nextUsers,
      logs: jzczLogs,
      dtcbLogs: dtcbLogs,
      transactions: nextTxs,
      miningResources: nextRes,
      businessUnits: canWriteTownCenters ? nextUnits : [],
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
}

