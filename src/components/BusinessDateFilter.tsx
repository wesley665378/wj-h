import React, { useMemo } from 'react';
import { Calendar, Search, RotateCcw, X } from 'lucide-react';
import { getLocalDateString, getLocalMonthString } from '../utils/dateUtils';

export interface BusinessDateFilterProps {
  /** 业务月份 (YYYY-MM) */
  month?: string;
  onMonthChange?: (month: string) => void;
  /** 自定义查询起始日期 (YYYY-MM-DD) */
  startDate?: string;
  /** 自定义查询截止日期 (YYYY-MM-DD) */
  endDate?: string;
  onDateRangeChange?: (startDate: string, endDate: string) => void;
  /** 清除/重置筛选回调 */
  onClear?: () => void;
  /** 自定义月份选项列表 */
  monthOptions?: string[];
  /** 是否紧凑排版 */
  compact?: boolean;
  className?: string;
}

/**
 * 统一业务日期与月份筛选组件
 * 
 * 控件顺序统一为右簇排布：
 * 自定义查询 | 起止日（仅自定义激活时） | 清除 | 分隔 | 业务月份：月份选择
 */
export const BusinessDateFilter: React.FC<BusinessDateFilterProps> = ({
  month,
  onMonthChange,
  startDate,
  endDate,
  onDateRangeChange,
  onClear,
  monthOptions,
  compact = false,
  className = ''
}) => {
  const isCustomRange = Boolean(startDate || endDate);
  const supportsRange = Boolean(onDateRangeChange);

  // 默认备选月份列表
  const defaultMonths = useMemo(() => {
    if (monthOptions && monthOptions.length > 0) return monthOptions;
    const list: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      list.push(`${y}-${m}`);
    }
    return list;
  }, [monthOptions]);

  const handleSelectMonth = (newMonth: string) => {
    if (onDateRangeChange) {
      onDateRangeChange('', '');
    }
    if (onMonthChange) {
      onMonthChange(newMonth);
    }
  };

  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    if (onMonthChange) {
      onMonthChange('');
    }
    if (onDateRangeChange) {
      if (type === 'start') {
        onDateRangeChange(value, endDate || value || getLocalDateString());
      } else {
        onDateRangeChange(startDate || value || getLocalDateString(), value);
      }
    }
  };

  const handleToggleCustom = () => {
    if (isCustomRange) {
      // 退出自定义，回到按月
      if (onDateRangeChange) onDateRangeChange('', '');
      if (onMonthChange) onMonthChange(month || getLocalMonthString());
    } else {
      // 启用自定义
      if (onMonthChange) onMonthChange('');
      const today = getLocalDateString();
      if (onDateRangeChange) {
        onDateRangeChange(startDate || today, endDate || today);
      }
    }
  };

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else {
      if (onDateRangeChange) onDateRangeChange('', '');
      if (onMonthChange) onMonthChange(getLocalMonthString());
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {/* 1. 自定义查询按钮与起止日 */}
      {supportsRange && (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleToggleCustom}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              isCustomRange
                ? 'bg-blue-600 text-white shadow-xs font-black'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
          >
            <Search size={12} />
            <span>自定义查询</span>
          </button>

          {/* 激活自定义时显示的起止日 */}
          {isCustomRange && (
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs shadow-xs">
              <input
                type="date"
                value={startDate || ''}
                onChange={(e) => handleCustomDateChange('start', e.target.value)}
                className="bg-transparent text-slate-800 font-mono text-xs font-bold outline-none cursor-pointer"
                title="起始日期"
              />
              <span className="text-slate-400 font-bold text-[11px]">至</span>
              <input
                type="date"
                value={endDate || ''}
                onChange={(e) => handleCustomDateChange('end', e.target.value)}
                className="bg-transparent text-slate-800 font-mono text-xs font-bold outline-none cursor-pointer"
                title="截止日期"
              />
            </div>
          )}

          {isCustomRange && (
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 px-2 py-1.5 rounded-xl transition-all whitespace-nowrap shadow-2xs"
              title="清除自定义区间并返回按月"
            >
              <RotateCcw size={11} />
              <span>清除</span>
            </button>
          )}

          <span className="text-slate-300 mx-0.5">|</span>
        </div>
      )}

      {/* 2. 业务月份下拉选择器 */}
      {onMonthChange && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-bold text-slate-500 whitespace-nowrap flex items-center gap-1">
            <Calendar size={12} className="text-slate-400" />
            <span>业务月份:</span>
          </span>
          <select
            value={isCustomRange ? '' : (month || getLocalMonthString())}
            onChange={(e) => handleSelectMonth(e.target.value)}
            className={`rounded-xl px-3 py-1.5 text-xs font-black outline-none transition-all cursor-pointer shadow-xs border ${
              !isCustomRange
                ? 'bg-white border-slate-200 text-slate-800 focus:ring-2 focus:ring-blue-500/20'
                : 'bg-slate-100 border-slate-200 text-slate-400 hover:text-slate-600'
            }`}
          >
            {isCustomRange && <option value="">自定义区间中</option>}
            {defaultMonths.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

