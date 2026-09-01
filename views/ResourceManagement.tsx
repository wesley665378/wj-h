
import React, { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { User, MiningResource, RefineType, Role, ResourceStatus, ValueCreationLog, InternalTransaction } from '../types';
import { isSystemAdmin } from '../src/utils/accessControl';
import { BusinessDateFilter } from '../src/components/BusinessDateFilter';
import { getLocalMonthString } from '../src/utils/dateUtils';
import { Card, ProgressBar, Badge, ProjectStatusBadge } from '../src/components/UI';
import { XLSX, exportWorkbook, buildExcelFilename, EXCEL_IMPORT_MAX_BYTES, EXCEL_IMPORT_MAX_ROWS } from '../src/utils/excelIo';
import { deriveProjectStatus } from '../src/utils/projectStatus';
import { aggregateMiningQuadrantsFromLogs } from '../src/utils/purification';
import { getInitialRevenueCapacity, getInitialValueCapacity } from '../src/utils/miningCapacity';
import { roundMoney, formatMoney } from '../src/utils/formatMoney';
import { toast } from 'sonner';
import { deleteMiningResource, toastApiError } from '../src/api';
import { CityGuardianModal, useCityGuardianModal } from '../src/components/CityGuardianModal';
import { MiningResourceQueryView, normalizeMiningId } from '../src/components/MiningResourceQueryView';
import { formatProjectStatusLabel, formatRefineTypeLabel } from '../src/utils/statusDisplay';
import { TERMINOLOGY } from '../src/constants/terminology';
import { UI_LABELS } from '../src/constants/uiLabels';
import { UI_TOKENS } from '../src/constants/uiTokens';

interface ResourceManagementProps {
  user: User;
  resources: MiningResource[];
  logs?: ValueCreationLog[];
  dtcbLogs?: ValueCreationLog[];
  transactions?: InternalTransaction[];
  managedUsers?: User[];
  onAddResource: (res: MiningResource) => Promise<any> | void;
  onUpdateResource: (res: MiningResource) => Promise<any> | void;
  onDeleteResource: (id: string) => Promise<boolean> | void;
  units: string[];
}

const ResourceManagement: React.FC<ResourceManagementProps> = ({ 
  resources, 
  logs = [], 
  dtcbLogs = [],
  transactions = [],
  managedUsers = [],
  onAddResource, 
  onUpdateResource, 
  onDeleteResource, 
  user, 
  units 
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { modalState, showAlert, showConfirm, closeModal } = useCityGuardianModal();
  const [newMiningId, setNewMiningId] = useState('');
  const [selectedType, setSelectedType] = useState<RefineType | null>(null);
  const [revenueCapacity, setRevenueCapacity] = useState<number>(1000);
  const [valueCapacity, setValueCapacity] = useState<number>(1000);
  const [assigneeRevenue, setAssigneeRevenue] = useState('');
  const [assigneeValue, setAssigneeValue] = useState('');
  const [customRevenueFactor, setCustomRevenueFactor] = useState<number | undefined>(undefined);
  const [customValueFactor, setCustomValueFactor] = useState<number | undefined>(undefined);
  const [category, setCategory] = useState<'100%' | '据实'>('100%');
  const [refineTypeFactors, setRefineTypeFactors] = useState<Record<string, { customRevenueFactor?: number; customValueFactor?: number }>>({});
  const [totalMonths, setTotalMonths] = useState<number>(12);
  const [monthN, setMonthN] = useState<number>(1);

  // 按矿山编号查询相关状态
  const [searchMiningId, setSearchMiningId] = useState('');
  const [queriedMiningId, setQueriedMiningId] = useState<string | null>(null);
  const [businessMonth, setBusinessMonth] = useState<string>(getLocalMonthString());
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isCustomQueryOpen, setIsCustomQueryOpen] = useState(false);
  const [customStatusFilter, setCustomStatusFilter] = useState('');

  const isNpcxie = user.role === Role.npcxie || user.category === 'NPC';
  const isAdmin = isSystemAdmin(user);
  const canQuery = isAdmin || isNpcxie;
  const [selectedUnitFilter, setSelectedUnitFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

  const [appliedFilters, setAppliedFilters] = useState({
    businessMonth: getLocalMonthString(),
    selectedUnitFilter: '',
    customStatusFilter: ''
  });

  const handleApplyCustomQuery = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAppliedFilters({
      businessMonth,
      selectedUnitFilter,
      customStatusFilter
    });
  };

  const filteredResources = useMemo(() => {
    return resources.filter(res => {
      if (appliedFilters.selectedUnitFilter) {
        const uf = appliedFilters.selectedUnitFilter.toLowerCase();
        if (
          !res.assignedTo?.toLowerCase().includes(uf) &&
          !res.assignedToRevenue?.toLowerCase().includes(uf) &&
          !res.assignedToValue?.toLowerCase().includes(uf)
        ) {
          return false;
        }
      }
      if (appliedFilters.customStatusFilter) {
        const sf = appliedFilters.customStatusFilter.toLowerCase();
        const { status } = deriveProjectStatus(res);
        const statusLabel = formatProjectStatusLabel(status);
        if (!status.toLowerCase().includes(sf) && !statusLabel.toLowerCase().includes(sf)) {
          return false;
        }
      }
      return true;
    });
  }, [resources, appliedFilters.selectedUnitFilter, appliedFilters.customStatusFilter]);

  const isDepleted = useMemo(() => {
    if (!editingId) return false;
    const res = resources.find(r => r.id === editingId);
    if (!res) return false;
    // 累计录入 = 已确权 + 待确权 + 入库
    const currentLogged = res.confirmedValue + res.pendingValue + res.minedValue;
    return currentLogged >= res.valueCapacity;
  }, [editingId, resources]);

  useEffect(() => {
    if (newMiningId && !editingId) {
      const prefix = newMiningId.charAt(0).toUpperCase();
      if (prefix === 'A') setSelectedType(RefineType.Enterprise);
      else if (prefix === 'B') setSelectedType(RefineType.Bidding);
      else if (prefix === 'C') setSelectedType(RefineType.OccHealth);
    }
  }, [newMiningId, editingId]);

  // 全盘状态计数（进行中 / 待封存 / 已结案）
  const statusCounts = useMemo(() => {
    const counts = {
      进行中: 0,
      待封存: 0,
      已结案: 0,
    };
    filteredResources.forEach(r => {
      const { status } = deriveProjectStatus(r);
      if (status === '进行中') counts['进行中']++;
      else if (status === '待封存') counts['待封存']++;
      else if (status === '已结案') counts['已结案']++;
    });
    return counts;
  }, [filteredResources]);

  // 全盘价值流四象限汇总（严格调用 aggregateMiningQuadrantsFromLogs 汇总当前页所有矿）
  const overallQuadrants = useMemo(() => {
    return aggregateMiningQuadrantsFromLogs(logs, filteredResources, undefined, appliedFilters.selectedUnitFilter, managedUsers);
  }, [logs, filteredResources, appliedFilters.selectedUnitFilter, managedUsers]);

  const handleEdit = (res: MiningResource) => {
    setEditingId(res.id);
    setNewMiningId(res.id);
    setSelectedType(res.types[0] || null);
    // 统一步骤：UI 显示为原始基准，存储为提纯后的基准 (优先读 initial* 避免读错字段)
    const initialRev = getInitialRevenueCapacity(res);
    const initialVal = getInitialValueCapacity(res);
    setRevenueCapacity(roundMoney(initialRev / 0.933));
    setValueCapacity(roundMoney(initialVal / 0.933));
    setAssigneeRevenue(res.assignedToRevenue || res.assignedTo || '');
    setAssigneeValue(res.assignedToValue || res.assignedTo || '');
    setCustomRevenueFactor(res.customRevenueFactor);
    setCustomValueFactor(res.customValueFactor);
    setRefineTypeFactors(res.refineTypeFactors || {});
    setCategory(res.category || '100%');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNewMiningId('');
    setSelectedType(null);
    setRevenueCapacity(1000);
    setValueCapacity(1000);
    setAssigneeRevenue('');
    setAssigneeValue('');
    setCustomRevenueFactor(undefined);
    setCustomValueFactor(undefined);
    setRefineTypeFactors({});
    setCategory('100%');
  };

  const handleDelete = (id: string) => {
    if (!isAdmin) {
      showAlert('权限不足：仅系统管理员有权执行此操作。');
      return;
    }
    showConfirm(
      `删除后该矿山 [${id}] 及其关联数据将不可恢复，确定删除？`,
      async () => {
        await onDeleteResource(id);
      },
      undefined,
      '确认删除',
      '取消'
    );
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isNpcxie && !isAdmin) {
      showAlert('权限不足：您无权下达矿山资源指令。');
      return;
    }

    if (!newMiningId || !selectedType || !assigneeRevenue || !assigneeValue) {
      showAlert('请完整填写矿山资源分配参数。');
      return;
    }

    if (customRevenueFactor !== undefined && (customRevenueFactor < 0 || customRevenueFactor > 1)) {
      showAlert('异常输入拦截：自定义收款系数必须在 0 到 1.0 (0% - 100%) 之间，避免配置超过 100% 的异常系数。');
      return;
    }

    if (customValueFactor !== undefined && (customValueFactor < 0 || customValueFactor > 1)) {
      showAlert('异常输入拦截：自定义产值系数必须在 0 到 1.0 (0% - 100%) 之间，避免配置超过 100% 的异常系数。');
      return;
    }

    if (!editingId && resources.some(r => r.id === newMiningId)) {
      showAlert(`冲突：矿山编号 [${newMiningId}] 已存在。`);
      return;
    }

    const existingResource = editingId ? resources.find(r => r.id === editingId) : null;

    // 节奏控制算法实现 (仅战略性外派适用)
    const isOutsourced = selectedType === RefineType.Outsourced;
    let authorizedQuota = undefined;
    
    // 统一步骤：将用户输入的原始容量转换为 0.933 提纯后的基准进行存储
    const purifiedRevenueCapacity = roundMoney(revenueCapacity * 0.933);
    const purifiedValueCapacity = roundMoney(valueCapacity * 0.933);

    const currentLogged = existingResource ? (existingResource.confirmedValue + existingResource.pendingValue + existingResource.minedValue) : 0;

    if (isOutsourced) {
      const baseLimit = purifiedValueCapacity / (totalMonths || 1);
      const monthlyDynamicLimit = baseLimit * monthN * 1.1;
      const globalRemaining = Math.max(0, purifiedValueCapacity - currentLogged);
      authorizedQuota = roundMoney(Math.min(monthlyDynamicLimit, globalRemaining));
    }

    // 处理配额同步 (如果已有配额，同步更新主指派单元对应的配额)
    let updatedQuotas = existingResource?.quotas;
    if (!updatedQuotas || updatedQuotas.length === 0) {
      updatedQuotas = assigneeRevenue === assigneeValue 
        ? [{ centerId: assigneeRevenue, revenueQuota: purifiedRevenueCapacity, valueQuota: purifiedValueCapacity, minedRevenue: 0, minedValue: 0 }]
        : [
            { centerId: assigneeRevenue, revenueQuota: purifiedRevenueCapacity, valueQuota: 0, minedRevenue: 0, minedValue: 0 },
            { centerId: assigneeValue, revenueQuota: 0, valueQuota: purifiedValueCapacity, minedRevenue: 0, minedValue: 0 }
          ];
    } else if (updatedQuotas.length === 1 && (updatedQuotas[0].centerId === assigneeRevenue || updatedQuotas[0].centerId === (existingResource?.assignedToRevenue || existingResource?.assignedTo))) {
      if (assigneeRevenue === assigneeValue) {
        updatedQuotas = [{
          centerId: assigneeRevenue,
          revenueQuota: purifiedRevenueCapacity,
          valueQuota: purifiedValueCapacity,
          minedRevenue: updatedQuotas[0].minedRevenue || 0,
          minedValue: updatedQuotas[0].minedValue || 0,
        }];
      } else {
        updatedQuotas = [
          { centerId: assigneeRevenue, revenueQuota: purifiedRevenueCapacity, valueQuota: 0, minedRevenue: updatedQuotas[0].minedRevenue || 0, minedValue: 0 },
          { centerId: assigneeValue, revenueQuota: 0, valueQuota: purifiedValueCapacity, minedRevenue: 0, minedValue: updatedQuotas[0].minedValue || 0 }
        ];
      }
    } else if (updatedQuotas.length === 2 && assigneeRevenue !== assigneeValue && updatedQuotas.some(q => q.centerId === (existingResource?.assignedToRevenue || existingResource?.assignedTo || assigneeRevenue)) && updatedQuotas.some(q => q.centerId === (existingResource?.assignedToValue || existingResource?.assignedTo || assigneeValue))) {
      updatedQuotas = updatedQuotas.map(q => {
        if (q.centerId === assigneeRevenue || q.centerId === (existingResource?.assignedToRevenue || existingResource?.assignedTo)) {
          return { ...q, centerId: assigneeRevenue, revenueQuota: purifiedRevenueCapacity, valueQuota: 0 };
        }
        if (q.centerId === assigneeValue || q.centerId === (existingResource?.assignedToValue || existingResource?.assignedTo)) {
          return { ...q, centerId: assigneeValue, revenueQuota: 0, valueQuota: purifiedValueCapacity };
        }
        return q;
      });
    }

    const resourceData: MiningResource = {
      id: newMiningId,
      initialRevenueCapacity: purifiedRevenueCapacity,
      initialValueCapacity: purifiedValueCapacity,
      initialRevenueLimit: purifiedRevenueCapacity,
      initialValueLimit: purifiedValueCapacity,
      types: [selectedType],
      revenueCapacity: purifiedRevenueCapacity,
      valueCapacity: purifiedValueCapacity,
      minedRevenue: existingResource ? existingResource.minedRevenue : 0,
      minedValue: existingResource ? existingResource.minedValue : 0,
      assignedTo: assigneeRevenue, // 保留兼容
      assignedToRevenue: assigneeRevenue,
      assignedToValue: assigneeValue,
      incentiveOutput5: existingResource ? (existingResource.incentiveOutput5 || 0) : 0,
      incentiveCollection2: existingResource ? (existingResource.incentiveCollection2 || 1) : 0,
      category: category,
      status: ResourceStatus.Exploring,
      customRevenueFactor: customRevenueFactor,
      customValueFactor: customValueFactor,
      refineTypeFactors: refineTypeFactors,
      version: existingResource ? (existingResource.version || 0) + 1 : 1,
      isPaused: (existingResource ? (existingResource.confirmedValue + existingResource.pendingValue + existingResource.minedValue) : 0) >= purifiedValueCapacity,
      totalMonths: totalMonths,
      rhythmMonthN: monthN,
      monthlyQuota: authorizedQuota,
      monthlyUsed: 0, // 重新点击指令按钮重置当月计数
      quotas: updatedQuotas,
      pendingValue: existingResource ? existingResource.pendingValue : 0,
      confirmedValue: existingResource ? existingResource.confirmedValue : 0,
      unconfirmedValue: existingResource ? Math.max(0, roundMoney(purifiedValueCapacity - (existingResource.confirmedValue || 0) - (existingResource.pendingValue || 0) - (existingResource.minedValue || 0))) : purifiedValueCapacity,
      valueDepleted: existingResource ? existingResource.valueDepleted : false,
      pendingRevenue: existingResource ? existingResource.pendingRevenue : 0,
      confirmedRevenue: existingResource ? existingResource.confirmedRevenue : 0,
      unconfirmedRevenue: existingResource ? Math.max(0, roundMoney(purifiedRevenueCapacity - (existingResource.confirmedRevenue || 0) - (existingResource.pendingRevenue || 0) - (existingResource.minedRevenue || 0))) : purifiedRevenueCapacity,
      revenueDepleted: existingResource ? existingResource.revenueDepleted : false,
    };

    const nextResources = editingId
      ? resources.map(r => r.id === editingId ? resourceData : r)
      : [...resources, resourceData];

    const actionText = editingId ? '保存矿山指令' : '下达矿山指令';
    showConfirm(
      `确定${actionText}？\n\n【矿山编号】${newMiningId}\n【提炼类型】${selectedType}\n【收款指派】${assigneeRevenue}\n【产值指派】${assigneeValue}\n【款初】${formatMoney(purifiedRevenueCapacity)}\n【产初】${formatMoney(purifiedValueCapacity)}`,
      async () => {
        setIsSaving(true);
        try {
          if (editingId) {
            await onUpdateResource(resourceData);
          } else {
            await onAddResource(resourceData);
          }
          handleCancelEdit();
        } catch (err: any) {
          console.error('保存矿山指令失败:', err);
        } finally {
          setIsSaving(false);
        }
      }
    );
  };

  const exportToExcel = () => {
    const dataToExport = filteredResources.map(res => ({
      '矿山编号': res.id,
      '提炼类型': res.types.join(', '),
      '款初': getInitialRevenueCapacity(res),
      '产初': getInitialValueCapacity(res),
      '已采收款': res.minedRevenue,
      '已采产值': res.minedValue,
      '收款指派': res.assignedToRevenue || res.assignedTo,
      '产值指派': res.assignedToValue || res.assignedTo,
      '核算类别': res.category || '100%',
      '矿山状态': formatProjectStatusLabel(deriveProjectStatus(res).status)
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "矿山资源分配记录");
    exportWorkbook(workbook, buildExcelFilename("矿山资源分配记录"));
  };

  const queriedResource = useMemo(() => {
    if (!queriedMiningId) return null;
    const norm = normalizeMiningId(queriedMiningId);
    return resources.find(r => normalizeMiningId(r.id) === norm) || null;
  }, [resources, queriedMiningId]);

  const handleQuerySearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const normalized = normalizeMiningId(searchMiningId);
    if (!normalized) {
      showAlert('请输入要查询的矿山编号。');
      return;
    }
    const matched = resources.find(r => normalizeMiningId(r.id) === normalized);
    if (!matched) {
      showAlert('无此矿');
      setQueriedMiningId(null);
      return;
    }
    setQueriedMiningId(matched.id);
  };

  return (
    <div className="w-full space-y-4 md:space-y-6 lg:space-y-8 animate-in fade-in duration-500 pb-6">
      {/* 权限受控：仅系统管理员（Admin）与 npcxie 显示查询入口 */}
      {canQuery && (
        <Card
          title="矿山资源查询"
          headerAction={<span className="text-[12px] text-slate-400 font-normal">npcxie · 全景穿透</span>}
          noPadding
        >
          <div className="p-4 md:p-6 space-y-4">
            {/* 搜索主区域 */}
            <form onSubmit={handleQuerySearch} className="flex items-center gap-3 w-full">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchMiningId}
                  onChange={(e) => setSearchMiningId(e.target.value)}
                  placeholder="输入矿山编号，例如 LH26AP00001"
                  className="w-full bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] font-bold text-slate-800 focus:outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all h-10 placeholder:text-[#94a3b8]"
                />
                {searchMiningId && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchMiningId('');
                      setQueriedMiningId(null);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold px-1 cursor-pointer"
                    title="清空"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="px-6 h-10 bg-slate-900 hover:bg-blue-600 active:scale-95 text-white font-black text-xs uppercase tracking-[2px] rounded-[4px] shadow-sm transition-all shrink-0 cursor-pointer flex items-center justify-center"
              >
                查 询
              </button>
            </form>

            {/* 说明文字 */}
            <div className="bg-[#fafbfc] border-l-2 border-[#1a56db] p-3 rounded-[4px]">
              <p className="text-[12px] text-slate-600 leading-relaxed">
                输入矿山编号后，将穿透查询以下四块台账：主档、价值创造（jzcz）、动态消耗（dtcb）与内部交易（nbjy）。
              </p>
            </div>

            {/* 自定义查询折叠区 */}
            <div className="border-t border-slate-200 pt-1">
              <div
                onClick={() => setIsCustomQueryOpen(!isCustomQueryOpen)}
                className="flex items-center justify-between cursor-pointer py-2.5 px-1 text-[13px] font-medium text-slate-700 hover:text-[#1a56db] transition-colors select-none"
              >
                <div className="flex items-center space-x-3">
                  <span>自定义查询</span>
                  {isCustomQueryOpen && (
                    <button
                      type="button"
                      onClick={handleApplyCustomQuery}
                      className="px-3 py-0.5 bg-[#1a56db] hover:bg-blue-600 active:scale-95 text-white font-bold text-[11px] rounded shadow-sm transition-all cursor-pointer flex items-center justify-center whitespace-nowrap"
                    >
                      查询
                    </button>
                  )}
                </div>
                <span className="text-slate-400 text-xs">
                  {isCustomQueryOpen ? '▴' : '▾'}
                </span>
              </div>

              {isCustomQueryOpen && (
                <div className="pt-2 pb-1 space-y-2 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between py-2 border-b border-dashed border-slate-200">
                    <label className="text-[13px] text-slate-600 font-medium">业务月份</label>
                    <input
                      type="month"
                      value={businessMonth}
                      onChange={(e) => setBusinessMonth(e.target.value)}
                      className="bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] font-mono text-slate-800 focus:outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all text-right cursor-pointer h-10"
                    />
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-dashed border-slate-200">
                    <label className="text-[13px] text-slate-600 font-medium">经营单元</label>
                    <input
                      type="text"
                      value={selectedUnitFilter}
                      onChange={(e) => setSelectedUnitFilter(e.target.value)}
                      placeholder="全部"
                      className="bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] text-slate-800 focus:outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all placeholder:text-[#94a3b8] w-48 text-right h-10"
                    />
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <label className="text-[13px] text-slate-600 font-medium">矿山状态</label>
                    <input
                      type="text"
                      value={customStatusFilter}
                      onChange={(e) => setCustomStatusFilter(e.target.value)}
                      placeholder="全部"
                      className="bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] text-slate-800 focus:outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all placeholder:text-[#94a3b8] w-48 text-right h-10"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* 穿透查询结果展示 (包含 1 矿山主档、2 价值创造、3 动态消耗、4 内部交易 与 Excel 导出) */}
      {canQuery && queriedResource && (
        <MiningResourceQueryView
          resource={queriedResource}
          resources={resources}
          logs={logs}
          dtcbLogs={dtcbLogs}
          transactions={transactions}
          managedUsers={managedUsers}
          onClose={() => {
            setQueriedMiningId(null);
            setSearchMiningId('');
          }}
        />
      )}

      {/* 矿山全盘总览卡片 */}
      {(() => {
        const rev = overallQuadrants.revenue;
        const val = overallQuadrants.value;

        const totalRevCap = (rev.capacity || 0) + (rev.mined || 0);
        const revDenom = totalRevCap || 1;
        const revPendingPct = (rev.pending / revDenom) * 100;
        const revConfirmedPct = (rev.confirmed / revDenom) * 100;
        const revUnconfirmedPct = (rev.unconfirmed / revDenom) * 100;
        const revMinedPct = (rev.mined / revDenom) * 100;
        const revProgressStr = (((rev.confirmed + rev.pending + rev.mined) / revDenom) * 100).toFixed(1);

        const totalValCap = (val.capacity || 0) + (val.mined || 0);
        const valDenom = totalValCap || 1;
        const valPendingPct = (val.pending / valDenom) * 100;
        const valConfirmedPct = (val.confirmed / valDenom) * 100;
        const valUnconfirmedPct = (val.unconfirmed / valDenom) * 100;
        const valMinedPct = (val.mined / valDenom) * 100;
        const valProgressStr = (((val.confirmed + val.pending + val.mined) / valDenom) * 100).toFixed(1);

        return (
          <Card className={`${UI_TOKENS.RADIUS_PANEL} p-6 md:p-8 bg-white border border-slate-100 shadow-md space-y-6`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2 uppercase">
                <span className="p-2 bg-blue-50 text-blue-600 rounded-xl">🌐</span>
                总览
              </h3>
              <span className="text-[10px] font-black text-slate-400 tracking-widest uppercase">
                共 {filteredResources.length} 座矿山
              </span>
            </div>

            {/* 行 1: 状态 */}
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-700">
              <span className="text-slate-400 font-black uppercase tracking-wider text-[11px] shrink-0">状态：</span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-black">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                {formatProjectStatusLabel('进行中')} {statusCounts['进行中']}
              </span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 font-black">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                {formatProjectStatusLabel('待封存')} {statusCounts['待封存']}
              </span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 font-black">
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                {formatProjectStatusLabel('已结案')} {statusCounts['已结案']}
              </span>
            </div>

            {/* 行 2: 全盘价值动态流 */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">
                <span>全盘{UI_LABELS.VALUE_FLOW}</span>
                <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-400"></span>{UI_LABELS.PENDING}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500"></span>{UI_LABELS.CONFIRMED}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-slate-300"></span>{UI_LABELS.UNCONFIRMED}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-500"></span>{UI_LABELS.MINED}</span>
                </div>
              </div>

              {/* 收款全盘条 */}
              <div className="space-y-1.5">
                 <div className="flex justify-between items-center text-xs font-black">
                   <div className="flex items-center gap-2 text-amber-600">
                     <span>收款轨</span>
                     <span className="text-[10px] font-bold text-slate-500 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-md">
                       款初: {formatMoney(totalRevCap)}
                     </span>
                   </div>
                   <span className="text-amber-600">{revProgressStr}%</span>
                 </div>
                 <div className="flex h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                   <div style={{ width: `${revPendingPct}%` }} className="bg-amber-400 h-full transition-all" title={`待确权: ${formatMoney(rev.pending)}`} />
                   <div style={{ width: `${revConfirmedPct}%` }} className="bg-emerald-500 h-full transition-all" title={`已确权: ${formatMoney(rev.confirmed)}`} />
                   <div style={{ width: `${revUnconfirmedPct}%` }} className="bg-slate-300 h-full transition-all" title={`未确权: ${formatMoney(rev.unconfirmed)}`} />
                   <div style={{ width: `${revMinedPct}%` }} className="bg-blue-500 h-full transition-all" title={`${UI_LABELS.MINED}: ${formatMoney(rev.mined)}`} />
                 </div>
                 <div className="flex justify-between text-[10px] text-slate-400 font-bold px-1">
                   <span>待: {formatMoney(rev.pending)}</span>
                   <span>已: {formatMoney(rev.confirmed)}</span>
                   <span>未: {formatMoney(rev.unconfirmed)}</span>
                   <span>入: {formatMoney(rev.mined)}</span>
                 </div>
               </div>

               {/* 产值全盘条 */}
               <div className="space-y-1.5 pt-2">
                 <div className="flex justify-between items-center text-xs font-black">
                   <div className="flex items-center gap-2 text-emerald-600">
                     <span>产值轨</span>
                     <span className="text-[10px] font-bold text-slate-500 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-md">
                       产初: {formatMoney(totalValCap)}
                     </span>
                   </div>
                   <span className="text-emerald-600">{valProgressStr}%</span>
                 </div>
                 <div className="flex h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                   <div style={{ width: `${valPendingPct}%` }} className="bg-amber-400 h-full transition-all" title={`待确权: ${formatMoney(val.pending)}`} />
                   <div style={{ width: `${valConfirmedPct}%` }} className="bg-emerald-500 h-full transition-all" title={`已确权: ${formatMoney(val.confirmed)}`} />
                   <div style={{ width: `${valUnconfirmedPct}%` }} className="bg-slate-300 h-full transition-all" title={`未确权: ${formatMoney(val.unconfirmed)}`} />
                   <div style={{ width: `${valMinedPct}%` }} className="bg-blue-500 h-full transition-all" title={`${UI_LABELS.MINED}: ${formatMoney(val.mined)}`} />
                 </div>
                 <div className="flex justify-between text-[10px] text-slate-400 font-bold px-1">
                   <span>待: {formatMoney(val.pending)}</span>
                   <span>已: {formatMoney(val.confirmed)}</span>
                   <span>未: {formatMoney(val.unconfirmed)}</span>
                   <span>入: {formatMoney(val.mined)}</span>
                 </div>
               </div>
            </div>
          </Card>
        );
      })()}

      {/* 资源分配表单 */}
      <Card className={`${UI_TOKENS.RADIUS_PANEL} p-6 md:p-12 relative overflow-hidden`}>
        <div className="absolute top-0 right-0 p-6 md:p-12 opacity-[0.03] pointer-events-none">
           <span className="text-[8rem] md:text-[12rem]">🗺️</span>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 md:mb-12 relative z-10 gap-4">
          <div>
            <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase flex items-center">
              <span className="w-10 h-10 md:w-14 md:h-14 bg-blue-600 rounded-xl md:rounded-[1.5rem] flex items-center justify-center text-white mr-4 md:mr-6 shadow-2xl shadow-blue-500/20">📍</span>
              {editingId ? '编辑提炼资源' : '提炼任务分配中心'}
            </h3>
            <p className="text-[10px] text-slate-400 font-black mt-2 ml-14 md:ml-20 tracking-[0.4em]">
              {isNpcxie ? '核心确权分配模式' : '最高管理员全局分配模式'}
            </p>
          </div>
          {editingId && (
            <button 
              type="button"
              onClick={handleCancelEdit} 
              disabled={isSaving}
              className="px-6 py-2 bg-slate-100 text-slate-400 font-black rounded-xl text-xs hover:bg-slate-200 self-start sm:self-auto disabled:opacity-50"
            >
              取消编辑
            </button>
          )}
        </div>
        
        <form onSubmit={handleAdd} className="space-y-6 md:space-y-8 relative z-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-start">
            <div className="space-y-2 col-span-1 sm:col-span-2 lg:col-span-4 min-w-0">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider h-5 flex items-center">矿山编号 (唯一定量)</label>
              <div className="flex gap-2 w-full">
                <input
                  type="text"
                  value={newMiningId}
                  onChange={(e) => setNewMiningId(e.target.value)}
                  disabled={!!editingId}
                  className="flex-1 min-w-0 w-full bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 font-bold text-slate-800 transition-all placeholder:text-[#94a3b8] disabled:opacity-50 text-[13px] h-10"
                  placeholder="自动匹配矿山编号"
                  required
                />
                <button
                  type="button"
                  onClick={() => {
                    const templateData = [{
                      '矿山编号': 'R001',
                      '提炼类型': RefineType.Enterprise,
                      '收款上限': 100000,
                      '产值上限': 100000,
                      '收款指派': units[0] || '默认单元',
                      '产值指派': units[0] || '默认单元',
                      '核算类别': '100%'
                    }];
                    const worksheet = XLSX.utils.json_to_sheet(templateData);
                    const workbook = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(workbook, worksheet, '矿山资源模板');
                    exportWorkbook(workbook, '矿山资源导入模板.xlsx');
                  }}
                  className="px-3 bg-slate-50 text-slate-600 border border-slate-200 rounded-[4px] text-[11px] font-black hover:bg-slate-100 transition-all flex items-center shadow-xs whitespace-nowrap h-10 shrink-0 cursor-pointer ml-2"
                  title="下载导入模板"
                >
                  📄 模板
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById('excel-import-input')?.click()}
                  className="px-3 bg-blue-50 text-blue-600 border border-blue-200 rounded-[4px] text-[11px] font-black hover:bg-blue-100 transition-all flex items-center shadow-xs whitespace-nowrap h-10 shrink-0 cursor-pointer ml-2"
                  title="批量导入矿山资源"
                >
                  📥 导入
                </button>
                <input
                  id="excel-import-input"
                  type="file"
                  accept=".xlsx, .xls"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > EXCEL_IMPORT_MAX_BYTES) {
                        showAlert('文件过大，最大支持 5MB');
                        if (e.target) e.target.value = '';
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = async (event) => {
                        const data = event.target?.result;
                        const workbook = XLSX.read(data, { type: 'binary' });
                        const sheetName = workbook.SheetNames[0];
                        const sheet = workbook.Sheets[sheetName];
                        const jsonData = XLSX.utils.sheet_to_json(sheet) as any[];

                        if (jsonData.length > EXCEL_IMPORT_MAX_ROWS) {
                          showAlert('导入数据超过 5000 行，请拆分后导入');
                          if (e.target) e.target.value = '';
                          return;
                        }
                        
                        let importCount = 0;
                        const newResourcesList: MiningResource[] = [];
                        jsonData.forEach(row => {
                          const id = row['矿山编号'] || row['ID'];
                          if (!id || resources.some(r => r.id === id)) return;

                          const type = row['提炼类型'] || row['类型'] || RefineType.Enterprise;
                          const rawRevCap = Number(row['款初'] || row['收款上限'] || row['收款额度'] || 0);
                          const rawValCap = Number(row['产初'] || row['产值上限'] || row['产值额度'] || 0);
                          // 批量导入时也进行提纯转换
                          const revCap = roundMoney(rawRevCap * 0.933);
                          const valCap = roundMoney(rawValCap * 0.933);
                          
                          const assRev = row['收款指派'] || row['执行单元'] || units[0];
                          const assVal = row['产值指派'] || row['执行单元'] || units[0];
                          const cat = row['核算类别'] || '100%';

                          const newRes: MiningResource = {
                            id: String(id),
                            initialRevenueCapacity: revCap,
                            initialValueCapacity: valCap,
                            initialRevenueLimit: revCap,
                            initialValueLimit: valCap,
                            types: [type as RefineType],
                            revenueCapacity: revCap,
                            valueCapacity: valCap,
                            minedRevenue: 0,
                            minedValue: 0,
                            assignedTo: assRev,
                            assignedToRevenue: assRev,
                            assignedToValue: assVal,
                            incentiveOutput5: 0,
                            incentiveCollection2: 0,
                            category: cat as '100%' | '据实',
                            status: ResourceStatus.Exploring,
                            version: 1,
                            isPaused: false,
                            totalMonths: 12,
                            rhythmMonthN: 1,
                            monthlyQuota: undefined,
                            monthlyUsed: 0,
                            quotas: assRev === assVal 
                              ? [{ centerId: assRev, revenueQuota: revCap, valueQuota: valCap, minedRevenue: 0, minedValue: 0 }]
                              : [
                                  { centerId: assRev, revenueQuota: revCap, valueQuota: 0, minedRevenue: 0, minedValue: 0 },
                                  { centerId: assVal, revenueQuota: 0, valueQuota: valCap, minedRevenue: 0, minedValue: 0 }
                                ],
                            pendingValue: 0,
                            confirmedValue: 0,
                            unconfirmedValue: valCap,
                            valueDepleted: false,
                            pendingRevenue: 0,
                            confirmedRevenue: 0,
                            unconfirmedRevenue: revCap,
                            revenueDepleted: false,
                          };
                          newResourcesList.push(newRes);
                          importCount++;
                        });

                        if (newResourcesList.length === 0) {
                          showAlert('未识别到有效的矿山资源或所有矿山编号已存在。');
                          if (e.target) e.target.value = '';
                          return;
                        }

                        showConfirm(
                          `导入将批量写入 ${newResourcesList.length} 条记录，请确认数据无误，导入后需单独确权。`,
                          () => {
                            newResourcesList.forEach(r => onAddResource(r));
                            toast.success(`批量导入完成：新增 ${newResourcesList.length} 个矿山资源。`);
                          },
                          undefined,
                          '确认导入',
                          '取消'
                        );
                        if (e.target) e.target.value = ''; // Reset input
                      };
                      reader.readAsBinaryString(file);
                    }
                  }}
                />
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as '100%' | '据实')}
                  className="w-20 shrink-0 bg-white border border-[#b8d0f7] rounded-[4px] px-2 py-2 outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 font-bold text-slate-800 transition-all cursor-pointer text-[13px] h-10"
                  required
                >
                  <option value="100%">100%</option>
                  <option value="据实">据实</option>
                </select>
              </div>
            </div>

            <div className="space-y-2 col-span-1 sm:col-span-1 lg:col-span-2 min-w-0">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider h-4 flex items-center">
                 款初
              </label>
              <input
                type="number"
                value={revenueCapacity}
                onChange={(e) => setRevenueCapacity(Number(e.target.value))}
                className="w-full bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 font-bold text-slate-900 font-mono transition-all text-[13px] h-10"
                min="0"
                required
              />
            </div>

            <div className="space-y-2 col-span-1 sm:col-span-1 lg:col-span-2 min-w-0">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider h-4 flex items-center">
                 产初
              </label>
              <input
                type="number"
                value={valueCapacity}
                onChange={(e) => setValueCapacity(Number(e.target.value))}
                className="w-full bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 font-bold text-slate-900 font-mono transition-all text-[13px] h-10"
                min="0"
                required
              />
            </div>

            <div className="space-y-2 col-span-1 sm:col-span-1 lg:col-span-2 min-w-0">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider h-4 flex items-center">收款指派</label>
              <select
                value={assigneeRevenue}
                onChange={(e) => setAssigneeRevenue(e.target.value)}
                className="w-full bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 font-bold text-slate-800 transition-all cursor-pointer text-[13px] h-10"
                required
              >
                <option value="">选择...</option>
                {units.map(center => (
                  <option key={center} value={center}>{center}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2 col-span-1 sm:col-span-1 lg:col-span-2 min-w-0">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider h-4 flex items-center">产值指派</label>
              <select
                value={assigneeValue}
                onChange={(e) => setAssigneeValue(e.target.value)}
                className="w-full bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 font-bold text-slate-800 transition-all cursor-pointer text-[13px] h-10"
                required
              >
                <option value="">选择...</option>
                {units.map(center => (
                  <option key={center} value={center}>{center}</option>
                ))}
              </select>
            </div>

            {(() => {
              const currentRevenueFactor = selectedType ? refineTypeFactors[selectedType]?.customRevenueFactor : undefined;
              const currentValueFactor = selectedType ? refineTypeFactors[selectedType]?.customValueFactor : undefined;

              const handleUpdateRefineFactor = (type: RefineType, key: 'customRevenueFactor' | 'customValueFactor', val: number | undefined) => {
                let safeVal = val;
                if (val !== undefined) {
                  safeVal = Number(Math.max(0, Math.min(1, val)).toFixed(4));
                }
                setRefineTypeFactors(prev => {
                  const existing = prev[type] || {};
                  const updated = { ...existing, [key]: safeVal };
                  return {
                    ...prev,
                    [type]: updated
                  };
                });
              };

              return selectedType ? (
                <div className="space-y-4 bg-slate-900/5 p-6 rounded-[2rem] border border-slate-200/60 animate-in slide-in-from-bottom-3 duration-300 col-span-1 sm:col-span-2 lg:col-span-12">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-black text-slate-800">🎯 {selectedType} 专属核算配方</span>
                      <span className="text-[9px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-bold">精细化绑定</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    {/* 收款配方系数 */}
                    <div className="space-y-3 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                        <span>核算配方系数 (收款)</span>
                        {currentRevenueFactor === undefined ? (
                          <span className="text-[9px] text-slate-400 font-bold bg-slate-100 px-1.5 py-0.5 rounded">自动 (默认)</span>
                        ) : (
                          <span className="text-[9px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 animate-pulse">自定义协议</span>
                        )}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={currentRevenueFactor !== undefined ? currentRevenueFactor : ''}
                          onChange={(e) => {
                            const v = e.target.value ? Number(e.target.value) : undefined;
                            handleUpdateRefineFactor(selectedType, 'customRevenueFactor', v);
                          }}
                          className={`w-full bg-slate-50/50 border ${currentRevenueFactor !== undefined ? 'border-blue-500 ring-4 ring-blue-500/5' : 'border-slate-200'} rounded-xl pl-4 pr-20 py-3 outline-none focus:ring-4 focus:ring-blue-500/10 font-bold text-slate-800 transition-all text-xs`}
                          placeholder=""
                        />
                        {currentRevenueFactor === undefined ? (
                          <button 
                            type="button"
                            onClick={() => handleUpdateRefineFactor(selectedType, 'customRevenueFactor', 0.27)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-500 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                          >
                            自定义
                          </button>
                        ) : (
                          <button 
                            type="button"
                            onClick={() => handleUpdateRefineFactor(selectedType, 'customRevenueFactor', undefined)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-rose-500 hover:text-rose-700 bg-rose-50 px-2 py-1 rounded transition-colors"
                          >
                            重置
                          </button>
                        )}
                      </div>
                      {currentRevenueFactor !== undefined && (
                        <div className="mt-3 flex items-center space-x-3 bg-slate-50 p-3 rounded-xl border border-slate-100 animate-in fade-in duration-200">
                          <input 
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={currentRevenueFactor}
                            onChange={(e) => handleUpdateRefineFactor(selectedType, 'customRevenueFactor', Number(e.target.value))}
                            className="flex-1 accent-blue-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                          />
                          <span className="text-[10px] font-mono font-black text-blue-600 w-10 text-right">{(currentRevenueFactor * 100).toFixed(0)}%</span>
                        </div>
                      )}
                    </div>

                    {/* 产值配方系数 */}
                    <div className="space-y-3 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                        <span>核算配方系数 (产值)</span>
                        {currentValueFactor === undefined ? (
                          <span className="text-[9px] text-slate-400 font-bold bg-slate-100 px-1.5 py-0.5 rounded">自动 (默认)</span>
                        ) : (
                          <span className="text-[9px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 animate-pulse">自定义协议</span>
                        )}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={currentValueFactor !== undefined ? currentValueFactor : ''}
                          onChange={(e) => {
                            const v = e.target.value ? Number(e.target.value) : undefined;
                            handleUpdateRefineFactor(selectedType, 'customValueFactor', v);
                          }}
                          className={`w-full bg-slate-50/50 border ${currentValueFactor !== undefined ? 'border-emerald-500 ring-4 ring-emerald-500/5' : 'border-slate-200'} rounded-xl pl-4 pr-20 py-3 outline-none focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-800 transition-all text-xs`}
                          placeholder=""
                        />
                        {currentValueFactor === undefined ? (
                          <button 
                            type="button"
                            onClick={() => handleUpdateRefineFactor(selectedType, 'customValueFactor', 0.48)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-500 hover:text-emerald-600 bg-slate-100 hover:bg-emerald-50 px-2 py-1 rounded transition-colors"
                          >
                            自定义
                          </button>
                        ) : (
                          <button 
                            type="button"
                            onClick={() => handleUpdateRefineFactor(selectedType, 'customValueFactor', undefined)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-rose-500 hover:text-rose-700 bg-rose-50 px-2 py-1 rounded transition-colors"
                          >
                            重置
                          </button>
                        )}
                      </div>
                      {currentValueFactor !== undefined && (
                        <div className="mt-3 flex items-center space-x-3 bg-slate-50 p-3 rounded-xl border border-slate-100 animate-in fade-in duration-200">
                          <input 
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={currentValueFactor}
                            onChange={(e) => handleUpdateRefineFactor(selectedType, 'customValueFactor', Number(e.target.value))}
                            className="flex-1 accent-emerald-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                          />
                          <span className="text-[10px] font-mono font-black text-emerald-600 w-10 text-right">{(currentValueFactor * 100).toFixed(0)}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null;
            })()}

            {selectedType === RefineType.Outsourced && (
              <div className="space-y-2 col-span-1 sm:col-span-2 lg:col-span-12 min-w-0">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider h-5 flex items-center">项目周期 (月)</label>
                <input
                  type="number"
                  value={totalMonths}
                  onChange={(e) => setTotalMonths(Number(e.target.value))}
                  className="w-full max-w-xs bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-4 focus:ring-blue-500/10 font-black text-slate-800 font-mono transition-all text-xs h-11"
                  min="1"
                  required
                />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">提炼类型 (单选) & 节奏控制</label>
            <div className="flex flex-wrap items-center gap-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
                {Object.values(RefineType).filter(t => t !== RefineType.NonEffectiveHours).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedType(type)}
                    className={`px-4 py-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-between ${
                      selectedType === type
                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-300'
                    }`}
                  >
                    <span>{type}</span>
                    {type === RefineType.Outsourced && <span className="ml-2 text-[10px] bg-white/20 px-2 py-0.5 rounded-full">核心限定</span>}
                  </button>
                ))}
              </div>
              
              {selectedType === RefineType.Outsourced && (
                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-700 flex items-center space-x-4 shadow-xl">
                  <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">当前月份 N =</span>
                  <input
                    type="number"
                    value={monthN}
                    onChange={(e) => setMonthN(Number(e.target.value))}
                    className="min-w-20 w-auto bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-black text-white outline-none focus:ring-2 focus:ring-blue-500 text-center"
                    min="1"
                    max={totalMonths}
                    required
                  />
                  <span className="text-slate-500 text-[10px] font-bold">/ {totalMonths}</span>
                </div>
              )}
            </div>
          </div>

          <button 
            type="submit" 
            disabled={units.length === 0 || isDepleted || isSaving}
            className={`w-full py-6 rounded-3xl font-black uppercase tracking-[0.5em] transition-all shadow-2xl flex items-center justify-center space-x-3 ${(units.length === 0 || isDepleted || isSaving) ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : (editingId ? 'bg-blue-600' : 'bg-slate-900') + ' text-white hover:-translate-y-1 active:translate-y-0'}`}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>正在保存中...</span>
              </>
            ) : (
              <>
                <span>{units.length === 0 ? '未检测到经营单元' : (isDepleted ? '该资源已满额录入' : (editingId ? '保存资源指令变更' : '注入提炼指令'))}</span>
                {units.length > 0 && !isDepleted && <span className="text-xl">{editingId ? '💾' : '⚡'}</span>}
              </>
            )}
          </button>
        </form>
      </Card>

      {/* 实时监控面板与汇总图表 */}
      <Card className={`${UI_TOKENS.RADIUS_PANEL} p-12`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-12">
           <div className="flex items-center space-x-4">
             <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">矿山资源监控实时面板</h3>
             <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-full border border-slate-200/80">
               <button 
                 onClick={() => setViewMode('card')}
                 className={`px-3 py-1 rounded-full text-[9px] font-black transition-all ${viewMode === 'card' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'}`}
               >
                 网格卡片
               </button>
               <button 
                 onClick={() => setViewMode('list')}
                 className={`px-3 py-1 rounded-full text-[9px] font-black transition-all ${viewMode === 'list' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'}`}
               >
                 列表视图
               </button>
             </div>
             <button 
               onClick={exportToExcel}
               className="px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center shadow-sm"
             >
               <span className="mr-2">📥</span>
               导出 Excel
             </button>
           </div>
           
           <div className="flex items-center space-x-6 flex-wrap gap-y-3">
              {isAdmin && (
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1 rounded-[4px] border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider h-4 flex items-center">经营单元视角:</span>
                  <select
                    value={selectedUnitFilter}
                    onChange={(e) => setSelectedUnitFilter(e.target.value)}
                    className="bg-white border border-[#b8d0f7] text-slate-800 text-[13px] font-bold rounded-[4px] px-3 py-1.5 outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all cursor-pointer h-10"
                  >
                    <option value="">默认 ({user.center || '无'})</option>
                    {units.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center space-x-2">
                 <div className="w-3 h-3 rounded-full bg-slate-200"></div>
                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">剩余额度</span>
              </div>
              <div className="flex items-center space-x-2">
                 <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">当前已提炼</span>
              </div>
           </div>
        </div>

        {filteredResources.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest">{UI_LABELS.EMPTY_MINING}</div>
        ) : viewMode === 'card' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
            {filteredResources.map(res => {
              const quadrants = aggregateMiningQuadrantsFromLogs(logs, filteredResources, res.id);
              const rev = quadrants.revenue;
              const val = quadrants.value;

              const revTotalCap = (rev.capacity || 0) + (rev.mined || 0) || 1;
              const revPendingPct = (rev.pending / revTotalCap) * 100;
              const revConfirmedPct = (rev.confirmed / revTotalCap) * 100;
              const revUnconfirmedPct = (rev.unconfirmed / revTotalCap) * 100;
              const revMinedPct = (rev.mined / revTotalCap) * 100;
              const revPctText = (((rev.confirmed + rev.pending + rev.mined) / revTotalCap) * 100).toFixed(1);

              const valTotalCap = (val.capacity || 0) + (val.mined || 0) || 1;
              const valPendingPct = (val.pending / valTotalCap) * 100;
              const valConfirmedPct = (val.confirmed / valTotalCap) * 100;
              const valUnconfirmedPct = (val.unconfirmed / valTotalCap) * 100;
              const valMinedPct = (val.mined / valTotalCap) * 100;
              const valPctText = (((val.confirmed + val.pending + val.mined) / valTotalCap) * 100).toFixed(1);

              return (
                <div key={res.id} className={`bg-slate-50 border border-slate-100 rounded-[2rem] md:${UI_TOKENS.RADIUS_PANEL} p-6 md:p-8 hover:bg-white hover:shadow-2xl transition-all group relative ${res.isPaused ? 'opacity-75 grayscale-[0.5]' : ''}`}>
                  {res.isPaused && (
                    <div className="absolute top-4 left-4 z-10">
                      <Badge variant="error" className="animate-pulse shadow-lg">暂停提炼 (熔断)</Badge>
                    </div>
                  )}
                  <div className="absolute top-4 right-4 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button onClick={() => handleEdit(res)} title="修改此矿山资源的资源配置与指派参数" className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all text-xs">编辑</button>
                  {isAdmin && (
                    <button onClick={() => handleDelete(res.id)} title="永久移除此矿山资源（不可逆）" className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all text-xs">移除</button>
                  )}
                  </div>
                  <div className="mb-4">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest block">{TERMINOLOGY.MINING_RESOURCE_ID}：{res.id}</span>
                      <ProjectStatusBadge resource={res} />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {res.types.map(t => (
                        <Badge key={t} variant="info">{formatRefineTypeLabel(t)}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-amber-600">
                        <span>收款轨 (待/已/未/入)</span>
                        <span>{revPctText}%</span>
                      </div>
                      <div className="flex h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div style={{ width: `${revPendingPct}%` }} className="bg-amber-400 h-full" title={`待确权: ${rev.pending}`} />
                        <div style={{ width: `${revConfirmedPct}%` }} className="bg-emerald-500 h-full" title={`已确权: ${rev.confirmed}`} />
                        <div style={{ width: `${revUnconfirmedPct}%` }} className="bg-slate-300 h-full" title={`未确权: ${rev.unconfirmed}`} />
                        <div style={{ width: `${revMinedPct}%` }} className="bg-blue-500 h-full" title={`${UI_LABELS.MINED}: ${rev.mined}`} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-emerald-600">
                        <span>产值轨 (待/已/未/入)</span>
                        <span>{valPctText}%</span>
                      </div>
                      <div className="flex h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div style={{ width: `${valPendingPct}%` }} className="bg-amber-400 h-full" title={`待确权: ${val.pending}`} />
                        <div style={{ width: `${valConfirmedPct}%` }} className="bg-emerald-500 h-full" title={`已确权: ${val.confirmed}`} />
                        <div style={{ width: `${valUnconfirmedPct}%` }} className="bg-slate-300 h-full" title={`未确权: ${val.unconfirmed}`} />
                        <div style={{ width: `${valMinedPct}%` }} className="bg-blue-500 h-full" title={`${UI_LABELS.MINED}: ${val.mined}`} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
                    {res.types.includes(RefineType.Outsourced) && res.monthlyQuota !== undefined && (
                      <div className="col-span-2 mb-2 p-3 bg-slate-900 rounded-xl border border-slate-700 shadow-inner">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">节奏控制 (归属月 {res.rhythmMonthN}/{res.totalMonths})</span>
                          <span className="text-[10px] font-black text-slate-500">{(res.monthlyUsed! / res.monthlyQuota! * 100).toFixed(1)}%</span>
                        </div>
                        <ProgressBar 
                          value={res.monthlyUsed || 0}
                          max={res.monthlyQuota}
                          color="bg-blue-500"
                          className="h-1.5"
                        />
                        <p className="text-[9px] text-slate-400 mt-2 flex justify-between font-bold">
                          <span>已用: {formatMoney(res.monthlyUsed || 0)}</span>
                          <span>本月当: {formatMoney(res.monthlyQuota)}</span>
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">收款指派</p>
                      <p className="text-xs font-bold text-slate-700">{res.assignedToRevenue || res.assignedTo}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">产值指派</p>
                      <p className="text-xs font-bold text-slate-700">{res.assignedToValue || res.assignedTo}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">
                  <th className="p-4 rounded-l-2xl">{TERMINOLOGY.MINING_RESOURCE_ID} / 状态</th>
                  <th className="p-4">{UI_LABELS.REFINING_TYPE}</th>
                  <th className="p-4">{UI_LABELS.REVENUE_RAIL}进度</th>
                  <th className="p-4">{UI_LABELS.VALUE_RAIL}进度</th>
                  <th className="p-4">指派归属</th>
                  <th className="p-4 rounded-r-2xl text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                {filteredResources.map(res => {
                  const quadrants = aggregateMiningQuadrantsFromLogs(logs, filteredResources, res.id);
                  const rev = quadrants.revenue;
                  const val = quadrants.value;
                  const revTotalCap = (rev.capacity || 0) + (rev.mined || 0) || 1;
                  const revPctText = (((rev.confirmed + rev.pending + rev.mined) / revTotalCap) * 100).toFixed(1);
                  const valTotalCap = (val.capacity || 0) + (val.mined || 0) || 1;
                  const valPctText = (((val.confirmed + val.pending + val.mined) / valTotalCap) * 100).toFixed(1);

                  return (
                    <tr key={res.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <div className="font-mono font-black text-slate-900 flex items-center space-x-2">
                          <span>{res.id}</span>
                          {res.isPaused && <Badge variant="error" className="scale-75 origin-left">熔断</Badge>}
                        </div>
                        <div className="mt-1"><ProjectStatusBadge resource={res} /></div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {res.types.map(t => (
                            <Badge key={t} variant="info">{formatRefineTypeLabel(t)}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="w-36 space-y-1">
                          <div className="flex justify-between text-[9px] font-mono font-bold text-amber-600">
                            <span>{UI_LABELS.REVENUE}</span>
                            <span>{revPctText}%</span>
                          </div>
                          <div className="flex h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                            <div style={{ width: `${(rev.pending / revTotalCap) * 100}%` }} className="bg-amber-400 h-full" />
                            <div style={{ width: `${(rev.confirmed / revTotalCap) * 100}%` }} className="bg-emerald-500 h-full" />
                            <div style={{ width: `${(rev.mined / revTotalCap) * 100}%` }} className="bg-blue-500 h-full" />
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="w-36 space-y-1">
                          <div className="flex justify-between text-[9px] font-mono font-bold text-emerald-600">
                            <span>{UI_LABELS.VALUE}</span>
                            <span>{valPctText}%</span>
                          </div>
                          <div className="flex h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                            <div style={{ width: `${(val.pending / valTotalCap) * 100}%` }} className="bg-amber-400 h-full" />
                            <div style={{ width: `${(val.confirmed / valTotalCap) * 100}%` }} className="bg-emerald-500 h-full" />
                            <div style={{ width: `${(val.mined / valTotalCap) * 100}%` }} className="bg-blue-500 h-full" />
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-[11px] space-y-0.5">
                          <div><span className="text-amber-600 font-black">收:</span> {res.assignedToRevenue || res.assignedTo}</div>
                          <div><span className="text-emerald-600 font-black">产:</span> {res.assignedToValue || res.assignedTo}</div>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button onClick={() => handleEdit(res)} className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all text-[11px] font-bold">编辑</button>
                          {isAdmin && (
                            <button onClick={() => handleDelete(res.id)} className="px-2.5 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all text-[11px] font-bold">移除</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <CityGuardianModal state={modalState} onClose={closeModal} />
    </div>
  );
};

export default ResourceManagement;
