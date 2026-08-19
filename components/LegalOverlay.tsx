import React, { useState, useEffect } from 'react';
import { ShieldCheck, FileText, X } from 'lucide-react';
import { SITE_META } from '../legal/siteMeta';

export interface LegalOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'agreement' | 'privacy';
}

export const LegalOverlay: React.FC<LegalOverlayProps> = ({
  isOpen,
  onClose,
  defaultTab = 'agreement',
}) => {
  const [activeTab, setActiveTab] = useState<'agreement' | 'privacy'>(defaultTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

  if (!isOpen) return null;

  const currentDoc =
    activeTab === 'agreement' ? SITE_META.userAgreement : SITE_META.privacyPolicy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-2xl max-h-[85vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900/90 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-blue-400">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h3 className="text-base font-black text-white tracking-wide">
                法律条款与隐私协议
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {SITE_META.companyName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-xl transition-all"
            title="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 p-1.5 gap-1 mx-6 mt-4 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('agreement')}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'agreement'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <FileText size={14} />
            {SITE_META.userAgreement.title}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'privacy'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <ShieldCheck size={14} />
            {SITE_META.privacyPolicy.title}
          </button>
        </div>

        {/* Document meta info */}
        <div className="px-6 pt-4 flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800/60 pb-3 mx-6">
          <span>版本号: {currentDoc.version}</span>
          <span>更新日期: {currentDoc.updatedAt}</span>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar text-xs leading-relaxed text-slate-300">
          {currentDoc.sections.map((section, idx) => (
            <div key={idx} className="space-y-2">
              <h4 className="font-bold text-slate-100 text-sm tracking-tight">
                {section.heading}
              </h4>
              <p className="text-slate-400 font-normal leading-normal">
                {section.content}
              </p>
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between px-6">
          <span className="text-[10px] text-slate-500 font-mono">
            {SITE_META.copyright}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all"
          >
            已知晓并关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default LegalOverlay;
