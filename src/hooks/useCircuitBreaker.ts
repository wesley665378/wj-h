import { useState, useCallback, useRef } from 'react';

/**
 * Hook to manage circuit breaking for automated write operations.
 */
export function useCircuitBreaker() {
  const [failureCount, setFailureCount] = useState(0);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const getWaitTime = (count: number) => {
    if (count === 1) return 5 * 60 * 1000;
    if (count === 2) return 10 * 60 * 1000;
    return 30 * 60 * 1000;
  };

  const recordFailure = useCallback((retryCallback: () => void) => {
    setFailureCount(prev => {
      const nextCount = prev + 1;
      const waitTime = getWaitTime(nextCount);
      const nextRetryTime = Date.now() + waitTime;
      
      setRetryAfter(nextRetryTime);
      
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(retryCallback, waitTime);
      
      console.warn(`Write failed. Count: ${nextCount}. Retrying in ${waitTime / 60000} minutes.`);
      return nextCount;
    });
  }, []);

  const recordSuccess = useCallback(() => {
    setFailureCount(0);
    setRetryAfter(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const isBroken = retryAfter !== null && Date.now() < retryAfter;

  return {
    failureCount,
    isBroken,
    retryAfter,
    recordFailure,
    recordSuccess
  };
}
