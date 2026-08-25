/**
 * 【架构边界说明】
 * 本组件仅作为 InternalTransactions（内部交易）的专用子模块存在，权限完全继承父页面。
 * 禁止强行提升为 App 顶级路由，禁止在此处单独发起绕过 JWT 鉴权的 fetch 请求。
 */

import React, { useMemo } from 'react';
import { InternalTransaction, MiningResource, User, TransactionStatus, TransactionType, ValueCreationLog, RefineCategory, AuditStatus } from '../types';
import { ProgressBar } from '../src/components/UI';
import { aggregateMiningQuadrantsFromLogs } from '../src/utils/purification';

interface TradingTabProps {
  selectedMineId: string;
  setSelectedMineId: (id: string) => void;
  selectedMine: MiningResource | undefined;
  availableMiningResources: MiningResource[];
  pendingTransactions: InternalTransaction[];
  filteredExchangeTransactions: InternalTransaction[];
  users: User[];
  selectedTx: InternalTransaction | null;
  setSelectedTx: (tx: InternalTransaction | null) => void;
  onAuditTransaction: (tx: InternalTransaction, action: 'approve' | 'reject' | 'return' | 'modify' | 'withdraw' | 'agree') => void;
  startModify: (tx: InternalTransaction) => void;
  modifyingTx: InternalTransaction | null;
  setModifyingTx: (tx: InternalTransaction | null) => void;
  modRevenueAmount: number;
  setModRevenueAmount: (amount: number) => void;
  modValueAmount: number;
  setModValueAmount: (amount: number) => void;
  setShowConfirmModal: (modal: any) => void;
  selectedTxIds: string[];
  setSelectedTxIds: (ids: string[]) => void;
  exportToExcel: () => void;
  logs: ValueCreationLog[];
}

