import React, { useMemo, useState } from 'react';
import { 
  MiningResource, 
  ValueCreationLog, 
  InternalTransaction, 
  User, 
  AuditStatus, 
  RefineCategory, 
  TransactionType 
} from '../../types';
import { Card, ProjectStatusBadge } from './UI';
import { deriveProjectStatus } from '../utils/projectStatus';
import { calculateSingleResourceQuadrants } from '../utils/purification';
import { calculateHistoricalNetValue } from '../utils/business';
import { calculateHedgeCapacitiesAndWeights } from '../utils/consumptionHedge';
import { InfoTip } from './InfoTip';
import * as XLSX from 'xlsx';
import { BusinessDateFilter } from './BusinessDateFilter';
import { isLogInFilter, getLocalMonthString } from '../utils/dateUtils';
import { formatMoney } from '../utils/formatMoney';
import { UI_LABELS } from '../constants/uiLabels';

export const normalizeMiningId = (id: string | undefined | null): string => {
  return (id || '').trim().toLowerCase();
};

export const formatExpertCategoryDisplay = (collectorId: string | undefined | null, users: User[] = []): string => {
  if (!collectorId) return '—';
  const u = users.find(x => x.id === collectorId || x.userId === collectorId);
  if (!u) return collectorId;
  const userNo = u.userId || u.id;
  const name = u.name || '';
  const category = u.category || u.role || '';
  return category ? `${userNo} ${name} (${category})` : `${userNo} ${name}`;
};

interface MiningResourceQueryViewProps {
  resource: MiningResource;
  resources: MiningResource[];
  logs?: ValueCreationLog[];
  dtcbLogs?: ValueCreationLog[];
  transactions?: InternalTransaction[];
  managedUsers?: User[];
  onClose?: () => void;
}

