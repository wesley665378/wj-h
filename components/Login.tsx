
import React, { useState } from 'react';
import { User, Role } from '../types';
import { Toaster, toast } from 'sonner';
import { LogIn, User as UserIcon, Lock, ShieldCheck } from 'lucide-react';
import LegalOverlay from './LegalOverlay';
import SiteFooter from './SiteFooter';

interface LoginProps {
  onLogin: (user: User) => void;
  onAuthenticate: (userId: string, password: string) => Promise<User | null>;
}

const Login: React.FC<LoginProps> = ({ onLogin, onAuthenticate }) => {
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
      // 模拟服务端鉴权逻辑 (API 调用)
      // 在生产环境中，前端绝不应持有明文密码或进行本地匹配
      const authenticatedUser = await onAuthenticate(userId, password);

      if (authenticatedUser) {
        toast.success(`欢迎回来，${authenticatedUser.name}`);
        onLogin(authenticatedUser);
      } else {
        toast.error('账号或密码错误，请重试');
      }
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('登录服务异常，请稍后再试');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden font-sans pb-16">
      {/* Background decorative elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full max-w-md p-8 bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl z-10 my-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 mb-4">
            <ShieldCheck className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">城市守护者</h1>
          <p className="text-slate-400 mt-2">价值循环智能体管理系统</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300 ml-1">账号</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <UserIcon className="h-5 w-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
              </div>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                placeholder="请输入您的账号"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300 ml-1">密码</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                placeholder="请输入您的密码"
                required
              />
            </div>
          </div>

          {/* 同意短句：密码框下方、「立即登录」按钮正上方 */}
          <div className="text-center text-[5px] text-slate-400 leading-tight py-0.5 select-none">
            登录即表示您已阅读并同意
            <button
              type="button"
              onClick={() => handleOpenLegal('agreement')}
              className="text-slate-400 hover:text-blue-400 transition-colors cursor-pointer underline decoration-slate-600 underline-offset-2 mx-0.5 text-[5px]"
            >
              《用户协议》
            </button>
            与
            <button
              type="button"
              onClick={() => handleOpenLegal('privacy')}
              className="text-slate-400 hover:text-blue-400 transition-colors cursor-pointer underline decoration-slate-600 underline-offset-2 mx-0.5 text-[5px]"
            >
              《隐私政策》
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98]"
          >
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <LogIn className="w-5 h-5 mr-2" />
                立即登录
              </>
            )}
          </button>
        </form>
      </div>

      {/* 登录页全屏底部挂 SiteFooter（absolute bottom-4） */}
      <SiteFooter onOpenLegal={handleOpenLegal} className="absolute bottom-4" />

      {/* 法律条款与隐私政策 Modal */}
      <LegalOverlay
        isOpen={isLegalOpen}
        onClose={() => setIsLegalOpen(false)}
        defaultTab={legalTab}
      />

      <Toaster position="top-center" richColors />
    </div>
  );
};

export default Login;
