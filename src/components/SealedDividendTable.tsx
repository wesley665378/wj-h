import React, { useState, useMemo } from 'react';
import { ValueCreationLog, User, MiningResource, AuditStatus, Role } from '../types';
import { resolveLogPackageNet } from '../utils/reconcileMiningFromLogs';
import { isMineralArchived } from '../utils/projectStatus';
import { formatAmount } from '../utils/formatters';
import { InfoTip } from './InfoTip';
import { Lock, ShieldCheck, AlertTriangle, Search, Filter, Layers, CheckCircle2 } from 'lucide-react';

interface SealedDividendTableProps {
  logs: ValueCreationLog[];
  users: User[];
  currentUser: User;
  resources: MiningResource[];
}

export const SealedDividendTable: React.FC<SealedDividendTableProps> = ({
  logs = [],
  users = [],
  currentUser,
  resources = [],
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCenter, setSelectedCenter] = useState<string>('ALL');

  // 1. 权限范围判定
  const isAdminOrNpc = useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase();
    return role === Role.Admin || role === Role.npcxie || role === 'admin' || role === 'npcxie';
  }, [currentUser]);

  // 2. 映射矿山资源归属与封存状态
  const resourceMap = useMemo(() => {
    const map = new Map<string, MiningResource>();
    (resources || []).forEach(r => {
      if (r && r.id) map.set(r.id, r);
    });
    return map;
  }, [resources]);

  // 3. 用户中心映射
  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    (users || []).forEach(u => {
      if (u && u.id) map.set(u.id, u);
    });
    return map;
  }, [users]);

  // 4. 核心过滤与状态锁定 (State Lock & Strict Interception)
  // 必须严格为 ARCHIVED 或 SEALED，且状态必须是已确权/入库，严禁 PENDING、UNAPPROVED、FLOAT 数据进入分红底池
  const sealedDividendItems = useMemo(() => {
    if (!Array.isArray(logs) || logs.length === 0) return [];

    return logs.filter(l => {
      if (!l || l.deleted) return false;

      // 状态拦截：必须是 Confirmed / Approved / 已确权 / 入库，严禁 PENDING, UNAPPROVED, FLOAT
      const st = String(l.status || '');
      const isApprovedOrConfirmed = 
        st === AuditStatus.Confirmed || 
        st === AuditStatus.Approved || 
        st === '已确权' || 
        st === '入库' || 
        st === 'Confirmed' || 
        st === 'Approved';

      if (!isApprovedOrConfirmed) return false;

      // 矿山生命周期状态检查 (ARCHIVED 或 SEALED)
      const res = resourceMap.get(l.miningId);
      const lifecycle = String(res?.lifecycleStatus || '').toLowerCase();
      const resStatus = String(res?.status || '').toLowerCase();
      
      const isArchived = lifecycle === 'archived' || isMineralArchived(res);
      const isSealed = lifecycle === 'sealed' || resStatus === '已封存' || resStatus === 'sealed' || resStatus === 'capping' || resStatus === '待封存';

      if (!isArchived && !isSealed) return false;

      // 采集人唯一归属校验：严禁使用矿山 assignedTo、rankId 或松散 center 兜底
      const collectorId = l.recordedCollectorId;
      if (!collectorId) return false;

      const collector = userMap.get(collectorId);
      if (!collector) return false;

      // 角色权限过滤
      if (!isAdminOrNpc) {
        const userCenter = (currentUser.center || '').trim();
        const collectorCenter = (collector.center || '').trim();
        if (userCenter && collectorCenter && userCenter !== collectorCenter) {
          return false;
        }
      }

      return true;
    }).map(l => {
      const collector = userMap.get(l.recordedCollectorId!)!;
      const res = resourceMap.get(l.miningId);
      const packageNet = Math.round(resolveLogPackageNet(l, resources, users));

      return {
        logId: l.id,
        miningId: l.miningId,
        miningName: res?.id || l.miningId || '未知矿山',
        collectorId: collector.id,
        collectorName: collector.name || '未知采集人',
        center: collector.center || '未指派单元',
        category: l.category,
        type: l.type,
        lifecycleStatus: isMineralArchived(res) ? '已归档' : '已封存',
        packageNet,
        timestamp: l.timestamp || Date.now(),
        businessMonth: l.month || '当前周期',
      };
    });
  }, [logs, resourceMap, userMap, resources, users, isAdminOrNpc, currentUser]);

  // 5. 可用中心列表（用于筛选）
  const availableCenters = useMemo(() => {
    const centers = new Set<string>();
    sealedDividendItems.forEach(item => {
      if (item.center) centers.add(item.center);
    });
    return Array.from(centers);
  }, [sealedDividendItems]);

  // 6. 最终搜索与中心过滤
  const filteredItems = useMemo(() => {
    return sealedDividendItems.filter(item => {
      if (selectedCenter !== 'ALL' && item.center !== selectedCenter) {
        return false;
      }
      if (searchTerm.trim()) {
        const kw = searchTerm.trim().toLowerCase();
        const matchName = item.collectorName.toLowerCase().includes(kw);
        const matchMining = item.miningName.toLowerCase().includes(kw);
        const matchCenter = item.center.toLowerCase().includes(kw);
        if (!matchName && !matchMining && !matchCenter) return false;
      }
      return true;
    });
  }, [sealedDividendItems, selectedCenter, searchTerm]);

  // 7. 汇总指标计算（整数四舍五入）
  const totalSealedAmount = useMemo(() => {
    return Math.round(filteredItems.reduce((acc, item) => acc + item.packageNet, 0));
  }, [filteredItems]);

  const uniqueCollectorsCount = useMemo(() => {
    const set = new Set(filteredItems.map(i => i.collectorId));
    return set.size;
  }, [filteredItems]);

  const uniqueResourcesCount = useMemo(() => {
    const set = new Set(filteredItems.map(i => i.miningId));
    return set.size;
  }, [filteredItems]);

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-500 font-sans">
      {/* 状态锁定与防呆提示横幅 */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-lg border border-indigo-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600/30 border border-indigo-400/30 rounded-xl flex items-center justify-center text-indigo-300 shrink-0">
            <Lock size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-black tracking-tight text-white uppercase">
                封存分红安全账本
              </h4>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-mono border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck size={12} /> 状态已锁定（已归档 / 已封存）
              </span>
            </div>
            <p className="text-slate-300 text-xs mt-1">
              严格准入：仅加载生命周期为 <code className="text-indigo-300 font-mono">已归档</code> 或 <code className="text-indigo-300 font-mono">已封存</code> 且已确权流水。实时流转浮动数据与待审记录已被系统绝对拦截。
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 self-end md:self-center">
          <div className="text-right">
            <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">封存分红总额</div>
            <div className="text-xl font-mono font-black text-emerald-400">¥ {formatAmount(totalSealedAmount)}</div>
          </div>
        </div>
      </div>

      {/* 统计概览卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">封存分红条目</p>
            <p className="text-lg font-mono font-black text-slate-900 mt-1">{filteredItems.length} <span className="text-xs font-normal text-slate-500">笔</span></p>
          </div>
          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
            <Layers size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">参与归属采集人</p>
            <p className="text-lg font-mono font-black text-slate-900 mt-1">{uniqueCollectorsCount} <span className="text-xs font-normal text-slate-500">人</span></p>
          </div>
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
            <CheckCircle2 size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">封存矿山/项目数</p>
            <p className="text-lg font-mono font-black text-slate-900 mt-1">{uniqueResourcesCount} <span className="text-xs font-normal text-slate-500">个</span></p>
          </div>
          <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
            <Lock size={20} />
          </div>
        </div>
      </div>

      {/* 搜索与单元过滤工具条 */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative min-w-[240px] flex-1 sm:flex-none">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索采集人姓名、矿山名称..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400" />
            <select
              value={selectedCenter}
              onChange={(e) => setSelectedCenter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="ALL">全部经营单元 ({availableCenters.length})</option>
              {availableCenters.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          归属穿透：严格锚定 <code className="font-mono text-indigo-600 font-bold">采集主体标识</code>
        </div>
      </div>

      {/* 封存分红明细表格 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-300 flex items-center justify-between bg-slate-50/50">
          <h5 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <span>封存分红穿透明细表</span>
            <InfoTip title="分红口径说明" content="分红金额严格基于包净额计算（netValue），所有数值已四舍五入为整数，且仅限已封存及归档项目。" />
          </h5>
          <span className="text-[11px] font-mono text-slate-500">共 {filteredItems.length} 条记录</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-300 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-1.5 px-4 border-r border-slate-300 whitespace-nowrap">采集人</th>
                <th className="py-1.5 px-4 border-r border-slate-300 whitespace-nowrap">归属单元</th>
                <th className="py-1.5 px-4 border-r border-slate-300 whitespace-nowrap">关联封存项目/矿山</th>
                <th className="py-1.5 px-4 border-r border-slate-300 whitespace-nowrap">生命周期状态</th>
                <th className="py-1.5 px-4 border-r border-slate-300 whitespace-nowrap">业务月份</th>
                <th className="py-1.5 px-4 text-right whitespace-nowrap">包净额 / 分红基数 (¥)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {!Array.isArray(filteredItems) || filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400 font-medium">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertTriangle size={24} className="text-amber-400" />
                      <span>未检测到符合条件的封存分红记录（当前或过滤条件下暂无 已归档 / 已封存 状态数据）</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => (
                  <tr key={item.logId} className="border-b border-slate-300 hover:bg-slate-50/80 transition-colors group">
                    <td className="py-1.5 px-4 border-r border-slate-300 font-bold text-slate-900 whitespace-nowrap">
                      {item.collectorName}
                      <span className="block text-[10px] font-mono text-slate-400 font-normal">{item.collectorId}</span>
                    </td>
                    <td className="py-1.5 px-4 border-r border-slate-300 text-slate-700 font-medium whitespace-nowrap">
                      <span className="px-2 py-1 bg-slate-100 rounded-md text-[11px] font-bold text-slate-700">
                        {item.center}
                      </span>
                    </td>
                    <td className="py-1.5 px-4 border-r border-slate-300 text-slate-800 font-medium whitespace-nowrap">
                      {item.miningName}
                      <span className="block text-[10px] font-mono text-slate-400">{item.miningId}</span>
                    </td>
                    <td className="py-1.5 px-4 border-r border-slate-300 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <Lock size={10} /> {item.lifecycleStatus}
                      </span>
                    </td>
                    <td className="py-1.5 px-4 border-r border-slate-300 font-mono text-slate-600 whitespace-nowrap">
                      {item.businessMonth}
                    </td>
                    <td className="py-1.5 px-4 text-right font-mono font-black text-emerald-600 whitespace-nowrap text-sm">
                      ¥ {formatAmount(item.packageNet)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
