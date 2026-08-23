import { apiClient } from './client';

export const createCdtzRecord = async (record: any): Promise<{ success: boolean; id?: string }> => {
  return apiClient.post<{ success: boolean; id?: string }>('/api/cdtz', record);
};

export const fetchCdtzRecords = async (userId?: string): Promise<{ success: boolean; records: any[] }> => {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  return apiClient.get<{ success: boolean; records: any[] }>(`/api/cdtz${qs}`);
};
