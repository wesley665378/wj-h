import React, { useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import StandardModal from './StandardModal';
import { useCityGuardianModal, CityGuardianModal } from './CityGuardianModal';

import { isWeakPassword, assertAcceptablePassword } from '../utils/security';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (oldPassword: string, newPassword: string) => Promise<boolean>;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose, onUpdate }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { modalState, showAlert, showConfirm, closeModal } = useCityGuardianModal();

  if (!isOpen) return null;

  const isMatch = newPassword === confirmPassword;
  const showMatchError = confirmPassword.length > 0 && !isMatch;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isMatch) {
      showAlert('两次输入的新密码不一致');
      return;
    }

    const pwCheck = assertAcceptablePassword(newPassword);
    if (!pwCheck.acceptable) {
      showAlert(pwCheck.message || '密码不符合规范');
      return;
    }

    showConfirm('您确定要提交修改登录密码吗？', async () => {
      setIsSubmitting(true);
      try {
        const success = await onUpdate(currentPassword, newPassword);
        if (success) {
          showAlert('密码修改成功', () => {
            onClose();
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
          });
        } else {
          showAlert('当前密码错误，修改失败');
        }
      } catch (error) {
        showAlert('系统异常，请稍后再试');
      } finally {
        setIsSubmitting(false);
      }
    });
  };

  return (
    <>
      <StandardModal
        isOpen={isOpen}
        onClose={onClose}
        title="城市守护者"
        subtitle="修改登录密码"
        icon={<Lock className="w-6 h-6" />}
        maxWidthClassName="max-w-md"
      >
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4 text-xs font-bold text-amber-800">
          🔒 初始密码/首次登录提示：如果您使用的是初始默认密码 (66668888)，请及时设置新的安全密码。
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">当前密码</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="w-5 h-5 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="block w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-bold placeholder-slate-300 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
                placeholder="请输入当前密码"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">新密码</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <ShieldCheck className="w-5 h-5 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="block w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-bold placeholder-slate-300 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
                placeholder="请输入新密码 (至少8位，且非弱口令)"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">确认新密码</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <ShieldCheck className="w-5 h-5 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`block w-full pl-12 pr-4 py-4 bg-slate-50 border rounded-2xl text-slate-900 font-bold placeholder-slate-300 focus:outline-none focus:ring-4 transition-all text-sm ${
                  showMatchError 
                    ? 'border-rose-500 focus:ring-rose-500/10 focus:border-rose-500' 
                    : 'border-slate-200 focus:ring-blue-500/10 focus:border-blue-500'
                }`}
                placeholder="请再次输入新密码"
                required
              />
            </div>
            {showMatchError && (
              <p className="text-[10px] font-bold text-rose-500 uppercase tracking-tight ml-1 animate-in fade-in slide-in-from-top-1">
                ⚠️ 两次输入的密码不一致
              </p>
            )}
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-5 bg-slate-900 text-white font-black rounded-[2rem] text-xs uppercase tracking-[0.2em] hover:bg-blue-600 shadow-2xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center animate-pulse"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                '确认修改密码'
              )}
            </button>
          </div>
        </form>
      </StandardModal>
      <CityGuardianModal state={modalState} onClose={closeModal} />
    </>
  );
};

export default ChangePasswordModal;
