/**
 * @file SSOT (Single Source of Truth) - 页面底部合规与备案信息
 * @description 统一收敛页脚版权、工信部 ICP 备案链接及法律协议弹窗触发。
 */

import React from 'react';
import { SITE_META } from '../legal/siteMeta';

export interface SiteFooterProps {
  onOpenLegal?: (tab: 'agreement' | 'privacy') => void;
  className?: string;
}

export const SiteFooter: React.FC<SiteFooterProps> = ({
  onOpenLegal,
  className = '',
}) => {
  return (
    <footer
      className={`w-full py-4 flex flex-wrap items-center justify-center gap-x-2 sm:gap-x-3 gap-y-1 text-[11px] text-slate-400 text-center pointer-events-auto ${className}`}
    >
      <span>{SITE_META.copyright}</span>
      <span className="text-slate-600">|</span>
      <a
        href={SITE_META.icpLink}
        target="_blank"
        rel="noopener noreferrer"
        className="text-slate-400 hover:text-blue-400 transition-colors font-mono underline decoration-slate-600 underline-offset-2"
        title="工业和信息化部政务服务平台 ICP/IP 地址/域名信息备案管理系统"
      >
        {SITE_META.icpNumber}
      </a>
      {onOpenLegal && (
        <>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenLegal('privacy')}
              className="text-slate-400 hover:text-blue-400 transition-colors underline decoration-slate-600 underline-offset-2 cursor-pointer"
            >
              {SITE_META.privacyPolicy.title}
            </button>
            <span className="text-slate-600">|</span>
            <button
              type="button"
              onClick={() => onOpenLegal('agreement')}
              className="text-slate-400 hover:text-blue-400 transition-colors underline decoration-slate-600 underline-offset-2 cursor-pointer"
            >
              {SITE_META.userAgreement.title}
            </button>
          </div>
        </>
      )}
    </footer>
  );
};

export default SiteFooter;
