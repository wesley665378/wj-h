
import React, { useRef } from 'react';
import { User, Role } from '../types';
import { MENU_ITEMS } from '../constants';
import { checkUserPermission } from '../src/utils/business';
import pkg from '../package.json';

interface SidebarProps {
  user: User;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onUpdateAvatar?: (avatarUrl: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ user, activeTab, setActiveTab, onUpdateAvatar }) => {
  const menuItems = MENU_ITEMS.map(item => {
    return { ...item, show: checkUserPermission(user, item.id) };
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onUpdateAvatar) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onUpdateAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="w-64 flex flex-col h-full bg-slate-900 border-r border-slate-700">
      <div className="p-6">
        <div className="flex items-center space-x-3 text-blue-400 mb-8">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/20">世</div>
          <div className="flex flex-col">
            <span className="text-sm font-black text-white tracking-tighter leading-tight">
              城市守护者<br />价值循环智能体
            </span>
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 mb-4 overflow-hidden relative group">
           <div className="absolute -right-4 -top-4 w-12 h-12 bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition-all"></div>
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">采集主体</p>
           <div className="flex items-center space-x-3">
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleAvatarUpload} 
              />
              <div 
                className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-mono text-xs overflow-hidden cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                onClick={() => fileInputRef.current?.click()}
                title="点击上传头像"
              >
                {user.avatar ? (
                  <img src={user.avatar} className="w-full h-full object-cover" alt="Avatar" />
                ) : (
                  user.id.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-white truncate w-28" title={user.name}>{user.name}</h4>
                <p className="text-[9px] text-slate-400 font-medium truncate" title={user.category || '—'}>{user.category || '—'}</p>
              </div>
           </div>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar">
        {menuItems.map(item => item.show && (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            title={`切换至 [${item.label}] 模块`}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === item.id 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="font-bold text-sm">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-6 border-t border-slate-800 space-y-4">
         <div className="flex items-center justify-center space-x-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>系统安全保护中</span>
         </div>
         <div className="text-center">
            <span className="text-[9px] font-mono font-black text-slate-600 uppercase tracking-[0.2em]">
            系统版本 v{pkg.version}
            </span>
         </div>
      </div>
    </div>
  );
};

export default Sidebar;
