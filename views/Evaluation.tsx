
import React, { useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown } from 'lucide-react';
import { useCostPrivacy } from '../src/hooks/useCostPrivacy';
import { CostPrivacyToggle } from '../src/components/CostPrivacyToggle';
import { User, ValueCreationLog, MiningResource, AuditStatus, Role } from '../types';
import { computeAllEvaluations } from '../src/utils/valueEvaluation';
import { formatAmount, formatRatio } from '../src/utils/formatters';
import { InfoTip } from '../src/components/InfoTip';
import { BusinessDateFilter } from '../src/components/BusinessDateFilter';
import { getLocalMonthString } from '../src/utils/dateUtils';
import { UI_LABELS } from '../src/constants/uiLabels';
import { CostBreakdown } from '@/components/CostBreakdown';

interface EvaluationProps {
  users: User[];
  logs?: ValueCreationLog[];
  auditLogs?: ValueCreationLog[];
  resources: MiningResource[];
  currentTime?: Date;
  onFilterMonthChange?: (month: string) => void;
}

const CostTooltipIcon: React.FC<{ tooltip: string }> = ({ tooltip }) => {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        x: rect.left + rect.width / 2,
        y: rect.top - 6,
      });
      setShow(true);
    }
  };

  const handleMouseLeave = () => {
    setShow(false);
  };

  return (
    <span
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="inline-flex items-center justify-center w-[14px] h-[14px] rounded-full bg-[#e2e8f0] text-[#475569] text-[10px] font-medium leading-none cursor-help mx-[2px] shrink-0 select-none align-middle"
    >
      i
      {show && coords && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            left: `${coords.x}px`,
            top: `${coords.y}px`,
            transform: 'translate(-50%, -100%)',
            zIndex: 9999,
            backgroundColor: '#1e293b',
            color: '#ffffff',
            borderRadius: '6px',
            padding: '8px 12px',
            width: '220px',
            fontSize: '12px',
            lineHeight: '1.5',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
            whiteSpace: 'normal',
            textAlign: 'left',
            fontWeight: 'normal',
          }}
          className="animate-in fade-in zoom-in-95 duration-100 font-sans"
        >
          {tooltip}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: '4px solid #1e293b',
            }}
          />
        </div>,
        document.body
      )}
    </span>
  );
};

