/**
 * 安全的 localStorage 包装，用于大体积数据存取，防止 QuotaExceededError 导致白屏
 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error: any) {
    console.error(`[Storage] Failed to save key "${key}":`, error);
    if (error.name === 'QuotaExceededError' || error.message.includes('quota')) {
      alert('本地存储空间已满！请清理缓存或减少历史数据后重试。');
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
