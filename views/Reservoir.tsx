import React, { useState, useMemo } from 'react';
import { ValueCreationLog, MiningResource, User, InternalTransaction, TransactionStatus } from '../types';
import { Card } from '../src/components/UI';
import { BusinessUnitProfitRankingTable } from '../src/components/BusinessUnitProfitRankingTable';
import { BusinessDateFilter } from '../src/components/BusinessDateFilter';
import { 
  sumConfirmedRevenuePackage, 
  sumIncomeProductionPackage,
} from '../src/utils/reconcileMiningFromLogs';
import { getUserSalaryByMonth } from '../src/utils/business';
import { getLocalMonthString, resolveLogBusinessMonth, resolveLogBusinessDate, isDateInRange } from '../src/utils/dateUtils';
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
    <Card className="p-8 md:p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 via-purple-500 to-amber-500"></div>
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 relative z-40">
        <div>
          <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter uppercase flex items-center">
            <span className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white text-xl mr-4 shadow-lg">🌀</span>
            统筹水库流向示意图
          </h3>
          <p className="text-slate-400 text-[10px] font-bold mt-2 uppercase tracking-[0.2em]">
            中央为统筹池：蓝色管道 20% 确权流入；琥珀色管道刚性补足流出
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-[10px] font-black text-blue-700 uppercase">20% 统筹流入</span>
          </div>
          <div className="flex items-center space-x-2 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100">
            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            <span className="text-[10px] font-black text-amber-700 uppercase">刚性补足流出</span>
          </div>
        </div>
      </div>

      <div className="relative w-full min-h-[560px] md:min-h-[600px] flex items-center justify-center bg-slate-50/30 rounded-[3rem] border border-slate-100/50 p-4">
        {/* 背景网格 */}
        <div 
          className="absolute inset-0 opacity-[0.03] pointer-events-none" 
          style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '30px 30px' }}
        ></div>

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
                {/* 20% 流入连线 (蓝线) */}
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
    </Card>
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
    return logs.filter(l => {
      if (startDate && endDate) {
        return isDateInRange(resolveLogBusinessDate(l), startDate, endDate);
      }
      return resolveLogBusinessMonth(l) === effectiveMonth;
    });
  }, [logs, effectiveMonth, startDate, endDate]);
  
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
      '统筹池流入(20%)': Math.round(m.inflow20),
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
    <div className="p-6 md:p-12 space-y-8 md:space-y-12 bg-[#F8FAFC] min-h-screen">
      <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
        <div>
          <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter uppercase">统筹水库管理</h2>
        </div>
      </div>

      {/* 统筹池全盘概览 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-8 rounded-[2.5rem] bg-gradient-to-br from-slate-900 to-slate-800 text-white border-none shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-[0.1] group-hover:scale-150 transition-transform duration-700 pointer-events-none text-6xl">🌊</div>
          <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-2">统筹池流入 (20%)</p>
          <h4 className="text-4xl font-black tracking-tighter mb-4 font-mono">
            {Math.round(platformCoordinationInflow).toLocaleString()}
          </h4>
          <div className="flex items-center text-[10px] font-bold text-slate-400">
            <span className="mr-2">基准:</span>
            <span className="text-slate-200">已确权收款包({Math.round(totalConfirmedRevenuePackage).toLocaleString()}) × 20%</span>
          </div>
        </Card>

        <Card className="p-8 rounded-[2.5rem] bg-white border border-slate-100 shadow-xl relative group">
          <div className="absolute top-0 right-0 p-6 opacity-[0.05] group-hover:scale-150 transition-transform duration-700 pointer-events-none text-6xl">⚡</div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">全盘刚性薪资包</p>
          <h4 className="text-4xl font-black tracking-tighter mb-4 font-mono text-slate-900">
            {Math.round(totalRigidSalary).toLocaleString()}
          </h4>
          <div className="flex items-center text-[10px] font-bold text-slate-400">
            <Users className="w-3 h-3 mr-1" />
            <span>在职专家刚性工资之和</span>
          </div>
        </Card>

        <Card className={`p-8 rounded-[2.5rem] border shadow-xl relative group ${totalSupplement > 0 ? 'bg-amber-50 border-amber-100' : 'bg-white border-slate-100'}`}>
          <div className="absolute top-0 right-0 p-6 opacity-[0.05] group-hover:scale-150 transition-transform duration-700 pointer-events-none text-6xl">🛡️</div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">全盘统筹补足额</p>
          <div className="flex items-baseline space-x-2">
            <h4 className={`text-4xl font-black tracking-tighter mb-4 font-mono ${totalSupplement > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
              {Math.round(fhctzRecord ? fhctzRecord.amount : totalSupplement).toLocaleString()}
            </h4>
            {fhctzRecord && (
               <span className="px-2 py-0.5 bg-emerald-500 text-white text-[8px] font-black rounded-full uppercase tracking-tighter mb-5">已落库</span>
            )}
          </div>
          <div className="flex items-center text-[10px] font-bold text-slate-400">
            <ShieldCheck className="w-3 h-3 mr-1" />
            <span>{totalSupplement > 0 ? '统筹池预计需补足' : '收产包已覆盖刚性'}</span>
          </div>
        </Card>
      </div>

      {/* 统筹水库流向示意图 */}
      <ReservoirVisualizer 
        metrics={centerMetrics} 
        totalInflow={platformCoordinationInflow} 
        totalSupplement={totalSupplement}
      />

      {/* 经营单元统筹明细 */}
      <Card className="p-8 md:p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-amber-500"></div>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-10">
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase flex items-center">
              <span className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white text-xl mr-4 shadow-lg">📊</span>
              经营单元统筹明细 ({startDate && endDate ? `${startDate}~${endDate}` : effectiveMonth})
            </h3>
            <p className="text-slate-400 text-[10px] font-bold mt-2 uppercase tracking-[0.2em]">
              实时穿透：基于专家归属单元的收产包与刚性补足核算
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
               onClick={handleExport}
               className="px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center"
             >
               <Download className="w-3.5 h-3.5 mr-1.5" />
               导出 EXCEL
             </button>
             <div className="flex space-x-2 pl-2 border-l border-slate-200">
                <div className="px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center">
                   <div className="w-2 h-2 rounded-full bg-blue-500 mr-2"></div>
                   <span className="text-[9px] font-black text-slate-600 uppercase">统筹池流入</span>
                </div>
                <div className="px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center">
                   <div className="w-2 h-2 rounded-full bg-amber-500 mr-2"></div>
                   <span className="text-[9px] font-black text-slate-600 uppercase">统筹补足</span>
                </div>
             </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">经营单元</th>
                <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">已确权收款包</th>
                <th className="pb-6 text-[10px] font-black text-blue-500 uppercase tracking-widest text-right">流入 (20%)</th>
                <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">单元收产包</th>
                <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">单元刚性工资</th>
                <th className="pb-6 text-[10px] font-black text-amber-600 uppercase tracking-widest text-right">统筹补足</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {centerMetrics.map((m, idx) => (
                <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="py-6">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 font-black text-xs mr-3 group-hover:bg-slate-900 group-hover:text-white transition-all">
                        {m.center.slice(-2)}
                      </div>
                      <span className="text-sm font-black text-slate-800">{m.center}</span>
                    </div>
                  </td>
                  <td className="py-6 text-right font-mono text-xs font-bold text-slate-600">
                    {Math.round(m.confirmedRevenuePackage).toLocaleString()}
                  </td>
                  <td className="py-6 text-right font-mono text-xs font-black text-blue-600">
                    {Math.round(m.inflow20).toLocaleString()}
                  </td>
                  <td className="py-6 text-right font-mono text-xs font-bold text-slate-600">
                    {Math.round(m.incomeProductionPackage).toLocaleString()}
                  </td>
                  <td className="py-6 text-right font-mono text-xs font-bold text-slate-600">
                    {Math.round(m.unitSalary).toLocaleString()}
                  </td>
                  <td className="py-6 text-right">
                    <span className={`font-mono text-sm font-black px-3 py-1 rounded-lg ${m.unitSupplement > 0 ? 'bg-amber-100 text-amber-700' : 'text-slate-300'}`}>
                      {m.unitSupplement > 0 ? Math.round(m.unitSupplement).toLocaleString() : '0'}
                    </span>
                  </td>
                </tr>
              ))}
              {centerMetrics.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <div className="flex flex-col items-center">
                      <Activity className="w-12 h-12 text-slate-200 mb-4" />
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">暂无选定月份({selectedMonth})经营单元统筹数据</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 经营单元盈利排名榜 */}
      <BusinessUnitProfitRankingTable
        businessUnits={businessUnits}
        selectedMonth={selectedMonth}
        users={users}
        auditLogs={auditLogs || logs}
        resources={resources}
        transactions={transactions}
        currentUser={currentUser}
      />
    </div>
  );
};

export default Reservoir;
