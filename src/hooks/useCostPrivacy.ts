import React, { useState, useEffect, useCallback } from 'react';
import { formatMoney } from '../utils/formatMoney';

const STORAGE_KEY = 'shihe_cost_visible';
const EVENT_NAME = 'shihe_cost_privacy_change';

/**
 * 成本脱敏展示格式化函数 (附录 T)
 * 规则：先通过 formatMoney 格式化，若未开启明文成本展示则返回 ****
 */
export function formatCostDisplay(amount: number | string | null | undefined, isCostVisible: boolean): string {
  if (isCostVisible) {
    return formatMoney(amount);
  }
  return '****';
}

export function useCostPrivacy() {
  const [isCostVisible, setIsCostVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    const handlePrivacyChange = () => {
      const val = localStorage.getItem(STORAGE_KEY) === 'true';
      setIsCostVisible(val);
    };

    window.addEventListener(EVENT_NAME, handlePrivacyChange);
    window.addEventListener('storage', handlePrivacyChange);
    return () => {
      window.removeEventListener(EVENT_NAME, handlePrivacyChange);
      window.removeEventListener('storage', handlePrivacyChange);
    };
  }, []);

  const toggleCostVisible = useCallback(() => {
    setIsCostVisible((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      window.dispatchEvent(new Event(EVENT_NAME));
      return next;
    });
  }, []);

  const maskMoney = useCallback((amount: number | string | null | undefined, formatter?: (val: number | string) => string): string => {
    if (isCostVisible) {
      if (amount === null || amount === undefined) return '0';
      if (formatter) return formatter(amount);
      return formatMoney(amount);
    }
    return '****';
  }, [isCostVisible]);

  const maskText = useCallback((text: string): string => {
    if (isCostVisible) return text;
    if (!text) return text;
    // Replace numbers with ****
    return text.replace(/¥?\d+(?:,\d{3})*(?:\.\d+)?/g, '****');
  }, [isCostVisible]);

  return {
    isCostVisible,
    toggleCostVisible,
    maskMoney,
    maskText,
  };
}

/**
 * 成本脱敏显示组件 (附录 T)
 */
export const CostAmount: React.FC<{
  value: number | string | null | undefined;
  className?: string;
}> = ({ value, className = '' }) => {
  const { isCostVisible } = useCostPrivacy();
  return React.createElement('span', { className }, formatCostDisplay(value, isCostVisible));
};

