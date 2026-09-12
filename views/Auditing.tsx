import React, { useState, useMemo, useEffect } from "react";
import { useDedupe } from '../src/hooks/useDedupe';
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
import { calculateInjectedAmount, getRawInputAmount } from "@/utils/consumptionHedge";
import { aggregateMiningQuadrantsFromLogs } from "@/utils/purification";
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
import { formatConfirmationType } from "@/utils/formatters";
import { TERMINOLOGY } from "@/constants/terminology";
import { UI_LABELS } from "@/constants/uiLabels";
import { isSystemAdmin, canExportExcel, getExportButtonTitle, EXPORT_DISABLED_TOOLTIP } from "@/utils/accessControl";
import { SystemConfig } from "@/types";
import { isVirtualDeductionMiningId } from "@/utils/virtualDeduction";
import { ConsumptionAudit, AuditApiData } from "@/components/ConsumptionAudit";
import { isProjectWritable } from "@/utils/projectStatus";
import { isNonEffectiveHoursEffective } from "@/utils/employmentStatus";
import { isDynamicCostLog } from "@/utils/costCategory";
import {
  isRevenuePendingLog,
  isConsumptionPendingLog,
  isLinkedPendingLog,
  calculateAuditPendingCounts,
} from "../src/utils/auditFilter";
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
import { ChevronLeft, ChevronRight, CheckCheck } from 'lucide-react';

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
  systemConfig?: SystemConfig;
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
  systemConfig,
}) => {
  const canExport = useMemo(() => canExportExcel(user, systemConfig), [user, systemConfig]);
  const { isLocked } = useDedupe(500);
  const { modalState, showAlert, showConfirm, closeModal } = useCityGuardianModal();
  const { isCostVisible, toggleCostVisible, maskMoney, maskText } = useCostPrivacy();
  const [activeTab, setActiveTab] = useState<
    "pending" | "confirmed" | "history" | "linked" | "consumption"
  >("pending");
  const [confirmingLog, setConfirmingLog] = useState<ValueCreationLog | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
  const [isBatchConfirming, setIsBatchConfirming] = useState(false);
  const PAGE_SIZE = 50;

  useEffect(() => {
    setCurrentPage(1);
    setSelectedLogIds(new Set());
  }, [activeTab]);

  // Map ValueCreationLog (from audit list) to AuditApiData required by ConsumptionAudit
  const mappedAuditApiData = useMemo<AuditApiData | null>(() => {
    if (!confirmingLog) return null;
    
    let activeType: 'A' | 'B1' | 'B2' | 'C' | 'D' | 'FXDC' = 'A';
    if (confirmingLog.type === RefineType.NonEffectiveHours) {
      activeType = 'FXDC';
    } else if (confirmingLog.costCategory === 'D') {
      activeType = 'D';
    } else if (confirmingLog.costCategory === 'A') {
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
      miningName: confirmingLog.costCategory === 'D' ? "中心开支·无项目列支" : (mineObj ? `选区-${mineObj.id}` : "主力生产选选厂厂"),
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
    () => monthlyLogs.filter((log) => isRevenuePendingLog(log, user)),
    [monthlyLogs, user],
  );

  // 1.5. 联动确权任务过滤逻辑（产值类，来自价值创造组件）
  const linkedTasks = useMemo(
    () =>
      monthlyLogs.filter((log) => {
        return (
          log.category === RefineCategory.Value &&
          !isDynamicCostLog(log) &&
          (log.status === AuditStatus.Pending || log.status === AuditStatus.Confirmed)
        );
      }),
    [monthlyLogs],
  );

  // 1.5b. 仅待确权的联动任务（用于待办指标统计）
  const linkedPendingTasks = useMemo(
    () => monthlyLogs.filter((log) => isLinkedPendingLog(log)),
    [monthlyLogs],
  );

  // 1.6. 已确权任务过滤逻辑 (只包含 jzcz 确权记录：已确权与入库，不混入 dtcb 消耗/成本审计记录)
  const confirmedTasks = useMemo(
    () =>
      monthlyLogs.filter((log) => {
        const isJzcz = !isDynamicCostLog(log);
        const isConfirmedOrApproved = log.status === AuditStatus.Confirmed || log.status === AuditStatus.Approved;
        return isJzcz && isConfirmedOrApproved;
      }),
    [monthlyLogs],
  );

  // 1.7. 消耗记录过滤逻辑（只接收动态消耗申请组件）
  const consumptionTasks = useMemo(
    () => monthlyLogs.filter((log) => isConsumptionPendingLog(log)),
    [monthlyLogs],
  );

  // 首次进入组件时：根据待办优先级自动锁定默认 Tab（收款 > 消耗 > 联动）
  const hasInitializedTabRef = React.useRef(false);
  useEffect(() => {
    if (!hasInitializedTabRef.current && logs.length > 0) {
      hasInitializedTabRef.current = true;
      if (auditTasks.length > 0) {
        setActiveTab("pending");
      } else if (consumptionTasks.length > 0) {
        setActiveTab("consumption");
      } else if (linkedPendingTasks.length > 0) {
        setActiveTab("linked");
      }
    }
  }, [auditTasks.length, consumptionTasks.length, linkedPendingTasks.length, logs.length]);

  // 操作反馈与高亮行控制
  const [lastTouchedLogIds, setLastTouchedLogIds] = useState<Set<string>>(new Set());

  const triggerRowHighlight = React.useCallback((logIds: string[]) => {
    if (!logIds || logIds.length === 0) return;
    setLastTouchedLogIds(new Set(logIds));
    const timer = setTimeout(() => {
      setLastTouchedLogIds(new Set());
    }, 3000);

    setTimeout(() => {
      const el = document.getElementById(`audit-row-${logIds[0]}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // 2. 历史记录过滤逻辑
  const historyTasks = useMemo(() => {
    return monthlyLogs
      .filter((log) => isDynamicCostLog(log))
      .reverse();
  }, [monthlyLogs]);

  const paginatedHistoryTasks = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return historyTasks.slice(start, start + PAGE_SIZE);
  }, [historyTasks, currentPage]);

  const paginatedConsumptionTasks = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return consumptionTasks.slice(start, start + PAGE_SIZE);
  }, [consumptionTasks, currentPage]);

  const paginatedConfirmedTasks = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return confirmedTasks.slice(start, start + PAGE_SIZE);
  }, [confirmedTasks, currentPage]);

  const paginatedAuditTasks = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return auditTasks.slice(start, start + PAGE_SIZE);
  }, [auditTasks, currentPage]);

  const paginatedLinkedTasks = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return linkedTasks.slice(start, start + PAGE_SIZE);
  }, [linkedTasks, currentPage]);

  // 可批量确权的单据列表（根据当前 Tab 区分 收款待办 与 消耗待办）
  const pendingConfirmableTasks = useMemo(() => {
    const sourceTasks = activeTab === "consumption" ? consumptionTasks : auditTasks;
    return sourceTasks.filter(
      (log) =>
        log.status === AuditStatus.Pending &&
        !processingLogIds.has(log.id) &&
        (log.miningId === 'SYSTEM_DEDUCTION' ||
          log.costCategory === 'D' ||
          log.type === RefineType.NonEffectiveHours ||
          isProjectWritable(resources.find((r) => r.id === log.miningId)))
    );
  }, [activeTab, consumptionTasks, auditTasks, processingLogIds, resources]);

  // 当前待处理任务分页列表（根据当前 Tab 区分 收款待办 与 消耗待办）
  const currentPaginatedTasks = useMemo(() => {
    if (activeTab === "consumption") return paginatedConsumptionTasks;
    if (activeTab === "pending") return paginatedAuditTasks;
    return [];
  }, [activeTab, paginatedConsumptionTasks, paginatedAuditTasks]);

  // 当前分页是否已全部勾选
  const isAllSelected = useMemo(() => {
    if (currentPaginatedTasks.length === 0) return false;
    return currentPaginatedTasks.every(log => selectedLogIds.has(log.id));
  }, [currentPaginatedTasks, selectedLogIds]);

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedLogIds(prev => {
        const next = new Set(prev);
        currentPaginatedTasks.forEach(log => next.delete(log.id));
        return next;
      });
    } else {
      setSelectedLogIds(prev => {
        const next = new Set(prev);
        currentPaginatedTasks.forEach(log => {
          if (log.status === AuditStatus.Pending) {
            next.add(log.id);
          }
        });
        return next;
      });
    }
  };

  const toggleSelectLog = (logId: string) => {
    setSelectedLogIds(prev => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };

  // 3. 汇总数据计算逻辑
  const summaryData = useMemo(() => {
    const approved = monthlyLogs.filter(
      (l) => l.status === AuditStatus.Approved,
    );

    // 毛产出 (amount > 0)
    const grossValue = approved
      .filter((l) => l.amount > 0)
      .reduce((acc, curr) => acc + curr.netValue, 0);
    // 动态消耗 isDynamicCostLog
    const totalConsumption = approved.reduce(
      (acc, curr) =>
        acc +
        (isDynamicCostLog(curr) && curr.costCategory === "C"
          ? (curr.dynamicCost || Math.abs(curr.netValue) || 0)
          : isNonEffectiveHoursEffective(curr)
          ? getNonEffectiveHoursDeduction(curr)
          : isDynamicCostLog(curr)
          ? curr.dynamicCost || 0
          : 0),
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
          .filter((l) => isDynamicCostLog(l) && l.costCategory === "A")
          .reduce((acc, curr) => acc + curr.dynamicCost, 0),
        color: "#F43F5E",
      },
      {
        name: "B1",
        value: approved
          .filter(
            (l) => isDynamicCostLog(l) && l.costCategory === "B" && l.valueConsumptionMode === "B1",
          )
          .reduce((acc, curr) => acc + curr.dynamicCost, 0),
        color: "#FB7185",
      },
      {
        name: "B2",
        value: approved
          .filter(
            (l) => isDynamicCostLog(l) && l.costCategory === "B" && l.valueConsumptionMode === "B2",
          )
          .reduce((acc, curr) => acc + curr.dynamicCost, 0),
        color: "#FDA4AF",
      },
      {
        name: "C",
        value: approved
          .filter((l) => isDynamicCostLog(l) && l.costCategory === "C")
          .reduce((acc, curr) => acc + (curr.dynamicCost || Math.abs(curr.netValue) || 0), 0),
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

  // 4. 积分看板计算逻辑 (基于流水与矿山同源聚合 SSOT)
  const quadrants = useMemo(() => {
    const validResources = (resources || []).filter(
      (r) => !isVirtualDeductionMiningId(r.id)
    );
    const aggregated = aggregateMiningQuadrantsFromLogs(
      monthlyLogs,
      validResources,
      undefined,
      null,
      users
    );

    return {
      value: {
        pending: aggregated.value.pending,
        confirmed: aggregated.value.confirmed,
        unconfirmed: aggregated.value.unconfirmed,
        approved: aggregated.value.mined,
      },
      revenue: {
        pending: aggregated.revenue.pending,
        confirmed: aggregated.revenue.confirmed,
        unconfirmed: aggregated.revenue.unconfirmed,
        approved: aggregated.revenue.mined,
      },
    };
  }, [monthlyLogs, resources, users]);

  const handleAction = (
    log: ValueCreationLog,
    action: "approve" | "reject",
  ) => {
    if (isLocked(`action-${log.id}-${action}`)) return;
    let nextStatus: AuditStatus = log.status;
    if (action === "reject") {
      nextStatus = AuditStatus.Rejected;
    } else {
      nextStatus = AuditStatus.Confirmed;
    }

    const isConsumption = isDynamicCostLog(log);
    const collectorDisplay = formatCollectorDisplay(log.recordedCollectorId, users);
    const businessDateStr = resolveLogBusinessDate(log);
    const confirmationTypeStr = formatConfirmationType(log);
    const injectedAmount = calculateInjectedAmount(log);

    if (action === "reject") {
      showConfirm(
        `驳回后该记录将退出当前确权流程，可能需要重新提报。\n\n` +
        `• 申报编号：${log.id}\n` +
        `• 业务日期：${businessDateStr}\n` +
        `• 矿山编号：${log.miningId}\n` +
        `• 采集主体：${collectorDisplay}\n` +
        `• 提积分额：${injectedAmount.toLocaleString()} 积分\n\n` +
        `确定驳回该笔价值提报单据？`,
        () => {
          onAudit(log.id, nextStatus);
          triggerRowHighlight([log.id]);
        },
        undefined,
        '确认驳回',
        '取消'
      );
    } else {
      showConfirm(
        `确定要【${isConsumption ? '消耗确权' : '收款确权'}】该笔价值提报单据吗？\n\n` +
        `• 申报编号：${log.id}\n` +
        `• 业务日期：${businessDateStr}\n` +
        `• 矿山编号：${log.miningId}\n` +
        `• 采集主体：${collectorDisplay}\n` +
        `• 确权类型：${confirmationTypeStr}\n` +
        `• 提积分额：${injectedAmount.toLocaleString()} 积分\n` +
        `• 净包数值：￥${Math.round(log.netValue || 0).toLocaleString()}\n\n` +
        `确认后，该笔待确权资产将正式转为【已确权】。`,
        () => {
          onAudit(log.id, nextStatus);
          triggerRowHighlight([log.id]);
        },
        undefined,
        isConsumption ? '消耗确权' : '收款确权',
        '取消'
      );
    }
  };

  const handleBatchConfirm = () => {
    if (isBatchConfirming) return;
    
    const isConsumptionTab = activeTab === "consumption";
    const typeLabel = isConsumptionTab ? "消耗确权" : "收款确权";
    const amountLabel = isConsumptionTab ? "提总额合计" : "提积分额合计";

    // 如果勾选了特定行，则对勾选的有效待确权行进行确权；若未勾选，则对当前筛选下的全部待确权行进行批量确权
    const targetTasks = selectedLogIds.size > 0
      ? pendingConfirmableTasks.filter(l => selectedLogIds.has(l.id))
      : pendingConfirmableTasks;

    if (targetTasks.length === 0) {
      showAlert(`当前无可确权的${typeLabel}记录，或所选单据已在处理中。`);
      return;
    }

    const totalAmount = targetTasks.reduce((sum, l) => {
      if (isConsumptionTab) {
        return sum + (l.dynamicCost || calculateInjectedAmount(l) || l.amount || 0);
      }
      return sum + calculateInjectedAmount(l);
    }, 0);
    const totalNet = targetTasks.reduce((sum, l) => sum + (l.netValue || 0), 0);

    showConfirm(
      `确定要对当前 ${targetTasks.length} 笔【${typeLabel}】记录进行批量确权吗？\n\n` +
      `• 待确权笔数：${targetTasks.length} 笔\n` +
      `• ${amountLabel}：${totalAmount.toLocaleString()} 积分\n` +
      `• 净包数值合计：￥${Math.round(totalNet).toLocaleString()}\n\n` +
      `确认后，系统将依次执行确权，将单据转为【已确权】状态并自动同步联动确权与工作区。`,
      async () => {
        setIsBatchConfirming(true);
        const toastId = toast.loading(`正在批量确权 (0/${targetTasks.length})...`);
        let successCount = 0;
        let failCount = 0;

        try {
          for (let i = 0; i < targetTasks.length; i++) {
            const task = targetTasks[i];
            toast.loading(`正在批量确权 (${i + 1}/${targetTasks.length})...`, { id: toastId });
            try {
              await onAudit(task.id, AuditStatus.Confirmed);
              successCount++;
            } catch (err) {
              console.error(`Batch audit failed for log ${task.id}:`, err);
              failCount++;
            }
          }

          toast.dismiss(toastId);
          if (failCount === 0) {
            toast.success(`批量确权成功！共完成 ${successCount} 笔${typeLabel}。`);
          } else {
            toast.warning(`批量确权完成：成功 ${successCount} 笔，失败 ${failCount} 笔。`);
          }
          triggerRowHighlight(targetTasks.map(t => t.id));
          setSelectedLogIds(new Set());
        } catch (e: any) {
          toast.dismiss(toastId);
          toast.error(`批量确权发生异常：${e?.message || '未知错误'}`);
        } finally {
          setIsBatchConfirming(false);
        }
      },
      undefined,
      '确认批量确权',
      '取消'
    );
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
    if (!canExport) {
      toast.error(EXPORT_DISABLED_TOOLTIP);
      return;
    }
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
          '采集主体': formatCollectorDisplay(log.recordedCollectorId, users),
          '经营单元': users.find(u => u.id === log.rankId)?.center || "未分配",
          '非效对冲': (log.type === RefineType.NonEffectiveHours || isNonEffectiveHoursEffective(log)) ? getNonEffectiveHoursDeduction(log) : '-',
          'A': (isDynamicCostLog(log) && log.costCategory === 'A') ? log.dynamicCost : '-',
          'C积分': (isDynamicCostLog(log) && log.costCategory === 'C') ? log.dynamicCost : '-',
          'C权': Number(cWeightValue) < 0.8 ? `${cWeightValue} (低)` : cWeightValue,
          '款初/款当': revLimitStr,
          'B1': (isDynamicCostLog(log) && log.costCategory === 'B' && log.valueConsumptionMode === 'B1') ? log.dynamicCost : '-',
          'B2积分': (isDynamicCostLog(log) && log.costCategory === 'B' && log.valueConsumptionMode === 'B2') ? log.dynamicCost : '-',
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
          确权类型: formatConfirmationType(log),
          申请角色: log.rankId,
          采集主体: formatCollectorDisplay(log.recordedCollectorId, users),
          [activeTab === "linked" ? "输入产值" : (activeTab === "pending" ? "输入收款" : "输入数值")]: getRawInputAmount(log),
          注入积分: calculateInjectedAmount(log),
          A: (isDynamicCostLog(log) && log.costCategory === "A") ? log.dynamicCost : 0,
          B1:
            (isDynamicCostLog(log) && log.costCategory === "B" && log.valueConsumptionMode === "B1")
              ? log.dynamicCost
              : 0,
          B2:
            (isDynamicCostLog(log) && log.costCategory === "B" && log.valueConsumptionMode === "B2")
              ? log.dynamicCost
              : 0,
          消耗分类: isDynamicCostLog(log) ? (log.costCategory || "N/A") : "-",
          [activeTab === "pending" ? "收款包" : (activeTab === "linked" ? "产兑包" : "收款包/产兑包")]: log.netValue,
          状态: log.status === AuditStatus.Approved ? '入库' : log.status,
        };
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    const sheetName =
      activeTab === "pending"
        ? "收款确权记录"
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
      <CityGuardianModal state={modalState} onClose={closeModal} />
      {/* 单层统一工具条（合并确权规则与标题导航） */}
      <div className="bg-white p-3 md:p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
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
              采集主体：{formatCollectorDisplay(user)} · 依据 7.1 分配律实时校验
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-black text-slate-700">{user.name}</span>
          </div>
        </div>
      </div>

      {/* 待办中枢指标摘要栏 */}
      <div className="flex flex-wrap items-center gap-2.5 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-sm border border-slate-800">
        <div className="flex items-center space-x-2 mr-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">待办清单中枢</span>
        </div>
        <div className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-slate-800 border border-slate-700/80 text-xs">
          <span className="text-slate-400">收款待办:</span>
          <span className={`font-mono font-bold ${auditTasks.length > 0 ? 'text-blue-400' : 'text-slate-300'}`}>{auditTasks.length} 笔</span>
        </div>
        <div className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-slate-800 border border-slate-700/80 text-xs">
          <span className="text-slate-400">联动待办:</span>
          <span className={`font-mono font-bold ${linkedPendingTasks.length > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>{linkedPendingTasks.length} 笔</span>
        </div>
        <div className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-slate-800 border border-slate-700/80 text-xs">
          <span className="text-slate-400">消耗待办:</span>
          <span className={`font-mono font-bold ${consumptionTasks.length > 0 ? 'text-rose-400' : 'text-slate-300'}`}>{consumptionTasks.length} 笔</span>
        </div>
        <div className="ml-auto text-xs font-mono font-bold text-slate-400">
          待办合计 <span className="text-white text-sm font-bold underline decoration-rose-500 decoration-2">{auditTasks.length + linkedPendingTasks.length + consumptionTasks.length}</span> 笔
        </div>
      </div>

      {/* 标签切换栏 */}
      <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
        <div className="flex flex-wrap bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner gap-1">
            <button
              onClick={() => setActiveTab("pending")}
              title="查看待处理收款确权任务"
              className={`px-4 md:px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all flex items-center space-x-2 ${activeTab === "pending" ? "bg-white text-slate-900 shadow-sm border border-slate-200/80" : "text-slate-500 hover:text-slate-800"}`}
            >
              <span>收款确权</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === "pending" ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"}`}
              >
                {auditTasks.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("linked")}
              title="查看自动联动确权记录"
              className={`px-4 md:px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all flex items-center space-x-2 ${activeTab === "linked" ? "bg-white text-slate-900 shadow-sm border border-slate-200/80" : "text-slate-500 hover:text-slate-800"}`}
            >
              <span>联动确权</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === "linked" ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}
              >
                {linkedTasks.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("consumption")}
              title="查看待处理消耗确权任务"
              className={`px-4 md:px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all flex items-center space-x-2 ${activeTab === "consumption" ? "bg-white text-slate-900 shadow-sm border border-slate-200/80" : "text-slate-500 hover:text-slate-800"}`}
            >
              <span>消耗确权</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === "consumption" ? "bg-rose-600 text-white" : "bg-slate-200 text-slate-600"}`}
              >
                {consumptionTasks.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("confirmed")}
              title="查看已完成确权的记录"
              className={`px-4 md:px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all flex items-center space-x-2 ${activeTab === "confirmed" ? "bg-white text-slate-900 shadow-sm border border-slate-200/80" : "text-slate-500 hover:text-slate-800"}`}
            >
              <span>确权记录</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === "confirmed" ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"}`}
              >
                {confirmedTasks.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("history")}
              title="成本审计记录回溯"
              className={`px-4 md:px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all flex items-center space-x-2 ${activeTab === "history" ? "bg-white text-slate-900 shadow-sm border border-slate-200/80" : "text-slate-500 hover:text-slate-800"}`}
            >
              <span>成本审计记录</span>
            </button>
            <CostPrivacyToggle size="sm" />
          </div>
        </div>

        <Card
          title={
            activeTab === "pending"
              ? `待处理收款确权 (${auditTasks.length})`
              : activeTab === "consumption"
                ? `待处理消耗确权 (${consumptionTasks.length})`
                : activeTab === "linked"
                  ? "联动确权记录"
                  : activeTab === "confirmed"
                    ? `确权记录 (${confirmedTasks.length})`
                    : "成本审计记录"
          }
          noPadding
          className={`${UI_TOKENS.RADIUS_PANEL} overflow-hidden`}
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
                  setSelectedMonth('');
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
              {(activeTab === "pending" || activeTab === "consumption") && (
                <button
                  onClick={handleBatchConfirm}
                  disabled={isBatchConfirming || pendingConfirmableTasks.length === 0}
                  className={`px-3 py-1.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-sm transition-all flex items-center space-x-1.5 active:scale-95 cursor-pointer ${isBatchConfirming || pendingConfirmableTasks.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                  title={
                    pendingConfirmableTasks.length === 0
                      ? `当前无可确权的${activeTab === "consumption" ? "消耗" : "收款"}记录`
                      : selectedLogIds.size > 0
                        ? `批量确权已勾选的 ${selectedLogIds.size} 笔记录`
                        : `批量确权当前筛选的全部 ${pendingConfirmableTasks.length} 笔待处理${activeTab === "consumption" ? "消耗" : "收款"}`
                  }
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>
                    批量确权{selectedLogIds.size > 0 ? ` (${selectedLogIds.size})` : ` (${pendingConfirmableTasks.length})`}
                  </span>
                </button>
              )}
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
                disabled={!canExport}
                title={getExportButtonTitle(canExport, '导出 Excel')}
                className={`px-3 py-1.5 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center ${
                  !canExport
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                    : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 cursor-pointer'
                }`}
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
            className="relative max-h-[calc(100vh-14rem)] overflow-auto"
          >
            {isRefreshing && (
              <div className="absolute inset-0 z-30 bg-white/70 backdrop-blur-[2px] flex items-center justify-center transition-all">
                <div className="flex items-center space-x-3 bg-slate-900 text-white px-5 py-2.5 rounded-2xl shadow-md text-xs font-bold">
                  <svg className="w-4 h-4 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>正在同步最新确权数据...</span>
                </div>
              </div>
            )}
            {(activeTab === "history" || activeTab === "consumption") ? (
              <table className="w-full text-left min-w-[1280px] border-collapse">
                <thead className="sticky top-0 z-20 bg-slate-100 text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 whitespace-nowrap shadow-sm">
                  <tr>
                    {activeTab === "consumption" && (
                      <th className="w-10 px-3 py-2 text-center whitespace-nowrap sticky top-0 left-0 z-40 bg-slate-100">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          title={isAllSelected ? "取消全选" : "全选当前页"}
                        />
                      </th>
                    )}
                    <th className={`px-4 py-2 whitespace-nowrap min-w-[96px] sticky top-0 z-40 bg-slate-100 border-r border-slate-200/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${activeTab === "consumption" ? "left-10" : "left-0"}`}>申报编号</th>
                    <th className="px-4 py-2 whitespace-nowrap min-w-[88px]">业务日期</th>
                    <th className="px-4 py-2 whitespace-nowrap min-w-[88px]">提报日期</th>
                    <th className="px-4 py-2 whitespace-nowrap min-w-[72px]">提炼类型</th>
                    <th className="px-4 py-2 text-center whitespace-nowrap min-w-[88px]">{TERMINOLOGY.BUSINESS_UNIT}</th>
                    <th className="px-4 py-2 font-bold whitespace-nowrap min-w-[100px]">{TERMINOLOGY.LOG_OPERATOR_ID}</th>
                    <th className="px-4 py-2 font-bold whitespace-nowrap min-w-[88px]">项目类型</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap min-w-[72px]">非效对冲</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap min-w-[44px]">A</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap min-w-[64px]">C积分</th>
                    <th className="px-4 py-2 text-right font-bold whitespace-nowrap min-w-[60px]">C权</th>
                    <th className="px-4 py-2 text-right font-bold whitespace-nowrap min-w-[96px]">款初/款当</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap min-w-[44px]">B1</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap min-w-[64px]">B2积分</th>
                    <th className="px-4 py-2 text-right font-bold whitespace-nowrap min-w-[60px]">B2权</th>
                    <th className="px-4 py-2 text-right font-bold whitespace-nowrap min-w-[96px]">产初/产当</th>
                    <th className="px-4 py-2 text-center whitespace-nowrap min-w-[88px]">确权日期</th>
                    <th className="px-4 py-2 text-right whitespace-nowrap min-w-[80px]">确权状态</th>
                    {activeTab === "consumption" && (
                      <th className="sticky top-0 right-0 z-40 bg-slate-100 border-l border-slate-200/80 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.08)] px-4 py-2 text-right whitespace-nowrap min-w-[100px]">
                        <div className="flex items-center justify-end space-x-2">
                          <span>操作控制</span>
                          <button
                            onClick={handleBatchConfirm}
                            disabled={isBatchConfirming || pendingConfirmableTasks.length === 0}
                            title={
                              pendingConfirmableTasks.length === 0
                                ? "当前无可确权的消耗记录"
                                : selectedLogIds.size > 0
                                  ? `批量确权已勾选的 ${selectedLogIds.size} 笔记录`
                                  : `批量确权当前筛选的全部 ${pendingConfirmableTasks.length} 笔待处理消耗`
                            }
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold rounded-lg shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            <span>批量确权{selectedLogIds.size > 0 ? ` (${selectedLogIds.size})` : ''}</span>
                          </button>
                        </div>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {(activeTab === "history" ? paginatedHistoryTasks : paginatedConsumptionTasks).map((log) => {
                    if (!log) return null;
                    const { cWeightValue, b2WeightValue, revLimitStr, valLimitCStr, valLimitB2Str } = calculateConsumptionMirrorFields(log, resources, logs);
                    
                    const collectorUser = users.find((u) => u.id === log.recordedCollectorId);
                    const collectorDisplay = collectorUser
                      ? `${collectorUser.name} | ${collectorUser.category || ""}`
                      : formatCollectorDisplay(log.recordedCollectorId, users);
                    const isTouched = lastTouchedLogIds.has(log.id);

                    return (
                      <tr
                        key={log.id}
                        id={`audit-row-${log.id}`}
                        className={`transition-all duration-300 ${isTouched ? "bg-amber-100/90 ring-2 ring-amber-400 border-l-4 border-amber-500 shadow-md" : "hover:bg-rose-50/30"} group`}
                      >
                        {activeTab === "consumption" && (
                          <td className={`w-10 px-3 py-2 text-center sticky left-0 z-30 ${isTouched ? "bg-amber-100" : "bg-white group-hover:bg-rose-50"}`}>
                            <input
                              type="checkbox"
                              checked={selectedLogIds.has(log.id)}
                              onChange={() => toggleSelectLog(log.id)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className={`px-4 py-2 sticky z-30 border-r border-slate-200/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] ${activeTab === "consumption" ? "left-10" : "left-0"} ${isTouched ? "bg-amber-100" : "bg-white group-hover:bg-rose-50"}`}>
                          <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-rose-600">{log.id.includes('#') ? log.id.substring(log.id.lastIndexOf('#')) : '#' + log.id}</span>
                        </td>
                        <td className="px-4 py-2 text-xs font-mono font-semibold text-slate-600">{resolveLogBusinessDate(log).split(' ')[0]}</td>
                        <td className="px-4 py-2 text-xs font-mono text-slate-500">{formatSubmissionDate(log.timestamp)}</td>
                        <td className="px-4 py-2 text-xs font-bold text-slate-600">{log.type}</td>
                        <td className="px-4 py-2 text-center">
                            <span className="text-xs font-bold text-slate-900 block">
                              {users.find((u) => u.id === log.rankId)?.center || "未分配"}
                            </span>
                        </td>
                        <td className="px-4 py-2 font-bold text-slate-900 text-xs">{collectorDisplay}</td>
                        <td className="px-4 py-2 text-xs font-semibold text-slate-600">{log.type}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-indigo-600 text-xs">
                          {(log.type === RefineType.NonEffectiveHours || isNonEffectiveHoursEffective(log)) ? maskMoney(Math.round(getNonEffectiveHoursDeduction(log))) : '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-blue-600 text-xs">
                          {(isDynamicCostLog(log) && log.costCategory === 'A') ? maskMoney(Math.round(log.dynamicCost)) : '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-amber-600 text-xs">
                          {(isDynamicCostLog(log) && log.costCategory === 'C') ? maskMoney(Math.round(log.dynamicCost)) : '-'}
                        </td>
                        <td className={`px-4 py-2 text-right font-mono font-bold text-xs ${Number(cWeightValue) < 0.8 ? 'bg-amber-100/70 text-amber-900' : 'text-amber-700 bg-amber-50/20'}`} title={Number(cWeightValue) < 0.8 ? "当前 C 权低于 0.8，请确认风险。" : undefined}>
                          <span className="inline-flex items-center justify-end gap-1">
                            {cWeightValue}
                            {Number(cWeightValue) < 0.8 && (
                              <span className="px-1 py-0.2 text-[10px] bg-amber-500 text-white rounded font-bold shadow-sm" title="当前 C 权低于 0.8，请确认风险。">
                                ⚠️ 低
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-semibold text-amber-800 bg-amber-50/10 text-xs">
                          {revLimitStr}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-rose-600 text-xs">
                          {(isDynamicCostLog(log) && log.costCategory === 'B' && log.valueConsumptionMode === 'B1') ? maskMoney(Math.round(log.dynamicCost)) : '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-emerald-600 text-xs">
                          {(isDynamicCostLog(log) && log.costCategory === 'B' && log.valueConsumptionMode === 'B2') ? maskMoney(Math.round(log.dynamicCost)) : '-'}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-bold text-emerald-700 bg-emerald-50/20 text-xs">
                          {b2WeightValue}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-semibold text-emerald-800 bg-emerald-50/10 text-xs">
                          {valLimitB2Str}
                        </td>
                        <td className="px-6 py-2 text-center">
                          <span className="text-xs font-mono font-semibold text-slate-500 whitespace-nowrap">
                            {log.confirmedAt ? new Date(log.confirmedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                          </span>
                        </td>
                        <td className="px-6 py-2 text-right">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            log.status === AuditStatus.Approved ? 'bg-emerald-100 text-emerald-700' : 
                            log.status === AuditStatus.Rejected ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {formatAuditStatusLabel(log.status)}
                          </span>
                        </td>
                        {activeTab === "consumption" && (
                          <td className={`sticky right-0 z-30 border-l border-slate-200/80 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.08)] px-4 py-2 text-right ${isTouched ? "bg-amber-100" : "bg-white group-hover:bg-rose-50"}`}>
                            <div className="flex items-center justify-end space-x-2">
                                <button
                                    onClick={() => handleAction(log, "reject")}
                                    disabled={processingLogIds.has(log.id) || !(log.miningId === 'SYSTEM_DEDUCTION' || log.costCategory === 'D' || log.type === RefineType.NonEffectiveHours || isProjectWritable(resources.find(r => r.id === log.miningId)))}
                                    className="px-3 py-1.5 border border-rose-200 text-rose-600 text-xs font-bold rounded-lg hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    驳回
                                </button>
                                <button
                                    onClick={() => setConfirmingLog(log)}
                                    disabled={processingLogIds.has(log.id) || !(log.miningId === 'SYSTEM_DEDUCTION' || log.costCategory === 'D' || log.type === RefineType.NonEffectiveHours || isProjectWritable(resources.find(r => r.id === log.miningId)))}
                                    className="px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-blue-600 shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
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
                      <td colSpan={activeTab === "consumption" ? 20 : 18} className="px-6 py-16 text-center">
                        <div className="max-w-md mx-auto bg-slate-50/90 rounded-xl p-4 border border-dashed border-slate-200 shadow-sm">
                          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3 font-bold text-base">
                            ✓
                          </div>
                          <h4 className="text-sm font-bold text-slate-800 mb-1">
                            {activeTab === "consumption" ? "当前筛选下暂无待确权的【消耗单据】" : "当前筛选下暂无动态消耗审计记录"}
                          </h4>
                          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                            {activeTab === "consumption"
                              ? "动态消耗需在「动态消耗」模块由经管员/提报员申请，提交后将在此列表进行审核与对冲确权。"
                              : "可以在右上角切换月份或自定义起止日期，检索往期动态消耗对冲及分流历史记录。"}
                          </p>
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            {(startDate || endDate || selectedMonth !== getLocalMonthString()) && (
                              <button
                                onClick={() => {
                                  setSelectedMonth(getLocalMonthString());
                                  setStartDate('');
                                  setEndDate('');
                                }}
                                className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all shadow-sm"
                              >
                                重置为当月
                              </button>
                            )}
                            {activeTab === "consumption" && (
                              <button
                                onClick={() => {
                                  const btn = document.querySelector('button[title*="动态消耗"]') as HTMLElement;
                                  if (btn) btn.click();
                                }}
                                className="px-3 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-xl hover:bg-rose-700 transition-all shadow-sm"
                              >
                                去动态消耗提报
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left min-w-[880px] border-collapse">
                <thead className="sticky top-0 z-20 bg-slate-100 text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 whitespace-nowrap shadow-sm">
                  <tr>
                    {activeTab === "pending" && (
                      <th className="w-10 px-3 py-2 text-center whitespace-nowrap sticky top-0 left-0 z-40 bg-slate-100">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          title={isAllSelected ? "取消全选" : "全选当前页"}
                        />
                      </th>
                    )}
                    <th className={`px-4 py-2 whitespace-nowrap min-w-[88px] sticky top-0 z-40 bg-slate-100 border-r border-slate-200/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${activeTab === "pending" ? "left-10" : "left-0"}`}>申报编号</th>
                    <th className="px-4 py-2 whitespace-nowrap min-w-[88px]">业务日期</th>
                    <th className="px-3 md:px-4 py-2 whitespace-nowrap min-w-[80px]">{TERMINOLOGY.BUSINESS_UNIT}</th>
                    <th className="px-3 md:px-4 py-2 whitespace-nowrap min-w-[80px]">矿山编号</th>
                    <th className="hidden md:table-cell px-4 py-2 whitespace-nowrap min-w-[88px]">采集主体</th>
                    <th className="px-3 md:px-4 py-2 text-right whitespace-nowrap min-w-[84px]">
                      {activeTab === "linked" ? "输入产值" : (activeTab === "pending" ? "输入收款" : "输入数值")}
                    </th>
                    <th className="px-3 md:px-4 py-2 text-right whitespace-nowrap min-w-[76px]">注入积分</th>
                    {(activeTab === "linked" ||
                      activeTab === "confirmed") && (
                      <>
                        <th className="hidden xl:table-cell px-4 py-2 text-center whitespace-nowrap min-w-[76px]">
                          确权时间
                        </th>
                        <th className="hidden xl:table-cell px-4 py-2 text-center whitespace-nowrap min-w-[76px]">
                          预计入库
                        </th>
                      </>
                    )}
                    <th className="px-3 md:px-4 py-2 text-right whitespace-nowrap min-w-[84px]">
                      {activeTab === "pending" ? "收款包" : (activeTab === "linked" ? "产兑包" : "收款包/产兑包")}
                    </th>
                    <th className="sticky top-0 right-0 z-40 bg-slate-100 border-l border-slate-200/80 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.08)] px-3 md:px-6 py-2 text-right whitespace-nowrap min-w-[100px]">
                      <div className="flex items-center justify-end space-x-2">
                        <span>操作控制</span>
                        {activeTab === "pending" && (
                          <button
                            onClick={handleBatchConfirm}
                            disabled={isBatchConfirming || pendingConfirmableTasks.length === 0}
                            title={
                              pendingConfirmableTasks.length === 0
                                ? "当前无可确权的收款记录"
                                : selectedLogIds.size > 0
                                  ? `批量确权已勾选的 ${selectedLogIds.size} 笔记录`
                                  : `批量确权当前筛选的全部 ${pendingConfirmableTasks.length} 笔待处理收款`
                            }
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold rounded-lg shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            <span>批量确权{selectedLogIds.size > 0 ? ` (${selectedLogIds.size})` : ''}</span>
                          </button>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {(() => {
                    switch (activeTab) {
                      case "pending":
                        return paginatedAuditTasks;
                      case "linked":
                        return paginatedLinkedTasks;
                      case "confirmed":
                        return paginatedConfirmedTasks;
                      default:
                        return paginatedHistoryTasks;
                    }
                  })().map((log) => {
                    if (!log) return null;
                    const isConsumption = isDynamicCostLog(log);
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

                    const isTouched = lastTouchedLogIds.has(log.id);

                    const cellBgClass = isTouched
                      ? "bg-amber-100"
                      : isDeduction
                        ? "bg-rose-100 group-hover:bg-rose-200/60"
                        : isConsumption
                          ? "bg-rose-50 group-hover:bg-rose-100/60"
                          : "bg-white group-hover:bg-slate-100";

                    return (
                      <tr
                        key={log.id}
                        id={`audit-row-${log.id}`}
                        className={`transition-all duration-300 ${isTouched ? "bg-amber-100/90 ring-2 ring-amber-400 border-l-4 border-amber-500 shadow-md" : "hover:bg-slate-50/80"} group ${isConsumption ? "bg-rose-50/20" : ""} ${isDeduction ? "bg-rose-100/30" : ""}`}
                      >
                        {activeTab === "pending" && (
                          <td className={`w-10 px-3 py-2 text-center sticky left-0 z-30 ${cellBgClass}`}>
                            <input
                              type="checkbox"
                              checked={selectedLogIds.has(log.id)}
                              onChange={() => toggleSelectLog(log.id)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className={`px-4 py-2 sticky z-30 border-r border-slate-200/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] ${activeTab === "pending" ? "left-10" : "left-0"} ${cellBgClass}`}>
                          <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-blue-500 block">
                            #{log.id}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-xs font-mono font-semibold text-slate-600 whitespace-nowrap block">
                            {resolveLogBusinessDate(log).split(' ')[0]}
                          </span>
                        </td>
                        <td className="px-3 md:px-4 py-2">
                          <span className="text-xs font-bold text-slate-900 block">
                            {users.find((u) => u.id === log.rankId)?.center || "未分配"}
                          </span>
                        </td>
                        <td className="px-3 md:px-4 py-2">
                          <span className="text-xs font-bold text-slate-500 uppercase">
                            {log.miningId}
                          </span>
                        </td>
                        <td className="hidden md:table-cell px-4 py-2">
                          <span className="text-xs font-semibold text-slate-700">
                            {formatCollectorDisplay(log.recordedCollectorId, users)}
                          </span>
                        </td>
                        <td className="px-3 md:px-4 py-2 text-right">
                          <span className="font-mono font-semibold text-xs text-slate-700 block">
                            {formatMoney(getRawInputAmount(log))}
                          </span>
                        </td>
                        <td className="px-3 md:px-4 py-2 text-right">
                          <span
                            className={`font-mono font-bold text-xs ${isConsumption ? "text-slate-400 line-through" : "text-slate-900"}`}
                          >
                            {formatMoney(calculateInjectedAmount(log))}
                          </span>
                        </td>
                        {(activeTab === "linked" ||
                          activeTab === "confirmed") && (
                          <>
                            <td className="hidden xl:table-cell px-4 py-2 text-center">
                              <span className="text-xs font-mono text-slate-500">
                                {confirmedDate?.toLocaleDateString() || "-"}
                              </span>
                            </td>
                            <td className="hidden xl:table-cell px-4 py-2 text-center">
                              <span className="text-xs font-mono text-blue-600 font-bold">
                                {estimatedEntryDate?.toLocaleDateString() ||
                                  "-"}
                              </span>
                            </td>
                          </>
                        )}
                        <td className="px-3 md:px-4 py-2 text-right">
                          <span
                            className={`font-mono font-bold text-xs ${log.netValue < 0 ? "text-rose-500" : "text-blue-600"}`}
                          >
                            {log.netValue > 0 ? "+" : ""}
                            {formatMoney(log.netValue)}
                          </span>
                        </td>
                        <td className={`sticky right-0 z-30 border-l border-slate-200/80 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.08)] px-3 md:px-6 py-2 text-right ${cellBgClass}`}>
                          {activeTab === "pending" || (activeTab === "linked" && log.status === AuditStatus.Pending) ? (
                            <div className="flex items-center justify-end space-x-2">
                              {log.category === RefineCategory.Value &&
                              (log.confirmationType === "联动确权" || (log.confirmationType as any) === "自动确权") ? (
                                <div className="flex flex-col items-end">
                                  <span className="text-xs font-bold text-amber-600 uppercase tracking-tight mb-1">
                                    等待收款确权联动
                                  </span>
                                  <div className="flex space-x-2">
                                    <button
                                      onClick={() =>
                                        handleAction(log, "reject")
                                      }
                                      disabled={processingLogIds.has(log.id) || !(log.miningId === 'SYSTEM_DEDUCTION' || log.costCategory === 'D' || log.type === RefineType.NonEffectiveHours || isProjectWritable(resources.find(r => r.id === log.miningId)))}
                                      title="驳回该笔申请"
                                      className="px-3 py-1.5 border border-rose-200 text-rose-600 text-xs font-bold rounded-lg hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      驳回
                                    </button>
                                    <button
                                      disabled
                                      className="px-3 py-1.5 bg-slate-100 text-slate-400 text-xs font-bold rounded-lg cursor-not-allowed"
                                      title="联动确权由收款联动自动执行"
                                    >
                                      联动中
                                    </button>
                                  </div>
                                </div>
                                ) : (
                                  <div className="flex flex-col items-end gap-1.5 w-24">
                                    {isNpcxie && isDynamicCostLog(log) ? (
                                      <button
                                        onClick={() => setConfirmingLog(log)}
                                        disabled={processingLogIds.has(log.id) || !(log.miningId === 'SYSTEM_DEDUCTION' || log.costCategory === 'D' || log.type === RefineType.NonEffectiveHours || isProjectWritable(resources.find(r => r.id === log.miningId)))}
                                        className="w-full px-2 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        消耗确权
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleAction(log, "approve")}
                                        disabled={processingLogIds.has(log.id) || !(log.miningId === 'SYSTEM_DEDUCTION' || log.costCategory === 'D' || log.type === RefineType.NonEffectiveHours || isProjectWritable(resources.find(r => r.id === log.miningId)))}
                                        title={
                                          isDynamicCostLog(log)
                                            ? "消耗确权"
                                            : "收款确权，待确权资产将转为已确权"
                                        }
                                        className="w-full px-2 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-blue-600 shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {isDynamicCostLog(log) ? "消耗确权" : "收款确权"}
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleAction(log, "reject")}
                                      disabled={processingLogIds.has(log.id) || !(log.miningId === 'SYSTEM_DEDUCTION' || log.costCategory === 'D' || log.type === RefineType.NonEffectiveHours || isProjectWritable(resources.find(r => r.id === log.miningId)))}
                                      title="驳回该笔申请，记录将标记为已驳回"
                                      className="w-full px-2 py-1.5 border border-rose-200 text-rose-600 text-xs font-bold rounded-lg hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      驳回
                                    </button>
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
                                <span className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-tight">
                                  {formatConfirmationType(log)}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(activeTab === "pending" ? auditTasks.length : activeTab === "linked" ? linkedTasks.length : confirmedTasks.length) === 0 && (
                    <tr>
                      <td colSpan={activeTab === "pending" ? 10 : 11} className="px-6 py-16 text-center">
                        <div className="max-w-md mx-auto bg-slate-50/90 rounded-xl p-4 border border-dashed border-slate-200 shadow-sm">
                          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3 font-bold text-base">
                            ✓
                          </div>
                          <h4 className="text-sm font-bold text-slate-800 mb-1">
                            {activeTab === "pending" && "当前筛选下暂无待处理的【收款确权】任务"}
                            {activeTab === "linked" && "当前筛选下暂无【产值联动】确权明细"}
                            {activeTab === "confirmed" && "当前筛选下暂无已确权的历史记录"}
                          </h4>
                          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                            {activeTab === "pending" && "如刚提交了核算申请，可调整月份筛选，或点击上方筛选栏的「刷新」同步最新数据。"}
                            {activeTab === "linked" && "产值端单据将在对应的收款确权完成时由系统自动触发联动确权。"}
                            {activeTab === "confirmed" && "可切换筛选月份或自定义起止日期，检索往期已确权记录。"}
                          </p>
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            {(startDate || endDate || selectedMonth !== getLocalMonthString()) && (
                              <button
                                onClick={() => {
                                  setSelectedMonth(getLocalMonthString());
                                  setStartDate('');
                                  setEndDate('');
                                }}
                                className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all shadow-sm"
                              >
                                重置为当月
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Controls */}
          {(() => {
            const currentTasksLength = activeTab === "history" ? historyTasks.length : 
                                     activeTab === "consumption" ? consumptionTasks.length :
                                     activeTab === "confirmed" ? confirmedTasks.length :
                                     activeTab === "pending" ? auditTasks.length :
                                     activeTab === "linked" ? linkedTasks.length : 0;
            if (currentTasksLength <= PAGE_SIZE) return null;
            return (
              <div className="flex items-center justify-between px-6 py-4 bg-white border-t border-slate-100">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  显示 {Math.min(currentTasksLength, (currentPage - 1) * PAGE_SIZE + 1)}-{Math.min(currentTasksLength, currentPage * PAGE_SIZE)} / 共 {currentTasksLength} 条
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <button 
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={18} className="text-slate-600" />
                    </button>
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-xs font-black text-slate-900">{currentPage}</span>
                      <span className="text-[10px] font-bold text-slate-400">/</span>
                      <span className="text-[10px] font-bold text-slate-400">{Math.ceil(currentTasksLength / PAGE_SIZE)}</span>
                    </div>
                    <button 
                      disabled={currentPage === Math.ceil(currentTasksLength / PAGE_SIZE)}
                      onClick={() => setCurrentPage(prev => Math.min(Math.ceil(currentTasksLength / PAGE_SIZE), prev + 1))}
                      className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight size={18} className="text-slate-600" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </Card>
      </div>
    );
  };

  export default Auditing;
