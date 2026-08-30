import React, { useMemo, useState, useEffect } from 'react';
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
 * 自定义查询 | 起止日（仅自定义激活时） | 查询 | 清除 | 分隔 | 业务月份：月份选择
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

  const [localStartDate, setLocalStartDate] = useState(startDate || '');
  const [localEndDate, setLocalEndDate] = useState(endDate || '');

  useEffect(() => {
    setLocalStartDate(startDate || '');
    setLocalEndDate(endDate || '');
  }, [startDate, endDate]);

  // 默认备选月份列表
  const defaultMonths = useMemo(() => {
    if (monthOptions && monthOptions.length > 0) return monthOptions;
    const list: string[] = [];
    const now = new Date();
    // 默认显示过去 36 个月 (3 年) 以支持跨年查询
    for (let i = 0; i < 36; i++) {
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
    if (type === 'start') {
      setLocalStartDate(value);
    } else {
      setLocalEndDate(value);
    }
  };

  const handleApplyDateRange = () => {
    if (onMonthChange) onMonthChange('');
    if (onDateRangeChange) {
      onDateRangeChange(localStartDate || getLocalDateString(), localEndDate || getLocalDateString());
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
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleToggleCustom}
            className={`flex items-center gap-1.5 px-3 h-10 rounded-[4px] text-[13px] font-bold transition-all whitespace-nowrap cursor-pointer ${
              isCustomRange
                ? 'bg-[#1a56db] text-white shadow-xs font-black'
                : 'bg-white hover:bg-slate-50 text-slate-700 border border-[#b8d0f7]'
            }`}
          >
            <Search size={14} />
            <span>自定义查询</span>
          </button>

          {/* 激活自定义时显示的起止日 */}
          {isCustomRange && (
            <div className="flex items-center gap-2 bg-white border border-[#b8d0f7] rounded-[4px] px-3 h-10 text-[13px] shadow-xs">
              <input
                type="date"
                value={localStartDate || ''}
                onChange={(e) => handleCustomDateChange('start', e.target.value)}
                className="bg-transparent text-slate-800 font-mono text-[13px] font-bold outline-none cursor-pointer"
                title="起始日期"
              />
              <span className="text-slate-400 font-bold text-[11px]">至</span>
              <input
                type="date"
                value={localEndDate || ''}
                onChange={(e) => handleCustomDateChange('end', e.target.value)}
                className="bg-transparent text-slate-800 font-mono text-[13px] font-bold outline-none cursor-pointer"
                title="截止日期"
              />
            </div>
          )}

          {isCustomRange && (
            <button
              type="button"
              onClick={handleApplyDateRange}
              className="px-4 h-10 bg-[#1a56db] hover:bg-blue-600 active:scale-95 text-white font-bold text-[13px] rounded-[4px] shadow-sm transition-all cursor-pointer flex items-center justify-center whitespace-nowrap"
            >
              查 询
            </button>
          )}

          {isCustomRange && (
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1 text-[12px] font-bold text-slate-500 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 px-2.5 h-10 rounded-[4px] transition-all whitespace-nowrap shadow-2xs cursor-pointer"
              title="清除自定义区间并返回按月"
            >
              <RotateCcw size={12} />
              <span>清除</span>
            </button>
          )}
          <span className="text-slate-300 mx-0.5">|</span>
        </div>
      )}

      {/* 2. 业务月份下拉选择器 */}
      {onMonthChange && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4 whitespace-nowrap gap-1">
            <Calendar size={13} className="text-slate-400" />
            <span>业务月份:</span>
          </span>
          <select
            value={isCustomRange ? '' : (month || getLocalMonthString())}
            onChange={(e) => handleSelectMonth(e.target.value)}
            className={`h-10 rounded-[4px] px-3 py-2 text-[13px] font-bold outline-none transition-all cursor-pointer shadow-xs border ${
              !isCustomRange
                ? 'bg-white border-[#b8d0f7] text-slate-800 focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10'
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

