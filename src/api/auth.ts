import { apiClient, setAuthToken } from './client';
import { User } from '../../types';

export interface LoginResponse {
  user: User;
  token?: string;
  clientIp?: string;
}

export const loginWithApi = async (userId: string, password: string): Promise<LoginResponse> => {
  const data = await apiClient.post<LoginResponse>('/api/auth/login', { userId, password });
  if (data?.token) {
    setAuthToken(data.token);
  } else if (data?.user?.id) {
    setAuthToken(`auth_${data.user.id}_${Date.now()}`);
  }
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
