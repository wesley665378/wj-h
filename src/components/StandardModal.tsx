import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface StandardModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string | React.ReactNode;
  subtitle?: string | React.ReactNode;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  maxWidthClassName?: string; // e.g., 'max-w-md', 'max-w-lg', 'max-w-2xl', etc.
  id?: string;
}

export const StandardModal: React.FC<StandardModalProps> & {
  Header: React.FC<{ title: string | React.ReactNode; subtitle?: string | React.ReactNode; icon?: React.ReactNode; onClose: () => void }>;
  Body: React.FC<{ children: React.ReactNode; className?: string }>;
  Footer: React.FC<{ children: React.ReactNode; className?: string }>;
} = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  footer,
  children,
  maxWidthClassName = 'max-w-lg',
  id,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Inspect children to see if they are using Subcomponents
  let hasSubComponents = false;
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      const type = child.type as any;
      if (type === StandardModal.Header || type === StandardModal.Body || type === StandardModal.Footer) {
        hasSubComponents = true;
      }
    }
  });

  return (
    <div
      id={id}
      onClick={handleOverlayClick}
      className="fixed inset-0 wrongs z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
    >
      <div
        className={`bg-white w-full ${maxWidthClassName} rounded-[2rem] md:rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        {hasSubComponents ? (
          children
        ) : (
          <>
            {/* Sticky Header */}
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-5 md:px-8 flex items-center justify-between z-10 flex-shrink-0">
              <div className="flex items-center space-x-4">
                {icon && (
                  <div className="w-12 h-12 bg-slate-950 text-white rounded-2xl flex items-center justify-center shadow-xl flex-shrink-0">
                    {icon}
                  </div>
                )}
                <div>
                  {typeof title === 'string' ? (
                    <h3 className="text-base md:text-lg font-black text-slate-800 tracking-tight leading-snug">{title}</h3>
                  ) : (
                    title
                  )}
                  {subtitle && (
                    typeof subtitle === 'string' ? (
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{subtitle}</p>
                    ) : (
                      subtitle
                    )
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600 focus:outline-none flex-shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5 md:w-6 md:h-6" />
              </button>
            </div>

            {/* Non-scrollable Body by default */}
            <div className="flex-1 p-6 md:p-8">
              {children}
            </div>

            {/* Fixed Footer */}
            {footer && (
              <div className="sticky bottom-0 bg-slate-50 border-t border-slate-100 px-6 py-5 md:px-8 z-10 flex-shrink-0">
                {footer}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// Subcomponent implementations
StandardModal.Header = ({ title, subtitle, icon, onClose }) => (
  <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-5 md:px-8 flex items-center justify-between z-10 w-full flex-shrink-0">
    <div className="flex items-center space-x-4">
      {icon && (
        <div className="w-12 h-12 bg-slate-950 text-white rounded-2xl flex items-center justify-center shadow-xl flex-shrink-0">
          {icon}
        </div>
      )}
      <div>
        {typeof title === 'string' ? (
          <h3 className="text-base md:text-lg font-black text-slate-800 tracking-tight leading-snug">{title}</h3>
        ) : (
          title
        )}
        {subtitle && (
          typeof subtitle === 'string' ? (
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{subtitle}</p>
          ) : (
            subtitle
          )
        )}
      </div>
    </div>
    <button
      onClick={onClose}
      className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600 focus:outline-none flex-shrink-0"
      aria-label="Close"
    >
      <X className="w-5 h-5 md:w-6 md:h-6" />
    </button>
  </div>
);

StandardModal.Body = ({ children, className = '' }) => (
  <div className={`flex-1 p-6 md:p-8 ${className}`}>
    {children}
  </div>
);

StandardModal.Footer = ({ children, className = '' }) => (
  <div className={`sticky bottom-0 bg-slate-50 border-t border-slate-100 px-6 py-5 md:px-8 z-10 flex-shrink-0 ${className}`}>
    {children}
  </div>
);

export default StandardModal;
