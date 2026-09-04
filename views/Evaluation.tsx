import React, { useMemo, useState } from 'react';
import { Search, ChevronDown, ChevronUp, Crown, TrendingUp, ShieldCheck, AlertTriangle } from 'lucide-react';
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
  if (tier === 'S') return '核心资产 · 重点保护';
  if (tier === 'A') return '核心晋升 · 业务中坚';
  if (tier === 'B') return '标准评价 · 持续激励';
  return '价值逆差 · 重点赋能';
};

const getTierBadgeClass = (tier?: string) => {
  if (tier === 'S') return 'bg-slate-900 text-white border-slate-900';
  if (tier === 'A') return 'bg-slate-100 text-slate-800 border-slate-400';
  if (tier === 'B') return 'bg-white text-slate-700 border-slate-300';
  return 'bg-slate-50 text-rose-600 border-slate-300';
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

  type SortField = 'userName' | 'monthlyIncome' | 'monthlyCost' | 'contribution' | 'monthlyEfficiency' | 'historyDebt' | 'yearlyContribution' | 'yearlyEfficiency' | 'tier' | null;
  type SortOrder = 'asc' | 'desc' | null;

  const [sortField, setSortField] = useState<SortField>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortOrder === 'desc') {
        setSortOrder('asc');
      } else if (sortOrder === 'asc') {
        setSortField(null);
        setSortOrder(null);
      } else {
        setSortOrder('desc');
      }
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getTierRank = (tier?: string) => {
    if (tier === 'S') return 4;
    if (tier === 'A') return 3;
    if (tier === 'B') return 2;
    if (tier === 'C') return 1;
    return 0;
  };

  const sortedEvaluations = useMemo(() => {
    const list = [...filteredEvaluations];
    if (!sortField || !sortOrder) return list;

    list.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      switch (sortField) {
        case 'userName':
          valA = a.userName || '';
          valB = b.userName || '';
          break;
        case 'monthlyIncome':
          valA = a.monthlyIncomeUpper ?? a.monthlyIncome ?? 0;
          valB = b.monthlyIncomeUpper ?? b.monthlyIncome ?? 0;
          break;
        case 'monthlyCost':
          valA = a.monthlyCost ?? 0;
          valB = b.monthlyCost ?? 0;
          break;
        case 'contribution':
          valA = a.contributionUpper ?? a.contribution ?? 0;
          valB = b.contributionUpper ?? b.contribution ?? 0;
          break;
        case 'monthlyEfficiency':
          valA = a.monthlyEfficiencyUpper ?? a.monthlyEfficiency ?? 0;
          valB = b.monthlyEfficiencyUpper ?? b.monthlyEfficiency ?? 0;
          break;
        case 'historyDebt':
          valA = a.historyDebt ?? 0;
          valB = b.historyDebt ?? 0;
          break;
        case 'yearlyContribution':
          valA = a.yearlyContributionUpper ?? a.yearlyContribution ?? ((a.yearlyIncomeUpper ?? a.yearlyIncome) - a.yearlyCost);
          valB = b.yearlyContributionUpper ?? b.yearlyContribution ?? ((b.yearlyIncomeUpper ?? b.yearlyIncome) - b.yearlyCost);
          break;
        case 'yearlyEfficiency':
          valA = a.yearlyEfficiencyUpper ?? a.yearlyEfficiency ?? 0;
          valB = b.yearlyEfficiencyUpper ?? b.yearlyEfficiency ?? 0;
          break;
        case 'tier':
          valA = getTierRank(a.tierUpper || a.tier);
          valB = getTierRank(b.tierUpper || b.tier);
          break;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        const res = valA.localeCompare(valB, 'zh-CN');
        return sortOrder === 'asc' ? res : -res;
      } else {
        const numA = Number(valA) || 0;
        const numB = Number(valB) || 0;
        if (numA === numB) return 0;
        return sortOrder === 'asc' ? numA - numB : numB - numA;
      }
    });

    return list;
  }, [filteredEvaluations, sortField, sortOrder]);

  const renderSortIcon = (field: SortField) => {
    const isActive = sortField === field;
    return (
      <span className="inline-flex flex-col ml-2 align-middle text-[9px] text-slate-400">
        <ChevronUp className={`w-4 h-4 -mb-1.5 ${isActive && sortOrder === 'asc' ? 'text-indigo-600 font-black' : 'opacity-40 group-hover:opacity-100 group-hover:text-indigo-400'}`} />
        <ChevronDown className={`w-4 h-4 ${isActive && sortOrder === 'desc' ? 'text-indigo-600 font-black' : 'opacity-40 group-hover:opacity-100 group-hover:text-indigo-400'}`} />
      </span>
    );
  };

  return (
    <div className="relative w-full p-4 sm:p-6 md:p-8 bg-slate-100/60 border border-dashed border-slate-300 font-sans space-y-4 md:space-y-6 animate-in fade-in duration-300">
      {/* 页面四角虚线外框 / 设计线框角标 */}
      <div className="absolute -top-1.5 -left-1.5 w-4 h-4 border-t-2 border-l-2 border-dashed border-slate-400 pointer-events-none" />
      <div className="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-2 border-r-2 border-dashed border-slate-400 pointer-events-none" />
      <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-2 border-l-2 border-dashed border-slate-400 pointer-events-none" />
      <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-2 border-r-2 border-dashed border-slate-400 pointer-events-none" />

      {/* 顶部标题 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-300 pb-3 gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 md:gap-4">
          <h3 className="text-base md:text-lg font-bold text-slate-900 tracking-tight">全员价值贡献评价矩阵</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider">
            综合价值评价与效率审计
          </span>
        </div>
      </div>

      {/* 全员价值贡献评价矩阵：4列卡片墙 (严格 items-start 顶部对齐) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {[
          {
            tier: 'S',
            name: '卓越级 (S)',
            range: '效率 > 2.5',
            rangeBadge: '> 2.5',
            headline: '核心资产 · 重点保护',
            description: '优先资源倾斜，超额价值分配保护',
            count: evaluations.filter(e => (e.tierUpper || e.tier) === 'S').length,
            icon: Crown,
            // S: 金色 / 深蓝高级色调
            cardClasses: 'bg-slate-900 border border-amber-500/40 text-white shadow-sm hover:border-amber-400/80',
            activeRing: 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900',
            iconBox: 'bg-amber-400/10 border border-amber-400/30 text-amber-400',
            titleText: 'text-amber-300',
            badgeText: 'bg-amber-400/15 text-amber-300 border border-amber-400/30 font-mono',
            countText: 'text-white',
            unitText: 'text-slate-400',
            percentText: 'text-slate-400',
            headlineText: 'text-amber-300 font-semibold',
            descText: 'text-slate-300',
            divider: 'border-slate-800',
            indicator: 'bg-amber-400',
          },
          {
            tier: 'A',
            name: '进取级 (A)',
            range: '效率 1.5 ~ 2.5',
            rangeBadge: '1.5 ~ 2.5',
            headline: '核心晋升 · 业务中坚',
            description: '持续正向价值，核心职级晋升序列',
            count: evaluations.filter(e => (e.tierUpper || e.tier) === 'A').length,
            icon: TrendingUp,
            // A: 科技蓝
            cardClasses: 'bg-white border border-blue-200 text-slate-900 shadow-sm hover:border-blue-400',
            activeRing: 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white',
            iconBox: 'bg-blue-50 border border-blue-200 text-blue-600',
            titleText: 'text-slate-900',
            badgeText: 'bg-blue-50 text-blue-700 border border-blue-200 font-mono',
            countText: 'text-slate-900',
            unitText: 'text-slate-500',
            percentText: 'text-slate-500',
            headlineText: 'text-blue-700 font-semibold',
            descText: 'text-slate-600',
            divider: 'border-slate-200',
            indicator: 'bg-blue-600',
          },
          {
            tier: 'B',
            name: '稳健级 (B)',
            range: '效率 1.2 ~ 1.5',
            rangeBadge: '1.2 ~ 1.5',
            headline: '标准评价 · 持续激励',
            description: '持续稳定力量，标准激励健康循环',
            count: evaluations.filter(e => (e.tierUpper || e.tier) === 'B').length,
            icon: ShieldCheck,
            // B: 清新绿
            cardClasses: 'bg-white border border-emerald-200 text-slate-900 shadow-sm hover:border-emerald-400',
            activeRing: 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-white',
            iconBox: 'bg-emerald-50 border border-emerald-200 text-emerald-600',
            titleText: 'text-slate-900',
            badgeText: 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono',
            countText: 'text-slate-900',
            unitText: 'text-slate-500',
            percentText: 'text-slate-500',
            headlineText: 'text-emerald-700 font-semibold',
            descText: 'text-slate-600',
            divider: 'border-slate-200',
            indicator: 'bg-emerald-600',
          },
          {
            tier: 'C',
            name: '改进级 (C)',
            range: '效率 < 1.2',
            rangeBadge: '< 1.2',
            headline: '价值逆差 · 重点赋能',
            description: '产出小于成本，赋能与工时对冲辅导',
            count: evaluations.filter(e => (e.tierUpper || e.tier) === 'C').length,
            icon: AlertTriangle,
            // C: 警示橙
            cardClasses: 'bg-white border border-amber-200 text-slate-900 shadow-sm hover:border-amber-400',
            activeRing: 'ring-2 ring-amber-500 ring-offset-2 ring-offset-white',
            iconBox: 'bg-amber-50 border border-amber-200 text-amber-600',
            titleText: 'text-slate-900',
            badgeText: 'bg-amber-50 text-amber-700 border border-amber-200 font-mono',
            countText: 'text-slate-900',
            unitText: 'text-slate-500',
            percentText: 'text-slate-500',
            headlineText: 'text-amber-700 font-semibold',
            descText: 'text-slate-600',
            divider: 'border-slate-200',
            indicator: 'bg-amber-500',
          },
        ].map((tierItem) => {
          const Icon = tierItem.icon;
          const isSelected = selectedTier === tierItem.tier;
          const percentage = evaluations.length > 0 ? ((tierItem.count / evaluations.length) * 100).toFixed(1) : '0.0';

          return (
            <div
              key={tierItem.tier}
              onClick={() => setSelectedTier(selectedTier === tierItem.tier ? 'ALL' : tierItem.tier)}
              className={`p-4 rounded-none transition-all duration-200 cursor-pointer flex flex-col justify-start relative overflow-hidden ${tierItem.cardClasses} ${isSelected ? tierItem.activeRing : ''}`}
            >
              {/* 顶部指示条 */}
              <div className={`absolute top-0 left-0 right-0 h-1 ${tierItem.indicator}`} />

              {/* 头部：标题与图标基线对齐 */}
              <div className={`flex items-center justify-between pb-3 border-b ${tierItem.divider} min-h-[44px]`}>
                <div className="flex items-center space-x-2.5">
                  <div className={`w-8 h-8 rounded-none flex items-center justify-center shrink-0 ${tierItem.iconBox}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className={`text-xs font-bold ${tierItem.titleText}`}>{tierItem.name}</h4>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 border ${tierItem.badgeText}`}>
                  {tierItem.rangeBadge}
                </span>
              </div>

              {/* 核心指标统计：人数与占比 */}
              <div className={`py-3 flex items-baseline justify-between border-b ${tierItem.divider}`}>
                <div className="flex items-baseline space-x-1.5">
                  <span className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${tierItem.countText}`}>
                    {tierItem.count}
                  </span>
                  <span className={`text-xs font-bold ${tierItem.unitText}`}>人</span>
                </div>
                <div className="text-right">
                  <span className={`text-[11px] font-mono font-semibold ${tierItem.percentText}`}>
                    占比 {percentage}%
                  </span>
                </div>
              </div>

              {/* 效率数值区间与 TIER 定义描述 */}
              <div className="pt-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-bold ${tierItem.headlineText}`}>
                    {tierItem.headline}
                  </span>
                  <span className={`text-[10px] font-mono opacity-70 ${tierItem.descText}`}>
                    {tierItem.range}
                  </span>
                </div>
                <p className={`text-[11px] leading-relaxed line-clamp-2 ${tierItem.descText}`} title={tierItem.description}>
                  {tierItem.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 全员评价明细表：线框图风格表格 */}
      <div className="bg-white border border-slate-300 shadow-none overflow-hidden">
        <div className="bg-slate-100/70 px-4 sm:px-6 py-2 border-b border-slate-300 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider font-mono">全量价值贡献审计记录</span>
            {sortField && (
              <span className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 font-mono border border-slate-300 flex items-center gap-1">
                已按 [{sortField === 'userName' ? '采集主体' : sortField === 'monthlyIncome' ? '收产包' : sortField === 'monthlyCost' ? '成本包' : sortField === 'contribution' ? '月贡献' : sortField === 'monthlyEfficiency' ? '月效率' : sortField === 'historyDebt' ? '历史欠产包' : sortField === 'yearlyContribution' ? '年贡献' : sortField === 'yearlyEfficiency' ? '年效率' : '管理决策路由'}] {sortOrder === 'asc' ? '升序' : '降序'} 排序
                <button 
                  onClick={() => { setSortField(null); setSortOrder(null); }}
                  className="ml-1 text-slate-500 hover:text-slate-900 font-bold cursor-pointer"
                >
                  ×
                </button>
              </span>
            )}
          </div>
        </div>

        {/* 自定义查询控制栏 */}
        <div className="p-4 bg-slate-50 border-b border-slate-300 flex flex-wrap items-center gap-3">
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
              className="w-full h-9 bg-white border border-slate-300 pl-9 pr-3 py-1.5 text-[13px] text-slate-800 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-400 transition-all placeholder:text-slate-400 font-sans"
            />
          </div>

          {/* 评价等级筛选 */}
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center h-4 whitespace-nowrap font-sans">评价等级:</span>
            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
              className="h-9 bg-white border border-slate-300 px-3 py-1.5 text-[13px] text-slate-800 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-400 transition-all cursor-pointer font-sans"
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
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center h-4 whitespace-nowrap font-sans">角色分类:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-9 bg-white border border-slate-300 px-3 py-1.5 text-[13px] text-slate-800 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-400 transition-all cursor-pointer font-sans"
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
              className="h-9 text-[13px] text-slate-700 hover:text-slate-900 font-bold px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors cursor-pointer flex items-center font-sans"
            >
              重置条件
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse">
            <thead>
              <tr className="bg-slate-100/90 border-b border-slate-300">
                <th 
                  onClick={() => handleSort('userName')}
                  className="group py-2 px-4 text-[11px] font-bold text-slate-700 uppercase tracking-wider text-left whitespace-nowrap border-r border-slate-300 cursor-pointer hover:bg-slate-200 transition-colors select-none font-sans"
                >
                  <span className="inline-flex items-center">
                    采集主体 {renderSortIcon('userName')}
                  </span>
                </th>
                <th 
                  onClick={() => handleSort('monthlyIncome')}
                  className="group py-2 px-4 text-[11px] font-bold text-slate-700 uppercase tracking-wider text-right whitespace-nowrap border-r border-slate-300 cursor-pointer hover:bg-slate-200 transition-colors select-none font-sans"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    收产包 {renderSortIcon('monthlyIncome')}
                    <InfoTip 
                      title="收产包口径" 
                      content="产专：上行展示已确权+待确权产兑包；下行展示仅已确权产兑包。款专：当期收款包。" 
                    />
                  </span>
                </th>
                <th 
                  onClick={() => handleSort('monthlyCost')}
                  className="group py-2 px-4 text-[11px] font-bold text-slate-700 uppercase tracking-wider text-right whitespace-nowrap border-r border-slate-300 cursor-pointer hover:bg-slate-200 transition-colors select-none font-sans"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span className="inline-flex items-center">
                      成本包 {renderSortIcon('monthlyCost')}
                    </span>
                    <InfoTip 
                      title="成本包口径" 
                      content="GXB（单月刚性工资包）+ 对应职级消耗成本（款专：GXB+A；产专：GXB+B1）+ D类 − FXDC。" 
                    />
                    <div onClick={(e) => e.stopPropagation()} className="inline-flex items-center ml-1">
                      <CostPrivacyToggle size="sm" showLabel={false} />
                    </div>
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('contribution')}
                  className="group py-2 px-4 text-[11px] font-bold text-slate-700 uppercase tracking-wider text-right whitespace-nowrap border-r border-slate-300 cursor-pointer hover:bg-slate-200 transition-colors select-none font-sans"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    月贡献 {renderSortIcon('contribution')}
                    <InfoTip title="月贡献口径" content="该行收产包 − 成本包。正值代表正向价值积累。" />
                  </span>
                </th>
                <th 
                  onClick={() => handleSort('monthlyEfficiency')}
                  className="group py-2 px-4 text-[11px] font-bold text-slate-700 uppercase tracking-wider text-right whitespace-nowrap border-r border-slate-300 cursor-pointer hover:bg-slate-200 transition-colors select-none font-sans"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    月效率 {renderSortIcon('monthlyEfficiency')}
                    <InfoTip title="月效率口径" content="该行收产包 ÷ 成本包。>2.5 卓越，>=1.5 进取，>=1.2 稳健。" />
                  </span>
                </th>
                <th 
                  onClick={() => handleSort('historyDebt')}
                  className="group py-2 px-4 text-[11px] font-bold text-slate-700 uppercase tracking-wider text-right whitespace-nowrap border-r border-slate-300 cursor-pointer hover:bg-slate-200 transition-colors select-none font-sans"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    历史欠产包 {renderSortIcon('historyDebt')}
                    <InfoTip 
                      title="历史欠产包口径" 
                      content="当年 1~M-1 月累计欠产滚动（每年 1 月清零）。存在欠产时以负数标识。" 
                    />
                  </span>
                </th>
                <th 
                  onClick={() => handleSort('yearlyContribution')}
                  className="group py-2 px-4 text-[11px] font-bold text-slate-700 uppercase tracking-wider text-right whitespace-nowrap border-r border-slate-300 cursor-pointer hover:bg-slate-200 transition-colors select-none font-sans"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    年贡献 {renderSortIcon('yearlyContribution')}
                    <InfoTip title="年贡献口径" content="当年累计收产包 − 当年累计成本包。正值代表当年累计净贡献。" />
                  </span>
                </th>
                <th 
                  onClick={() => handleSort('yearlyEfficiency')}
                  className="group py-2 px-4 text-[11px] font-bold text-slate-700 uppercase tracking-wider text-right whitespace-nowrap border-r border-slate-300 cursor-pointer hover:bg-slate-200 transition-colors select-none font-sans"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    年效率 {renderSortIcon('yearlyEfficiency')}
                    <InfoTip title="年效率口径" content="当年累计收产包 ÷ 当年累计成本包。" />
                  </span>
                </th>
                <th 
                  onClick={() => handleSort('tier')}
                  className="group py-2 px-4 text-[11px] font-bold text-slate-700 uppercase tracking-wider text-left whitespace-nowrap cursor-pointer hover:bg-slate-200 transition-colors select-none font-sans"
                >
                  <span className="inline-flex items-center">
                    管理决策路由 {renderSortIcon('tier')}
                    <InfoTip title="管理决策路由" content="根据各行效率分档自动生成的管理决策分类。" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedEvaluations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-20 text-center text-slate-400 font-bold uppercase text-[11px] tracking-widest font-mono">
                    {UI_LABELS.EMPTY_DEFAULT}
                  </td>
                </tr>
              ) : (
                sortedEvaluations.map(e => {
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
                    const yrContribUpper = e.yearlyContributionUpper ?? ((e.yearlyIncomeUpper ?? e.yearlyIncome) - e.yearlyCost);
                    const yrContribLower = e.yearlyContributionLower ?? ((e.yearlyIncomeLower ?? e.yearlyIncome) - e.yearlyCost);
                    const tierUpper = e.tierUpper || e.tier;
                    const tierLower = e.tierLower || e.tier;

                    return (
                      <React.Fragment key={e.userId}>
                        {/* 上行 (已确权+待确权产兑包) */}
                        <tr className="hover:bg-slate-50 transition-colors">
                          {/* 1. 采集主体 (上下合并为一格) */}
                          <td rowSpan={2} className="py-2 px-4 text-left whitespace-nowrap align-middle border-b border-r border-slate-300 bg-white">
                            <div className="font-bold text-xs text-slate-900">{e.userName}</div>
                            <div className="text-[10px] text-slate-500 font-mono tracking-tight mt-0.5">{e.category} · {e.userId}</div>
                          </td>
                          {/* 2. 收产包 (上行) */}
                          <td className="py-2 px-4 text-right whitespace-nowrap font-mono text-xs text-slate-900 border-b border-r border-slate-300 font-medium">
                            {formatAmount(incomeUpper)}
                          </td>
                          {/* 3. 成本包 (上下合并为一格) */}
                          <td rowSpan={2} className="py-2 px-4 text-right whitespace-nowrap align-middle border-b border-r border-slate-300 bg-white">
                            <div className="flex flex-col items-end w-full min-w-[120px]">
                              <div className="flex items-center justify-end space-x-2 w-full">
                                <span className="font-mono text-xs font-semibold text-slate-900">{maskMoney(e.monthlyCost)}</span>
                                <button onClick={() => toggleCost(e.userId)} className="text-slate-600 hover:text-slate-900 transition-colors flex items-center text-[10px] bg-slate-100 px-1.5 py-0.5 border border-slate-300">
                                  明细 {expandedCosts.has(e.userId) ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                                </button>
                              </div>
                              {expandedCosts.has(e.userId) && (
                                <div className="mt-2 w-full bg-slate-50 border border-slate-300 p-2 space-y-1 text-[10px] text-slate-600 font-mono text-right">
                                  <div className="flex justify-between items-center">
                                    <span className="flex items-center text-slate-500">
                                      GXB
                                      <InfoTip
                                        title="GXB"
                                        content="单月刚性工资包（人事核定，按月在岗计取）"
                                        className="ml-1 opacity-70 hover:opacity-100"
                                      />
                                    </span>
                                    <span className="text-slate-900 font-semibold">{maskMoney(e.baseSalary || 0)}</span>
                                  </div>
                                  {e.isRevenueExpert && (
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-500">A类</span>
                                      <span className="text-slate-900 font-semibold">{maskMoney(e.aCost || 0)}</span>
                                    </div>
                                  )}
                                  {e.isProdExpert && (
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-500">B1类</span>
                                      <span className="text-slate-900 font-semibold">{maskMoney(e.b1Cost || 0)}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between items-center">
                                    <span className="flex items-center text-slate-500">
                                      D类
                                      <InfoTip title="D类成本" content="经营单元开支，无项目。按实际发生月人员平均分摊" className="ml-1 opacity-70 hover:opacity-100" />
                                    </span>
                                    <span className="text-slate-900 font-semibold">{maskMoney(e.dCost || 0)}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="flex items-center text-slate-500">
                                      FXDC
                                      <InfoTip title="FXDC" content="非有效工时对冲，冲抵刚性工资包" className="ml-1 opacity-70 hover:opacity-100" />
                                    </span>
                                    <span className="text-slate-900 font-semibold">-{maskMoney(e.nonEffectiveDeduction || 0)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          {/* 4. 月贡献 (上行) */}
                          <td className="py-2 px-4 text-right whitespace-nowrap font-mono text-xs font-semibold border-b border-r border-slate-300">
                            <span className={contribUpper >= 0 ? 'text-slate-900' : 'text-rose-600'}>
                              {contribUpper > 0 ? `+${formatAmount(contribUpper)}` : formatAmount(contribUpper)}
                            </span>
                          </td>
                          {/* 5. 月效率 (上行) */}
                          <td className="py-2 px-4 text-right whitespace-nowrap font-mono text-xs font-bold border-b border-r border-slate-300">
                            <span className={effUpper >= 1.2 ? 'text-slate-900' : 'text-rose-600'}>
                              {formatRatio(effUpper)}
                            </span>
                          </td>
                          {/* 6. 历史欠产包 (上下合并为一格) */}
                          <td rowSpan={2} className={`py-2 px-4 text-right whitespace-nowrap align-middle font-mono text-xs font-bold border-b border-r border-slate-300 bg-white ${(e.historyDebt ?? 0) < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                            {e.historyDebt ? formatAmount(e.historyDebt) : '0'}
                          </td>
                          {/* 7. 年贡献 (上行) */}
                          <td className="py-2 px-4 text-right whitespace-nowrap font-mono text-xs font-semibold border-b border-r border-slate-300">
                            <span className={yrContribUpper >= 0 ? 'text-slate-900' : 'text-rose-600'}>
                              {yrContribUpper > 0 ? `+${formatAmount(yrContribUpper)}` : formatAmount(yrContribUpper)}
                            </span>
                          </td>
                          {/* 8. 年效率 (上行) */}
                          <td className="py-2 px-4 text-right whitespace-nowrap font-mono text-xs font-bold border-b border-r border-slate-300">
                            <span className={yrEffUpper >= 1.2 ? 'text-slate-900' : 'text-rose-600'}>
                              {formatRatio(yrEffUpper)}
                            </span>
                          </td>
                          {/* 9. 管理决策路由 (上行) */}
                          <td className="py-2 px-4 text-left whitespace-nowrap border-b border-slate-300">
                            <span className={`inline-block px-2 py-0.5 text-[10px] font-bold border ${getTierBadgeClass(tierUpper)} font-sans`}>
                              {getTierBadgeText(tierUpper)}
                            </span>
                          </td>
                        </tr>
                        {/* 下行 (仅已确权产兑包) */}
                        <tr className="hover:bg-slate-50 transition-colors">
                          {/* 2. 收产包 (下行) */}
                          <td className="py-2 px-4 text-right whitespace-nowrap font-mono text-xs text-slate-900 border-b border-r border-slate-300 font-medium">
                            {formatAmount(incomeLower)}
                          </td>
                          {/* 4. 月贡献 (下行) */}
                          <td className="py-2 px-4 text-right whitespace-nowrap font-mono text-xs font-semibold border-b border-r border-slate-300">
                            <span className={contribLower >= 0 ? 'text-slate-900' : 'text-rose-600'}>
                              {contribLower > 0 ? `+${formatAmount(contribLower)}` : formatAmount(contribLower)}
                            </span>
                          </td>
                          {/* 5. 月效率 (下行) */}
                          <td className="py-2 px-4 text-right whitespace-nowrap font-mono text-xs font-bold border-b border-r border-slate-300">
                            <span className={effLower >= 1.2 ? 'text-slate-900' : 'text-rose-600'}>
                              {formatRatio(effLower)}
                            </span>
                          </td>
                          {/* 7. 年贡献 (下行) */}
                          <td className="py-2 px-4 text-right whitespace-nowrap font-mono text-xs font-semibold border-b border-r border-slate-300">
                            <span className={yrContribLower >= 0 ? 'text-slate-900' : 'text-rose-600'}>
                              {yrContribLower > 0 ? `+${formatAmount(yrContribLower)}` : formatAmount(yrContribLower)}
                            </span>
                          </td>
                          {/* 8. 年效率 (下行) */}
                          <td className="py-2 px-4 text-right whitespace-nowrap font-mono text-xs font-bold border-b border-r border-slate-300">
                            <span className={yrEffLower >= 1.2 ? 'text-slate-900' : 'text-rose-600'}>
                              {formatRatio(yrEffLower)}
                            </span>
                          </td>
                          {/* 9. 管理决策路由 (下行) */}
                          <td className="py-2 px-4 text-left whitespace-nowrap border-b border-slate-300">
                            <span className={`inline-block px-2 py-0.5 text-[10px] font-bold border ${getTierBadgeClass(tierLower)} font-sans`}>
                              {getTierBadgeText(tierLower)}
                            </span>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  }

                  // 款专 (单行)
                  return (
                    <tr key={e.userId} className="hover:bg-slate-50 transition-colors">
                      {/* 1. 采集主体 */}
                      <td className="py-2 px-4 text-left whitespace-nowrap align-middle border-b border-r border-slate-300 bg-white">
                        <div className="font-bold text-xs text-slate-900">{e.userName}</div>
                        <div className="text-[10px] text-slate-500 font-mono tracking-tight mt-0.5">{e.category} · {e.userId}</div>
                      </td>
                      {/* 2. 收产包 */}
                      <td className="py-2 px-4 text-right whitespace-nowrap font-mono text-xs text-slate-900 font-medium border-b border-r border-slate-300">
                        {formatAmount(e.monthlyIncome)}
                      </td>
                      {/* 3. 成本包 */}
                      <td className="py-2 px-4 text-right whitespace-nowrap align-middle border-b border-r border-slate-300 bg-white">
                        <div className="flex flex-col items-end w-full min-w-[120px]">
                          <div className="flex items-center justify-end space-x-2 w-full">
                            <span className="font-mono text-xs font-semibold text-slate-900">{maskMoney(e.monthlyCost)}</span>
                            <button onClick={() => toggleCost(e.userId)} className="text-slate-600 hover:text-slate-900 transition-colors flex items-center text-[10px] bg-slate-100 px-1.5 py-0.5 border border-slate-300">
                              明细 {expandedCosts.has(e.userId) ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                            </button>
                          </div>
                          {expandedCosts.has(e.userId) && (
                            <div className="mt-2 w-full bg-slate-50 border border-slate-300 p-2 space-y-1 text-[10px] text-slate-600 font-mono text-right">
                              <div className="flex justify-between items-center">
                                <span className="flex items-center text-slate-500">
                                  GXB
                                  <InfoTip
                                    title="GXB"
                                    content="单月刚性工资包（人事核定，按月在岗计取）"
                                    className="ml-1 opacity-70 hover:opacity-100"
                                  />
                                </span>
                                <span className="text-slate-900 font-semibold">{maskMoney(e.baseSalary || 0)}</span>
                              </div>
                              {e.isRevenueExpert && (
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500">A类</span>
                                  <span className="text-slate-900 font-semibold">{maskMoney(e.aCost || 0)}</span>
                                </div>
                              )}
                              {e.isProdExpert && (
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500">B1类</span>
                                  <span className="text-slate-900 font-semibold">{maskMoney(e.b1Cost || 0)}</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center">
                                <span className="flex items-center text-slate-500">
                                  D类
                                  <InfoTip title="D类成本" content="经营单元开支，无项目。按实际发生月人员平均分摊" className="ml-1 opacity-70 hover:opacity-100" />
                                </span>
                                <span className="text-slate-900 font-semibold">{maskMoney(e.dCost || 0)}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="flex items-center text-slate-500">
                                  FXDC
                                  <InfoTip title="FXDC" content="非有效工时对冲，冲抵刚性工资包" className="ml-1 opacity-70 hover:opacity-100" />
                                </span>
                                <span className="text-slate-900 font-semibold">-{maskMoney(e.nonEffectiveDeduction || 0)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      {/* 4. 月贡献 */}
                      <td className="py-2 px-4 text-right whitespace-nowrap font-mono text-xs font-semibold border-b border-r border-slate-300">
                        <span className={e.contribution >= 0 ? 'text-slate-900' : 'text-rose-600'}>
                          {e.contribution > 0 ? `+${formatAmount(e.contribution)}` : formatAmount(e.contribution)}
                        </span>
                      </td>
                      {/* 5. 月效率 */}
                      <td className="py-2 px-4 text-right whitespace-nowrap font-mono text-xs font-bold border-b border-r border-slate-300">
                        <span className={e.monthlyEfficiency >= 1.2 ? 'text-slate-900' : 'text-rose-600'}>
                          {formatRatio(e.monthlyEfficiency)}
                        </span>
                      </td>
                      {/* 6. 历史欠产包 */}
                      <td className={`py-2 px-4 text-right whitespace-nowrap font-mono text-xs font-bold border-b border-r border-slate-300 ${(e.historyDebt ?? 0) < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                        {e.historyDebt ? formatAmount(e.historyDebt) : '0'}
                      </td>
                      {/* 7. 年贡献 */}
                      <td className="py-2 px-4 text-right whitespace-nowrap font-mono text-xs font-semibold border-b border-r border-slate-300">
                        {(() => {
                          const yrContrib = e.yearlyContribution ?? (e.yearlyIncome - e.yearlyCost);
                          return (
                            <span className={yrContrib >= 0 ? 'text-slate-900' : 'text-rose-600'}>
                              {yrContrib > 0 ? `+${formatAmount(yrContrib)}` : formatAmount(yrContrib)}
                            </span>
                          );
                        })()}
                      </td>
                      {/* 8. 年效率 */}
                      <td className="py-2 px-4 text-right whitespace-nowrap font-mono text-xs font-bold border-b border-r border-slate-300">
                        <span className={e.yearlyEfficiency >= 1.2 ? 'text-slate-900' : 'text-rose-600'}>
                          {formatRatio(e.yearlyEfficiency)}
                        </span>
                      </td>
                      {/* 9. 管理决策路由 */}
                      <td className="py-2 px-4 text-left whitespace-nowrap border-b border-slate-300">
                        <span className={`inline-block px-2 py-0.5 text-[10px] font-bold border ${getTierBadgeClass(e.tier)} font-sans`}>
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
