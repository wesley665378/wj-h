import React, { useState, useMemo } from 'react';
import { ValueCreationLog, MiningResource, User, InternalTransaction, TransactionStatus, AuditStatus } from '../types';
import { Card } from '../src/components/UI';
import { BusinessUnitProfitRankingTable } from '../src/components/BusinessUnitProfitRankingTable';
import { BusinessDateFilter } from '../src/components/BusinessDateFilter';
import { sumConfirmedRevenuePackage, sumIncomeProductionPackage } from '../src/utils/reconcileMiningFromLogs';
import { getUserSalaryByMonth } from '../src/utils/business';
import { isSalaryActiveForMonth } from '../src/utils/employmentStatus';
import { getLocalMonthString, resolveLogBusinessMonth, resolveLogBusinessDate, isDateInRange, isLogInFilter } from '../src/utils/dateUtils';
import { formatMoney, roundMoney } from '../src/utils/formatMoney';
import { 
  Users, 
  Droplets, 
  ShieldCheck, 
  Download, 
  Activity, 
  Layers, 
  Building2, 
  Coins, 
  TrendingUp, 
  TrendingDown, 
  Search, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  BarChart3,
  SlidersHorizontal,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';

interface ReservoirProps {
  logs: ValueCreationLog[];
  auditLogs?: ValueCreationLog[];
  resources: MiningResource[];
  users: User[];
  transactions?: InternalTransaction[];
  businessUnits: string[];
  currentUser?: User;
}

interface CenterMetricItem {
  center: string;
  confirmedRevenuePackage: number;
  inflow20: number;
  incomeProductionPackage: number;
  unitSalary: number;
  unitSupplement: number;
}

const ReservoirVisualizer: React.FC<{ 
  metrics: CenterMetricItem[]; 
  totalInflow: number; 
  totalSupplement: number;
}> = ({ metrics, totalInflow, totalSupplement }) => {
  const [hoveredCenter, setHoveredCenter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'orbit' | 'grid'>('orbit');
  const viewBoxSize = 800;
  const centerCoord = viewBoxSize / 2;

  const isDeficitOverall = totalSupplement > totalInflow;
  const netBalance = totalInflow - totalSupplement;

  return (
    <div className="p-6 md:p-8 rounded-2xl bg-white border border-slate-200/80 shadow-sm relative overflow-hidden">
      {/* 顶部标题与控制栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 relative z-30">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-100/80">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span>
            <span className="text-[10px] font-bold text-blue-700 tracking-wider">实时流向监测</span>
          </div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            统筹水库流向示意图
          </h3>
          <p className="text-slate-500 text-xs font-medium leading-relaxed">
            可视化各经营单元对统筹池的价值贡献（20%流入）与刚性成本补足的资金流动
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('orbit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'orbit'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>星轨拓扑</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'grid'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>单元卡片</span>
          </button>
        </div>
      </div>

      {/* 图例与说明 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-blue-50/80 px-2.5 py-1 rounded-lg border border-blue-100">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
            <span className="text-[11px] font-bold text-blue-700">单元流入 (20%收款确权包)</span>
          </div>
          <div className="flex items-center gap-2 bg-amber-50/80 px-2.5 py-1 rounded-lg border border-amber-100">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span className="text-[11px] font-bold text-amber-700">统筹流出 (刚性补足缺口)</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="text-slate-400 font-medium">统筹水库净差额:</span>
          <span className={`font-mono ${netBalance >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
            {netBalance >= 0 ? '+' : ''}{formatMoney(netBalance)}
          </span>
        </div>
      </div>

      {/* 视图切换区域 */}
      {viewMode === 'orbit' ? (
        <div className="relative w-full min-h-[520px] md:min-h-[580px] flex items-center justify-center bg-slate-50/60 rounded-2xl border border-slate-200/60 p-4 overflow-hidden select-none">
          {/* 背景网格纹理 */}
          <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
          <div className="absolute inset-0 bg-radial from-transparent via-white/30 to-transparent pointer-events-none"></div>

          {/* SVG 连线与动画粒子 */}
          <svg 
            viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`} 
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
          >
            {metrics.map((m, idx) => {
              const totalUnits = metrics.length || 1;
              const angle = (idx / totalUnits) * 2 * Math.PI - Math.PI / 2;
              const radius = 280;
              const x = centerCoord + Math.cos(angle) * radius;
              const y = centerCoord + Math.sin(angle) * radius;
              
              const isHovered = hoveredCenter === m.center;
              const isDimmed = hoveredCenter !== null && !isHovered;

              const pathIn = `M ${x} ${y} L ${centerCoord} ${centerCoord}`;
              const pathOut = `M ${centerCoord} ${centerCoord} L ${x} ${y}`;

              return (
                <React.Fragment key={`lines-${m.center}`}>
                  {/* 经营单元流入连线 (蓝线) */}
                  <motion.path
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ 
                      pathLength: 1, 
                      opacity: isDimmed ? 0.1 : (isHovered ? 0.8 : 0.35) 
                    }}
                    transition={{ duration: 0.8, delay: idx * 0.05 }}
                    d={pathIn}
                    stroke="#3b82f6"
                    strokeWidth={isHovered ? "3" : "2"}
                    fill="none"
                    strokeDasharray={isHovered ? "none" : "4 4"}
                  />
                  
                  {/* 流入流动粒子 */}
                  {m.inflow20 > 0 && !isDimmed && (
                    <motion.circle
                      r={isHovered ? "5" : "3.5"}
                      fill="#3b82f6"
                      initial={{ offsetDistance: "0%" }}
                      animate={{ offsetDistance: "100%" }}
                      transition={{ 
                        duration: isHovered ? 2 : 3.2, 
                        repeat: Infinity, 
                        ease: "linear",
                        delay: idx * 0.15
                      }}
                      style={{ offsetPath: `path("${pathIn}")` }}
                      className="filter drop-shadow-[0_0_6px_rgba(59,130,246,0.8)]"
                    />
                  )}

                  {/* 刚性补足流出连线 (琥珀线) */}
                  {m.unitSupplement > 0 && (
                    <>
                      <motion.path
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ 
                          pathLength: 1, 
                          opacity: isDimmed ? 0.1 : (isHovered ? 0.9 : 0.45) 
                        }}
                        transition={{ duration: 0.8, delay: idx * 0.05 + 0.2 }}
                        d={pathOut}
                        stroke="#f59e0b"
                        strokeWidth={isHovered ? "3.5" : "2.5"}
                        fill="none"
                        strokeDasharray={isHovered ? "none" : "6 3"}
                      />
                      {!isDimmed && (
                        <motion.circle
                          r={isHovered ? "5.5" : "4"}
                          fill="#f59e0b"
                          initial={{ offsetDistance: "0%" }}
                          animate={{ offsetDistance: "100%" }}
                          transition={{ 
                            duration: isHovered ? 2.2 : 3.6, 
                            repeat: Infinity, 
                            ease: "linear",
                            delay: idx * 0.2
                          }}
                          style={{ offsetPath: `path("${pathOut}")` }}
                          className="filter drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]"
                        />
                      )}
                    </>
                  )}
                </React.Fragment>
              );
            })}
          </svg>

          {/* 中央统筹池 */}
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative z-20 w-48 h-48 md:w-56 md:h-56 bg-slate-950 rounded-full flex flex-col items-center justify-center shadow-xl border-4 border-slate-800 p-4 text-center transition-transform hover:scale-105"
          >
            <div className="absolute inset-0 rounded-full bg-blue-500/10 animate-pulse pointer-events-none"></div>
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-11 h-11 bg-blue-600/20 rounded-xl flex items-center justify-center mb-2 border border-blue-500/30">
                <Droplets className="w-6 h-6 text-blue-400" />
              </div>
              <span className="text-sm md:text-base font-black text-white tracking-wider">统筹池</span>
              
              <div className="mt-2 flex flex-col items-center gap-0.5">
                <span className="text-[10px] text-slate-400 font-medium">总流入: <span className="font-mono text-blue-300 font-bold">{formatMoney(totalInflow)}</span></span>
                <span className="text-[10px] text-slate-400 font-medium">总补足: <span className="font-mono text-amber-300 font-bold">{formatMoney(totalSupplement)}</span></span>
              </div>

              <div className={`mt-2.5 px-2.5 py-0.5 rounded-full border text-[9px] font-black tracking-wide ${
                isDeficitOverall 
                  ? 'bg-amber-500/20 border-amber-500/30 text-amber-300' 
                  : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
              }`}>
                {isDeficitOverall ? '补足缺口状态' : '平衡覆盖状态'}
              </div>
            </div>
          </motion.div>

          {/* 外圈经营单元节点 */}
          {metrics.map((m, idx) => {
            const totalUnits = metrics.length || 1;
            const angle = (idx / totalUnits) * 2 * Math.PI - Math.PI / 2;
            const radius = 280;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            
            const isDeficit = m.unitSupplement > 0;
            const isHovered = hoveredCenter === m.center;
            const isDimmed = hoveredCenter !== null && !isHovered;
            
            return (
              <motion.div
                key={m.center}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ 
                  opacity: isDimmed ? 0.35 : 1, 
                  scale: isHovered ? 1.1 : 1 
                }}
                transition={{ delay: idx * 0.04 }}
                style={{ 
                  left: `calc(50% + ${x}px)`, 
                  top: `calc(50% + ${y}px)`,
                  transform: 'translate(-50%, -50%)'
                }}
                className="absolute z-30 cursor-pointer"
                onMouseEnter={() => setHoveredCenter(m.center)}
                onMouseLeave={() => setHoveredCenter(null)}
              >
                <div className="relative flex flex-col items-center">
                  {/* 节点主体 */}
                  <div className={`
                    w-20 h-20 md:w-24 md:h-24 rounded-2xl flex flex-col items-center justify-center border-2 transition-all duration-200 relative
                    ${isDeficit 
                      ? 'bg-amber-50/95 border-amber-300 text-amber-900 shadow-md shadow-amber-100' 
                      : 'bg-white border-slate-200 text-slate-800 shadow-md shadow-slate-100'}
                    ${isHovered ? 'ring-4 ring-blue-500/20 border-blue-500' : ''}
                  `}>
                    {/* 状态 Tag */}
                    <div className={`absolute -top-2.5 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tight shadow-sm border ${
                      isDeficit ? 'bg-amber-500 text-white border-amber-400' : 'bg-blue-600 text-white border-blue-500'
                    }`}>
                      {isDeficit ? '需补足' : '贡献中'}
                    </div>

                    <span 
                      className="text-xs font-black tracking-tight text-center px-1 truncate max-w-[72px] md:max-w-[84px]" 
                      title={m.center}
                    >
                      {m.center}
                    </span>

                    <span className="text-[9px] font-mono text-slate-400 mt-1 font-semibold">
                      +{formatMoney(m.inflow20)}
                    </span>
                  </div>

                  {/* 悬浮气泡卡片 */}
                  {isHovered && (
                    <div className="absolute bottom-full mb-3 z-50 w-52 p-3 bg-slate-900/95 backdrop-blur text-white rounded-xl shadow-xl border border-slate-700 text-left pointer-events-none">
                      <div className="font-bold text-xs text-white border-b border-slate-700/80 pb-1.5 mb-2 flex items-center justify-between">
                        <span className="truncate max-w-[130px]">{m.center}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-black ${isDeficit ? 'bg-amber-500/30 text-amber-300' : 'bg-blue-500/30 text-blue-300'}`}>
                          {isDeficit ? '补足型' : '贡献型'}
                        </span>
                      </div>
                      <div className="space-y-1 text-[10px]">
                        <div className="flex justify-between text-slate-300">
                          <span>已确权收款包:</span>
                          <span className="font-mono text-white font-bold">{formatMoney(m.confirmedRevenuePackage)}</span>
                        </div>
                        <div className="flex justify-between text-blue-300 font-semibold">
                          <span>统筹流入 (20%):</span>
                          <span className="font-mono font-bold">+{formatMoney(m.inflow20)}</span>
                        </div>
                        <div className="flex justify-between text-slate-300">
                          <span>单元收产包:</span>
                          <span className="font-mono text-white font-bold">{formatMoney(m.incomeProductionPackage)}</span>
                        </div>
                        <div className="flex justify-between text-slate-300">
                          <span>刚性薪资包:</span>
                          <span className="font-mono text-white font-bold">{formatMoney(m.unitSalary)}</span>
                        </div>
                        <div className="flex justify-between text-amber-300 font-semibold border-t border-slate-700 pt-1 mt-1">
                          <span>统筹补足额:</span>
                          <span className="font-mono font-bold">{m.unitSupplement > 0 ? `-${formatMoney(m.unitSupplement)}` : '0'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        /* 网格卡片模式 */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
          {metrics.map((m, idx) => {
            const isDeficit = m.unitSupplement > 0;
            const netContribution = m.inflow20 - m.unitSupplement;
            return (
              <div 
                key={m.center}
                className={`p-4 rounded-xl border transition-all ${
                  isDeficit 
                    ? 'bg-amber-50/40 border-amber-200/80 hover:border-amber-400' 
                    : 'bg-white border-slate-200 hover:border-blue-400'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold">
                      {idx + 1}
                    </span>
                    <h4 className="font-bold text-xs text-slate-800 truncate max-w-[110px]" title={m.center}>
                      {m.center}
                    </h4>
                  </div>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${
                    isDeficit 
                      ? 'bg-amber-100 text-amber-800 border-amber-200' 
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}>
                    {isDeficit ? '需补足' : '净贡献'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-[10px]">
                  <div>
                    <span className="text-slate-400 block">20% 流入</span>
                    <span className="font-mono font-bold text-blue-600 text-xs">
                      +{formatMoney(m.inflow20)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">统筹补足</span>
                    <span className={`font-mono font-bold text-xs ${isDeficit ? 'text-amber-600' : 'text-slate-400'}`}>
                      {isDeficit ? `-${formatMoney(m.unitSupplement)}` : '0'}
                    </span>
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-500">
                  <span>收款包: {formatMoney(m.confirmedRevenuePackage)}</span>
                  <span>薪资包: {formatMoney(m.unitSalary)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const Reservoir: React.FC<ReservoirProps> = ({ logs, auditLogs, resources, users, transactions = [], businessUnits, currentUser }) => {
  const [selectedMonth, setSelectedMonth] = useState(() => getLocalMonthString()); // YYYY-MM
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchUnit, setSearchUnit] = useState<string>('');
  const [sortBy, setSortBy] = useState<'inflow' | 'supplement' | 'name' | 'salary'>('inflow');

  const effectiveMonth = useMemo(() => {
    if (startDate) return startDate.slice(0, 7);
    return selectedMonth || getLocalMonthString();
  }, [selectedMonth, startDate]);

  // 1. 数据过滤：支持业务月份与自定义起止日区间
  const filteredLogs = useMemo(() => {
    return logs.filter(l => isLogInFilter(l, selectedMonth, startDate, endDate));
  }, [logs, selectedMonth, startDate, endDate]);
  
  const fhId = `FH-${effectiveMonth}`;
  const fhctzRecord = transactions.find(t => t.id === fhId && t.status === TransactionStatus.Verified);

  // 2. 全盘统计计算 (基于选定月份)
  const totalConfirmedRevenuePackage = useMemo(() => sumConfirmedRevenuePackage(filteredLogs, resources, users), [filteredLogs, resources, users]);
  const platformCoordinationInflow = totalConfirmedRevenuePackage * 0.2;
  
  const totalIncomeProductionPackage = useMemo(() => sumIncomeProductionPackage(filteredLogs, resources, users), [filteredLogs, resources, users]);
  const totalRigidSalary = useMemo(() => users
    .filter(u => u.category !== 'VP' && isSalaryActiveForMonth(u, effectiveMonth))
    .reduce((acc, u) => acc + getUserSalaryByMonth(u, effectiveMonth), 0), [users, effectiveMonth]);
  
  const totalSupplement = Math.max(0, totalRigidSalary - totalIncomeProductionPackage);

  const totalCPoints = useMemo(() => {
    return filteredLogs
      .filter(l => l.costCategory === 'C' && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved))
      .reduce((acc, l) => acc + (l.dynamicCost || 0), 0);
  }, [filteredLogs]);

  const totalB2Points = useMemo(() => {
    return filteredLogs
      .filter(l => l.costCategory === 'B' && l.valueConsumptionMode === 'B2' && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved))
      .reduce((acc, l) => acc + (l.dynamicCost || 0), 0);
  }, [filteredLogs]);

  // 3. 经营单元明细计算
  const centerMetrics = useMemo(() => businessUnits.map(center => {
    const centerLogs = filteredLogs.filter(l => {
      const collector = users.find(u => u.id === l.recordedCollectorId);
      return collector?.center === center;
    });

    const confirmedRevenuePackage = sumConfirmedRevenuePackage(centerLogs, resources, users);
    const inflow20 = confirmedRevenuePackage * 0.2;
    
    const incomeProductionPackage = sumIncomeProductionPackage(centerLogs, resources, users);
    
    const centerUsers = users.filter(u => 
      u.center === center && 
      u.category !== 'VP' && 
      isSalaryActiveForMonth(u, effectiveMonth)
    );
    const unitSalary = centerUsers.reduce((acc, u) => acc + getUserSalaryByMonth(u, effectiveMonth), 0);
    const unitSupplement = Math.max(0, unitSalary - incomeProductionPackage);

    return {
      center,
      confirmedRevenuePackage,
      inflow20,
      incomeProductionPackage,
      unitSalary,
      unitSupplement
    };
  }).filter(m => m.confirmedRevenuePackage > 0 || m.unitSalary > 0), [businessUnits, filteredLogs, resources, users, effectiveMonth]);

  // 排序与搜索过滤后的单元明细
  const sortedAndFilteredMetrics = useMemo(() => {
    let result = [...centerMetrics];
    if (searchUnit.trim()) {
      const q = searchUnit.trim().toLowerCase();
      result = result.filter(m => m.center.toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      if (sortBy === 'inflow') return b.inflow20 - a.inflow20;
      if (sortBy === 'supplement') return b.unitSupplement - a.unitSupplement;
      if (sortBy === 'salary') return b.unitSalary - a.unitSalary;
      return a.center.localeCompare(b.center, 'zh-CN');
    });
    return result;
  }, [centerMetrics, searchUnit, sortBy]);

  const handleExport = () => {
    const data = centerMetrics.map(m => ({
      '经营单元': m.center,
      '已确权收款包': roundMoney(m.confirmedRevenuePackage),
      '经营单元流入': roundMoney(m.inflow20),
      '单元收产包': roundMoney(m.incomeProductionPackage),
      '单元刚性工资': roundMoney(m.unitSalary),
      '统筹补足': roundMoney(m.unitSupplement)
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "统筹明细");
    XLSX.writeFile(wb, `统筹水库明细_${startDate && endDate ? `${startDate}_${endDate}` : effectiveMonth}.xlsx`);
  };

  const finalSupplementValue = fhctzRecord ? fhctzRecord.amount : totalSupplement;
  const coverageRatio = finalSupplementValue > 0 ? (platformCoordinationInflow / finalSupplementValue) * 100 : 100;

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 bg-slate-50/50 min-h-screen">
      {/* 顶部主横幅与筛选操作区 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 md:p-8 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-blue-600">
            <ShieldCheck className="w-5 h-5" />
            <span className="text-[11px] font-bold uppercase tracking-widest bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full border border-blue-100">
              平台资产治理中心
            </span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
            统筹水库管理
          </h2>
          <p className="text-slate-500 text-xs font-medium max-w-xl">
            全盘资产统筹池流向监控、经营单元刚性薪资兜底补足与动态消耗积分监管
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
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
          <button 
            type="button"
            onClick={handleExport}
            className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center shadow-sm cursor-pointer"
          >
            <Download className="w-4 h-4 mr-2" />
            导出明细报表
          </button>
        </div>
      </div>

      {/* 核心指标看板 (Stats Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="经营单元流入 (20%)" 
          value={platformCoordinationInflow} 
          subText={`确权收款包面值: ${formatMoney(totalConfirmedRevenuePackage)}`}
          accentColor="blue"
          icon={<Droplets className="w-5 h-5 text-blue-600" />}
          badge="统筹注入"
        />
        <StatCard 
          label="全盘刚性薪资包" 
          value={totalRigidSalary} 
          subText={`当前月有效在册人员刚性支出`}
          accentColor="slate"
          icon={<Users className="w-5 h-5 text-slate-700" />}
          badge="刚性支出"
        />
        <StatCard 
          label="全盘统筹补足额" 
          value={finalSupplementValue} 
          subText={fhctzRecord ? '已由确权流水锁定' : '各单元薪资与收产包缺口合计'}
          accentColor="amber"
          icon={<Activity className="w-5 h-5 text-amber-600" />}
          badge={coverageRatio >= 100 ? '覆盖充足' : '存在缺口'}
        />
        <StatCard 
          label="动态消耗积分 (C/B2)" 
          value={totalCPoints + totalB2Points} 
          subText={`C类: ${formatMoney(totalCPoints)} | B2类: ${formatMoney(totalB2Points)}`}
          accentColor="indigo"
          icon={<Coins className="w-5 h-5 text-indigo-600" />}
          badge="已核销"
        />
      </div>

      {/* 统筹水库流向示意图 (全宽展示) */}
      <ReservoirVisualizer 
        metrics={centerMetrics} 
        totalInflow={platformCoordinationInflow} 
        totalSupplement={totalSupplement}
      />

      {/* 经营单元统筹明细表 (全宽独立区域，不与示意图并排) */}
      <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
        <div className="p-5 md:p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                经营单元统筹明细
              </h3>
            </div>
            <p className="text-slate-500 text-xs mt-1">
              周期: {startDate && endDate ? `${startDate} ~ ${endDate}` : effectiveMonth} · 监测各单元已确权收款包、20%流入统筹池及刚性缺口补足情况
            </p>
          </div>

          {/* 搜索与排序与统计栏 */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-600 shadow-sm">
              共 {sortedAndFilteredMetrics.length} 单元
            </span>

            <div className="relative min-w-[200px] flex-1 sm:flex-none">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchUnit}
                onChange={e => setSearchUnit(e.target.value)}
                placeholder="搜索经营单元..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-colors shadow-sm"
              />
            </div>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500 cursor-pointer shadow-sm"
            >
              <option value="inflow">按 20% 流入降序</option>
              <option value="supplement">按统筹补足降序</option>
              <option value="salary">按刚性薪资降序</option>
              <option value="name">按单元名称排序</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200/80 sticky top-0 z-10 backdrop-blur">
              <tr>
                <th className="px-6 py-4">序号 / 经营单元</th>
                <th className="px-6 py-4 text-right">已确权收款包</th>
                <th className="px-6 py-4 text-right">20% 单元流入</th>
                <th className="px-6 py-4 text-right">单元收产包</th>
                <th className="px-6 py-4 text-right">单元刚性薪资</th>
                <th className="px-6 py-4 text-right">统筹补足额</th>
                <th className="px-6 py-4 text-center">统筹状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {sortedAndFilteredMetrics.map((m, idx) => {
                const isDeficit = m.unitSupplement > 0;
                return (
                  <tr key={m.center} className="group hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-xs group-hover:bg-slate-900 group-hover:text-white transition-colors">
                          {idx + 1}
                        </span>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 text-sm" title={m.center}>
                            {m.center}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-semibold text-slate-700">
                      {formatMoney(m.confirmedRevenuePackage)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-mono font-bold text-blue-600">
                        +{formatMoney(m.inflow20)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-semibold text-slate-700">
                      {formatMoney(m.incomeProductionPackage)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-semibold text-slate-700">
                      {formatMoney(m.unitSalary)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-mono font-bold ${isDeficit ? 'text-amber-600' : 'text-slate-300'}`}>
                        {isDeficit ? `-${formatMoney(m.unitSupplement)}` : '0'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        isDeficit 
                          ? 'bg-amber-50 text-amber-700 border-amber-200' 
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        {isDeficit ? (
                          <>
                            <AlertCircle className="w-3 h-3 text-amber-500" />
                            <span>需补足</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-blue-500" />
                            <span>正常贡献</span>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {sortedAndFilteredMetrics.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400 space-y-2">
                      <Activity className="w-8 h-8 stroke-1 text-slate-300" />
                      <p className="text-xs font-bold text-slate-400">未找到匹配的经营单元统筹数据</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 底部汇总统计条 */}
        <div className="p-4 md:px-6 bg-slate-50/80 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-4 text-xs font-bold text-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">全盘汇总:</span>
            <span>共 {centerMetrics.length} 个经营单元产生统筹/薪资流水</span>
          </div>
          <div className="flex flex-wrap items-center gap-6 font-mono text-xs">
            <div>
              <span className="text-slate-400 font-sans font-medium mr-1.5">确权收款总计:</span>
              <span className="text-slate-900 font-bold">{formatMoney(totalConfirmedRevenuePackage)}</span>
            </div>
            <div>
              <span className="text-slate-400 font-sans font-medium mr-1.5">20% 流入总计:</span>
              <span className="text-blue-600 font-bold">+{formatMoney(platformCoordinationInflow)}</span>
            </div>
            <div>
              <span className="text-slate-400 font-sans font-medium mr-1.5">统筹补足总计:</span>
              <span className="text-amber-600 font-bold">-{formatMoney(finalSupplementValue)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 经营单元盈利排名榜 (全宽展示) */}
      <BusinessUnitProfitRankingTable
        businessUnits={businessUnits}
        selectedMonth={selectedMonth}
        users={users}
        auditLogs={auditLogs || logs}
        resources={resources}
        transactions={transactions}
        currentUser={currentUser}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  );
};

const StatCard: React.FC<{ 
  label: string; 
  value: number; 
  subText?: string;
  accentColor: 'blue' | 'slate' | 'amber' | 'indigo'; 
  icon?: React.ReactNode;
  badge?: string;
}> = ({ label, value, subText, accentColor, icon, badge }) => {
  const colorStyles = {
    blue: {
      border: 'border-blue-100',
      badgeBg: 'bg-blue-50 text-blue-700 border-blue-100',
      iconBg: 'bg-blue-50 text-blue-600',
      valueColor: 'text-slate-900',
    },
    slate: {
      border: 'border-slate-200',
      badgeBg: 'bg-slate-100 text-slate-700 border-slate-200',
      iconBg: 'bg-slate-100 text-slate-600',
      valueColor: 'text-slate-900',
    },
    amber: {
      border: 'border-amber-100',
      badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
      iconBg: 'bg-amber-50 text-amber-600',
      valueColor: 'text-amber-900',
    },
    indigo: {
      border: 'border-indigo-100',
      badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      iconBg: 'bg-indigo-50 text-indigo-600',
      valueColor: 'text-slate-900',
    },
  };

  const style = colorStyles[accentColor] || colorStyles.slate;

  return (
    <div className={`p-5 md:p-6 rounded-2xl border ${style.border} bg-white shadow-sm flex flex-col justify-between`}>
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            {icon && <div className={`p-2 rounded-xl ${style.iconBg}`}>{icon}</div>}
            <p className="text-xs font-bold text-slate-500">{label}</p>
          </div>
          {badge && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${style.badgeBg}`}>
              {badge}
            </span>
          )}
        </div>
        <h4 className={`text-2xl md:text-3xl font-black tracking-tight font-mono ${style.valueColor}`}>
          {formatMoney(value)}
        </h4>
      </div>
      {subText && (
        <p className="text-[11px] text-slate-400 font-medium mt-3 pt-2.5 border-t border-slate-100">
          {subText}
        </p>
      )}
    </div>
  );
};

export default Reservoir;

