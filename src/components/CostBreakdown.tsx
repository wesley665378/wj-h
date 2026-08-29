import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Tooltip } from '@/components/UI';

export interface CostBreakdownProps {
  total: number;
  salary: number;
  rank: number;
  dClass: number;
  fxdc: number;
}

export const CostBreakdown: React.FC<CostBreakdownProps> = ({ total, salary, rank, dClass, fxdc }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col w-full text-right">
      <div className="flex items-center justify-end cursor-pointer gap-2" onClick={() => setExpanded(!expanded)}>
        <span className="text-[13px] font-bold tabular-nums text-slate-800">{Math.round(total)}</span>
        {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </div>
      
      {expanded && (
        <div className="mt-2 p-2 bg-slate-50 rounded-lg text-[11px] text-slate-600 space-y-1">
          <div className="flex justify-between"><span>刚性工资</span><span>{Math.round(salary)}</span></div>
          <div className="flex justify-between"><span>职级消耗</span><span>{Math.round(rank)}</span></div>
          <div className="flex justify-between items-center gap-1">
             <div className="flex items-center gap-0.5 cursor-help">
                D类分摊
                <Tooltip content="D类中心开支分摊"><Info size={10} className="text-slate-400" /></Tooltip>
             </div>
             <span>{Math.round(dClass)}</span>
          </div>
          <div className="flex justify-between items-center gap-1">
             <div className="flex items-center gap-0.5 cursor-help">
                FXDC
                <Tooltip content="非有效工时对冲"><Info size={10} className="text-slate-400" /></Tooltip>
             </div>
             <span>{Math.round(fxdc)}</span>
          </div>
        </div>
      )}
    </div>
  );
};
