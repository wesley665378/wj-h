import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
 * 使用 React Portal 挂载至 document.body，采用 getBoundingClientRect fixed 定位，
 * 防止父级 overflow-hidden / overflow-x-auto 裁切。
 * 
 * 交互优化：
 * - 离开后稍等 (300ms) 再关，保证鼠标可以顺利从按钮移到气泡上
 * - 点击后变为“固定开启”，再次点击或点击外部才关闭
 * - 默认优先在下方弹出
 */
export const InfoTip: React.FC<InfoTipProps> = ({
  content,
  title,
  className = '',
  icon = 'exclamation',
  children,
  placement = 'bottom' // 默认优先在下方弹出
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isClickedOpen, setIsClickedOpen] = useState(false);
  
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [coords, setCoords] = useState<{
    x: number;
    y: number;
    actualPlacement: 'top' | 'bottom';
  } | null>(null);

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    
    // 如果触发器不在当前视口内可见（例如被滚动移出），则不显示或关闭
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setIsVisible(false);
      setIsClickedOpen(false);
      return;
    }

    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const isTopPreferred = placement === 'top';

    let actualPlacement: 'top' | 'bottom' = 'bottom';
    if (isTopPreferred) {
      actualPlacement = spaceAbove < 120 && spaceBelow > spaceAbove ? 'bottom' : 'top';
    } else {
      actualPlacement = spaceBelow < 120 && spaceAbove > spaceBelow ? 'top' : 'bottom';
    }

    const x = rect.left + rect.width / 2;
    const y = actualPlacement === 'top' ? rect.top - 6 : rect.bottom + 6;

    setCoords({ x, y, actualPlacement });
  }, [placement]);

  const handleMouseEnter = () => {
    clearHideTimer();
    updatePosition();
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    if (isClickedOpen) return; // 如果点击打开，则不通过鼠标离开关闭
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 300); // 离开后延迟 300ms 再关闭，确保鼠标能顺利移入气泡
  };

  const handleTooltipMouseEnter = () => {
    clearHideTimer();
  };

  const handleTooltipMouseLeave = () => {
    if (isClickedOpen) return;
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 300);
  };

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isClickedOpen) {
      updatePosition();
      setIsVisible(true);
      setIsClickedOpen(true);
    } else {
      setIsVisible(false);
      setIsClickedOpen(false);
    }
  };

  // 监听点击外部关闭与滚动/视口变化更新位置
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        setIsVisible(false);
        setIsClickedOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      if (isVisible) {
        updatePosition();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      clearHideTimer();
    };
  }, [isVisible, updatePosition]);

  // 对 Tooltip 水平位置和箭头进行视口内严格钳制
  useLayoutEffect(() => {
    if (!isVisible || !coords || !tooltipRef.current) return;
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const margin = 12;
    const viewportWidth = window.innerWidth;

    let left = coords.x - tooltipRect.width / 2;
    if (left < margin) {
      left = margin;
    } else if (left + tooltipRect.width > viewportWidth - margin) {
      left = viewportWidth - margin - tooltipRect.width;
    }

    const arrowX = Math.max(12, Math.min(tooltipRect.width - 12, coords.x - left));

    tooltipRef.current.style.left = `${left}px`;
    tooltipRef.current.style.top = `${coords.y}px`;
    tooltipRef.current.style.transform = coords.actualPlacement === 'top' ? 'translateY(-100%)' : 'translateY(0)';

    if (arrowRef.current) {
      arrowRef.current.style.left = `${arrowX}px`;
    }
  }, [coords, isVisible]);

  return (
    <div 
      ref={triggerRef}
      className={`relative inline-flex items-center align-middle ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children ? (
        <span 
          onClick={handleToggleClick}
          className="cursor-pointer inline-flex items-center"
        >
          {children}
        </span>
      ) : (
        <button
          type="button"
          onClick={handleToggleClick}
          className="w-4 h-4 rounded-full bg-slate-100 hover:bg-amber-100 text-slate-500 hover:text-amber-700 border border-slate-200 hover:border-amber-300 inline-flex items-center justify-center text-[10px] font-black transition-colors shrink-0 ml-1 cursor-pointer"
          aria-label="查看口径说明"
        >
          {icon === 'help' ? <HelpCircle size={11} /> : icon === 'info' ? <AlertCircle size={11} /> : '!'}
        </button>
      )}

      {isVisible && coords && typeof document !== 'undefined' && createPortal(
        <div 
          ref={tooltipRef}
          style={{
            position: 'fixed',
            left: `${coords.x}px`,
            top: `${coords.y}px`,
            zIndex: 200,
            maxWidth: 'calc(100vw - 24px)',
            width: 'max-content',
          }}
          className="p-3 bg-slate-900/95 text-slate-100 text-xs rounded-xl shadow-2xl border border-slate-700/60 backdrop-blur-md pointer-events-auto transition-all animate-in fade-in zoom-in-95 duration-150"
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
          role="tooltip"
        >
          {title && (
            <div className="font-bold text-slate-200 border-b border-slate-700/60 pb-1.5 mb-1.5 flex items-center gap-1.5">
              <span className="text-amber-400 font-mono">📌</span>
              <span>{title}</span>
            </div>
          )}
          <div className="leading-relaxed text-slate-300 font-normal text-[11px] max-w-xs md:max-w-sm whitespace-normal">
            {content}
          </div>
          {/* Arrow */}
          <div 
            ref={arrowRef}
            className={`absolute w-0 h-0 border-4 -translate-x-1/2 ${
              coords.actualPlacement === 'top'
                ? 'top-full border-t-slate-900 border-x-transparent border-b-transparent'
                : 'bottom-full border-b-slate-900 border-x-transparent border-t-transparent'
            }`} 
          />
        </div>,
        document.body
      )}
    </div>
  );
};
