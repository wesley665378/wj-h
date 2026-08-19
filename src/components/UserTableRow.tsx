import React from 'react';
import { User, Role } from '../../types';
import { Badge } from './UI';
import { useCostPrivacy } from '../hooks/useCostPrivacy';

interface UserTableRowProps {
  user: User;
  getRoleIcon: (role: Role) => string;
  onEdit: (user: User) => void;
  onDelete?: (id: string) => void;
  onToggleStatus?: (user: User) => void;
  mode: 'full' | 'compact';
}

export const UserTableRow: React.FC<UserTableRowProps> = ({ user, getRoleIcon, onEdit, onDelete, onToggleStatus, mode }) => {
  const { maskMoney } = useCostPrivacy();
  const isInactive = user.userStatus === 'inactive';

  if (mode === 'compact') {
    return (
      <tr className={`border-b border-slate-50 transition-colors ${isInactive ? 'bg-slate-50/80 opacity-60' : 'hover:bg-slate-50/50'}`}>
        <td className="py-4 px-6 font-mono text-xs font-bold text-slate-500">{user.id}</td>
        <td className="py-4 px-6 font-black text-slate-900 text-sm">
          {user.name}
          {isInactive && <span className="ml-2 text-[9px] bg-slate-200 text-slate-500 px-1 rounded">已离职</span>}
        </td>
        <td className="py-4 px-6 text-xs font-bold text-slate-600">{user.center || '未分配'}</td>
        <td className="py-4 px-6 text-right">
          <span className="font-mono font-black text-slate-900 text-sm">{maskMoney(user.salaryPackage || 0)}</span>
        </td>
        <td className="py-4 px-6 text-right">
          <div className="flex justify-end space-x-2">
            <button onClick={() => onEdit(user)} className="text-blue-600 text-[10px] font-black uppercase hover:underline">编辑</button>
            {onToggleStatus && (
               <button 
                 onClick={() => onToggleStatus(user)} 
                 className={`${isInactive ? 'text-emerald-600' : 'text-orange-600'} text-[10px] font-black uppercase hover:underline`}
               >
                 {isInactive ? '复职' : '注销'}
               </button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`border-b border-slate-50 transition-colors group ${isInactive ? 'bg-slate-50 opacity-60' : 'hover:bg-slate-50/50'}`}>
      <td className="py-4 px-6">
        <span className="font-mono text-xs font-bold text-slate-500">{user.id}</span>
      </td>
      <td className="py-4 px-6">
        <div className="flex items-center space-x-3">
          <span className="text-lg">{getRoleIcon(user.role)}</span>
          <span className="font-black text-slate-900 text-sm">{user.name}</span>
          {isInactive && <Badge variant="dark" className="bg-slate-200 text-slate-500 text-[9px] border-none">离职</Badge>}
        </div>
      </td>
      <td className="py-4 px-6">
        <span className="text-xs font-bold text-slate-600">{user.center || '未分配'}</span>
      </td>
      <td className="py-4 px-6">
        <div className="flex flex-col gap-1">
          <Badge variant="info" className="text-[10px] w-fit">{user.category || '通用'}</Badge>
          {(user.secondaryRoles || []).map(r => (
            <Badge key={r} className="bg-indigo-50 text-indigo-600 border-indigo-100 text-[9px] w-fit italic">兼: {r}</Badge>
          ))}
        </div>
      </td>
      <td className="py-4 px-6">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{user.salaryPackageType || '未分类'}</span>
      </td>
      <td className="py-4 px-6">
        <span className="font-mono text-sm font-black text-slate-900">{maskMoney(user.salaryPackage || 0)}</span>
      </td>
      <td className="py-4 px-6 text-right">
        <div className="flex justify-end space-x-4 sm:opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(user)} className="text-blue-600 text-[10px] font-black uppercase hover:underline">编辑</button>
          {onToggleStatus && (
            <button 
              onClick={() => onToggleStatus(user)} 
              className={`${isInactive ? 'text-emerald-600' : 'text-orange-600'} text-[10px] font-black uppercase hover:underline`}
            >
              {isInactive ? '恢复在职' : '办理离职'}
            </button>
          )}
          {onDelete && (
            <button onClick={() => onDelete(user.id)} className="text-rose-500 text-[10px] font-black uppercase hover:underline">注销</button>
          )}
        </div>
      </td>
    </tr>
  );
};
