import React, { useState, useMemo } from 'react';
import { User, ValueCreationLog, MiningResource, InternalTransaction } from '../../types';
import { computeBusinessUnitProfitRanking, UnitRankingRow, getUnitManagerCategory } from '../utils/businessUnitProfitRanking';
import { useCostPrivacy } from '../hooks/useCostPrivacy';
import { CostPrivacyToggle } from './CostPrivacyToggle';
import { formatMoney } from '../utils/formatMoney';
import { Card } from './UI';
import { Trophy, ChevronDown, ChevronUp, Layers, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export interface BusinessUnitProfitRankingTableProps {
  units: string[];
  selectedMonth: string; // YYYY-MM
  users: User[];
  auditLogs: ValueCreationLog[];
  logs?: ValueCreationLog[];
  resources: MiningResource[];
  transactions: InternalTransaction[];
  currentUser?: User;
  startDate?: string;
  endDate?: string;
  defaultExpanded?: boolean;
}

export type RankingSortField = 
  | 'rank'
  | 'unitName'
  | 'managers'
  | 'revenuePackage'
  | 'confirmedValuePackage'
  | 'incomeValuePackage'
  | 'costPackage'
  | 'totalCostOffset'
  | 'monthlyProfit'
  | 'yearlyProfit'
  | 'inTransitValuePackage'
  | 'inTransitIncomePackage'
  | 'inTransitMonthlyProfit';

export const BusinessUnitProfitRankingTable: React.FC<BusinessUnitProfitRankingTableProps> = ({
  units,
  selectedMonth,
  users,
  auditLogs,
  logs,
  resources,
  transactions,
  startDate,
  endDate,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [filterManagerType, setFilterManagerType] = useState('全部');
  const [showInTransitDetails, setShowInTransitDetails] = useState(false);
  const [sortField, setSortField] = useState<RankingSortField | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);
  const { maskMoney } = useCostPrivacy();

  // 流水注入：若 auditLogs 为空数组，必须回退到 logs（jzcz）
  const effectiveAuditLogs = useMemo(() => {
    return (auditLogs?.length ? auditLogs : logs) || [];
  }, [auditLogs, logs]);

  // 计算榜单数据 (CFO 主表口径)
  const rankingRows = useMemo(() => {
    return computeBusinessUnitProfitRanking(
      units,
      selectedMonth,
      users,
      effectiveAuditLogs,
      resources,
      transactions,
      startDate,
      endDate
    );
  }, [units, selectedMonth, users, effectiveAuditLogs, resources, transactions, startDate, endDate]);

  const filteredRows = useMemo(() => {
    if (filterManagerType === '全部') return rankingRows;
    return rankingRows.filter(row => {
      const category = getUnitManagerCategory(row.unitName, users);
      return category === filterManagerType;
    });
  }, [rankingRows, filterManagerType, users]);

  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    if (!sortField || !sortOrder) return list;

    list.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      switch (sortField) {
        case 'rank':
          valA = typeof a.rank === 'number' ? a.rank : 999999;
          valB = typeof b.rank === 'number' ? b.rank : 999999;
          break;
        case 'unitName':
          valA = a.unitName || '';
          valB = b.unitName || '';
          break;
        case 'managers':
          valA = a.managers || '';
          valB = b.managers || '';
          break;
        case 'revenuePackage':
          valA = a.revenuePackage ?? 0;
          valB = b.revenuePackage ?? 0;
          break;
        case 'confirmedValuePackage':
          valA = a.confirmedValuePackage ?? 0;
          valB = b.confirmedValuePackage ?? 0;
          break;
        case 'incomeValuePackage':
          valA = a.incomeValuePackage ?? 0;
          valB = b.incomeValuePackage ?? 0;
          break;
        case 'costPackage':
        case 'totalCostOffset':
          valA = a.costPackage ?? a.totalCostOffset ?? 0;
          valB = b.costPackage ?? b.totalCostOffset ?? 0;
          break;
        case 'monthlyProfit':
          valA = a.monthlyProfit ?? 0;
          valB = b.monthlyProfit ?? 0;
          break;
        case 'yearlyProfit':
          valA = a.yearlyProfit ?? 0;
          valB = b.yearlyProfit ?? 0;
          break;
        case 'inTransitValuePackage':
          valA = a.inTransitValuePackage ?? 0;
          valB = b.inTransitValuePackage ?? 0;
          break;
        case 'inTransitIncomePackage':
          valA = a.inTransitIncomePackage ?? 0;
          valB = b.inTransitIncomePackage ?? 0;
          break;
        case 'inTransitMonthlyProfit':
          valA = a.inTransitMonthlyProfit ?? 0;
          valB = b.inTransitMonthlyProfit ?? 0;
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
  }, [filteredRows, sortField, sortOrder]);

  const handleSort = (field: RankingSortField) => {
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
      setSortOrder(field === 'rank' || field === 'unitName' || field === 'managers' ? 'asc' : 'desc');
    }
  };

  const renderSortIcon = (field: RankingSortField) => {
    const isActive = sortField === field;
    if (!isActive) {
      return <ArrowUpDown className="w-3 h-3 ml-1 text-slate-300 opacity-60 group-hover:opacity-100 group-hover:text-slate-500 transition-opacity shrink-0" />;
    }
    if (sortOrder === 'asc') {
      return <ArrowUp className="w-3 h-3 ml-1 text-blue-600 font-bold shrink-0" />;
    }
    return <ArrowDown className="w-3 h-3 ml-1 text-blue-600 font-bold shrink-0" />;
  };

  const getSortFieldLabel = (field: RankingSortField) => {
    switch (field) {
      case 'rank': return '排名';
      case 'unitName': return '经营单元名称';
      case 'managers': return '负责人';
      case 'revenuePackage': return '收款包';
      case 'confirmedValuePackage': return '产兑包 (已确权)';
      case 'incomeValuePackage': return '收产包 (已确权)';
      case 'costPackage':
      case 'totalCostOffset': return '成本包';
      case 'monthlyProfit': return '月度盈亏 (已确权)';
      case 'yearlyProfit': return '年度盈亏 (已确权)';
      case 'inTransitValuePackage': return '在途产兑';
      case 'inTransitIncomePackage': return '含在途收产包';
      case 'inTransitMonthlyProfit': return '含在途月度盈亏';
    }
  };

  const formatAmount = (val: number | null, isCostField = false) => {
    if (val === null || val === undefined) return '—';
    if (isCostField) {
      return maskMoney(val);
    }
    return formatMoney(val);
  };

  return (
    <Card className="rounded-[2.5rem] bg-white border border-slate-100 shadow-xl overflow-hidden transition-all duration-300">
      {/* 头部（折叠/展开控制） */}
      <div 
        onClick={() => setIsExpanded(prev => !prev)}
        className="p-6 md:p-8 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors select-none"
      >
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-3">
              <h3 className="text-xl font-black text-slate-900 tracking-tighter uppercase">
                经营单元排名
              </h3>
              <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200/60 rounded-full text-[10px] font-black uppercase tracking-wider">
                筛选: {startDate && endDate ? `${startDate} 至 ${endDate}` : selectedMonth}
              </span>
              {sortField && (
                <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-[10px] font-bold flex items-center gap-1">
                  按 [{getSortFieldLabel(sortField)}] {sortOrder === 'asc' ? '升序' : '降序'}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSortField(null);
                      setSortOrder(null);
                    }}
                    className="ml-1 text-blue-400 hover:text-blue-800 font-bold"
                    title="重置排序"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
            <p className="text-slate-400 text-xs font-bold mt-1">
              CFO主表审阅视角 · 点击各表头可升/降序排序
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3" onClick={(e) => e.stopPropagation()}>
          <select
            value={filterManagerType}
            onChange={e => setFilterManagerType(e.target.value)}
            className="px-3 py-2 text-[12px] bg-white border border-[#b8d0f7] rounded-[4px] font-bold text-slate-700 outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 cursor-pointer h-9"
          >
            <option value="全部">全部经管分类</option>
            <option value="经管员高款专">经管员高款专</option>
            <option value="经管员高产专">经管员高产专</option>
            <option value="经管员NPC">经管员NPC</option>
          </select>

          <button
            onClick={() => setShowInTransitDetails(prev => !prev)}
            className={`px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 border ${
              showInTransitDetails 
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-xs' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            title="切换查看在途产兑、工资与承兑实发等辅列"
          >
            <Layers size={14} />
            <span>{showInTransitDetails ? '隐藏辅列/在途' : '展开辅列/在途'}</span>
          </button>

          <CostPrivacyToggle size="sm" />

          <button
            onClick={() => setIsExpanded(prev => !prev)}
            className="p-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl transition-all flex items-center space-x-1"
          >
            <span className="text-xs font-black px-1">{isExpanded ? '折叠' : '展开'}</span>
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* 展开后的主表内容 */}
      {isExpanded && (
        <div className="border-t border-slate-100 p-6 md:p-8 space-y-6 animate-fadeIn">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th 
                    onClick={() => handleSort('rank')}
                    className="group py-4 px-4 text-center rounded-tl-xl w-16 whitespace-nowrap cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                    title="点击排序"
                  >
                    <span className="inline-flex items-center justify-center">
                      排名 {renderSortIcon('rank')}
                    </span>
                  </th>
                  <th 
                    onClick={() => handleSort('unitName')}
                    className="group py-4 px-4 text-left min-w-[140px] whitespace-nowrap cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                    title="点击排序"
                  >
                    <span className="inline-flex items-center">
                      经营单元名称 {renderSortIcon('unitName')}
                    </span>
                  </th>
                  <th 
                    onClick={() => handleSort('managers')}
                    className="group py-4 px-4 text-left min-w-[100px] whitespace-nowrap cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                    title="点击排序"
                  >
                    <span className="inline-flex items-center">
                      负责人 {renderSortIcon('managers')}
                    </span>
                  </th>
                  <th 
                    onClick={() => handleSort('revenuePackage')}
                    className="group py-4 px-3 text-right min-w-[100px] whitespace-nowrap cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                    title="点击排序"
                  >
                    <span className="inline-flex items-center justify-end w-full">
                      收款包 {renderSortIcon('revenuePackage')}
                    </span>
                  </th>
                  <th 
                    onClick={() => handleSort('confirmedValuePackage')}
                    className="group py-4 px-3 text-right min-w-[100px] whitespace-nowrap cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                    title="点击排序"
                  >
                    <span className="inline-flex items-center justify-end w-full">
                      产兑包 (已确权) {renderSortIcon('confirmedValuePackage')}
                    </span>
                  </th>
                  <th 
                    onClick={() => handleSort('incomeValuePackage')}
                    className="group py-4 px-3 text-right min-w-[110px] whitespace-nowrap cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                    title="点击排序"
                  >
                    <span className="inline-flex items-center justify-end w-full">
                      收产包 (已确权) {renderSortIcon('incomeValuePackage')}
                    </span>
                  </th>
                  <th 
                    onClick={() => handleSort('costPackage')}
                    className="group py-4 px-3 text-right min-w-[110px] text-rose-600 whitespace-nowrap cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                    title="点击排序"
                  >
                    <span className="inline-flex items-center justify-end w-full">
                      成本包 {renderSortIcon('costPackage')}
                    </span>
                  </th>
                  <th 
                    onClick={() => handleSort('monthlyProfit')}
                    className="group py-4 px-3 text-right min-w-[120px] text-blue-600 whitespace-nowrap cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                    title="点击排序"
                  >
                    <span className="inline-flex items-center justify-end w-full">
                      月度盈亏 (已确权) {renderSortIcon('monthlyProfit')}
                    </span>
                  </th>
                  <th 
                    onClick={() => handleSort('yearlyProfit')}
                    className={`group py-4 px-3 text-right min-w-[120px] text-indigo-600 whitespace-nowrap cursor-pointer hover:bg-slate-100/80 transition-colors select-none ${!showInTransitDetails ? 'rounded-tr-xl' : ''}`}
                    title="点击排序"
                  >
                    <span className="inline-flex items-center justify-end w-full">
                      年度盈亏 (已确权) {renderSortIcon('yearlyProfit')}
                    </span>
                  </th>
                  {showInTransitDetails && (
                    <>
                      <th 
                        onClick={() => handleSort('inTransitValuePackage')}
                        className="group py-4 px-3 text-right min-w-[100px] text-amber-600 bg-amber-50/50 whitespace-nowrap cursor-pointer hover:bg-amber-100/60 transition-colors select-none"
                        title="点击排序"
                      >
                        <span className="inline-flex items-center justify-end w-full">
                          在途产兑 {renderSortIcon('inTransitValuePackage')}
                        </span>
                      </th>
                      <th 
                        onClick={() => handleSort('inTransitIncomePackage')}
                        className="group py-4 px-3 text-right min-w-[110px] text-amber-600 bg-amber-50/50 whitespace-nowrap cursor-pointer hover:bg-amber-100/60 transition-colors select-none"
                        title="点击排序"
                      >
                        <span className="inline-flex items-center justify-end w-full">
                          含在途收产包 {renderSortIcon('inTransitIncomePackage')}
                        </span>
                      </th>
                      <th 
                        onClick={() => handleSort('inTransitMonthlyProfit')}
                        className="group py-4 px-3 text-right min-w-[110px] text-amber-600 bg-amber-50/50 rounded-tr-xl whitespace-nowrap cursor-pointer hover:bg-amber-100/60 transition-colors select-none"
                        title="点击排序"
                      >
                        <span className="inline-flex items-center justify-end w-full">
                          含在途月度盈亏 {renderSortIcon('inTransitMonthlyProfit')}
                        </span>
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-mono">
                {sortedRows.map((row, idx) => {
                  const isEven = idx % 2 === 0;

                  return (
                    <tr key={row.unitName} className={`${isEven ? 'bg-white' : 'bg-slate-50/30'} hover:bg-blue-50/20 transition-colors border-b border-slate-200/60`}>
                      {/* 排名 */}
                      <td className="py-4 px-4 align-middle border-r border-slate-100 text-center font-black whitespace-nowrap">
                        {typeof row.rank === 'number' ? (
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-black shadow-sm ${
                            row.rank === 1 ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-300' :
                            row.rank === 2 ? 'bg-slate-200 text-slate-800' :
                            row.rank === 3 ? 'bg-amber-100 text-amber-800' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {row.rank}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 经营单元名称 */}
                      <td className="py-4 px-4 align-middle border-r border-slate-100 font-black text-slate-900 whitespace-nowrap font-sans">
                        <div className="flex items-center space-x-2">
                          <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                          <span className="text-sm font-black">{row.unitName}</span>
                        </div>
                      </td>

                      {/* 负责人 */}
                      <td className="py-4 px-4 align-middle border-r border-slate-100 text-slate-600 font-bold whitespace-nowrap font-sans">
                        <div>{row.managers}</div>
                      </td>

                      {/* 收款包 */}
                      <td className="py-4 px-3 align-middle text-right font-bold text-slate-700 border-r border-slate-100 whitespace-nowrap">
                        {formatAmount(row.revenuePackage)}
                      </td>

                      {/* 产兑包 (已确权) */}
                      <td className="py-4 px-3 align-middle text-right font-bold text-slate-700 border-r border-slate-100 whitespace-nowrap">
                        {formatAmount(row.confirmedValuePackage)}
                      </td>

                      {/* 收产包 (已确权) */}
                      <td className="py-4 px-3 align-middle text-right font-black text-slate-900 border-r border-slate-100 whitespace-nowrap bg-slate-50/20">
                        {formatAmount(row.incomeValuePackage)}
                      </td>

                      {/* 成本包 */}
                      <td className="py-4 px-3 align-middle text-right font-bold text-rose-600 border-r border-slate-100 whitespace-nowrap">
                        {formatAmount(row.costPackage ?? row.totalCostOffset, true)}
                      </td>

                      {/* 月度盈亏 (已确权) - 主排序依据 */}
                      <td className="py-4 px-3 align-middle text-right font-black text-blue-600 border-r border-slate-100 whitespace-nowrap bg-blue-50/10 text-sm">
                        {formatAmount(row.monthlyProfit)}
                      </td>

                      {/* 年度盈亏 (已确权) */}
                      <td className={`py-4 px-3 align-middle text-right font-black text-indigo-600 whitespace-nowrap ${showInTransitDetails ? 'border-r border-slate-100' : ''}`}>
                        {formatAmount(row.yearlyProfit)}
                      </td>

                      {/* 辅列：在途指标 */}
                      {showInTransitDetails && (
                        <>
                          <td className="py-4 px-3 align-middle text-right font-bold text-amber-600 bg-amber-50/30 border-r border-slate-100 whitespace-nowrap">
                            {formatAmount(row.inTransitValuePackage)}
                          </td>
                          <td className="py-4 px-3 align-middle text-right font-bold text-amber-600 bg-amber-50/30 border-r border-slate-100 whitespace-nowrap">
                            {formatAmount(row.inTransitIncomePackage)}
                          </td>
                          <td className="py-4 px-3 align-middle text-right font-black text-amber-700 bg-amber-50/40 whitespace-nowrap">
                            {formatAmount(row.inTransitMonthlyProfit)}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-slate-400 font-sans flex items-center justify-end px-2 pt-2 border-t border-slate-100">
            <div className="font-mono">
              共 {sortedRows.length} 个经营单元
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

