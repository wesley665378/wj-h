import { UI_TOKENS } from '../src/constants/uiTokens';
import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { TIER_COEFFICIENTS } from "../src/constants/coefficients";
import { calculateBonusAllocation, calculateBonusAllocationForMonths, isExpertCategory, aggregateUserMonthMetrics } from "../src/utils/bonusAllocation";
import { isCenterManagerUser, centerMatch } from "../src/utils/centerScope";
import { parseCenterList, businessUnitLabelsEqual } from "../src/utils/purification";
import { getUserSalaryByMonth } from "../src/utils/business";
import { isSalaryActiveForMonth } from "../src/utils/employmentStatus";
import { UI_LABELS } from '../src/constants/uiLabels';
import { resolveLogBusinessMonth, getLocalMonthString, getLocalDateString, resolveLogBusinessDate, isDateInRange, getMonthsBetween } from "../src/utils/dateUtils";
import { formatAmount, formatRatio, formatPercent } from "../src/utils/formatters";
import { InfoTip } from "../src/components/InfoTip";
import { CostPrivacyToggle } from "../src/components/CostPrivacyToggle";
import { BusinessDateFilter } from "../src/components/BusinessDateFilter";
import { fetchDistributionData } from "../src/api/distribution";
import { createCdtzRecord, fetchCdtzRecords } from "../src/api/cdtz";
import { toast } from "sonner";
import {
  ValueCreationLog,
  AuditStatus,
  User,
  RefineCategory,
  InternalTransaction,
  MiningResource,
  Role,
  TransactionStatus,
  TransactionType,
  RefineType,
  AcceptanceRecord,
  SystemConfig,
} from "../types";
import { XLSX, exportWorkbook, buildExcelFilename } from "../src/utils/excelIo";
import { canExportExcel, getExportButtonTitle, EXPORT_DISABLED_TOOLTIP } from "../src/utils/accessControl";
import { CityGuardianModal, useCityGuardianModal } from "../src/components/CityGuardianModal";
import { useCostPrivacy } from "../src/hooks/useCostPrivacy";
import { SealedDividendTable } from "../src/components/SealedDividendTable";
import {
  TrendingUp,
  Wallet,
  ShieldCheck,
  ArrowRight,
  Info,
  ChevronDown,
  ChevronUp,
  Calculator,
  Coins,
  Eye,
  EyeOff,
  History,
  CheckCircle,
  FileSpreadsheet,
  Search,
  Lock,
  Unlock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

interface DistributionProps {
  logs: ValueCreationLog[];
  users: User[];
  currentUser: User;
  transactions: InternalTransaction[];
  resources: MiningResource[];
  onSubmitTransaction?: (tx: InternalTransaction) => void;
  acceptanceRecords?: AcceptanceRecord[];
  systemConfig?: SystemConfig;
}

interface BonusCalculation {
  userId: string;
  userName: string;
  category: string;

  // 已确权 (Confirmed)
  confirmedValueConfirmed: number;
  bCostConfirmed: number;
  b2CostConfirmed: number;
  aCostConfirmed: number;
  confirmedGoldConfirmed: number;
  baseValueConfirmed: number;
  netBonusConfirmed: number;
  isBreakthroughConfirmed: boolean;
  gapToBreakthroughConfirmed: number;
  paymentMatchRateConfirmed: number;

  // 入库 (Approved)
  confirmedValueApproved: number;
  bCostApproved: number;
  b2CostApproved: number;
  aCostApproved: number;
  confirmedGoldApproved: number;
  baseValueApproved: number;
  netBonusApproved: number;
  isBreakthroughApproved: boolean;
  gapToBreakthroughApproved: number;
  paymentMatchRateApproved: number;

  // 年度累计 (Yearly Cumulative)
  yearlyIncomeApproved: number;
  yearlyIncomeConfirmed: number;
  yearlyBonusApproved: number;

  salaryPackage: number;
  costPackage?: number;
  totalCost?: number;
  nonEffectiveDeductionConfirmed?: number;
  nonEffectiveDeductionApproved?: number;
  historyDebt?: number;
  currentSurplus?: number;
  netRedundancy?: number;
  nextDebt?: number;
  ratio?: number;
  historyDebtConfirmed?: number;
  historyDebtApproved?: number;
  currentSurplusConfirmed?: number;
  currentSurplusApproved?: number;
  netRedundancyConfirmed?: number;
  netRedundancyApproved?: number;
  nextDebtConfirmed?: number;
  nextDebtApproved?: number;
  historyRecordsConfirmed?: any[];
  historyRecordsApproved?: any[];
  theoreticalBonusConfirmed?: number;
  theoreticalBonusApproved?: number;
  baseValuePending?: number;
  personalIncentiveStatus?: string;
  teamDividendStatus?: string;
  cWeight: number;
  centerLevelBonus?: number;
  theoreticalBonus?: number;
  isRevenueExpert?: boolean;
  isChan?: boolean;
  details: ValueCreationLog[];
}

const fmtAmount = (val: number | undefined | null): string => {
  return formatAmount(val);
};

const fmtDebt = (val: number | undefined | null): string => {
  if (val === undefined || val === null || isNaN(val)) {
    return "0";
  }
  const rounded = Math.round(val);
  if (rounded === 0) {
    return "0";
  }
  return rounded.toLocaleString();
};

const TheoreticalCell: React.FC<{
  isRevenueExpert: boolean;
  theoreticalBonus: number;
  baseAmount?: number;
  expanded: boolean;
  onToggle: () => void;
}> = ({ isRevenueExpert, theoreticalBonus, baseAmount, expanded, onToggle }) => {
  const [selectedTier, setSelectedTier] = useState<'100' | '80' | '60'>('100');
  const base = baseAmount !== undefined ? baseAmount : theoreticalBonus;
  const rounded100 = Math.round(base);
  const rounded80 = Math.round(base * 0.8);
  const rounded60 = Math.round(base * 0.6);

  const displayVal = selectedTier === '100' ? rounded100 : selectedTier === '80' ? rounded80 : rounded60;

  return (
    <div className="flex-1 px-2 py-1 flex flex-col w-full text-right select-none">
      <div className="flex items-center justify-end gap-1.5">
        <select
          value={selectedTier}
          onChange={(e) => {
            e.stopPropagation();
            setSelectedTier(e.target.value as '100' | '80' | '60');
          }}
          className="bg-amber-100/60 hover:bg-amber-100 text-amber-800 text-[10px] font-bold py-0.5 px-1 rounded border border-amber-300 focus:outline-none cursor-pointer"
          title="选择理论额度测算档位 (60% / 80% / 100%)"
        >
          <option value="100">100%</option>
          <option value="80">80%</option>
          <option value="60">60%</option>
        </select>
        <span className="font-mono text-[11px] font-black text-amber-700 min-w-[55px]">
          {fmtAmount(displayVal)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="text-[10px] font-bold text-amber-600/80 hover:text-amber-700 flex items-center gap-0.5 bg-amber-100/40 hover:bg-amber-100 px-1 py-0.5 rounded transition-all"
          title="展开全部档位明细"
        >
          <span>{expanded ? '收起' : '档位'}</span>
          <span className="text-[9px]">{expanded ? '▴' : '▾'}</span>
        </button>
      </div>

      {expanded && (
        <div className="mt-1.5 pt-1.5 border-t border-dashed border-amber-200 text-right flex flex-col gap-1 w-full max-w-[170px] ml-auto">
          <div className="flex justify-between items-center text-[10px] py-0.5 border-b border-[#e5e7eb]">
            <span className="text-slate-400 font-medium">60% 档</span>
            <span className="font-mono font-bold text-amber-700">{fmtAmount(rounded60)}</span>
          </div>
          <div className="flex justify-between items-center text-[10px] py-0.5 border-b border-[#e5e7eb]">
            <span className="text-slate-400 font-medium">80% 档</span>
            <span className="font-mono font-bold text-amber-700">{fmtAmount(rounded80)}</span>
          </div>
          <div className="flex justify-between items-center text-[10px] py-0.5 border-b border-[#e5e7eb]">
            <span className="text-slate-400 font-medium">100% 档</span>
            <span className="font-mono font-bold text-amber-700">{fmtAmount(rounded100)}</span>
          </div>
          <div className="text-[8px] text-slate-400 font-normal italic text-center">
            情景参考，不代表实际发放
          </div>
        </div>
      )}
    </div>
  );
};

const Distribution: React.FC<DistributionProps> = ({
  logs,
  users,
  currentUser,
  transactions,
  resources,
  onSubmitTransaction,
  acceptanceRecords,
  systemConfig,
}) => {
  const canExport = useMemo(() => canExportExcel(currentUser, systemConfig), [currentUser, systemConfig]);
  const { modalState, showAlert, showConfirm, closeModal } = useCityGuardianModal();
  const [activeTab, setActiveTab] = useState<'matrix' | 'sealed'>('matrix');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [sealedUsers, setSealedUsers] = useState<Record<string, boolean>>({});
  const [theoreticalExpanded, setTheoreticalExpanded] = useState<Record<string, boolean>>({});
  const [bonusTarget, setBonusTarget] = useState<BonusCalculation | null>(null);

  const handleToggleSealUser = (userId: string, userName: string) => {
    setSealedUsers(prev => {
      const nextState = !prev[userId];
      if (nextState) {
        toast.success(`已锁定封存 [${userName}] 当期价值分配核算数据`);
      } else {
        toast.info(`已解除 [${userName}] 当期数据锁定`);
      }
      return { ...prev, [userId]: nextState };
    });
  };
  const [bonusForm, setBonusForm] = useState({
    miningId: "",
    category: "收款奖金" as "收款奖金" | "产值奖金" | "分红" | "特别奖金",
    theoreticalAmount: 0,
    amount: 0,
    diffType: "政策调整" as "政策调整" | "绩效扣减" | "误差纠偏" | "其它",
    approvalRef: "",
    description: "",
    diffReason: "",
  });

  const isLocalEmbedded = import.meta.env.VITE_USE_LOCAL_AUTH === 'true';

  const canRegisterPayout = useMemo(() => {
    if (!currentUser) return false;
    const role = currentUser.role as string;
    const cat = currentUser.category || "";
    const sRoles = currentUser.secondaryRoles || [];

    // Admin, npcxie
    if (role === Role.Admin || role === "admin") return true;
    if (role === Role.npcxie || role === "npcxie") return true;

    // Allowed specific categories / secondary roles: 经管员高款专, 经管员高产专, 高款专, 高产专
    const allowedExact = ['经管员高款专', '经管员高产专', '高款专', '高产专'];
    if (allowedExact.includes(cat)) return true;
    if (sRoles.some(r => allowedExact.includes(r))) return true;

    return false;
  }, [currentUser]);

  const handleOpenBonus = (data: BonusCalculation) => {
    const theoretical = data.netBonusConfirmed || 0;
    setBonusTarget(data);
    setBonusForm({
      miningId: resources[0]?.id || "",
      category: data.isRevenueExpert ? "收款奖金" : "产值奖金",
      theoreticalAmount: theoretical,
      amount: theoretical,
      diffType: "政策调整",
      approvalRef: "",
      description: "",
      diffReason: "",
    });
  };

  const handleBonusSubmit = async () => {
    if (!bonusTarget) return;
    if (!bonusForm.amount || bonusForm.amount <= 0) {
      showAlert("请输入有效的发放数值");
      return;
    }

    const diff = bonusForm.amount - bonusForm.theoreticalAmount;
    if (Math.abs(diff) > 0.01 && !bonusForm.diffReason.trim()) {
      showAlert("发放数值与理论数值不一致时，必须填写差异说明");
      return;
    }

    showConfirm(
      `确定确认提交奖金发放？\n\n【人员】${bonusTarget.userName} (${bonusTarget.category})\n【类别】${bonusForm.category}\n【实际发放数值】${fmtAmount(bonusForm.amount)}`,
      async () => {
        const newRecord: AcceptanceRecord = {
          id: `ACC-${Date.now()}`,
          userId: bonusTarget.userId,
          userName: bonusTarget.userName,
          category: bonusForm.category,
          miningId: bonusForm.miningId || undefined,
          theoreticalAmount: bonusForm.theoreticalAmount,
          amount: bonusForm.amount,
          diffType: bonusForm.diffType,
          diffReason: bonusForm.diffReason,
          approvalRef: bonusForm.approvalRef,
          description: bonusForm.description,
          timestamp: Date.now(),
          month: filterMonth || getLocalMonthString(),
          businessDate: getLocalDateString(),
          status: '已承兑',
          operatorId: currentUser.id
        };

        try {
          await createCdtzRecord(newRecord);
          showAlert(`已成功写入承兑台账 cdtz！\n\n【人员】${bonusTarget.userName}\n【类别】${bonusForm.category}\n【实际发放】${fmtAmount(bonusForm.amount)}`);
          toast.success(`已成功写入承兑台账 cdtz！对 [${bonusTarget.userName}] 的 ${bonusForm.category} 发放：${fmtAmount(bonusForm.amount)}`);
          loadDistribution();
          loadLocalCdtz();
        } catch (err) {
          showAlert("写入承兑台账 cdtz 失败，请重试");
          return;
        }

        setBonusTarget(null);
      }
    );
  };

  const [filterMonth, setFilterMonth] = useState<string>(() => getLocalMonthString()); // 默认当月
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const monthsInRange = useMemo(() => {
    if (startDate && endDate) {
      return getMonthsBetween(startDate, endDate);
    }
    if (filterMonth) {
      return [filterMonth];
    }
    return [getLocalMonthString()];
  }, [startDate, endDate, filterMonth]);

  const effectiveMonth = useMemo(() => {
    if (startDate) return startDate.slice(0, 7);
    return filterMonth || getLocalMonthString();
  }, [filterMonth, startDate]);

  const [serverDistribution, setServerDistribution] = useState<any[] | null>(null);
  const [distributionLoading, setDistributionLoading] = useState<boolean>(false);
  const [distributionError, setDistributionError] = useState<string | null>(null);
  const [localCdtzRecords, setLocalCdtzRecords] = useState<AcceptanceRecord[]>([]);

  const loadLocalCdtz = () => {
    fetchCdtzRecords()
      .then(res => {
        if (res && Array.isArray(res.records)) {
          setLocalCdtzRecords(res.records);
        }
      })
      .catch(err => {
        console.error("加载 local cdtz 失败:", err);
      });
  };

  const loadDistribution = () => {
    if (isLocalEmbedded) {
      setServerDistribution([]);
      setDistributionLoading(false);
      setDistributionError(null);
      return;
    }

    setDistributionLoading(true);
    setDistributionError(null);
    fetchDistributionData(effectiveMonth)
      .then(res => {
        if (res && Array.isArray(res.distribution)) {
          setServerDistribution(res.distribution);
        } else {
          setDistributionError("获取的分配数据格式不正确");
          showAlert("获取的分配数据格式不正确");
        }
      })
      .catch(err => {
        setDistributionError("无法加载分配数据");
        showAlert("无法加载分配数据");
      })
      .finally(() => {
        setDistributionLoading(false);
      });
  };

  useEffect(() => {
    loadDistribution();
    loadLocalCdtz();
  }, [effectiveMonth, isLocalEmbedded]);

  const { isCostVisible, toggleCostVisible, maskMoney, maskText } = useCostPrivacy();
  const toggleCostVisibility = toggleCostVisible;

  const C_WEIGHT = TIER_COEFFICIENTS.BASE_LOSS; // 系统默认 C 对冲权重

  const distributionData = useMemo(() => {
    const getFirstPass = () => {
      // 本地嵌入式（isLocalEmbedded 为 true）或多月份自定义查询动态聚合
      const currentYear = effectiveMonth
        ? effectiveMonth.split("-")[0]
        : new Date().getFullYear().toString();

      const logsByUserYearly = new Map<string, ValueCreationLog[]>();
      const logsByUserMonthly = new Map<string, ValueCreationLog[]>();

      (logs || []).forEach((log) => {
        if (
          log.status !== AuditStatus.Confirmed &&
          log.status !== AuditStatus.Approved
        )
          return;

        const collectorId = log.recordedCollectorId || "";
        const logMonth = resolveLogBusinessMonth(log);
        const logDate = resolveLogBusinessDate(log);

        const matches = startDate && endDate
          ? isDateInRange(logDate, startDate, endDate)
          : monthsInRange.includes(logMonth);

        if (matches) {
          if (!logsByUserMonthly.has(collectorId)) {
            logsByUserMonthly.set(collectorId, []);
          }
          logsByUserMonthly.get(collectorId)!.push(log);
        }

        if (logMonth.startsWith(currentYear)) {
          if (!logsByUserYearly.has(collectorId)) {
            logsByUserYearly.set(collectorId, []);
          }
          logsByUserYearly.get(collectorId)!.push(log);
        }
      });

      return users
        .filter((u) => {
          if (!monthsInRange.some(m => isSalaryActiveForMonth(u, m))) return false;
          const cat = u.category || "";
          const sRoles = u.secondaryRoles || [];

          const isExpert =
            cat.includes("款专") || cat.includes("产专") || isCenterManagerUser(u);
          const hasExpertSecondaryRole = sRoles.some(
            (r) => r.includes("款专") || r.includes("产专"),
          );

          return isExpert || hasExpertSecondaryRole;
        })
        .map((user) => {
          const userLogsMonthly = logsByUserMonthly.get(user.id) || [];
          const userLogsYearly = logsByUserYearly.get(user.id) || [];

          // 1. 刚性工资多月份动态累加：Total Salary = sum_{i=1}^M Salary_i
          const salaryPackage = monthsInRange.reduce((sum, m) => {
            return sum + (isSalaryActiveForMonth(user, m) ? getUserSalaryByMonth(user, m) : 0);
          }, 0);

          const isRevenueExpert = (user.category || "").includes("款专");
          const isChanExpert = (user.category || "").includes("产专");
          const isChan = isChanExpert || user.category === "经管员高产专";

          // 2. 消耗与收产包跨 M 个月动态累加
          let confRevenue = 0;
          let confProduction = 0;
          let confACost = 0;
          let confB1Cost = 0;
          let confB2Cost = 0;
          let confCCost = 0;
          let confDCost = 0;
          let confNonEff = 0;

          let appRevenue = 0;
          let appProduction = 0;
          let appACost = 0;
          let appB1Cost = 0;
          let appB2Cost = 0;
          let appCCost = 0;
          let appDCost = 0;
          let appNonEff = 0;

          for (const m of monthsInRange) {
            const cM = aggregateUserMonthMetrics(logs || [], user, m, resources || [], users || [], [AuditStatus.Confirmed]);
            confRevenue += cM.revenuePackage;
            confProduction += cM.productionPackage;
            confACost += cM.aCost;
            confB1Cost += cM.b1Cost;
            confB2Cost += cM.b2Cost;
            confCCost += cM.cCost;
            confDCost += cM.dCost;
            confNonEff += cM.nonEffectiveDeduction;

            const aM = aggregateUserMonthMetrics(logs || [], user, m, resources || [], users || [], [AuditStatus.Approved]);
            appRevenue += aM.revenuePackage;
            appProduction += aM.productionPackage;
            appACost += aM.aCost;
            appB1Cost += aM.b1Cost;
            appB2Cost += aM.b2Cost;
            appCCost += aM.cCost;
            appDCost += aM.dCost;
            appNonEff += aM.nonEffectiveDeduction;
          }

          const baseValueConfirmedStr = isChan ? confProduction : confRevenue;
          const baseValueApprovedStr = isChan ? appProduction : appRevenue;

          let yearlyBaseValConfirmed = 0;
          let yearlyBaseValApproved = 0;
          let pendingBaseVal = 0;
          
          for (const m of monthsInRange) {
            const pendingMetrics = aggregateUserMonthMetrics(logs || [], user, m, resources || [], users || [], [AuditStatus.Pending]);
            pendingBaseVal += isChan ? pendingMetrics.productionPackage : pendingMetrics.revenuePackage;
          }

          let yearlySalaryPackage = 0;
          if (effectiveMonth) {
            const [y, m] = effectiveMonth.split("-").map(Number);
            for (let mIdx = 1; mIdx <= m; mIdx++) {
              const mStr = `${y}-${String(mIdx).padStart(2, "0")}`;
              if (isSalaryActiveForMonth(user, mStr)) {
                yearlySalaryPackage += getUserSalaryByMonth(user, mStr);
              }
            }
          }

          const yearlyMonths = Array.from(new Set(userLogsYearly.map(l => resolveLogBusinessMonth(l))));
          for (const m of yearlyMonths) {
            const mConf = aggregateUserMonthMetrics(userLogsYearly, user, m, resources || [], users || [], [AuditStatus.Confirmed]);
            const mApp = aggregateUserMonthMetrics(userLogsYearly, user, m, resources || [], users || [], [AuditStatus.Approved]);
            yearlyBaseValConfirmed += (isChan ? mConf.productionPackage : mConf.revenuePackage);
            yearlyBaseValApproved += (isChan ? mApp.productionPackage : mApp.revenuePackage);
          }

          let historyDebt = 0;
          let currentSurplus = 0;
          let netRedundancy = 0;
          let nextDebt = 0;
          let theoreticalBonus = 0;

          let historyDebtConfirmed = 0;
          let nextDebtConfirmed = 0;
          let currentSurplusConfirmed = 0;
          let netRedundancyConfirmed = 0;
          
          let historyDebtApproved = 0;
          let nextDebtApproved = 0;
          let currentSurplusApproved = 0;
          let netRedundancyApproved = 0;

          let historyRecordsConfirmed: any[] = [];
          let historyRecordsApproved: any[] = [];

          let netBonusApprovedVal = 0;
          let netBonusConfirmedVal = 0;

          let ratioVal = 0;
          let theoreticalBonusConfirmedVal = 0;
          let theoreticalBonusApprovedVal = 0;
          let yearlyBonusApprovedVal = 0;

          const allocConfirmed = calculateBonusAllocationForMonths(
              monthsInRange,
              user,
              logs || [],
              resources || [],
              users || [],
              AuditStatus.Confirmed
          );

          const allocApproved = calculateBonusAllocationForMonths(
              monthsInRange,
              user,
              logs || [],
              resources || [],
              users || [],
              AuditStatus.Approved
          );

          if (allocConfirmed.ratio > 0 || allocApproved.ratio > 0) {
              historyDebtConfirmed = allocConfirmed.history > 0 ? -allocConfirmed.history : 0;
              currentSurplusConfirmed = allocConfirmed.current;
              netRedundancyConfirmed = allocConfirmed.quota;
              nextDebtConfirmed = allocConfirmed.newDebt;

              historyDebtApproved = allocApproved.history > 0 ? -allocApproved.history : 0;
              currentSurplusApproved = allocApproved.current;
              netRedundancyApproved = allocApproved.quota;
              nextDebtApproved = allocApproved.newDebt;
              
              historyRecordsConfirmed = allocConfirmed.historyRecords;
              historyRecordsApproved = allocApproved.historyRecords;

              historyDebt = historyDebtConfirmed;
              currentSurplus = currentSurplusConfirmed;
              netRedundancy = netRedundancyConfirmed;
              nextDebt = nextDebtConfirmed;
              theoreticalBonus = allocConfirmed.theoreticalBonus;
          }

          netBonusConfirmedVal = allocConfirmed.ratio > 0 ? allocConfirmed.theoreticalBonus : 0;
          netBonusApprovedVal = allocApproved.ratio > 0 ? allocApproved.theoreticalBonus : 0;

          ratioVal = allocConfirmed.ratio;
          theoreticalBonusConfirmedVal = allocConfirmed.theoreticalBonus;
          theoreticalBonusApprovedVal = allocApproved.theoreticalBonus;
          yearlyBonusApprovedVal = yearlyBaseValApproved * allocApproved.ratio;

          const userObj = users.find((u) => u.id === user.id);
          const userCenter = userObj?.center || "";

          let centerLevelBonus = 0;
          if (user.category === "经管员高款专" || user.category === "经管员高产专") {
            centerLevelBonus = (resources || [])
              .filter((r) => centerMatch(r.assignedTo, userCenter))
              .reduce((sum, r) => sum + (r.incentiveOutput5 || 0) + (r.incentiveCollection2 || 0), 0);
          }

          const serverItem = (!isLocalEmbedded && serverDistribution) 
            ? serverDistribution.find((d: any) => d.userId === user.id)
            : null;

          // 远程模式支持读取 API 的 nonEffectiveDeduction、totalCost、historyDebt；同时本地有精确保底
          const serverConfNonEff = serverItem?.confirmed?.nonEffectiveDeduction ?? serverItem?.nonEffectiveDeduction;
          const serverAppNonEff = serverItem?.approved?.nonEffectiveDeduction ?? serverItem?.nonEffectiveDeduction;
          const effectiveConfNonEff = serverConfNonEff !== undefined ? serverConfNonEff : confNonEff;
          const effectiveAppNonEff = serverAppNonEff !== undefined ? serverAppNonEff : appNonEff;

          const costOtherConfirmed = isRevenueExpert ? confACost : confB1Cost;
          const costPackageConfirmed = -(salaryPackage + costOtherConfirmed - effectiveConfNonEff);
          const totalCostConfirmed = Math.abs(costPackageConfirmed);

          const costOtherApproved = isRevenueExpert ? appACost : appB1Cost;
          const costPackageApproved = -(salaryPackage + costOtherApproved - effectiveAppNonEff);
          const totalCostApproved = Math.abs(costPackageApproved);

          return {
            userId: user.id,
            userName: user.name,
            category: user.category || "初级专家",
            isRevenueExpert,
            isChan,
            costPackage: costPackageConfirmed,
            totalCost: totalCostConfirmed,
            nonEffectiveDeductionConfirmed: effectiveConfNonEff,
            nonEffectiveDeductionApproved: effectiveAppNonEff,
            historyDebt,
            currentSurplus,
            netRedundancy,
            nextDebt,
            theoreticalBonus,
            ratio: ratioVal,
            centerLevelBonus,

            historyRecordsConfirmed,
            historyRecordsApproved,
            historyDebtConfirmed,
            historyDebtApproved,
            currentSurplusConfirmed,
            currentSurplusApproved,
            netRedundancyConfirmed,
            netRedundancyApproved,
            theoreticalBonusConfirmed: theoreticalBonusConfirmedVal,
            theoreticalBonusApproved: theoreticalBonusApprovedVal,

            confirmedValueConfirmed: confProduction,
            bCostConfirmed: confB1Cost,
            b2CostConfirmed: confB2Cost,
            aCostConfirmed: confACost,
            confirmedGoldConfirmed: confRevenue,
            baseValueConfirmed: baseValueConfirmedStr,
            netBonusConfirmed: netBonusConfirmedVal,
            isBreakthroughConfirmed: currentSurplus > 0,
            gapToBreakthroughConfirmed: currentSurplus > 0 ? 0 : Math.abs(currentSurplus),
            paymentMatchRateConfirmed: 1,

            confirmedValueApproved: appProduction,
            bCostApproved: appB1Cost,
            b2CostApproved: appB2Cost,
            aCostApproved: appACost,
            confirmedGoldApproved: appRevenue,
            baseValueApproved: baseValueApprovedStr,
            netBonusApproved: netBonusApprovedVal,
            isBreakthroughApproved: currentSurplus > 0,
            gapToBreakthroughApproved: currentSurplus > 0 ? 0 : Math.abs(currentSurplus),
            paymentMatchRateApproved: 1,

            baseValuePending: pendingBaseVal,

            yearlyIncomeApproved: yearlyBaseValApproved,
            yearlyIncomeConfirmed: yearlyBaseValConfirmed,
            yearlyBonusApproved: yearlyBonusApprovedVal,

            cWeight: TIER_COEFFICIENTS.BASE_LOSS,
            salaryPackage,
            details: userLogsMonthly,

            personalIncentiveStatus: currentSurplus > 0 ? "已激活超额价值分享" : "入库任务进行中",
            teamDividendStatus: currentSurplus > 0 ? "已激活超额价值分享" : "入库任务进行中",
          };
        });
    };

    const firstPass = getFirstPass();

    // Second pass to compute/override expert surplus based on accurate theory
    return firstPass.map(data => {
      const cat = data.category || "";
      const isManagerKuan = cat === "经管员高款专";
      const isKuan = cat === "初款专" || cat === "中款专" || cat === "高款专" || isManagerKuan;

      const getIndRedundancy = (uid: string, c: string) => {
        const isChan = (c || "").includes("产专");
        if (isChan) {
          const item = firstPass.find(d => d.userId === uid);
          return item ? (item.netRedundancy || 0) : 0;
        }
        const isRankKuan = c === "中款专" || c === "初款专";
        const rowLogs = (logs || []).filter(
          (l) => l.recordedCollectorId === uid &&
                 (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved) &&
                 (startDate && endDate
                   ? isDateInRange(resolveLogBusinessDate(l), startDate, endDate)
                   : monthsInRange.includes(resolveLogBusinessMonth(l)))
        );
        const rxPoints = rowLogs.filter(l => l.category === RefineCategory.Revenue).reduce((sum, l) => sum + (l.amount || 0), 0);
        return isRankKuan ? rxPoints * 0.02 : 0;
      };

      let redundancy = 0;
      if (isManagerKuan) {
        const managerUser = users.find(u => u.id === data.userId);
        const managerCenter = managerUser?.center || "";
        redundancy = firstPass.reduce((acc, d) => {
          if (d.userId === data.userId) return acc;
          const u = users.find(x => x.id === d.userId);
          if (managerCenter && u?.center !== managerCenter) return acc;
          return acc + getIndRedundancy(d.userId, d.category);
        }, 0);
      }

      const collectionPackage = data.baseValueConfirmed || 0;
      const costOther = data.isRevenueExpert ? (data.aCostConfirmed || 0) : (data.bCostConfirmed || 0);
      const nonEffectiveDeduction = data.nonEffectiveDeductionConfirmed || 0;
      const costPackage = -((data.salaryPackage || 0) + costOther - nonEffectiveDeduction);
      const totalCost = Math.abs(costPackage);
      
      const collection = collectionPackage + redundancy;
      const rawBase = collection + costPackage;
      const currentSurplus = rawBase;
      const historyDebt = data.historyDebtConfirmed ?? data.historyDebt ?? 0;
      const netRedundancy = Math.max(0, currentSurplus + historyDebt);
      const theoreticalBonus = Math.round(netRedundancy * (data.ratio || 0));

      return {
        ...data,
        costPackage,
        totalCost,
        currentSurplus: rawBase,
        currentSurplusConfirmed: rawBase,
        currentSurplusApproved: rawBase,
        netRedundancy,
        netRedundancyConfirmed: netRedundancy,
        netRedundancyApproved: netRedundancy,
        theoreticalBonus,
        theoreticalBonusConfirmed: theoreticalBonus,
        theoreticalBonusApproved: theoreticalBonus,
        netBonusConfirmed: theoreticalBonus,
        netBonusApproved: theoreticalBonus,
      };
    });
  }, [logs, users, resources, effectiveMonth, startDate, endDate, monthsInRange, isLocalEmbedded, distributionLoading, distributionError, serverDistribution]);

  const getRedundancyValue = React.useCallback(
    (userId: string, category: string) => {
      const getIndividualRedundancy = (uid: string, cat: string) => {
        const isChan = (cat || "").includes("产专");
        if (isChan) {
          const item = (distributionData || []).find((d) => d.userId === uid);
          return item ? (item.netRedundancy || 0) : 0;
        }
        const isRankKuan = cat === "中款专" || cat === "初款专";

        const rowLogs = (logs || []).filter(
          (l) =>
            l.recordedCollectorId === uid &&
            (l.status === AuditStatus.Confirmed ||
              l.status === AuditStatus.Approved) &&
            (startDate && endDate
              ? isDateInRange(resolveLogBusinessDate(l), startDate, endDate)
              : monthsInRange.includes(resolveLogBusinessMonth(l))),
        );

        const rxPoints = rowLogs
          .filter((l) => l.category === RefineCategory.Revenue)
          .reduce((sum, l) => sum + (l.amount || 0), 0);
        const kuanContribution = isRankKuan ? rxPoints * 0.02 : 0;

        return kuanContribution;
      };

      const isManager =
        category === "经管员高款专" || category === "经管员高产专";
      if (isManager) {
        const managerUser = users.find(u => u.id === userId);
        const managerCenter = managerUser?.center || "";
        return (distributionData || []).reduce((acc, d) => {
          if (d.userId === userId) return acc;
          const u = users.find(x => x.id === d.userId);
          if (managerCenter && u?.center !== managerCenter) return acc;
          return acc + getIndividualRedundancy(d.userId, d.category);
        }, 0);
      } else {
        return getIndividualRedundancy(userId, category);
      }
    },
    [logs, users, effectiveMonth, startDate, endDate, monthsInRange, distributionData],
  );

  const getKuanTheoreticalTiers = React.useCallback(
    (data: BonusCalculation) => {
      if (!data) return null;
      const cat = data.category || "";
      const isManagerKuan = cat === "经管员高款专";
      const isKuan =
        cat === "初款专" ||
        cat === "中款专" ||
        cat === "高款专" ||
        isManagerKuan;

      if (!isKuan) return null;

      const collectionPackage = data.baseValueConfirmed || 0;
      const nonEffectiveDeduction = data.nonEffectiveDeductionConfirmed || 0;
      const costPackage = -((data.salaryPackage || 0) + (data.isChan ? (data.bCostConfirmed || 0) : (data.aCostConfirmed || 0)) - nonEffectiveDeduction);
      const totalCost = Math.abs(costPackage);
      const redundancy = isManagerKuan
        ? getRedundancyValue(data.userId, cat)
        : 0;

      // 理论基数公式：TheoryBase = max(0, Collection + CostPackage)
      const collection = collectionPackage + redundancy;
      const rawBase = collection + costPackage;
      const base = rawBase < 0 ? 0 : rawBase;

      const t60 = Math.round(base * 0.6);
      const t80 = Math.round(base * 0.8);
      const t100 = Math.round(base * 1.0);

      return {
        t60,
        t80,
        t100,
        base,
        rawBase,
        collectionPackage,
        costPackage,
        totalCost,
        redundancy,
        isManagerKuan,
      };
    },
    [getRedundancyValue],
  );

  const formatCategory = React.useCallback((cat: string) => {
    if (cat === "经管员高款专") return "经管员 ｜ 高款专";
    if (cat === "经管员高产专") return "经管员 ｜ 高产专";
    return cat;
  }, []);

  const totalBonusPoolApproved = useMemo(
    () =>
      distributionData.reduce((acc, curr) => acc + curr.netBonusApproved, 0),
    [distributionData],
  );

  const totalBonusPoolConfirmed = useMemo(
    () =>
      distributionData.reduce((acc, curr) => acc + curr.netBonusConfirmed, 0),
    [distributionData],
  );


  const cdtzList = useMemo(() => {
    const list: AcceptanceRecord[] = [];
    const seen = new Set<string>();

    const addRecords = (arr: AcceptanceRecord[] | undefined) => {
      if (!arr || !Array.isArray(arr)) return;
      for (const r of arr) {
        if (r && r.id && !seen.has(r.id)) {
          seen.add(r.id);
          list.push(r);
        }
      }
    };

    addRecords(localCdtzRecords);
    addRecords(acceptanceRecords);
    return list;
  }, [localCdtzRecords, acceptanceRecords]);

  type DistributionSortField = 'userName' | 'incomePackage' | 'costPackage' | 'totalCost' | 'historyDebt' | 'netRedundancy' | 'theoreticalBonus' | 'currentCdtz' | 'yearlyCdtz';

  const [sortField, setSortField] = useState<DistributionSortField | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);

  const filteredDistributionData = useMemo(() => {
    return distributionData.filter(d => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return d.userName.toLowerCase().includes(q) || String(d.userId).toLowerCase().includes(q);
    });
  }, [distributionData, searchQuery]);

  const sortedDistributionData = useMemo(() => {
    const list = [...filteredDistributionData];
    if (!sortField || !sortOrder) return list;

    const queryYear = startDate ? startDate.slice(0, 4) : (filterMonth ? filterMonth.slice(0, 4) : new Date().getFullYear().toString());

    const getMetricValue = (d: any) => {
      switch (sortField) {
        case 'userName':
          return d.userName || '';
        case 'incomePackage': {
          const kuanTiers = getKuanTheoreticalTiers(d);
          return kuanTiers ? (kuanTiers.collectionPackage + kuanTiers.redundancy) : (d.baseValueConfirmed || 0);
        }
        case 'costPackage':
        case 'totalCost': {
          const costOther = d.isRevenueExpert ? (d.aCostConfirmed || 0) : (d.bCostConfirmed || 0);
          return -((d.salaryPackage || 0) + costOther);
        }
        case 'historyDebt':
          return d.historyDebtConfirmed ?? d.historyDebt ?? 0;
        case 'netRedundancy':
          return d.netRedundancyConfirmed ?? d.netRedundancy ?? 0;
        case 'theoreticalBonus':
          return d.theoreticalBonusConfirmed ?? d.theoreticalBonus ?? 0;
        case 'currentCdtz':
          return cdtzList
            .filter((r) => r.userId === d.userId && monthsInRange.includes(r.month) && r.status === "已承兑")
            .reduce((sum, r) => sum + r.amount, 0);
        case 'yearlyCdtz': {
          const userYearlyCdtzSum = cdtzList
            .filter((r) => r.userId === d.userId && r.status === "已承兑" && r.month.startsWith(queryYear))
            .reduce((sum, r) => sum + r.amount, 0);
          return userYearlyCdtzSum || d.yearlyIncomeConfirmed || 0;
        }
        default:
          return 0;
      }
    };

    list.sort((a, b) => {
      const valA = getMetricValue(a);
      const valB = getMetricValue(b);

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
  }, [filteredDistributionData, sortField, sortOrder, getKuanTheoreticalTiers, cdtzList, monthsInRange, startDate, filterMonth]);

  const handleSort = (field: DistributionSortField) => {
    if (sortField === field || (field === 'costPackage' && sortField === 'totalCost') || (field === 'totalCost' && sortField === 'costPackage')) {
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
      setSortOrder(field === 'userName' ? 'asc' : 'desc');
    }
  };

  const renderSortIcon = (field: DistributionSortField) => {
    const isActive = sortField === field || (field === 'costPackage' && sortField === 'totalCost') || (field === 'totalCost' && sortField === 'costPackage');
    if (!isActive) {
      return <ArrowUpDown className="w-3 h-3 ml-1 text-slate-300 opacity-60 group-hover:opacity-100 group-hover:text-slate-500 transition-opacity shrink-0 inline-block" />;
    }
    if (sortOrder === 'asc') {
      return <ArrowUp className="w-3 h-3 ml-1 text-blue-600 font-bold shrink-0 inline-block" />;
    }
    return <ArrowDown className="w-3 h-3 ml-1 text-blue-600 font-bold shrink-0 inline-block" />;
  };

  const exportToExcel = () => {
    if (!canExport) {
      toast.error(EXPORT_DISABLED_TOOLTIP);
      return;
    }
    const data = filteredDistributionData.map((d) => {
      const yearlyIncomeKey = d.isRevenueExpert
        ? "年度累计收款包"
        : "年度累计产兑包";
      return {
        专家姓名: d.userName,
        职级: d.category,
        已确权产值: formatAmount(d.confirmedValueConfirmed),
        入库产值: formatAmount(d.confirmedValueApproved),
        已确权收款: formatAmount(d.confirmedGoldConfirmed),
        入库收款: formatAmount(d.confirmedGoldApproved),
        产值工资包: formatAmount(d.salaryPackage),
        "即时奖金(确权)": formatAmount(d.netBonusConfirmed),
        "即时奖金(入库)": formatAmount(d.netBonusApproved),
        [yearlyIncomeKey]: formatAmount(d.yearlyIncomeApproved),
        年度累计奖金: formatAmount(d.yearlyBonusApproved),
        状态: d.isBreakthroughApproved
          ? "已突破"
          : `还差 ${formatAmount(d.gapToBreakthroughApproved)} 突破`,
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, ws, "价值分配表");
    exportWorkbook(
      workbook,
      buildExcelFilename("价值分配", effectiveMonth || "全部")
    );
    toast.success("导出成功");
  };

  if (!users || !logs) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <Info size={40} className="text-slate-300" />
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
          正在加载价值分配数据...
        </p>
      </div>
    );
  }

  if (distributionData.length === 0) {
    return (
      <div className="w-full space-y-8 animate-in fade-in duration-700 pb-6 font-sans">
        {/* Header */}
        <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 ${UI_TOKENS.RADIUS_PANEL} shadow-sm border border-slate-300`}>
          <div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-2xl">
                <TrendingUp size={24} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">
                  价值分配
                </h3>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">
                  增量价值激励核算
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className={`bg-white ${UI_TOKENS.RADIUS_PANEL} border border-slate-300 shadow-sm overflow-hidden`}>
          <div className="p-6 md:p-8 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center">
              <Calculator size={16} className="mr-3 text-blue-600" />
              专家价值核算矩阵
            </h4>
            <div className="flex flex-wrap items-center gap-3">
              <BusinessDateFilter 
                month={startDate || endDate ? '' : filterMonth}
                onMonthChange={(m) => {
                  setFilterMonth(m);
                  setStartDate('');
                  setEndDate('');
                }}
                startDate={startDate}
                endDate={endDate}
                onDateRangeChange={(s, e) => {
                  setStartDate(s);
                  setEndDate(e);
                  setFilterMonth('');
                }}
                onClear={() => {
                  setFilterMonth(getLocalMonthString());
                  setStartDate('');
                  setEndDate('');
                }}
              />
              <div className="flex-1 min-w-[200px] relative max-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="搜索姓名或员工编号..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-[13px] font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-400 shadow-xs"
                />
              </div>
              <button
                onClick={exportToExcel}
                disabled={!canExport}
                title={getExportButtonTitle(canExport, '导出分配清单')}
                className={`px-4 py-2 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center shadow-2xs ${
                  !canExport
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                    : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100 cursor-pointer'
                }`}
              >
                <Wallet size={13} className="mr-1.5" />
                导出分配清单
              </button>
            </div>
          </div>
          <div className="px-6 py-12 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest">{UI_LABELS.EMPTY_DEFAULT}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-700 pb-6 font-sans">
      {/* Header */}
      <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 ${UI_TOKENS.RADIUS_PANEL} shadow-sm border border-slate-300`}>
        <div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-2xl">
              <TrendingUp size={24} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">
                价值分配
              </h3>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">
                增量价值激励核算
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black tracking-tight transition-all cursor-pointer ${
              activeTab === 'matrix'
                ? 'bg-slate-900 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            专家价值核算矩阵
          </button>
          <button
            onClick={() => setActiveTab('sealed')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black tracking-tight transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'sealed'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span>封存分红</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${activeTab === 'sealed' ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-200 text-slate-700'}`}>
              已封存
            </span>
          </button>
        </div>
      </div>

      {activeTab === 'sealed' ? (
        <SealedDividendTable logs={logs} users={users} currentUser={currentUser} resources={resources} />
      ) : (
        <>


      <div className={`bg-white ${UI_TOKENS.RADIUS_PANEL} border border-slate-300 shadow-sm overflow-hidden`}>
        <div className="p-6 md:p-8 border-b border-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center">
              <Calculator size={16} className="mr-3 text-blue-600" />
              专家价值核算矩阵
            </h4>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">
              共 {filteredDistributionData.length} 位专家参与分配
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BusinessDateFilter 
              month={startDate || endDate ? '' : filterMonth}
              onMonthChange={(m) => {
                setFilterMonth(m);
                setStartDate('');
                setEndDate('');
              }}
              startDate={startDate}
              endDate={endDate}
              onDateRangeChange={(s, e) => {
                setStartDate(s);
                setEndDate(e);
                setFilterMonth('');
              }}
              onClear={() => {
                setFilterMonth(getLocalMonthString());
                setStartDate('');
                setEndDate('');
              }}
            />
            <div className="flex-1 min-w-[200px] relative max-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="搜索姓名或员工编号..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-[13px] font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-400 shadow-xs"
              />
            </div>
            <button
              onClick={exportToExcel}
              disabled={!canExport}
              title={getExportButtonTitle(canExport, '导出分配清单')}
              className={`px-4 py-2 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center shadow-2xs ${
                !canExport
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                  : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100 cursor-pointer'
              }`}
            >
              <Wallet size={13} className="mr-1.5" />
              导出分配清单
            </button>
          </div>
        </div>

        {/* Table View with Horizontal Scroll */}
        <div className="block overflow-x-auto custom-scrollbar pb-4 relative">
          <table className="w-full text-left border-separate border-spacing-0 border border-slate-300 rounded-xl overflow-hidden table-auto min-w-[1180px]">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-100/90 backdrop-blur-md">
                {/* 1. 采集主体 (Dimension) */}
                <th 
                  onClick={() => handleSort('userName')}
                  className="group border-b border-r border-slate-300 py-1.5 px-3 text-left text-[10px] font-black text-slate-700 uppercase tracking-wider min-w-[140px] cursor-pointer hover:bg-slate-200/80 transition-colors select-none"
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center">
                      采集主体 {renderSortIcon('userName')}
                    </span>
                  </div>
                </th>
                {/* 2. 收产包 (Measure) */}
                <th 
                  onClick={() => handleSort('incomePackage')}
                  className="group border-b border-r border-slate-300 py-1.5 px-3 text-right text-[10px] font-black text-slate-700 uppercase tracking-wider min-w-[110px] cursor-pointer hover:bg-slate-200/80 transition-colors select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="inline-flex items-center">
                      收产包 {renderSortIcon('incomePackage')}
                    </span>
                  </div>
                </th>
                {/* 3. 成本包 */}
                <th 
                  onClick={() => handleSort('costPackage')}
                  className="group border-b border-r border-slate-300 py-1.5 px-3 text-right text-[10px] font-black text-slate-700 uppercase tracking-wider min-w-[120px] cursor-pointer hover:bg-slate-200/80 transition-colors select-none"
                  title="点击按成本包排序"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="inline-flex items-center">
                      成本包 {renderSortIcon('costPackage')}
                    </span>
                    <CostPrivacyToggle size="sm" showLabel={false} />
                    <InfoTip title="成本包口径" content="款专：刚性工资 − FXDC + A类消耗；产专：刚性工资 − FXDC + B1类消耗。强制展示取负。" />
                  </div>
                </th>
                {/* 4. 历史欠产包 */}
                <th 
                  onClick={() => handleSort('historyDebt')}
                  className="group border-b border-r border-slate-300 py-1.5 px-3 text-right text-[10px] font-black text-slate-700 uppercase tracking-wider min-w-[105px] cursor-pointer hover:bg-slate-200/80 transition-colors select-none"
                  title="点击按历史欠产包排序"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="inline-flex items-center">
                      历史欠产包 {renderSortIcon('historyDebt')}
                    </span>
                    <InfoTip title="历史欠产包口径" content="当年 1~M-1 全量滚动，无流水仍计工资，不含当月，负数展示。" />
                  </div>
                </th>
                {/* 5. 分配额度（月） */}
                <th 
                  onClick={() => handleSort('netRedundancy')}
                  className="group border-b border-r border-slate-300 py-1.5 px-3 text-right text-[10px] font-black text-indigo-700 bg-indigo-50/40 uppercase tracking-wider min-w-[115px] cursor-pointer hover:bg-indigo-100/60 transition-colors select-none"
                  title="点击按分配额度排序"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="inline-flex items-center">
                      分配额度（月） {renderSortIcon('netRedundancy')}
                    </span>
                    <InfoTip title="分配额度口径" content="净额度 = max(0, (收产包 + 成本包) + 历史欠产包)（≥0）。" />
                  </div>
                </th>
                {/* 6. 理论（额度） */}
                <th 
                  onClick={() => handleSort('theoreticalBonus')}
                  className="group border-b border-r border-slate-300 py-1.5 px-3 text-right text-[10px] font-black text-amber-700 bg-amber-50/50 uppercase tracking-wider min-w-[135px] cursor-pointer hover:bg-amber-100/60 transition-colors select-none"
                  title="点击按理论额度排序"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="inline-flex items-center">
                      理论（额度） {renderSortIcon('theoreticalBonus')}
                    </span>
                    <InfoTip title="理论（额度）口径" content="基数 = max(0, 收产包 + 成本包)，支持 60% / 80% / 100% 三档管理调节测算切换。" />
                  </div>
                </th>
                {/* 7. 当月承兑实发 */}
                <th 
                  onClick={() => handleSort('currentCdtz')}
                  className="group border-b border-r border-slate-300 py-1.5 px-3 text-right text-[10px] font-black text-emerald-800 bg-emerald-50/50 uppercase tracking-wider min-w-[110px] cursor-pointer hover:bg-emerald-100/60 transition-colors select-none"
                  title="点击按当月承兑实发排序"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="inline-flex items-center">
                      当月承兑实发 {renderSortIcon('currentCdtz')}
                    </span>
                    <InfoTip title="当月承兑实发口径" content="当月在承兑台账 cdtz 中实际已发放的总额。" />
                  </div>
                </th>
                {/* 8. 年度累计承兑 */}
                <th 
                  onClick={() => handleSort('yearlyCdtz')}
                  className="group border-b border-r border-slate-300 py-1.5 px-3 text-right text-[10px] font-black text-slate-700 uppercase tracking-wider min-w-[110px] cursor-pointer hover:bg-slate-200/80 transition-colors select-none"
                  title="点击按年度累计承兑排序"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="inline-flex items-center">
                      年度累计承兑 {renderSortIcon('yearlyCdtz')}
                    </span>
                    <InfoTip title="年度累计承兑口径" content="自然年内累计已承兑实发总额。" />
                  </div>
                </th>
                {/* 9. 操作控制 */}
                <th className="border-b border-slate-300 py-1.5 px-3 text-center text-[10px] font-black text-slate-700 uppercase tracking-wider min-w-[100px]">
                  操作控制
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedDistributionData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-20 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                    没有找到符合条件的专家
                  </td>
                </tr>
              ) : (
                sortedDistributionData.map((data) => {
                  const userObj = users.find((u) => u.id === data.userId);
                  const userCenter = userObj?.center || "";

                  const coll2_Sum = resources
                    .filter(
                      (r) =>
                        r.assignedToRevenue === data.userId ||
                        r.assignedToRevenue === data.userName ||
                        centerMatch(r.assignedToRevenue, userCenter),
                    )
                    .reduce((sum, r) => sum + (r.incentiveCollection2 || 0), 0);

                  const out5_Sum = resources
                    .filter(
                      (r) =>
                        r.assignedToValue === data.userId ||
                        r.assignedToValue === data.userName ||
                        centerMatch(r.assignedToValue, userCenter),
                    )
                    .reduce((sum, r) => sum + (r.incentiveOutput5 || 0), 0);

                  const kuanTiers = getKuanTheoreticalTiers(data);

                  const userCdtzSum = cdtzList
                    .filter((r) => r.userId === data.userId && monthsInRange.includes(r.month) && r.status === "已承兑")
                    .reduce((sum, r) => sum + r.amount, 0);

                  const queryYear = startDate ? startDate.slice(0, 4) : (filterMonth ? filterMonth.slice(0, 4) : new Date().getFullYear().toString());

                  const userYearlyCdtzSum = cdtzList
                    .filter((r) => r.userId === data.userId && r.status === "已承兑" && r.month.startsWith(queryYear))
                    .reduce((sum, r) => sum + r.amount, 0);

                  const costOther = data.isRevenueExpert ? (data.aCostConfirmed || 0) : (data.bCostConfirmed || 0);
                  const nonEffectiveDeduction = data.nonEffectiveDeductionConfirmed || 0;
                  const totalCost = data.costPackage !== undefined ? Math.abs(data.costPackage) : Math.abs((data.salaryPackage || 0) + costOther - nonEffectiveDeduction);

                  return (
                    <React.Fragment key={data.userId}>
                      <tr
                        className={`group/tr hover:bg-slate-50/90 transition-colors ${selectedUser === data.userId ? "bg-blue-50/40" : ""}`}
                      >
                        {/* 1. 采集主体 (Dimension) */}
                        <td className="py-1.5 px-3 border border-slate-300 text-left">
                          <div className="flex flex-col text-left">
                            <span className="text-xs font-bold text-slate-900">{data.userName}</span>
                            <span className="text-[10px] font-medium text-slate-500 font-mono mt-0.5">
                              {formatCategory(data.category)} · {data.userId}
                            </span>
                            {data.category === "经管员高款专" && (
                              <span className="text-[9px] text-indigo-600 font-mono font-medium mt-0.5">
                                单元本级: ¥{fmtAmount(out5_Sum + coll2_Sum)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 2. 收产包 (Measure) */}
                        <td className="py-1.5 px-3 border border-slate-300 text-right whitespace-nowrap">
                          <span className="font-mono text-xs font-black text-slate-900">
                            {fmtAmount(kuanTiers ? (kuanTiers.collectionPackage + kuanTiers.redundancy) : data.baseValueConfirmed)}
                          </span>
                        </td>

                        {/* 3. 成本包 */}
                        <td className="py-1.5 px-3 border border-slate-300 text-right font-mono text-xs font-bold text-rose-600 whitespace-nowrap">
                          <span title={`刚性工资包(${formatAmount(data.salaryPackage)}) + 消耗(${formatAmount(costOther)}) - FXDC(${formatAmount(nonEffectiveDeduction)})`}>
                            {maskMoney(-totalCost, fmtAmount)}
                          </span>
                        </td>

                        {/* 4. 历史欠产包 */}
                        <td className={`py-1.5 px-3 border border-slate-300 text-right font-mono text-xs whitespace-nowrap font-bold ${(data.historyDebtConfirmed ?? 0) < 0 ? 'text-rose-600 bg-rose-50/40' : 'text-slate-800'}`}>
                          {fmtDebt(data.historyDebtConfirmed ?? data.historyDebt)}
                        </td>

                        {/* 5. 分配额度（月） */}
                        <td className="py-1.5 px-3 border border-slate-300 text-right font-mono text-xs font-black text-indigo-600 bg-indigo-50/20 whitespace-nowrap">
                          {fmtAmount(data.netRedundancyConfirmed ?? data.netRedundancy)}
                        </td>

                        {/* 6. 理论（额度） */}
                        <td className="py-1 px-2 border border-slate-300 bg-amber-50/30 text-right">
                          <TheoreticalCell
                            isRevenueExpert={data.isRevenueExpert}
                            theoreticalBonus={data.theoreticalBonusConfirmed}
                            baseAmount={Math.max(0, (data.currentSurplusConfirmed ?? data.currentSurplus))}
                            expanded={!!theoreticalExpanded[`${data.userId}-confirmed`]}
                            onToggle={() => setTheoreticalExpanded(prev => ({
                              ...prev,
                              [`${data.userId}-confirmed`]: !prev[`${data.userId}-confirmed`]
                            }))}
                          />
                        </td>

                        {/* 7. 当月承兑实发 */}
                        <td className="py-1.5 px-3 border border-slate-300 bg-emerald-50/20 text-right whitespace-nowrap">
                          <span className="font-mono text-xs font-black text-emerald-600">
                            {fmtAmount(userCdtzSum)}
                          </span>
                        </td>

                        {/* 8. 年度累计承兑 */}
                        <td className="py-1.5 px-3 border border-slate-300 text-right whitespace-nowrap">
                          <span className="font-mono text-xs font-bold text-slate-700">
                            {fmtAmount(userYearlyCdtzSum || data.yearlyIncomeConfirmed)}
                          </span>
                        </td>

                        {/* 9. 操作控制 */}
                        <td className="py-1.5 px-3 border border-slate-300 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {canRegisterPayout && (
                              <button
                                onClick={() => handleOpenBonus(data)}
                                className="px-2 py-1 bg-emerald-600 text-white rounded text-[10px] font-bold hover:bg-emerald-700 transition-all shadow-2xs flex items-center gap-0.5"
                                title="登记承兑发放"
                              >
                                <Wallet size={11} />
                                <span>发放</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleToggleSealUser(data.userId, data.userName)}
                              className={`px-2 py-1 rounded transition-all flex items-center gap-0.5 text-[10px] font-bold ${
                                sealedUsers[data.userId]
                                  ? "bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                              title={sealedUsers[data.userId] ? "已锁定封存（点击解除）" : "锁定封存当前核算"}
                            >
                              {sealedUsers[data.userId] ? (
                                <>
                                  <Lock size={11} className="text-amber-700" />
                                  <span>已封存</span>
                                </>
                              ) : (
                                <>
                                  <Lock size={11} />
                                  <span>封存</span>
                                </>
                              )}
                            </button>
                            <button
                              onClick={() =>
                                setSelectedUser(
                                  selectedUser === data.userId ? null : data.userId
                                )
                              }
                              className={`px-2 py-1 rounded transition-all flex items-center gap-0.5 text-[10px] font-bold ${
                                selectedUser === data.userId
                                  ? "bg-blue-600 text-white shadow-2xs"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              {selectedUser === data.userId ? (
                                <>
                                  <ChevronUp size={11} />
                                  <span>收起</span>
                                </>
                              ) : (
                                <>
                                  <ChevronDown size={11} />
                                  <span>明细</span>
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Drill-down Detail: 8-Row Standard Financial Audit Table */}
                      <AnimatePresence>
                        {selectedUser === data.userId && (
                          <motion.tr
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="bg-slate-50/90 border-b border-slate-300"
                          >
                            <td colSpan={9} className="p-4">
                              <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden mb-4">
                                <div className="px-4 py-2 bg-slate-100 border-b border-slate-300 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Calculator size={14} className="text-blue-600" />
                                    <h5 className="text-[11px] font-black text-slate-900 uppercase tracking-wider">
                                      标准 8 行价值分配穿透审计表 · {data.userName} ({formatCategory(data.category)})
                                    </h5>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleToggleSealUser(data.userId, data.userName)}
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-all ${
                                        sealedUsers[data.userId]
                                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                                          : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                                      }`}
                                    >
                                      <Lock size={11} />
                                      <span>{sealedUsers[data.userId] ? "当期已锁定封存" : "锁定封存"}</span>
                                    </button>
                                    <span className="text-[10px] font-mono text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded font-bold">
                                      周期：{startDate && endDate ? `${startDate} ~ ${endDate}` : (monthsInRange.length > 1 ? `${monthsInRange[0]} ~ ${monthsInRange[monthsInRange.length - 1]} (共 ${monthsInRange.length} 个月)` : (effectiveMonth || '全期'))}
                                    </span>
                                  </div>
                                </div>

                                <div className="divide-y divide-slate-200 text-xs">
                                  {/* 1. 收产包 */}
                                  <div className="px-4 py-1.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-2">
                                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-mono font-bold text-[10px] flex items-center justify-center">1</span>
                                      <span className="font-bold text-slate-800">收产包</span>
                                      <span className="text-[10px] text-slate-400">（确权收款/产值包，计算自实际业务流水）</span>
                                    </div>
                                    <span className="font-mono font-black text-indigo-600 text-xs">
                                      {fmtAmount(kuanTiers ? kuanTiers.collectionPackage : data.baseValueConfirmed)}
                                    </span>
                                  </div>

                                  {/* 2. 经营单元本级 */}
                                  <div className="px-4 py-1.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-2">
                                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-mono font-bold text-[10px] flex items-center justify-center">2</span>
                                      <span className="font-bold text-slate-800">经营单元本级</span>
                                      <span className="text-[10px] text-slate-400">（名下经营单元本级包归集 / 单元冗余）</span>
                                    </div>
                                    <span className="font-mono font-bold text-blue-600 text-xs">
                                      {fmtAmount(kuanTiers ? kuanTiers.redundancy : (data.centerLevelBonus || 0))}
                                    </span>
                                  </div>

                                  {/* 3. 成本包 */}
                                  <div className="px-4 py-1.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-2">
                                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-mono font-bold text-[10px] flex items-center justify-center">3</span>
                                      <span className="font-bold text-slate-800">成本包</span>
                                      <span className="text-[10px] text-slate-400">
                                        {maskText(`（刚性工资包${monthsInRange.length > 1 ? `(${monthsInRange.length}个月累计)` : ''} ¥${formatAmount(data.salaryPackage)} + 消耗 ¥${formatAmount(costOther)} − FXDC ¥${formatAmount(nonEffectiveDeduction)}，强制取负展示）`)}
                                      </span>
                                    </div>
                                    <span className="font-mono font-bold text-rose-600 text-xs">
                                      {maskMoney(-totalCost, fmtAmount)}
                                    </span>
                                  </div>

                                  {/* 4. 历史欠产包 */}
                                  <div className="px-4 py-1.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-2">
                                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-mono font-bold text-[10px] flex items-center justify-center">4</span>
                                      <span className="font-bold text-slate-800">历史欠产包</span>
                                      <span className="text-[10px] text-slate-400">（查询区间起始点前滚动历史负债累积，每年 1 月清零）</span>
                                    </div>
                                    <span className={`font-mono font-bold text-xs ${(data.historyDebtConfirmed ?? data.historyDebt) < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                                      {fmtDebt(data.historyDebtConfirmed ?? data.historyDebt)}
                                    </span>
                                  </div>

                                  {/* 5. 当期结余 */}
                                  <div className="px-4 py-1.5 flex items-center justify-between bg-slate-50/70 hover:bg-slate-100/70 transition-colors font-medium">
                                    <div className="flex items-center gap-2">
                                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-mono font-bold text-[10px] flex items-center justify-center">5</span>
                                      <span className="font-bold text-slate-900">{monthsInRange.length > 1 ? '多月累计结余' : '当月结余'}</span>
                                      <span className="text-[10px] text-slate-500">（收入 − 成本 = (收产包 + 单元本级) − 成本包）</span>
                                    </div>
                                    <span className={`font-mono font-black text-xs ${data.currentSurplus < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                                      {fmtAmount(data.currentSurplus)}
                                    </span>
                                  </div>

                                  {/* 6. 理论额度（三档） */}
                                  <div className="px-4 py-1.5 flex items-center justify-between bg-amber-50/40 hover:bg-amber-50/70 transition-colors">
                                    <div className="flex items-center gap-2">
                                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-mono font-bold text-[10px] flex items-center justify-center">6</span>
                                      <span className="font-bold text-amber-900">理论额度（三档）</span>
                                      <span className="text-[10px] text-amber-700/80">（基数 max(0, 结余) × 60% / 80% / 100% 阶梯矩阵）</span>
                                    </div>
                                    <div className="flex items-center gap-2 font-mono font-bold text-xs text-amber-800">
                                      <span className="text-[10px] bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">60%: {fmtAmount(Math.round(Math.max(0, data.currentSurplus) * 0.6))}</span>
                                      <span className="text-[10px] bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">80%: {fmtAmount(Math.round(Math.max(0, data.currentSurplus) * 0.8))}</span>
                                      <span className="text-[10px] bg-amber-200/80 text-amber-900 font-black px-1.5 py-0.5 rounded border border-amber-300">100%: {fmtAmount(Math.round(Math.max(0, data.currentSurplus)))}</span>
                                    </div>
                                  </div>

                                  {/* 7. 分配额度 */}
                                  <div className="px-4 py-1.5 flex items-center justify-between bg-indigo-50/40 hover:bg-indigo-50/70 transition-colors">
                                    <div className="flex items-center gap-2">
                                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-mono font-bold text-[10px] flex items-center justify-center">7</span>
                                      <span className="font-bold text-indigo-950">分配额度（净额度）</span>
                                      <span className="text-[10px] text-indigo-600/80">（填平历史欠产后额度 = max(0, 结余 + 历史欠产包)）</span>
                                    </div>
                                    <span className="font-mono font-black text-indigo-700 text-sm">{fmtAmount(data.netRedundancy)}</span>
                                  </div>

                                  {/* 8. 理论分配值 / 承兑实发 */}
                                  <div className="px-4 py-2 flex items-center justify-between bg-emerald-50/50 hover:bg-emerald-50/80 transition-colors">
                                    <div className="flex items-center gap-2">
                                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-mono font-bold text-[10px] flex items-center justify-center">8</span>
                                      <span className="font-bold text-emerald-950">理论分配值 / 承兑实发</span>
                                      <span className="text-[10px] text-emerald-700">（理论值 = 分配额度 × 提成率 {(data.ratio * 100).toFixed(0)}%；承兑实发 = 当期 cdtz 实发）</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="text-right">
                                        <span className="text-[10px] text-slate-400 block">理论应发</span>
                                        <span className="font-mono font-bold text-slate-800 text-xs">{fmtAmount(data.theoreticalBonus)}</span>
                                      </div>
                                      <div className="h-6 w-px bg-slate-300 mx-1"></div>
                                      <div className="text-right">
                                        <span className="text-[10px] text-emerald-600 font-bold block">承兑实发</span>
                                        <span className="font-mono font-black text-emerald-600 text-sm">{fmtAmount(userCdtzSum)}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Secondary Collapsible Cards: Logs & Historical Records */}
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Log Details */}
                                <div className="bg-white rounded-xl border border-slate-300 p-4 shadow-xs">
                                  <h6 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center mb-2">
                                    <TrendingUp size={13} className="mr-1.5 text-emerald-600" />
                                    关联确权记录明细 ({data.details?.length || 0} 笔)
                                  </h6>
                                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                                    {(data.details || []).length === 0 ? (
                                      <div className="text-[10px] text-slate-400 py-3 text-center font-mono">暂无本期确权记录</div>
                                    ) : (
                                      (data.details || []).map((log) => (
                                        <div
                                          key={log.id}
                                          className="p-2 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-xs"
                                        >
                                          <div className="flex items-center gap-2">
                                            <div
                                              className={`w-1.5 h-1.5 rounded-full ${
                                                log.status === AuditStatus.Approved
                                                  ? "bg-emerald-500"
                                                  : "bg-blue-400"
                                              }`}
                                            ></div>
                                            <div>
                                              <p className="text-[11px] font-bold text-slate-900">
                                                {log.type}
                                              </p>
                                              <p className="text-[9px] text-slate-400">
                                                {resolveLogBusinessDate(log)} ({resolveLogBusinessMonth(log)}) | {log.status === AuditStatus.Approved ? "入库" : "已确权"}
                                              </p>
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <p className="text-[11px] font-black font-mono text-slate-700">
                                              {fmtAmount(log.netValue)}
                                            </p>
                                            <p className="text-[8px] text-slate-400">
                                              {log.category}
                                            </p>
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>

                                {/* Historical Debt Breakdown */}
                                <div className="bg-white rounded-xl border border-slate-300 p-4 shadow-xs">
                                  <h6 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center mb-2">
                                    <Calculator size={13} className="mr-1.5 text-rose-600" />
                                    自然年内往期欠产滚动表
                                  </h6>
                                  {data.historyRecordsConfirmed && data.historyRecordsConfirmed.length > 0 ? (
                                    <div className="overflow-x-auto rounded border border-slate-200 custom-scrollbar max-h-[220px]">
                                      <table className="min-w-full text-slate-700 text-[10px] text-left font-mono border-separate border-spacing-0">
                                        <thead className="bg-slate-100 sticky top-0 z-10">
                                          <tr>
                                            <th className="px-2 py-1 border-r border-b border-slate-200 text-center font-bold">周期</th>
                                            <th className="px-2 py-1 border-r border-b border-slate-200 text-right text-rose-500 font-bold">期初欠产</th>
                                            <th className="px-2 py-1 border-r border-b border-slate-200 text-right font-bold">收入总计</th>
                                            <th className="px-2 py-1 border-r border-b border-slate-200 text-right text-slate-400 font-bold">成本包</th>
                                            <th className="px-2 py-1 border-r border-b border-slate-200 text-right text-blue-600 font-bold">分配额度</th>
                                            <th className="px-2 py-1 border-b border-slate-200 text-right text-rose-600 font-black">期末欠产</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                          {data.historyRecordsConfirmed.map((record: any, idx: number) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                              <td className="px-2 py-1 font-bold border-r border-slate-200 text-center">{record.month}</td>
                                              <td className="px-2 py-1 text-right text-rose-500 font-bold border-r border-slate-200">{fmtDebt(record.startDebt)}</td>
                                              <td className="px-2 py-1 text-right text-slate-800 border-r border-slate-200">{fmtAmount(record.totalIncome)}</td>
                                              <td className="px-2 py-1 text-right text-slate-400 border-r border-slate-200">{fmtAmount(record.costPackage !== undefined ? -Math.abs(record.costPackage) : -(record.totalCost || 0))}</td>
                                              <td className="px-2 py-1 text-right text-blue-600 font-bold border-r border-slate-200">{fmtAmount(record.quota)}</td>
                                              <td className="px-2 py-1 text-right text-rose-600 font-black">{fmtDebt(record.endDebt)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <div className="text-[10px] text-slate-400 py-3 text-center font-mono">本年无往期历史欠产记录</div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </motion.tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View Removed - Table is now responsive with scroll */}
        <div className="hidden">
          <AnimatePresence>
            {filteredDistributionData.map((data) => {
              const userObj = users.find((u) => u.id === data.userId);
              const userCenter = userObj?.center || "";
              const userCenters = parseCenterList(userCenter);

              const coll2_Sum = resources
                .filter(
                  (r) =>
                    r.assignedToRevenue === data.userId ||
                    r.assignedToRevenue === data.userName ||
                    centerMatch(r.assignedToRevenue, userCenter),
                )
                .reduce((sum, r) => sum + (r.incentiveCollection2 || 0), 0);

              const out5_Sum = resources
                .filter(
                  (r) =>
                    r.assignedToValue === data.userId ||
                    r.assignedToValue === data.userName ||
                    centerMatch(r.assignedToValue, userCenter),
                )
                .reduce((sum, r) => sum + (r.incentiveOutput5 || 0), 0);

              const isKuan =
                (data.category || "").includes("款专") ||
                (data.userName || "").includes("款专");
              const isChan =
                (data.category || "").includes("产专") ||
                (data.userName || "").includes("产专");

              return (
                <motion.div
                  key={data.userId}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-[2rem] border border-slate-300 shadow-sm overflow-hidden"
                >
                  <div className="p-5 flex items-center justify-between border-b border-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 font-bold text-xs uppercase">
                        {data.userName.charAt(0)}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {/* 第 1 行【专家姓名】 */}
                        <h4 className="text-sm font-bold text-[#0f172a]">
                          {data.userName}
                        </h4>

                        {/* 第 2 行【身份人格】 */}
                        <p className="text-[11px] font-normal text-[#64748b]">
                          {formatCategory(data.category)}
                        </p>

                        {/* 第 3 行【资产绑定层 - 新增核心】 */}
                        {(data.category === "经管员高款专" ||
                          data.category === "经管员高产专") && (
                          <div className="text-[11px] font-normal text-[#64748b] flex items-center mt-0.5">
                            <span>经营单元本级: </span>
                            <span
                              className="ml-1 font-semibold text-indigo-600"
                              style={{
                                fontFamily:
                                  '"DIN Alternate", ui-monospace, monospace',
                                fontWeight: 600,
                              }}
                            >
                              {fmtAmount(data.centerLevelBonus || 0)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] font-black text-slate-300 uppercase mb-0.5">
                        即时奖金 (入库)
                      </p>
                      <p className="text-sm font-black font-mono text-emerald-600">
                        {fmtAmount(data.netBonusApproved)}
                      </p>
                    </div>
                  </div>

                  {data.isChan ? (
                    <div className="p-5 grid grid-cols-2 gap-4 bg-slate-50/50">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase">
                          当期确权产兑
                        </span>
                        <span className="text-xs font-bold text-slate-700 font-mono">
                          {fmtAmount(data.baseValueConfirmed)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 text-right">
                        <span className="text-[9px] font-black text-slate-400 uppercase">
                          当期工资包
                        </span>
                        <span className="text-xs font-bold text-slate-600 font-mono cursor-pointer" onClick={toggleCostVisibility}>
                          {maskMoney(data.salaryPackage, fmtAmount)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-black text-[#64748b] uppercase">
                          历史滚动欠产包
                        </span>
                        {data.historyDebt > 0 ? (
                          <span className="text-xs font-black text-[#ef4444] font-mono">
                            {fmtDebt(data.historyDebt)}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-slate-300 font-mono">
                            0
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5 text-right">
                        {data.category === "经管员高款专" ||
                        data.category === "经管员高产专" ? (
                          <>
                            <span className="text-[9px] font-black text-[#64748b] uppercase">
                              经营单元本级
                            </span>
                            <span className="text-sm font-black text-indigo-600 font-mono">
                              {fmtAmount(data.centerLevelBonus || 0)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-[9px] font-black text-[#64748b] uppercase">
                              年度累计奖金
                            </span>
                            <span className="text-sm font-black text-emerald-600 font-mono">
                              {fmtAmount(data.yearlyBonusApproved)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-5 grid grid-cols-2 gap-4 bg-slate-50/30">
                      <div className="space-y-1">
                        <p className="text-[8px] font-black text-slate-400 uppercase">
                          年度累计奖金
                        </p>
                        <p className="text-xs font-black font-mono text-slate-700">
                          {fmtAmount(data.yearlyBonusApproved)}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="p-4 flex gap-2">
                    {canRegisterPayout && (
                      <button
                        onClick={() => handleOpenBonus(data)}
                        className="py-1.5 px-4 bg-emerald-600 text-white rounded-2xl transition-all flex items-center justify-center gap-1.5 text-xs font-bold shadow-sm hover:bg-emerald-700"
                      >
                        <Wallet size={16} />
                        <span>发放</span>
                      </button>
                    )}
                    <button
                      onClick={() =>
                        setSelectedUser(
                          selectedUser === data.userId ? null : data.userId,
                        )
                      }
                      className={`flex-1 py-1.5 rounded-2xl transition-all flex items-center justify-center gap-2 ${selectedUser === data.userId ? "bg-blue-600 text-white shadow-lg" : "bg-slate-50 text-slate-400"}`}
                    >
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {selectedUser === data.userId ? "收起详情" : "查看详情"}
                      </span>
                      {selectedUser === data.userId ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                  </div>

                  <AnimatePresence>
                    {selectedUser === data.userId && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-slate-50 bg-white p-4"
                      >
                        <div className="p-2 bg-blue-50/50 rounded-2xl border border-blue-100 text-center">
                          <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                            请在 PC 端查看完整漏斗穿透审计详情
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Info */}
      <div className={`bg-white ${UI_TOKENS.RADIUS_PANEL} p-8 border border-slate-300 shadow-sm flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h5 className="text-xs font-black text-slate-900 uppercase tracking-widest">
              城市守护者：价值核算与分配原则
            </h5>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
              理论与承兑独立核算 ｜ 历史欠产包动态抵扣 ｜ 数值精确到整数
            </p>
          </div>
        </div>
      </div>

      {/* 登记承兑发放 Modal */}
      {bonusTarget && (
        <CityGuardianModal 
          state={{
            isOpen: !modalState.isOpen,
            type: 'custom',
            title: `城市守护者 - 登记承兑发放 (${bonusTarget.userName || ""})`,
            content: (
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">人员:</span>
                  <span className="font-bold text-slate-800">{bonusTarget.userName} ({bonusTarget.category})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">本月理论应得奖金:</span>
                  <span className="font-bold text-emerald-600 font-mono">{fmtAmount(bonusTarget.netBonusConfirmed)}</span>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">发放类别</label>
                  <select
                    value={bonusForm.category}
                    onChange={(e) => setBonusForm({ ...bonusForm, category: e.target.value as any })}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                  >
                    <option value="收款奖金">收款奖金</option>
                    <option value="产值奖金">产值奖金</option>
                    <option value="分红">分红</option>
                    <option value="特别奖金">特别奖金</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">关联矿山/资源 (可选)</label>
                  <select
                    value={bonusForm.miningId}
                    onChange={(e) => setBonusForm({ ...bonusForm, miningId: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                  >
                    <option value="">不指定矿山</option>
                    {resources.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id} ({Array.isArray(r.types) ? r.types.join(' / ') : "资源矿山"})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">理论发放数值</label>
                    <input
                      type="number"
                      disabled
                      value={bonusForm.theoreticalAmount}
                      className="w-full p-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-500 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">实际发放数值 <span className="text-rose-500">*</span></label>
                    <input
                      type="number"
                      value={bonusForm.amount}
                      onChange={(e) => setBonusForm({ ...bonusForm, amount: Number(e.target.value) })}
                      className="w-full p-2 border border-slate-200 rounded-lg text-xs font-mono font-bold text-blue-600 bg-white"
                    />
                  </div>
                </div>

                {Math.abs(bonusForm.amount - bonusForm.theoreticalAmount) > 0.01 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                    <div className="text-amber-800 font-bold text-[11px]">
                      ⚠️ 实际发放与理论数值存在差异 ({fmtAmount(bonusForm.amount - bonusForm.theoreticalAmount)})
                    </div>
                    <div>
                      <label className="block text-slate-600 font-bold mb-1">差异原因分类 <span className="text-rose-500">*</span></label>
                      <select
                        value={bonusForm.diffType}
                        onChange={(e) => setBonusForm({ ...bonusForm, diffType: e.target.value as any })}
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                      >
                        <option value="政策调整">政策调整</option>
                        <option value="绩效扣减">绩效扣减</option>
                        <option value="误差纠偏">误差纠偏</option>
                        <option value="其它">其它</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 font-bold mb-1">差异具体说明 <span className="text-rose-500">*</span></label>
                      <textarea
                        value={bonusForm.diffReason}
                        onChange={(e) => setBonusForm({ ...bonusForm, diffReason: e.target.value })}
                        placeholder="请详细说明数值差异的具体原因..."
                        rows={2}
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-slate-600 font-bold mb-1">审批文号/单号 (可选)</label>
                  <input
                    type="text"
                    value={bonusForm.approvalRef}
                    onChange={(e) => setBonusForm({ ...bonusForm, approvalRef: e.target.value })}
                    placeholder="例如：OA-202608-001"
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">发放备注说明 (可选)</label>
                  <input
                    type="text"
                    value={bonusForm.description}
                    onChange={(e) => setBonusForm({ ...bonusForm, description: e.target.value })}
                    placeholder="备注信息..."
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-300">
                <button
                  onClick={() => setBonusTarget(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all"
                >
                  取消
                </button>
                <button
                  onClick={handleBonusSubmit}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-md"
                >
                  确认提交发放
                </button>
              </div>
            </div>
            )
          }}
          onClose={() => setBonusTarget(null)}
        />
      )}
      </>
      )}
      <CityGuardianModal state={modalState} onClose={closeModal} />
    </div>
  );
};

export default Distribution;
