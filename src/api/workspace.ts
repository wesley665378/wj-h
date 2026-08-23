import { apiClient } from './client';
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
  businessUnits?: string[];
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
  businessUnits?: string[];
}

export const fetchWorkspaceData = async (): Promise<WorkspaceDataResponse> => {
  return apiClient.get<WorkspaceDataResponse>('/api/workspace');
};

export const syncWorkspace = async (payload: SyncWorkspacePayload): Promise<{ success: boolean; error?: string }> => {
  return apiClient.post<{ success: boolean; error?: string }>('/api/workspace/sync', payload);
};

export const fetchResourceStatus = async (miningId: string): Promise<{ resource: MiningResource; snapshot: QuotaSnapshot }> => {
  return apiClient.get<{ resource: MiningResource; snapshot: QuotaSnapshot }>(`/api/resource/${miningId}/status`);
};
