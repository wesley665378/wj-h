import React, { useState, useMemo } from 'react';
import { ValueCreationLog, MiningResource, User, InternalTransaction, TransactionStatus, AuditStatus } from '../types';
import { Card } from '../src/components/UI';
import { BusinessUnitProfitRankingTable } from '../src/components/BusinessUnitProfitRankingTable';
import { BusinessDateFilter } from '../src/components/BusinessDateFilter';
import { 
  sumConfirmedRevenuePackage, 
  sumIncomeProductionPackage,
} from '../src/utils/reconcileMiningFromLogs';
import { getUserSalaryByMonth } from '../src/utils/business';
import { getLocalMonthString, resolveLogBusinessMonth, resolveLogBusinessDate, isDateInRange, isLogInFilter } from '../src/utils/dateUtils';
import { Users, Droplets, ShieldCheck, Download, Activity } from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion } from 'motion/react';

interface ReservoirProps {
  logs: ValueCreationLog[];
  auditLogs?: ValueCreationLog[];
  resources: MiningResource[];
  users: User[];
  transactions?: InternalTransaction[];
  businessUnits: string[];
  currentUser?: User;
}

const ReservoirVisualizer: React.FC<{ 
  metrics: {
    center: string;
    confirmedRevenuePackage: number;
    inflow20: number;
    incomeProductionPackage: number;
    unitSalary: number;
    unitSupplement: number;
  }[]; 
  totalInflow: number; 
  totalSupplement: number;
}> = ({ metrics, totalInflow, totalSupplement }) => {
  const viewBoxSize = 800;
  const centerCoord = viewBoxSize / 2;

  return (
    <div className="p-6 md:p-8 rounded-[2rem] bg-white border border-slate-200/60 shadow-sm relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-1 bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10 relative z-40">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-100 mb-2">
            <Activity className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">流量动态</span>
          </div>
          <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-center">
            统筹水库流向示意图
          </h3>
          <p className="text-slate-500 text-[11px] font-medium leading-relaxed max-w-md">
            可视化各经营单元对统筹池的价值贡献及刚性成本补足的实时流向
          </p>
        </div>
        <div className="flex items-center gap-3 bg-slate-50/80 p-1.5 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
            <span className="text-[10px] font-bold text-slate-600 uppercase">单元流入</span>
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            <span className="text-[10px] font-bold text-slate-600 uppercase">刚性流出</span>
          </div>
        </div>
      </div>

      <div className="relative w-full min-h-[500px] flex items-center justify-center bg-slate-50/50 rounded-[2.5rem] border border-slate-200/40 p-4 overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-transparent"></div>

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
            
            // 连线路径
            const pathIn = `M ${x} ${y} L ${centerCoord} ${centerCoord}`;
            const pathOut = `M ${centerCoord} ${centerCoord} L ${x} ${y}`;

            return (
              <React.Fragment key={`lines-${m.center}`}>
                {/* 经营单元流入连线 (蓝线) */}
                <motion.path
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.2, delay: idx * 0.08 }}
                  d={pathIn}
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeOpacity="0.35"
                  fill="none"
                  strokeDasharray="4 4"
                />
                
                {/* 流入流动粒子 (无数字) */}
                {m.inflow20 > 0 && (
                  <motion.circle
                    r="4"
                    fill="#3b82f6"
                    initial={{ offsetDistance: "0%" }}
                    animate={{ offsetDistance: "100%" }}
                    transition={{ 
                      duration: 3, 
                      repeat: Infinity, 
                      ease: "linear",
                      delay: idx * 0.15
                    }}
                    style={{ offsetPath: `path("${pathIn}")` }}
                    className="filter drop-shadow-[0_0_6px_rgba(59,130,246,0.8)]"
                  />
                )}

                {/* 刚性补足流出连线 (琥珀线，仅在有补足时绘制) */}
                {m.unitSupplement > 0 && (
                  <>
                    <motion.path
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 1.2, delay: idx * 0.08 + 0.3 }}
                      d={pathOut}
                      stroke="#f59e0b"
                      strokeWidth="2.5"
                      strokeOpacity="0.45"
                      fill="none"
                      strokeDasharray="6 3"
                    />
                    <motion.circle
                      r="4.5"
                      fill="#f59e0b"
                      initial={{ offsetDistance: "0%" }}
                      animate={{ offsetDistance: "100%" }}
                      transition={{ 
                        duration: 3.5, 
                        repeat: Infinity, 
                        ease: "linear",
                        delay: idx * 0.2
                      }}
                      style={{ offsetPath: `path("${pathOut}")` }}
                      className="filter drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]"
                    />
                  </>
                )}
              </React.Fragment>
            );
          })}
        </svg>

        {/* 中央统筹池 */}
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="relative z-20 w-52 h-52 md:w-60 md:h-60 bg-slate-900 rounded-full flex flex-col items-center justify-center shadow-[0_0_60px_rgba(59,130,246,0.3)] border-4 border-slate-800"
        >
          <div className="flex flex-col items-center">
            <div className="w-14 h-14 bg-blue-600/20 rounded-2xl flex items-center justify-center mb-3">
              <Droplets className="w-7 h-7 text-blue-400" />
            </div>
            <span className="text-base md:text-lg font-black text-white tracking-wider mb-1">统筹池</span>
            <div className="mt-2 px-3 py-1 bg-blue-500/10 rounded-full border border-blue-500/20">
               <span className="text-[9px] font-black text-blue-300 uppercase tracking-widest">
                 {totalSupplement > totalInflow ? '补足缺口状态' : '平衡覆盖状态'}
               </span>
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
          
          return (
            <motion.div
              key={m.center}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.08 }}
              style={{ 
                left: `calc(50% + ${x}px)`, 
                top: `calc(50% + ${y}px)`,
                transform: 'translate(-50%, -50%)'
              }}
              className="absolute z-30"
            >
              <div className="relative flex flex-col items-center">
                {/* 节点主体 */}
                <div className={`
                  w-20 h-20 md:w-24 md:h-24 rounded-[2rem] flex flex-col items-center justify-center shadow-lg border-2 transition-all duration-300 relative
                  ${isDeficit 
                    ? 'bg-amber-50 border-amber-300 text-amber-800 shadow-amber-200/40' 
                    : 'bg-white border-slate-200 text-slate-800 shadow-slate-200/40'}
                `}>
                  {/* 状态 Tag */}
                  <div className={`absolute -top-3 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tight shadow-sm border ${
                    isDeficit ? 'bg-amber-500 text-white border-amber-400' : 'bg-blue-500 text-white border-blue-400'
                  }`}>
                    {isDeficit ? '补足中' : '贡献中'}
                  </div>

                  <span className="text-xs md:text-sm font-black tracking-tight text-center px-1 truncate max-w-[70px] md:max-w-[85px]">
                    {m.center}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

