import { useState, useEffect, useCallback } from 'react';
import { User, SystemOperationLog } from '../../types';
import { fetchClientIp } from '../api/auth';
import { getAuthToken, clearAuthToken } from '../api/client';

export interface UseAppSessionSyncReturn {
  clientIp: string;
  currentTime: Date;
  systemLogs: SystemOperationLog[];
  addSystemLog: (action: string, details: string, user?: User | null, customIp?: string) => void;
  clearSessionState: () => void;
}

export const useAppSessionSync = (currentUser: User | null): UseAppSessionSyncReturn => {
  const [clientIp, setClientIp] = useState<string>('127.0.0.1');
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  const [systemLogs, setSystemLogs] = useState<SystemOperationLog[]>(() => {
    try {
      const saved = localStorage.getItem('shihe_system_logs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((l: any) => ({
            ...l,
            ip: l.ip || '127.0.0.1'
          }));
        }
      }
    } catch (e) {
      console.error('Failed to parse cached system logs:', e);
    }
    return [];
  });

  // Real-time clock ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch client IP on mount
  useEffect(() => {
    let isMounted = true;
    fetchClientIp().then(ip => {
      if (isMounted && ip) setClientIp(ip);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Keep system logs cached in localStorage
  useEffect(() => {
    try {
      localStorage.setItem('shihe_system_logs', JSON.stringify(systemLogs));
    } catch (e) {
      console.warn('Failed to cache system logs', e);
    }
  }, [systemLogs]);

  const addSystemLog = useCallback((action: string, details: string, user: User | null = currentUser, customIp?: string) => {
    const newLog: SystemOperationLog = {
      id: `SYS${Date.now().toString().slice(-6)}`,
      userId: user?.id || 'system',
      userName: user?.name || '系统',
      action,
      details,
      timestamp: Date.now(),
      ip: customIp || clientIp || '127.0.0.1'
    };
    setSystemLogs(prev => [newLog, ...prev].slice(0, 500));
  }, [currentUser, clientIp]);

  const clearSessionState = useCallback(() => {
    clearAuthToken();
    try {
      localStorage.removeItem('shihe_user');
      localStorage.removeItem('shihe_managed_users');
      localStorage.removeItem('shihe_logs');
      localStorage.removeItem('shihe_transactions');
      localStorage.removeItem('shihe_business_units');
      localStorage.removeItem('shihe_circuit_breakers');
    } catch (e) {
      console.warn('Failed to clean session storage', e);
    }
  }, []);

  return {
    clientIp,
    currentTime,
    systemLogs,
    addSystemLog,
    clearSessionState
  };
};
