import React, { useState, useEffect, useMemo } from 'react';
import { User, ValueCreationLog, InternalTransaction, MiningResource, AuditStatus, TransactionStatus, RefineCategory } from '../types';
import { Card, Badge } from '../src/components/UI';
import { getLocalMonthString, getLocalDateString, resolveLogBusinessMonth, resolveLogBusinessDate, formatSubmissionDate, formatSubmissionTime, isDateInRange, isLogInFilter } from '../src/utils/dateUtils';
import { calculateHistoricalNetValue, getUserSalaryByMonth } from '../src/utils/business';
import { aggregateUserMonthMetrics, calculateBonusAllocation } from '../src/utils/bonusAllocation';
import { fetchDistributionData } from '../src/api/distribution';
import { useCostPrivacy } from '../src/hooks/useCostPrivacy';
import { formatAmount } from '../src/utils/formatters';
import { BusinessDateFilter } from '../src/components/BusinessDateFilter';
import { InfoTip } from '../src/components/InfoTip';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Wallet, TrendingUp, ShieldCheck, ArrowRight, Eye, EyeOff, FileSpreadsheet, Search, Filter, Calendar, RefreshCw } from 'lucide-react';

interface MyAccountProps {
  currentUser: User;
  logs: ValueCreationLog[];
  transactions: InternalTransaction[];
  resources: MiningResource[];
  users: User[];
}

