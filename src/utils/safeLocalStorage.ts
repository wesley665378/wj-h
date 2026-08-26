/**
 * 安全的 localStorage 包装，用于大体积数据存取，防止 QuotaExceededError 导致白屏
 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error: any) {
    console.warn(`[Storage] Failed to save key "${key}":`, error);
    // 处理配额溢出 (QuotaExceededError)
    if (
      error?.name === 'QuotaExceededError' ||
      error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error?.code === 22 ||
      error?.code === 1014
    ) {
      try {
        // 清理非关键缓存键
        const nonCriticalPrefixes = ['temp_', 'cache_', 'log_cache_', 'meeting_sample_preview_'];
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && nonCriticalPrefixes.some(prefix => k.startsWith(prefix))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        localStorage.setItem(key, value);
        return true;
      } catch (retryError) {
        console.error(`[Storage] Quota exceeded and cleanup failed for key "${key}":`, retryError);
        return false;
      }
    }
    return false;
  }
}

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error(`[Storage] Failed to read key "${key}":`, error);
    return null;
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`[Storage] Failed to remove key "${key}":`, error);
  }
}

