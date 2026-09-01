import React, { useMemo, useState } from 'react';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { useCostPrivacy } from '../src/hooks/useCostPrivacy';
import { CostPrivacyToggle } from '../src/components/CostPrivacyToggle';
import { User, ValueCreationLog, MiningResource } from '../types';
import { computeAllEvaluations } from '../src/utils/valueEvaluation';
import { formatAmount, formatRatio } from '../src/utils/formatters';
import { InfoTip } from '../src/components/InfoTip';
import { BusinessDateFilter } from '../src/components/BusinessDateFilter';
import { getLocalMonthString } from '../src/utils/dateUtils';
import { UI_LABELS } from '../src/constants/uiLabels';

interface EvaluationProps {
  users: User[];
  logs?: ValueCreationLog[];
  auditLogs?: ValueCreationLog[];
  resources: MiningResource[];
  currentTime?: Date;
  onFilterMonthChange?: (month: string) => void;
}

const getTierBadgeText = (tier?: string) => {
  if (tier === 'S') return '核心资产/重点保护';
  if (tier === 'A') return '核心晋升储备';
  if (tier === 'B') return '标准评价/持续激励';
  return '负向资产/熔断淘汰';
};

const getTierBadgeClass = (tier?: string) => {
  if (tier === 'S') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (tier === 'A') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (tier === 'B') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
};

