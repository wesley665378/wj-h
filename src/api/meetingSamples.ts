import { apiClient } from './client';
import { MeetingSample } from '../../types';

export const saveMeetingSampleApi = async (sample: MeetingSample): Promise<{ success: boolean }> => {
  return apiClient.post<{ success: boolean }>('/api/meeting-samples', sample);
};
