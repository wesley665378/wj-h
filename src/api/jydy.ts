import { apiClient, unwrapApiEnvelope } from './client';
import { JydyUnit } from '../types';

export const fetchJydyList = async (): Promise<JydyUnit[]> => {
  const res = await apiClient.get<any>('/api/jydy');
  return unwrapApiEnvelope<JydyUnit[]>(res);
};

export const syncJydyList = async (units: JydyUnit[]): Promise<{ success: boolean }> => {
  const res = await apiClient.post<any>('/api/jydy/sync', { units });
  return unwrapApiEnvelope<{ success: boolean }>(res);
};
