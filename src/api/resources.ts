import { apiClient, unwrapApiEnvelope } from './client';
import { MiningResource } from '../types';

export async function updateResource(id: string, resource: MiningResource): Promise<MiningResource | void> {
  const res = await apiClient.put<any>(`/api/resources/${encodeURIComponent(id)}`, resource);
  return unwrapApiEnvelope<MiningResource | void>(res);
}

export async function deleteMiningResource(id: string): Promise<void> {
  const res = await apiClient.delete<any>(`/api/resources/${encodeURIComponent(id)}`);
  return unwrapApiEnvelope<void>(res);
}
