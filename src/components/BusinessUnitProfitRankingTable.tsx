import React, { useState, useMemo } from 'react';
import { User, ValueCreationLog, MiningResource, InternalTransaction } from '../../types';
import { computeBusinessUnitProfitRanking, UnitRankingRow } from '../utils/businessUnitProfitRanking';
import { useCostPrivacy } from '../hooks/useCostPrivacy';
import { CostPrivacyToggle } from './CostPrivacyToggle';
import { formatMoney } from '../utils/formatMoney';
import { Card } from './UI';
import { Trophy, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { UI_LABELS } from '../constants/uiLabels';

interface BusinessUnitProfitRankingTableProps {
  units: string[];
  selectedMonth: string; // YYYY-MM
  users: User[];
  auditLogs: ValueCreationLog[];
  resources: MiningResource[];
  transactions: InternalTransaction[];
  currentUser?: User;
  startDate?: string;
  endDate?: string;
}

export const BusinessUnitProfitRankingTable: React.FC<BusinessUnitProfitRankingTableProps> = ({
  units,
  selectedMonth,
  users,
  auditLogs,
  resources,
  transactions,
  startDate,
  endDate,
}) => {
  // 默认折叠，领导/用户点击展开才可见
  const [isExpanded, setIsExpanded] = useState(false);
  const { isCostVisible, toggleCostVisible, maskMoney } = useCostPrivacy();

  // 计算榜单数据
  const rankingRows = useMemo(() => {
    return computeBusinessUnitProfitRanking(
      units,
      selectedMonth,
      users,
      auditLogs,
      resources,
      transactions,
      startDate,
      endDate
    );
  }, [units, selectedMonth, users, auditLogs, resources, transactions, startDate, endDate]);

  // 将扁平数组按经营单元聚合成对（便于渲染 rowSpan）
  const pairedRows = useMemo(() => {
    const pairs: { unitName: string; managers: string; row1: UnitRankingRow; row2: UnitRankingRow }[] = [];
    for (let i = 0; i < rankingRows.length; i += 2) {
      const row1 = rankingRows[i];
      const row2 = rankingRows[i + 1];
      if (row1 && row2) {
        pairs.push({
          unitName: row1.unitName,
          managers: row1.managers,
          row1,
          row2,
        });
      }
    }
    return pairs;
  }, [rankingRows]);

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
                经营单元盈利排名榜
              </h3>
              <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200/60 rounded-full text-[10px] font-black uppercase tracking-wider">
                筛选: {startDate && endDate ? `${startDate} 至 ${endDate}` : selectedMonth}
              </span>
            </div>
            <p className="text-slate-400 text-xs font-bold mt-1">
              按月度盈亏精确排序 · 双口径产兑拆解 · 动态关联全站成本隐私
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3" onClick={(e) => e.stopPropagation()}>
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

      {/* 展开后的表格内容 */}
      {isExpanded && (
        <div className="border-t border-slate-100 p-6 md:p-8 space-y-6 animate-fadeIn">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="py-4 px-4 text-center rounded-tl-xl">排名</th>
                  <th className="py-4 px-4 text-left">经营单元名称</th>
                  <th className="py-4 px-4 text-left">负责人</th>
                  <th className="py-4 px-3 text-center">产值口径</th>
                  <th className="py-4 px-3 text-right">收款</th>
                  <th className="py-4 px-3 text-right">产值</th>
                  <th className="py-4 px-3 text-right">收款包</th>
                  <th className="py-4 px-3 text-right">产兑包</th>
                  <th className="py-4 px-3 text-right">收产包</th>
                  <th className="py-4 px-3 text-right text-rose-600">总成本</th>
                  <th className="py-4 px-3 text-right text-blue-600">月度盈亏</th>
                  <th className="py-4 px-3 text-right text-indigo-600 rounded-tr-xl">年度盈亏</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {pairedRows.map((pair, idx) => {
                  const { row1, row2 } = pair;
                  const isEven = idx % 2 === 0;

                  return (
                    <React.Fragment key={pair.unitName}>
                      {/* 第一行: 含背书合计 */}
                      <tr className={`${isEven ? 'bg-white' : 'bg-slate-50/30'} hover:bg-blue-50/20 transition-colors`}>
                        {/* 排名 (跨两行, 最左侧) */}
                        <td rowSpan={2} className="py-4 px-4 align-top border-r border-slate-100 text-center font-mono font-black">
                          {typeof row1.rank === 'number' ? (
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-black shadow-sm ${
                              row1.rank === 1 ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-300' :
                              row1.rank === 2 ? 'bg-slate-200 text-slate-800' :
                              row1.rank === 3 ? 'bg-amber-100 text-amber-800' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {row1.rank}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* 经营单元名称 (跨两行) */}
                        <td rowSpan={2} className="py-4 px-4 align-top border-r border-slate-100 font-black text-slate-900">
                          <div className="flex items-center space-x-2 pt-1">
                            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                            <span className="text-sm font-black">{pair.unitName}</span>
                          </div>
                        </td>

                        {/* 负责人 (跨两行) */}
                        <td rowSpan={2} className="py-4 px-4 align-top border-r border-slate-100 text-slate-600 font-bold">
                          <div className="pt-1">{pair.managers}</div>
                        </td>

                        {/* 第一行口径 */}
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200/50 whitespace-nowrap">
                            已确权
                          </span>
                        </td>

                        {/* 收款 */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-700">
                          {formatAmount(row1.revenue)}
                        </td>

                        {/* 产值 */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-700">
                          {formatAmount(row1.outputValue)}
                        </td>

                        {/* 收款包 */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-700">
                          {formatAmount(row1.revenuePackage)}
                        </td>

                        {/* 产兑包 */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-700">
                          {formatAmount(row1.valuePackage)}
                        </td>

                        {/* 收产包 */}
                        <td className="py-3 px-3 text-right font-mono font-black text-slate-900 bg-slate-50/50">
                          {formatAmount(row1.incomeValuePackage)}
                        </td>

                        {/* 总成本 (受成本隐私保护) */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-rose-600">
                          {formatAmount(row1.totalCost, true)}
                        </td>

                        {/* 月度盈亏 (不脱敏) */}
                        <td className="py-3 px-3 text-right font-mono font-black text-sm">
                          <span className={row1.monthlyProfit !== null && row1.monthlyProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {row1.monthlyProfit !== null && row1.monthlyProfit > 0 ? '+' : ''}
                            {formatAmount(row1.monthlyProfit)}
                          </span>
                        </td>

                        {/* 年度盈亏 (不脱敏) */}
                        <td className="py-3 px-3 text-right font-mono font-black text-sm">
                          <span className={row1.yearlyProfit !== null && row1.yearlyProfit >= 0 ? 'text-indigo-600' : 'text-rose-600'}>
                            {row1.yearlyProfit !== null && row1.yearlyProfit > 0 ? '+' : ''}
                            {formatAmount(row1.yearlyProfit)}
                          </span>
                        </td>
                      </tr>

                      {/* 第二行: 已确权+待确权 */}
                      <tr className={`${isEven ? 'bg-white' : 'bg-slate-50/30'} border-b border-slate-200/60 hover:bg-amber-50/20 transition-colors`}>
                        {/* 第二行口径 */}
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200/50 whitespace-nowrap">
                            已确权+待确权
                          </span>
                        </td>

                        {/* 收款 */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-700">
                          {formatAmount(row2.revenue)}
                        </td>

                        {/* 产值 */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-700">
                          {formatAmount(row2.outputValue)}
                        </td>

                        {/* 收款包 */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-700">
                          {formatAmount(row2.revenuePackage)}
                        </td>

                        {/* 产兑包 */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-amber-600">
                          {formatAmount(row2.valuePackage)}
                        </td>

                        {/* 收产包 */}
                        <td className="py-3 px-3 text-right font-mono font-black text-slate-900 bg-amber-50/10">
                          {formatAmount(row2.incomeValuePackage)}
                        </td>

                        {/* 总成本 (受成本隐私保护) */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-rose-600">
                          {formatAmount(row2.totalCost, true)}
                        </td>

                        {/* 月度盈亏 */}
                        <td className="py-3 px-3 text-right font-mono font-black text-sm">
                          <span className={row2.monthlyProfit !== null && row2.monthlyProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {row2.monthlyProfit !== null && row2.monthlyProfit > 0 ? '+' : ''}
                            {formatAmount(row2.monthlyProfit)}
                          </span>
                        </td>

                        {/* 年度盈亏 */}
                        <td className="py-3 px-3 text-right font-mono font-black text-sm">
                          <span className={row2.yearlyProfit !== null && row2.yearlyProfit >= 0 ? 'text-indigo-600' : 'text-rose-600'}>
                            {row2.yearlyProfit !== null && row2.yearlyProfit > 0 ? '+' : ''}
                            {formatAmount(row2.yearlyProfit)}
                          </span>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}

                {pairedRows.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-6 py-20 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest">{UI_LABELS.EMPTY_DEFAULT}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 表下脚注 */}
          <div className="pt-2 flex items-center space-x-2 text-xs font-bold text-slate-400">
            <Info size={14} className="text-amber-500 flex-shrink-0" />
            <span>
              * 待确权产兑包＝联动确权（收款背书在途，无需人工操作）。总成本与直接费用包含刚性工资、承兑奖金与动态消耗，按全站成本隐私动态脱敏。
            </span>
          </div>
        </div>
      )}
    </Card>
  );
};
