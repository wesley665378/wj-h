
import { AuditStatus, ValueCreationLog, MiningResource, QuotaSnapshot } from '../../types';

const API_BASE = import.meta.env.VITE_API_BASE || '';

export interface AuditResponse {
  log: ValueCreationLog;
  resource: MiningResource;
  snapshot: QuotaSnapshot;
  linkedLogs?: ValueCreationLog[];
  recalibratedLogs?: ValueCreationLog[];
}

export const auditLog = async (logId: string, status: AuditStatus): Promise<AuditResponse> => {
  const response = await fetch(`${API_BASE}/api/audit`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ logId, status }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    const error = new Error(errorData.error || '确权操作失败');
    (error as any).status = response.status;
    throw error;
  }

  return response.json();
};

export const fetchDistributionData = async (month?: string, status?: string): Promise<{ month: string; status: string; distribution: any[] }> => {
  const params = new URLSearchParams();
  if (month) params.append('month', month);
  if (status) params.append('status', status);
  const response = await fetch(`${API_BASE}/api/distribution?${params.toString()}`);
  if (!response.ok) {
    throw new Error('获取分配数据失败');
  }
  return response.json();
};

export const syncWorkspace = async (payload: {
  users?: any[];
  logs?: any[];
  transactions?: any[];
  miningResources?: any[];
  valueEfficiencySnapshots?: any[];
  acceptanceRecords?: any[];
}): Promise<any> => {
  const response = await fetch(`${API_BASE}/api/workspace/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || '工作区同步失败');
  }
  return response.json();
};

export const fetchWorkspaceData = async (): Promise<any> => {
  const response = await fetch(`${API_BASE}/api/workspace`);
  if (!response.ok) {
    throw new Error('获取工作区数据失败');
  }
  return response.json();
};

export const createCdtzRecord = async (record: any): Promise<any> => {
  const response = await fetch(`${API_BASE}/api/cdtz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || '写入承兑台账失败');
  }
  return response.json();
};

export const fetchCdtzRecords = async (): Promise<{ records: any[] }> => {
  const response = await fetch(`${API_BASE}/api/cdtz`);
  if (!response.ok) {
    throw new Error('获取承兑台账数据失败');
  }
  return response.json();
};