export const MiningResourceQueryView: React.FC<MiningResourceQueryViewProps> = ({
  resource,
  resources,
  logs = [],
  dtcbLogs = [],
  transactions = [],
  managedUsers = [],
  onClose,
}) => {
  const [filterMonth, setFilterMonth] = useState<string>(() => getLocalMonthString());
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  const normQueryId = useMemo(() => normalizeMiningId(resource.id), [resource.id]);

  // 全量矿山关联流水 (含普通产出与动态消耗)
  const allRelevantLogs = useMemo(() => {
    const combined = [...logs, ...dtcbLogs];
    const map = new Map<string, ValueCreationLog>();
    combined.forEach(l => {
      if (normalizeMiningId(l.miningId) === normQueryId) {
        map.set(l.id, l);
      }
    });
    return Array.from(map.values());
  }, [logs, dtcbLogs, normQueryId]);

  // 【1 矿山主档数据计算】
  const projectStatusInfo = useMemo(() => deriveProjectStatus(resource), [resource]);

  const hedgeInfo = useMemo(() => {
    return calculateHedgeCapacitiesAndWeights(resource, allRelevantLogs);
  }, [resource, allRelevantLogs]);

  const {
    revInitial: initialRev,
    valInitial: initialVal,
    revCurrent: currentRev,
    valCurrent: currentVal,
    cWeightRev,
    cWeightVal,
    b2Weight,
    C: totalC,
    B2: totalB2
  } = hedgeInfo;

  // 收款轨/产值轨进度四格 (与创造页同矿四格同源：用 jzcz 流水聚合，禁止只读矿山 JSON confirmed*)
  const quadrants = useMemo(() => {
    return calculateSingleResourceQuadrants(resource, logs);
  }, [resource, logs]);

  // 【2 价值创造 jzcz】
  // 过滤 miningId 精确命中本矿，且排除消耗单
  // 收款行：仅 status 已确权；待确权收款不进列表、不进收款包汇总
  // 产值行：已确权，或（待确权且 confirmationType==='联动确权'）；普通待确权产值不进列表、不进产兑包
  const jzczRows = useMemo(() => {
    let list = logs.filter(l => {
      if (normalizeMiningId(l.miningId) !== normQueryId) return false;
      if (l.costCategory || (l as any).consumptionType || l.confirmationType === '手动确权') return false;

      const isRev = l.category === RefineCategory.Revenue || (l.category as any) === '收款';
      const isVal = l.category === RefineCategory.Value || (l.category as any) === '产值';
      const isConfirmed = l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved || (l.status as any) === '已确权' || (l.status as any) === '入库';
      const isPending = l.status === AuditStatus.Pending || (l.status as any) === '待确权';

      if (isRev) return isConfirmed;
      if (isVal) return isConfirmed || (isPending && l.confirmationType === '联动确权');
      return false;
    });
    list = list.filter(l => isLogInFilter(l, filterMonth, filterStartDate, filterEndDate));
    return list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [logs, normQueryId, filterMonth, filterStartDate, filterEndDate]);

  // 价值创造汇总包
  const { totalRevenuePackage, totalValuePackage, totalCombinedPackage } = useMemo(() => {
    let revSum = 0;
    let valSum = 0;

    jzczRows.forEach(l => {
      const isRev = l.category === RefineCategory.Revenue || (l.category as any) === '收款';
      const isVal = l.category === RefineCategory.Value || (l.category as any) === '产值';
      const pkgNet = calculateHistoricalNetValue(l, resources, managedUsers);

      if (isRev) {
        revSum += pkgNet;
      } else if (isVal) {
        valSum += pkgNet;
      }
    });

    return {
      totalRevenuePackage: Math.round(revSum),
      totalValuePackage: Math.round(valSum),
      totalCombinedPackage: Math.round(revSum + valSum)
    };
  }, [jzczRows, resources, managedUsers]);

  // 【3 动态消耗 dtcb】
  // miningId 精确命中本矿，各状态；排除 miningId==='SYSTEM_DEDUCTION'
  const dtcbRows = useMemo(() => {
    const combined = [...dtcbLogs, ...logs];
    const map = new Map<string, ValueCreationLog>();
    combined.forEach(l => {
      if (normalizeMiningId(l.miningId) === normQueryId && (l.confirmationType === '手动确权' || !!l.costCategory || !!(l as any).consumptionType)) {
        if (l.miningId !== 'SYSTEM_DEDUCTION') {
          map.set(l.id, l);
        }
      }
    });
    let list = Array.from(map.values());
    list = list.filter(l => isLogInFilter(l, filterMonth, filterStartDate, filterEndDate));
    return list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [dtcbLogs, logs, normQueryId, filterMonth, filterStartDate, filterEndDate]);

  // 【4 内部交易 nbjy】
  // transactions 中 miningId 精确命中本矿，含各状态（含已驳回）
  const nbjyRows = useMemo(() => {
    let list = transactions.filter(t => normalizeMiningId(t.miningId) === normQueryId);
    list = list.filter(t => isLogInFilter(t, filterMonth, filterStartDate, filterEndDate));
    return list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [transactions, normQueryId, filterMonth, filterStartDate, filterEndDate]);

  // 导出 Excel (多 Sheet，无货币符号，金额整数)
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: 矿山主档
    const profileData = [
      { '属性': '矿山编号', '数值': resource.id },
      { '属性': '状态/生命周期', '数值': projectStatusInfo.status },
      { '属性': '指派收款单元', '数值': resource.assignedToRevenue || resource.assignedTo || '—' },
      { '属性': '指派产值单元', '数值': resource.assignedToValue || resource.assignedTo || '—' },
      { '属性': '提炼类型', '数值': resource.types ? resource.types.join(' / ') : '—' },
      { '属性': '收款系数', '数值': resource.customRevenueFactor !== undefined ? resource.customRevenueFactor : '—' },
      { '属性': '产值系数', '数值': resource.customValueFactor !== undefined ? resource.customValueFactor : '—' },
      { '属性': '款初', '数值': Math.round(initialRev) },
      { '属性': '款当', '数值': Math.round(currentRev) },
      { '属性': '产初', '数值': Math.round(initialVal) },
      { '属性': '产当', '数值': Math.round(currentVal) },
      { '属性': '已确权/入库C合计', '数值': Math.round(totalC) },
      { '属性': '已确权/入库B2合计', '数值': Math.round(totalB2) },
      { '属性': 'C权', '数值': `${(cWeightRev * 100).toFixed(2)}%` },
      { '属性': 'B2权', '数值': `${(b2Weight * 100).toFixed(2)}%` },
      { '属性': '收款轨_待确权', '数值': Math.round(quadrants.revenue.pending) },
      { '属性': '收款轨_已确权', '数值': Math.round(quadrants.revenue.confirmed) },
      { '属性': '收款轨_未确权', '数值': Math.round(quadrants.revenue.unconfirmed) },
      { '属性': '收款轨_入库', '数值': Math.round(quadrants.revenue.mined) },
      { '属性': '产值轨_待确权', '数值': Math.round(quadrants.value.pending) },
      { '属性': '产值轨_已确权', '数值': Math.round(quadrants.value.confirmed) },
      { '属性': '产值轨_未确权', '数值': Math.round(quadrants.value.unconfirmed) },
      { '属性': '产值轨_入库', '数值': Math.round(quadrants.value.mined) },
    ];
    const wsProfile = XLSX.utils.json_to_sheet(profileData);
    XLSX.utils.book_append_sheet(wb, wsProfile, '1_矿山主档');

    // Sheet 2: 价值创造 jzcz
    const jzczExportData = jzczRows.map(l => {
      const isRev = l.category === RefineCategory.Revenue || (l.category as any) === '收款';
      const rawInj = isRev 
        ? (l.rawAmount != null ? Math.round(l.rawAmount * 0.933) : Math.round(l.amount || 0))
        : Math.round(l.rawAmount != null ? l.rawAmount : l.amount || 0);
      const pkgNet = Math.round(calculateHistoricalNetValue(l, resources, managedUsers));

      return {
        '类别': isRev ? '收款' : '产值',
        '状态': l.status,
        '确权类型': l.confirmationType || '自动确权',
        '业务日期': l.businessDate || (l.timestamp ? new Date(l.timestamp).toLocaleDateString() : '—'),
        '采集主体': formatExpertCategoryDisplay(l.recordedCollectorId || l.rankId, managedUsers),
        '注入积分': rawInj,
        '收款包': isRev ? pkgNet : '—',
        '产兑包': !isRev ? pkgNet : '—',
        'C权': isRev ? `${(cWeightRev * 100).toFixed(2)}%` : `${(cWeightVal * 100).toFixed(2)}%`,
        'B2权': !isRev ? `${(b2Weight * 100).toFixed(2)}%` : '—',
      };
    });
    const wsJzcz = XLSX.utils.json_to_sheet(jzczExportData);
    XLSX.utils.book_append_sheet(wb, wsJzcz, '2_价值创造_jzcz');

    // Sheet 3: 动态消耗 dtcb
    const dtcbExportData = dtcbRows.map(l => {
      const costType = (l as any).consumptionType || (l.costCategory === 'B' ? (l as any).valueConsumptionMode || 'B2' : l.costCategory) || 'A';
      let relatedWeight = '—';
      if (costType === 'C') {
        relatedWeight = `C权 ${(cWeightRev * 100).toFixed(2)}%`;
      } else if (costType === 'B2') {
        relatedWeight = `B2权 ${(b2Weight * 100).toFixed(2)}%`;
      }

      return {
        '流水号': l.id,
        '状态': l.status,
        '业务日期': l.businessDate || (l.timestamp ? new Date(l.timestamp).toLocaleDateString() : '—'),
        '消耗类型': costType,
        '采集主体': formatExpertCategoryDisplay(l.recordedCollectorId || l.rankId, managedUsers),
        '经营单元': (l as any).businessUnit || (l as any).center || (managedUsers.find(u => u.id === l.recordedCollectorId)?.center) || '—',
        '消耗积分': Math.round(l.amount || l.rawAmount || l.dynamicCost || 0),
        '对冲消耗': Math.round(l.dynamicCost || l.amount || 0),
        '相关权': relatedWeight,
      };
    });
    const wsDtcb = XLSX.utils.json_to_sheet(dtcbExportData);
    XLSX.utils.book_append_sheet(wb, wsDtcb, '3_动态消耗_dtcb');

    // Sheet 4: 内部交易 nbjy
    const nbjyExportData = nbjyRows.map(t => {
      const typeStr = t.type === TransactionType.Resource || (t.type as any) === '资源交易' ? '资源流转' : (t.type || '内部交易');
      return {
        '交易号': t.id,
        '状态': t.status,
        '业务日期': t.businessDate || (t.timestamp ? new Date(t.timestamp).toLocaleDateString() : '—'),
        '发起方': formatExpertCategoryDisplay(t.senderId, managedUsers),
        '接收方': formatExpertCategoryDisplay(t.receiverId, managedUsers),
        '类型': typeStr,
        '收款额度': Math.round(t.revenueAmount || ((t.type as any) === '收款' ? t.amount : 0) || 0),
        '产值额度': Math.round(t.valueAmount || ((t.type as any) === '产值' ? t.amount : 0) || 0),
        '说明': t.description || '—',
      };
    });
    const wsNbjy = XLSX.utils.json_to_sheet(nbjyExportData);
    XLSX.utils.book_append_sheet(wb, wsNbjy, '4_内部交易_nbjy');

    XLSX.writeFile(wb, `矿山全景台账_${resource.id}_${new Date().toLocaleDateString()}.xlsx`);
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-300">
      {/* 顶部控制栏 */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl shadow-lg border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-300 text-lg font-black">
            🔍
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black tracking-tight">矿山全景穿透档案</span>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 text-xs font-mono font-black">
                {resource.id}
              </span>
              <ProjectStatusBadge resource={resource} />
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              四块穿透视图（主档 / 价值创造 / 动态消耗 / 内部交易）· 严控金额与权算法
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportExcel}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-2"
          >
            <span>📊</span>
            <span>导出矿山全景台账 (.xlsx)</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs rounded-xl transition-all"
            >
              关闭查询
            </button>
          )}
        </div>
      </div>

      {/* 关联流水范围筛选 */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-slate-700 font-bold text-xs">
          <span>📅</span>
          <span>筛选关联流水范围：</span>
          <span className="text-blue-600 font-mono font-black bg-blue-50 px-2 py-0.5 rounded">
            {filterStartDate && filterEndDate ? `${filterStartDate} 至 ${filterEndDate}` : filterMonth}
          </span>
        </div>
        <BusinessDateFilter
          month={filterStartDate || filterEndDate ? '' : filterMonth}
          onMonthChange={(m) => {
            setFilterMonth(m);
            setFilterStartDate('');
            setFilterEndDate('');
          }}
          startDate={filterStartDate}
          endDate={filterEndDate}
          onDateRangeChange={(s, e) => {
            setFilterStartDate(s);
            setFilterEndDate(e);
            setFilterMonth('');
          }}
          onClear={() => {
            setFilterMonth(getLocalMonthString());
            setFilterStartDate('');
            setFilterEndDate('');
          }}
        />
      </div>

      {/* 【1 矿山主档】 */}
      <Card className="p-6 md:p-8 bg-white rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center text-xs font-black">
              1
            </span>
            <h4 className="text-base font-black text-slate-900 tracking-tight">矿山主档与核心权指标</h4>
          </div>
          <span className="text-[11px] font-mono text-slate-400 font-bold">
            编号：{resource.id}
          </span>
        </div>

        {/* 基础属性网格 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block">状态/生命周期</span>
            <span className="font-black text-slate-800">{projectStatusInfo.status}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block">指派收款单元</span>
            <span className="font-black text-slate-800 truncate block" title={resource.assignedToRevenue || resource.assignedTo}>
              {resource.assignedToRevenue || resource.assignedTo || '—'}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block">指派产值单元</span>
            <span className="font-black text-slate-800 truncate block" title={resource.assignedToValue || resource.assignedTo}>
              {resource.assignedToValue || resource.assignedTo || '—'}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block">提炼类型</span>
            <span className="font-black text-slate-800 truncate block" title={resource.types ? resource.types.join(' / ') : '—'}>
              {resource.types ? resource.types.join(' / ') : '—'}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block">收款提炼系数</span>
            <span className="font-black text-slate-800 font-mono">
              {resource.customRevenueFactor !== undefined ? resource.customRevenueFactor : '—'}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block">产值提炼系数</span>
            <span className="font-black text-slate-800 font-mono">
              {resource.customValueFactor !== undefined ? resource.customValueFactor : '—'}
            </span>
          </div>
        </div>

        {/* 款初/款当/产初/产当 与 权指标 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-2xl">
            <span className="text-[10px] font-bold text-amber-700 block">款初 (合同额)</span>
            <span className="text-base font-black text-amber-900 font-mono mt-0.5 block">
              {formatMoney(initialRev)}
            </span>
          </div>
          <div className="p-3.5 bg-amber-100/70 border border-amber-300/80 rounded-2xl">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-amber-800 block">款当 (max(0,款初−C))</span>
              <InfoTip 
                title="款当说明"
                content="款当表示当前可用于对冲 C 类成本的收款额度。计算公式：max(0, 款初 - ΣC)。"
              />
            </div>
            <span className="text-base font-black text-amber-950 font-mono mt-0.5 block">
              {formatMoney(currentRev)}
            </span>
          </div>
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl">
            <span className="text-[10px] font-bold text-emerald-700 block">产初 (合同额)</span>
            <span className="text-base font-black text-emerald-900 font-mono mt-0.5 block">
              {formatMoney(initialVal)}
            </span>
          </div>
          <div className="p-3.5 bg-emerald-100/70 border border-emerald-300/80 rounded-2xl">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-emerald-800 block">产当 (max(0,产初−C−B2))</span>
              <InfoTip 
                title="产当说明"
                content="产当表示当前可用于对冲 C 类及 B2 类成本的产值额度。计算公式：max(0, 产初 - ΣC - ΣB2)。"
              />
            </div>
            <span className="text-base font-black text-emerald-950 font-mono mt-0.5 block">
              {formatMoney(currentVal)}
            </span>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
            <span className="text-[10px] font-bold text-slate-500 block">已确权C合计</span>
            <span className="text-base font-black text-slate-800 font-mono mt-0.5 block">
              {formatMoney(totalC)}
            </span>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
            <span className="text-[10px] font-bold text-slate-500 block">已确权B2合计</span>
            <span className="text-base font-black text-slate-800 font-mono mt-0.5 block">
              {formatMoney(totalB2)}
            </span>
          </div>
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-2xl col-span-2 sm:col-span-4 lg:col-span-1">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-indigo-700 block">权累计指标</span>
              <InfoTip 
                title="权指标说明"
                content={
                  <div className="space-y-2">
                    <p><b>N (基数)</b> = round(款初 × 0.933)</p>
                    <p><b>C权</b> = (N − ΣC) / N <span className="text-slate-400 font-normal">(N=0时为1)</span></p>
                    <p><b>B2权</b> = (N − ΣC − ΣB2) / (N − ΣC) <span className="text-slate-400 font-normal">(分母=0时为1)</span></p>
                    <p className="border-t border-slate-700 pt-1 mt-1 text-amber-400">收款套 C权；产值套 C权 × B2权。</p>
                  </div>
                }
              />
            </div>
            <div className="text-[11px] font-mono font-black text-indigo-950 space-y-0.5 mt-0.5">
              <div>C权: {(cWeightRev * 100).toFixed(2)}%</div>
              <div>B2权: {(b2Weight * 100).toFixed(2)}%</div>
            </div>
          </div>
        </div>

        {/* 收款轨 / 产值轨 进度四格 */}
        <div className="space-y-4 pt-2">
          <h5 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <span>📊</span> 收款轨 / 产值轨 动态进度四格 (基于 jzcz 流水实时聚合)
          </h5>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 收款轨四格 */}
            <div className="p-4 bg-amber-50/40 rounded-2xl border border-amber-100 space-y-2">
              <div className="flex justify-between items-center text-xs font-black text-amber-900">
                <span>收款轨四格进度</span>
                <span className="font-mono text-[11px] text-amber-700">容量上限：{formatMoney(quadrants.revenue.capacity)}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2 bg-white rounded-xl border border-amber-200 shadow-2xs">
                  <span className="text-[10px] text-amber-600 block font-bold">待确权</span>
                  <span className="font-mono font-black text-amber-900">{formatMoney(quadrants.revenue.pending)}</span>
                </div>
                <div className="p-2 bg-white rounded-xl border border-emerald-200 shadow-2xs">
                  <span className="text-[10px] text-emerald-600 block font-bold">已确权</span>
                  <span className="font-mono font-black text-emerald-900">{formatMoney(quadrants.revenue.confirmed)}</span>
                </div>
                <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-500 block font-bold">未确权</span>
                  <span className="font-mono font-black text-slate-700">{formatMoney(quadrants.revenue.unconfirmed)}</span>
                </div>
                <div className="p-2 bg-white rounded-xl border border-blue-200 shadow-2xs">
                  <span className="text-[10px] text-blue-600 block font-bold">入库</span>
                  <span className="font-mono font-black text-blue-900">{formatMoney(quadrants.revenue.mined)}</span>
                </div>
              </div>
            </div>

            {/* 产值轨四格 */}
            <div className="p-4 bg-emerald-50/40 rounded-2xl border border-emerald-100 space-y-2">
              <div className="flex justify-between items-center text-xs font-black text-emerald-900">
                <span>产值轨四格进度</span>
                <span className="font-mono text-[11px] text-emerald-700">容量上限：{formatMoney(quadrants.value.capacity)}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2 bg-white rounded-xl border border-amber-200 shadow-2xs">
                  <span className="text-[10px] text-amber-600 block font-bold">待确权</span>
                  <span className="font-mono font-black text-amber-900">{formatMoney(quadrants.value.pending)}</span>
                </div>
                <div className="p-2 bg-white rounded-xl border border-emerald-200 shadow-2xs">
                  <span className="text-[10px] text-emerald-600 block font-bold">已确权</span>
                  <span className="font-mono font-black text-emerald-900">{formatMoney(quadrants.value.confirmed)}</span>
                </div>
                <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-500 block font-bold">未确权</span>
                  <span className="font-mono font-black text-slate-700">{formatMoney(quadrants.value.unconfirmed)}</span>
                </div>
                <div className="p-2 bg-white rounded-xl border border-blue-200 shadow-2xs">
                  <span className="text-[10px] text-blue-600 block font-bold">入库</span>
                  <span className="font-mono font-black text-blue-900">{formatMoney(quadrants.value.mined)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 【2 价值创造 jzcz】 */}
      <Card className="p-6 md:p-8 bg-white rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center text-xs font-black">
              2
            </span>
            <div>
              <h4 className="text-base font-black text-slate-900 tracking-tight">价值创造流水 (jzcz)</h4>
              <p className="text-[10px] text-slate-400 font-medium">
                收款仅含已确权 · 产值含已确权及待确权联动 · 金额为整数
              </p>
            </div>
          </div>

          {/* 汇总指标卡 */}
          <div className="flex items-center gap-2 text-xs">
            <div className="px-3 py-1.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-900">
              <span className="text-[10px] text-amber-700 block font-bold">收款包合计</span>
              <span className="font-mono font-black">{formatMoney(totalRevenuePackage)}</span>
            </div>
            <div className="px-3 py-1.5 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900">
              <span className="text-[10px] text-emerald-700 block font-bold">产兑包合计</span>
              <span className="font-mono font-black">{formatMoney(totalValuePackage)}</span>
            </div>
            <div className="px-3 py-1.5 bg-blue-50 rounded-xl border border-blue-200 text-blue-900">
              <span className="text-[10px] text-blue-700 block font-bold">收产包总计</span>
              <span className="font-mono font-black">{formatMoney(totalCombinedPackage)}</span>
            </div>
          </div>
        </div>

        {/* 价值创造表格 */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200/70">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-black border-b border-slate-200">
                <th className="py-2.5 px-3">类别</th>
                <th className="py-2.5 px-3">状态</th>
                <th className="py-2.5 px-3">确权类型</th>
                <th className="py-2.5 px-3">业务日期</th>
                <th className="py-2.5 px-3">采集主体</th>
                <th className="py-2.5 px-3 text-right">注入积分</th>
                <th className="py-2.5 px-3 text-right">收款包</th>
                <th className="py-2.5 px-3 text-right">产兑包</th>
                <th className="py-2.5 px-3 text-right">C权</th>
                <th className="py-2.5 px-3 text-right">B2权</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {jzczRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400 font-medium">
                    {UI_LABELS.EMPTY_LIST}
                  </td>
                </tr>
              ) : (
                jzczRows.map(l => {
                  const isRev = l.category === RefineCategory.Revenue || (l.category as any) === '收款';
                  const rawInj = isRev 
                    ? (l.rawAmount != null ? Math.round(l.rawAmount * 0.933) : Math.round(l.amount || 0))
                    : Math.round(l.rawAmount != null ? l.rawAmount : l.amount || 0);
                  const pkgNet = Math.round(calculateHistoricalNetValue(l, resources, managedUsers));

                  return (
                    <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                          isRev ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {isRev ? '收款' : '产值'}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          l.status === AuditStatus.Confirmed || (l.status as any) === '已确权'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-500">{l.confirmationType || '自动确权'}</td>
                      <td className="py-2 px-3 font-mono text-slate-500">
                        {l.businessDate || (l.timestamp ? new Date(l.timestamp).toLocaleDateString() : '—')}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-800 max-w-[200px] truncate" title={formatExpertCategoryDisplay(l.recordedCollectorId || l.rankId, managedUsers)}>
                        {formatExpertCategoryDisplay(l.recordedCollectorId || l.rankId, managedUsers)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                        {formatMoney(rawInj)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-amber-600">
                        {isRev ? formatMoney(pkgNet) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600">
                        {!isRev ? formatMoney(pkgNet) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-600">
                        {isRev ? `${(cWeightRev * 100).toFixed(2)}%` : `${(cWeightVal * 100).toFixed(2)}%`}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-600">
                        {!isRev ? `${(b2Weight * 100).toFixed(2)}%` : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 【3 动态消耗 dtcb】 */}
      <Card className="p-6 md:p-8 bg-white rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center text-xs font-black">
              3
            </span>
            <div>
              <h4 className="text-base font-black text-slate-900 tracking-tight">动态消耗流水 (dtcb)</h4>
              <p className="text-[10px] text-slate-400 font-medium">
                含 A/B1/B2/C 各类消耗单记录
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-slate-400">
            共 {dtcbRows.length} 条记录
          </span>
        </div>

        {/* 动态消耗表格 */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200/70">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-black border-b border-slate-200">
                <th className="py-2.5 px-3">流水号</th>
                <th className="py-2.5 px-3">状态</th>
                <th className="py-2.5 px-3">业务日期</th>
                <th className="py-2.5 px-3">消耗类型</th>
                <th className="py-2.5 px-3">采集主体</th>
                <th className="py-2.5 px-3">经营单元</th>
                <th className="py-2.5 px-3 text-right">消耗积分</th>
                <th className="py-2.5 px-3 text-right">对冲消耗</th>
                <th className="py-2.5 px-3 text-right">相关权列</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {dtcbRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                    {UI_LABELS.EMPTY_LIST}
                  </td>
                </tr>
              ) : (
                dtcbRows.map(l => {
                  const costType = (l as any).consumptionType || (l.costCategory === 'B' ? (l as any).valueConsumptionMode || 'B2' : l.costCategory) || 'A';
                  let relatedWeight = '—';
                  if (costType === 'C') {
                    relatedWeight = `C权 ${(cWeightRev * 100).toFixed(2)}%`;
                  } else if (costType === 'B2') {
                    relatedWeight = `B2权 ${(b2Weight * 100).toFixed(2)}%`;
                  }

                  const rawCost = Math.round(l.amount || l.rawAmount || l.dynamicCost || 0);
                  const netHedge = Math.round(l.dynamicCost || l.amount || 0);

                  return (
                    <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-500">{l.id}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          l.status === AuditStatus.Confirmed || (l.status as any) === '已确权'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-500">
                        {l.businessDate || (l.timestamp ? new Date(l.timestamp).toLocaleDateString() : '—')}
                      </td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-mono font-bold text-[11px]">
                          {costType}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-800 max-w-[180px] truncate" title={formatExpertCategoryDisplay(l.recordedCollectorId || l.rankId, managedUsers)}>
                        {formatExpertCategoryDisplay(l.recordedCollectorId || l.rankId, managedUsers)}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {(l as any).businessUnit || (l as any).center || (managedUsers.find(u => u.id === l.recordedCollectorId)?.center) || '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-rose-600">
                        {formatMoney(rawCost)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                        {formatMoney(netHedge)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-[11px] text-slate-500">
                        {relatedWeight}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 font-medium pt-1">
          注：待确权消耗不加进当前权。
        </p>
      </Card>

      {/* 【4 内部交易 nbjy】 */}
      <Card className="p-6 md:p-8 bg-white rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center text-xs font-black">
              4
            </span>
            <div>
              <h4 className="text-base font-black text-slate-900 tracking-tight">内部交易台账 (nbjy)</h4>
              <p className="text-[10px] text-slate-400 font-medium">
                本矿关联的所有内部交易记录（含各状态）
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-slate-400">
            共 {nbjyRows.length} 笔交易
          </span>
        </div>

        {/* 内部交易表格 */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200/70">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-black border-b border-slate-200">
                <th className="py-2.5 px-3">交易号</th>
                <th className="py-2.5 px-3">状态</th>
                <th className="py-2.5 px-3">业务日期</th>
                <th className="py-2.5 px-3">发起方</th>
                <th className="py-2.5 px-3">接收方</th>
                <th className="py-2.5 px-3">类型</th>
                <th className="py-2.5 px-3 text-right">收款额度</th>
                <th className="py-2.5 px-3 text-right">产值额度</th>
                <th className="py-2.5 px-3">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {nbjyRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                    {UI_LABELS.EMPTY_LIST}
                  </td>
                </tr>
              ) : (
                nbjyRows.map(t => {
                  const typeStr = t.type === TransactionType.Resource || (t.type as any) === '资源交易' ? '资源流转' : (t.type || '内部交易');
                  const revAmt = Math.round(t.revenueAmount || ((t.type as any) === '收款' ? t.amount : 0) || 0);
                  const valAmt = Math.round(t.valueAmount || ((t.type as any) === '产值' ? t.amount : 0) || 0);

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-500">{t.id}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                          {t.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-500">
                        {t.businessDate || (t.timestamp ? new Date(t.timestamp).toLocaleDateString() : '—')}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-800 max-w-[150px] truncate" title={formatExpertCategoryDisplay(t.senderId, managedUsers)}>
                        {formatExpertCategoryDisplay(t.senderId, managedUsers)}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-800 max-w-[150px] truncate" title={formatExpertCategoryDisplay(t.receiverId, managedUsers)}>
                        {formatExpertCategoryDisplay(t.receiverId, managedUsers)}
                      </td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-[10px] font-bold">
                          {typeStr}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-amber-600">
                        {formatMoney(revAmt)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600">
                        {formatMoney(valAmt)}
                      </td>
                      <td className="py-2 px-3 text-slate-500 max-w-[200px] truncate" title={t.description}>
                        {t.description || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
