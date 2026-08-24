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
  extras?: { verifiedAmount?: number; auditNotes?: string } | number,
): Promise<AuditResponse> => {
  const body: Record<string, unknown> = { logId, status };
  const opts = typeof extras === 'number' ? { verifiedAmount: extras } : extras;
  if (opts?.verifiedAmount != null && Number.isFinite(opts.verifiedAmount)) {
    body.verifiedAmount = Math.round(opts.verifiedAmount);
  }
  if (typeof opts?.auditNotes === 'string' && opts.auditNotes.trim()) {
    body.auditNotes = opts.auditNotes.trim();
  }
  return apiClient.put<AuditResponse>('/api/audit', body);
};

export const auditLog = putAuditLog;
