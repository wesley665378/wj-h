import { UI_TOKENS } from '../src/constants/uiTokens';
import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { TIER_COEFFICIENTS } from "../src/constants/coefficients";
import { calculateBonusAllocation, isExpertCategory, aggregateUserMonthMetrics } from "../src/utils/bonusAllocation";
import { isCenterManagerUser, centerMatch } from "../src/utils/centerScope";
import { parseCenterList, businessUnitLabelsEqual } from "../src/utils/purification";
import { getUserSalaryByMonth } from "../src/utils/business";
import { resolveLogBusinessMonth, getLocalMonthString, getLocalDateString, resolveLogBusinessDate, isDateInRange } from "../src/utils/dateUtils";
import { formatAmount, formatRatio, formatPercent } from "../src/utils/formatters";
import { InfoTip } from "../src/components/InfoTip";
import { CostPrivacyToggle } from "../src/components/CostPrivacyToggle";
import { BusinessDateFilter } from "../src/components/BusinessDateFilter";
import { fetchDistributionData } from "../src/api/distribution";
import { createCdtzRecord } from "../src/api/cdtz";
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
} from "../types";
import { XLSX, exportWorkbook, buildExcelFilename } from "../src/utils/excelIo";
import { toast } from "sonner";
import { CityGuardianModal, useCityGuardianModal } from "../src/components/CityGuardianModal";
import { useCostPrivacy } from "../src/hooks/useCostPrivacy";
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
} from "lucide-react";

interface DistributionProps {
  logs: ValueCreationLog[];
  users: User[];
  currentUser: User;
  transactions: InternalTransaction[];
  resources: MiningResource[];
  onSubmitTransaction?: (tx: InternalTransaction) => void;
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
  if (val === undefined || val === null || isNaN(val) || Math.round(val) === 0) {
    return "0";
  }
  const rounded = Math.round(val);
  if (rounded < 0) {
    return rounded.toLocaleString();
  }
  return `-${rounded.toLocaleString()}`;
};

