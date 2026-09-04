import { UI_TOKENS } from '../src/constants/uiTokens';
import React, { useState, useEffect, useMemo } from 'react';
import { User, ValueCreationLog, InternalTransaction, MiningResource, AuditStatus, TransactionStatus, RefineCategory, SystemConfig } from '../types';
import { canExportExcel, getExportButtonTitle, EXPORT_DISABLED_TOOLTIP } from '../src/utils/accessControl';
import { Card, Badge } from '../src/components/UI';
import { getLocalMonthString, getLocalDateString, resolveLogBusinessMonth, resolveLogBusinessDate, formatSubmissionDate, formatSubmissionTime, isDateInRange, isLogInFilter } from '../src/utils/dateUtils';
import { calculateHistoricalNetValue, getUserSalaryByMonth } from '../src/utils/business';
import { aggregateUserMonthMetrics, calculateBonusAllocation } from '../src/utils/bonusAllocation';
import { computeCfoKuanMetrics } from '../src/utils/distributionCfoMath';
import { fetchDistributionData } from '../src/api/distribution';
import { useCostPrivacy } from '../src/hooks/useCostPrivacy';
import { CostPrivacyToggle } from '../src/components/CostPrivacyToggle';
import { formatAmount } from '../src/utils/formatters';
import { BusinessDateFilter } from '../src/components/BusinessDateFilter';
import { InfoTip } from '../src/components/InfoTip';
import { XLSX, exportWorkbook, buildExcelFilename } from '../src/utils/excelIo';
import { toast } from 'sonner';
import { Wallet, TrendingUp, ShieldCheck, ArrowRight, FileSpreadsheet, Search, Filter, Calendar, RefreshCw } from 'lucide-react';
import { UI_LABELS } from '../src/constants/uiLabels';
import {
  DynamicCostCategory,
  DYNAMIC_COST_CATEGORY_META,
  resolveDynamicCostCategory,
  isDynamicCostConfirmedOrApproved,
  getDynamicCostAmount
} from '../src/utils/costCategory';

interface MyAccountProps {
  currentUser: User;
  logs: ValueCreationLog[];
  transactions: InternalTransaction[];
  resources: MiningResource[];
  users: User[];
  systemConfig?: SystemConfig;
}

