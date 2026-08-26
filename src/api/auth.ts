import { apiClient, setAuthToken, unwrapApiEnvelope } from './client';
import { User } from '../../types';

export interface LoginResponse {
  user: User;
  token?: string;
  clientIp?: string;
}

export const loginWithApi = async (userId: string, password: string): Promise<LoginResponse> => {
  const raw = await apiClient.post<any>('/api/auth/login', { userId, password });
  const data = unwrapApiEnvelope<LoginResponse>(raw);
  if (!data?.token) {
    throw new Error('登录响应缺少 token，请联系管理员检查后端鉴权');
  }
  setAuthToken(data.token);
  return data;
};

export const fetchClientIp = async (): Promise<string> => {
  try {
    const raw = await apiClient.get<any>('/api/client-ip');
    const data = unwrapApiEnvelope<{ ip: string }>(raw);
    return data?.ip || '127.0.0.1';
  } catch {
    return '127.0.0.1';
  }
};

export const changePasswordApi = async (
  userId: string,
  newPassword: string,
  oldPassword?: string
): Promise<{ success: boolean; message?: string }> => {
  const raw = await apiClient.post<any>('/api/auth/change-password', {
    userId,
    id: userId,
    newPassword,
    oldPassword
  });
  return unwrapApiEnvelope<{ success: boolean; message?: string }>(raw);
};

export const fetchSessionUser = async (): Promise<User> => {
  const raw = await apiClient.get<any>('/api/auth/me');
  const data = unwrapApiEnvelope<any>(raw);
  const user = data?.user || (data?.id ? data : null) || raw?.user || raw?.data?.user || raw?.data;
  if (!user || !user.id) {
    throw new Error('获取会话用户失败');
  }
  return user as User;
};

