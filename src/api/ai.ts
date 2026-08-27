import { apiClient, unwrapApiEnvelope } from './client';

export async function proxyAiProcess(payload: any): Promise<any> {
  const res = await apiClient.post<any>('/api/ai/process', payload);
  return unwrapApiEnvelope<any>(res);
}
