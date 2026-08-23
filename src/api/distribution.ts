import { apiClient } from './client';

export interface DistributionDataResponse {
  month: string;
  status: string;
  distribution: any[];
}

export const fetchDistributionData = async (
  month?: string,
  status?: string
): Promise<DistributionDataResponse> => {
  const params = new URLSearchParams();
  if (month) params.append('month', month);
  if (status) params.append('status', status);
  const qs = params.toString();
  return apiClient.get<DistributionDataResponse>(`/api/distribution${qs ? `?${qs}` : ''}`);
};
