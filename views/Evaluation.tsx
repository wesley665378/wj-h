
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
    <div className="w-full space-y-8 animate-in fade-in duration-700 pb-24">
      {/* 顶部标题 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-sm border border-slate-100">
        <div>
          <h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase flex items-center">
            <span className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white text-xl mr-5 shadow-2xl">⚖️</span>
            全员价值贡献评价矩阵
          </h3>
        </div>
      </div>

      {/* KPI 卡片组：能级画像 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
         {[
            { label: '卓越级', count: evaluations.filter(e => e.tier === 'S').length, color: 'text-amber-500', desc: '效率 > 2.5，合伙人权益' },
            { label: '进取级', count: evaluations.filter(e => e.tier === 'A').length, color: 'text-blue-500', desc: '效率 1.5-2.5，核心骨干力量' },
            { label: '稳健级', count: evaluations.filter(e => e.tier === 'B').length, color: 'text-emerald-500', desc: '效率 1.2-1.5，维持平衡实体' },
            { label: '改进级', count: evaluations.filter(e => e.tier === 'C').length, color: 'text-rose-500', desc: '效率 < 1.2，触发负熵逻辑' },
         ].map((tier, i) => (
            <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all">
               <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${tier.color}`}>{tier.label}</p>
               <div className="flex items-end space-x-2">
                  <h4 className={`text-4xl font-black font-mono ${tier.color}`}>{tier.count}</h4>
                  <span className="text-slate-300 font-bold mb-1">采集主体</span>
               </div>
               <p className="text-[9px] text-slate-400 mt-4 font-bold leading-tight uppercase tracking-tighter">{tier.desc}</p>
            </div>
         ))}
      </div>

      {/* 全员评价明细表：强化评价与效率比 */}
      <div className="bg-white rounded-[4rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="p-8 md:p-10 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
           <div className="flex items-center space-x-3">
             <h4 className="text-sm font-black text-slate-900 uppercase tracking-[0.3em]">全量价值贡献审计记录</h4>
           </div>
           <div className="flex items-center">
             <BusinessDateFilter 
               month={filterMonth}
               onMonthChange={handleMonthChange}
             />
           </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left whitespace-nowrap">采集主体</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">
                  <span className="inline-flex items-center justify-end">
                    收入包
                    <InfoTip title="收入包口径" content="当月所有审核通过/已确权的提纯业务积分（收款包/产兑包）总和。" />
                  </span>
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">
                  <div className="flex items-center justify-end space-x-1">
                    <span>成本包</span>
                    <InfoTip title="成本包口径" content="刚性工资包 + 对应职级消耗成本（款专：工资+A；产专：工资+B1）。" />
                    <button 
                      onClick={toggleCostVisible}
                      className="p-1 hover:bg-slate-200/50 rounded transition-colors ml-1"
                      title={isCostVisible ? "点击隐藏成本" : "点击显示成本"}
                    >
                      {isCostVisible ? <Eye size={12} className="text-slate-400" /> : <EyeOff size={12} className="text-slate-400" />}
                    </button>
                  </div>
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">
                  <span className="inline-flex items-center justify-end">
                    月度贡献
                    <InfoTip title="月度贡献口径" content="月度收入包 - 月度成本包 = 贡献净值。正值代表正向价值积累。" />
                  </span>
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center whitespace-nowrap">
                  <span className="inline-flex items-center justify-center">
                    月度 ROI
                    <InfoTip title="月度 ROI" content="月度总收入包 ÷ 月度总成本包。>1.5 为卓越，>1.2 为稳健。" />
                  </span>
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center whitespace-nowrap">
                  <span className="inline-flex items-center justify-center">
                    年度 ROI
                    <InfoTip title="年度 ROI" content="当年累计总收入包 ÷ 当年累计总成本包。" />
                  </span>
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">管理决策路由</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {evaluations.map(e => (
                <tr key={e.userId} className={`hover:bg-slate-50 transition-all group ${e.tier === 'S' ? 'bg-amber-50/20' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-xs transition-all group-hover:scale-105 shrink-0 ${e.tier === 'S' ? 'bg-amber-500' : (e.monthlyEfficiency < 1 ? 'bg-rose-500' : 'bg-slate-900')}`}>
                        {e.userName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                           <span className="font-black text-slate-900 text-sm tracking-tight truncate">{e.userName}</span>
                           <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border ${e.tierColor} border-current opacity-80 uppercase whitespace-nowrap shrink-0`}>{e.category}</span>
                        </div>
                        <div className="text-[9px] text-slate-400 font-bold tracking-widest mt-0.5 uppercase truncate">编号_{e.userId} · {e.tierLabel}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right whitespace-nowrap">
                    <span className="font-mono font-black text-slate-900 text-sm">{formatAmount(e.monthlyIncome)}</span>
                  </td>
                  <td className="px-4 py-4 text-right whitespace-nowrap">
                    <div className="flex flex-col items-end">
                      <span className="font-mono font-bold text-slate-900 text-xs">{maskMoney(Math.round(e.monthlyCost))}</span>
                      <span className="text-[9px] font-bold text-slate-400 mt-0.5">
                        {maskText(e.category.includes('款专') 
                          ? `工资 ${formatAmount(e.baseSalary)} + A ${formatAmount(e.aCost)}` 
                          : (e.category.includes('产专') || e.category === '经管员高产专' 
                            ? `工资 ${formatAmount(e.baseSalary)} + B1 ${formatAmount(e.b1Cost)}` 
                            : `工资 ${formatAmount(e.baseSalary)}`))}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right whitespace-nowrap">
                    <div className="flex flex-col items-end">
                      <span className={`font-mono font-black text-xs ${e.contribution > 0 ? 'text-emerald-600' : (e.contribution < 0 ? 'text-rose-500' : 'text-slate-400')}`}>
                        {e.contribution > 0 ? `+${formatAmount(e.contribution)}` : formatAmount(e.contribution)}
                      </span>
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded mt-1 ${e.contributionStatus === '优秀' ? 'bg-emerald-50 text-emerald-600' : (e.contributionStatus === '预警' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600')}`}>
                        {e.contributionStatus}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center whitespace-nowrap">
                    <div className="flex flex-col items-center">
                      <span className={`text-sm font-black font-mono ${e.monthlyEfficiency >= 1.5 ? 'text-blue-600' : (e.monthlyEfficiency >= 1.2 ? 'text-emerald-600' : 'text-rose-500')}`}>
                        {formatRatio(e.monthlyEfficiency)}
                      </span>
                      <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden flex mt-1">
                        <div 
                          className={`h-full transition-all duration-700 ${e.monthlyEfficiency >= 1 ? 'bg-blue-500' : 'bg-rose-500'}`} 
                          style={{ width: `${Math.min(100, e.monthlyEfficiency * 30)}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center whitespace-nowrap">
                    <span className={`text-xs font-black font-mono ${e.yearlyEfficiency >= 1.5 ? 'text-blue-500' : (e.yearlyEfficiency >= 1.2 ? 'text-emerald-500' : 'text-slate-400')}`}>
                      {formatRatio(e.yearlyEfficiency)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    <div className="flex flex-col items-end space-y-1">
                      {e.tier === 'S' && <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-[9px] font-black rounded-lg uppercase tracking-widest shadow-2xs">核心资产/重点保护</span>}
                      {e.tier === 'A' && <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-[9px] font-black rounded-lg uppercase tracking-widest shadow-2xs">合伙人权杖晋升</span>}
                      {e.tier === 'B' && <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-[9px] font-black rounded-lg uppercase tracking-widest">标准评价/持续激励</span>}
                      {e.tier === 'C' && <span className="px-2.5 py-1 bg-rose-100 text-rose-700 text-[9px] font-black rounded-lg uppercase tracking-widest animate-pulse">负向资产/熔断淘汰</span>}
                      
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
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
