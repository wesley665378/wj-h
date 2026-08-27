import { apiClient, unwrapApiEnvelope } from './client';
import {
  User,
  ValueCreationLog,
  InternalTransaction,
  MiningResource,
  AcceptanceRecord,
  CircuitBreaker,
  MeetingSample,
  QuotaSnapshot
} from '../../types';

export interface WorkspaceDataResponse {
  managedUsers?: User[];
  logs?: ValueCreationLog[];
  dtcb?: ValueCreationLog[];
  transactions?: InternalTransaction[];
  miningResources?: MiningResource[];
  acceptanceRecords?: AcceptanceRecord[];
  circuitBreakers?: CircuitBreaker[];
  rdq?: CircuitBreaker[];
  meetingSamples?: MeetingSample[];
  valueEfficiencySnapshots?: any[];
  jzfp?: any[];
}

export interface SyncWorkspacePayload {
  users?: User[];
  logs?: ValueCreationLog[];
  dtcb?: ValueCreationLog[];
  transactions?: InternalTransaction[];
  miningResources?: MiningResource[];
  valueEfficiencySnapshots?: any[];
  acceptanceRecords?: AcceptanceRecord[];
  jzfp?: any[];
  circuitBreakers?: CircuitBreaker[];
  rdq?: CircuitBreaker[];
  meetingSamples?: MeetingSample[];
}

export const fetchWorkspaceData = async (): Promise<WorkspaceDataResponse> => {
  const res = await apiClient.get<any>('/api/workspace');
  return unwrapApiEnvelope<WorkspaceDataResponse>(res);
};

export const syncWorkspace = async (payload: SyncWorkspacePayload): Promise<{ success: boolean; error?: string }> => {
  const res = await apiClient.post<any>('/api/workspace/sync', payload);
  return unwrapApiEnvelope<{ success: boolean; error?: string }>(res);
};

export const fetchResourceStatus = async (miningId: string): Promise<{ resource: MiningResource; snapshot: QuotaSnapshot }> => {
  const res = await apiClient.get<any>(`/api/resource/${miningId}/status`);
  return unwrapApiEnvelope<{ resource: MiningResource; snapshot: QuotaSnapshot }>(res);
};
