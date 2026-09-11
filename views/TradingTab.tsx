import React from 'react';
import { UI_TOKENS } from '../src/constants/uiTokens';
import { User, InternalTransaction, TransactionType, TransactionStatus, MiningResource } from '../types';
import { centerMatch } from '../src/utils/centerScope';
import { userCenterMatchesBusinessUnit } from '../src/utils/businessUnitName';
import { UI_LABELS } from '../src/constants/uiLabels';

export interface TradingTabProps {
  currentUserId: string;
  currentUser?: User;
  pendingTransactions: InternalTransaction[];
  users: User[];
  managerSource?: User[];
  managerCandidates?: User[];
  isAdmin?: boolean;
  onAuditTransaction?: (txIdOrList: string | string[], status: TransactionStatus, updatedResource?: MiningResource | MiningResource[]) => void;
  onHandleAudit?: (tx: InternalTransaction, action: 'approve' | 'modify' | 'reject' | 'agree' | 'return' | 'withdraw') => void;
  onStartModify?: (tx: InternalTransaction) => void;
  onNavigateToApply?: () => void;
}

export const TradingTab: React.FC<TradingTabProps> = ({
  currentUserId,
  currentUser,
  pendingTransactions,
  users,
  managerSource = [],
  managerCandidates = [],
  isAdmin = false,
  onAuditTransaction,
  onHandleAudit,
  onStartModify,
  onNavigateToApply,
}) => {
  const effectiveUser = currentUser || users.find(u => u.id === currentUserId) || { id: currentUserId, name: '', center: '' } as User;
  const managers = managerSource.length > 0 ? managerSource : (managerCandidates.length > 0 ? managerCandidates : users);

  const handleAudit = (tx: InternalTransaction, action: 'approve' | 'modify' | 'reject' | 'agree' | 'return' | 'withdraw') => {
    if (onHandleAudit) {
      onHandleAudit(tx, action);
    } else if (onAuditTransaction) {
      let nextStatus = tx.status;
      if (action === 'approve') {
        nextStatus = tx.type === TransactionType.Resource ? TransactionStatus.Verified : TransactionStatus.Verified;
      } else if (action === 'return') {
        nextStatus = TransactionStatus.Returned;
      } else if (action === 'reject') {
        nextStatus = TransactionStatus.PendingTarget;
      } else if (action === 'agree') {
        nextStatus = TransactionStatus.Verified;
      } else if (action === 'withdraw') {
        nextStatus = TransactionStatus.Rejected;
      }
      onAuditTransaction(tx.id, nextStatus);
    }
  };

  const startModify = (tx: InternalTransaction) => {
    if (onStartModify) {
      onStartModify(tx);
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className={`bg-white ${UI_TOKENS.RADIUS_PANEL} shadow-sm border border-slate-200 overflow-hidden`}>
        <div className="bg-slate-900 px-6 py-4 text-white flex justify-between items-center">
          <h4 className="text-base font-bold flex items-center tracking-tight">
            <span className="w-8 h-8 bg-indigo-500/20 text-indigo-400 rounded-lg flex items-center justify-center mr-3 text-sm">⚖️</span>
            待办验证流转指令 ({pendingTransactions.length})
          </h4>
        </div>
        
        <div className="max-h-[calc(100vh-14rem)] overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-100 text-xs font-bold text-slate-700 border-b border-slate-200 whitespace-nowrap shadow-xs">
              <tr>
                <th className="px-4 py-2.5 sticky left-0 z-40 bg-slate-100 border-r border-slate-200/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] min-w-[120px]">指令编号/时间</th>
                <th className="px-4 py-2.5 min-w-[130px]">类型/关联资产</th>
                <th className="px-4 py-2.5 min-w-[200px]">路由节点</th>
                <th className="px-4 py-2.5 text-right min-w-[100px]">流转度</th>
                <th className="px-4 py-2.5 text-center min-w-[180px]">操作区</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {pendingTransactions.map(tx => {
                const sender = managers.find(u => u.id === tx.senderId) || users.find(u => u.id === tx.senderId);
                const receiver = managers.find(u => u.id === tx.receiverId) || users.find(u => u.id === tx.receiverId);
                const isReceiver = tx.receiverId === currentUserId || 
                  centerMatch(effectiveUser.center, receiver?.center) || 
                  centerMatch(effectiveUser.center, tx.receiverId) ||
                  userCenterMatchesBusinessUnit(effectiveUser.center, receiver?.center) ||
                  userCenterMatchesBusinessUnit(effectiveUser.center, tx.receiverId);
                const isSender = tx.senderId === currentUserId || 
                  centerMatch(effectiveUser.center, sender?.center) || 
                  centerMatch(effectiveUser.center, tx.senderId) ||
                  userCenterMatchesBusinessUnit(effectiveUser.center, sender?.center) ||
                  userCenterMatchesBusinessUnit(effectiveUser.center, tx.senderId);

                return (
                  <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-4 py-2.5 sticky left-0 z-30 bg-white group-hover:bg-slate-50 border-r border-slate-200/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">
                      <span className="font-mono text-xs font-bold text-slate-900 block">#{tx.id}</span>
                      <span className="text-[11px] font-mono text-slate-500">{new Date(tx.timestamp).toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">{tx.type}</span>
                      {tx.miningId && <p className="text-[11px] font-medium text-slate-500 mt-0.5">矿山: {tx.miningId}</p>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center space-x-2 text-xs font-medium text-slate-800">
                        <span>{sender?.center || sender?.name || tx.senderId}</span>
                        <span className="text-slate-400">→</span>
                        <span className="text-indigo-600 font-bold">{receiver?.center || receiver?.name || tx.receiverId}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                      {Math.round((tx.revenueAmount || 0) + (tx.valueAmount || 0) || tx.amount).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center space-x-2">
                        {tx.status === TransactionStatus.PendingTarget && isReceiver && (
                          <>
                            <button
                              onClick={() => handleAudit(tx, 'approve')}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs active:scale-95"
                            >
                              确认接收
                            </button>
                            <button
                              onClick={() => startModify(tx)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-all"
                            >
                              修正
                            </button>
                            <button
                              onClick={() => handleAudit(tx, 'return')}
                              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-medium transition-all"
                            >
                              退回
                            </button>
                          </>
                        )}
                        {tx.status === TransactionStatus.PendingInitiatorVerify && isSender && (
                          <>
                            <button
                              onClick={() => handleAudit(tx, 'agree')}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs active:scale-95"
                            >
                              同意变更
                            </button>
                            <button
                              onClick={() => handleAudit(tx, 'reject')}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-all"
                            >
                              拒绝变更
                            </button>
                          </>
                        )}
                        {tx.status === TransactionStatus.Returned && isSender && (
                          <button
                            onClick={() => handleAudit(tx, 'approve')}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs active:scale-95"
                          >
                            重新提交
                          </button>
                        )}
                        {tx.status === TransactionStatus.PendingAdmin && isAdmin && (
                          <button
                            onClick={() => handleAudit(tx, 'approve')}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs active:scale-95"
                          >
                            终审确权
                          </button>
                        )}
                        {isSender && tx.status === TransactionStatus.PendingTarget && (
                          <button
                            onClick={() => handleAudit(tx, 'withdraw')}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded-lg text-xs font-medium transition-all"
                          >
                            撤回
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pendingTransactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3 text-slate-500">
                      <span className="text-xs font-bold">暂无待验证的内部交易指令</span>
                      {onNavigateToApply && (
                        <button
                          onClick={onNavigateToApply}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center space-x-1"
                        >
                          <span>去发起交易</span>
                          <span>→</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
