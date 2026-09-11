import React from 'react';
import { ShieldAlert } from 'lucide-react';
import StandardModal from './StandardModal';
import { UI_LABELS, GUARDIAN_MODAL_TITLE } from '../constants/uiLabels';

export interface CityGuardianModalState {
  isOpen: boolean;
  type?: 'alert' | 'confirm' | 'custom';
  title?: string;
  subtitle?: string;
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

  let rawSubtitle = state.subtitle || (state.title && state.title !== GUARDIAN_MODAL_TITLE ? state.title : undefined);
  if (rawSubtitle && typeof rawSubtitle === 'string') {
    if (rawSubtitle.startsWith(`${GUARDIAN_MODAL_TITLE} - `)) {
      rawSubtitle = rawSubtitle.slice(`${GUARDIAN_MODAL_TITLE} - `.length);
    } else if (rawSubtitle.startsWith(`${GUARDIAN_MODAL_TITLE} · `)) {
      rawSubtitle = rawSubtitle.slice(`${GUARDIAN_MODAL_TITLE} · `.length);
    }
  }
  const subtitle = rawSubtitle;

  const footerControls = (!isCustom || state.onConfirm) ? (
    <div className="flex items-center justify-end gap-3 w-full">
      {(state.type === 'confirm' || state.onCancel) && (
        <button
          onClick={handleCancel}
          type="button"
          className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors"
        >
          {state.cancelText || '取消'}
        </button>
      )}
      <button
        onClick={handleConfirm}
        type="button"
        className="px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition-colors shadow-sm"
      >
        {state.confirmText || UI_LABELS.BTN_CONFIRM}
      </button>
    </div>
  ) : undefined;

  return (
    <StandardModal
      isOpen={state.isOpen}
      onClose={handleCancel}
      title={GUARDIAN_MODAL_TITLE}
      subtitle={subtitle}
      icon={<ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />}
      maxWidthClassName={state.maxWidthClassName || 'max-w-md'}
      zIndexClassName="z-[110]"
      footer={footerControls}
    >
      <div className="space-y-4">
        {state.message && (
          <p className="text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">
            {state.message}
          </p>
        )}
        {customContent}
      </div>
    </StandardModal>
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
