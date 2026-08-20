
import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ValueCreationLog, MiningResource, AuditStatus, RefineCategory, User, InternalTransaction, RefineType, Role, TransactionType, TransactionStatus, MeetingSample } from '../types';
import { 
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';
import { InfoTip } from '../src/components/InfoTip';
import { RefreshCw, Info, LayoutGrid, List, AlertTriangle, Wallet, Eye, EyeOff, FileSpreadsheet, Sparkles, Lock, CheckCircle2 } from 'lucide-react';
import { useCostPrivacy } from '../src/hooks/useCostPrivacy';
import { useCityGuardianModal, CityGuardianModal } from '../src/components/CityGuardianModal';
import * as XLSX from 'xlsx';
import { Card, StatItem, ProgressBar } from '../src/components/UI';
import { UI_LABELS } from '../src/constants/uiLabels';
import { aggregateMiningQuadrantsFromLogs } from '../src/utils/purification';
import { PURITY_RULES, LINKED_CONFIRMATION_RULES } from '../src/constants/businessRules';
import { getPurityInfo, calculateHistoricalNetValue, getUserSalaryByMonth } from '../src/utils/business';
import { 
  sumConfirmedRevenuePackage, 
  sumValueConversionPackage, 
  sumIncomeProductionPackage 
} from '../src/utils/reconcileMiningFromLogs';
import { getLocalMonthString, resolveLogBusinessMonth, getLocalDateString } from '../src/utils/dateUtils';

interface DashboardProps {
  logs: ValueCreationLog[];
  resources: MiningResource[];
  users: User[];
  currentUser: User;
  transactions?: InternalTransaction[];
  onSystemAdjustment?: (log: ValueCreationLog, details: string) => void;
  onSwitchTab?: (tab: string) => void;
  businessUnits: string[];
  meetingSamples?: MeetingSample[];
  onSaveMeetingSample?: (sample: MeetingSample) => Promise<boolean>;
}

type PeriodType = 'month' | 'quarter' | 'half' | 'year';

const Dashboard: React.FC<DashboardProps> = ({ logs, users, resources, currentUser, transactions, onSystemAdjustment, onSwitchTab, businessUnits, meetingSamples, onSaveMeetingSample }) => {
  const { isCostVisible, toggleCostVisible, maskMoney, maskText } = useCostPrivacy();
  const { modalState, showAlert, showConfirm, closeModal } = useCityGuardianModal();
  const [now, setNow] = useState<Date>(() => new Date());

  const canSampleAndExport = currentUser?.role === Role.Admin || currentUser?.role === Role.npcxie;

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [periodValue, setPeriodValue] = useState<number>(() => new Date().getMonth() + 1);
  const [sourceView, setSourceView] = useState<'category' | 'unit'>('category');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDefinition, setShowDefinition] = useState(false);
  const [showPurityRules, setShowPurityRules] = useState(false);
  const [showHedgingRules, setShowHedgingRules] = useState(false);
  const [resourceViewMode, setResourceViewMode] = useState<'card' | 'list'>('card');
  const [selectedMiningId, setSelectedMiningId] = useState<string>('');
  const [filterCenter, setFilterCenter] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterPurity, setFilterPurity] = useState<string | null>(null);

  const isManager = useMemo(() => 
    currentUser.category === '经管员高款专' || currentUser.category === '经管员高产专',
  [currentUser]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Simulate a refresh delay
    setTimeout(() => {
      setIsRefreshing(false);
    }, 800);
  };

  const uniqueCenters = useMemo(() => {
    return businessUnits;
  }, [businessUnits]);

  const uniqueTypes = useMemo(() => {
    const types = new Set<string>();
    resources.forEach(r => r.types.forEach(t => types.add(t)));
    return Array.from(types);
  }, [resources]);

  const resourceQuadrants = useMemo(() => {
    const map = new Map<string, ReturnType<typeof aggregateMiningQuadrantsFromLogs>>();
    for (const r of resources) {
      map.set(r.id, aggregateMiningQuadrantsFromLogs(logs, resources, r.id));
    }
    return map;
  }, [logs, resources]);

  const filteredResources = useMemo(() => {
    return resources.filter(r => {
      const q = resourceQuadrants.get(r.id);
      const purityInfo = q 
        ? getPurityInfo(q.revenue.confirmed, q.value.confirmed, q.value.pending, q.value.capacity)
        : getPurityInfo(r.confirmedRevenue, r.confirmedValue, r.pendingValue, r.valueCapacity);
      const restrictCenter = isManager ? currentUser.center : filterCenter;
      const matchesCenter = !restrictCenter || r.assignedTo === restrictCenter || r.assignedToRevenue === restrictCenter || r.assignedToValue === restrictCenter;
      const matchesType = !filterType || r.types.includes(filterType as RefineType);
      const matchesPurity = !filterPurity || purityInfo.label.includes(filterPurity);
      return matchesCenter && matchesType && matchesPurity;
    });
  }, [resources, filterCenter, filterType, filterPurity, isManager, resourceQuadrants]);

  const globalWeightedPurity = useMemo(() => {
    let totalConfirmedRevenue = 0;
    let totalConfirmedValue = 0;
    for (const r of filteredResources) {
      const q = resourceQuadrants.get(r.id);
      if (q) {
        totalConfirmedRevenue += q.revenue.confirmed;
        totalConfirmedValue += q.value.confirmed;
      }
    }
    if (totalConfirmedValue === 0) return 0;
    return (totalConfirmedRevenue / totalConfirmedValue) * 100;
  }, [filteredResources, resourceQuadrants]);

  const globalWeightedPurityState = useMemo(() => {
    let totalConfirmedRevenue = 0;
    let totalConfirmedValue = 0;
    let totalPendingValue = 0;
    let totalValueLimit = 0;
    for (const r of filteredResources) {
      const q = resourceQuadrants.get(r.id);
      if (q) {
        totalConfirmedRevenue += q.revenue.confirmed;
        totalConfirmedValue += q.value.confirmed;
        totalPendingValue += q.value.pending;
        totalValueLimit += q.value.capacity;
      }
    }
    return getPurityInfo(totalConfirmedRevenue, totalConfirmedValue, totalPendingValue, totalValueLimit);
  }, [filteredResources, resourceQuadrants]);

  // 当切换 periodType 时，重置 periodValue 为当前时间对应的值
  useEffect(() => {
    if (periodType === 'month') setPeriodValue(now.getMonth() + 1);
    else if (periodType === 'quarter') setPeriodValue(Math.floor(now.getMonth() / 3) + 1);
    else if (periodType === 'half') setPeriodValue(now.getMonth() < 6 ? 1 : 2);
    else setPeriodValue(now.getFullYear());
  }, [periodType, now]);

  const currentPeriodLabel = useMemo(() => {
    if (periodType === 'month') return `${now.getFullYear()}年${periodValue}月`;
    if (periodType === 'quarter') return `${now.getFullYear()}年Q${periodValue}`;
    if (periodType === 'half') return `${now.getFullYear()}年${periodValue === 1 ? '上半年' : '下半年'}`;
    return `${periodValue}年度`;
  }, [periodType, periodValue, now]);

  const periodMonths = useMemo(() => {
    if (periodType === 'month') return 1;
    if (periodType === 'quarter') return 3;
    if (periodType === 'half') return 6;
    return 12;
  }, [periodType]);

  const periodRange = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    let start = 0;
    let end = 0;
    
    if (periodType === 'month') {
      d.setMonth(periodValue - 1);
      start = d.getTime();
      d.setMonth(periodValue);
      end = d.getTime();
    } else if (periodType === 'quarter') {
      d.setMonth((periodValue - 1) * 3);
      start = d.getTime();
      d.setMonth(periodValue * 3);
      end = d.getTime();
    } else if (periodType === 'half') {
      d.setMonth((periodValue - 1) * 6);
      start = d.getTime();
      d.setMonth(periodValue * 6);
      end = d.getTime();
    } else {
      d.setFullYear(periodValue);
      d.setMonth(0);
      start = d.getTime();
      d.setFullYear(periodValue + 1);
      end = d.getTime();
    }
    return { start, end };
  }, [periodType, periodValue, now]);

  const monthsInPeriod = useMemo(() => {
    const months: string[] = [];
    const current = new Date(periodRange.start);
    const end = new Date(periodRange.end);
    while (current < end) {
      months.push(getLocalMonthString(current));
      current.setMonth(current.getMonth() + 1);
    }
    return months;
  }, [periodRange]);

  const periodOptions = useMemo(() => {
    if (periodType === 'month') return Array.from({length: 12}, (_, i) => ({ label: `${i+1}月`, value: i+1 }));
    if (periodType === 'quarter') return Array.from({length: 4}, (_, i) => ({ label: `Q${i+1}`, value: i+1 }));
    if (periodType === 'half') return [{ label: '上半年', value: 1 }, { label: '下半年', value: 2 }];
    return [{ label: `${now.getFullYear()}年度`, value: now.getFullYear() }];
  }, [periodType, now]);

  // 按经营单元统计刚性工资包 (扣除已核准的非有效工时对冲)
  const salaryByCenter = useMemo(() => {
    const centers: Record<string, {
      name: string;
      value: number;
      revenueLimit: number;
      valueLimit: number;
      revenue2Percent: number;
      value5Percent: number;
    }> = {};
    
    // Initialize
    users.forEach(u => {
      const centerName = u.center || '未分配';
      if (!centers[centerName]) {
        centers[centerName] = {
          name: centerName,
          value: 0,
          revenueLimit: 0,
          valueLimit: 0,
          revenue2Percent: 0,
          value5Percent: 0
        };
      }
    });

    // 1. 基础工资包 (按月累加)
    users.filter(u => !isManager || u.center === currentUser.center).forEach(u => {
      if (u.category === '水库管理员') return;
      
      const centerName = u.center || '未分配';
      monthsInPeriod.forEach(m => {
        centers[centerName].value += getUserSalaryByMonth(u, m);
      });
    });

    // 2. 扣除已核准的非有效工时对冲 (冲抵刚性工资包)
    const approvedDeductions = logs.filter(l => 
      l.status === AuditStatus.Approved && 
      l.type === RefineType.NonEffectiveHours &&
      l.timestamp >= periodRange.start &&
      l.timestamp < periodRange.end &&
      (!isManager || (users.find(u => u.id === l.recordedCollectorId)?.center === currentUser.center))
    );

    approvedDeductions.forEach(l => {
      const collector = users.find(u => u.id === l.recordedCollectorId);
      if (collector?.category === '水库管理员') return;
      
      const centerName = collector?.center || '未分配';
      if (!centers[centerName]) {
        centers[centerName] = { name: centerName, value: 0, revenueLimit: 0, valueLimit: 0, revenue2Percent: 0, value5Percent: 0 };
      }
      
      centers[centerName].value += calculateHistoricalNetValue(l, resources, users);
    });

    // 3. Revenue & Value Limits & Special Pools (Period-based)
    const periodLogs = logs.filter(l => l.timestamp >= periodRange.start && l.timestamp < periodRange.end);
    
    resources.filter(r => !isManager || r.assignedTo === currentUser.center || r.assignedToRevenue === currentUser.center || r.assignedToValue === currentUser.center).forEach(r => {
      const centerName = r.assignedTo || '未分配';
      if (!centers[centerName]) {
        centers[centerName] = { name: centerName, value: 0, revenueLimit: 0, valueLimit: 0, revenue2Percent: 0, value5Percent: 0 };
      }
      centers[centerName].revenueLimit += r.revenueCapacity;
      centers[centerName].valueLimit += r.valueCapacity;
      
      // Calculate period-based extraction
      const miningLogs = periodLogs.filter(l => l.miningId === r.id && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved));
      
      const revLogs = miningLogs.filter(l => l.category === RefineCategory.Revenue);
      const valLogs = miningLogs.filter(l => l.category === RefineCategory.Value);
      
      // 收款计提 (2%) = roundMoney(本笔注入 × C权 × 2%)
      const rev2 = revLogs.reduce((sum, l) => sum + Math.round((l.rawAmount || l.amount) * (l.cClassRatio || 1) * 0.02), 0);
      // 产值计提 (5%) = roundMoney(本笔注入 × C权 × B2权 × 5%)
      const val5 = valLogs.reduce((sum, l) => sum + Math.round((l.rawAmount || l.amount) * (l.cClassRatio || 1) * (l.b2ClassRatio || 1) * 0.05), 0);
      
      centers[centerName].revenue2Percent += rev2;
      centers[centerName].value5Percent += val5;
    });

    return Object.values(centers)
      .filter(c => c.name !== '未分配')
      .sort((a, b) => b.value - a.value);
  }, [users, logs, periodRange, monthsInPeriod, resources]);

  const totalSalaryFlow = useMemo(() => {
    return salaryByCenter.reduce((acc, curr) => acc + curr.value, 0);
  }, [salaryByCenter]);

  // 收入价值提纯核心核算 + 冗余量刻度逻辑
  const waterMetrics = useMemo(() => {
    let revenueGrossAmount = 0;
    let valueGrossAmount = 0;
    let revenueConfirmedAmount = 0;
    let valueConfirmedAmount = 0;
    let revenuePendingAmount = 0;
    let valuePendingAmount = 0;
    let revenueMinedAmount = 0;
    let valueMinedAmount = 0;

    let revenueNetConfirmed = 0;
    let valueNetConfirmed = 0;
    let aCosts = 0;
    let b1Costs = 0;
    let b2Costs = 0;
    let cCosts = 0;
    let dCosts = 0;
    let totalRigidDeduction = 0;
    let platformCoordinationPool = 0;

    const collectorData: Record<string, number> = {};
    const userMap = new Map<string, User>();
    users.forEach(u => userMap.set(u.id, u));

    for (const l of logs) {
      const isInPeriod = l.timestamp >= periodRange.start && l.timestamp < periodRange.end;
      const isApproved = l.status === AuditStatus.Approved;
      const isConfirmed = l.status === AuditStatus.Confirmed;
      const isPending = l.status === AuditStatus.Pending;

      if (isInPeriod) {
        const netValue = calculateHistoricalNetValue(l, resources, users);
        // 统一基准：不再进行二次提纯，直接使用 amount 或者 dynamicCost (四舍五入整数口径)
        const logAmount = l.amount ? Math.round(l.amount) : Math.round(l.dynamicCost || 0);

        if (isApproved) {
          if (l.category === RefineCategory.Revenue) {
            revenueGrossAmount += logAmount;
            revenueMinedAmount += logAmount;
          }
          if (l.category === RefineCategory.Value) {
            valueGrossAmount += logAmount;
            valueMinedAmount += logAmount;
          }
          
          if (l.costCategory === 'A') aCosts += l.dynamicCost;
          if (l.costCategory === 'B' && l.valueConsumptionMode === 'B1') b1Costs += l.dynamicCost;
          if (l.costCategory === 'B' && l.valueConsumptionMode === 'B2') b2Costs += l.dynamicCost;
          if (l.costCategory === 'C') cCosts += Math.abs(netValue);
          if (l.costCategory === 'D') dCosts += l.dynamicCost;

          if (l.type === RefineType.NonEffectiveHours) {
            const collector = userMap.get(l.recordedCollectorId || '');
            if (collector?.category !== '水库管理员') {
              totalRigidDeduction += netValue;
            }
          }
        }

        if (isConfirmed) {
          if (l.category === RefineCategory.Revenue) revenueConfirmedAmount += logAmount;
          if (l.category === RefineCategory.Value) valueConfirmedAmount += logAmount;
        }

        if (isConfirmed || isApproved) {
          if (l.category === RefineCategory.Revenue && l.amount > 0) {
            revenueNetConfirmed += netValue;
            platformCoordinationPool += (logAmount * 0.2);
          }
          if (l.category === RefineCategory.Value && l.amount > 0) valueNetConfirmed += netValue;
        }

        if (isPending) {
          if (l.category === RefineCategory.Value) {
            valuePendingAmount += logAmount;
          }
          if (l.category === RefineCategory.Revenue) {
            revenuePendingAmount += logAmount;
          }
        }

        // Collector Stats
        const collector = userMap.get(l.recordedCollectorId || '');
        if (!(sourceView === 'unit' && currentUser.center && collector?.center !== currentUser.center) && (!isManager || collector?.center === currentUser.center)) {
          const collectorName = collector?.name || l.recordedCollectorId || '系统/未知';
          const category = collector?.category;

          if (category?.includes('款专')) {
            if (l.category === RefineCategory.Revenue && (isConfirmed || isApproved)) {
              const key = `${collectorName} (已确权收款)`;
              collectorData[key] = (collectorData[key] || 0) + netValue;
            }
          } else if (category?.includes('产专')) {
            if (l.category === RefineCategory.Value) {
              if (isConfirmed || isApproved) {
                const key = `${collectorName} (已确权产值)`;
                collectorData[key] = (collectorData[key] || 0) + netValue;
              } else if (isPending) {
                const key = `${collectorName} (未确权产值)`;
                collectorData[key] = (collectorData[key] || 0) + netValue;
              }
            }
          } else {
            if (isApproved) {
              collectorData[collectorName] = (collectorData[collectorName] || 0) + netValue;
            }
          }
        }
      }
    }

    const collectorStats = Object.entries(collectorData)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const revenueSalaryPackage = users.filter(u => u.salaryPackageType === '收款工资包' || (u.salaryPackageType === '经管员工资包' && (u.category === '经管员高款专' || u.category?.includes('款')))).reduce((acc, u) => acc + (u.salaryPackage || 0), 0) * periodMonths;
    const valueSalaryPackage = users.filter(u => u.salaryPackageType === '产值工资包' || (u.salaryPackageType === '经管员工资包' && (u.category === '经管员高产专' || u.category?.includes('产')))).reduce((acc, u) => acc + (u.salaryPackage || 0), 0) * periodMonths;

    // ----- NEW COMPUTATION BASED ON PORTFOLIO PACKAGES (netValue 口径) -----
    const periodLogs = logs.filter(l => l.timestamp >= periodRange.start && l.timestamp < periodRange.end);
    const revenueWater = sumConfirmedRevenuePackage(periodLogs, resources, users);
    const valueWater = sumValueConversionPackage(periodLogs, resources, users);
    const incomeWaterPool = sumIncomeProductionPackage(periodLogs, resources, users);
    const totalIncomeWater = incomeWaterPool;
    const totalStoredWater = incomeWaterPool;

    const revenueStored = revenueWater; // For backward compatibility
    const valueStored = valueWater;     // For backward compatibility

    // 2. 总刚性保底开支 (totalRigidExpenses): 所有在职专家的保底工资总和 (按月累加)
    let totalRigidExpenses = 0;
    monthsInPeriod.forEach(m => {
      totalRigidExpenses += users
        .filter(u => u.category !== '水库管理员' && (u.userStatus === 'active' || u.userStatus === undefined))
        .reduce((acc, u) => acc + getUserSalaryByMonth(u, m), 0);
    });
    const rigidSalaryPackage = totalRigidExpenses;

    // 3. 运营直接损耗 (operatingLoss) - 包含 A, B1, B2, C(收集 C 的 dynamicCost) 且 D 类
    // 收集 Approved 状态下 C 类的 dynamicCost 累加
    let cCostsDynamic = 0;
    for (const l of logs) {
      const isInPeriod = l.timestamp >= periodRange.start && l.timestamp < periodRange.end;
      const isApproved = l.status === AuditStatus.Approved;
      if (isInPeriod && isApproved) {
        if (l.costCategory === 'C') {
          cCostsDynamic += l.dynamicCost || 0;
        }
      }
    }
    const operatingLoss = aCosts + b1Costs + b2Costs + cCostsDynamic + dCosts;

    // 4. 已产出总奖金池 (totalBonusPool) - 遍历并累加全量采集专家的【收产包冗余】
    let totalRedundancySum = 0;
    users.forEach(u => {
      const isRankKuan = u.category === '中款专' || u.category === '初款专';
      const isRankChan = u.category === '中产专' || u.category === '初产专';
      
      const uLogs = logs.filter(l => 
        l.recordedCollectorId === u.id && 
        l.status === AuditStatus.Approved && 
        l.timestamp >= periodRange.start &&
        l.timestamp < periodRange.end
      );
      
      const rxPoints = uLogs.filter(l => l.category === RefineCategory.Revenue).reduce((sum, l) => sum + (l.amount || 0), 0);
      const vxPoints = uLogs.filter(l => l.category === RefineCategory.Value).reduce((sum, l) => sum + (l.amount || 0), 0);
      
      const kuanContribution = isRankKuan ? (rxPoints * 0.02) : 0;
      const chanContribution = isRankChan ? (vxPoints * 0.05) : 0;
      
      totalRedundancySum += (kuanContribution + chanContribution);
    });
    const totalBonusPool = totalRedundancySum;

    // For backward compatibility on detailed panels (legacy bonus metrics)
    const inboundValueConversionPackage = valueWater; 
    const valueBonusPool = Math.max(0, inboundValueConversionPackage - valueSalaryPackage - b1Costs);
    const revenueBonusPool = Math.max(0, revenueWater - revenueSalaryPackage - aCosts);

    // 5. 平台统筹留用池 (platformCoordinationPool) - 已包含在入库收入日志中，强制按 20% 风控刚性提取沉淀
    platformCoordinationPool = revenueStored * 0.20;

    // 6. 最终分红池结余（纯业务盈余）公式
    const fhctzCost = totalIncomeWater < totalRigidExpenses ? (totalRigidExpenses - totalIncomeWater) : 0;
    const dividendPoolRaw = Math.max(0, totalStoredWater - totalRigidExpenses - operatingLoss - totalBonusPool - platformCoordinationPool);
    const dividendPool = Math.max(0, dividendPoolRaw - fhctzCost);
    const reservoirInflow = totalStoredWater;

    // 产值原料产量参考相关计算
    const totalValueInitial = resources.reduce((acc, r) => acc + (r.initialValueCapacity || r.valueCapacity), 0);
    const totalRevenueInitial = resources.reduce((acc, r) => acc + (r.initialRevenueCapacity || r.revenueCapacity), 0);
    const totalMinedRevenue = revenueMinedAmount;
    const totalMinedValue = valueMinedAmount;

    // 未确权 = 初限 - 待确权 - 已确权 - 入库 (amount 维度)
    const revenueUnconfirmed = Math.max(0, totalRevenueInitial - revenueConfirmedAmount - revenuePendingAmount - totalMinedRevenue);
    const revenueQuadrantStats = [
      { name: '收款-待确权', value: revenuePendingAmount, color: '#F59E0B' },
      { name: '收款-已确权', value: revenueConfirmedAmount, color: '#10B981' },
      { name: '收款-未确权', value: revenueUnconfirmed, color: '#F87171' },
      { name: '收款-入库', value: totalMinedRevenue, color: '#3B82F6' }
    ];

    const valueUnconfirmed = Math.max(0, totalValueInitial - valueConfirmedAmount - valuePendingAmount - totalMinedValue);
    const valueQuadrantStats = [
      { name: '产值-待确权', value: valuePendingAmount, color: '#F59E0B' },
      { name: '产值-已确权', value: valueConfirmedAmount, color: '#10B981' },
      { name: '产值-未确权', value: valueUnconfirmed, color: '#F87171' },
      { name: '产值-入库', value: totalMinedValue, color: '#3B82F6' }
    ];

    const categoryStats = [...revenueQuadrantStats, ...valueQuadrantStats];

    return {
      revenueWater, valueWater, incomeWaterPool, totalIncomeWater, rigidSalaryPackage, operatingLoss, totalRigidExpenses, valueBonusPool, revenueBonusPool, dividendPool, fhctzCost,
      revenueGross: revenueGrossAmount, valueGross: valueGrossAmount, aCosts, b1Costs, b2Costs, cCosts, dCosts, totalSalaryFlow,
      collectorStats, categoryStats, revenueQuadrantStats, valueQuadrantStats, totalRigidDeduction, reservoirInflow,
      totalValueInitial, totalRevenueInitial, totalMinedRevenue, totalMinedValue,
      valueConfirmed: valueConfirmedAmount, valuePending: valuePendingAmount, valueUnconfirmed, revenueConfirmed: revenueConfirmedAmount, revenuePending: revenuePendingAmount, revenueUnconfirmed, platformCoordinationPool,
      totalBonusPool, acceptancePool: totalBonusPool, revenueStored, valueStored
    };

  }, [logs, periodRange, totalSalaryFlow, resources, users, currentUser, sourceView, transactions, isManager]);

  // 监听资金注入：每月3日，当刚性池中的刚性工资包大于收产包时，由统筹池兜底流入收款
  useEffect(() => {
    const today = new Date();
    // 判断是否为当月 3 日
    const isThirdDayOfMonth = today.getDate() === 3;
    if (!isThirdDayOfMonth) return;

    // 收产包总额
    const rigidSalaryPackage = waterMetrics.rigidSalaryPackage;
    // 收产包总额
    const incomeWaterPool = waterMetrics.incomeWaterPool;

    const netBalance = incomeWaterPool - rigidSalaryPackage;
    
    // 只有当净额为负数且 onSystemAdjustment 存在时才触发兜底
    if (onSystemAdjustment && netBalance < 0) {
      const amountToInject = Math.abs(netBalance);
      console.log(`每月3日触发统筹兜底：统筹池向收产包流入 ${amountToInject.toFixed(2)} 收款`);
      
      const newLog = {
        id: `J${(Date.now() % 100000000).toString().padStart(8, '0')}`,
        miningId: '统筹池',
        rankId: 'system',
        category: RefineCategory.Revenue,
        type: RefineType.Enterprise,
        amount: amountToInject,
        rawAmount: amountToInject,
        dynamicCost: 0,
        costCategory: undefined,
        netValue: amountToInject, // 直接增加收产包
        timestamp: Date.now(),
        status: AuditStatus.Approved,
        confirmationType: '系统兜底确权'
      };
      
      const details = `每月3日兜底处理：统筹池向收产包流入 ${amountToInject.toFixed(2)} 收款积分。操作前：刚性工资包=${rigidSalaryPackage.toFixed(2)}，收产包=${incomeWaterPool.toFixed(2)}，差额=${netBalance.toFixed(2)}`;
      
      onSystemAdjustment(newLog as any, details);
    }
  }, [onSystemAdjustment, waterMetrics.rigidSalaryPackage, waterMetrics.incomeWaterPool]);

  // --- 会务留样与报告状态管理 ---
  const isSampleSupported = periodType === 'month' || periodType === 'quarter';
  const samplePeriodKey = useMemo(() => {
    if (periodType === 'month') return `${now.getFullYear()}-${String(periodValue).padStart(2, '0')}`;
    if (periodType === 'quarter') return `${now.getFullYear()}-Q${periodValue}`;
    return '';
  }, [periodType, periodValue, now]);

  const currentMeetingSample = useMemo(() => {
    if (!isSampleSupported || !meetingSamples || !samplePeriodKey) return undefined;
    return meetingSamples.find(s => s.periodType === periodType && s.periodKey === samplePeriodKey);
  }, [isSampleSupported, meetingSamples, periodType, samplePeriodKey]);

  const [sampleViewMode, setSampleViewMode] = useState<'sample' | 'live'>('sample');

  useEffect(() => {
    if (currentMeetingSample) {
      setSampleViewMode('sample');
    } else {
      setSampleViewMode('live');
    }
  }, [periodType, periodValue, currentMeetingSample?.id]);

  const isViewingSample = isSampleSupported && Boolean(currentMeetingSample) && sampleViewMode === 'sample';

  // 冻结数据与现算数据映射
  const displayIncomeWaterPool = isViewingSample && currentMeetingSample ? currentMeetingSample.kpis.totalRevenueAndValuePackage : waterMetrics.incomeWaterPool;
  const displayRevenueWater = isViewingSample && currentMeetingSample ? currentMeetingSample.kpis.totalRevenuePackage : waterMetrics.revenueWater;
  const displayValueWater = isViewingSample && currentMeetingSample ? currentMeetingSample.kpis.totalValuePackage : waterMetrics.valueWater;
  const displayDividendPool = isViewingSample && currentMeetingSample ? (currentMeetingSample.kpis.dividendPool ?? waterMetrics.dividendPool) : waterMetrics.dividendPool;
  const displayTotalRigidExpenses = isViewingSample && currentMeetingSample ? (currentMeetingSample.kpis.totalRigidExpenses ?? waterMetrics.totalRigidExpenses) : waterMetrics.totalRigidExpenses;
  const displayOperatingLoss = isViewingSample && currentMeetingSample ? (currentMeetingSample.kpis.operatingLoss ?? waterMetrics.operatingLoss) : waterMetrics.operatingLoss;
  const displayTotalBonusPool = isViewingSample && currentMeetingSample ? (currentMeetingSample.kpis.totalBonusPool ?? waterMetrics.totalBonusPool) : waterMetrics.totalBonusPool;
  const displayPlatformCoordinationPool = isViewingSample && currentMeetingSample ? (currentMeetingSample.kpis.platformCoordinationPool ?? waterMetrics.platformCoordinationPool) : waterMetrics.platformCoordinationPool;
  const displayReservoirInflow = isViewingSample && currentMeetingSample ? (currentMeetingSample.kpis.reservoirInflow ?? waterMetrics.reservoirInflow) : waterMetrics.reservoirInflow;
  const displayGlobalWeightedPurity = isViewingSample && currentMeetingSample ? (currentMeetingSample.kpis.globalWeightedPurity ?? globalWeightedPurity) : globalWeightedPurity;

  // 生成会务留样处理
  const handleGenerateMeetingSample = () => {
    if (!isSampleSupported) return;
    const periodLogs = logs.filter(l => l.timestamp >= periodRange.start && l.timestamp < periodRange.end);
    const isOverwrite = Boolean(currentMeetingSample);

    showConfirm(
      `确认生成「${currentPeriodLabel}」会务留样吗？\n\n本留样只对生成此刻系统内的数据负责。之后再录入的动态消耗、权重等（凡会影响收入包的）都不会改这份留样。${isOverwrite ? '\n\n⚠️ 注意：本期已存在旧留样，本次生成将覆盖该期最新一份。' : ''}`,
      async () => {
        const frozenAt = Date.now();
        const frozenByUserId = currentUser.userId || currentUser.id || 'admin';
        const frozenByName = currentUser.name || '管理员';
        const label = `${currentPeriodLabel} 会务留样`;
        const checksum = `流水 ${periodLogs.length} 条 | 收产包 ${Math.round(waterMetrics.incomeWaterPool)} | 收款包 ${Math.round(waterMetrics.revenueWater)} | 产兑包 ${Math.round(waterMetrics.valueWater)}`;

        const sampleToSave: MeetingSample = {
          id: `${periodType}:${samplePeriodKey}`,
          periodType: periodType as 'month' | 'quarter',
          periodKey: samplePeriodKey,
          frozenAt,
          frozenByUserId,
          frozenByName,
          label,
          fixedNotice: '会务留样 · 仅对生成时刻数据负责',
          checksum,
          kpis: {
            totalRevenueAndValuePackage: Math.round(waterMetrics.incomeWaterPool),
            totalRevenuePackage: Math.round(waterMetrics.revenueWater),
            totalValuePackage: Math.round(waterMetrics.valueWater),
            rigidSalaryPackage: Math.round(waterMetrics.rigidSalaryPackage),
            operatingLoss: Math.round(waterMetrics.operatingLoss),
            totalBonusPool: Math.round(waterMetrics.totalBonusPool),
            platformCoordinationPool: Math.round(waterMetrics.platformCoordinationPool),
            dividendPool: Math.round(waterMetrics.dividendPool),
            reservoirInflow: Math.round(waterMetrics.reservoirInflow),
            globalWeightedPurity: Number(globalWeightedPurity.toFixed(1)),
            totalRigidExpenses: Math.round(waterMetrics.totalRigidExpenses),
            logCount: periodLogs.length,
          }
        };

        if (onSaveMeetingSample) {
          const success = await onSaveMeetingSample(sampleToSave);
          if (success) {
            setSampleViewMode('sample');
            showAlert(
              `【${currentPeriodLabel} 会务留样】已成功生成并冻结落库！\n\n凭证信息：\n• 冻结时间：${new Date(frozenAt).toLocaleString()}\n• 经办人员：${frozenByName} (${frozenByUserId})\n• 校验摘要：${checksum}\n• 规则：会务留样 · 仅对生成时刻数据负责`
            );
          } else {
            showAlert(`生成经营快照失败，未保存至数据库，请检查后端服务状态后重试。`);
          }
        }
      },
      undefined,
      '确定生成',
      '取消'
    );
  };

  // 导出 Excel 报告底层函数
  const doExportExcel = (isFrozen: boolean, sample: MeetingSample | null) => {
    const periodLogs = logs.filter(l => l.timestamp >= periodRange.start && l.timestamp < periodRange.end);
    const frozenDateStr = sample ? new Date(sample.frozenAt).toISOString().slice(0, 10) : '';
    const todayStr = new Date().toISOString().slice(0, 10);

    const totalRevVal = isFrozen && sample ? sample.kpis.totalRevenueAndValuePackage : Math.round(waterMetrics.incomeWaterPool);
    const totalRev = isFrozen && sample ? sample.kpis.totalRevenuePackage : Math.round(waterMetrics.revenueWater);
    const totalVal = isFrozen && sample ? sample.kpis.totalValuePackage : Math.round(waterMetrics.valueWater);
    const rigidSalary = isFrozen && sample ? (sample.kpis.rigidSalaryPackage ?? Math.round(waterMetrics.rigidSalaryPackage)) : Math.round(waterMetrics.rigidSalaryPackage);
    const operatingLossVal = isFrozen && sample ? (sample.kpis.operatingLoss ?? Math.round(waterMetrics.operatingLoss)) : Math.round(waterMetrics.operatingLoss);
    const totalBonus = isFrozen && sample ? (sample.kpis.totalBonusPool ?? Math.round(waterMetrics.totalBonusPool)) : Math.round(waterMetrics.totalBonusPool);
    const coordPool = isFrozen && sample ? (sample.kpis.platformCoordinationPool ?? Math.round(waterMetrics.platformCoordinationPool)) : Math.round(waterMetrics.platformCoordinationPool);
    const divPool = isFrozen && sample ? (sample.kpis.dividendPool ?? Math.round(waterMetrics.dividendPool)) : Math.round(waterMetrics.dividendPool);
    const reservoirInflowVal = isFrozen && sample ? (sample.kpis.reservoirInflow ?? Math.round(waterMetrics.reservoirInflow)) : Math.round(waterMetrics.reservoirInflow);
    const totalRigidExpensesVal = isFrozen && sample ? (sample.kpis.totalRigidExpenses ?? Math.round(waterMetrics.totalRigidExpenses)) : Math.round(waterMetrics.totalRigidExpenses);
    const purityVal = isFrozen && sample ? (sample.kpis.globalWeightedPurity ?? Number(globalWeightedPurity.toFixed(1))) : Number(globalWeightedPurity.toFixed(1));

    // 成本脱敏规则：若未开眼 (isCostVisible === false)，成本类数字不显示明文
    const maskCost = (val: number) => isCostVisible ? val : '***';

    const sheetData: (string | number)[][] = [
      ['【城市守护者】经营会务留样与指标报告'],
      [],
      ['报告凭证与基础信息'],
      ['报告类型', isFrozen ? '会务留样 · 仅对生成时刻数据负责' : '未留样 · 即时数据'],
      ['统计时段', `${currentPeriodLabel} (${samplePeriodKey || periodType})`],
      ['数据口径', isFrozen ? '已冻结留样 (只读)' : '实时现算 (动态)'],
      ['留样冻结时间', isFrozen && sample ? new Date(sample.frozenAt).toLocaleString() : '未冻结 (即时生成)'],
      ['经办操作人', isFrozen && sample ? `${sample.frozenByName} (${sample.frozenByUserId})` : `${currentUser.name} (${currentUser.userId || currentUser.id || 'admin'})`],
      ['数据校验摘要', isFrozen && sample ? (sample.checksum || '—') : `流水 ${periodLogs.length} 条 | 收产包 ${totalRevVal} | 收款包 ${totalRev} | 产兑包 ${totalVal}`],
      ['报告导出时间', new Date().toLocaleString()],
      ['合规声明', '本报告参照检测机构留样规范生成，金额均为整数计量，不含币种符号。'],
      [],
      ['核心经营 KPI 汇总表'],
      ['序号', '指标名称', '金额 / 数值', '指标定义及口径说明'],
      [1, '收产包 (Income & Value Package)', totalRevVal, '实收现金流提炼（收款包）与已确权产值提炼（产兑包）总和'],
      [2, '收款包 (Revenue Package)', totalRev, '实收现金流提炼收款包'],
      [3, '产兑包 (Value Conversion Package)', totalVal, '已确权产值提炼产兑包'],
      [4, '刚性保底工资包 (Rigid Salary Package)', maskCost(rigidSalary), '专家保障底薪及硬性人工开支（按月累加）'],
      [5, '运营直接损耗 (Operating Loss)', maskCost(operatingLossVal), 'A/B1/B2/C/D 动态运维消耗总和'],
      [6, '专家收产包冗余奖金池 (Bonus Pool)', totalBonus, '采集专家收产包冗余激励及理论分配池'],
      [7, '平台统筹留用池 (Platform Pool)', coordPool, '已确权收款20%提取与分红沉淀，用于刚性补足与对冲'],
      [8, '分红池纯结余 (Dividend Pool)', divPool, '覆盖成本与承兑后的净盈余沉淀（80%二次分配，20%注入统筹池）'],
      [9, '组织造血对冲能力 (蓄水入库 / 刚性支出)', `${reservoirInflowVal} / ${isCostVisible ? totalRigidExpensesVal : '***'}`, '入库总蓄水对冲刚性底线开支能力比率'],
      [10, '全盘加权含金量 (%)', `${purityVal}%`, '全盘矿山资源与流水加权综合含金量评估']
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    ws['!cols'] = [
      { wch: 8 },
      { wch: 38 },
      { wch: 24 },
      { wch: 54 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, isFrozen ? '会务留样报告' : '即时经营报告');

    const filename = isFrozen
      ? `${currentPeriodLabel}_会务留样报告_${frozenDateStr}.xlsx`
      : `${currentPeriodLabel}_未留样-即时数据报告_${todayStr}.xlsx`;

    XLSX.writeFile(wb, filename);

    showAlert(`报告已成功导出！\n\n文件名：${filename}\n口径：${isFrozen ? '已冻结会务留样' : '未留样 · 即时数据'}`);
  };

  // 导出报告触发处理
  const handleExportReport = () => {
    if (!isSampleSupported) {
      // 半年度 / 年度
      showConfirm(
        `当前所选时段【${currentPeriodLabel}】不支持生成会务留样。\n\n是否导出【未留样 · 即时数据】Excel 经营报告？`,
        () => {
          doExportExcel(false, null);
        },
        undefined,
        '导出即时报告',
        '取消'
      );
      return;
    }

    if (!currentMeetingSample) {
      // 月度 / 季度无留样
      showConfirm(
        `当前时段【${currentPeriodLabel}】尚未生成会务留样。\n\n是否立即导出【未留样 · 即时数据】报告？\n(提示：您也可以先点击「生成会务留样」进行冻结后再导出正式会务留样报告)`,
        () => {
          doExportExcel(false, null);
        },
        undefined,
        '导出即时报告',
        '取消'
      );
      return;
    }

    // 已有留样
    if (sampleViewMode === 'live') {
      showConfirm(
        `当前看板处于【现算模式】，但该期已存在冻结的会务留样。\n\n是否导出该期【已冻结会务留样】报告？`,
        () => {
          doExportExcel(true, currentMeetingSample);
        },
        undefined,
        '导出冻结留样',
        '取消'
      );
    } else {
      doExportExcel(true, currentMeetingSample);
    }
  };

  const funnelData = [
    { name: '收产包', value: waterMetrics.incomeWaterPool, color: '#A855F7', icon: '🌊', precision: 2 },
    { name: '刚性池 (Rigid)', value: waterMetrics.totalRigidExpenses, color: '#1E293B', icon: '⚡', precision: 2 },
    { name: '分红池 (Dividend Pool)', value: waterMetrics.dividendPool, color: '#10B981', icon: '💰', precision: 2 },
    { name: '统筹池 (Coordination)', value: waterMetrics.platformCoordinationPool, color: '#3B82F6', icon: '🛡️', precision: 2 },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4 md:space-y-6 lg:space-y-8 animate-in fade-in duration-700 pb-20 px-4 md:px-6">
      {/* Custom Banner Header - Moved to Top */}
      <div className="bg-[#0f2b46] text-white px-6 md:px-8 py-5 md:py-6 flex flex-col items-center justify-center gap-2 md:gap-4 relative overflow-hidden rounded-[2rem] md:rounded-[3rem] shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>
        
        {/* Title Area */}
        <div className="flex flex-col items-center text-center z-10 w-full">
          <div className="flex flex-col items-center gap-2 mb-2 md:mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl md:text-4xl lg:text-5xl font-black tracking-widest drop-shadow-lg">六元价值循环经营模型</h2>
              <button onClick={() => setShowDefinition(true)} className="text-blue-200 hover:text-white transition-colors">
                <Info size={24} />
              </button>
              <button onClick={toggleCostVisible} className="text-blue-200 hover:text-white transition-colors ml-1" title={isCostVisible ? "点击隐藏成本" : "点击显示成本"}>
                {isCostVisible ? <Eye size={24} /> : <EyeOff size={24} />}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 w-full px-4 md:px-8 mt-2">
            <p className="text-sm md:text-lg lg:text-xl font-medium tracking-[0.1em] md:tracking-[0.2em] text-blue-50 drop-shadow">核心理念：资源循环·动态平衡·可持续发展</p>
          </div>
        </div>
      </div>

      {/* Optimized Header Layout */}
      <div className="bg-white p-4 md:p-5 rounded-[2rem] md:rounded-[3rem] border border-slate-100 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left: Main Stats */}
          <div className="flex items-center gap-6 md:gap-10">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">当前统计周期</span>
              <span className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">{currentPeriodLabel}</span>
            </div>
            <div className="w-px h-10 bg-slate-100 hidden sm:block"></div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">全盘加权含金量</span>
              <span className={`text-xl md:text-2xl font-black tracking-tight ${globalWeightedPurityState.color500}`}>
                {globalWeightedPurity.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Center: Countdown (Integrated) */}
          <div className="hidden xl:flex items-center gap-4 px-6 py-3 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">刚性核减倒计时</span>
              <span className="text-xs font-black text-slate-700 font-mono tracking-tight">每月2日 00:00</span>
            </div>
          </div>

          {/* Right: Period Type Selector */}
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner">
             {(['month', 'quarter', 'half', 'year'] as const).map((p) => (
               <button
                 key={p}
                 onClick={() => setPeriodType(p)}
                 className={`px-4 md:px-6 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all whitespace-nowrap ${
                   periodType === p ? 'bg-white text-slate-900 shadow-md scale-105' : 'text-slate-400 hover:text-slate-600'
                 }`}
               >
                 {p === 'month' ? '月度' : p === 'quarter' ? '季度' : p === 'half' ? '半年度' : '年度'}
               </button>
             ))}
          </div>
        </div>

        {/* Bottom: Period Value Selector & Meeting Sample Controls & System Time */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-4 border-t border-slate-50">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">时段切换</span>
            <div className="flex flex-wrap bg-slate-50 p-1 rounded-xl border border-slate-100">
               {periodOptions.map((opt) => (
                 <button
                   key={opt.value}
                   onClick={() => setPeriodValue(opt.value)}
                   className={`px-3 md:px-4 py-1.5 rounded-lg text-[10px] font-black whitespace-nowrap transition-all ${
                     periodValue === opt.value ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-200'
                   }`}
                 >
                   {opt.label}
                 </button>
               ))}
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2.5 sm:ml-auto">
            {/* 1) 留样状态文案 / 角标 */}
            {isSampleSupported ? (
              currentMeetingSample ? (
                sampleViewMode === 'sample' ? (
                  <div 
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs"
                    title={`冻结时间: ${new Date(currentMeetingSample.frozenAt).toLocaleString()} | 经办人: ${currentMeetingSample.frozenByName} (${currentMeetingSample.frozenByUserId})`}
                  >
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0"></span>
                    <span className="truncate max-w-[260px]">已留样 · 冻结于 {new Date(currentMeetingSample.frozenAt).toLocaleDateString()} {new Date(currentMeetingSample.frozenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {currentMeetingSample.frozenByName}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200 shadow-xs">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0"></span>
                    <span>现算模式 (已有留样)</span>
                  </div>
                )
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200 shadow-xs">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0"></span>
                  <span>现算 · 未留样</span>
                </div>
              )
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black bg-slate-100 text-slate-500 border border-slate-200">
                <span>即时数据 (不支持留样)</span>
              </div>
            )}

            {/* 4) 已留样时：切换「现算 / 留样」 */}
            {isSampleSupported && currentMeetingSample && (
              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-inner">
                <button
                  onClick={() => setSampleViewMode('sample')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-black transition-all ${
                    sampleViewMode === 'sample' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="展示冻结留样数据（会议投影标准口径）"
                >
                  留样 (冻结)
                </button>
                <button
                  onClick={() => setSampleViewMode('live')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-black transition-all ${
                    sampleViewMode === 'live' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="展示实时现算数据"
                >
                  现算 (实时)
                </button>
              </div>
            )}

            {/* 2) 按钮「生成经营快照」（仅 Admin / npcxie） */}
            {canSampleAndExport && isSampleSupported && (
              <button
                onClick={handleGenerateMeetingSample}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black text-white bg-slate-900 hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
                title="参照检测机构留样标准冻结当期看板核心 KPI"
              >
                <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                <span>生成经营快照</span>
              </button>
            )}

            {/* 3) 按钮「导出报告」（仅 Admin / npcxie） */}
            {canSampleAndExport && (
              <button
                onClick={handleExportReport}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 active:scale-95 transition-all shadow-sm"
                title="导出本期 Excel 经营报告"
              >
                <FileSpreadsheet className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>导出报告</span>
              </button>
            )}

            {/* 系统实时同步中 */}
            <div className="flex items-center gap-1.5 ml-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0"></span>
              <span className="text-[10px] font-bold text-slate-400 font-mono italic whitespace-nowrap">
                {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 经营驾驶舱 - 核心指标 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <Card className="p-4 bg-white border-slate-100 shadow-sm rounded-3xl flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">全盘加权含金量</span>
              <button 
                onClick={() => setShowPurityRules(true)}
                className="p-1 hover:bg-slate-100 rounded-full transition-colors"
              >
                <Info className="w-3.5 h-3.5 text-blue-500" />
              </button>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${globalWeightedPurityState.bg} ${globalWeightedPurityState.color}`}>
              {globalWeightedPurityState.label}
            </span>
          </div>
          <div className="flex items-end gap-2">
            <span className={`text-3xl font-black tracking-tighter ${globalWeightedPurityState.color500}`}>{displayGlobalWeightedPurity.toFixed(1)}%</span>
            <span className="text-[10px] font-bold text-slate-400 mb-1">加权平均</span>
          </div>
          <div className="mt-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 ${globalWeightedPurityState.color500.replace('text', 'bg')}`}
              style={{ width: `${displayGlobalWeightedPurity}%` }}
            />
          </div>
        </Card>

        <Card className="p-4 bg-white border-slate-100 shadow-sm rounded-3xl flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">组织造血能力 (对冲)</span>
              <button 
                onClick={() => setShowHedgingRules(true)}
                className="p-1 hover:bg-slate-100 rounded-full transition-colors"
              >
                <Info className="w-3.5 h-3.5 text-slate-300 hover:text-blue-500" />
              </button>
            </div>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              {((displayReservoirInflow / (displayTotalRigidExpenses || 1)) * 100).toFixed(0)}% 对冲
            </span>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-black tracking-tighter text-slate-900">
              <span className="text-lg mr-1 opacity-50"></span>{displayReservoirInflow.toLocaleString()}
            </span>
            <span className="text-[10px] font-bold text-slate-400 mb-1">/ {displayTotalRigidExpenses.toLocaleString()}</span>
          </div>
          <div className="mt-4 h-1.5 bg-slate-100 rounded-full overflow-hidden relative">
            <div 
              className="h-full bg-blue-500 transition-all duration-1000"
              style={{ width: `${Math.min((displayReservoirInflow / (displayTotalRigidExpenses || 1)) * 100, 100)}%` }}
            />
            <div className="absolute top-0 left-[100%] w-px h-full bg-rose-500 z-10" title="盈亏平衡线"></div>
          </div>
          <p className="mt-2 text-[9px] font-bold text-slate-400 italic">离“核心均衡”还有 {Math.max(0, displayReservoirInflow - displayTotalRigidExpenses).toLocaleString()} 额度</p>
        </Card>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 lg:gap-8">
        <div className="lg:col-span-12">
          <div className="bg-white border border-slate-200 rounded-[2rem] md:rounded-[3rem] shadow-sm overflow-hidden">
            {/* Banner was here, moved to top */}

            {/* Definition Drawer */}
            {showDefinition && (
              <div className="fixed inset-0 z-[100] flex justify-end bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowDefinition(false)}>
                <motion.div 
                  initial={{ opacity: 0, x: '100%' }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: '100%' }}
                  transition={{ type: "spring", damping: 25, stiffness: 200 }}
                  className="bg-white shadow-2xl w-full max-w-md h-full overflow-y-auto border-l border-slate-100 flex flex-col"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="p-4 md:p-5 flex-1">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                          <Info className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-slate-900 tracking-tight">六元价值循环定义</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">模型定义</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setShowDefinition(false)}
                        className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
                      >
                        <RefreshCw className="w-4 h-4 rotate-45" />
                      </button>
                    </div>

                    <div className="space-y-3 text-slate-700 text-sm leading-relaxed">
                      {/* 1. 收产包 */}
                      <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-100">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-black text-blue-900 text-sm flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                            1. 收产包 (Income & Value Package)
                          </span>
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-100/80 px-2 py-0.5 rounded-md">源头造血</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          包含<strong className="text-slate-800">收款包</strong>（实收现金流提炼）与<strong className="text-slate-800">产兑包</strong>（已确权产值提炼），是全系统总造血量与资源输入的源头。
                        </p>
                      </div>

                      {/* 2. 刚性池 */}
                      <div className="p-3.5 rounded-2xl bg-rose-50/60 border border-rose-100">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-black text-rose-900 text-sm flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                            2. 刚性池 (Rigid Pool)
                          </span>
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-100/80 px-2 py-0.5 rounded-md">底线保障</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          包含<strong className="text-slate-800">刚性工资包</strong>（保障底薪与硬性人工）与<strong className="text-slate-800">运维损耗</strong>（A/B1动态运维消耗），是系统运营生存的刚性底线成本池。
                        </p>
                      </div>

                      {/* 3. 统筹池 */}
                      <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-100">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-black text-purple-900 text-sm flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                            3. 统筹池 (Coordination Pool)
                          </span>
                          <span className="text-[10px] font-bold text-purple-600 bg-purple-100/80 px-2 py-0.5 rounded-md">风险对冲</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          由<strong className="text-slate-800">已确权收款20%提取</strong>与<strong className="text-slate-800">分红20%循环沉淀</strong>汇集，用于刚性统筹补足、风险备付、跨月对冲及平台基础设施建设。
                        </p>
                      </div>

                      {/* 4. 奖金池 */}
                      <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-black text-emerald-900 text-sm flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            4. 奖金池 (Bonus Pool)
                          </span>
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100/80 px-2 py-0.5 rounded-md">增量激励</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          基于价值创造提炼核算与<strong className="text-slate-800">80%分红盈余二次分配</strong>构成的理论激励分配池，驱动经营单元与专员的增量产出。
                        </p>
                      </div>

                      {/* 5. 承兑池 */}
                      <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-100">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-black text-amber-900 text-sm flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            5. 承兑池 (Acceptance Pool)
                          </span>
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-100/80 px-2 py-0.5 rounded-md">履约兑付</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          奖金计提承兑与权益兑现池，是连接理论激励分配与实际现金兑现的履约中枢与承兑锁存区。
                        </p>
                      </div>

                      {/* 6. 分红池 */}
                      <div className="p-3.5 rounded-2xl bg-violet-50/60 border border-violet-100">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-black text-violet-900 text-sm flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-violet-500"></span>
                            6. 分红池 (Dividend Pool)
                          </span>
                          <span className="text-[10px] font-bold text-violet-600 bg-violet-100/80 px-2 py-0.5 rounded-md">盈余沉淀</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          系统覆盖成本与承兑后的净盈余沉淀池。<strong className="text-slate-800">80%</strong>流向奖金池进行合伙人及核心团队二次分配，<strong className="text-slate-800">20%</strong>循环沉淀至统筹池。
                        </p>
                      </div>

                      {/* 闭环逻辑 */}
                      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-sm mt-4">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-black text-blue-400">🔄 六元闭环流动逻辑</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          资源经由<span className="text-blue-300 font-bold">收产包</span>流入，对冲扣除<span className="text-rose-300 font-bold">刚性池</span>，计提<span className="text-emerald-300 font-bold">奖金池</span>并锁存至<span className="text-amber-300 font-bold">承兑池</span>，净额沉淀至<span className="text-violet-300 font-bold">分红池</span>（80%二次分配，20%注入<span className="text-purple-300 font-bold">统筹池</span>用于刚性补足与对冲），形成自洽可持续的六元价值闭环。
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 pb-6">
                      <button 
                        onClick={() => setShowDefinition(false)}
                        className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
                      >
                        已阅读并理解
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}

            <div className="p-2 md:p-4">
              <style>{`
              @keyframes flow-left {
                0% { background-position: 0 0; }
                100% { background-position: -40px 0; }
              }
              @keyframes flow-right {
                0% { background-position: 0 0; }
                100% { background-position: 40px 0; }
              }
              @keyframes flow-dash {
                to { stroke-dashoffset: -18; }
              }
              .water-pool {
                border-radius: 1rem;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
                position: absolute;
                overflow: hidden;
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                z-index: 10;
                container-type: inline-size;
                /* 极简几何立体感 */
                box-shadow: 
                  0 12px 0 0 rgba(0,0,0,0.2),
                  0 16px 24px rgba(0,0,0,0.3),
                  inset 0 4px 8px rgba(255,255,255,0.5),
                  inset 0 -8px 12px rgba(0,0,0,0.2);
                border: 1px solid rgba(255,255,255,0.4);
              }
              .water-pool:hover {
                transform: translate(-50%, calc(-50% + 6px)) scale(1.02) !important;
                box-shadow: 
                  0 6px 0 0 rgba(0,0,0,0.2),
                  0 8px 12px rgba(0,0,0,0.3),
                  inset 0 4px 8px rgba(255,255,255,0.5),
                  inset 0 -8px 12px rgba(0,0,0,0.2);
                z-index: 20;
              }
              .water-pool::before {
                content: '';
                position: absolute;
                top: 6px; left: 6px; right: 6px; bottom: 6px;
                border-radius: 0.75rem;
                border: 1px solid rgba(255,255,255,0.3);
                pointer-events: none;
              }
              .water-pool::after {
                content: '';
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                border-radius: 1rem;
                background: linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.1) 100%);
                pointer-events: none;
              }
              .flow-line {
                stroke-dasharray: 12, 6;
                animation: flow-dash 1s linear infinite;
              }
            `}</style>
            
            <div className="relative w-full aspect-[10/9] md:aspect-[35/24] bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-8">
              {/* SVG Pipes Background */}
              <svg className="absolute inset-0 w-full h-full z-0">
                <defs>
                  <marker id="arrow-start-gray" markerWidth="24" markerHeight="24" refX="4" refY="12" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 20 4 L 4 12 L 20 20 Z" fill="#94a3b8" />
                  </marker>
                  <marker id="arrow-end-gray" markerWidth="24" markerHeight="24" refX="20" refY="12" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 4 4 L 20 12 L 4 20 Z" fill="#94a3b8" />
                  </marker>
                  <marker id="arrow-start-green" markerWidth="24" markerHeight="24" refX="4" refY="12" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 20 4 L 4 12 L 20 20 Z" fill="#10b981" />
                  </marker>
                  <marker id="arrow-end-green" markerWidth="24" markerHeight="24" refX="20" refY="12" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 4 4 L 20 12 L 4 20 Z" fill="#10b981" />
                  </marker>
                  <marker id="arrow-start-blue" markerWidth="24" markerHeight="24" refX="4" refY="12" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 20 4 L 4 12 L 20 20 Z" fill="#3b82f6" />
                  </marker>
                  <marker id="arrow-end-blue" markerWidth="24" markerHeight="24" refX="20" refY="12" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 4 4 L 20 12 L 4 20 Z" fill="#3b82f6" />
                  </marker>
                  <marker id="arrow-start-purple" markerWidth="24" markerHeight="24" refX="4" refY="12" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 20 4 L 4 12 L 20 20 Z" fill="#8b5cf6" />
                  </marker>
                  <marker id="arrow-end-purple" markerWidth="24" markerHeight="24" refX="20" refY="12" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 4 4 L 20 12 L 4 20 Z" fill="#8b5cf6" />
                  </marker>
                  <marker id="arrow-end-red" markerWidth="24" markerHeight="24" refX="20" refY="12" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 4 4 L 20 12 L 4 20 Z" fill="#f43f5e" />
                  </marker>
                  <marker id="arrow-end-yellow" markerWidth="24" markerHeight="24" refX="20" refY="12" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 4 4 L 20 12 L 4 20 Z" fill="#f59e0b" />
                  </marker>
                </defs>

                {/* Helper for Double-Layer Pipe */}
                {/* 
                  Usage: <DoublePipe x1 y1 x2 y2 label? />
                  For simplicity, I will inline the logic.
                */}

                {/* 1. 收产包 -> 刚性池 (资源流向) */}
                <g className="pipe-group">
                  <line x1="30%" y1="25%" x2="68%" y2="25%" stroke="#eab308" strokeWidth="12" strokeLinecap="round" />
                  <line x1="30%" y1="25%" x2="68%" y2="25%" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" className="flow-line" markerStart="url(#arrow-end-blue)" markerEnd="url(#arrow-end-blue)" />
                </g>

                {/* 2. 收产包 -> 统筹池 (营收风险提成) */}
                <g className="pipe-group">
                  <line x1="18%" y1="35%" x2="18%" y2="55%" stroke="#eab308" strokeWidth="12" strokeLinecap="round" />
                  <line x1="18%" y1="55%" x2="32%" y2="55%" stroke="#eab308" strokeWidth="12" strokeLinecap="round" />
                  
                  <line x1="18%" y1="35%" x2="18%" y2="55%" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" className="flow-line" markerStart="url(#arrow-end-blue)" markerEnd="url(#arrow-end-blue)" />
                  <line x1="18%" y1="55%" x2="32%" y2="55%" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" className="flow-line" markerEnd="url(#arrow-end-blue)" />
                </g>

                {/* 3. 刚性池 -> 奖金池 (理论分配) */}
                <g className="pipe-group">
                  <line x1="82%" y1="35%" x2="82%" y2="50%" stroke="#eab308" strokeWidth="12" strokeLinecap="round" />
                  <line x1="82%" y1="35%" x2="82%" y2="50%" stroke="#f43f5e" strokeWidth="4" strokeLinecap="round" className="flow-line" markerStart="url(#arrow-end-red)" markerEnd="url(#arrow-end-red)" />
                </g>

                {/* 4. 奖金池 -> 承兑池 (计提承兑) */}
                <g className="pipe-group">
                  <line x1="82%" y1="60%" x2="82%" y2="80%" stroke="#eab308" strokeWidth="12" strokeLinecap="round" />
                  <line x1="82%" y1="60%" x2="82%" y2="80%" stroke="#10b981" strokeWidth="4" strokeLinecap="round" className="flow-line" markerStart="url(#arrow-end-green)" markerEnd="url(#arrow-end-green)" />
                </g>

                {/* 5. 承兑池 -> 分红池 (沉淀盈余) */}
                <g className="pipe-group">
                  <line x1="70%" y1="87%" x2="30%" y2="87%" stroke="#eab308" strokeWidth="12" strokeLinecap="round" />
                  <line x1="70%" y1="87%" x2="30%" y2="87%" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" className="flow-line" markerEnd="url(#arrow-end-yellow)" />
                </g>

                {/* 6. 分红池 -> 统筹池 (20% 二次循环) */}
                <g className="pipe-group">
                  <line x1="18%" y1="77%" x2="18%" y2="55%" stroke="#eab308" strokeWidth="12" strokeLinecap="round" />
                  <line x1="18%" y1="55%" x2="32%" y2="55%" stroke="#eab308" strokeWidth="12" strokeLinecap="round" />
                  
                  <line x1="18%" y1="77%" x2="18%" y2="55%" stroke="#a855f7" strokeWidth="4" strokeLinecap="round" className="flow-line" markerStart="url(#arrow-end-purple)" markerEnd="url(#arrow-end-purple)" />
                  <line x1="18%" y1="55%" x2="32%" y2="55%" stroke="#a855f7" strokeWidth="4" strokeLinecap="round" className="flow-line" markerEnd="url(#arrow-end-purple)" />
                </g>

                {/* 7. 统筹池 -> 刚性池 (统筹补足) */}
                <g className="pipe-group">
                  <line x1="44%" y1="47%" x2="44%" y2="25%" stroke="#eab308" strokeWidth="12" strokeLinecap="round" />
                  <line x1="44%" y1="25%" x2="70%" y2="25%" stroke="#eab308" strokeWidth="12" strokeLinecap="round" />
                  
                  <line x1="44%" y1="47%" x2="44%" y2="25%" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" className="flow-line" markerStart="url(#arrow-end-blue)" markerEnd="url(#arrow-end-blue)" />
                  <line x1="44%" y1="25%" x2="70%" y2="25%" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" className="flow-line" markerEnd="url(#arrow-end-blue)" />
                </g>

                {/* 8. 分红池 -> 奖金池 (盈余二次分配) */}
                <g className="pipe-group">
                  {/* Background pipe */}
                  <line x1="30%" y1="82%" x2="68%" y2="82%" stroke="#eab308" strokeWidth="12" strokeLinecap="round" />
                  <line x1="68%" y1="82%" x2="68%" y2="55%" stroke="#eab308" strokeWidth="12" strokeLinecap="round" />
                  <line x1="68%" y1="55%" x2="70%" y2="55%" stroke="#eab308" strokeWidth="12" strokeLinecap="round" />
                  
                  {/* Flowing pipe */}
                  <line x1="30%" y1="82%" x2="68%" y2="82%" stroke="#10b981" strokeWidth="4" strokeLinecap="round" className="flow-line" />
                  <line x1="68%" y1="82%" x2="68%" y2="55%" stroke="#10b981" strokeWidth="4" strokeLinecap="round" className="flow-line" />
                  <line x1="68%" y1="55%" x2="70%" y2="55%" stroke="#10b981" strokeWidth="4" strokeLinecap="round" className="flow-line" markerEnd="url(#arrow-end-green)" />
                </g>
              </svg>

              {/* 统筹池 (Center-Left) */}
              <div className="water-pool text-white shadow-lg w-[24%] h-32" style={{ background: 'linear-gradient(135deg, #a855f7, #7e22ce)', left: '44%', top: '55%', transform: 'translate(-50%, -50%)', animationDelay: '-1s' }}>
                <div className="absolute inset-0 bg-white/10 animate-pulse"></div>
                <h4 className="text-[10px] font-black mb-1 relative z-10 drop-shadow-md leading-none whitespace-nowrap">统筹池</h4>
                <div className="text-[10px] font-black font-mono relative z-10 drop-shadow-md leading-none">{displayPlatformCoordinationPool.toLocaleString()}</div>
              </div>

              {/* 1. 收产包 (Top Left) */}
              <div className="water-pool text-white shadow-lg w-[24%] h-36" style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', left: '18%', top: '25%', transform: 'translate(-50%, -50%)', animationDelay: '0s' }}>
                <div className="absolute inset-0 bg-white/10 animate-pulse"></div>
                <h4 className="text-[10px] font-black mb-0.5 relative z-10 drop-shadow-md leading-none">收产包</h4>
                <div className="text-[10px] font-black font-mono relative z-10 drop-shadow-md border-b border-blue-400/50 pb-0.5 mb-1 w-[95%] leading-none text-center">{displayIncomeWaterPool.toLocaleString()}</div>
                <div className="grid grid-cols-2 gap-1 relative z-10 w-[95%] text-[8px] md:text-[9px]">
                  <div className="bg-amber-500/20 px-1 py-0.5 rounded flex flex-col items-center">
                    <span className="font-bold">收款包</span>
                    <span className="font-mono">{displayRevenueWater.toLocaleString()}</span>
                  </div>
                  <div className="bg-emerald-500/20 px-1 py-0.5 rounded flex flex-col items-center">
                    <span className="font-bold">产兑包</span>
                    <span className="font-mono">{displayValueWater.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* 2. 刚性池 (Top Right) */}
              {(() => {
                const operatingLoss = displayOperatingLoss;
                const totalRigid = displayTotalRigidExpenses + operatingLoss;
                return (
                  <div 
                    className="water-pool text-white shadow-lg w-[28%] h-36 cursor-pointer group" 
                    style={{ background: 'linear-gradient(135deg, #f43f5e, #be123c)', left: '82%', top: '25%', transform: 'translate(-50%, -50%)', animationDelay: '-2s' }}
                    onClick={() => onSwitchTab?.('consumption')}
                  >
                    <div className="absolute inset-0 bg-white/10 animate-pulse"></div>
                    <h4 className="text-[10px] font-black mb-0.5 relative z-10 drop-shadow-md leading-none">刚性池</h4>
                    <div className="text-[10px] font-black font-mono relative z-10 drop-shadow-md border-b border-rose-400/50 pb-0.5 mb-1 w-[90%] leading-none text-center">
                      {maskMoney(totalRigid)}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-1 relative z-10 w-[95%] text-[8px] md:text-[9px]">
                      <div className="bg-rose-400/20 px-1 py-0.5 rounded flex flex-col items-center">
                        <span className="font-bold truncate w-full text-center">👤刚性包</span>
                        <span className="font-mono">{maskMoney(displayTotalRigidExpenses)}</span>
                      </div>
                      <div className="bg-rose-400/20 px-1 py-0.5 rounded flex flex-col items-center group/loss relative" title="运维损耗池">
                        <span className="font-bold truncate w-full text-center">📉损耗</span>
                        <span className="font-mono">{maskMoney(operatingLoss)}</span>
                        
                        {/* Tooltip for breakdown */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 p-2 bg-slate-800 text-white text-[9px] rounded-lg shadow-2xl opacity-0 group-hover/loss:opacity-100 transition-all duration-200 pointer-events-none z-50 border border-slate-700 backdrop-blur-md">
                          <div className="text-[10px] font-black border-b border-slate-600 mb-1 pb-1 text-rose-400">损耗明细</div>
                          <div className="flex justify-between w-full mb-0.5"><span>A消耗:</span> <span className="font-mono">{maskMoney(waterMetrics.aCosts)}</span></div>
                          <div className="flex justify-between w-full mb-0.5"><span>B1消耗:</span> <span className="font-mono">{maskMoney(waterMetrics.b1Costs)}</span></div>
                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45 border-r border-b border-slate-700"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 3. 奖金池 (Middle Right) */}
              <div className="water-pool text-white shadow-lg w-[24%] h-32" style={{ background: 'linear-gradient(135deg, #10b981, #047857)', left: '82%', top: '55%', transform: 'translate(-50%, -50%)', animationDelay: '-3s' }}>
                <div className="absolute inset-0 bg-white/10 animate-pulse"></div>
                <h4 className="text-[10px] font-black mb-1 relative z-10 drop-shadow-md leading-none">奖金池</h4>
                <div className="text-[10px] font-black font-mono relative z-10 drop-shadow-md leading-none">{displayTotalBonusPool.toLocaleString()}</div>
              </div>

              {/* 4. 承兑池 (Bottom Right) */}
              <div className="water-pool text-white shadow-lg w-[24%] h-32" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', left: '82%', top: '85%', transform: 'translate(-50%, -50%)', animationDelay: '-4s' }}>
                <div className="absolute inset-0 bg-white/10 animate-pulse"></div>
                <h4 className="text-[10px] font-black mb-1 relative z-10 drop-shadow-md leading-none">承兑池</h4>
                <div className="text-[10px] font-black font-mono relative z-10 drop-shadow-md leading-none">{displayTotalBonusPool.toLocaleString()}</div>
              </div>

              {/* 5. 分红池 (Bottom Left) */}
              <div className="water-pool text-white shadow-lg w-[24%] h-32" style={{ background: 'linear-gradient(135deg, #a855f7, #7e22ce)', left: '18%', top: '85%', transform: 'translate(-50%, -50%)', animationDelay: '-6s' }}>
                <div className="absolute inset-0 bg-white/10 animate-pulse"></div>
                <h4 className="text-[10px] font-black mb-1 relative z-10 drop-shadow-md leading-none">分红池</h4>
                <div className="text-[10px] font-black font-mono relative z-10 drop-shadow-md border-b border-white/20 pb-0.5 mb-1 w-[90%] leading-none text-center">
                  {displayDividendPool.toLocaleString()}
                </div>
                <div className={`text-[8px] font-bold ${waterMetrics.fhctzCost > 0 ? 'text-amber-300' : 'text-white/40'} relative z-10 uppercase tracking-tighter`}>
                  {`统筹补足(fhctz): ${waterMetrics.fhctzCost.toLocaleString()}`}
                </div>
              </div>

              <svg className="absolute inset-0 w-full h-full z-50 pointer-events-none">
                <text x="18%" y="42%" fill="#3b82f6" fontSize="10" fontWeight="black" textAnchor="middle" className="drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">20% 已确权收款</text>
                <text x="82%" y="42%" fill="#10b981" fontSize="10" fontWeight="black" textAnchor="middle" className="drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">奖金理论分配</text>
                <text x="82%" y="72%" fill="#f59e0b" fontSize="10" fontWeight="black" textAnchor="middle" className="drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">计提承兑</text>
                <text x="56%" y="22%" fill="#3b82f6" fontSize="10" fontWeight="black" textAnchor="middle" className="drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">统筹补足</text>
                <text x="50%" y="91%" fill="#a855f7" fontSize="9" fontWeight="black" textAnchor="middle" className="drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">沉淀盈余</text>
                <text x="18%" y="62%" fill="#3b82f6" fontSize="10" fontWeight="black" textAnchor="middle" className="drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">20% 循环</text>
                <text x="44%" y="80%" fill="#10b981" fontSize="9" fontWeight="black" textAnchor="middle" className="drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">80% 盈余二次分配</text>
              </svg>
            </div>

            <div className="mt-6 p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
               <div className="w-full">
                  <div className="flex items-center justify-between mb-3">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">经营单元效率看板</p>
                     <span className="text-[8px] px-2 py-0.5 bg-rose-100 text-rose-600 rounded font-black uppercase">锁定周期</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                     {salaryByCenter.map(c => (
                       <div key={c.name} className="bg-white p-4 rounded-2xl border border-slate-200 hover:border-blue-400 transition-all shadow-sm hover:shadow-md space-y-3">
                          <div className="flex justify-between items-start">
                            <div className="flex flex-col">
                              <span className="text-[11px] font-black text-slate-900 truncate max-w-[120px]">{c.name}</span>
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">经营单元</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] font-black font-mono text-slate-700 block">{maskMoney(Math.round(c.value))}</span>
                              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">月刚性工资包</span>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2 border-t border-slate-50">
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] text-slate-500">产值初限</span>
                              <span className="text-[9px] font-bold text-slate-700">{Math.round(c.valueLimit).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] text-slate-500">收款初限</span>
                              <span className="text-[9px] font-bold text-slate-700">{Math.round(c.revenueLimit).toLocaleString()}</span>
                            </div>
                          </div>

                          <div className="p-2.5 bg-blue-50/50 rounded-xl border border-blue-100/50 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-black text-blue-800 tracking-tight">经营单元本级</span>
                              <div className="flex gap-1">
                                 <span className="w-1 h-1 rounded-full bg-blue-400"></span>
                                 <span className="w-1 h-1 rounded-full bg-blue-200"></span>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1">
                                  <span className="text-[8px] text-blue-600 font-bold">产值计提 (5%)</span>
                                  <InfoTip 
                                    title="产值计提 (5%)" 
                                    content="产兑包计提 = roundMoney(本笔注入 × C权 × B2权 × 5%)。始终套用 C权 × B2权 对冲系数。"
                                    placement="top"
                                  >
                                    <Info size={10} className="text-blue-300 cursor-help" />
                                  </InfoTip>
                                </div>
                                <span className="text-xs font-black text-blue-900 leading-none mt-1">{Math.round(c.value5Percent).toLocaleString()}</span>
                              </div>
                              <div className="flex flex-col border-l border-blue-100 pl-3">
                                <div className="flex items-center gap-1">
                                  <span className="text-[8px] text-blue-600 font-bold">收款计提 (2%)</span>
                                  <InfoTip 
                                    title="收款计提 (2%)" 
                                    content="收款包计提 = roundMoney(本笔注入 × C权 × 2%)。仅套用 C权 对冲系数。"
                                    placement="top"
                                  >
                                    <Info size={10} className="text-blue-300 cursor-help" />
                                  </InfoTip>
                                </div>
                                <div className="flex items-baseline gap-1.5 mt-1">
                                  <span className="text-xs font-black text-blue-900 leading-none">{Math.round(c.revenue2Percent).toLocaleString()}</span>
                                  {c.revenue2Percent === 0 && (
                                    <span className="text-[7px] font-bold text-blue-400 whitespace-nowrap bg-blue-100/50 px-1 rounded">待确权触发</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                       </div>
                     ))}
                  </div>
               </div>
            </div>

          </div>
        </div>
      </div>

      <Card className="lg:col-span-12 rounded-[2rem] md:rounded-[3.5rem] p-4 md:p-6 overflow-hidden relative border-none shadow-2xl bg-white">
        {/* Background decoration */}
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-blue-50 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-rose-50 rounded-full blur-3xl opacity-50"></div>

        <div className="relative z-10 grid grid-cols-1 xl:grid-cols-12 gap-8 md:gap-12">
          {/* 经营导航 / 资产穿透 */}
          <div className="xl:col-span-12 space-y-6 md:space-y-8">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">经营导航 / 资产穿透</span>
                <div className="h-px flex-1 bg-slate-100"></div>
              </div>
              
              <div className="flex flex-wrap gap-2 overflow-x-auto pb-2 custom-scrollbar">
                <button
                  onClick={() => { setFilterCenter(null); setFilterType(null); setFilterPurity(null); }}
                  className={`px-4 py-2 rounded-full text-[10px] font-black whitespace-nowrap transition-all ${(!filterCenter && !filterType && !filterPurity) ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  全盘资产 ({resources.length})
                </button>
                
                <div className="w-px h-6 bg-slate-200 mx-1 self-center"></div>
                
                {/* 经营单元筛选 */}
                {uniqueCenters.map(center => (
                  <button
                    key={center}
                    onClick={() => setFilterCenter(filterCenter === center ? null : center)}
                    className={`px-4 py-2 rounded-full text-[10px] font-black whitespace-nowrap transition-all ${filterCenter === center ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    {center} ({resources.filter(r => r.assignedTo === center || r.assignedToRevenue === center || r.assignedToValue === center).length})
                  </button>
                ))}

                <div className="w-px h-6 bg-slate-200 mx-1 self-center"></div>

                {/* 提炼类型筛选 */}
                {uniqueTypes.map(type => (
                  <button
                    key={type}
                    onClick={() => setFilterType(filterType === type ? null : type)}
                    className={`px-4 py-2 rounded-full text-[10px] font-black whitespace-nowrap transition-all ${filterType === type ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    {type} ({resources.filter(r => r.types.includes(type as RefineType)).length})
                  </button>
                ))}

                <div className="w-px h-6 bg-slate-200 mx-1 self-center"></div>

                {/* 经营成色筛选 */}
                {['重点监控', '优质预付', '尾款清收', '平稳运营'].map(purity => {
                  const colorClass = 
                    purity === '优质预付' ? 'bg-emerald-600' :
                    purity === '尾款清收' ? 'bg-orange-600' :
                    purity === '平稳运营' ? 'bg-blue-600' :
                    'bg-rose-600';
                  
                  return (
                    <button
                      key={purity}
                      onClick={() => setFilterPurity(filterPurity === purity ? null : purity)}
                      className={`px-4 py-2 rounded-full text-[10px] font-black whitespace-nowrap transition-all ${filterPurity === purity ? `${colorClass} text-white shadow-lg` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                      {purity} ({resources.filter(r => getPurityInfo(r.confirmedRevenue, r.confirmedValue, r.pendingValue, r.valueCapacity).label.includes(purity)).length})
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Card>

              {/* 资产状态监控 (价值动态流) */}
      <div className="lg:col-span-12">
        <div className="bg-white rounded-[2rem] md:rounded-[3rem] border border-slate-100 shadow-xl p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 md:mb-10 gap-6">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter flex items-center">
                <span className="w-10 h-10 md:w-12 md:h-12 bg-emerald-600 rounded-xl md:rounded-2xl flex items-center justify-center text-white text-lg md:text-xl mr-4 md:mr-5 shadow-lg shadow-emerald-200">💎</span>
                {UI_LABELS.VALUE_FLOW}
                <button 
                  onClick={() => setShowPurityRules(true)}
                  className="ml-2 p-1 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <Info className="w-4 h-4 text-slate-300 hover:text-emerald-500 transition-colors" />
                </button>
              </h3>
              
              <div className="flex items-center gap-2">
                <div className="h-8 w-px bg-slate-200 hidden md:block"></div>
                <div className="relative group">
                  <select 
                    value={selectedMiningId}
                    onChange={(e) => setSelectedMiningId(e.target.value)}
                    className="appearance-none bg-slate-50 border-2 border-emerald-100 hover:border-emerald-500 rounded-2xl pl-4 pr-10 py-2.5 text-xs font-black text-emerald-700 outline-none transition-all cursor-pointer shadow-sm hover:shadow-md min-w-[160px]"
                  >
                    <option value="">🎯 全盘资产流转</option>
                    {filteredResources.map(r => (
                      <option key={r.id} value={r.id}>{r.id} | {r.types[0]}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-500">
                    <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 md:gap-4">
              <div className="flex items-center space-x-1.5 md:space-x-2">
                <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-amber-400"></span>
                <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">待确权</span>
              </div>
              <div className="flex items-center space-x-1.5 md:space-x-2">
                <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-emerald-500"></span>
                <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">已确权</span>
              </div>
              <div className="flex items-center space-x-1.5 md:space-x-2">
                <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-rose-500"></span>
                <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">未确权</span>
              </div>
              <div className="flex items-center space-x-1.5 md:space-x-2">
                <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-blue-600"></span>
                <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">入库</span>
              </div>

              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 ml-2">
                <button 
                  onClick={() => setResourceViewMode('card')}
                  className={`p-1.5 rounded-lg transition-all ${resourceViewMode === 'card' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
                  title="卡片视图"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => setResourceViewMode('list')}
                  className={`p-1.5 rounded-lg transition-all ${resourceViewMode === 'list' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
                  title="列表视图"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>

              <button 
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={`p-2 rounded-xl transition-all flex items-center space-x-2 border border-slate-200 hover:bg-slate-50 active:scale-95 ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="刷新确权状态监控数据"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="text-[9px] md:text-[10px] font-black text-slate-600 uppercase tracking-widest">刷新</span>
              </button>
            </div>
          </div>

          {(() => {
            const displayResources = selectedMiningId 
              ? filteredResources.filter(r => r.id === selectedMiningId)
              : filteredResources;

            return resourceViewMode === 'card' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
                {displayResources.map(resource => {
                // 计算未确权产值按接收经营单元的分布 (包含流转中和待确权状态)
                const unconfirmedValueByReceiver: Record<string, number> = {};
                
                // 1. 还在流转中的产值 (待接收方确认)
                const pendingTxs = (transactions || []).filter(t => 
                  t.type === TransactionType.Resource && 
                  t.status === TransactionStatus.PendingTarget && 
                  t.miningId === resource.id
                );
                pendingTxs.forEach(t => {
                  const receiver = users.find(u => u.id === t.receiverId);
                  const receiverName = receiver?.center || receiver?.name || '未知';
                  const shortName = receiverName.replace('中心', '');
                  unconfirmedValueByReceiver[shortName] = (unconfirmedValueByReceiver[shortName] || 0) + (t.valueAmount || 0);
                });

                // 2. 已接收但处于“待确权”状态的产值 (联动确权注入的积分)
                const pendingLogs = logs.filter(l => 
                  l.miningId === resource.id && 
                  l.category === RefineCategory.Value && 
                  l.status === AuditStatus.Pending
                );
                pendingLogs.forEach(l => {
                  const collector = users.find(u => u.id === l.recordedCollectorId);
                  const centerName = collector?.center || collector?.name || '未知';
                  const shortName = centerName.replace('中心', '');
                  unconfirmedValueByReceiver[shortName] = (unconfirmedValueByReceiver[shortName] || 0) + (l.amount || 0);
                });

                const q = resourceQuadrants.get(resource.id)!;
                const purityInfo = getPurityInfo(q.revenue.confirmed, q.value.confirmed, q.value.pending, q.value.capacity);

                return (
                  <div key={resource.id} className="bg-slate-50 rounded-[2.5rem] p-5 border border-slate-100 hover:shadow-2xl transition-all duration-500 group relative overflow-hidden">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="text-lg font-black text-slate-900 tracking-tight">{resource.id}</h4>
                          <div className={`px-2 py-0.5 rounded-full text-[8px] font-black flex items-center space-x-1 ${purityInfo.bg} ${purityInfo.color} border border-current/10 shadow-sm`}>
                            <span>{purityInfo.icon}</span>
                            <span>{purityInfo.label}</span>
                          </div>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{resource.types.join(' / ')}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${resource.status === '入库' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                        {resource.status}
                      </span>
                    </div>

                    <div className="space-y-4">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 flex justify-between items-center">
                        <span>未确权产值分布</span>
                      </div>
                      {Object.entries(unconfirmedValueByReceiver).map(([receiver, amount]) => (
                        <div key={receiver} className="flex justify-between text-[10px] font-bold">
                          <span className="text-slate-600">{receiver}</span>
                          <span className="text-rose-600">{amount.toLocaleString()}</span>
                        </div>
                      ))}
                      {Object.keys(unconfirmedValueByReceiver).length === 0 && (
                        <div className="text-[10px] text-slate-400 italic">暂无未确权产值</div>
                      )}
                    </div>

                    <div className="space-y-6 mt-6 pt-6 border-t border-slate-200/60">
                      {/* 收款 */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[10px] font-black text-yellow-700 uppercase tracking-widest"> {UI_LABELS.REVENUE}</span>
                          <span className="text-[9px] font-bold text-slate-400">款当: {q.revenue.capacity.toLocaleString()}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-white p-3 rounded-2xl border border-slate-200">
                            <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.PENDING}</p>
                            <p className="text-sm font-black text-amber-600 font-mono">{q.revenue.pending.toLocaleString()}</p>
                          </div>
                          <div className="bg-white p-3 rounded-2xl border border-slate-200">
                            <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.CONFIRMED}</p>
                            <p className="text-sm font-black text-emerald-600 font-mono">{q.revenue.confirmed.toLocaleString()}</p>
                          </div>
                          <div className="bg-white p-3 rounded-2xl border border-slate-200 relative">
                            <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.UNCONFIRMED}</p>
                            <p className="text-sm font-black text-rose-600 font-mono">{q.revenue.unconfirmed.toLocaleString()}</p>
                          </div>
                          <div className="bg-white p-3 rounded-2xl border border-slate-200">
                            <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.MINED}</p>
                            <p className="text-sm font-black text-blue-600 font-mono">{q.revenue.mined.toLocaleString()}</p>
                          </div>
                        </div>
                      </div>

                      {/* 价值转化缺口 */}
                      <div className="flex items-center justify-center py-1 bg-slate-100/50 rounded-xl border border-dashed border-slate-200">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          价值转化缺口: <span className={q.value.confirmed > q.revenue.confirmed ? 'text-rose-500' : 'text-emerald-500'}>
                            {(q.value.confirmed - q.revenue.confirmed).toLocaleString()}
                          </span>
                        </span>
                      </div>

                      {/* 产值 */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest"> {UI_LABELS.VALUE}</span>
                          <span className="text-[9px] font-bold text-slate-400">产当: {q.value.capacity.toLocaleString()}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-white p-3 rounded-2xl border border-slate-200">
                            <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.PENDING}</p>
                            <p className="text-sm font-black text-amber-600 font-mono">{q.value.pending.toLocaleString()}</p>
                          </div>
                          <div className="bg-white p-3 rounded-2xl border border-slate-200">
                            <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.CONFIRMED}</p>
                            <p className={`text-sm font-black font-mono ${purityInfo.isRed ? 'text-rose-600' : 'text-emerald-600'}`}>{q.value.confirmed.toLocaleString()}</p>
                          </div>
                          <div className="bg-white p-3 rounded-2xl border border-slate-200 relative">
                            <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.UNCONFIRMED}</p>
                            <p className="text-sm font-black text-rose-600 font-mono">{q.value.unconfirmed.toLocaleString()}</p>
                          </div>
                          <div className="bg-white p-3 rounded-2xl border border-slate-200">
                            <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.MINED}</p>
                            <p className="text-sm font-black text-blue-600 font-mono">{q.value.mined.toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto bg-slate-50 rounded-[2rem] border border-slate-100">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">矿山</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">经营成色</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{UI_LABELS.VALUE}流 (待/已/未/入)</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{UI_LABELS.REVENUE}流 (待/已/未/入)</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">转化缺口</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {displayResources.map(resource => {
                    const q = resourceQuadrants.get(resource.id)!;
                    const purityInfo = getPurityInfo(q.revenue.confirmed, q.value.confirmed, q.value.pending, q.value.capacity);
                    return (
                      <tr key={resource.id} 
                          onClick={() => setSelectedMiningId(resource.id)}
                          className={`border-b border-slate-100 hover:bg-white transition-colors group cursor-pointer ${selectedMiningId === resource.id ? 'bg-emerald-50/50' : ''}`}>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-black text-slate-900">{resource.id}</span>
                            <span className="text-[9px] font-bold text-slate-400">{resource.types[0]}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-black ${purityInfo.bg} ${purityInfo.color}`}>
                            <span>{purityInfo.icon}</span>
                            <span>{purityInfo.label}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2">
                             <span className="text-xs font-black text-amber-500 font-mono">{q.value.pending.toLocaleString()}</span>
                             <span className="text-slate-200">/</span>
                             <span className="text-xs font-black text-emerald-600 font-mono">{q.value.confirmed.toLocaleString()}</span>
                             <span className="text-slate-200">/</span>
                             <span className="text-xs font-black font-mono text-slate-400">{q.value.unconfirmed.toLocaleString()}</span>
                             <span className="text-slate-200">/</span>
                             <span className="text-xs font-black text-blue-600 font-mono">{q.value.mined.toLocaleString()}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2">
                             <span className="text-xs font-black text-amber-500 font-mono">{q.revenue.pending.toLocaleString()}</span>
                             <span className="text-slate-200">/</span>
                             <span className="text-xs font-black text-emerald-600 font-mono">{q.revenue.confirmed.toLocaleString()}</span>
                             <span className="text-slate-200">/</span>
                             <span className="text-xs font-black text-slate-400 font-mono">{q.revenue.unconfirmed.toLocaleString()}</span>
                             <span className="text-slate-200">/</span>
                             <span className="text-xs font-black text-blue-600 font-mono">{q.revenue.mined.toLocaleString()}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-xs font-black font-mono ${q.value.confirmed > q.revenue.confirmed ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {(q.value.confirmed - q.revenue.confirmed).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${resource.status === '入库' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                            {resource.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )})()}
        </div>
      </div>

      </div>
      {/* 经营规则说明书 Drawer */}
      {showPurityRules && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="bg-white shadow-2xl w-full max-w-md h-full overflow-y-auto border-l border-slate-100 flex flex-col"
          >
            <div className="p-4 md:p-5 flex-1">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                    <Info className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">经营规则说明书</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">经营成色规则</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowPurityRules(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
                >
                  <RefreshCw className="w-4 h-4 rotate-45" />
                </button>
              </div>

              <div className="space-y-4">
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-4 bg-blue-600 rounded-full" />
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">核心计算公式</h4>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <span className="text-xs font-bold text-slate-400">全盘加权含金量 =</span>
                      <div className="flex flex-col items-center">
                        <span className="text-lg font-black text-slate-900 border-b-2 border-slate-300 pb-1 px-4">Σ(各项目已确权收款)</span>
                        <span className="text-lg font-black text-slate-900 pt-1 px-4">Σ(各项目已确权产值)</span>
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-4 bg-blue-600 rounded-full" />
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">{PURITY_RULES.title}</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Object.values(PURITY_RULES).filter(v => typeof v === 'object').map((rule: any, idx) => (
                      <div key={idx} className={`p-4 rounded-2xl bg-${rule.color}-50 border border-${rule.color}-100`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-3 h-3 rounded-full bg-${rule.color}-500`} />
                          <span className={`text-xs font-black text-${rule.color}-700`}>{rule.icon} {rule.label}</span>
                        </div>
                        <p className={`text-[10px] font-bold text-${rule.color}-600/80 leading-relaxed`}>
                          {rule.condition}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="mt-8">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-4 bg-indigo-600 rounded-full" />
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">{LINKED_CONFIRMATION_RULES.title}</h4>
                  </div>
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <span className="text-xs font-black text-blue-700">{LINKED_CONFIRMATION_RULES.autoConversion.title}</span>
                      </div>
                      <p className="text-[10px] font-bold text-blue-600/80 leading-relaxed">
                        {LINKED_CONFIRMATION_RULES.autoConversion.description}<br/>
                        {LINKED_CONFIRMATION_RULES.autoConversion.formula}<br/>
                        <span className="text-rose-500">* {LINKED_CONFIRMATION_RULES.autoConversion.boundaryCondition}</span>
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full bg-indigo-500" />
                        <span className="text-xs font-black text-indigo-700">{LINKED_CONFIRMATION_RULES.warehousing.title}</span>
                      </div>
                      <p className="text-[10px] font-bold text-indigo-600/80 leading-relaxed">
                        {LINKED_CONFIRMATION_RULES.warehousing.description}
                      </p>
                    </div>
                  </div>
                </section>
              </div>

              <div className="mt-6">
                <button 
                  onClick={() => setShowPurityRules(false)}
                  className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
                >
                  已阅读并理解经营规则
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* 组织造血能力说明书 Drawer */}
      {showHedgingRules && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="bg-white shadow-2xl w-full max-w-md h-full overflow-y-auto border-l border-slate-100 flex flex-col"
          >
            <div className="p-4 md:p-5 flex-1">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                    <Info className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">组织造血能力说明书</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">对冲规则</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowHedgingRules(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
                >
                  <RefreshCw className="w-4 h-4 rotate-45" />
                </button>
              </div>

              <div className="space-y-4">
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-4 bg-blue-600 rounded-full" />
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">核心计算公式</h4>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <span className="text-xs font-bold text-slate-400">对冲率 =</span>
                      <div className="flex flex-col items-center">
                        <span className="text-lg font-black text-slate-900 border-b-2 border-slate-300 pb-1 px-4">平台统筹流出</span>
                        <span className="text-lg font-black text-slate-900 pt-1 px-4">刚性包总额</span>
                      </div>
                      <span className="text-xs font-bold text-slate-400 mt-2">* 100%</span>
                    </div>
                  </div>
                </section>

                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-4 bg-blue-600 rounded-full" />
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">规则定义</h4>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <span className="text-xs font-black text-blue-700">意义</span>
                      </div>
                      <p className="text-[10px] font-bold text-blue-600/80 leading-relaxed">
                        衡量经营单元不依赖统筹池输血的自我维持能力。
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full bg-rose-500" />
                        <span className="text-xs font-black text-rose-700">警戒</span>
                      </div>
                      <p className="text-[10px] font-bold text-rose-600/80 leading-relaxed">
                        对冲率 {'<'} 100% 将触发“核减区”预警。
                      </p>
                    </div>
                  </div>
                </section>
              </div>

              <div className="mt-6 pb-6">
                <button 
                  onClick={() => setShowHedgingRules(false)}
                  className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
                >
                  已阅读并理解对冲规则
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* 城市守护者统一站内弹窗 */}
      <CityGuardianModal state={modalState} onClose={closeModal} />
    </div>
  );
};

export default Dashboard;