const MyAccount: React.FC<MyAccountProps> = ({ currentUser, logs, transactions, resources, users }) => {
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
      return {
        ...l,
        resolvedMonth: bMonth,
        resolvedDate: bDate,
        calculatedNetValue: netVal
      };
    }).sort((a, b) => b.resolvedDate.localeCompare(a.resolvedDate) || b.timestamp - a.timestamp);
  }, [myLogs, resources, users]);

  // 按维度模式过滤的当前活跃日志
  const activeLogs = useMemo(() => {
    return myUnifiedLogs.filter(l => isLogInFilter(l, selectedMonth, startDate, endDate));
  }, [myUnifiedLogs, selectedMonth, startDate, endDate]);

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

  // 奖金与欠产分配本地计算（仅 VITE_USE_LOCAL_AUTH === 'true' 才跑）
  const bonusResult = useMemo(() => {
    if (import.meta.env.VITE_USE_LOCAL_AUTH !== 'true') {
      return { quota: 0, newDebt: 0, history: 0 };
    }
    return calculateBonusAllocation(effectiveMonth, currentUser, logs, resources, users, AuditStatus.Confirmed);
  }, [effectiveMonth, currentUser, logs, resources, users]);

  // 当月结余 = 本月收入 - 本月成本（本地计算）
  const monthlySalary = getUserSalaryByMonth(currentUser, effectiveMonth);
  const localCost = monthlySalary + (currentUser.category?.includes('产专') ? monthMetrics.b1Cost : monthMetrics.aCost);
  const localIncome = currentUser.category?.includes('产专') ? monthMetrics.productionPackage : monthMetrics.revenuePackage;
  const localBalance = localIncome - localCost;

  const localDebt = bonusResult.newDebt < 0 ? bonusResult.newDebt : (bonusResult.history < 0 ? bonusResult.history : 0);
  const localBonusQuota = bonusResult.quota;

  // ===== 分配 API 降级控制 =====
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
              toast.error("获取的分配数据格式不正确");
            }
          }
        })
        .catch(err => {
          console.error("MyAccount: fetchDistributionData API error:", err);
          if (isMounted) {
            setErrorDistribution("加载失败");
            toast.error("无法加载分配数据");
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

  // 权威分配 API 返回值优先，API 异常/无数据时：如果是远程模式，禁止静默降级至本地计算
  const currentBalance = import.meta.env.VITE_USE_LOCAL_AUTH === 'true'
    ? localBalance
    : (serverDistributionItem ? (serverDistributionItem.confirmed?.currentSurplus ?? serverDistributionItem.currentSurplusConfirmed ?? serverDistributionItem.currentSurplus ?? 0) : null);

  const bonusQuota = import.meta.env.VITE_USE_LOCAL_AUTH === 'true'
    ? localBonusQuota
    : (serverDistributionItem ? (serverDistributionItem.confirmed?.theoreticalBonus ?? serverDistributionItem.theoreticalBonusConfirmed ?? serverDistributionItem.theoreticalBonus ?? 0) : null);

  const historicalDebt = import.meta.env.VITE_USE_LOCAL_AUTH === 'true'
    ? localDebt
    : (serverDistributionItem ? (serverDistributionItem.confirmed?.newDebt ?? serverDistributionItem.nextDebtConfirmed ?? serverDistributionItem.nextDebt ?? serverDistributionItem.historyDebt ?? 0) : null);

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

      // 关键字搜索 (单号)
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!l.id.toLowerCase().includes(term)) return false;
      }

      return true;
    });
  }, [activeLogs, filterType, filterStatus, filterMiningId, filterDirection, searchTerm]);

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
    setSearchTerm('');
    setSelectedMonth(getLocalMonthString());
    setStartDate('');
    setEndDate('');
  };

  // 导出表格
  const handleExportExcel = () => {
    const exportData = filteredDetailLogs.map((l, index) => ({
      '序号': index + 1,
      '单号': l.id,
      '业务日期': l.resolvedDate,
      '业务月份': l.resolvedMonth,
      '提交日期': formatSubmissionDate(l.timestamp),
      '提交时间': formatSubmissionTime(l.timestamp),
      '类别': l.category,
      '类型/项目': l.type,
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
      '矿山编号': `收产包合计: ${filteredSummary.combinedPkg}` as any,
      '净额': filteredSummary.income - filteredSummary.expense as any,
      '状态': '' as any
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '我的账户流水明细');

    // 增加汇总页签
    const summaryData = [
      ['项目', '数值', '说明'],
      ['本期收入合计', filteredSummary.income, '筛选范围内正向流水总和'],
      ['本期支出/成本合计', filteredSummary.expense, '筛选范围内负向流水总和'],
      ['收产包合计', filteredSummary.combinedPkg, '收款包 + 产兑包'],
      ['交易笔数', filteredSummary.count, '条记录'],
      ['筛选条件', `时间: ${startDate && endDate ? `${startDate}至${endDate}` : (selectedMonth || '全部')} | 类别: ${filterType} | 状态: ${filterStatus} | 方向: ${filterDirection}`, '']
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, '汇总报告');

    const modeStr = startDate && endDate ? `${startDate}_至_${endDate}` : (selectedMonth || effectiveMonth);
    const todayStr = getLocalDateString();
    XLSX.writeFile(workbook, `我的账户流水明细_${currentUser.name}_${modeStr}_导出${todayStr}.xlsx`);
    toast.success('已导出流水报告（含汇总页签）');
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* 顶部标题区 */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">我的账户</h1>
            <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-mono font-bold">
              {currentUser.name} | {currentUser.category || currentUser.role}
            </Badge>
          </div>
        </div>

        {/* 月度固定成本隐私开关 */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={toggleCostVisible}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
          >
            {isCostVisible ? <EyeOff className="w-4 h-4 text-slate-500" /> : <Eye className="w-4 h-4 text-slate-500" />}
            <span>{isCostVisible ? "隐藏成本" : "显示成本"}</span>
          </button>
        </div>
      </div>

      {/* 1. 总览区：价值包汇总与月度财务分配指标 (金额整数展示) */}
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
            <h3 className={`text-2xl font-black font-mono ${currentBalance === null ? 'text-slate-500' : currentBalance >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
              {loadingDistribution ? (
                <span className="text-sm font-bold text-slate-400">加载中...</span>
              ) : errorDistribution ? (
                <span className="text-sm font-bold text-rose-500">无法加载分配数据</span>
              ) : !isCostVisible ? (
                '****'
              ) : currentBalance !== null ? (
                formatAmount(currentBalance)
              ) : (
                '--'
              )}
            </h3>
          </div>
        </div>

        {/* 奖金额度 (按月) */}
        <div className="bg-gradient-to-br from-sky-50 to-cyan-50/50 p-5 rounded-3xl border border-sky-100/80 shadow-2xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black text-sky-600 uppercase tracking-widest block mb-1">奖金额度 ({effectiveMonth})</span>
            <h3 className="text-2xl font-black text-slate-900 font-mono">
              {loadingDistribution ? (
                <span className="text-sm font-bold text-slate-400">加载中...</span>
              ) : errorDistribution ? (
                <span className="text-sm font-bold text-rose-500">无法加载分配数据</span>
              ) : !isCostVisible ? (
                '****'
              ) : bonusQuota !== null ? (
                formatAmount(bonusQuota)
              ) : (
                '--'
              )}
            </h3>
          </div>
        </div>

        {/* 历史欠产 (按月) */}
        <div className="bg-gradient-to-br from-rose-50 to-red-50/50 p-5 rounded-3xl border border-rose-100/80 shadow-2xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest block mb-1">历史欠产 ({effectiveMonth})</span>
            <h3 className="text-2xl font-black text-rose-600 font-mono">
              {loadingDistribution ? (
                <span className="text-sm font-bold text-slate-400">加载中...</span>
              ) : errorDistribution ? (
                <span className="text-sm font-bold text-rose-500">无法加载分配数据</span>
              ) : !isCostVisible ? (
                '****'
              ) : historicalDebt !== null ? (
                formatAmount(historicalDebt)
              ) : (
                '--'
              )}
            </h3>
          </div>
        </div>
      </div>

      {/* 2. 流水明细区 */}
      <Card
        title="本人流水明细"
        className="p-8 rounded-[2.5rem] bg-white shadow-sm border border-slate-100 overflow-hidden"
      >
        {/* 高级筛选工具栏 - 银行式布局 */}
        <div className="space-y-4 mb-8">
          <div className="flex flex-wrap items-end gap-4 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
            {/* 1. 业务时间筛选 - 核心引擎 */}
            <div className="space-y-1.5 min-w-fit">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
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

            {/* 分隔符 (可选) */}
            <div className="hidden lg:block h-10 w-px bg-slate-200 self-end mb-1 mx-2"></div>

            {/* 2. 业务类别筛选 */}
            <div className="space-y-1.5 flex-1 min-w-[120px]">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">业务类别</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full bg-white border border-slate-200 text-xs text-slate-700 font-bold rounded-xl px-3 py-2 outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
              >
                <option value="all">全部</option>
                <option value="revenue">收款</option>
                <option value="value">产值</option>
              </select>
            </div>

            {/* 3. 确权状态筛选 */}
            <div className="space-y-1.5 flex-1 min-w-[120px]">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">确权状态</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full bg-white border border-slate-200 text-xs text-slate-700 font-bold rounded-xl px-3 py-2 outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
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
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">矿山筛选</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ID / 名称..."
                  value={filterMiningId}
                  onChange={(e) => setFilterMiningId(e.target.value)}
                  className="w-full bg-white border border-slate-200 text-xs rounded-xl pl-8 pr-3 py-2 outline-none focus:border-blue-500 text-slate-800 shadow-2xs"
                />
              </div>
            </div>

            {/* 5. 收支方向 */}
            <div className="space-y-1.5 flex-1 min-w-[100px]">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">方向</label>
              <select
                value={filterDirection}
                onChange={(e) => setFilterDirection(e.target.value)}
                className="w-full bg-white border border-slate-200 text-xs text-slate-700 font-bold rounded-xl px-3 py-2 outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
              >
                <option value="all">全部</option>
                <option value="income">收入</option>
                <option value="expense">支出</option>
              </select>
            </div>

            {/* 6. 单号搜索 */}
            <div className="space-y-1.5 flex-[1.5] min-w-[160px]">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">单号关键词</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Filter className="w-3.5 h-3.5 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="单号模糊匹配..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white border border-slate-200 text-xs rounded-xl pl-8 pr-3 py-2 outline-none focus:border-blue-500 text-slate-800 shadow-2xs"
                  />
                </div>
                <button
                  onClick={handleClearFilters}
                  className="p-2 bg-white border border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 rounded-xl transition-all shadow-2xs"
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
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm hover:shadow-md"
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

        {/* 流水明细表格：业务日期、提交日期、类型、矿山、收产包、状态、单号 */}
        <div className="overflow-x-auto custom-scrollbar border border-slate-100 rounded-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                <th className="p-4">业务日期</th>
                <th className="p-4">提交日期</th>
                <th className="p-4">类型</th>
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
                  <td colSpan={7} className="text-center py-16 text-slate-400">
                    <p className="text-sm font-bold">暂无流水</p>
                  </td>
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

