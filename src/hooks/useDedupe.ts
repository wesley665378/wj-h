import { useRef, useCallback } from 'react';

/**
 * Hook to prevent multiple rapid executions of a function.
 * @param delay - Dedupe interval in milliseconds (default: 500ms)
 * @returns { isLocked: (key: string) => boolean }
 */
export function useDedupe(delay = 500) {
  const lastExecuted = useRef<Record<string, number>>({});

  const isLocked = useCallback((key: string) => {
    const now = Date.now();
    if (lastExecuted.current[key] && now - lastExecuted.current[key] < delay) {
      return true; // Operation is locked/deduplicated
    }
    lastExecuted.current[key] = now;
    return false; // Operation allowed
  }, [delay]);

  return { isLocked };
}
