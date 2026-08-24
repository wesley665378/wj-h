import {
  User,
  ValueCreationLog,
  InternalTransaction,
  MiningResource,
  CircuitBreaker,
} from '../../types';

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