const Evaluation: React.FC<EvaluationProps> = ({ users, logs = [], auditLogs, resources, currentTime, onFilterMonthChange }) => {
  const { maskMoney } = useCostPrivacy();
  const effectiveLogs = auditLogs || logs;
  const [filterMonth, setFilterMonth] = useState<string>(() => getLocalMonthString());
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  // 自定义查询状态（模糊搜索、等级、类别）
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTier, setSelectedTier] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [expandedCosts, setExpandedCosts] = useState<Set<string>>(new Set());
  const toggleCost = (id: string) => {
    setExpandedCosts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 核心评价逻辑：使用全量审计日志 auditLogs（包含 JZCZ + DTCB）作为计算基准
  const evaluations = useMemo(() => {
    return computeAllEvaluations(users, effectiveLogs, resources, filterMonth, filterStartDate, filterEndDate);
  }, [users, effectiveLogs, resources, filterMonth, filterStartDate, filterEndDate]);

  // 过滤后的评价数据
  const filteredEvaluations = useMemo(() => {
    return evaluations.filter(e => {
      // 姓名/编号模糊搜索
      const matchQuery = !searchQuery.trim() || 
        e.userName.toLowerCase().includes(searchQuery.toLowerCase()) || 
        String(e.userId).toLowerCase().includes(searchQuery.toLowerCase());
      
      // 评价等级筛选
      const matchTier = selectedTier === 'ALL' || e.tier === selectedTier;
      
      // 角色分类筛选
      const matchCategory = selectedCategory === 'ALL' || e.category.includes(selectedCategory);

      return matchQuery && matchTier && matchCategory;
    });
  }, [evaluations, searchQuery, selectedTier, selectedCategory]);

  return (
    <div className="w-full space-y-4 md:space-y-6 animate-in fade-in duration-500 pb-6">
      {/* 顶部标题 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 md:gap-6">
          <h3 className="text-base md:text-lg font-bold text-slate-800 tracking-tight uppercase">全员价值贡献评价矩阵</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            综合价值评价与效率审计
          </span>
        </div>
      </div>

      {/* KPI 卡片组：四格小白块 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '卓越级', count: evaluations.filter(e => e.tier === 'S').length, color: 'text-amber-600', desc: '效率 > 2.5 · 核心激励权益' },
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

      {/* 全员评价明细表：朴素财务表 */}
      <div className="bg-white border border-[#E5E7EB] rounded-sm shadow-xs overflow-hidden">
        <div className="bg-slate-50 px-4 sm:px-6 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">全量价值贡献审计记录</span>
          </div>
        </div>

        {/* 自定义查询控制栏 */}
        <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-wrap items-center gap-3">
          {/* 时间筛选 */}
          <div className="flex items-center gap-2">
            <BusinessDateFilter 
              month={filterStartDate || filterEndDate ? '' : filterMonth}
              onMonthChange={(m) => {
                setFilterMonth(m);
                setFilterStartDate('');
                setFilterEndDate('');
                if (onFilterMonthChange) onFilterMonthChange(m);
              }}
              startDate={filterStartDate}
              endDate={filterEndDate}
              onDateRangeChange={(s, e) => {
                setFilterStartDate(s);
                setFilterEndDate(e);
                setFilterMonth('');
              }}
              onClear={() => {
                const nowM = getLocalMonthString();
                setFilterMonth(nowM);
                setFilterStartDate('');
                setFilterEndDate('');
                if (onFilterMonthChange) onFilterMonthChange(nowM);
              }}
            />
          </div>

          {/* 姓名/编号输入搜索 */}
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索姓名或员工编号..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 bg-white border border-[#b8d0f7] rounded-[4px] pl-9 pr-3 py-2 text-[13px] font-bold text-slate-800 focus:outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all placeholder:text-[#94a3b8]"
            />
          </div>

          {/* 评价等级筛选 */}
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4 whitespace-nowrap">评价等级:</span>
            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
              className="h-10 bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] font-bold text-slate-800 focus:outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all cursor-pointer"
            >
              <option value="ALL">全部等级</option>
              <option value="S">S - 卓越级</option>
              <option value="A">A - 进取级</option>
              <option value="B">B - 稳健级</option>
              <option value="C">C - 改进级</option>
            </select>
          </div>

          {/* 专家分类筛选 */}
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center h-4 whitespace-nowrap">角色分类:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-10 bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] font-bold text-slate-800 focus:outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all cursor-pointer"
            >
              <option value="ALL">全部类别</option>
              <option value="款专">收款专家 (款专)</option>
              <option value="产专">产值专家 (产专)</option>
              <option value="经管员">经管员</option>
            </select>
          </div>

          {/* 重置查询 */}
          {(searchQuery || selectedTier !== 'ALL' || selectedCategory !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedTier('ALL');
                setSelectedCategory('ALL');
              }}
              className="h-10 text-[13px] text-rose-600 hover:text-rose-700 font-bold px-3 py-2 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-[4px] transition-colors cursor-pointer flex items-center"
            >
              重置条件
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse">
            <thead>

              <tr className="bg-slate-50/80 border-b-2 border-[#D0D5DD]">
                <th className="py-2.5 px-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-left whitespace-nowrap border-r border-[#F1F5F9]">
                  采集主体
                </th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right whitespace-nowrap">
                  <span className="inline-flex items-center justify-end w-full">
                    收产包
                    <InfoTip 
                      title="收产包口径" 
                      content="产专：上行展示已确权+待确权产兑包；下行展示仅已确权产兑包。款专：当期收款包。" 
                    />
                  </span>
                </th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right whitespace-nowrap border-x border-[#F1F5F9]">
                  <div className="flex items-center justify-end space-x-1">
                    <span>成本包</span>
                    <InfoTip 
                      title="成本包口径" 
                      content="刚性工资包 + 对应职级消耗成本（款专：工资+A；产专：工资+B1）+ D类 - FXDC。" 
                    />
                    <CostPrivacyToggle size="sm" showLabel={false} className="ml-1" />
                  </div>
                </th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right whitespace-nowrap">
                  <span className="inline-flex items-center justify-end w-full">
                    月度贡献
                    <InfoTip title="月度贡献口径" content="该行收产包 − 成本包。正值代表正向价值积累。" />
                  </span>
                </th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right whitespace-nowrap">
                  <span className="inline-flex items-center justify-end w-full">
                    月度效率
                    <InfoTip title="月度效率口径" content="该行收产包 ÷ 成本包。>2.5 卓越，>=1.5 进取，>=1.2 稳健。" />
                  </span>
                </th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right whitespace-nowrap">
                  <span className="inline-flex items-center justify-end w-full">
                    年度效率
                    <InfoTip title="年度效率口径" content="当年累计收产包 ÷ 当年累计成本包。" />
                  </span>
                </th>
                <th className="py-2.5 px-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-left whitespace-nowrap">
                  <span className="inline-flex items-center">
                    管理决策路由
                    <InfoTip title="管理决策路由" content="根据各行效率分档自动生成的管理决策分类。" />
                  </span>
                </th>
              </tr>
            
</thead>
            <tbody className="[&_tr:last-child>td]:border-b-0 [&_tr:last-child]:border-b-0">

              {filteredEvaluations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest">
                    {UI_LABELS.EMPTY_DEFAULT}
                  </td>
                </tr>
              ) : (
                filteredEvaluations.map(e => {
                  const isProd = e.isProdExpert ?? (e.category?.includes('产专') || e.category === '经管员高产专');

                  if (isProd) {
                    const incomeUpper = e.monthlyIncomeUpper ?? ((e.confirmedValueConfirmed || 0) + (e.pendingValueConfirmed || 0));
                    const incomeLower = e.monthlyIncomeLower ?? (e.confirmedValueConfirmed || 0);
                    const contribUpper = e.contributionUpper ?? (incomeUpper - e.monthlyCost);
                    const contribLower = e.contributionLower ?? (incomeLower - e.monthlyCost);
                    const effUpper = e.monthlyEfficiencyUpper ?? (e.monthlyCost > 0 ? incomeUpper / e.monthlyCost : 0);
                    const effLower = e.monthlyEfficiencyLower ?? (e.monthlyCost > 0 ? incomeLower / e.monthlyCost : 0);
                    const yrEffUpper = e.yearlyEfficiencyUpper ?? e.yearlyEfficiency;
                    const yrEffLower = e.yearlyEfficiencyLower ?? e.yearlyEfficiency;
                    const tierUpper = e.tierUpper || e.tier;
                    const tierLower = e.tierLower || e.tier;

                    return (
                      <React.Fragment key={e.userId}>
                        {/* 上行 (已确权+待确权产兑包) */}
                        <tr className="hover:bg-slate-50/70 transition-colors">
                          {/* 1. 采集主体 (上下合并为一格) */}
                          <td rowSpan={2} className="py-2.5 px-3.5 text-left whitespace-nowrap align-middle border-b border-[#F1F5F9] border-r border-[#F1F5F9] bg-white">
                            <div className="font-bold text-xs text-slate-900">{e.userName}</div>
                            <div className="text-[10px] text-slate-400 font-mono tracking-tight mt-0.5">{e.category} · {e.userId}</div>
                          </td>
                          {/* 2. 收产包 (上行) */}
                          <td className="py-2 px-3 text-right whitespace-nowrap font-mono text-xs text-slate-800 border-b border-[#F1F5F9] font-medium">
                            {formatAmount(incomeUpper)}
                          </td>
                          {/* 3. 成本包 (上下合并为一格) */}
                          <td rowSpan={2} className="py-2.5 px-3 text-right whitespace-nowrap align-middle border-b border-[#F1F5F9] border-x border-[#F1F5F9] bg-white">
                            <div className="flex flex-col items-end w-full min-w-[120px]">
                              <div className="flex items-center justify-end space-x-2 w-full">
                                <span className="font-mono text-xs font-semibold text-slate-800">{maskMoney(e.monthlyCost)}</span>
                                <button onClick={() => toggleCost(e.userId)} className="text-slate-400 hover:text-slate-600 transition-colors flex items-center text-[9px] bg-slate-50 px-1 py-0.5 rounded border border-[#F1F5F9]">
                                  明细 {expandedCosts.has(e.userId) ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                                </button>
                              </div>
                              {expandedCosts.has(e.userId) && (
                                <div className="mt-2 w-full bg-slate-50/80 border border-[#F1F5F9] rounded p-1.5 space-y-1 text-[10px] text-slate-500 font-mono text-right">
                                  <div className="flex justify-between items-center">
                                    <span>工资</span>
                                    <span className="text-slate-700">{maskMoney(e.baseSalary || 0)}</span>
                                  </div>
                                  {e.isRevenueExpert && (
                                    <div className="flex justify-between items-center">
                                      <span>A类</span>
                                      <span className="text-slate-700">{maskMoney(e.aCost || 0)}</span>
                                    </div>
                                  )}
                                  {e.isProdExpert && (
                                    <div className="flex justify-between items-center">
                                      <span>B1类</span>
                                      <span className="text-slate-700">{maskMoney(e.b1Cost || 0)}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between items-center">
                                    <span className="flex items-center text-slate-400">
                                      D类
                                      <InfoTip title="D类成本" content="经营单元开支，无项目。按实际发生月人员平均分摊" className="ml-1 opacity-70 hover:opacity-100" />
                                    </span>
                                    <span className="text-slate-700">{maskMoney(e.dCost || 0)}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="flex items-center text-slate-400">
                                      FXDC
                                      <InfoTip title="FXDC" content="非有效工时对冲，冲抵刚性工资包" className="ml-1 opacity-70 hover:opacity-100" />
                                    </span>
                                    <span className="text-emerald-600">-{maskMoney(e.nonEffectiveDeduction || 0)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          {/* 4. 月度贡献 (上行) */}
                          <td className="py-2 px-3 text-right whitespace-nowrap font-mono text-xs font-semibold border-b border-[#F1F5F9]">
                            <span className={contribUpper > 0 ? 'text-emerald-600' : contribUpper < 0 ? 'text-rose-500' : 'text-slate-500'}>
                              {contribUpper > 0 ? `+${formatAmount(contribUpper)}` : formatAmount(contribUpper)}
                            </span>
                          </td>
                          {/* 5. 月度效率 (上行) */}
                          <td className="py-2 px-3 text-right whitespace-nowrap font-mono text-xs font-bold border-b border-[#F1F5F9]">
                            <span className={effUpper >= 1.5 ? 'text-blue-600' : effUpper >= 1.2 ? 'text-emerald-600' : 'text-rose-500'}>
                              {formatRatio(effUpper)}
                            </span>
                          </td>
                          {/* 6. 年度效率 (上行) */}
                          <td className="py-2 px-3 text-right whitespace-nowrap font-mono text-xs font-bold border-b border-[#F1F5F9]">
                            <span className={yrEffUpper >= 1.5 ? 'text-blue-600' : yrEffUpper >= 1.2 ? 'text-emerald-600' : 'text-slate-500'}>
                              {formatRatio(yrEffUpper)}
                            </span>
                          </td>
                          {/* 7. 管理决策路由 (上行) */}
                          <td className="py-2 px-3.5 text-left whitespace-nowrap border-b border-[#F1F5F9]">
                            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded-xs border ${getTierBadgeClass(tierUpper)}`}>
                              {getTierBadgeText(tierUpper)}
                            </span>
                          </td>
                        </tr>
                        {/* 下行 (仅已确权产兑包) */}
                        <tr className="hover:bg-slate-50/70 transition-colors">
                          {/* 2. 收产包 (下行) */}
                          <td className="py-2 px-3 text-right whitespace-nowrap font-mono text-xs text-slate-800 border-b border-[#F1F5F9] font-medium">
                            {formatAmount(incomeLower)}
                          </td>
                          {/* 4. 月度贡献 (下行) */}
                          <td className="py-2 px-3 text-right whitespace-nowrap font-mono text-xs font-semibold border-b border-[#F1F5F9]">
                            <span className={contribLower > 0 ? 'text-emerald-600' : contribLower < 0 ? 'text-rose-500' : 'text-slate-500'}>
                              {contribLower > 0 ? `+${formatAmount(contribLower)}` : formatAmount(contribLower)}
                            </span>
                          </td>
                          {/* 5. 月度效率 (下行) */}
                          <td className="py-2 px-3 text-right whitespace-nowrap font-mono text-xs font-bold border-b border-[#F1F5F9]">
                            <span className={effLower >= 1.5 ? 'text-blue-600' : effLower >= 1.2 ? 'text-emerald-600' : 'text-rose-500'}>
                              {formatRatio(effLower)}
                            </span>
                          </td>
                          {/* 6. 年度效率 (下行) */}
                          <td className="py-2 px-3 text-right whitespace-nowrap font-mono text-xs font-bold border-b border-[#F1F5F9]">
                            <span className={yrEffLower >= 1.5 ? 'text-blue-600' : yrEffLower >= 1.2 ? 'text-emerald-600' : 'text-slate-500'}>
                              {formatRatio(yrEffLower)}
                            </span>
                          </td>
                          {/* 7. 管理决策路由 (下行) */}
                          <td className="py-2 px-3.5 text-left whitespace-nowrap border-b border-[#F1F5F9]">
                            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded-xs border ${getTierBadgeClass(tierLower)}`}>
                              {getTierBadgeText(tierLower)}
                            </span>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  }

                  // 款专 (单行)
                  return (
                    <tr key={e.userId} className="hover:bg-slate-50/70 transition-colors border-b border-[#F1F5F9] last:border-b-0">
                      {/* 1. 采集主体 */}
                      <td className="py-2.5 px-3.5 text-left whitespace-nowrap align-middle border-r border-[#F1F5F9]">
                        <div className="font-bold text-xs text-slate-900">{e.userName}</div>
                        <div className="text-[10px] text-slate-400 font-mono tracking-tight mt-0.5">{e.category} · {e.userId}</div>
                      </td>
                      {/* 2. 收产包 */}
                      <td className="py-2 px-3 text-right whitespace-nowrap font-mono text-xs text-slate-800 font-medium">
                        {formatAmount(e.monthlyIncome)}
                      </td>
                      {/* 3. 成本包 */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap align-middle border-x border-[#F1F5F9]">
                        <div className="flex flex-col items-end w-full min-w-[120px]">
                          <div className="flex items-center justify-end space-x-2 w-full">
                            <span className="font-mono text-xs font-semibold text-slate-800">{maskMoney(e.monthlyCost)}</span>
                            <button onClick={() => toggleCost(e.userId)} className="text-slate-400 hover:text-slate-600 transition-colors flex items-center text-[9px] bg-slate-50 px-1 py-0.5 rounded border border-[#F1F5F9]">
                              明细 {expandedCosts.has(e.userId) ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                            </button>
                          </div>
                          {expandedCosts.has(e.userId) && (
                            <div className="mt-2 w-full bg-slate-50/80 border border-[#F1F5F9] rounded p-1.5 space-y-1 text-[10px] text-slate-500 font-mono text-right">
                              <div className="flex justify-between items-center">
                                <span>工资</span>
                                <span className="text-slate-700">{maskMoney(e.baseSalary || 0)}</span>
                              </div>
                              {e.isRevenueExpert && (
                                <div className="flex justify-between items-center">
                                  <span>A类</span>
                                  <span className="text-slate-700">{maskMoney(e.aCost || 0)}</span>
                                </div>
                              )}
                              {e.isProdExpert && (
                                <div className="flex justify-between items-center">
                                  <span>B1类</span>
                                  <span className="text-slate-700">{maskMoney(e.b1Cost || 0)}</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center">
                                <span className="flex items-center text-slate-400">
                                  D类
                                  <InfoTip title="D类成本" content="经营单元开支，无项目。按实际发生月人员平均分摊" className="ml-1 opacity-70 hover:opacity-100" />
                                </span>
                                <span className="text-slate-700">{maskMoney(e.dCost || 0)}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="flex items-center text-slate-400">
                                  FXDC
                                  <InfoTip title="FXDC" content="非有效工时对冲，冲抵刚性工资包" className="ml-1 opacity-70 hover:opacity-100" />
                                </span>
                                <span className="text-emerald-600">-{maskMoney(e.nonEffectiveDeduction || 0)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      {/* 4. 月度贡献 */}
                      <td className="py-2 px-3 text-right whitespace-nowrap font-mono text-xs font-semibold">
                        <span className={e.contribution > 0 ? 'text-emerald-600' : e.contribution < 0 ? 'text-rose-500' : 'text-slate-500'}>
                          {e.contribution > 0 ? `+${formatAmount(e.contribution)}` : formatAmount(e.contribution)}
                        </span>
                      </td>
                      {/* 5. 月度效率 */}
                      <td className="py-2 px-3 text-right whitespace-nowrap font-mono text-xs font-bold">
                        <span className={e.monthlyEfficiency >= 1.5 ? 'text-blue-600' : e.monthlyEfficiency >= 1.2 ? 'text-emerald-600' : 'text-rose-500'}>
                          {formatRatio(e.monthlyEfficiency)}
                        </span>
                      </td>
                      {/* 6. 年度效率 */}
                      <td className="py-2 px-3 text-right whitespace-nowrap font-mono text-xs font-bold">
                        <span className={e.yearlyEfficiency >= 1.5 ? 'text-blue-600' : e.yearlyEfficiency >= 1.2 ? 'text-emerald-600' : 'text-slate-500'}>
                          {formatRatio(e.yearlyEfficiency)}
                        </span>
                      </td>
                      {/* 7. 管理决策路由 */}
                      <td className="py-2 px-3.5 text-left whitespace-nowrap">
                        <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded-xs border ${getTierBadgeClass(e.tier)}`}>
                          {getTierBadgeText(e.tier)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            
</tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Evaluation;
