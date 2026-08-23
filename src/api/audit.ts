import { apiClient } from './client';
import { ValueCreationLog, AuditStatus, MiningResource, QuotaSnapshot } from '../../types';

export interface AuditResponse {
  log: ValueCreationLog;
  resource: MiningResource;
  snapshot: QuotaSnapshot;
  linkedLogs?: ValueCreationLog[];
  recalibratedLogs?: ValueCreationLog[];
}

export const putAuditLog = async (
  logId: string,
  status: AuditStatus,
  verifiedAmount?: number
): Promise<AuditResponse> => {
  return apiClient.put<AuditResponse>('/api/audit', {
    logId,
    status,
    verifiedAmount
  });
};

export const auditLog = putAuditLog;
