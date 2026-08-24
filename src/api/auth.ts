import { apiClient, setAuthToken } from './client';
import { User } from '../../types';

export interface LoginResponse {
  user: User;
  token?: string;
  clientIp?: string;
}

export const loginWithApi = async (userId: string, password: string): Promise<LoginResponse> => {
  const data = await apiClient.post<LoginResponse>('/api/auth/login', { userId, password });
  if (!data?.token) {
    throw new Error('登录响应缺少 token，请联系管理员检查后端鉴权');
  }
  setAuthToken(data.token);
  return data;
};

export const fetchClientIp = async (): Promise<string> => {
  try {
    const data = await apiClient.get<{ ip: string }>('/api/client-ip');
    return data.ip || '127.0.0.1';
  } catch {
    return '127.0.0.1';
  }
};

export const updatePasswordApi = async (userId: string, newPassword: string, oldPassword?: string): Promise<{ success: boolean; message?: string }> => {
  return apiClient.post<{ success: boolean; message?: string }>('/api/auth/update-password', {
    userId,
    newPassword,
    oldPassword
  });
};

export const fetchSessionUser = async (): Promise<User> => {
  const data = await apiClient.get<{ user: User }>('/api/auth/me');
  if (!data?.user) {
    throw new Error('获取会话用户失败');
  }
  return data.user;
};

