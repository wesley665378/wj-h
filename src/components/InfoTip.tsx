import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, AlertCircle } from 'lucide-react';

interface InfoTipProps {
  content: React.ReactNode;
  title?: string;
  className?: string;
  icon?: 'exclamation' | 'help' | 'info';
  children?: React.ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * 统一口径悬停气泡提示组件
 * 支持鼠标悬停与点击查看，禁止仅靠浏览器原生 title 属性，禁止冗长白皮书公式。
 */
export const InfoTip: React.FC<InfoTipProps> = ({
  content,
  title,
  className = '',
  icon = 'exclamation',
  children,
  placement = 'top'
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setIsVisible(false);
      }
    };
    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible]);

  const placementClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-slate-900 border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-900 border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-slate-900 border-y-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-slate-900 border-y-transparent border-l-transparent'
  };

  return (
    <div 
      ref={triggerRef}
      className={`relative inline-flex items-center align-middle ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children ? (
        <span 
          onClick={() => setIsVisible(!isVisible)}
          className="cursor-pointer inline-flex items-center"
        >
          {children}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setIsVisible(!isVisible)}
          className="w-4 h-4 rounded-full bg-slate-100 hover:bg-amber-100 text-slate-500 hover:text-amber-700 border border-slate-200 hover:border-amber-300 inline-flex items-center justify-center text-[10px] font-black transition-colors shrink-0 ml-1"
          aria-label="查看口径说明"
        >
          {icon === 'help' ? <HelpCircle size={11} /> : icon === 'info' ? <AlertCircle size={11} /> : '!'}
        </button>
      )}

      {isVisible && (
        <div 
          className={`absolute z-50 ${placementClasses[placement]} w-max max-w-xs md:max-w-sm p-3 bg-slate-900/95 text-slate-100 text-xs rounded-xl shadow-xl border border-slate-700/60 backdrop-blur-xs pointer-events-auto transition-all animate-in fade-in zoom-in-95 duration-150`}
          role="tooltip"
        >
          {title && (
            <div className="font-bold text-slate-200 border-b border-slate-700/60 pb-1.5 mb-1.5 flex items-center gap-1.5">
              <span className="text-amber-400 font-mono">📌</span>
              <span>{title}</span>
            </div>
          )}
          <div className="leading-relaxed text-slate-300 font-normal text-[11px]">
            {content}
          </div>
          {/* Arrow */}
          <div className={`absolute w-0 h-0 border-4 ${arrowClasses[placement]}`} />
        </div>
      )}
    </div>
  );
};