const MyAccount: React.FC<MyAccountProps> = ({ currentUser, logs, transactions, resources, users, systemConfig }) => {
  const canExport = useMemo(() => canExportExcel(currentUser, systemConfig), [currentUser, systemConfig]);
  const { isCostVisible, toggleCostVisible, maskMoney } = useCostPrivacy();
  
  // 业务月份与自定义起止日
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getLocalMonthString());
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // 流水明细筛选项
  const [filterType, setFilterType] = useState<string>('all'); // all, revenue, value
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMiningId, setFilterMiningId] = useState<string>('');
  const [filterDirection, setFilterDirection] = useState<string>('all'); // all, income, expense
  const [filterCostCategory, setFilterCostCategory] = useState<string>('all'); // all, A, B1, B2, C, D
  const [searchTerm, setSearchTerm] = useState<string>('');

  // 1. 口径计算：仅限本人 (recordedCollectorId === currentUser.id)
  const myLogs = useMemo(() => {
    return logs.filter(l => l.recordedCollectorId === currentUser.id);
  }, [logs, currentUser.id]);

  // 价值创造表合并流水
  const myUnifiedLogs = useMemo(() => {
    return myLogs.map(l => {
      const bMonth = resolveLogBusinessMonth(l);
      const bDate = resolveLogBusinessDate(l);
      const netVal = calculateHistoricalNetValue(l, resources, users);
      const costCat = resolveDynamicCostCategory(l);
      return {
        ...l,
        resolvedMonth: bMonth,
        resolvedDate: bDate,
        calculatedNetValue: netVal,
        resolvedCostCategory: costCat
      };
    }).sort((a, b) => b.resolvedDate.localeCompare(a.resolvedDate) || b.timestamp - a.timestamp);
  }, [myLogs, resources, users]);

  // 按维度模式过滤的当前活跃日志
  const activeLogs = useMemo(() => {
    return myUnifiedLogs.filter(l => isLogInFilter(l, selectedMonth, startDate, endDate));
  }, [myUnifiedLogs, selectedMonth, startDate, endDate]);

  // 顶部五类动态消耗成本（只统计 activeLogs 范围内本人有效/已确权入库的动态消耗流水）
  const dynamicCostFiveTiers = useMemo(() => {
    const totals: Record<DynamicCostCategory, number> = {
      A: 0,
      B1: 0,
      B2: 0,
      C: 0,
      D: 0
    };

    activeLogs.forEach(l => {
      if (!isDynamicCostConfirmedOrApproved(l.status)) return;
      const cat = l.resolvedCostCategory;
      if (cat && totals[cat] !== undefined) {
        totals[cat] += getDynamicCostAmount(l);
      }
    });

    const totalCost = totals.A + totals.B1 + totals.B2 + totals.C + totals.D;
    return { totals, totalCost };
  }, [activeLogs]);

  // 包汇总计算（按净值口径）
  const collectionPackage = useMemo(() => {
    return activeLogs
      .filter(l => l.category === RefineCategory.Revenue && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved))
      .reduce((sum, l) => sum + l.calculatedNetValue, 0);
  }, [activeLogs]);

  const productionPackage = useMemo(() => {
    return activeLogs
      .filter(l => l.category === RefineCategory.Value && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved))
      .reduce((sum, l) => sum + l.calculatedNetValue, 0);
  }, [activeLogs]);

  const combinedPackage = collectionPackage + productionPackage;

  // ===== 结余与分配始终按月计算 =====
  const effectiveMonth = useMemo(() => {
    if (selectedMonth) return selectedMonth;
    if (startDate) return startDate.slice(0, 7);
    return getLocalMonthString();
  }, [selectedMonth, startDate]);

  // 经营月度看板指标（始终按 effectiveMonth）
  const monthMetrics = useMemo(() => {
    return aggregateUserMonthMetrics(logs, currentUser, effectiveMonth, resources, users, [AuditStatus.Confirmed, AuditStatus.Approved]);
  }, [logs, currentUser, effectiveMonth, resources, users]);

  // ===== 前端 CFO 结余、额度与历史欠产按正确口径强覆写 =====
  // 必须调用 computeCfoKuanMetrics 强覆写：本地 auth 与远程模式统一走 CFO 强覆写，禁止盲信 API 错误 currentSurplus
  const cfoMetrics = useMemo(() => {
    return computeCfoKuanMetrics({
      currentUser,
      effectiveMonth,
      collectionPackage,
      productionPackage,
      logs,
      resources,
      users,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  }, [currentUser, effectiveMonth, collectionPackage, productionPackage, logs, resources, users, startDate, endDate]);

  // 当月结余 rawSurplus (可负，禁止 floor 成 0；与顶部收款包同源)
  const currentBalance = cfoMetrics.rawSurplus;

  // 奖金额度（分配额度）allocQuota = max(0, rawSurplus + historyDebtSigned)
  const bonusQuota = cfoMetrics.allocQuota;

  // 历史欠产 historyDebtSigned (当年 1~M-1 滚动，2026-01 为 0，负数展示)
  const historicalDebt = cfoMetrics.historyDebtSigned;

  // ===== 分配 API 请求（保留用于对照或承兑类字段，但结余/额度/历史欠产以本地 CFO 强覆写为准） =====
  const [serverDistributionItem, setServerDistributionItem] = useState<any | null>(null);
  const [loadingDistribution, setLoadingDistribution] = useState(false);
  const [errorDistribution, setErrorDistribution] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (import.meta.env.VITE_USE_LOCAL_AUTH !== 'true') {
      setLoadingDistribution(true);
      setErrorDistribution(null);
      fetchDistributionData(effectiveMonth)
        .then(res => {
          if (isMounted) {
            if (res && Array.isArray(res.distribution)) {
              const item = res.distribution.find((d: any) => d.userId === currentUser.id);
              setServerDistributionItem(item || null);
            } else {
              setErrorDistribution("数据格式错误");
            }
          }
        })
        .catch(err => {
          console.error("MyAccount: fetchDistributionData API error:", err);
          if (isMounted) {
            setErrorDistribution("加载失败");
          }
        })
        .finally(() => {
          if (isMounted) setLoadingDistribution(false);
        });
    } else {
      setServerDistributionItem(null);
      setLoadingDistribution(false);
      setErrorDistribution(null);
    }
    return () => { isMounted = false; };
  }, [effectiveMonth, currentUser.id]);

  // 明细列表过滤（按当前维度过滤后的 activeLogs 进行搜索与筛选）
  const filteredDetailLogs = useMemo(() => {
    return activeLogs.filter(l => {
      // 类型过滤
      if (filterType === 'revenue' && l.category !== RefineCategory.Revenue) return false;
      if (filterType === 'value' && l.category !== RefineCategory.Value) return false;

      // 状态过滤
      if (filterStatus !== 'all' && l.status !== filterStatus) return false;

      // 矿山编号过滤
      if (filterMiningId && !l.miningId.toLowerCase().includes(filterMiningId.toLowerCase())) return false;

      // 收支方向过滤
      if (filterDirection === 'income' && l.calculatedNetValue <= 0) return false;
      if (filterDirection === 'expense' && l.calculatedNetValue >= 0) return false;

      // 成本分类过滤 (all, A, B1, B2, C, D)
      if (filterCostCategory !== 'all' && l.resolvedCostCategory !== filterCostCategory) return false;

      // 关键字搜索 (单号)
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!l.id.toLowerCase().includes(term)) return false;
      }

      return true;
    });
  }, [activeLogs, filterType, filterStatus, filterMiningId, filterDirection, filterCostCategory, searchTerm]);

  // 筛选后汇总计算
  const filteredSummary = useMemo(() => {
    let income = 0;
    let expense = 0;
    let revenuePkg = 0;
    let valuePkg = 0;

    filteredDetailLogs.forEach(l => {
      const val = Math.round(l.calculatedNetValue || 0);
      if (val > 0) income += val;
      else expense += Math.abs(val);

      if (l.category === RefineCategory.Revenue) revenuePkg += val;
      if (l.category === RefineCategory.Value) valuePkg += val;
    });

    return {
      income,
      expense,
      revenuePkg,
      valuePkg,
      combinedPkg: revenuePkg + valuePkg,
      count: filteredDetailLogs.length
    };
  }, [filteredDetailLogs]);

  const handleClearFilters = () => {
    setFilterType('all');
    setFilterStatus('all');
    setFilterMiningId('');
    setFilterDirection('all');
    setFilterCostCategory('all');
    setSearchTerm('');
    setSelectedMonth(getLocalMonthString());
    setStartDate('');
    setEndDate('');
  };

  // 导出表格
  const handleExportExcel = () => {
    if (!canExport) {
      toast.error(EXPORT_DISABLED_TOOLTIP);
      return;
    }
    const exportData = filteredDetailLogs.map((l, index) => ({
      '序号': index + 1,
      '单号': l.id,
      '业务日期': l.resolvedDate,
      '业务月份': l.resolvedMonth,
      '提交日期': formatSubmissionDate(l.timestamp),
      '提交时间': formatSubmissionTime(l.timestamp),
      '类别': l.category,
      '类型/项目': l.type,
      '成本分类': l.resolvedCostCategory ? DYNAMIC_COST_CATEGORY_META[l.resolvedCostCategory].label : '-',
      '矿山编号': l.miningId,
      '净额': Math.round(l.calculatedNetValue || 0),
      '状态': l.status
    }));

    // 汇总行
    exportData.push({
      '序号': '汇总' as any,
      '单号': `共 ${filteredSummary.count} 笔` as any,
      '业务日期': '' as any,
      '业务月份': '' as any,
      '提交日期': '' as any,
      '提交时间': '' as any,
      '类别': `总收入: ${filteredSummary.income}` as any,
      '类型/项目': `总支出: ${filteredSummary.expense}` as any,
      '成本分类': '' as any,
      '矿山编号': `收产包合计: ${filteredSummary.combinedPkg}` as any,
      '净额': filteredSummary.income - filteredSummary.expense as any,
      '状态': '' as any
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '我的帐户流水明细');

    // 增加汇总页签
    const summaryData = [
      ['项目', '数值', '说明'],
      ['本期收入合计', filteredSummary.income, '筛选范围内正向流水总和'],
      ['本期支出/成本合计', filteredSummary.expense, '筛选范围内负向流水总和'],
      ['收产包合计', filteredSummary.combinedPkg, '收款包 + 产兑包'],
      ['动态消耗五类支出合计', dynamicCostFiveTiers.totalCost, 'A+B1+B2+C+D已确权/入库消耗总计'],
      ['A类 · 款专类报销', dynamicCostFiveTiers.totals.A, '款专类报销'],
      ['B1类 · 产专类报销', dynamicCostFiveTiers.totals.B1, '产专类报销'],
      ['B2类 · 产专运维消耗', dynamicCostFiveTiers.totals.B2, '产专类项目运维消耗'],
      ['C类 · C类对冲', dynamicCostFiveTiers.totals.C, '跨单元/指定矿山对冲消耗'],
      ['D类 · 经营单元公摊', dynamicCostFiveTiers.totals.D, '经营单元公摊'],
      ['交易笔数', filteredSummary.count, '条记录'],
      ['筛选条件', `时间: ${startDate && endDate ? `${startDate}至${endDate}` : (selectedMonth || '全部')} | 类别: ${filterType} | 状态: ${filterStatus} | 方向: ${filterDirection} | 成本分类: ${filterCostCategory}`, '']
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, '汇总报告');

    const modeStr = startDate && endDate ? `${startDate}_至_${endDate}` : (selectedMonth || effectiveMonth);
    exportWorkbook(workbook, buildExcelFilename(`我的帐户流水明细_${currentUser.name}`, modeStr));
    toast.success('已导出流水报告（含汇总页签）');
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* 顶部标题区 */}
      <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 ${UI_TOKENS.RADIUS_PANEL} border border-slate-100 shadow-sm`}>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">我的帐户</h1>
            <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-mono font-bold">
              {currentUser.name} | {currentUser.category || currentUser.role}
            </Badge>
          </div>
        </div>

        {/* 月度固定成本隐私开关 */}
        <div className="flex items-center gap-2.5">
          <CostPrivacyToggle />
        </div>
      </div>

      {/* 1. 总览区：价值包汇总与月度财务分配指标 (数值整数展示) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* 收款包 */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 p-5 rounded-3xl border border-blue-100/80 shadow-2xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest block mb-1">收款包</span>
            <h3 className="text-2xl font-black text-slate-900 font-mono">
              {formatAmount(collectionPackage)}
            </h3>
          </div>
        </div>

        {/* 产兑包 */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 p-5 rounded-3xl border border-emerald-100/80 shadow-2xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block mb-1">产兑包</span>
            <h3 className="text-2xl font-black text-slate-900 font-mono">
              {formatAmount(productionPackage)}
            </h3>
          </div>
        </div>

        {/* 收产包 */}
        <div className="bg-gradient-to-br from-purple-50 to-violet-50/50 p-5 rounded-3xl border border-purple-100/80 shadow-2xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest block mb-1">收产包</span>
            <h3 className="text-2xl font-black text-slate-900 font-mono">
              {formatAmount(combinedPackage)}
            </h3>
          </div>
        </div>

        {/* 当月结余 (按月) */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50/50 p-5 rounded-3xl border border-amber-100/80 shadow-2xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest block mb-1">当月结余 ({effectiveMonth})</span>
            <h3 className={`text-2xl font-black font-mono ${!isCostVisible ? 'text-slate-900' : currentBalance >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
              {!isCostVisible ? (
                '****'
              ) : (
                `${currentBalance > 0 ? '+' : ''}${formatAmount(currentBalance)}`
              )}
            </h3>
            <div className="text-[10px] text-slate-500 mt-1.5 flex items-center gap-1 truncate" title={cfoMetrics.formulaDescription}>
              <span className="font-semibold text-amber-700">口径:</span>
              <span className="truncate">{cfoMetrics.formulaDescription}</span>
            </div>
          </div>
        </div>

        {/* 奖金额度 (按月) */}
        <div className="bg-gradient-to-br from-sky-50 to-cyan-50/50 p-5 rounded-3xl border border-sky-100/80 shadow-2xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black text-sky-600 uppercase tracking-widest block mb-1">奖金额度 ({effectiveMonth})</span>
            <h3 className="text-2xl font-black text-slate-900 font-mono">
              {!isCostVisible ? (
                '****'
              ) : (
                formatAmount(bonusQuota)
              )}
            </h3>
            <div className="text-[10px] text-slate-500 mt-1.5 flex items-center gap-1 truncate" title="max(0, 结余 + 历史欠产)">
              <span className="font-semibold text-sky-700">口径:</span>
              <span className="truncate">max(0, 结余 + 历史欠产)</span>
            </div>
          </div>
        </div>

        {/* 历史欠产 (按月) */}
        <div className="bg-gradient-to-br from-rose-50 to-red-50/50 p-5 rounded-3xl border border-rose-100/80 shadow-2xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest block mb-1">历史欠产 ({effectiveMonth})</span>
            <h3 className={`text-2xl font-black font-mono ${!isCostVisible ? 'text-slate-900' : historicalDebt < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {!isCostVisible ? (
                '****'
              ) : (
                formatAmount(historicalDebt)
              )}
            </h3>
            <div className="text-[10px] text-slate-500 mt-1.5 flex items-center gap-1 truncate" title="1~M-1月累计欠产滚动（每年1月清零）">
              <span className="font-semibold text-rose-700">口径:</span>
              <span className="truncate">1~M-1月累计欠产滚动</span>
            </div>
          </div>
        </div>
      </div>

      {/* 1.1 动态消耗五类支出总览 (A / B1 / B2 / C / D) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-500 uppercase tracking-wider">动态消耗五类支出拆分</span>
            <span className="text-[11px] text-slate-400 font-normal">
              （当前窗口已确权/入库消耗合计：
              <span className="font-mono font-bold text-slate-700">
                {isCostVisible ? formatAmount(dynamicCostFiveTiers.totalCost) : '****'}
              </span>
              ）
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {(['A', 'B1', 'B2', 'C', 'D'] as DynamicCostCategory[]).map((catKey) => {
            const meta = DYNAMIC_COST_CATEGORY_META[catKey];
            const amount = dynamicCostFiveTiers.totals[catKey];
            const isSelected = filterCostCategory === catKey;

            return (
              <div
                key={catKey}
                onClick={() => setFilterCostCategory(prev => prev === catKey ? 'all' : catKey)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${meta.bg} ${meta.border} ${
                  isSelected ? 'ring-2 ring-slate-900 shadow-md' : 'hover:shadow-xs'
                }`}
                title={`点击以${isSelected ? '取消' : '仅查看'}${meta.label}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[11px] font-black uppercase tracking-wider ${meta.text}`}>
                    {meta.label}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/80 text-slate-700 border border-slate-200">
                    {catKey}
                  </span>
                </div>
                <div>
                  <div className="text-xl font-black font-mono text-slate-900">
                    {isCostVisible ? formatAmount(amount) : '****'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 truncate" title={meta.desc}>
                    {meta.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. 流水明细区 */}
      <Card
        title="本人流水明细"
        className={`p-8 ${UI_TOKENS.RADIUS_PANEL} bg-white shadow-sm border border-slate-100 overflow-hidden`}
      >
        {/* 高级筛选工具栏 - 银行式布局 */}
        <div className="space-y-4 mb-8">
          <div className="flex flex-wrap items-end gap-4 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
            {/* 1. 业务时间筛选 - 核心引擎 */}
            {/* 1. 业务日期筛选 */}
            <div className="space-y-1.5 min-w-fit">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider h-4 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                业务日期窗口
              </label>
              <BusinessDateFilter
                month={startDate || endDate ? '' : selectedMonth}
                onMonthChange={(m) => {
                  setSelectedMonth(m);
                  setStartDate('');
                  setEndDate('');
                }}
                startDate={startDate}
                endDate={endDate}
                onDateRangeChange={(s, e) => {
                  setStartDate(s);
                  setEndDate(e);
                  setSelectedMonth('');
                }}
                onClear={() => {
                  setSelectedMonth(getLocalMonthString());
                  setStartDate('');
                  setEndDate('');
                }}
              />
            </div>

            {/* 分隔符 */}
            <div className="hidden lg:block h-10 w-px bg-slate-200 self-end mb-0 mx-2"></div>

            {/* 2. 业务类别筛选 */}
            <div className="space-y-1.5 flex-1 min-w-[120px]">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider h-4 flex items-center">业务类别</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full bg-white border border-[#b8d0f7] text-[13px] text-slate-800 font-bold rounded-[4px] px-3 py-2 outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 cursor-pointer h-10 transition-all"
              >
                <option value="all">全部类别</option>
                <option value="revenue">收款</option>
                <option value="value">产值</option>
              </select>
            </div>

            {/* 3. 确权状态筛选 */}
            <div className="space-y-1.5 flex-1 min-w-[120px]">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider h-4 flex items-center">确权状态</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full bg-white border border-[#b8d0f7] text-[13px] text-slate-800 font-bold rounded-[4px] px-3 py-2 outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 cursor-pointer h-10 transition-all"
              >
                <option value="all">全部状态</option>
                <option value={AuditStatus.Confirmed}>{AuditStatus.Confirmed}</option>
                <option value={AuditStatus.Approved}>{AuditStatus.Approved}</option>
                <option value={AuditStatus.Pending}>{AuditStatus.Pending}</option>
                <option value={AuditStatus.Rejected}>{AuditStatus.Rejected}</option>
              </select>
            </div>

            {/* 4. 矿山搜索 */}
            <div className="space-y-1.5 flex-1 min-w-[140px]">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider h-4 flex items-center">矿山筛选</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="ID / 名称..."
                  value={filterMiningId}
                  onChange={(e) => setFilterMiningId(e.target.value)}
                  className="w-full bg-white border border-[#b8d0f7] text-[13px] font-bold rounded-[4px] pl-8 pr-3 py-2 outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 text-slate-800 h-10 transition-all placeholder:text-[#94a3b8]"
                />
              </div>
            </div>

            {/* 5. 收支方向 */}
            <div className="space-y-1.5 flex-1 min-w-[100px]">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider h-4 flex items-center">方向</label>
              <select
                value={filterDirection}
                onChange={(e) => setFilterDirection(e.target.value)}
                className="w-full bg-white border border-[#b8d0f7] text-[13px] text-slate-800 font-bold rounded-[4px] px-3 py-2 outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 cursor-pointer h-10 transition-all"
              >
                <option value="all">全部方向</option>
                <option value="income">收入</option>
                <option value="expense">支出</option>
              </select>
            </div>

            {/* 6. 成本分类筛选 */}
            <div className="space-y-1.5 flex-1 min-w-[120px]">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider h-4 flex items-center">成本分类</label>
              <select
                value={filterCostCategory}
                onChange={(e) => setFilterCostCategory(e.target.value)}
                className="w-full bg-white border border-[#b8d0f7] text-[13px] text-slate-800 font-bold rounded-[4px] px-3 py-2 outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 cursor-pointer h-10 transition-all"
              >
                <option value="all">全部成本类</option>
                <option value="A">A类 · 款专报销</option>
                <option value="B1">B1类 · 产专报销</option>
                <option value="B2">B2类 · 运维消耗</option>
                <option value="C">C类 · C类对冲</option>
                <option value="D">D类 · 单元公摊</option>
              </select>
            </div>

            {/* 7. 单号搜索 */}
            <div className="space-y-1.5 flex-[1.5] min-w-[160px]">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider h-4 flex items-center">单号关键词</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="单号模糊匹配..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white border border-[#b8d0f7] text-[13px] font-bold rounded-[4px] pl-8 pr-3 py-2 outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 text-slate-800 h-10 transition-all placeholder:text-[#94a3b8]"
                  />
                </div>
                <button
                  onClick={handleClearFilters}
                  className="px-3 bg-white border border-[#b8d0f7] text-slate-500 hover:text-[#1a56db] hover:border-[#1a56db] rounded-[4px] transition-all cursor-pointer h-10 flex items-center justify-center"
                  title="一键清除筛选"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 导出与笔数 - 移动到筛条右侧 */}
            <div className="ml-auto flex items-center gap-4 self-end mb-0.5">
              <div className="text-right">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">筛选笔数</div>
                <div className="text-sm font-black font-mono text-slate-700">{filteredSummary.count}</div>
              </div>
              <div className="h-8 w-px bg-slate-200"></div>
              <button
                onClick={handleExportExcel}
                disabled={!canExport}
                title={getExportButtonTitle(canExport, '导出账单')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm ${
                  !canExport
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
                    : 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer hover:shadow-md'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                导出账单
              </button>
            </div>
          </div>


          {/* 筛选结果汇总展示区 - 银行固定面板样式 */}
          <div className="bg-slate-900 rounded-2xl p-6 text-white flex flex-wrap items-center justify-between gap-6 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-white/10 transition-all duration-1000"></div>
            
            <div className="flex flex-wrap items-center gap-8 md:gap-12 relative z-10">
              <div className="space-y-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <div className="w-1 h-1 bg-emerald-400 rounded-full"></div>
                  本期收入合计
                </span>
                <div className="text-xl font-black font-mono text-emerald-400">
                  {formatAmount(filteredSummary.income)}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <div className="w-1 h-1 bg-rose-400 rounded-full"></div>
                  本期支出/成本合计
                </span>
                <div className="text-xl font-black font-mono text-rose-400">
                  {isCostVisible ? formatAmount(filteredSummary.expense) : '****'}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
                  收产包合计
                </span>
                <div className="text-xl font-black font-mono text-blue-400">
                  {formatAmount(filteredSummary.combinedPkg)}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <div className="w-1 h-1 bg-amber-400 rounded-full"></div>
                  期末结余 ({effectiveMonth})
                </span>
                <div className={`text-xl font-black font-mono ${currentBalance >= 0 ? 'text-white' : 'text-rose-400'}`}>
                  {isCostVisible ? formatAmount(currentBalance) : '****'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 流水明细表格：业务日期、提交日期、类型、成本分类、矿山、收产包、状态、单号 */}
        <div className="overflow-x-auto custom-scrollbar border border-slate-100 rounded-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                <th className="p-4">业务日期</th>
                <th className="p-4">提交日期</th>
                <th className="p-4">类型</th>
                <th className="p-4">成本分类</th>
                <th className="p-4">矿山</th>
                <th className="p-4 text-right">收产包</th>
                <th className="p-4 text-center">状态</th>
                <th className="p-4">单号</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredDetailLogs.length > 0 ? (
                filteredDetailLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-4 font-mono font-bold text-slate-800 whitespace-nowrap">{l.resolvedDate}</td>
                    <td className="p-4 font-mono text-slate-500 whitespace-nowrap">
                      {formatSubmissionDate(l.timestamp)} <span className="text-[10px] text-slate-400">{formatSubmissionTime(l.timestamp)}</span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                        l.category === RefineCategory.Revenue ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {l.category} ({l.type})
                      </span>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      {l.resolvedCostCategory ? (
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${DYNAMIC_COST_CATEGORY_META[l.resolvedCostCategory].bg} ${DYNAMIC_COST_CATEGORY_META[l.resolvedCostCategory].text} ${DYNAMIC_COST_CATEGORY_META[l.resolvedCostCategory].border}`}>
                          {DYNAMIC_COST_CATEGORY_META[l.resolvedCostCategory].label}
                        </span>
                      ) : (
                        <span className="text-slate-300 font-mono text-[11px]">-</span>
                      )}
                    </td>
                    <td className="p-4 font-bold text-slate-700 max-w-xs truncate" title={l.miningId}>
                      {l.miningId}
                    </td>
                    <td className="p-4 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                      {Math.round(l.calculatedNetValue || l.amount || 0).toLocaleString()}
                    </td>
                    <td className="p-4 text-center whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        l.status === AuditStatus.Confirmed ? 'bg-emerald-100 text-emerald-800' :
                        l.status === AuditStatus.Approved ? 'bg-blue-100 text-blue-800' :
                        l.status === AuditStatus.Rejected ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">{l.id}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest">{UI_LABELS.EMPTY_DEFAULT}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default MyAccount;

