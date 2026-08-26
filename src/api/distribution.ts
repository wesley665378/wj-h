import { apiClient, unwrapApiEnvelope } from './client';

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
  
  const raw = await apiClient.get<any>(`/api/distribution${qs ? `?${qs}` : ''}`);
  const res = unwrapApiEnvelope<any>(raw);
  
  // Unpack structure if contains filterMonth/experts
  if (res && (res.filterMonth !== undefined || res.experts !== undefined)) {
    return {
      month: res.filterMonth || month || '',
      status: status || '',
      distribution: res.experts || [], // experts -> distribution rows
    };
  }

  // Fallback support for local structure
  if (res && Array.isArray(res.distribution)) {
    return res;
  }

  return {
    month: month || '',
    status: status || '',
    distribution: [],
  };
};
