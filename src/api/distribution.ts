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
  
  const res = await apiClient.get<any>(`/api/distribution${qs ? `?${qs}` : ''}`);
  
  // Unpack { code, msg, data } envelope for production compatibility
  if (res && res.code !== undefined && res.data !== undefined) {
    const unpacked = res.data;
    return {
      month: unpacked.filterMonth || month || '',
      status: status || '',
      distribution: unpacked.experts || [], // experts -> distribution rows
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
