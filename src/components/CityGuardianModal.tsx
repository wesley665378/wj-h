import React from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { UI_LABELS } from '../constants/uiLabels';

export interface CityGuardianModalState {
  isOpen: boolean;
  type: 'alert' | 'confirm' | 'custom';
  title?: string;
  content?: React.ReactNode;
  custom?: React.ReactNode;
  maxWidthClassName?: string;
  message?: string;
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

  const customContent = state.content !== undefined ? state.content : state.custom;
  const isCustom = state.type === 'custom' || customContent !== undefined;

  return (
    <div 
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleCancel}
    >
      <div 
        className={`w-full ${state.maxWidthClassName || 'max-w-md'} bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden transform transition-all scale-100 flex flex-col max-h-[90vh]`}
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
        <div className="overflow-y-auto max-h-[calc(90vh-130px)] p-6 space-y-4">
          {state.message && (
            <p className="text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">
              {state.message}
            </p>
          )}
          {customContent}
        </div>

        {/* Footer */}
        {(!isCustom || state.onConfirm) && (
          <div className="flex items-center justify-end gap-3 px-5 py-3.5 bg-slate-50 border-t border-slate-100">
            {(state.type === 'confirm' || state.onCancel) && (
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
              {state.confirmText || UI_LABELS.BTN_CONFIRM}
            </button>
          </div>
        )}
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

  const showConfirm = React.useCallback((message: string, onConfirm: () => void, onCancel?: () => void, confirmText?: string, cancelText?: string) => {
    setModalState({
      isOpen: true,
      type: 'confirm',
      message,
      onConfirm,
      onCancel,
      confirmText,
      cancelText,
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
