import React, { useState, useMemo } from "react";
import {
  User,
  Role,
  ValueCreationLog,
  AuditStatus,
  RefineCategory,
  RefineType,
  MiningResource,
} from "../types";
import { calculateConsumptionMirrorFields } from "@/utils/business";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  CartesianGrid,
} from "recharts";
import { Card, StatItem, Badge, ProjectStatusBadge } from "@/components/UI";
import { UI_TOKENS } from "@/constants/uiTokens";
import { CostPrivacyToggle } from "@/components/CostPrivacyToggle";
import { useCostPrivacy } from "@/hooks/useCostPrivacy";
import { PieChartCard } from "@/components/PieChartCard";
import { XLSX, exportWorkbook, buildExcelFilename } from "@/utils/excelIo";
import { formatMoney } from "@/utils/formatMoney";
import { TERMINOLOGY } from "@/constants/terminology";
import { UI_LABELS } from "@/constants/uiLabels";
import { isSystemAdmin } from "@/utils/accessControl";
import { isVirtualDeductionMiningId } from "@/utils/virtualDeduction";
import { ConsumptionAudit, AuditApiData } from "@/components/ConsumptionAudit";
import { isProjectWritable } from "@/utils/projectStatus";
import { isNonEffectiveHoursEffective } from "@/utils/employmentStatus";
import { getNonEffectiveHoursDeduction } from "@/utils/nonEffectiveHours";
import { formatCollectorDisplay } from "@/utils/collector";
import { formatAuditStatusLabel } from "@/utils/statusDisplay";
import {
  getLocalDateString,
  getLocalMonthString,
  resolveLogBusinessDate,
  resolveLogBusinessMonth,
  formatSubmissionDate,
  formatSubmissionTime,
  isDateInRange,
  isLogInFilter,
} from "@/utils/dateUtils";
import { InfoTip } from "@/components/InfoTip";
import { BusinessDateFilter } from "@/components/BusinessDateFilter";

import { fetchWorkspaceData } from "@/api/workspace";
import { toast } from "sonner";
import { CityGuardianModal, useCityGuardianModal } from "@/components/CityGuardianModal";

interface AuditingProps {
  user: User;
  logs: ValueCreationLog[];
  users: User[];
  resources: MiningResource[];
  onAudit: (logId: string, status: AuditStatus, verifiedAmount?: number, auditNotes?: string) => void;
  processingLogIds?: Set<string>;
  onRefreshWorkspace?: () => Promise<void>;
  onDeleteLog?: (logId: string) => void;
}

