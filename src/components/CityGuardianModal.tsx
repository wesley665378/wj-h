import React from 'react';
import { ShieldAlert, X } from 'lucide-react';

export interface CityGuardianModalState {
  isOpen: boolean;
  type: 'alert' | 'confirm';
  message: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
}

interface CityGuardianModalProps {
  state: CityGuardianModalState;
  onClose: () => void;
}

export const CityGuardianModal: React.FC<CityGuardianModalProps> = ({ state, onClose }) => {
  if (!state.isOpen) return null;

  const handleConfirm = () => {
    if (state.onConfirm) {
      state.onConfirm();
    }
    onClose();
  };

  const handleCancel = () => {
    if (state.onCancel) {
      state.onCancel();
    }
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleCancel}
    >
      <div 
        className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden transform transition-all scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
            <h3 className="font-bold text-base tracking-wide">城市守护者</h3>
          </div>
          <button 
            onClick={handleCancel}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-md"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">
            {state.message}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3.5 bg-slate-50 border-t border-slate-100">
          {state.type === 'confirm' && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
            >
              {state.cancelText || '取消'}
            </button>
          )}
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
          >
            {state.confirmText || '确定'}
          </button>
        </div>
      </div>
    </div>
  );
};

export function useCityGuardianModal() {
  const [modalState, setModalState] = React.useState<CityGuardianModalState>({
    isOpen: false,
    type: 'alert',
    message: '',
  });

  const showAlert = React.useCallback((message: string, onConfirm?: () => void) => {
    setModalState({
      isOpen: true,
      type: 'alert',
      message,
      onConfirm,
    });
  }, []);

  const showConfirm = React.useCallback((message: string, onConfirm: () => void, onCancel?: () => void) => {
    setModalState({
      isOpen: true,
      type: 'confirm',
      message,
      onConfirm,
      onCancel,
    });
  }, []);

  const closeModal = React.useCallback(() => {
    setModalState(prev => ({ ...prev, isOpen: false }));
  }, []);

  return {
    modalState,
    showAlert,
    showConfirm,
    closeModal,
  };
}
