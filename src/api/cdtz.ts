import { apiClient, unwrapApiEnvelope } from './client';

export const createCdtzRecord = async (record: any): Promise<{ success: boolean; id?: string }> => {
  const res = await apiClient.post<any>('/api/cdtz', record);
  return unwrapApiEnvelope<{ success: boolean; id?: string }>(res);
};

export const fetchCdtzRecords = async (userId?: string): Promise<{ success: boolean; records: any[] }> => {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const res = await apiClient.get<any>(`/api/cdtz${qs}`);
  return unwrapApiEnvelope<{ success: boolean; records: any[] }>(res);
};
