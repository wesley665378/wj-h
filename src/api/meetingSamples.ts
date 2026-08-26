import { apiClient, unwrapApiEnvelope } from './client';
import { MeetingSample } from '../../types';

export const saveMeetingSampleApi = async (sample: MeetingSample): Promise<{ success: boolean }> => {
  const res = await apiClient.post<any>('/api/meeting-samples', sample);
  return unwrapApiEnvelope<{ success: boolean }>(res);
};
