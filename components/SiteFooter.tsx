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
      className={`absolute bottom-4 left-0 right-0 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-[10px] text-slate-500 z-10 px-4 text-center pointer-events-auto ${className}`}
    >
      <span>{SITE_META.copyright}</span>
      {SITE_META.icpNumber && (
        <span className="hidden sm:inline text-slate-700">|</span>
      )}
      {SITE_META.icpNumber && (
        <span className="font-mono text-slate-500">{SITE_META.icpNumber}</span>
      )}
      {onOpenLegal && (
        <div className="flex items-center gap-2 text-slate-400">
          <span className="text-slate-700">|</span>
          <button
            type="button"
            onClick={() => onOpenLegal('agreement')}
            className="text-slate-400 hover:text-blue-400 transition-colors underline decoration-slate-700 underline-offset-2"
          >
            {SITE_META.userAgreement.title}
          </button>
          <span className="text-slate-700">|</span>
          <button
            type="button"
            onClick={() => onOpenLegal('privacy')}
            className="text-slate-400 hover:text-blue-400 transition-colors underline decoration-slate-700 underline-offset-2"
          >
            {SITE_META.privacyPolicy.title}
          </button>
        </div>
      )}
    </footer>
  );
};

export default SiteFooter;
