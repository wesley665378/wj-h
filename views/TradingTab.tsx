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
    <div className="w-full space-y-6">
      <div className={`bg-white ${UI_TOKENS.RADIUS_PANEL} shadow-xl border border-slate-100 overflow-hidden`}>
        <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
          <h4 className="text-xl font-black flex items-center tracking-tighter uppercase">
            <span className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center mr-4 shadow-lg">⚖️</span>
            待验证流转指令 ({pendingTransactions.length})
          </h4>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="px-10 py-6">指令编号/时间</th>
                <th className="px-6 py-6">类型/关联资产</th>
                <th className="px-6 py-6">路由节点</th>
                <th className="px-6 py-6 text-right">流转度</th>
                <th className="px-10 py-6 text-center">操作区</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
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
                  <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-10 py-6">
                      <span className="font-mono text-[10px] font-black text-slate-300 block mb-1">#{tx.id}</span>
                      <span className="text-[9px] font-bold text-slate-500">{new Date(tx.timestamp).toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-6">
                      <span className="text-[9px] font-black px-3 py-1 rounded-lg uppercase tracking-widest bg-indigo-50 text-indigo-600">{tx.type}</span>
                      {tx.miningId && <p className="text-[9px] font-black text-slate-400 mt-2">矿山: {tx.miningId}</p>}
                    </td>
                    <td className="px-6 py-6">
                      <div className="flex items-center space-x-3 text-xs font-bold text-slate-800">
                        <span>{sender?.center || sender?.name || tx.senderId}</span>
                        <span className="text-slate-300">→</span>
                        <span className="text-indigo-600 font-black">{receiver?.center || receiver?.name || tx.receiverId}</span>
                      </div>
                    </td>
                    <td className="px-6 py-6 text-right font-mono font-black text-slate-900">
                      {Math.round((tx.revenueAmount || 0) + (tx.valueAmount || 0) || tx.amount).toLocaleString()}
                    </td>
                    <td className="px-10 py-6">
                      <div className="flex items-center justify-center space-x-2">
                        {tx.status === TransactionStatus.PendingTarget && isReceiver && (
                          <>
                            <button
                              onClick={() => handleAudit(tx, 'approve')}
                              className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                            >
                              确认接收
                            </button>
                            <button
                              onClick={() => startModify(tx)}
                              className="px-4 py-2 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all"
                            >
                              修正
                            </button>
                            <button
                              onClick={() => handleAudit(tx, 'return')}
                              className="px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all"
                            >
                              退回
                            </button>
                          </>
                        )}
                        {tx.status === TransactionStatus.PendingInitiatorVerify && isSender && (
                          <>
                            <button
                              onClick={() => handleAudit(tx, 'agree')}
                              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
                            >
                              同意变更
                            </button>
                            <button
                              onClick={() => handleAudit(tx, 'reject')}
                              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                            >
                              拒绝变更
                            </button>
                          </>
                        )}
                        {tx.status === TransactionStatus.Returned && isSender && (
                          <button
                            onClick={() => handleAudit(tx, 'approve')}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
                          >
                            重新提交
                          </button>
                        )}
                        {tx.status === TransactionStatus.PendingAdmin && isAdmin && (
                          <button
                            onClick={() => handleAudit(tx, 'approve')}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
                          >
                            终审确权
                          </button>
                        )}
                        {isSender && tx.status === TransactionStatus.PendingTarget && (
                          <button
                            onClick={() => handleAudit(tx, 'withdraw')}
                            className="px-4 py-2 bg-slate-100 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 hover:text-slate-600 transition-all"
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
                  <td colSpan={5} className="px-6 py-20 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest">{UI_LABELS.EMPTY_DEFAULT}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
