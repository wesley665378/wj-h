import { apiClient, unwrapApiEnvelope } from './client';

export async function deleteMiningResource(id: string): Promise<void> {
  const res = await apiClient.delete<any>(`/api/resources/${encodeURIComponent(id)}`);
  return unwrapApiEnvelope<void>(res);
}
