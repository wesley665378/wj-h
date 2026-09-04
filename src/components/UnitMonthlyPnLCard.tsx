import React, { useState, useEffect, useMemo } from 'react';
import { Card, StatItem } from '@/components/UI';
import { InfoTip } from '@/components/InfoTip';
import { CostPrivacyToggle } from '@/components/CostPrivacyToggle';
import { useCostPrivacy } from '@/hooks/useCostPrivacy';
import { fetchCenterRanking, CenterRankingResponse } from '@/api';
import { computeUnitSingleMonth, SingleMonthUnitMetrics } from '@/utils/businessUnitProfitRanking';
import { ValueCreationLog, MiningResource, User, InternalTransaction } from '../../types';
import { formatMoney } from '@/utils/formatMoney';
import { Eye, EyeOff } from 'lucide-react';

interface UnitMonthlyPnLCardProps {
  currentUser: User;
  month: string; // YYYY-MM
  units: string[];
  auditLogs: ValueCreationLog[];
  resources: MiningResource[];
  users: User[];
  transactions: InternalTransaction[];
}

export const UnitMonthlyPnLCard: React.FC<UnitMonthlyPnLCardProps> = ({
  currentUser, month, units, auditLogs, resources, users, transactions
}) => {
  const [data, setData] = useState<SingleMonthUnitMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const { isCostVisible, toggleCostVisible, maskMoney } = useCostPrivacy();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch current month data
        const response = await fetchCenterRanking(month);
        
        // Calculate yearly P&L
        const [yearStr, monthNumStr] = month.split('-');
        const year = parseInt(yearStr, 10);
        const monthNum = parseInt(monthNumStr, 10);
        
        let yearlyPnl1 = 0;
        let yearlyPnl2 = 0;
        
        for (let m = 1; m <= monthNum; m++) {
          const mStr = `${year}-${String(m).padStart(2, '0')}`;
          const metrics = computeUnitSingleMonth(currentUser.center || '', mStr, users, auditLogs, resources, transactions);
          yearlyPnl1 += metrics.row1MonthlyProfit;
          yearlyPnl2 += metrics.row2MonthlyProfit;
        }

        setData({ ...response, yearlyPnl1, yearlyPnl2 } as any);
      } catch (error) {
        // Fallback
        const unitName = currentUser.center || '';
        const metrics = computeUnitSingleMonth(unitName, month, users, auditLogs, resources, transactions);
        
        // Calculate yearly P&L fallback
        const [yearStr, monthNumStr] = month.split('-');
        const year = parseInt(yearStr, 10);
        const monthNum = parseInt(monthNumStr, 10);
        
        let yearlyPnl1 = 0;
        let yearlyPnl2 = 0;
        for (let m = 1; m <= monthNum; m++) {
          const mStr = `${year}-${String(m).padStart(2, '0')}`;
          const mMetrics = computeUnitSingleMonth(unitName, mStr, users, auditLogs, resources, transactions);
          yearlyPnl1 += mMetrics.row1MonthlyProfit;
          yearlyPnl2 += mMetrics.row2MonthlyProfit;
        }

        setData({ ...metrics, yearlyPnl1, yearlyPnl2 } as any);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [month, currentUser.center, users, auditLogs, resources, transactions]);

  // ... rest of the component
  // ... add yearlyPnl1 / yearlyPnl2 display
  // ...

  const formatProfit = (val: number) => {
    const cls = val >= 0 ? 'text-emerald-600' : 'text-rose-600';
    return <span className={`font-bold ${cls}`}>{val >= 0 ? '+' : ''}{val.toLocaleString()}</span>;
  };

  return (
    <Card className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-slate-800">{data.unitName} 盈亏看板</h3>
        <div className="flex gap-2">
          <button onClick={toggleCostVisible} className="text-slate-500 hover:text-slate-800">
            {isCostVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4 text-xs">
        <StatItem label="收款包" value={data.revenuePackage.toLocaleString()} />
        <StatItem label="收产包" value={`${data.row1IncomeValuePackage.toLocaleString()} / ${data.row2IncomeValuePackage.toLocaleString()}`} />
        <StatItem label="成本包" value={isCostVisible ? ((data as any).costPackage ?? data.totalCost).toLocaleString() : '***'} />
        <StatItem label="直接费用" value={isCostVisible ? data.directCost.toLocaleString() : '***'} />
      </div>
      
      <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">月度盈亏 (行1/行2)</span>
          <span>{formatProfit((data as any).row1MonthlyProfit)} / {formatProfit((data as any).row2MonthlyProfit)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">年度盈亏 (行1/行2)</span>
          <span>{formatProfit((data as any).yearlyPnl1)} / {formatProfit((data as any).yearlyPnl2)}</span>
        </div>
      </div>
    </Card>
  );
};
