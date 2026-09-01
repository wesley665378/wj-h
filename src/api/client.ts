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

import { safeGetItem, safeSetItem, safeRemoveItem } from '../utils/safeLocalStorage';

const TOKEN_KEY = 'shihe_token';
const LEGACY = 'shihe_auth_token';

let currentAuthToken: string | null = (() => {
  try {
    let token = safeGetItem(TOKEN_KEY);
    if (!token) {
      token = safeGetItem(LEGACY);
      if (token) {
        safeSetItem(TOKEN_KEY, token);
        safeRemoveItem(LEGACY);
      }
    }
    return token || null;
  } catch {
    return null;
  }
})();

export const setAuthToken = (token: string | null): void => {
  currentAuthToken = token;
  try {
    if (token) {
      safeSetItem(TOKEN_KEY, token);
    } else {
      safeRemoveItem(TOKEN_KEY);
      safeRemoveItem(LEGACY);
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

/**
 * 解包 API 响应中的统一包装层 (Envelope)
 * 支持 { code: 200, data: T }, { success: true, data: T }, { status: 200, data: T }, { data: T } 等格式
 * 若传入数据本身已经是目标实体对象或空值，则直接返回
 */
export function unwrapApiEnvelope<T = any>(response: any): T {
  if (response === null || response === undefined) {
    return response as T;
  }

  let current = response;
  // 支持最多解包两层 envelope
  for (let i = 0; i < 2; i++) {
    if (typeof current === 'object' && current !== null) {
      // 业务错误码拦截 (例如 code: 400, 500, 或 status: 'error')
      if (typeof current.code === 'number' && current.code >= 400) {
        throw new ApiError(current.msg || current.message || current.error || `业务错误 (代码: ${current.code})`, current.code, current);
      }
      if (current.success === false && !('data' in current)) {
        throw new ApiError(current.msg || current.message || current.error || '请求执行失败', 400, current);
      }

      // 如果包含 data 字段且不是 undefined，则解包
      if ('data' in current && current.data !== undefined) {
        current = current.data;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return current as T;
}

export function sanitizeErrorMessage(rawMessage?: string): string {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return '服务器繁忙，请稍后重试';
  }

  const lower = rawMessage.toLowerCase();
  
  if (
    lower.includes('internal server error') ||
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('bad gateway') ||
    lower.includes('service unavailable')
  ) {
    return '服务器繁忙，请稍后重试';
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed')
  ) {
    return '网络连接异常，请检查网络状态';
  }
  if (
    lower.includes('abort') ||
    lower.includes('timeout') ||
    lower.includes('超时') ||
    lower.includes('504')
  ) {
    return '服务器响应超时，请稍后重试';
  }

  return rawMessage;
}

export const toastApiError = (err: unknown, defaultMsg: string = '请求操作失败'): void => {
  console.error('API Request Error:', err);
  let rawMsg = defaultMsg;
  if (err instanceof ApiError) {
    rawMsg = err.message || defaultMsg;
  } else if (err instanceof Error) {
    rawMsg = err.message || defaultMsg;
  } else if (typeof err === 'string') {
    rawMsg = err;
  }

  const friendlyMsg = sanitizeErrorMessage(rawMsg);
  
  if (import.meta.env.DEV && rawMsg !== friendlyMsg) {
    toast.error(`${friendlyMsg} (${rawMsg})`);
  } else {
    toast.error(friendlyMsg);
  }
};

const getBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE || '';
};

async function request<T>(endpoint: string, options: RequestInit = {}, timeoutMs: number = 60000): Promise<T> {
  const url = `${getBaseUrl()}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (currentAuthToken) {
    headers['Authorization'] = `Bearer ${currentAuthToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const config: RequestInit = {
    ...options,
    headers,
    signal: options.signal || controller.signal,
  };

  let response: Response;
  try {
    response = await fetch(url, config);
  } catch (networkErr: any) {
    if (networkErr?.name === 'AbortError' || controller.signal.aborted) {
      throw new ApiError('服务器响应超时，请稍后重试', 504);
    }
    throw new ApiError(sanitizeErrorMessage(networkErr?.message || '网络连接异常，请检查网络状态'), 0);
  } finally {
    clearTimeout(timeoutId);
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
    let extractedMsg: string | undefined;
    if (responseData && typeof responseData === 'object') {
      extractedMsg = responseData.msg || responseData.message || responseData.error || responseData.errMsg || responseData.reason;
      if (!extractedMsg && responseData.data && typeof responseData.data === 'object') {
        extractedMsg = responseData.data.msg || responseData.data.message || responseData.data.error;
      }
    } else if (typeof responseData === 'string' && responseData.trim()) {
      extractedMsg = responseData.trim();
    }

    if (response.status >= 500 || (extractedMsg && extractedMsg.toLowerCase().includes('internal server error'))) {
      extractedMsg = '服务器繁忙，请稍后重试';
    }

    const errorMsg = extractedMsg ? sanitizeErrorMessage(extractedMsg) : `请求失败 (状态码: ${response.status})`;
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