const TradingTab: React.FC<TradingTabProps> = ({
  selectedMineId,
  setSelectedMineId,
  selectedMine,
  availableMiningResources,
  pendingTransactions,
  filteredExchangeTransactions,
  users,
  selectedTx,
  setSelectedTx,
  onAuditTransaction,
  startModify,
  modifyingTx,
  setModifyingTx,
  modRevenueAmount,
  setModRevenueAmount,
  modValueAmount,
  setModValueAmount,
  setShowConfirmModal,
  selectedTxIds,
  setSelectedTxIds,
  exportToExcel,
  logs
}) => {
  return (
    <div className="w-full space-y-8 animate-in slide-in-from-bottom-4">
      {/* Verification Form for Selected Transaction */}
      {selectedTx && (
        <div className="bg-white p-8 rounded-[2.5rem] border-2 border-indigo-100 shadow-2xl space-y-8 animate-in zoom-in-95 duration-300">
          <div className="flex justify-between items-center">
            <h4 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">待验证指令详情</h4>
            <button onClick={() => setSelectedTx(null)} className="text-slate-400 hover:text-slate-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">矿山编号 (唯一量化)</label>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-black text-slate-900 text-xl font-mono">
                  {selectedTx.miningId || '无'}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">交易类型</label>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold text-slate-700">
                  资源交易
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100">
                  <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2">流转收款</p>
                  {modifyingTx?.id === selectedTx.id ? (
                    <input
                      type="number"
                      value={modRevenueAmount}
                      onChange={(e) => setModRevenueAmount(Number(e.target.value))}
                      className="w-full bg-white border-2 border-amber-200 rounded-xl px-4 py-2 font-black text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  ) : (
                    <p className="text-2xl font-black text-amber-700 font-mono">{(selectedTx.revenueAmount || 0).toLocaleString()}</p>
                  )}
                </div>
                <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">流转产值</p>
                  {modifyingTx?.id === selectedTx.id ? (
                    <input
                      type="number"
                      value={modValueAmount}
                      onChange={(e) => setModValueAmount(Number(e.target.value))}
                      className="w-full bg-white border-2 border-emerald-200 rounded-xl px-4 py-2 font-black text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  ) : (
                    <p className="text-2xl font-black text-emerald-700 font-mono">{(selectedTx.valueAmount || 0).toLocaleString()}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">发起经营单元</label>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold text-slate-700">
                  {users.find(u => u.id === selectedTx.senderId)?.center || selectedTx.senderId}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">指令备注</label>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold text-slate-700 min-h-[100px]">
                  {selectedTx.description || '无备注'}
                </div>
              </div>

              <div className="flex space-x-4 pt-4">
                {modifyingTx?.id === selectedTx.id ? (
                  <>
                    <button
                      onClick={() => {
                        setShowConfirmModal({
                          show: true,
                          title: '保存修改',
                          message: '确定要保存修改并提交给发起方验证吗？',
                          onConfirm: () => {
                            onAuditTransaction(selectedTx, 'modify');
                            setSelectedTx(null);
                          }
                        });
                      }}
                      className="flex-1 bg-indigo-500 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg hover:bg-indigo-600 transition-all"
                    >
                      保存修改
                    </button>
                    <button
                      onClick={() => setModifyingTx(null)}
                      className="flex-1 bg-slate-300 text-slate-700 py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg hover:bg-slate-400 transition-all"
                    >
                      取消修改
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setShowConfirmModal({
                          show: true,
                          title: '确认验证',
                          message: '您确定已验证该笔交易指令无误，并确认接收相关资源吗？',
                          onConfirm: () => {
                            onAuditTransaction(selectedTx, 'approve');
                            setSelectedTx(null);
                          }
                        });
                      }}
                      className="flex-1 bg-emerald-500 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg hover:bg-emerald-600 transition-all"
                    >
                      确认接收
                    </button>
                    <button
                      onClick={() => startModify(selectedTx)}
                      className="flex-1 bg-amber-500 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg hover:bg-amber-600 transition-all"
                    >
                      修改
                    </button>
                    <button
                      onClick={() => {
                        setShowConfirmModal({
                          show: true,
                          title: '驳回指令',
                          message: '您确定要驳回该笔交易指令吗？',
                          onConfirm: () => {
                            onAuditTransaction(selectedTx, 'reject');
                            setSelectedTx(null);
                          }
                        });
                      }}
                      className="flex-1 bg-rose-500 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg hover:bg-rose-600 transition-all"
                    >
                      驳回
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mine/Warehouse Selection Dropdown */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-3 block">选择矿山或仓库</label>
        <select 
          value={selectedMineId}
          onChange={(e) => setSelectedMineId(e.target.value)}
          className="w-full min-w-48 bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold outline-none focus:ring-4 focus:ring-indigo-500/10"
        >
          <option value="">请选择矿山或仓库</option>
          {availableMiningResources.map(r => <option key={r.id} value={r.id}>{r.id}</option>)}
        </select>
      </div>

      {(() => {
        if (!selectedMine) return null;
        const q = aggregateMiningQuadrantsFromLogs(logs, availableMiningResources, selectedMine.id);
        return (
          <>
            {/* Mining Asset Confirmation Status Monitoring */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-8">
              <h4 className="text-xl font-black text-slate-800 tracking-tighter uppercase">矿山资源资产确权状态监控</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <ProgressBar 
                  label=" 收款当前采集进度" 
                  subLabel={q.revenue.confirmed >= q.revenue.capacity ? "已采集" : `${Math.round(q.revenue.confirmed).toLocaleString()} / ${Math.round(q.revenue.capacity).toLocaleString()}`}
                  value={Math.min(q.revenue.confirmed, q.revenue.capacity)}
                  max={q.revenue.capacity || 1}
                  color="bg-amber-500"
                />
                <ProgressBar 
                  label=" 产值当前采集进度" 
                  subLabel={(q.value.pending + q.value.confirmed) >= q.value.capacity ? "已采集" : `${Math.round(q.value.pending + q.value.confirmed).toLocaleString()} / ${Math.round(q.value.capacity).toLocaleString()}`}
                  value={Math.min(q.value.pending + q.value.confirmed, q.value.capacity)}
                  max={q.value.capacity || 1}
                  color="bg-emerald-500"
                />
              </div>
            </div>

            {/* Shared Mining Allocation (Multi-department) */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h4 className="text-xl font-black text-slate-800 tracking-tighter uppercase mb-8">共享提炼分配 (多部门)</h4>
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200/60">
                <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 font-black text-xs">
                      {selectedMine.assignedTo?.substring(0, 2) || '未'}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800">{selectedMine.assignedTo || '未分配'}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">当前所属经营单元</p>
                    </div>
                  </div>
                  <span className="px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest">确权明细</span>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                  {[
                    { label: '已确权收款', value: q.revenue.confirmed, color: 'text-amber-600' },
                    { label: '未确权收款', value: q.revenue.unconfirmed, color: 'text-amber-500' },
                    { label: '待确权产值', value: q.value.pending, color: 'text-emerald-600' },
                    { label: '已确权产值', value: q.value.confirmed, color: 'text-emerald-500' },
                    { label: '未确权产值', value: q.value.unconfirmed, color: 'text-emerald-400' }
                  ].map((item, idx) => (
                    <div key={idx} className="space-y-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{item.label}</p>
                      <p className={`text-lg font-black font-mono ${item.color}`}>
                        {Math.round(item.value).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* Business Unit Dashboard */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-8">
        <h4 className="text-xl font-black text-slate-800 tracking-tighter uppercase">接收经营价值流</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from(new Set(users.map(u => u.center).filter(Boolean))).map(center => {
            // Calculate unverified value for this center
            const centerUsers = users.filter(u => u.center === center).map(u => u.id);
            
            // 1. 还在流转中的产值 (待接收方确认)
            const pendingTxsValue = pendingTransactions
              .concat(filteredExchangeTransactions)
              .filter(tx => centerUsers.includes(tx.receiverId) && tx.status === TransactionStatus.PendingTarget && tx.type === TransactionType.Resource)
              .reduce((sum, tx) => sum + (tx.valueAmount || 0), 0);

            // 2. 已接收但处于“待确权”状态的产值 (联动确权注入的积分)
            const pendingLogsValue = logs.filter(l => 
              centerUsers.includes(l.recordedCollectorId) && 
              l.category === RefineCategory.Value && 
              l.status === AuditStatus.Pending
            ).reduce((sum, l) => sum + (l.amount || 0), 0);

            const totalUnconfirmedValue = pendingTxsValue + pendingLogsValue;

            if (totalUnconfirmedValue === 0) return null;

            return (
              <div key={center} className="bg-slate-50 p-6 rounded-3xl border border-slate-200/60">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">所属经营单元</p>
                <p className="text-lg font-black text-slate-800 mb-4">{center}</p>
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-tighter">未确权产值</p>
                  <p className="text-2xl font-black text-emerald-700 font-mono">
                    {totalUnconfirmedValue.toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Audit List */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h4 className="text-xl font-black text-slate-800 tracking-tighter uppercase">待验证指令</h4>
          {selectedTxIds.length > 0 && (
            <button
              onClick={() => {
                setShowConfirmModal({
                  show: true,
                  batch: true,
                  action: 'approve',
                  title: '批量确认交易指令',
                  message: `您确定要批量确认选中的 ${selectedTxIds.length} 笔交易指令吗？确认后，相关的矿山资源将流转至您的经营单元。`,
                });
              }}
              className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all"
            >
              批量确认 ({selectedTxIds.length})
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                <th className="py-4 px-2">
                  <input
                    type="checkbox"
                    checked={pendingTransactions.length > 0 && selectedTxIds.length === pendingTransactions.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTxIds(pendingTransactions.map(tx => tx.id));
                      } else {
                        setSelectedTxIds([]);
                      }
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="py-4">交易ID</th>
                <th className="py-4">交易发起经营单元</th>
                <th className="py-4">接收经营单元</th>
                <th className="py-4">资源/流转度</th>
                <th className="py-4">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pendingTransactions.map(tx => {
                const sender = users.find(u => u.id === tx.senderId);
                const receiver = users.find(u => u.id === tx.receiverId);
                return (
                  <tr key={tx.id} className={`text-xs font-bold transition-colors ${selectedTxIds.includes(tx.id) ? 'bg-indigo-50/30' : 'hover:bg-slate-50/50'}`}>
                    <td className="py-4 px-2">
                      <input
                        type="checkbox"
                        checked={selectedTxIds.includes(tx.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTxIds([...selectedTxIds, tx.id]);
                          } else {
                            setSelectedTxIds(selectedTxIds.filter(id => id !== tx.id));
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="py-4 font-mono text-slate-400">#{tx.id}</td>
                    <td className="py-4">
                      <span className="text-slate-900">{sender?.center || sender?.name || tx.senderId}</span>
                    </td>
                    <td className="py-4">{receiver?.center || receiver?.name || tx.receiverId}</td>
                    <td className="py-4">
                      {tx.type === TransactionType.Resource ? (
                        <div className="flex flex-col">
                          {tx.revenueAmount && tx.revenueAmount > 0 && <span> {tx.revenueAmount.toLocaleString()}</span>}
                          {tx.valueAmount && tx.valueAmount > 0 && <span> {tx.valueAmount.toLocaleString()}</span>}
                        </div>
                      ) : (
                        tx.amount.toLocaleString()
                      )}
                    </td>
                    <td className="py-4 flex items-center space-x-3">
                      <button 
                        onClick={() => {
                          setSelectedTx(tx);
                          if (tx.miningId) setSelectedMineId(tx.miningId);
                        }} 
                        className="text-indigo-600 hover:underline"
                      >
                        验证
                      </button>
                      {tx.status === TransactionStatus.PendingTarget && (
                        <button 
                          onClick={() => {
                            setShowConfirmModal({
                              show: true,
                              title: '确认交易指令',
                              message: `您确定要确认来自 ${sender?.center || sender?.name} 的资源交易指令吗？确认后，矿山编号 ${tx.miningId} 将流转至您的经营单元。`,
                              onConfirm: () => onAuditTransaction(tx, 'approve')
                            });
                          }} 
                          className="bg-emerald-500 text-white px-3 py-1 rounded-lg hover:bg-emerald-600 transition-colors"
                        >
                          确认
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default TradingTab;
