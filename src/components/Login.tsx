/**
 * @file SSOT (Single Source of Truth) - 登录与身份验证组件
 * @description 提供系统用户登录界面、凭证输入与法律协议声明入口。
 */

import React, { useState } from 'react';
import { User } from '../types';
import { toast } from 'sonner';
import { LogIn, User as UserIcon, Lock, ShieldCheck } from 'lucide-react';
import LegalOverlay from './LegalOverlay';
import SiteFooter from './SiteFooter';

interface LoginProps {
  onLogin: (user: User) => void;
  onAuthenticate: (userId: string, password: string) => Promise<User | null>;
}

export const Login: React.FC<LoginProps> = ({ onLogin, onAuthenticate }) => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLegalOpen, setIsLegalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<'agreement' | 'privacy'>('agreement');

  const handleOpenLegal = (tab: 'agreement' | 'privacy') => {
    setLegalTab(tab);
    setIsLegalOpen(true);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const authenticatedUser = await onAuthenticate(userId, password);

      if (authenticatedUser) {
        toast.success(`欢迎回来，${authenticatedUser.name}`);
        onLogin(authenticatedUser);
      } else {
        toast.error('账号或密码错误，请重试');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      toast.error(err?.message || '登录连接失败，请检查网络或后端服务');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between p-4 relative overflow-hidden">
      {/* Background visual accents */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none" />

      {/* Top spacer */}
      <div className="w-full" />

      {/* Main card */}
      <div className="w-full max-w-md mx-auto my-auto relative z-10">
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-8">
          {/* Brand header */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-blue-600/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto text-blue-400 mb-4 shadow-inner">
              <ShieldCheck size={32} />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              城市守护者
            </h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              价值循环智能体 · 登录鉴权
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                账号 / 工号
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <UserIcon size={16} />
                </div>
                <input
                  type="text"
                  required
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="请输入您的工号或用户名"
                  className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                密码
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock size={16} />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={16} />
                  <span>立即登录</span>
                </>
              )}
            </button>
          </form>

          {/* Legal Notice */}
          <div className="text-center">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              登录即代表您已同意并接受{' '}
              <button
                type="button"
                onClick={() => handleOpenLegal('agreement')}
                className="text-blue-400 hover:underline cursor-pointer"
              >
                《用户协议》
              </button>{' '}
              与{' '}
              <button
                type="button"
                onClick={() => handleOpenLegal('privacy')}
                className="text-blue-400 hover:underline cursor-pointer"
              >
                《隐私政策》
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <SiteFooter onOpenLegal={handleOpenLegal} />

      {/* Legal Modal Overlay */}
      <LegalOverlay
        isOpen={isLegalOpen}
        onClose={() => setIsLegalOpen(false)}
        defaultTab={legalTab}
      />
    </div>
  );
};

export default Login;
