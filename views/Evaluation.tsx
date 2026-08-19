
import React, { useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useCostPrivacy } from '../src/hooks/useCostPrivacy';
import { User, ValueCreationLog, MiningResource, AuditStatus, Role } from '../types';
import { computeAllEvaluations } from '../src/utils/valueEvaluation';
import { formatAmount, formatRatio } from '../src/utils/formatters';
import { InfoTip } from '../src/components/InfoTip';
import { BusinessDateFilter } from '../src/components/BusinessDateFilter';

interface EvaluationProps {
  users: User[];
  logs?: ValueCreationLog[];
  auditLogs?: ValueCreationLog[];
  resources: MiningResource[];
  currentTime?: Date;
  onFilterMonthChange?: (month: string) => void;
}

const Evaluation: React.FC<EvaluationProps> = ({ users, logs = [], auditLogs, resources, currentTime, onFilterMonthChange }) => {
  const { isCostVisible, toggleCostVisible, maskMoney, maskText } = useCostPrivacy();
  const effectiveLogs = auditLogs || logs;
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }); // 默认当月

  const handleMonthChange = (month: string) => {
    setFilterMonth(month);
    if (onFilterMonthChange) {
      onFilterMonthChange(month);
    }
  };

  // 核心评价逻辑：使用全量审计日志 auditLogs（包含 JZCZ + DTCB）作为计算基准
  const evaluations = useMemo(() => {
    return computeAllEvaluations(users, effectiveLogs, resources, filterMonth);
  }, [users, effectiveLogs, resources, filterMonth]);

  return (
    <div className="w-full space-y-4 md:space-y-6 animate-in fade-in duration-500 pb-20">
      {/* 顶部标题 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 md:gap-6">
          <h3 className="text-base md:text-lg font-bold text-slate-800 tracking-tight uppercase">全员价值贡献评价矩阵</h3>
        </div>
        <span className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest self-start sm:self-center">
          综合价值评价与效率审计
        </span>
      </div>

      {/* KPI 卡片组：四格小白块 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '卓越级', count: evaluations.filter(e => e.tier === 'S').length, color: 'text-amber-600', desc: '效率 > 2.5 · 合伙人权益' },
          { label: '进取级', count: evaluations.filter(e => e.tier === 'A').length, color: 'text-blue-600', desc: '效率 1.5-2.5 · 核心骨干' },
          { label: '稳健级', count: evaluations.filter(e => e.tier === 'B').length, color: 'text-emerald-600', desc: '效率 1.2-1.5 · 平衡实体' },
          { label: '改进级', count: evaluations.filter(e => e.tier === 'C').length, color: 'text-rose-600', desc: '效率 < 1.2 · 负熵逻辑' },
        ].map((tier, i) => (
          <div key={i} className="bg-white p-3 sm:p-3.5 rounded-sm border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{tier.label}</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase">采集主体</span>
            </div>
            <div className="my-1">
              <span className={`text-xl sm:text-2xl font-black font-mono ${tier.color}`}>{tier.count}</span>
            </div>
            <p className="text-[9px] text-slate-400 font-medium truncate" title={tier.desc}>{tier.desc}</p>
          </div>
        ))}
      </div>

      {/* 全员评价明细表：操作台卡片 */}
      <div className="bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden">
        <div className="bg-slate-50 px-4 sm:px-6 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">全量价值贡献审计记录</span>
          </div>
          <div className="flex items-center gap-2">
            <BusinessDateFilter 
              month={filterMonth}
              onMonthChange={handleMonthChange}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200">
                <th className="py-2.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-left whitespace-nowrap">采集主体</th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right whitespace-nowrap">
                  <span className="inline-flex items-center justify-end">
                    收入包
                    <InfoTip title="收入包口径" content="当月所有审核通过/已确权的提纯业务积分（收款包/产兑包）总和。" />
                  </span>
                </th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right whitespace-nowrap">
                  <div className="flex items-center justify-end space-x-1">
                    <span>成本包</span>
                    <InfoTip title="成本包口径" content="刚性工资包 + 对应职级消耗成本（款专：工资+A；产专：工资+B1）。" />
                    <button 
                      type="button"
                      onClick={toggleCostVisible}
                      className="p-1 hover:bg-slate-200 rounded transition-colors ml-1 cursor-pointer"
                      title={isCostVisible ? "点击隐藏成本" : "点击显示成本"}
                    >
                      {isCostVisible ? <Eye size={12} className="text-slate-400" /> : <EyeOff size={12} className="text-slate-400" />}
                    </button>
                  </div>
                </th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right whitespace-nowrap">
                  <span className="inline-flex items-center justify-end">
                    月度贡献
                    <InfoTip title="月度贡献口径" content="月度收产包 - 月度成本包 = 月度贡献。正值代表正向价值积累。" />
                  </span>
                </th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center whitespace-nowrap">
                  <span className="inline-flex items-center justify-center">
                    月度效率
                    <InfoTip title="月度效率口径" content="月度总收入包 ÷ 月度总成本包。>1.5 为卓越，>1.2 为稳健。" />
                  </span>
                </th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center whitespace-nowrap">
                  <span className="inline-flex items-center justify-center">
                    年度效率
                    <InfoTip title="年度效率口径" content="当年累计总收入包 ÷ 当年累计总成本包。" />
                  </span>
                </th>
                <th className="py-2.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right whitespace-nowrap">管理决策路由</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {evaluations.map(e => (
                <tr key={e.userId} className={`hover:bg-slate-50/70 transition-colors group ${e.tier === 'S' ? 'bg-amber-50/20' : ''}`}>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center space-x-2.5">
                      <div className={`w-7 h-7 rounded-sm flex items-center justify-center text-white font-bold text-xs shadow-2xs shrink-0 ${e.tier === 'S' ? 'bg-amber-500' : (e.monthlyEfficiency < 1 ? 'bg-rose-500' : 'bg-slate-900')}`}>
                        {e.userName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold text-slate-900 text-xs tracking-tight truncate">{e.userName}</span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded-xs border ${e.tierColor} border-current opacity-85 uppercase whitespace-nowrap shrink-0`}>{e.category}</span>
                        </div>
                        <div className="text-[9px] text-slate-400 font-mono tracking-tight uppercase truncate">编号_{e.userId} · {e.tierLabel}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <span className="font-mono font-bold text-slate-900 text-xs">{formatAmount(e.monthlyIncome)}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <div className="flex flex-col items-end">
                      <span className="font-mono font-bold text-slate-900 text-xs">{maskMoney(Math.round(e.monthlyCost))}</span>
                      <span className="text-[9px] text-slate-400 mt-0.5">
                        {maskText(e.category.includes('款专') 
                          ? `工资 ${formatAmount(e.baseSalary)} + A ${formatAmount(e.aCost)}` 
                          : (e.category.includes('产专') || e.category === '经管员高产专' 
                            ? `工资 ${formatAmount(e.baseSalary)} + B1 ${formatAmount(e.b1Cost)}` 
                            : `工资 ${formatAmount(e.baseSalary)}`))}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <div className="flex flex-col items-end">
                      <span className={`font-mono font-bold text-xs ${e.contribution > 0 ? 'text-emerald-600' : (e.contribution < 0 ? 'text-rose-500' : 'text-slate-400')}`}>
                        {e.contribution > 0 ? `+${formatAmount(e.contribution)}` : formatAmount(e.contribution)}
                      </span>
                      <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded-xs mt-0.5 border ${e.contributionStatus === '优秀' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : (e.contributionStatus === '预警' ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-amber-50 text-amber-600 border-amber-200')}`}>
                        {e.contributionStatus}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    <div className="flex flex-col items-center">
                      <span className={`text-xs font-bold font-mono ${e.monthlyEfficiency >= 1.5 ? 'text-blue-600' : (e.monthlyEfficiency >= 1.2 ? 'text-emerald-600' : 'text-rose-500')}`}>
                        {formatRatio(e.monthlyEfficiency)}
                      </span>
                      <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden flex mt-1">
                        <div 
                          className={`h-full transition-all duration-500 ${e.monthlyEfficiency >= 1 ? 'bg-blue-500' : 'bg-rose-500'}`} 
                          style={{ width: `${Math.min(100, e.monthlyEfficiency * 30)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    <span className={`text-xs font-bold font-mono ${e.yearlyEfficiency >= 1.5 ? 'text-blue-500' : (e.yearlyEfficiency >= 1.2 ? 'text-emerald-500' : 'text-slate-400')}`}>
                      {formatRatio(e.yearlyEfficiency)}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <div className="flex flex-col items-end space-y-0.5">
                      {e.tier === 'S' && <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold rounded-xs uppercase tracking-wider">核心资产/重点保护</span>}
                      {e.tier === 'A' && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-bold rounded-xs uppercase tracking-wider">合伙人权杖晋升</span>}
                      {e.tier === 'B' && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold rounded-xs uppercase tracking-wider">标准评价/持续激励</span>}
                      {e.tier === 'C' && <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 text-[9px] font-bold rounded-xs uppercase tracking-wider">负向资产/熔断淘汰</span>}
                      
                      <p className="text-[8px] font-medium text-slate-400 tracking-tight">
                        {e.fixedRatio > 70 ? '薪酬刚性过高：触发降薪' : (e.fixedRatio < 40 && e.contribution > 5000 ? '弹性空间充裕：建议加薪' : '薪酬结构稳定')}
                      </p>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Evaluation;
