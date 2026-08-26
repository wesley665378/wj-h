import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useCostPrivacy } from '../hooks/useCostPrivacy';

interface CostPrivacyToggleProps {
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

/**
 * 成本脱敏统一切换开关组件 (附录 T)
 * 规则：眼睛睁开 (Eye) = 明文可见；眼睛闭上 (EyeOff) = 脱敏 (****)
 */
export const CostPrivacyToggle: React.FC<CostPrivacyToggleProps> = ({
  className = '',
  showLabel = true,
  size = 'md',
}) => {
  const { isCostVisible, toggleCostVisible } = useCostPrivacy();

  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <button
      type="button"
      onClick={toggleCostVisible}
      title={isCostVisible ? '点击隐藏敏感成本数据' : '点击显示敏感成本数据'}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
        isCostVisible
          ? 'bg-amber-50 text-amber-700 border-amber-200/80 hover:bg-amber-100/80 shadow-xs'
          : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/80'
      } ${className}`}
    >
      {isCostVisible ? (
        <Eye size={iconSize} className="text-amber-600 shrink-0" />
      ) : (
        <EyeOff size={iconSize} className="text-slate-400 shrink-0" />
      )}
      {showLabel && (
        <span>{isCostVisible ? '明文显示' : '成本脱敏'}</span>
      )}
    </button>
  );
};