const Auditing: React.FC<AuditingProps> = ({
  user,
  logs,
  users,
  resources,
  onAudit,
  processingLogIds = new Set(),
  onRefreshWorkspace,
  onDeleteLog,
}) => {
  const { modalState, showAlert, showConfirm, closeModal } = useCityGuardianModal();
  const { isCostVisible, toggleCostVisible, maskMoney, maskText } = useCostPrivacy();
  const [activeTab, setActiveTab] = useState<
    "pending" | "confirmed" | "history" | "summary" | "linked" | "consumption"
  >("pending");
  const [confirmingLog, setConfirmingLog] = useState<ValueCreationLog | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Map ValueCreationLog (from audit list) to AuditApiData required by ConsumptionAudit
  const mappedAuditApiData = useMemo<AuditApiData | null>(() => {
    if (!confirmingLog) return null;
    
    let activeType: 'A' | 'B1' | 'B2' | 'C' = 'A';
    if (confirmingLog.costCategory === 'A') {
      activeType = 'A';
    } else if (confirmingLog.costCategory === 'C') {
      activeType = 'C';
    } else if (confirmingLog.costCategory === 'B') {
      if (confirmingLog.valueConsumptionMode === 'B2') {
        activeType = 'B2';
      } else {
        activeType = 'B1';
      }
    }

    const logUser = users.find(u => u.id === confirmingLog.rankId || u.userId === confirmingLog.rankId);
    const mineObj = resources.find(r => r.id === confirmingLog.miningId);

    return {
      id: confirmingLog.id,
      operatingUnit: logUser?.center || user.center || "未分配",
      miningId: confirmingLog.miningId,
      miningName: mineObj ? `选区-${mineObj.id}` : "主力生产选选厂厂",
      type: activeType,
      basePoints: confirmingLog.amount || 0,
      calculatedValue: confirmingLog.dynamicCost || 0,
    };
  }, [confirmingLog, users, resources, user.center]);
  // 默认当前月份与自定义区间（互斥）
  const [selectedMonth, setSelectedMonth] = useState(() => getLocalMonthString());
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const isNpcxie = user.role === Role.npcxie;
  const isAdmin = isSystemAdmin(user);

  // 根据选择的月份或业务日区间过滤日志
  const monthlyLogs = useMemo(() => {
    return logs.filter((log) => isLogInFilter(log, selectedMonth, startDate, endDate));
  }, [logs, selectedMonth, startDate, endDate]);

  // 1. 收款确权待办任务（收款类，来自价值创造组件）
  const auditTasks = useMemo(
    () =>
      monthlyLogs.filter((log) => {
        const isPending = log.status === AuditStatus.Pending;
        if (!isPending) return false;

        // 只接收：收款类的确权申报（来自价值创造组件）
        if (log.category !== RefineCategory.Revenue || log.dynamicCost > 0) return false;

        // 审计员 (npcxie) 或 管理员可以确权
        return isAdmin || isNpcxie;
      }),
    [monthlyLogs, isNpcxie, isAdmin],
  );

  // 1.5. 联动确权任务过滤逻辑（产值类，来自价值创造组件）
  const linkedTasks = useMemo(
    () =>
      monthlyLogs.filter((log) => {
        // 只接收：产值类的确权申报（来自价值创造组件）
        return (
          log.category === RefineCategory.Value &&
          log.dynamicCost === 0 &&
          (log.status === AuditStatus.Pending || log.status === AuditStatus.Confirmed)
        );
      }),
    [monthlyLogs],
  );

  // 1.6. 已确权任务过滤逻辑 (全部已确权，包含收款类与产值类最终结果)
  const confirmedTasks = useMemo(
    () =>
      monthlyLogs.filter((log) => {
        return log.status === AuditStatus.Confirmed;
      }),
    [monthlyLogs],
  );

  // 1.7. 消耗记录过滤逻辑（只接收动态消耗申请组件）
  const consumptionTasks = useMemo(
    () =>
      monthlyLogs.filter((log) => {
        return (log.dynamicCost > 0 || log.confirmationType === '手动确权') && log.status === AuditStatus.Pending;
      }),
    [monthlyLogs],
  );

  // 2. 历史记录过滤逻辑
  const historyTasks = useMemo(() => {
    return monthlyLogs
      .filter((log) => log.dynamicCost > 0 || log.confirmationType === '手动确权')
      .reverse();
  }, [monthlyLogs]);

  // 3. 汇总数据计算逻辑
  const summaryData = useMemo(() => {
    const approved = monthlyLogs.filter(
      (l) => l.status === AuditStatus.Approved,
    );

    // 毛产出 (amount > 0)
    const grossValue = approved
      .filter((l) => l.amount > 0)
      .reduce((acc, curr) => acc + curr.netValue, 0);
    // 动态消耗 (dynamicCost > 0)
    const totalConsumption = approved.reduce(
      (acc, curr) =>
        acc +
        (curr.costCategory === "C"
          ? Math.abs(curr.netValue)
          : isNonEffectiveHoursEffective(curr)
          ? getNonEffectiveHoursDeduction(curr)
          : curr.dynamicCost || 0),
      0,
    );
    // 实际净值 (对冲后)
    const netValue = approved.reduce((acc, curr) => acc + curr.netValue, 0);

    // 非有效工时对冲总额
    const rigidDeduction = monthlyLogs
      .filter((l) => {
        if (!isNonEffectiveHoursEffective(l)) return false;
        const collector = users.find((u) => u.id === l.recordedCollectorId);
        return collector?.category !== "VP";
      })
      .reduce((acc, curr) => acc + getNonEffectiveHoursDeduction(curr), 0);

    const categoryStats = [
      {
        name: " 收款 (已确权收款)",
        value: approved
          .filter((l) => l.category === RefineCategory.Revenue && l.amount > 0)
          .reduce((acc, curr) => acc + curr.netValue, 0),
        color: "#FBBF24",
      },
      {
        name: " 产值 (已确权产值)",
        value: approved
          .filter((l) => l.category === RefineCategory.Value && l.amount > 0)
          .reduce((acc, curr) => acc + curr.netValue, 0),
        color: "#10B981",
      },
    ];

    const costStats = [
      {
        name: "A",
        value: approved
          .filter((l) => l.costCategory === "A")
          .reduce((acc, curr) => acc + curr.dynamicCost, 0),
        color: "#F43F5E",
      },
      {
        name: "B1",
        value: approved
          .filter(
            (l) => l.costCategory === "B" && l.valueConsumptionMode === "B1",
          )
          .reduce((acc, curr) => acc + curr.dynamicCost, 0),
        color: "#FB7185",
      },
      {
        name: "B2",
        value: approved
          .filter(
            (l) => l.costCategory === "B" && l.valueConsumptionMode === "B2",
          )
          .reduce((acc, curr) => acc + curr.dynamicCost, 0),
        color: "#FDA4AF",
      },
      {
        name: "C",
        value: approved
          .filter((l) => l.costCategory === "C")
          .reduce((acc, curr) => acc + Math.abs(curr.netValue), 0),
        color: "#FECDD3",
      },
      {
        name: "工时对冲",
        value: approved
          .filter((l) => isNonEffectiveHoursEffective(l))
          .reduce((acc, curr) => acc + getNonEffectiveHoursDeduction(curr), 0),
        color: "#8b5cf6",
      },
    ].filter((item) => item.value > 0);

    // 按角色统计
    const roleStatsMap: Record<string, number> = {};
    approved.forEach((l) => {
      const op = users.find((u) => u.id === l.rankId);
      const roleName = op ? op.category || op.role : "未知角色";
      roleStatsMap[roleName] = (roleStatsMap[roleName] || 0) + l.netValue;
    });

    const roleStats = Object.entries(roleStatsMap)
      .map(([name, value]) => ({
        name,
        value,
        color: (name?.includes("经理") || name === 'rank')
          ? "#3B82F6"
          : name?.includes("NPC")
            ? "#8B5CF6"
            : name?.includes("责任人")
              ? "#F59E0B"
              : "#10B981",
      }))
      .sort((a, b) => b.value - a.value);

    return {
      grossValue,
      totalConsumption,
      netValue,
      rigidDeduction,
      categoryStats,
      costStats,
      roleStats,
    };
  }, [monthlyLogs, users]);

  // 4. 积分看板计算逻辑 (数据来源：价值创造的注入量)
  const quadrants = useMemo(() => {
	// 产值积分看板
    const valueLogs = monthlyLogs.filter(l => l.category === RefineCategory.Value);
    const pendingValue = valueLogs.filter(l => l.status === AuditStatus.Pending).reduce((sum, l) => sum + l.amount, 0);
    const confirmedValue = valueLogs.filter(l => l.status === AuditStatus.Confirmed).reduce((sum, l) => sum + l.amount, 0);
    const approvedValue = valueLogs.filter(l => l.status === AuditStatus.Approved).reduce((sum, l) => sum + l.amount, 0);
    
    // 未确权 = 初限 - 待确权 - 已确权 - 入库 (amount 维度)
    const totalValueInitial = resources.reduce((sum, r) => sum + (r.initialValueCapacity || r.valueCapacity || 0), 0);
    const totalValueConfirmed = resources.reduce((sum, r) => sum + (r.confirmedValue || 0), 0);
    const totalValuePending = resources.reduce((sum, r) => sum + (r.pendingValue || 0), 0);
    const totalValueMined = resources.reduce((sum, r) => sum + (r.minedValue || 0), 0);
    const unconfirmedValue = Math.max(0, totalValueInitial - totalValueConfirmed - totalValuePending - totalValueMined);
    
    // 收款积分看板
    const revenueLogs = monthlyLogs.filter(l => l.category === RefineCategory.Revenue);
    const pendingRevenue = revenueLogs.filter(l => l.status === AuditStatus.Pending).reduce((sum, l) => sum + l.amount, 0);
    const confirmedRevenue = revenueLogs.filter(l => l.status === AuditStatus.Confirmed).reduce((sum, l) => sum + l.amount, 0);
    const approvedRevenue = revenueLogs.filter(l => l.status === AuditStatus.Approved).reduce((sum, l) => sum + l.amount, 0);
    
    const totalRevenueInitial = resources.reduce((sum, r) => sum + (r.initialRevenueCapacity || r.revenueCapacity || 0), 0);
    const totalRevenueConfirmed = resources.reduce((sum, r) => sum + (r.confirmedRevenue || 0), 0);
    const totalRevenuePending = resources.reduce((sum, r) => sum + (r.pendingRevenue || 0), 0);
    const totalRevenueMined = resources.reduce((sum, r) => sum + (r.minedRevenue || 0), 0);
    const unconfirmedRevenue = Math.max(0, totalRevenueInitial - totalRevenueConfirmed - totalRevenuePending - totalRevenueMined);

    return {
        value: { pending: pendingValue, confirmed: confirmedValue, unconfirmed: unconfirmedValue, approved: approvedValue },
        revenue: { pending: pendingRevenue, confirmed: confirmedRevenue, unconfirmed: unconfirmedRevenue, approved: approvedRevenue }
    };
  }, [monthlyLogs, resources]);

  const handleAction = (
    log: ValueCreationLog,
    action: "approve" | "reject",
  ) => {
    let nextStatus: AuditStatus = log.status;
    if (action === "reject") {
      nextStatus = AuditStatus.Rejected;
    } else {
      nextStatus = AuditStatus.Confirmed;
    }
    onAudit(log.id, nextStatus);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefreshWorkspace) {
        await onRefreshWorkspace();
      } else {
        await fetchWorkspaceData();
      }
      toast.success("已成功从数据库/工作区拉取最新确权数据");
    } catch (err) {
      toast.error("拉取工作区数据失败，请检查网络连接");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCheckInventory = () => {
    toast.info("【说明】入库检查为合规与指标逻辑校验，非数据库写库指令。");
  };

  const exportToExcel = () => {
    const dataToExport = (() => {
      switch (activeTab) {
        case "pending":
          return auditTasks;
        case "linked":
          return linkedTasks;
        case "consumption":
          return consumptionTasks;
        case "confirmed":
          return confirmedTasks;
        default:
          return historyTasks;
      }
    })().map((log) => {
      if (activeTab === "history" || activeTab === "consumption") {
        const { cWeightValue, b2WeightValue, revLimitStr, valLimitCStr, valLimitB2Str } = calculateConsumptionMirrorFields(log, resources, logs);
        
        return {
          '申报编号': log.id,
          '提报日期': resolveLogBusinessDate(log),
          '提报时间': formatSubmissionTime(log.timestamp),
          '矿山编号': log.miningId,
          '采集主体': users.find(u => u.id === log.recordedCollectorId)?.name || log.recordedCollectorId,
          '经营单元': users.find(u => u.id === log.rankId)?.center || "未分配",
          '非效对冲': (log.type === RefineType.NonEffectiveHours || isNonEffectiveHoursEffective(log)) ? getNonEffectiveHoursDeduction(log) : '-',
          'A': log.costCategory === 'A' ? log.dynamicCost : '-',
          'C积分': log.costCategory === 'C' ? log.dynamicCost : '-',
          'C权': cWeightValue,
          '款初/款当': revLimitStr,
          '产初/产当': valLimitCStr,
          'B1': (log.costCategory === 'B' && log.valueConsumptionMode === 'B1') ? log.dynamicCost : '-',
          'B2积分': (log.costCategory === 'B' && log.valueConsumptionMode === 'B2') ? log.dynamicCost : '-',
          'B2权': b2WeightValue,
          '产初/产当 ': valLimitB2Str,
          '确权日期': log.confirmedAt ? new Date(log.confirmedAt).toLocaleString() : '-',
          '确权状态': log.status === AuditStatus.Approved ? '入库' : log.status
        };
      } else {
        return {
          编号: log.id,
          业务日期: resolveLogBusinessDate(log),
          确权日期: log.confirmedAt ? new Date(log.confirmedAt).toLocaleString() : '-',
          提交日期: formatSubmissionDate(log.timestamp),
          类别: log.type,
          矿山编号: log.miningId,
          确权类型: log.confirmationType || "收款确权",
          申请角色: log.rankId,
          采集主体:
            users.find((u) => u.id === log.recordedCollectorId)?.name ||
            log.recordedCollectorId ||
            "系统",
          注入积分: log.amount,
          A: log.costCategory === "A" ? log.dynamicCost : 0,
          B1:
            log.costCategory === "B" && log.valueConsumptionMode === "B1"
              ? log.dynamicCost
              : 0,
          B2:
            log.costCategory === "B" && log.valueConsumptionMode === "B2"
              ? log.dynamicCost
              : 0,
          消耗分类: log.costCategory || "N/A",
          [activeTab === "pending" ? "收款包" : (activeTab === "linked" ? "产兑包" : "收款包/产兑包")]: log.netValue,
          状态: log.status === AuditStatus.Approved ? '入库' : log.status,
        };
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    const sheetName =
      activeTab === "pending"
        ? "待处理确权"
        : activeTab === "consumption"
          ? "消耗确权记录"
          : activeTab === "linked"
            ? "联动确权记录"
            : activeTab === "confirmed"
              ? "已确权记录"
              : "成本审计记录";
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      sheetName,
    );
    exportWorkbook(
      workbook,
      buildExcelFilename(sheetName, selectedMonth)
    );
  };

  const getMonthList = () => {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      );
    }
    return months;
  };

  return (
    <div className="w-full space-y-4 md:space-y-6 lg:space-y-8 animate-in fade-in duration-500 pb-6">
      <ConsumptionAudit 
        isOpen={!!confirmingLog}
        onClose={() => setConfirmingLog(null)}
        auditData={mappedAuditApiData}
        onConfirm={async (id, finalConfirmedValue, auditNotes) => {
          onAudit(id, AuditStatus.Confirmed, finalConfirmedValue, auditNotes);
        }}
      />
      {/* 单层统一工具条（合并确权规则与标题导航） */}
      <div className="bg-white p-4 md:p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md">
            🛡️
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight uppercase">
                价值确权与月度结算
              </h3>
              <InfoTip 
                title="收款确权流转规则" 
                content="已确权收款：在价值确权中由 npcxie 手动确认后转为已确权收款。自动入库：已确权收款 = 已确权产值 = 款初 = 产初，满90天储期后自动入库。" 
              />
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-0.5">
              采集主体：{user.name} ({user.role}) · 依据 7.1 分配律实时校验
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-black text-slate-700">{user.name}</span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100 transition-all active:scale-95 ${isRefreshing ? "opacity-50 cursor-not-allowed" : ""}`}
            title="刷新数据"
          >
            <svg
              className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* 标签切换栏 */}
      <div className="bg-white p-3 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between">
        <div className="flex flex-wrap bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner gap-1">
            <button
              onClick={() => setActiveTab("pending")}
              title="查看待处理的价值确权任务"
              className={`px-4 md:px-6 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all flex items-center space-x-2 ${activeTab === "pending" ? "bg-white text-slate-900 shadow-xl scale-105" : "text-slate-400 hover:text-slate-600"}`}
            >
              <span>收款确权</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[8px] ${activeTab === "pending" ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"}`}
              >
                {auditTasks.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("linked")}
              title="查看自动联动确权记录"
              className={`px-4 md:px-6 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all flex items-center space-x-2 ${activeTab === "linked" ? "bg-white text-slate-900 shadow-xl scale-105" : "text-slate-400 hover:text-slate-600"}`}
            >
              <span>联动确权</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[8px] ${activeTab === "linked" ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"}`}
              >
                {linkedTasks.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("consumption")}
              title="查看待处理消耗确权任务"
              className={`px-4 md:px-6 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all flex items-center space-x-2 ${activeTab === "consumption" ? "bg-white text-slate-900 shadow-xl scale-105" : "text-slate-400 hover:text-slate-600"}`}
            >
              <span>消耗确权</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[8px] ${activeTab === "consumption" ? "bg-rose-600 text-white" : "bg-slate-200 text-slate-500"}`}
              >
                {consumptionTasks.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("confirmed")}
              title="查看所有已确权记录"
              className={`px-4 md:px-6 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all flex items-center space-x-2 ${activeTab === "confirmed" ? "bg-white text-slate-900 shadow-xl scale-105" : "text-slate-400 hover:text-slate-600"}`}
            >
              <span>已确权记录</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[8px] ${activeTab === "confirmed" ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"}`}
              >
                {confirmedTasks.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("summary")}
              title="分析本周期的经营数据汇总"
              className={`px-4 md:px-6 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all flex items-center space-x-2 ${activeTab === "summary" ? "bg-white text-slate-900 shadow-xl scale-105" : "text-slate-400 hover:text-slate-600"}`}
            >
              <span>周期分析</span>
            </button>
            <button
              onClick={() => setActiveTab("history")}
              title="成本审计记录回溯"
              className={`px-4 md:px-6 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all flex items-center space-x-2 ${activeTab === "history" ? "bg-white text-slate-900 shadow-xl scale-105" : "text-slate-400 hover:text-slate-600"}`}
            >
              <span>成本审计记录</span>
            </button>
            <CostPrivacyToggle size="sm" />
          </div>
        </div>

      {activeTab === "summary" && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
          {/* 价值动态流 */}
          <div className={`p-6 bg-slate-50/50 border border-slate-200 ${UI_TOKENS.RADIUS_PANEL}`}>
            {/* 价值分配 - 重新分配双行显示 */}
            <div className="grid grid-cols-1 gap-6 mb-8">
              {/* 第一行：产值 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {['产值分配', '产值对冲进度', '历史滚动产值欠产', '产值年度累计'].map((title, i) => (
                  <div key={i} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">{title}</h3>
                    <div className="flex justify-between text-[11px]">
                       <span>入库: <span className="font-mono font-bold text-slate-700">$0</span></span>
                       <span>已确权: <span className="font-mono font-bold text-slate-700">$0</span></span>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* 第二行：收款 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {['收款分配', '收款对冲进度', '历史滚动收款欠产', '收款年度累计'].map((title, i) => (
                  <div key={i} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">{title}</h3>
                    <div className="flex justify-between text-[11px]">
                       <span>入库: <span className="font-mono font-bold text-slate-700">$0</span></span>
                       <span>已确权: <span className="font-mono font-bold text-slate-700">$0</span></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* 产值 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-rose-700 uppercase tracking-widest flex items-center">
                    <span className="w-1.5 h-3.5 bg-rose-500 mr-2 rounded-full"></span>
                    {UI_LABELS.VALUE}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.PENDING}</p>
                    <p className="text-xs font-black text-amber-600 font-mono">{formatMoney(quadrants.value.pending)}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.CONFIRMED}</p>
                    <p className="text-xs font-black text-emerald-600 font-mono">{formatMoney(quadrants.value.confirmed)}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.UNCONFIRMED}</p>
                    <p className="text-xs font-black text-rose-600 font-mono">{formatMoney(quadrants.value.unconfirmed)}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.MINED}</p>
                    <p className="text-xs font-black text-blue-600 font-mono">{formatMoney(quadrants.value.approved)}</p>
                  </div>
                </div>
              </div>

              {/* 收款 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-yellow-700 uppercase tracking-widest flex items-center">
                    <span className="w-1.5 h-3.5 bg-yellow-500 mr-2 rounded-full"></span>
                    {UI_LABELS.REVENUE}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.PENDING}</p>
                    <p className="text-xs font-black text-amber-600 font-mono">{formatMoney(quadrants.revenue.pending)}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.CONFIRMED}</p>
                    <p className="text-xs font-black text-emerald-600 font-mono">{formatMoney(quadrants.revenue.confirmed)}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.UNCONFIRMED}</p>
                    <p className="text-xs font-black text-rose-600 font-mono">{formatMoney(quadrants.revenue.unconfirmed)}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-sm border border-slate-200 shadow-sm text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{UI_LABELS.MINED}</p>
                    <p className="text-xs font-black text-blue-600 font-mono">{formatMoney(quadrants.revenue.approved)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* KPI 对冲看板 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className={`p-8 ${UI_TOKENS.RADIUS_CARD} group`}>
              <div className="absolute top-0 right-0 p-6 opacity-10 text-4xl group-hover:scale-110 transition-transform">
                📈
              </div>
              <StatItem
                label="周期毛产出总值"
                value={`${formatMoney(summaryData.grossValue)}`}
                subValue="基于 A/B/C 系数前置计算"
              />
            </Card>
            <Card className={`p-8 ${UI_TOKENS.RADIUS_CARD} group`}>
              <div className="absolute top-0 right-0 p-6 opacity-10 text-4xl group-hover:scale-110 transition-transform text-rose-500">
                📉
              </div>
              <StatItem
                label="周期动态消耗总额"
                value={`-${maskMoney(summaryData.totalConsumption)}`}
                className="text-rose-600"
              />
              <div className="mt-4 flex space-x-2">
                {summaryData.costStats.map((s) => (
                  <Badge key={s.name}>
                    {s.name}: {maskMoney(Math.round(s.value))}
                  </Badge>
                ))}
              </div>
            </Card>
            <Card className={`p-8 ${UI_TOKENS.RADIUS_CARD} border-rose-200 bg-rose-50/30 group`}>
              <div className="absolute top-0 right-0 p-6 opacity-10 text-4xl group-hover:scale-110 transition-transform text-rose-600">
                ✂️
              </div>
              <StatItem
                label="周期刚性工资对冲"
                value={`${maskMoney(summaryData.rigidDeduction)}`}
                className="text-rose-700"
              />
              <p className="text-[9px] font-bold text-rose-400 uppercase tracking-widest mt-2">
                冲抵采集主体刚性工资包
              </p>
            </Card>
            <Card className={`p-8 ${UI_TOKENS.RADIUS_CARD} bg-slate-900 text-white shadow-2xl group`}>
              <div className="absolute top-0 right-0 p-6 opacity-20 text-4xl group-hover:scale-110 transition-transform text-emerald-400">
                ✨
              </div>
              <p className="text-emerald-400 text-[10px] font-black uppercase tracking-widest mb-3">
                周期确权净入库
              </p>
              <h4 className="text-4xl font-black font-mono tracking-tighter">
                {formatMoney(summaryData.netValue)}
              </h4>
              <div className="mt-4 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">
                  已完成周期对冲核算
                </span>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <PieChartCard
              title="确权资产结构 (毛值)"
              icon=""
              iconBgColor="bg-blue-50"
              iconTextColor="text-blue-600"
              data={summaryData.categoryStats}
            />
            <PieChartCard
              title="角色确权贡献分布 (收产包)"
              icon="👥"
              iconBgColor="bg-purple-50"
              iconTextColor="text-purple-600"
              data={summaryData.roleStats}
              paddingAngle={5}
            />
            <div className={`bg-white p-10 ${UI_TOKENS.RADIUS_PANEL} border border-slate-100 shadow-xl`}>
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-10 flex items-center">
                <span className="w-8 h-8 bg-rose-50 rounded-lg flex items-center justify-center text-rose-600 mr-3">
                  📉
                </span>
                动态消耗分摊结构
              </h4>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summaryData.costStats}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#f1f5f9"
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fontSize: 10,
                        fontWeight: "bold",
                        fill: "#94a3b8",
                      }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fontSize: 10,
                        fontWeight: "bold",
                        fill: "#94a3b8",
                      }}
                    />
                    <Tooltip
                      cursor={{ fill: "#f8fafc" }}
                      contentStyle={{
                        borderRadius: "15px",
                        border: "none",
                        boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                      }}
                    />
                    <Bar dataKey="value" radius={[10, 10, 0, 0]} barSize={40}>
                      {summaryData.costStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

        <Card
          title={
            activeTab === "pending"
              ? `周期待处理确权 (${auditTasks.length})`
              : activeTab === "consumption"
                ? `待处理消耗确权 (${consumptionTasks.length})`
                : activeTab === "linked"
                  ? "联动确权记录"
                  : activeTab === "confirmed"
                    ? "已确权记录"
                    : "成本审计记录"
          }
          noPadding
          className={`rounded-[2rem] md:${UI_TOKENS.RADIUS_PANEL} overflow-hidden`}
          headerAction={
            <div className="flex flex-wrap items-center justify-end gap-3">
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
                }}
                onClear={() => {
                  setSelectedMonth(getLocalMonthString());
                  setStartDate('');
                  setEndDate('');
                }}
              />

              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={`px-3 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all flex items-center ${isRefreshing ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <svg
                  className={`w-3 h-3 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {isRefreshing ? "刷新中..." : "刷新"}
              </button>
              {activeTab !== "history" && (
                <button
                  onClick={handleCheckInventory}
                  className="px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all flex items-center"
                >
                  <svg
                    className="w-3 h-3 mr-1.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                    />
                  </svg>
                  入库检查
                </button>
              )}
              <button
                onClick={exportToExcel}
                className="px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center"
              >
                <svg
                  className="w-3 h-3 mr-1.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                导出
              </button>
              <div className="hidden sm:flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span className="text-[8px] font-black text-slate-400 uppercase">
                  产出申请
                </span>
              </div>
              <div className="hidden sm:flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <span className="text-[8px] font-black text-slate-400 uppercase">
                  消耗申报
                </span>
              </div>
            </div>
          }
        >
          <div
            className={`overflow-x-auto -mx-4 px-4 md:-mx-10 md:px-10 transition-opacity duration-300 ${isRefreshing ? "opacity-30 pointer-events-none" : "opacity-100"}`}
          >
            {(activeTab === "history" || activeTab === "consumption") ? (
              <table className="w-full text-left min-w-[1600px] border-collapse">
                <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 whitespace-nowrap">
                  <tr>
                    <th className="px-4 py-6 whitespace-nowrap min-w-[90px]">申报编号</th>
                    <th className="px-4 py-6 whitespace-nowrap min-w-[90px]">业务日期</th>
                    <th className="px-4 py-6 whitespace-nowrap min-w-[90px]">提报日期</th>
                    <th className="px-4 py-6 whitespace-nowrap min-w-[80px]">提炼类型</th>
                    <th className="px-4 py-6 text-center whitespace-nowrap min-w-[80px]">{TERMINOLOGY.BUSINESS_UNIT}</th>
                    <th className="px-4 py-6 font-bold text-slate-800 whitespace-nowrap min-w-[80px]">{TERMINOLOGY.LOG_OPERATOR_ID}</th>
                    <th className="px-3 py-6 text-right text-indigo-600 whitespace-nowrap min-w-[80px]">非效对冲</th>
                    <th className="px-3 py-6 text-right text-blue-600 whitespace-nowrap min-w-[50px]">A</th>
                    <th className="px-3 py-6 text-right text-amber-600 whitespace-nowrap min-w-[70px]">C积分</th>
                    <th className="px-4 py-6 text-right text-amber-700 font-extrabold bg-amber-50/20 whitespace-nowrap min-w-[50px]">C权</th>
                    <th className="px-4 py-6 text-right text-amber-800 font-extrabold bg-amber-50/10 whitespace-nowrap min-w-[110px]">款初/款当</th>
                    <th className="px-4 py-6 text-right text-amber-900 font-extrabold bg-amber-50/15 whitespace-nowrap min-w-[110px]">产初/产当</th>
                    <th className="px-3 py-6 text-right text-rose-600 whitespace-nowrap min-w-[50px]">B1</th>
                    <th className="px-3 py-6 text-right text-emerald-600 whitespace-nowrap min-w-[70px]">B2积分</th>
                    <th className="px-4 py-6 text-right text-emerald-700 font-extrabold bg-emerald-50/20 whitespace-nowrap min-w-[50px]">B2权</th>
                    <th className="px-4 py-6 text-right text-emerald-800 font-extrabold bg-emerald-50/10 whitespace-nowrap min-w-[110px]">产初/产当</th>
                    <th className="px-6 py-6 text-center whitespace-nowrap min-w-[90px]">确权日期</th>
                    <th className="px-6 py-6 text-right whitespace-nowrap min-w-[80px]">确权状态</th>
                    {activeTab === "consumption" && <th className="px-4 py-6 text-right whitespace-nowrap min-w-[90px]">操作控制</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(activeTab === "history" ? historyTasks : consumptionTasks).map((log) => {
                    if (!log) return null;
                    const { cWeightValue, b2WeightValue, revLimitStr, valLimitCStr, valLimitB2Str } = calculateConsumptionMirrorFields(log, resources, logs);
                    
                    const collectorDisplay = formatCollectorDisplay(log.recordedCollectorId, users);

                    return (
                      <tr key={log.id} className="hover:bg-rose-50/30 transition-colors group">
                        <td className="px-4 py-6">
                          <span className="font-mono text-[11px] font-black text-slate-900 group-hover:text-rose-600">#{log.id}</span>
                        </td>
                        <td className="px-4 py-6 text-[10px] font-mono font-bold text-slate-600">{resolveLogBusinessDate(log)} ({resolveLogBusinessMonth(log)})</td>
                        <td className="px-4 py-6 text-[10px] font-mono text-slate-500">{formatSubmissionDate(log.timestamp)}</td>
                        <td className="px-4 py-6 text-[10px] font-black text-slate-500">{log.type}</td>
                        <td className="px-4 py-6 text-center">
                            <span className="text-xs font-black text-slate-900 block">
                              {users.find((u) => u.id === log.rankId)?.center || "未分配"}
                            </span>
                        </td>
                        <td className="px-4 py-6 font-bold text-slate-900 text-xs">{collectorDisplay}</td>
                        <td className="px-3 py-6 text-right font-mono font-bold text-indigo-600">
                          {(log.type === RefineType.NonEffectiveHours || isNonEffectiveHoursEffective(log)) ? maskMoney(Math.round(getNonEffectiveHoursDeduction(log))) : '-'}
                        </td>
                        <td className="px-3 py-6 text-right font-mono font-bold text-blue-600">
                          {log.costCategory === 'A' ? maskMoney(Math.round(log.dynamicCost)) : '-'}
                        </td>
                        <td className="px-3 py-6 text-right font-mono font-bold text-amber-600 font-extrabold">
                          {log.costCategory === 'C' ? maskMoney(Math.round(log.dynamicCost)) : '-'}
                        </td>
                        <td className="px-4 py-6 text-right font-mono font-black text-amber-700 bg-amber-50/20">
                          {cWeightValue}
                        </td>
                        <td className="px-4 py-6 text-right font-mono font-bold text-amber-800 bg-amber-50/10">
                          {revLimitStr}
                        </td>
                        <td className="px-4 py-6 text-right font-mono font-bold text-amber-900 bg-amber-50/15">
                          {valLimitCStr}
                        </td>
                        <td className="px-3 py-6 text-right font-mono font-bold text-rose-600">
                          {(log.costCategory === 'B' && log.valueConsumptionMode === 'B1') ? maskMoney(Math.round(log.dynamicCost)) : '-'}
                        </td>
                        <td className="px-3 py-6 text-right font-mono font-bold text-emerald-600 font-extrabold">
                          {(log.costCategory === 'B' && log.valueConsumptionMode === 'B2') ? maskMoney(Math.round(log.dynamicCost)) : '-'}
                        </td>
                        <td className="px-4 py-6 text-right font-mono font-black text-emerald-700 bg-emerald-50/20">
                          {b2WeightValue}
                        </td>
                        <td className="px-4 py-6 text-right font-mono font-bold text-emerald-800 bg-emerald-50/10">
                          {valLimitB2Str}
                        </td>
                        <td className="px-6 py-6 text-center">
                          <span className="text-[10px] font-mono font-bold text-slate-500 whitespace-nowrap">
                            {log.confirmedAt ? new Date(log.confirmedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                          </span>
                        </td>
                        <td className="px-6 py-6 text-right">
                          <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                            log.status === AuditStatus.Approved ? 'bg-emerald-100 text-emerald-700' : 
                            log.status === AuditStatus.Rejected ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {formatAuditStatusLabel(log.status)}
                          </span>
                        </td>
                        {activeTab === "consumption" && (
                          <td className="px-4 py-6 text-right">
                            <div className="flex items-center justify-end space-x-2">
                                <button
                                    onClick={() => handleAction(log, "reject")}
                                    disabled={processingLogIds.has(log.id) || !(log.miningId === 'SYSTEM_DEDUCTION' || log.type === RefineType.NonEffectiveHours || isProjectWritable(resources.find(r => r.id === log.miningId)))}
                                    className="px-3 py-1 border border-rose-100 text-rose-500 text-[9px] font-black uppercase rounded hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    驳回
                                </button>
                                <button
                                    onClick={() => setConfirmingLog(log)}
                                    disabled={processingLogIds.has(log.id) || !(log.miningId === 'SYSTEM_DEDUCTION' || log.type === RefineType.NonEffectiveHours || isProjectWritable(resources.find(r => r.id === log.miningId)))}
                                    className="px-3 py-1 bg-slate-900 text-white text-[9px] font-black uppercase rounded hover:bg-blue-600 shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    确权审核
                                </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {(activeTab === "history" ? historyTasks.length : consumptionTasks.length) === 0 && (
                    <tr>
                      <td colSpan={activeTab === "consumption" ? 18 : 17} className="py-20 text-center opacity-20 text-xs font-black uppercase tracking-widest">
                        当前结算周期内无任何{activeTab === "consumption" ? "消耗确权任务" : "成本审计记录"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left min-w-[1000px]">
                <thead>
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">
                    <th className="px-4 md:px-10 py-6">标识符/日期</th>
                    <th className="px-4 md:px-6 py-6">{TERMINOLOGY.BUSINESS_UNIT}</th>
                    <th className="hidden lg:table-cell px-6 py-6">
                      经理/水库
                    </th>
                    <th className="hidden md:table-cell px-6 py-6">{TERMINOLOGY.LOG_OPERATOR_ID}</th>
                    <th className="px-4 md:px-6 py-6 text-right">注入积分</th>
                    {(activeTab === "linked" ||
                      activeTab === "confirmed") && (
                      <>
                        <th className="hidden xl:table-cell px-6 py-6 text-center">
                          确权时间
                        </th>
                        <th className="hidden xl:table-cell px-6 py-6 text-center">
                          预计入库
                        </th>
                      </>
                    )}
                    <th className="px-4 md:px-6 py-6 text-right">
                      {activeTab === "pending" ? "收款包" : (activeTab === "linked" ? "产兑包" : "收款包/产兑包")}
                    </th>
                    <th className="px-4 md:px-10 py-6 text-right">操作控制</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(() => {
                    switch (activeTab) {
                      case "pending":
                        return auditTasks;
                      case "linked":
                        return linkedTasks;
                      case "confirmed":
                        return confirmedTasks;
                      default:
                        return historyTasks;
                    }
                  })().map((log) => {
                    if (!log) return null;
                    const isConsumption = log.dynamicCost > 0 || log.confirmationType === '手动确权';
                    const isDeduction = log.type === RefineType.NonEffectiveHours;

                    const confirmedDate = log.confirmedAt
                      ? new Date(log.confirmedAt)
                      : null;
                    const estimatedEntryDate = confirmedDate
                      ? new Date(confirmedDate)
                      : null;
                    if (estimatedEntryDate)
                      estimatedEntryDate.setMonth(
                        estimatedEntryDate.getMonth() + 3,
                      );

                    let stats: any = null;
                    const resource = resources.find(
                        (r) => r.id === log.miningId,
                      );
                        if (resource) {
                          stats = {
                            minedValue: resource.minedValue,
                            approvedValue: resource.confirmedValue,
                            pendingValue: resource.pendingValue,
                            unconfirmedValue: Math.max(0, (resource.initialValueCapacity || resource.valueCapacity) - resource.minedValue - resource.confirmedValue - resource.pendingValue),
                            minedRevenue: resource.minedRevenue,
                            approvedRevenue: resource.confirmedRevenue,
                            pendingRevenue: resource.pendingRevenue,
                            unconfirmedRevenue: Math.max(0, (resource.initialRevenueCapacity || resource.revenueCapacity) - resource.minedRevenue - resource.confirmedRevenue - resource.pendingRevenue),
                          };
                        }

                    return (
                      <React.Fragment key={log.id}>
                        <tr
                          className={`hover:bg-slate-50/80 transition-all group ${isConsumption ? "bg-rose-50/20" : ""} ${isDeduction ? "bg-rose-100/30" : ""}`}
                        >
                          <td className="px-4 md:px-10 py-6">
                            <span className="font-mono text-[10px] font-black text-slate-300 block mb-1 group-hover:text-blue-500">
                              #{log.id}
                            </span>
                            <div className="flex items-center space-x-2 mb-1">
                              <span
                                className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isDeduction ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-800"}`}
                              >
                                {log.type}
                              </span>
                            </div>
                            <span className="text-[9px] font-bold text-slate-500 block">
                              业务: {resolveLogBusinessDate(log)} ({resolveLogBusinessMonth(log)})
                            </span>
                            <span className="text-[8px] text-slate-400 block">
                              提报: {formatSubmissionDate(log.timestamp)}
                            </span>
                          </td>
                          <td className="px-4 md:px-6 py-6">
                            <span className="text-xs font-black text-slate-900 block">
                              {users.find((u) => u.id === log.rankId)?.center || "未分配"}
                            </span>
                            <span className="text-[8px] font-black text-slate-300 uppercase mt-1 block">
                              矿产: {log.miningId}
                            </span>
                          </td>
                          <td className="hidden lg:table-cell px-6 py-6">
                            <span className="text-xs font-bold text-slate-700 block">
                              {users.find((u) => u.id === log.rankId)?.name || log.rankId}
                            </span>
                          </td>
                          <td className="hidden md:table-cell px-6 py-6">
                            <span className="text-[10px] font-black text-slate-500 uppercase">
                              {users.find((u) => u.id === log.recordedCollectorId)?.name || log.recordedCollectorId || "系统"}
                            </span>
                          </td>
                          <td className="px-4 md:px-6 py-6 text-right">
                            <span
                              className={`font-mono font-black text-sm ${isConsumption ? "text-slate-400 line-through" : "text-slate-900"}`}
                            >
                              {formatMoney(log.amount)}
                            </span>
                          </td>
                          {(activeTab === "linked" ||
                            activeTab === "confirmed") && (
                            <>
                              <td className="hidden xl:table-cell px-6 py-6 text-center">
                                <span className="text-[10px] font-mono text-slate-500">
                                  {confirmedDate?.toLocaleDateString() || "-"}
                                </span>
                              </td>
                              <td className="hidden xl:table-cell px-6 py-6 text-center">
                                <span className="text-[10px] font-mono text-blue-600 font-bold">
                                  {estimatedEntryDate?.toLocaleDateString() ||
                                    "-"}
                                </span>
                              </td>
                            </>
                          )}
                          <td className="px-4 md:px-6 py-6 text-right">
                            <span
                              className={`font-mono font-black text-sm ${log.netValue < 0 ? "text-rose-500" : "text-blue-600"}`}
                            >
                              {log.netValue > 0 ? "+" : ""}
                              {formatMoney(log.netValue)}
                            </span>
                          </td>
                          <td className="px-4 md:px-10 py-6 text-right">
                            {activeTab === "pending" || (activeTab === "linked" && log.status === AuditStatus.Pending) ? (
                              <div className="flex items-center justify-end space-x-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                {log.category === RefineCategory.Value &&
                                log.confirmationType === "联动确权" ? (
                                  <div className="flex flex-col items-end">
                                    <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1">
                                      等待收款确权联动
                                    </span>
                                    <div className="flex space-x-2">
                                      <button
                                        onClick={() =>
                                          handleAction(log, "reject")
                                        }
                                        disabled={processingLogIds.has(log.id) || !(log.miningId === 'SYSTEM_DEDUCTION' || log.type === RefineType.NonEffectiveHours || isProjectWritable(resources.find(r => r.id === log.miningId)))}
                                        title="驳回该笔申请"
                                        className="px-4 py-1.5 border border-rose-100 text-rose-500 text-[9px] font-black uppercase rounded-lg hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        驳回
                                      </button>
                                      <button
                                        disabled
                                        className="px-4 py-1.5 bg-slate-100 text-slate-400 text-[9px] font-black uppercase rounded-lg cursor-not-allowed"
                                        title="产值确权由收款联动自动执行"
                                      >
                                        联动中
                                      </button>
                                    </div>
                                  </div>
                                  ) : (
                                    <div className="flex items-center space-x-2">
                                      <button
                                        onClick={() => handleAction(log, "reject")}
                                        disabled={processingLogIds.has(log.id) || !(log.miningId === 'SYSTEM_DEDUCTION' || log.type === RefineType.NonEffectiveHours || isProjectWritable(resources.find(r => r.id === log.miningId)))}
                                        title="驳回该笔申请，记录将标记为已驳回"
                                        className="px-4 py-1.5 border border-rose-100 text-rose-500 text-[9px] font-black uppercase rounded-lg hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        驳回
                                      </button>
                                      {isNpcxie && log.dynamicCost > 0 ? (
                                        <button
                                          onClick={() => setConfirmingLog(log)}
                                          disabled={processingLogIds.has(log.id) || !(log.miningId === 'SYSTEM_DEDUCTION' || log.type === RefineType.NonEffectiveHours || isProjectWritable(resources.find(r => r.id === log.miningId)))}
                                          className="px-4 py-1.5 bg-rose-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-rose-700 shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          消耗确权
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => handleAction(log, "approve")}
                                          disabled={processingLogIds.has(log.id) || !(log.miningId === 'SYSTEM_DEDUCTION' || log.type === RefineType.NonEffectiveHours || isProjectWritable(resources.find(r => r.id === log.miningId)))}
                                          title={
                                            log.dynamicCost > 0
                                              ? "确认审核该笔消耗申报"
                                              : "确认确权，待确权资产将转为已确权"
                                          }
                                          className="px-4 py-1.5 bg-slate-900 text-white text-[9px] font-black uppercase rounded-lg hover:bg-blue-600 shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          {log.dynamicCost > 0 ? "确认审核" : "确认确权"}
                                        </button>
                                      )}
                                    </div>
                                  )}
                              </div>
                            ) : (
                              <div className="flex flex-col items-end">
                                <Badge
                                  variant={
                                    log.status === AuditStatus.Approved
                                      ? "success"
                                      : log.status === AuditStatus.Confirmed
                                        ? "warning"
                                        : "error"
                                  }
                                >
                                  {log.status === AuditStatus.Approved ? '入库' : log.status}
                                </Badge>
                                {log.status === AuditStatus.Confirmed && (
                                  <span className="text-[8px] font-black text-slate-400 uppercase mt-1 tracking-tighter">
                                    {log.confirmationType || "收款确权"}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                        {stats && (
                          <tr className="bg-slate-50/30 border-b border-slate-100">
                            <td colSpan={8} className="px-10 py-3">
                              <div className="flex flex-col space-y-2">
                                <div className="flex items-center space-x-6 text-[10px] font-bold text-slate-500">
                                  <span className="text-slate-400 bg-slate-100 px-2 py-1 rounded">
                                    矿山 {log.miningId}  收款状态
                                  </span>
                                  <div className="flex space-x-6">
                                    <span className="text-blue-600 flex items-center">
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5"></span>
                                      入库收款:{" "}
                                      {formatMoney(stats.minedRevenue)}
                                    </span>
                                    <span className="text-emerald-600 flex items-center">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                                      已确权收款:{" "}
                                      {formatMoney(stats.approvedRevenue)}
                                    </span>
                                    <span className="text-amber-500 flex items-center">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>
                                      待确权收款:{" "}
                                      {formatMoney(stats.pendingRevenue)}
                                    </span>
                                    <span className="text-slate-400 flex items-center">
                                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-1.5"></span>
                                      未确权收款:{" "}
                                      {formatMoney(stats.unconfirmedRevenue)}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-6 text-[10px] font-bold text-slate-500">
                                  <span className="text-slate-400 bg-slate-100 px-2 py-1 rounded">
                                    矿山 {log.miningId}  产值状态
                                  </span>
                                  <div className="flex space-x-6">
                                    <span className="text-blue-600 flex items-center">
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5"></span>
                                      入库产值:{" "}
                                      {formatMoney(stats.minedValue)}
                                    </span>
                                    <span className="text-emerald-600 flex items-center">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                                      已确权产值:{" "}
                                      {formatMoney(stats.approvedValue)}
                                    </span>
                                    <span className="text-amber-500 flex items-center">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>
                                      待确权产值:{" "}
                                      {formatMoney(stats.pendingValue)}
                                    </span>
                                    <span className="text-slate-400 flex items-center">
                                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-1.5"></span>
                                      未确权产值:{" "}
                                      {formatMoney(stats.unconfirmedValue)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    );
  };

  export default Auditing;