const Reservoir: React.FC<ReservoirProps> = ({ logs, auditLogs, resources, users, transactions = [], businessUnits, currentUser }) => {
  const [selectedMonth, setSelectedMonth] = useState(() => getLocalMonthString()); // YYYY-MM
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

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
    .filter(u => u.category !== '水库管理员' && (u.userStatus === 'active' || u.userStatus === undefined))
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
      u.category !== '水库管理员' && 
      (u.userStatus === 'active' || u.userStatus === undefined)
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

  const handleExport = () => {
    const data = centerMetrics.map(m => ({
      '经营单元': m.center,
      '已确权收款包': Math.round(m.confirmedRevenuePackage),
      '经营单元流入': Math.round(m.inflow20),
      '单元收产包': Math.round(m.incomeProductionPackage),
      '单元刚性工资': Math.round(m.unitSalary),
      '统筹补足': Math.round(m.unitSupplement)
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "统筹明细");
    XLSX.writeFile(wb, `统筹水库明细_${startDate && endDate ? `${startDate}_${endDate}` : effectiveMonth}.xlsx`);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8 bg-slate-50/50 min-h-screen">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200/60 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-blue-600">
            <ShieldCheck className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">平台资产治理</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">统筹水库管理</h2>
          <p className="text-slate-500 text-xs font-medium">全盘资产分配、统筹补足及消耗积分的可视化监管中心</p>
        </div>
        
        <div className="flex items-center gap-3">
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
            onClick={handleExport}
            className="h-10 px-4 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center shadow-lg shadow-slate-200"
          >
            <Download className="w-3.5 h-3.5 mr-2" />
            数据导出
          </button>
        </div>
      </div>

      {/* Stats Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard 
            label="经营单元流入" 
            value={platformCoordinationInflow} 
            color="blue"
            icon={<Droplets className="w-4 h-4" />}
          />
          <StatCard 
            label="全盘刚性薪资包" 
            value={totalRigidSalary} 
            color="slate"
            icon={<Users className="w-4 h-4" />}
          />
          <StatCard 
            label="全盘统筹补足额" 
            value={fhctzRecord ? fhctzRecord.amount : totalSupplement} 
            color="amber"
            icon={<Activity className="w-4 h-4" />}
          />
        </div>
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard 
            label="C 类入库消耗积分" 
            value={totalCPoints} 
            color="indigo"
          />
          <StatCard 
            label="B2 类入库消耗积分" 
            value={totalB2Points} 
            color="emerald"
          />
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 space-y-6">
          <ReservoirVisualizer 
            metrics={centerMetrics} 
            totalInflow={platformCoordinationInflow} 
            totalSupplement={totalSupplement}
          />
          
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

        <div className="xl:col-span-5">
          <Card className="p-0 rounded-[2rem] bg-white border border-slate-200/60 shadow-sm overflow-hidden h-full">
            <div className="p-6 md:p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900 tracking-tight uppercase">经营单元统筹明细</h3>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                  {startDate && endDate ? `${startDate}~${endDate}` : effectiveMonth}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-5">经营单元</th>
                    <th className="px-4 py-5 text-right">单元流入</th>
                    <th className="px-4 py-5 text-right">统筹补足</th>
                    <th className="px-4 py-5 text-right">明细</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {centerMetrics.map((m, idx) => (
                    <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-[10px] group-hover:bg-slate-900 group-hover:text-white transition-all">
                            {idx + 1}
                          </div>
                          <span className="text-sm font-bold text-slate-800">{m.center}</span>
                        </div>
                      </td>
                      <td className="px-4 py-5 text-right">
                        <div className="text-xs font-bold text-blue-600 font-mono">
                          {Math.round(m.inflow20).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-4 py-5 text-right">
                        <div className={`text-xs font-bold font-mono ${m.unitSupplement > 0 ? 'text-amber-600' : 'text-slate-300'}`}>
                          {m.unitSupplement > 0 ? Math.round(m.unitSupplement).toLocaleString() : '0'}
                        </div>
                      </td>
                      <td className="px-4 py-5 text-right">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] text-slate-400 font-medium">收款: {Math.round(m.confirmedRevenuePackage).toLocaleString()}</span>
                          <span className="text-[9px] text-slate-400 font-medium">薪资: {Math.round(m.unitSalary).toLocaleString()}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {centerMetrics.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-20 text-center">
                        <div className="flex flex-col items-center opacity-40">
                          <Activity className="w-10 h-10 text-slate-200 mb-2" />
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">无统筹数据</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number; color: string; icon?: React.ReactNode }> = ({ label, value, color, icon }) => {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100 shadow-blue-100/50',
    slate: 'bg-slate-50 text-slate-600 border-slate-200 shadow-slate-100/50',
    amber: 'bg-amber-50 text-amber-600 border-amber-200 shadow-amber-100/50',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100 shadow-indigo-100/50',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-emerald-100/50',
  };

  return (
    <div className={`p-5 rounded-2xl border ${colorMap[color] || colorMap.slate} shadow-sm bg-white`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</p>
        {icon && <div className="opacity-50">{icon}</div>}
      </div>
      <h4 className="text-xl font-black tracking-tight font-mono text-slate-900">
        {Math.round(value).toLocaleString()}
      </h4>
    </div>
  );
};

export default Reservoir;