const Distribution: React.FC<DistributionProps> = ({
  logs,
  users,
  currentUser,
  transactions,
  resources,
  onSubmitTransaction,
}) => {
  const { modalState, showAlert, showConfirm, closeModal } = useCityGuardianModal();
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [bonusTarget, setBonusTarget] = useState<BonusCalculation | null>(null);
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

    // Admin、npcxie（保留）
    if (role === Role.Admin || role === "admin" || cat === "系统管理员" || cat === "VP") return true;
    if (role === Role.npcxie || role === "npcxie" || cat === "NPC" || cat === "经管员NPC") return true;

    // 经管员：category 为 经管员高款专 / 经管员高产专
    if (cat === "经管员高款专" || cat === "经管员高产专") return true;

    // 水库管理员/管理角色：role === Role.ReservoirManager
    if (role === Role.ReservoirManager || role === "reservoir_manager") return true;

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
      showAlert("请输入有效的发放金额");
      return;
    }

    const diff = bonusForm.amount - bonusForm.theoreticalAmount;
    if (Math.abs(diff) > 0.01 && !bonusForm.diffReason.trim()) {
      showAlert("发放金额与理论金额不一致时，必须填写差异说明");
      return;
    }

    showConfirm(
      `确定确认提交奖金发放？\n\n【人员】${bonusTarget.userName} (${bonusTarget.category})\n【类别】${bonusForm.category}\n【实际发放金额】${fmtAmount(bonusForm.amount)}`,
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
          showAlert(`已成功写入承兑台账 cdtz！对 [${bonusTarget.userName}] 的 ${bonusForm.category} 发放：${fmtAmount(bonusForm.amount)}`);
          loadDistribution();
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

  const effectiveMonth = useMemo(() => {
    if (startDate) return startDate.slice(0, 7);
    return filterMonth || getLocalMonthString();
  }, [filterMonth, startDate]);

  const [serverDistribution, setServerDistribution] = useState<any[] | null>(null);
  const [distributionLoading, setDistributionLoading] = useState<boolean>(false);
  const [distributionError, setDistributionError] = useState<string | null>(null);

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
  }, [effectiveMonth, isLocalEmbedded]);

  const { isCostVisible, toggleCostVisible, maskMoney, maskText } = useCostPrivacy();
  const toggleCostVisibility = toggleCostVisible;

  const C_WEIGHT = TIER_COEFFICIENTS.BASE_LOSS; // 系统默认 C 对冲权重

  const distributionData = useMemo(() => {
    if (!isLocalEmbedded) {
      if (distributionLoading || distributionError || !serverDistribution) {
        return [];
      }
      return serverDistribution.map((serverItem) => {
        const userObj = users.find((u) => u.id === serverItem.userId);
        const userCenter = userObj?.center || "";

        const conf = serverItem.confirmed || {};
        const app = serverItem.approved || {};

        const centerLevelBonus = serverItem.centerLevelBonus ?? 0;
        const isRevenueExpert = (serverItem.category || "").includes("款专");
        const isChan = (serverItem.category || "").includes("产专") || serverItem.category === "经管员高产专";

        const currentSurplus = conf.currentSurplus ?? serverItem.currentSurplus ?? 0;
        const historyDebt = conf.historyDebt ?? serverItem.historyDebt ?? 0;
        const nextDebt = conf.newDebt ?? serverItem.nextDebt ?? 0;
        const netRedundancy = conf.quota ?? serverItem.netRedundancy ?? 0;
        const theoreticalBonus = conf.theoreticalBonus ?? serverItem.theoreticalBonus ?? 0;
        const ratioVal = conf.ratio ?? serverItem.ratio ?? 0.05;

        const historyDebtConfirmed = conf.historyDebt ?? serverItem.historyDebtConfirmed ?? serverItem.historyDebt ?? 0;
        const historyDebtApproved = app.historyDebt ?? serverItem.historyDebtApproved ?? serverItem.historyDebt ?? 0;
        const netRedundancyConfirmed = conf.quota ?? serverItem.netRedundancyConfirmed ?? serverItem.netRedundancy ?? 0;
        const netRedundancyApproved = app.quota ?? serverItem.netRedundancyApproved ?? serverItem.netRedundancy ?? 0;
        const theoreticalBonusConfirmed = conf.theoreticalBonus ?? serverItem.theoreticalBonusConfirmed ?? serverItem.theoreticalBonus ?? 0;
        const theoreticalBonusApproved = app.theoreticalBonus ?? serverItem.theoreticalBonusApproved ?? serverItem.theoreticalBonus ?? 0;
        const historyRecordsConfirmed = conf.historyRecords || serverItem.historyRecordsConfirmed || serverItem.historyRecords || [];
        const historyRecordsApproved = app.historyRecords || serverItem.historyRecordsApproved || serverItem.historyRecords || [];

        const userLogsMonthly = (logs || []).filter(l => 
          l.recordedCollectorId === serverItem.userId && 
          (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved) &&
          resolveLogBusinessMonth(l) === effectiveMonth
        );

        const confirmedMetrics = aggregateUserMonthMetrics(logs || [], userObj || { id: serverItem.userId } as User, effectiveMonth, resources || [], users || [], [AuditStatus.Confirmed]);
        const approvedMetrics = aggregateUserMonthMetrics(logs || [], userObj || { id: serverItem.userId } as User, effectiveMonth, resources || [], users || [], [AuditStatus.Approved]);

        const baseValueConfirmed = isChan ? confirmedMetrics.productionPackage : confirmedMetrics.revenuePackage;
        const baseValueApproved = isChan ? approvedMetrics.productionPackage : approvedMetrics.revenuePackage;

        let yearlyBaseValConfirmed = 0;
        let yearlyBaseValApproved = 0;
        let yearlyBonusApproved = 0;

        const currentYear = effectiveMonth
          ? effectiveMonth.split("-")[0]
          : new Date().getFullYear().toString();

        const userLogsYearly = (logs || []).filter(l => 
          l.recordedCollectorId === serverItem.userId && 
          (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved) &&
          resolveLogBusinessMonth(l).startsWith(currentYear)
        );

        const yearlyMonths = Array.from(new Set(userLogsYearly.map(l => resolveLogBusinessMonth(l))));
        for (const m of yearlyMonths) {
          const mConf = aggregateUserMonthMetrics(userLogsYearly, userObj || { id: serverItem.userId } as User, m, resources || [], users || [], [AuditStatus.Confirmed]);
          const mApp = aggregateUserMonthMetrics(userLogsYearly, userObj || { id: serverItem.userId } as User, m, resources || [], users || [], [AuditStatus.Approved]);
          yearlyBaseValConfirmed += (isChan ? mConf.productionPackage : mConf.revenuePackage);
          yearlyBaseValApproved += (isChan ? mApp.productionPackage : mApp.revenuePackage);
        }

        yearlyBonusApproved = yearlyBaseValApproved * (app.ratio ?? ratioVal);

        return {
          userId: serverItem.userId,
          userName: serverItem.userName,
          category: serverItem.category || "初级专家",
          isRevenueExpert,
          isChan,
          historyDebt: historyDebt,
          currentSurplus: currentSurplus,
          netRedundancy: netRedundancy,
          nextDebt: nextDebt,
          theoreticalBonus: theoreticalBonus,
          ratio: ratioVal,
          centerLevelBonus,

          historyRecordsConfirmed,
          historyRecordsApproved,
          historyDebtConfirmed,
          historyDebtApproved,
          currentSurplusConfirmed: conf.currentSurplus ?? currentSurplus,
          currentSurplusApproved: app.currentSurplus ?? currentSurplus,
          netRedundancyConfirmed,
          netRedundancyApproved,
          theoreticalBonusConfirmed,
          theoreticalBonusApproved,
          yearlyBonusApproved: app.theoreticalBonus ?? yearlyBonusApproved,

          confirmedValueConfirmed: isChan ? baseValueConfirmed : 0,
          bCostConfirmed: confirmedMetrics.b1Cost ?? 0,
          b2CostConfirmed: confirmedMetrics.b2Cost ?? 0,
          aCostConfirmed: confirmedMetrics.aCost ?? 0,
          confirmedGoldConfirmed: !isChan ? baseValueConfirmed : 0,
          baseValueConfirmed: baseValueConfirmed,
          netBonusConfirmed: theoreticalBonusConfirmed,
          isBreakthroughConfirmed: (conf.currentSurplus ?? currentSurplus) > 0,
          gapToBreakthroughConfirmed: (conf.currentSurplus ?? currentSurplus) > 0 ? 0 : Math.abs(conf.currentSurplus ?? currentSurplus),
          paymentMatchRateConfirmed: 1,

          confirmedValueApproved: isChan ? baseValueApproved : 0,
          bCostApproved: approvedMetrics.b1Cost ?? 0,
          b2CostApproved: approvedMetrics.b2Cost ?? 0,
          aCostApproved: approvedMetrics.aCost ?? 0,
          confirmedGoldApproved: !isChan ? baseValueApproved : 0,
          baseValueApproved: baseValueApproved,
          netBonusApproved: theoreticalBonusApproved,
          isBreakthroughApproved: (app.currentSurplus ?? currentSurplus) > 0,
          gapToBreakthroughApproved: (app.currentSurplus ?? currentSurplus) > 0 ? 0 : Math.abs(app.currentSurplus ?? currentSurplus),
          paymentMatchRateApproved: 1,

          baseValuePending: 0,
          yearlyIncomeApproved: yearlyBaseValApproved,
          yearlyIncomeConfirmed: yearlyBaseValConfirmed,

          cWeight: TIER_COEFFICIENTS.BASE_LOSS,
          salaryPackage: userObj?.salaryPackage ?? 0,
          details: userLogsMonthly || [],

          personalIncentiveStatus: (app.currentSurplus ?? currentSurplus) > 0 ? "已激活超额价值分享" : "入库任务进行中",
          teamDividendStatus: (app.currentSurplus ?? currentSurplus) > 0 ? "已激活超额价值分享" : "入库任务进行中",
        };
      });
    }

    // 本地嵌入式（isLocalEmbedded 为 true）
    const currentYear = effectiveMonth
      ? effectiveMonth.split("-")[0]
      : new Date().getFullYear().toString();

    const logsByUserYearly = new Map<string, ValueCreationLog[]>();
    const logsByUserMonthly = new Map<string, ValueCreationLog[]>();

    logs.forEach((log) => {
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
        : logMonth === effectiveMonth;

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
        if (u.userStatus === "inactive") return false;
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

        const salaryPackage = user.salaryPackage || 0;

        const isRevenueExpert = (user.category || "").includes("款专");
        const isChanExpert = (user.category || "").includes("产专");
        const isChan = isChanExpert || user.category === "经管员高产专";

        const confirmedMetrics = aggregateUserMonthMetrics(logs, user, effectiveMonth, resources, users, [AuditStatus.Confirmed]);
        const approvedMetrics = aggregateUserMonthMetrics(logs, user, effectiveMonth, resources, users, [AuditStatus.Approved]);

        const baseValueConfirmedStr = isChan ? confirmedMetrics.productionPackage : confirmedMetrics.revenuePackage;
        const baseValueApprovedStr = isChan ? approvedMetrics.productionPackage : approvedMetrics.revenuePackage;

        let yearlyBaseValConfirmed = 0;
        let yearlyBaseValApproved = 0;
        let pendingBaseVal = 0;
        
        const pendingMetrics = aggregateUserMonthMetrics(logs, user, effectiveMonth, resources, users, [AuditStatus.Pending]);
        pendingBaseVal = isChan ? pendingMetrics.productionPackage : pendingMetrics.revenuePackage;

        let yearlySalaryPackage = 0;
        if (effectiveMonth) {
          const [y, m] = effectiveMonth.split("-").map(Number);
          for (let mIdx = 1; mIdx <= m; mIdx++) {
            const mStr = `${y}-${String(mIdx).padStart(2, "0")}`;
            yearlySalaryPackage += getUserSalaryByMonth(user, mStr);
          }
        }

        const yearlyMonths = Array.from(new Set(userLogsYearly.map(l => resolveLogBusinessMonth(l))));
        for (const m of yearlyMonths) {
          const mConf = aggregateUserMonthMetrics(userLogsYearly, user, m, resources, users, [AuditStatus.Confirmed]);
          const mApp = aggregateUserMonthMetrics(userLogsYearly, user, m, resources, users, [AuditStatus.Approved]);
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

        const allocConfirmed = calculateBonusAllocation(
            effectiveMonth,
            user,
            logs,
            resources,
            users,
            AuditStatus.Confirmed
        );

        const allocApproved = calculateBonusAllocation(
            effectiveMonth,
            user,
            logs,
            resources,
            users,
            AuditStatus.Approved
        );

        if (allocConfirmed.ratio > 0 || allocApproved.ratio > 0) {
            historyDebtConfirmed = Math.abs(allocConfirmed.history);
            currentSurplusConfirmed = allocConfirmed.current;
            netRedundancyConfirmed = allocConfirmed.quota;
            nextDebtConfirmed = Math.abs(allocConfirmed.newDebt);

            historyDebtApproved = Math.abs(allocApproved.history);
            currentSurplusApproved = allocApproved.current;
            netRedundancyApproved = allocApproved.quota;
            nextDebtApproved = Math.abs(allocApproved.newDebt);
            
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
          centerLevelBonus = resources
            .filter((r) => centerMatch(r.assignedTo, userCenter))
            .reduce((sum, r) => sum + (r.incentiveOutput5 || 0) + (r.incentiveCollection2 || 0), 0);
        }

        return {
          userId: user.id,
          userName: user.name,
          category: user.category || "初级专家",
          isRevenueExpert,
          isChan,
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

          confirmedValueConfirmed: confirmedMetrics.productionPackage,
          bCostConfirmed: confirmedMetrics.b1Cost,
          b2CostConfirmed: confirmedMetrics.b2Cost,
          aCostConfirmed: confirmedMetrics.aCost,
          confirmedGoldConfirmed: confirmedMetrics.revenuePackage,
          baseValueConfirmed: baseValueConfirmedStr,
          netBonusConfirmed: netBonusConfirmedVal,
          isBreakthroughConfirmed: currentSurplus > 0,
          gapToBreakthroughConfirmed: currentSurplus > 0 ? 0 : Math.abs(currentSurplus),
          paymentMatchRateConfirmed: 1,

          confirmedValueApproved: approvedMetrics.productionPackage,
          bCostApproved: approvedMetrics.b1Cost,
          b2CostApproved: approvedMetrics.b2Cost,
          aCostApproved: approvedMetrics.aCost,
          confirmedGoldApproved: approvedMetrics.revenuePackage,
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
  }, [logs, users, effectiveMonth, startDate, endDate, isLocalEmbedded, distributionLoading, distributionError, serverDistribution]);

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
            resolveLogBusinessMonth(l) === effectiveMonth,
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
        return (distributionData || []).reduce((acc, d) => {
          if (d.userId === userId) return acc;
          return acc + getIndividualRedundancy(d.userId, d.category);
        }, 0);
      } else {
        return getIndividualRedundancy(userId, category);
      }
    },
    [logs, effectiveMonth, startDate, endDate, distributionData],
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
      const totalCost = (data.salaryPackage || 0) + (data.aCostConfirmed || 0);
      const redundancy = isManagerKuan
        ? getRedundancyValue(data.userId, cat)
        : 0;

      const rawBase = collectionPackage + redundancy - totalCost;
      const base = rawBase < 0 ? 0 : rawBase;

      const t60 = Math.round(base * 0.6);
      const t80 = Math.round(base * 0.8);
      const t100 = Math.round(base * 1.0);

      return {
        t60,
        t80,
        t100,
        base,
        collectionPackage,
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

  const avgValueQualityApproved = useMemo(() => {
    const totalValue = distributionData.reduce(
      (acc, curr) => acc + curr.confirmedValueApproved,
      0,
    );
    const totalGold = distributionData.reduce(
      (acc, curr) => acc + curr.confirmedGoldApproved,
      0,
    );
    return totalValue > 0 ? totalGold / totalValue : 0;
  }, [distributionData]);

  const avgValueQualityConfirmed = useMemo(() => {
    const totalValue = distributionData.reduce(
      (acc, curr) => acc + curr.confirmedValueConfirmed,
      0,
    );
    const totalGold = distributionData.reduce(
      (acc, curr) => acc + curr.confirmedGoldConfirmed,
      0,
    );
    return totalValue > 0 ? totalGold / totalValue : 0;
  }, [distributionData]);

  const exportToExcel = () => {
    const data = distributionData.map((d) => {
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
    showAlert("导出成功");
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
        <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 ${UI_TOKENS.RADIUS_PANEL} shadow-sm border border-slate-100`}>
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

        <div className={`bg-white ${UI_TOKENS.RADIUS_PANEL} border border-slate-100 shadow-sm overflow-hidden`}>
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
              <button
                onClick={exportToExcel}
                className="px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center shadow-2xs"
              >
                <Wallet size={13} className="mr-1.5" />
                导出分配清单
              </button>
            </div>
          </div>
          <div className="p-20 text-center">
            <Calculator size={48} className="mx-auto text-slate-200 mb-6" />
            <p className="text-sm font-black text-slate-900 uppercase mb-2">
              未发现本月分配数据
            </p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
              请确认已完成该月份的价值提炼记录审核，或切换其它业务月份。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-700 pb-6 font-sans">
      {/* Header */}
      <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 ${UI_TOKENS.RADIUS_PANEL} shadow-sm border border-slate-100`}>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-1 gap-6">

        <div className={`bg-white ${UI_TOKENS.RADIUS_PANEL} p-8 border border-slate-100 shadow-sm group hover:shadow-xl transition-all`}>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">
            平均产值含金量
          </p>
          <div className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">
                  入库
                </span>
                <span className="text-xl font-black font-mono tracking-tighter text-slate-900">
                  {(avgValueQualityApproved * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                <div
                  className="bg-amber-500 h-full transition-all duration-1000"
                  style={{ width: `${avgValueQualityApproved * 100}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">
                  已确权
                </span>
                <span className="text-xl font-black font-mono tracking-tighter text-slate-400">
                  {(avgValueQualityConfirmed * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-slate-50 h-1 rounded-full overflow-hidden">
                <div
                  className="bg-slate-300 h-full transition-all duration-1000"
                  style={{ width: `${avgValueQualityConfirmed * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`bg-white ${UI_TOKENS.RADIUS_PANEL} border border-slate-100 shadow-sm overflow-hidden`}>
        <div className="p-6 md:p-8 border-b border-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center">
              <Calculator size={16} className="mr-3 text-blue-600" />
              专家价值核算矩阵
            </h4>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">
              共 {distributionData.length} 位专家参与分配
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
            <button
              onClick={exportToExcel}
              className="px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center shadow-2xs"
            >
              <Wallet size={13} className="mr-1.5" />
              导出分配清单
            </button>
          </div>
        </div>

        {/* Table View with Horizontal Scroll */}
        <div className="block overflow-x-auto custom-scrollbar pb-4 relative">
          <table className="w-full text-left border-separate border-spacing-0 border border-slate-200 rounded-2xl overflow-hidden">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-50/90 backdrop-blur-md">
                <th className="border-b border-r border-slate-200 py-4 px-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[220px]">
                  采集主体
                </th>
                <th className="border-b border-r border-slate-200 py-4 px-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[200px]">
                  <div className="flex items-center justify-center gap-1.5">
                    <span>产兑包/收款包</span>
                    <InfoTip title="产兑包/收款包口径" content="款专收款已确权，产专产值已确权或待确权联动确权。" />
                  </div>
                </th>
                <th className="border-b border-r border-slate-200 py-4 px-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[180px]">
                  <div className="flex items-center justify-center gap-1.5">
                    <span>总成本对冲</span>
                    <CostPrivacyToggle size="sm" showLabel={false} />
                    <InfoTip title="总成本对冲口径" content="款专工资+A类，产专工资+B1类，不含 B2/C 动态对冲。" />
                  </div>
                </th>
                <th className="border-b border-r border-slate-200 py-4 px-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[160px]">
                  <div className="flex items-center justify-center gap-1.5">
                    <span>分配额度（月）</span>
                    <InfoTip title="分配额度口径" content="填平历史欠产后的净分配额度（≥0）。" />
                  </div>
                </th>
                <th className="border-b border-r border-slate-200 py-4 px-4 text-center text-[10px] font-black text-amber-600 bg-amber-50/50 uppercase tracking-widest min-w-[150px]">
                  <div className="flex items-center justify-center gap-1.5">
                    <span>理论（额度）</span>
                    <InfoTip title="理论（额度）口径" content="理论奖金=已确权额度×系数，计算应发理论额度。" />
                  </div>
                </th>
                <th className="border-b border-r border-slate-200 py-4 px-4 text-center text-[10px] font-black text-emerald-600 bg-emerald-50/50 uppercase tracking-widest min-w-[150px]">
                  <div className="flex items-center justify-center gap-1.5">
                    <span>承兑（实发）</span>
                    <InfoTip title="承兑（实发）口径" content="当月 cdtz 实际发放和承兑记录。" />
                  </div>
                </th>
                <th className="border-b border-r border-slate-200 py-4 px-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[160px]">
                  <div className="flex items-center justify-center gap-1.5">
                    <span>历史欠产包</span>
                     <InfoTip title="历史欠产包口径" content="当年 1~M-1 全量滚动，无流水仍计工资，不含当月，负数展示。" />
                  </div>
                </th>
                <th className="border-b border-slate-200 py-4 px-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[150px]">
                  <div className="flex items-center justify-center gap-1.5">
                    <span>年度累计</span>
                     <InfoTip title="年度累计口径" content="按选定审核状态年度全量累计计算。" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {distributionData.map((data) => {
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

                const kuanTiers = getKuanTheoreticalTiers(data);

                return (
                  <React.Fragment key={data.userId}>
                    <tr
                      className={`group/tr hover:bg-slate-50/80 transition-colors ${selectedUser === data.userId ? "bg-blue-50/30" : ""}`}
                    >
                      {/* Column 1: 采集主体 */}
                      <td className="p-4 border border-slate-200 text-center">
                        <div className="flex flex-col gap-1 items-center justify-center">
                          <span className="text-sm font-bold text-[#0f172a]">
                            {data.userName}
                          </span>
                          <span className="text-[11px] font-normal text-[#64748b] bg-slate-100 px-2.5 py-0.5 rounded-full">
                            {formatCategory(data.category)}
                          </span>
                          {(data.category === "经管员高款专" ||
                            data.category === "经管员高产专") && (
                            <div className="text-[10px] font-normal text-[#64748b] flex flex-col items-center mt-1.5 border-t border-slate-100 pt-1 w-full">
                              <span className="text-slate-400">经营单元本级</span>
                              <span className="font-semibold text-indigo-600">
                                {fmtAmount(data.centerLevelBonus || 0)}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      {/* Column 2: 产兑包/收款包 */}
                      <td className="p-0 border border-slate-200">
                        <div className="flex flex-col divide-y divide-slate-200 h-full w-full">
                          <div className="flex items-stretch flex-1 min-h-[38px]">
                            <div className="flex items-center justify-center w-[76px] flex-none border-r border-slate-200 bg-slate-50/35 group-hover/tr:bg-slate-50/60 text-[#64748b] text-[11px] font-normal tracking-tight px-2 py-1.5 whitespace-nowrap">
                              已确权：
                            </div>
                            <div className="flex-1 px-3 py-1.5 flex items-center justify-end font-mono text-[11px] font-black text-slate-800 whitespace-nowrap">
                              {fmtAmount(data.baseValueConfirmed)}
                            </div>
                          </div>
                          <div className="flex items-stretch flex-1 min-h-[38px]">
                            <div className="flex items-center justify-center w-[76px] flex-none border-r border-slate-200 bg-slate-50/35 group-hover/tr:bg-slate-50/60 text-[#64748b] text-[11px] font-normal tracking-tight px-2 py-1.5 whitespace-nowrap">
                              入库：
                            </div>
                            <div className="flex-1 px-3 py-1.5 flex items-center justify-end font-mono text-[11px] font-black text-slate-800 whitespace-nowrap">
                              {fmtAmount(data.baseValueApproved)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Column 3: 总成本对冲 */}
                      <td className="p-0 border border-slate-200">
                        <div className="flex flex-col divide-y divide-slate-200 h-full w-full">
                          <div className="flex items-stretch flex-1 min-h-[38px] group/cost">
                            <div className="flex items-center justify-center w-[76px] flex-none border-r border-slate-200 bg-slate-50/35 group-hover/tr:bg-slate-50/60 text-[#64748b] text-[11px] font-normal tracking-tight px-2 py-1.5 whitespace-nowrap">
                              已确权
                            </div>
                            <div className="flex-1 px-3 py-1.5 flex items-center justify-end font-mono text-[11px] font-bold text-slate-700 whitespace-nowrap relative group">
                              <span title={`刚性工资包(${formatAmount(data.salaryPackage)}) + 浮动成本(${formatAmount(data.isRevenueExpert ? (data.aCostConfirmed || 0) : (data.bCostConfirmed || 0))})`}>
                                {maskMoney(data.salaryPackage + (data.isRevenueExpert ? (data.aCostConfirmed || 0) : (data.bCostConfirmed || 0)), fmtAmount)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-stretch flex-1 min-h-[38px] group/cost">
                            <div className="flex items-center justify-center w-[76px] flex-none border-r border-slate-200 bg-slate-50/35 group-hover/tr:bg-slate-50/60 text-[#64748b] text-[11px] font-normal tracking-tight px-2 py-1.5 whitespace-nowrap">
                              入库
                            </div>
                            <div className="flex-1 px-3 py-1.5 flex items-center justify-end font-mono text-[11px] font-bold text-slate-700 whitespace-nowrap relative group">
                              <span title={`刚性工资包(${formatAmount(data.salaryPackage)}) + 浮动成本(${formatAmount(data.isRevenueExpert ? (data.aCostApproved || 0) : (data.bCostApproved || 0))})`}>
                                {maskMoney(data.salaryPackage + (data.isRevenueExpert ? (data.aCostApproved || 0) : (data.bCostApproved || 0)), fmtAmount)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Column 4: 积分额度/当月结余 */}
                      <td className="p-0 border border-slate-200">
                        <div className="flex flex-col divide-y divide-slate-200 h-full w-full">
                          <div className="flex items-stretch flex-1 min-h-[38px]">
                            <div className="flex items-center justify-center w-[76px] flex-none border-r border-slate-200 bg-slate-50/35 group-hover/tr:bg-slate-50/60 text-[#64748b] text-[11px] font-normal tracking-tight px-2 py-1.5 whitespace-nowrap">
                              已确权
                            </div>
                            <div className="flex-1 px-3 py-1.5 flex items-center justify-end font-mono text-[11px] font-black text-indigo-600 whitespace-nowrap">
                              {fmtAmount(data.netRedundancyConfirmed)}
                            </div>
                          </div>
                          <div className="flex items-stretch flex-1 min-h-[38px]">
                            <div className="flex items-center justify-center w-[76px] flex-none border-r border-slate-200 bg-slate-50/35 group-hover/tr:bg-slate-50/60 text-[#64748b] text-[11px] font-normal tracking-tight px-2 py-1.5 whitespace-nowrap">
                              入库
                            </div>
                            <div className="flex-1 px-3 py-1.5 flex items-center justify-end font-mono text-[11px] font-black text-[#10b981] whitespace-nowrap">
                              {fmtAmount(data.netRedundancyApproved)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Column: 理论（额度） */}
                      <td className="p-0 border border-slate-200 bg-amber-50/30">
                        <div className="flex flex-col divide-y divide-amber-100/50 h-full w-full">
                          <div className="flex items-stretch flex-1 min-h-[38px]">
                            <div className="flex items-center justify-center w-[76px] flex-none border-r border-amber-100/50 text-amber-600/70 text-[11px] font-normal tracking-tight px-2 py-1.5 whitespace-nowrap">
                              已确权
                            </div>
                            <div className="flex-1 px-3 py-1.5 flex flex-col items-end justify-center font-mono text-[11px] font-black text-amber-600 whitespace-nowrap leading-tight">
                              {data.isRevenueExpert ? (
                                <div className="text-right flex flex-col gap-0.5">
                                  <div>{fmtAmount(data.theoreticalBonusConfirmed * 0.6)}</div>
                                  <div>{fmtAmount(data.theoreticalBonusConfirmed * 0.8)}</div>
                                  <div>{fmtAmount(data.theoreticalBonusConfirmed * 1.0)}</div>
                                </div>
                              ) : (
                                <span>{fmtAmount(data.theoreticalBonusConfirmed)}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-stretch flex-1 min-h-[38px]">
                            <div className="flex items-center justify-center w-[76px] flex-none border-r border-amber-100/50 text-amber-600/70 text-[11px] font-normal tracking-tight px-2 py-1.5 whitespace-nowrap">
                              入库
                            </div>
                            <div className="flex-1 px-3 py-1.5 flex items-center justify-end font-mono text-[11px] font-black text-amber-600 whitespace-nowrap">
                              {fmtAmount(data.theoreticalBonusApproved)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Column: 承兑（实发） */}
                      <td className="p-0 border border-slate-200 bg-emerald-50/20">
                        <div className="flex flex-col divide-y divide-emerald-100/50 h-full w-full">
                          <div className="flex items-stretch flex-1 min-h-[38px]">
                            <div className="flex items-center justify-center w-[76px] flex-none border-r border-emerald-100/50 text-emerald-600/70 text-[11px] font-normal tracking-tight px-2 py-1.5 whitespace-nowrap">
                              已确权
                            </div>
                            <div className="flex-1 px-3 py-1.5 flex items-center justify-end font-mono text-[11px] font-black text-emerald-600 whitespace-nowrap">
                              {fmtAmount(data.netBonusConfirmed)}
                            </div>
                          </div>
                          <div className="flex items-stretch flex-1 min-h-[38px]">
                            <div className="flex items-center justify-center w-[76px] flex-none border-r border-emerald-100/50 text-emerald-600/70 text-[11px] font-normal tracking-tight px-2 py-1.5 whitespace-nowrap">
                              入库
                            </div>
                            <div className="flex-1 px-3 py-1.5 flex items-center justify-end font-mono text-[11px] font-black text-emerald-600 whitespace-nowrap">
                              {fmtAmount(data.netBonusApproved)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Column 5: 历史欠产包 */}
                      <td className="p-0 border border-slate-200">
                        <div className="flex flex-col divide-y divide-slate-200 h-full w-full">
                          <div className="flex items-stretch flex-1 min-h-[38px]">
                            <div className="flex items-center justify-center w-[76px] flex-none border-r border-slate-200 bg-slate-50/35 group-hover/tr:bg-slate-50/60 text-[#64748b] text-[11px] font-normal tracking-tight px-2 py-1.5 whitespace-nowrap">
                              已确权
                            </div>
                            <div
                              className={`flex-1 px-3 py-1.5 flex items-center justify-end font-mono text-[11px] whitespace-nowrap ${(data.isChan || data.isRevenueExpert) && data.historyDebtConfirmed !== 0 ? "text-rose-600 font-bold" : "text-slate-500"}`}
                            >
                              {fmtDebt(data.historyDebtConfirmed)}
                            </div>
                          </div>
                          <div className="flex items-stretch flex-1 min-h-[38px]">
                            <div className="flex items-center justify-center w-[76px] flex-none border-r border-slate-200 bg-slate-50/35 group-hover/tr:bg-slate-50/60 text-[#64748b] text-[11px] font-normal tracking-tight px-2 py-1.5 whitespace-nowrap">
                              入库
                            </div>
                            <div
                              className={`flex-1 px-3 py-1.5 flex items-center justify-end font-mono text-[11px] whitespace-nowrap ${(data.isChan || data.isRevenueExpert) && data.historyDebtApproved !== 0 ? "text-rose-600 font-bold" : "text-slate-500"}`}
                            >
                              {fmtDebt(data.historyDebtApproved)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Column 6: 年度累计 */}
                      <td className="p-0 border border-slate-200">
                        <div className="flex flex-col divide-y divide-slate-200 h-full w-full">
                          <div className="flex items-stretch flex-1 min-h-[38px]">
                            <div className="flex items-center justify-center w-[76px] flex-none border-r border-slate-200 bg-slate-50/35 group-hover/tr:bg-slate-50/60 text-[#64748b] text-[11px] font-normal tracking-tight px-2 py-1.5 whitespace-nowrap">
                              已确权
                            </div>
                            <div className="flex-1 px-3 py-1.5 flex items-center justify-end font-mono text-[11px] font-black text-slate-800 whitespace-nowrap">
                              {fmtAmount(data.yearlyIncomeConfirmed)}
                            </div>
                          </div>
                          <div className="flex items-stretch flex-1 min-h-[38px]">
                            <div className="flex items-center justify-center w-[76px] flex-none border-r border-slate-200 bg-slate-50/35 group-hover/tr:bg-slate-50/60 text-[#64748b] text-[11px] font-normal tracking-tight px-2 py-1.5 whitespace-nowrap">
                              入库
                            </div>
                            <div className="flex-1 px-3 py-1.5 flex items-center justify-end font-mono text-[11px] font-black text-slate-800 whitespace-nowrap">
                              {fmtAmount(data.yearlyIncomeApproved)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Column 7: 操作 */}
                      <td className="p-4 border border-slate-200 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {canRegisterPayout && (
                            <button
                              onClick={() => handleOpenBonus(data)}
                              className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm flex items-center gap-1"
                              title="登记承兑发放"
                            >
                              <Wallet size={14} />
                              <span>发放</span>
                            </button>
                          )}
                          <button
                            onClick={() =>
                              setSelectedUser(
                                selectedUser === data.userId
                                  ? null
                                  : data.userId,
                              )
                            }
                            className={`p-2 rounded-xl transition-all ${selectedUser === data.userId ? "bg-blue-600 text-white shadow-lg" : "bg-slate-50 text-slate-400 hover:bg-slate-100"}`}
                          >
                            {selectedUser === data.userId ? (
                              <ChevronUp size={16} />
                            ) : (
                              <ChevronDown size={16} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Drill-down Detail */}
                    <AnimatePresence>
                      {selectedUser === data.userId && (
                        <motion.tr
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-slate-50/80 border-b border-slate-100"
                        >
                          <td colSpan={12} className="p-8">
                            <div className={`grid grid-cols-1 lg:grid-cols-2 gap-12 bg-white ${UI_TOKENS.RADIUS_PANEL} p-10 shadow-inner border border-slate-100`}>
                              {/* Waterfall Steps */}
                              <div className="space-y-6">
                                <h5 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center">
                                  <Calculator
                                    size={14}
                                    className="mr-2 text-blue-600"
                                  />
                                  奖金核算逻辑穿透
                                </h5>
                                <div className="pl-4 border-l-2 border-slate-100 space-y-4">
                                  {(() => {
                                    const kuanTiers = getKuanTheoreticalTiers(data);
                                    let steps: Array<{
                                      label: string;
                                      value?: string;
                                      color?: string;
                                      desc: string;
                                      isFinal?: boolean;
                                      customContent?: React.ReactNode;
                                    }> = [];
                                    const ratioStr = (data.ratio * 100).toFixed(0) + '%';
                                    if (kuanTiers) {
                                      steps = [
                                        {
                                          label: "收款包",
                                          value: fmtAmount(kuanTiers.collectionPackage),
                                          color: "text-indigo-600 font-bold",
                                          desc: "本月确权收款包，计算自实际流水",
                                        },
                                      ];
                                      if (kuanTiers.isManagerKuan) {
                                        steps.push({
                                          label: "单元冗余",
                                          value: fmtAmount(kuanTiers.redundancy),
                                          color: "text-blue-600 font-bold",
                                          desc: "名下单元冗余归集",
                                        });
                                      }
                                      steps.push(
                                        {
                                          label: "总成本对冲",
                                          value: maskMoney(-kuanTiers.totalCost, fmtAmount),
                                          color: "text-rose-500",
                                          desc: maskText(`刚性工资包(${formatAmount(data.salaryPackage)}) + A类消耗(${formatAmount(data.aCostConfirmed)})`),
                                        },
                                        {
                                          label: "理论额度（三档）",
                                          color: "text-amber-600 font-black",
                                          isFinal: true,
                                          desc: "基数(≥0) × 60% / 80% / 100% 梯度测算",
                                          customContent: (
                                            <div className="flex flex-col items-end gap-1 font-mono font-black text-xs text-amber-600">
                                              <div className="flex gap-2 items-center">
                                                <span className="text-slate-400 text-[10px] font-normal">60%:</span>
                                                <span>{fmtAmount(kuanTiers.t60)}</span>
                                              </div>
                                              <div className="flex gap-2 items-center">
                                                <span className="text-slate-400 text-[10px] font-normal">80%:</span>
                                                <span>{fmtAmount(kuanTiers.t80)}</span>
                                              </div>
                                              <div className="flex gap-2 items-center">
                                                <span className="text-slate-400 text-[10px] font-normal">100%:</span>
                                                <span>{fmtAmount(kuanTiers.t100)}</span>
                                              </div>
                                            </div>
                                          ),
                                        }
                                      );
                                    } else if (data.isRevenueExpert) {
                                      steps = [
                                        {
                                          label: "收款包",
                                          value: fmtAmount(data.baseValueConfirmed),
                                          color: "text-indigo-600 font-bold",
                                          desc: "本月确权收款包，计算自实际流水",
                                        },
                                        {
                                          label: "总成本",
                                          value: maskMoney(-(data.salaryPackage + data.aCostConfirmed), fmtAmount),
                                          color: "text-rose-500",
                                          desc: maskText(`刚性工资包(${formatAmount(data.salaryPackage)}) + A类消耗(${formatAmount(data.aCostConfirmed)})`),
                                        },
                                      ];
                                    } else {
                                      steps = [
                                        {
                                          label: "产兑包",
                                          value: fmtAmount(data.baseValueConfirmed),
                                          color: "text-indigo-600 font-bold",
                                          desc: "本月确权产兑包",
                                        },
                                        {
                                          label: "总成本",
                                          value: maskMoney(-(data.salaryPackage + data.bCostConfirmed), fmtAmount),
                                          color: "text-rose-500",
                                          desc: maskText(`刚性工资包(${formatAmount(data.salaryPackage)}) + B1类消耗(${formatAmount(data.bCostConfirmed)})`),
                                        },
                                      ];
                                    }

                                    steps = steps.concat([
                                      {
                                        label: "当月结余",
                                        value: fmtAmount(data.currentSurplus),
                                        color: "text-slate-800 font-bold",
                                        desc: "当月收入 - 当月成本",
                                      },
                                      {
                                        label: "历史欠产包",
                                        value: fmtDebt(data.historyDebt),
                                        color: "text-orange-500",
                                        desc: "本自然年内往期期初欠产积累（每年 1 月清零）",
                                      },
                                      {
                                        label: "分配额度",
                                        value: fmtAmount(data.netRedundancy),
                                        color: "text-blue-600 font-black",
                                        desc: "填平历史欠产后的正式分配额度 (0表示需要结转欠产)",
                                      },
                                      {
                                        label: "提成系数",
                                        value: `x ${ratioStr}`,
                                        color: "text-slate-600",
                                        desc: "系统核定的最终等级提成系数",
                                      },
                                      {
                                        label: "理论分配值",
                                        value: fmtAmount(data.theoreticalBonus),
                                        color: "text-emerald-600 font-black",
                                        isFinal: true,
                                        desc: "基于额度及提成率的实际应当发放理论分配值",
                                      },
                                    ]);

                                    return (
                                      <div className="flex flex-col gap-2">
                                        {steps.map((step, idx) => (
                                          <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.1 }}
                                            className={`group relative p-4 rounded-2xl border transition-all hover:bg-white hover:shadow-md ${step.isFinal ? (kuanTiers ? "bg-amber-50 border-amber-100" : "bg-emerald-50 border-emerald-100") : "bg-slate-50/50 border-slate-100"}`}
                                          >
                                            <div className="flex justify-between items-center relative z-10">
                                              <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                  {step.label}
                                                </span>
                                                <span className="text-[9px] text-slate-400 group-hover:text-slate-600 transition-colors mt-0.5">
                                                  {step.desc}
                                                </span>
                                              </div>
                                              {step.customContent ? (
                                                step.customContent
                                              ) : (
                                                <span
                                                  className={`font-mono font-black text-xs ${step.color}`}
                                                >
                                                  {step.value}
                                                </span>
                                              )}
                                            </div>
                                            {idx < steps.length - 1 && (
                                              <div className="absolute left-6 -bottom-2 w-0.5 h-2 bg-slate-100 group-hover:bg-blue-100 z-0"></div>
                                            )}
                                          </motion.div>
                                        ))}
                                        <motion.div
                                          initial={{ scale: 0.95, opacity: 0 }}
                                          animate={{ scale: 1, opacity: 1 }}
                                          transition={{
                                            delay: steps.length * 0.1,
                                          }}
                                          className="flex justify-between items-center p-5 bg-slate-900 rounded-[2rem] shadow-xl mt-4 border border-blue-500/30"
                                        >
                                          <div>
                                            <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">
                                              本月理论应得奖金
                                            </span>
                                            <p className="text-[8px] text-blue-500/60 uppercase font-black">
                                              Audit Validated · 财务校验通过
                                            </p>
                                          </div>
                                          <div className="text-right">
                                            <span className="font-mono font-black text-2xl text-white">
                                              {fmtAmount(data.netBonusConfirmed)}
                                            </span>
                                          </div>
                                        </motion.div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>

                              {/* Log Details */}
                              <div className="space-y-6">
                                <h5 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center">
                                  <TrendingUp
                                    size={14}
                                    className="mr-2 text-emerald-600"
                                  />
                                  关联确权记录明细
                                </h5>
                                <div className="space-y-3">
                                  {(data.details || []).map((log) => (
                                    <div
                                      key={log.id}
                                      className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between group hover:border-blue-200 transition-all"
                                    >
                                      <div className="flex items-center gap-4">
                                        <div
                                          className={`w-2 h-2 rounded-full ${
                                            log.status === AuditStatus.Approved
                                              ? "bg-emerald-500"
                                              : "bg-blue-400"
                                          }`}
                                        ></div>
                                        <div>
                                          <p className="text-xs font-black text-slate-900 uppercase tracking-tighter">
                                            {log.type}
                                          </p>
                                          <p className="text-[9px] font-bold text-slate-400 uppercase">
                                            {new Date(
                                              log.timestamp,
                                            ).toLocaleString()}{" "}
                                            |{" "}
                                            {log.status === AuditStatus.Approved
                                              ? "入库"
                                              : "已确权"}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-xs font-black font-mono text-slate-700">
                                          {fmtAmount(log.netValue)}
                                        </p>
                                        <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">
                                          {log.category}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Historical Debt Breakdown */}
                              {data.historyRecordsConfirmed && data.historyRecordsConfirmed.length > 0 && (
                                <div className="lg:col-span-2 space-y-6 mt-4">
                                  <h5 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center">
                                    <Calculator size={14} className="mr-2 text-rose-600" />
                                    历史欠产穿透 (自然年内按月滚动，每年 1 月清零)
                                  </h5>
                                  <div className="overflow-x-auto rounded-xl border border-slate-200 custom-scrollbar shadow-sm">
                                    <table className="min-w-full text-slate-700 text-[11px] text-left font-mono border-separate border-spacing-0">
                                      <thead className="bg-slate-50/80 backdrop-blur-sm sticky top-0 z-10">
                                        <tr>
                                          <th className="px-4 py-3 border-r border-b border-slate-200 text-center font-black uppercase text-[9px] text-slate-500 tracking-wider">滚动周期</th>
                                          <th className="px-4 py-3 border-r border-b border-slate-200 text-right text-rose-500 font-black uppercase text-[9px] tracking-wider">期初欠产</th>
                                          <th className="px-4 py-3 border-r border-b border-slate-200 text-right font-black uppercase text-[9px] text-slate-500 tracking-wider">产兑/收款总计</th>
                                          <th className="px-4 py-3 border-r border-b border-slate-200 text-right text-slate-400 font-black uppercase text-[9px] tracking-wider">当月核定总成本</th>
                                          <th className="px-4 py-3 border-r border-b border-slate-200 text-right font-black uppercase text-[9px] text-slate-500 tracking-wider">当月业绩</th>
                                          <th className="px-4 py-3 border-r border-b border-slate-200 text-right text-blue-500 font-black uppercase text-[9px] tracking-wider">分配额度</th>
                                          <th className="px-4 py-3 border-b border-slate-200 text-right text-rose-600 font-black uppercase text-[9px] tracking-wider">期末欠产</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 bg-white">
                                        {data.historyRecordsConfirmed.map((record: any, idx: number) => (
                                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-3 font-bold border-r border-slate-100 text-center">{record.month}</td>
                                            <td className="px-4 py-3 text-right text-rose-500 font-bold border-r border-slate-100">{fmtDebt(record.startDebt)}</td>
                                            <td className="px-4 py-3 text-right text-slate-800 font-bold border-r border-slate-100">{fmtAmount(record.totalIncome)}</td>
                                            <td className="px-4 py-3 text-right text-slate-400 border-r border-slate-100">{fmtAmount(-record.totalCost)}</td>
                                            <td className={`px-4 py-3 text-right font-black border-r border-slate-100 ${record.current > 0 ? "text-emerald-600" : "text-slate-600"}`}>{record.current > 0 ? "+" : ""}{fmtAmount(record.current)}</td>
                                            <td className="px-4 py-3 text-right text-blue-600 font-bold border-r border-slate-100">{fmtAmount(record.quota)}</td>
                                            <td className="px-4 py-3 text-right text-rose-600 font-black">{fmtDebt(record.endDebt)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View Removed - Table is now responsive with scroll */}
        <div className="hidden">
          <AnimatePresence>
            {distributionData.map((data) => {
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
                  className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden"
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
                        className="py-3 px-4 bg-emerald-600 text-white rounded-2xl transition-all flex items-center justify-center gap-1.5 text-xs font-bold shadow-sm hover:bg-emerald-700"
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
                      className={`flex-1 py-3 rounded-2xl transition-all flex items-center justify-center gap-2 ${selectedUser === data.userId ? "bg-blue-600 text-white shadow-lg" : "bg-slate-50 text-slate-400"}`}
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
      <div className={`bg-white ${UI_TOKENS.RADIUS_PANEL} p-8 border border-slate-100 shadow-sm flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h5 className="text-xs font-black text-slate-900 uppercase tracking-widest">
              城市守护者：价值核算与分配原则
            </h5>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
              理论与承兑独立核算 ｜ 历史欠产包动态抵扣 ｜ 金额精确到整数
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
                    <label className="block text-slate-600 font-bold mb-1">理论发放金额</label>
                    <input
                      type="number"
                      disabled
                      value={bonusForm.theoreticalAmount}
                      className="w-full p-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-500 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">实际发放金额 <span className="text-rose-500">*</span></label>
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
                      ⚠️ 实际发放与理论金额存在差异 ({fmtAmount(bonusForm.amount - bonusForm.theoreticalAmount)})
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
                        placeholder="请详细说明金额差异的具体原因..."
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

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
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
      <CityGuardianModal state={modalState} onClose={closeModal} />
    </div>
  );
};

export default Distribution;