const CostDetailCard: React.FC<{
  evaluation: {
    monthlyCost: number;
    baseSalary: number;
    category: string;
    aCost: number;
    b1Cost: number;
    dCost?: number;
    nonEffectiveDeduction?: number;
  };
  maskMoney: (amount: number | string | null | undefined) => string;
}> = ({ evaluation: e, maskMoney }) => {
  const [expanded, setExpanded] = useState(false);

  const isRevenue = e.category?.includes('款专');
  const dynamicCategoryLabel = isRevenue ? 'A类' : 'B1';
  const dynamicCategoryCost = isRevenue ? e.aCost : e.b1Cost;

  return (
    <div className="bg-white rounded-[8px] p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-slate-200/80 transition-all text-left w-full min-w-[220px]">
      {/* 顶部：总成本标题、明细展开按钮及总成本金额 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <span className="text-[13px] font-bold text-slate-800">总成本</span>
          <button
            type="button"
            onClick={() => setExpanded(prev => !prev)}
            className="inline-flex items-center space-x-1 text-[11px] text-[#1a56db] hover:text-blue-700 bg-blue-50/80 hover:bg-blue-100 px-2 py-0.5 rounded-[4px] font-medium transition-colors cursor-pointer select-none"
          >
            <span>{expanded ? '收起' : '明细'}</span>
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <span className="text-[16px] font-bold font-mono text-slate-900 [font-variant-numeric:tabular-nums] text-right">
          {maskMoney(e.monthlyCost)}
        </span>
      </div>

      {/* 可折叠轻量明细区域 */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-slate-100 bg-[#fafbfc] rounded-[6px] p-2 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* 工资 */}
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-slate-600 font-medium">工资</span>
            <span className="font-mono text-slate-800 font-semibold [font-variant-numeric:tabular-nums] text-right">
              {maskMoney(e.baseSalary || 0)}
            </span>
          </div>

          {/* B1 (或款专对应A类) */}
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-slate-600 font-medium">{dynamicCategoryLabel}</span>
            <span className="font-mono text-slate-800 font-semibold [font-variant-numeric:tabular-nums] text-right">
              {maskMoney(dynamicCategoryCost || 0)}
            </span>
          </div>

          {/* D类 */}
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-slate-600 font-medium inline-flex items-center">
              D类
              <CostTooltipIcon tooltip="经营单元开支，无项目。按实际发生月人员平均分摊" />
            </span>
            <span className="font-mono text-slate-800 font-semibold [font-variant-numeric:tabular-nums] text-right">
              {maskMoney(e.dCost || 0)}
            </span>
          </div>

          {/* FXDC */}
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-slate-600 font-medium inline-flex items-center">
              FXDC
              <CostTooltipIcon tooltip="非有效工时对冲，冲抵刚性工资包" />
            </span>
            <span className="font-mono text-slate-800 font-semibold [font-variant-numeric:tabular-nums] text-right">
              {maskMoney(e.nonEffectiveDeduction || 0)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

const Evaluation: React.FC<EvaluationProps> = ({ users, logs = [], auditLogs, resources, currentTime, onFilterMonthChange }) => {
  const { isCostVisible, toggleCostVisible, maskMoney, maskText } = useCostPrivacy();
  const effectiveLogs = auditLogs || logs;
  const [filterMonth, setFilterMonth] = useState<string>(() => getLocalMonthString());
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  // 新增：自定义查询状态（模糊搜索、等级、类别）
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTier, setSelectedTier] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // 核心评价逻辑：使用全量审计日志 auditLogs（包含 JZCZ + DTCB）作为计算基准
  const evaluations = useMemo(() => {
    return computeAllEvaluations(users, effectiveLogs, resources, filterMonth, filterStartDate, filterEndDate);
  }, [users, effectiveLogs, resources, filterMonth, filterStartDate, filterEndDate]);

  // 新增：过滤后的评价数据
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

      {/* 全员评价明细表：操作台卡片 */}
      <div className="bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden">
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
          <table className="w-full table-auto text-center border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200">
                <th className="py-2.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center whitespace-nowrap">采集主体</th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center whitespace-nowrap">
                  <span className="inline-flex items-center justify-center">
                    收产包
                    <InfoTip title="收产包口径" content="当月所有审核通过/已确权的提纯业务积分（收款包/产兑包）总和。" />
                  </span>
                </th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center whitespace-nowrap">
                  <div className="flex items-center justify-center space-x-1">
                    <span>成本包</span>
                    <InfoTip title="成本包口径" content="刚性工资包 + 对应职级消耗成本（款专：工资+A；产专：工资+B1）。" />
                    <CostPrivacyToggle size="sm" showLabel={false} className="ml-1" />
                  </div>
                </th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center whitespace-nowrap">
                  <span className="inline-flex items-center justify-center">
                    月度贡献
                    <InfoTip title="月度贡献口径" content="月度收产包 - 月度成本包 = 月度贡献。正值代表正向价值积累。" />
                  </span>
                </th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center whitespace-nowrap">
                  <span className="inline-flex items-center justify-center">
                    月度效率
                    <InfoTip title="月度效率口径" content="月度总收产包 ÷ 月度总成本包。>1.5 为卓越，>1.2 为稳健。" />
                  </span>
                </th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center whitespace-nowrap">
                  <span className="inline-flex items-center justify-center">
                    年度效率
                    <InfoTip title="年度效率口径" content="当年累计总收产包 ÷ 当年累计总成本包。" />
                  </span>
                </th>
                <th className="py-2.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center whitespace-nowrap">管理决策路由</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEvaluations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest">{UI_LABELS.EMPTY_DEFAULT}</td>
                </tr>
              ) : (
                filteredEvaluations.map(e => (
                  <tr key={e.userId} className={`hover:bg-slate-50/70 transition-colors group ${e.tier === 'S' ? 'bg-amber-50/20' : ''}`}>
                    <td className="py-2.5 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center space-x-2.5">
                        <div className={`w-7 h-7 rounded-sm flex items-center justify-center text-white font-bold text-xs shadow-2xs shrink-0 ${e.tier === 'S' ? 'bg-amber-500' : (e.monthlyEfficiency < 1 ? 'bg-rose-500' : 'bg-slate-900')}`}>
                          {e.userName.charAt(0)}
                        </div>
                        <div className="min-w-0 text-left">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-slate-900 text-xs tracking-tight truncate">{e.userName}</span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded-xs border ${e.tierColor} border-current opacity-85 uppercase whitespace-nowrap shrink-0`}>{e.category}</span>
                          </div>
                          <div className="text-[9px] text-slate-400 font-mono tracking-tight uppercase truncate">编号_{e.userId} · {e.tierLabel}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span className="font-mono font-bold text-slate-900 text-xs">{formatAmount(e.monthlyIncome)}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <div className="inline-block text-left w-full max-w-[320px]">
                        <CostDetailCard evaluation={e} maskMoney={maskMoney} />
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <div className="flex flex-col items-center">
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
                    <td className="py-2.5 px-4 text-center whitespace-nowrap">
                      <div className="flex flex-col items-center space-y-0.5">
                        {e.tier === 'S' && <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold rounded-xs uppercase tracking-wider">核心资产/重点保护</span>}
                        {e.tier === 'A' && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-bold rounded-xs uppercase tracking-wider">核心晋升储备</span>}
                        {e.tier === 'B' && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold rounded-xs uppercase tracking-wider">标准评价/持续激励</span>}
                        {e.tier === 'C' && <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 text-[9px] font-bold rounded-xs uppercase tracking-wider">负向资产/熔断淘汰</span>}
                        
                        <p className="text-[8px] font-medium text-slate-400 tracking-tight">
                          {e.fixedRatio > 70 ? '薪酬刚性过高：触发降薪' : (e.fixedRatio < 40 && e.contribution > 5000 ? '弹性空间充裕：建议加薪' : '薪酬结构 stable')}
                        </p>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Evaluation;
