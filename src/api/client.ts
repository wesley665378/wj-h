import { toast } from 'sonner';

export class ApiError extends Error {
  status: number;
  data?: any;

  constructor(message: string, status: number = 500, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

let currentAuthToken: string | null = (() => {
  try {
    return localStorage.getItem('shihe_auth_token') || null;
  } catch {
    return null;
  }
})();

export const setAuthToken = (token: string | null): void => {
  currentAuthToken = token;
  try {
    if (token) {
      localStorage.setItem('shihe_auth_token', token);
    } else {
      localStorage.removeItem('shihe_auth_token');
    }
  } catch (e) {
    console.warn('Failed to save auth token to localStorage', e);
  }
};

export const getAuthToken = (): string | null => {
  return currentAuthToken;
};

export const clearAuthToken = (): void => {
  setAuthToken(null);
};

export const toastApiError = (err: unknown, defaultMsg: string = '请求操作失败'): void => {
  console.error('API Request Error:', err);
  if (err instanceof ApiError) {
    toast.error(err.message || defaultMsg);
  } else if (err instanceof Error) {
    toast.error(err.message || defaultMsg);
  } else if (typeof err === 'string') {
    toast.error(err);
  } else {
    toast.error(defaultMsg);
  }
};

const getBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE || '';
};

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${getBaseUrl()}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (currentAuthToken) {
    headers['Authorization'] = `Bearer ${currentAuthToken}`;
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  let response: Response;
  try {
    response = await fetch(url, config);
  } catch (networkErr: any) {
    throw new ApiError(networkErr?.message || '网络连接异常，请检查网络状态', 0);
  }

  let responseData: any = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      responseData = await response.json();
    } catch {
      responseData = null;
    }
  } else {
    try {
      responseData = await response.text();
    } catch {
      responseData = null;
    }
  }

  if (!response.ok) {
    const errorMsg = 
      (responseData && typeof responseData === 'object' && (responseData.error || responseData.message)) ||
      (typeof responseData === 'string' && responseData) ||
      `请求失败 (状态码: ${response.status})`;
    
    throw new ApiError(errorMsg, response.status, responseData);
  }

  return responseData as T;
}

export const apiClient = {
  get: <T>(endpoint: string, options?: RequestInit) => 
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: any, options?: RequestInit) => 
    request<T>(endpoint, { ...options, method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),

  put: <T>(endpoint: string, body?: any, options?: RequestInit) => 
    request<T>(endpoint, { ...options, method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),

  delete: <T>(endpoint: string, options?: RequestInit) => 
    request<T>(endpoint, { ...options, method: 'DELETE' }),
};
