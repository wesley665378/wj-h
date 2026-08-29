import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Check, X, AlertTriangle, ShieldCheck, Landmark, Coins, HelpCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatMoney } from '../utils/formatMoney';
import { useCostPrivacy } from '../hooks/useCostPrivacy';
import { CityGuardianModal, useCityGuardianModal } from './CityGuardianModal';

/**
 * Backend/API Raw Data Model representation
 */
export interface AuditApiData {
  id: string;               // 申报编号
  operatingUnit: string;    // 经营单元
  miningId: string;         // 矿山编号
  miningName?: string;      // 矿山/选区名称
  type: 'A' | 'B1' | 'B2' | 'C' | 'D'; // 确权类型
  basePoints: number;       // 申报积分 (系统核算动态基准)
  calculatedValue: number;  // 系统核算确权金额
  notes?: string;           // 备注
}

/**
 * UI Component Form State Structure
 */
export interface ConsumptionFormState {
  id: string;
  operatingUnit: string;
  miningId: string;
  miningName: string;
  type: 'A' | 'B1' | 'B2' | 'C' | 'D';
  basePoints: number;       // System raw points (readOnly)
  
  // Auto-filled proposed values based on rules (readOnly)
  aValue: number;
  b1Value: number;
  b2Value: number;
  cValue: number;
  dValue: number;
  
  // Verification check inputs
  verifiedAmount: number;   // Human double-check audit amount
  enableAdjustment: boolean; // Permit offset adjustment exception
  adjustmentValue: number;  // Real adjustment offset value
  notes: string;            // Audit verification log description
}

/**
 * DataMapper: Converts backend API/log model format to UI reactive form values
 */
export function mapApiToForm(apiData: AuditApiData): ConsumptionFormState {
  const result: ConsumptionFormState = {
    id: apiData.id || `TX-${Date.now().toString().slice(-6)}`,
    operatingUnit: apiData.operatingUnit || '核心经管单元',
    miningId: apiData.miningId || 'MINE-00D1',
    miningName: apiData.miningName || '翠屏山主力精选矿',
    type: apiData.type || 'A',
    basePoints: apiData.basePoints || 0,
    aValue: 0,
    b1Value: 0,
    b2Value: 0,
    cValue: 0,
    dValue: 0,
    verifiedAmount: apiData.calculatedValue || 0,
    enableAdjustment: false,
    adjustmentValue: 0,
    notes: apiData.notes || '',
  };

  // State-driven value filling: auto fill based on type
  if (apiData.type === 'A') {
    result.aValue = apiData.calculatedValue;
  } else if (apiData.type === 'B1') {
    result.b1Value = apiData.calculatedValue;
  } else if (apiData.type === 'B2') {
    result.b2Value = apiData.calculatedValue;
  } else if (apiData.type === 'C') {
    result.cValue = apiData.calculatedValue;
  } else if (apiData.type === 'D') {
    result.dValue = apiData.calculatedValue;
  }

  return result;
}

export interface ConsumptionAuditProps {
  isOpen: boolean;
  onClose: () => void;
  auditData: AuditApiData | null;
  onConfirm: (id: string, finalConfirmedValue: number, auditNotes: string) => Promise<void>;
}

export const ConsumptionAudit: React.FC<ConsumptionAuditProps> = ({
  isOpen,
  onClose,
  auditData,
  onConfirm,
}) => {
  const [formData, setFormData] = useState<ConsumptionFormState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { modalState, showAlert, closeModal } = useCityGuardianModal();

  // Sync state whenever auditData changes or is received
  useEffect(() => {
    if (auditData) {
      setFormData(mapApiToForm(auditData));
    } else {
      setFormData(null);
    }
  }, [auditData]);

  if (!isOpen || !formData || !auditData) return null;

  const targetValue = auditData.calculatedValue;
  
  // Real-time calculation: target sum vs manually verified amount + offset
  const auditSum = formData.verifiedAmount + (formData.enableAdjustment ? formData.adjustmentValue : 0);
  const deviation = auditSum - targetValue;
  const isAuditBalanced = Math.abs(deviation) < 0.01;
  const isNotesValid = formData.notes.trim().length >= 3;
  const canSubmit = isAuditBalanced && (formData.enableAdjustment ? isNotesValid : true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      await onConfirm(formData.id, auditSum, formData.notes || '人工对账确认一致');
      showAlert(`申报 #${formData.id} 消耗确权对冲核销成功`, onClose);
    } catch (error) {
      console.error(error);
      showAlert('系统结算异常，对账记录存回缓存，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <CityGuardianModal state={modalState} onClose={closeModal} />
      <CityGuardianModal 
        state={{
          isOpen: isOpen && !modalState.isOpen,
          type: 'custom',
          title: '城市守护者 - 消耗确权对账稽核 (系统版本 v2)',
          maxWidthClassName: 'max-w-2xl',
          content: (
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
            
            {/* 1. Metadata Grid Layout - Requirement: grid-cols-2 */}
            <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-4">
              <div className="flex items-center gap-1.5 px-1 border-b border-slate-100 pb-2">
                <ShieldCheck className="w-4 h-4 text-slate-600" />
                <span className="text-xs font-black text-slate-700 tracking-wider">申报元数据校验 (只读)</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    经营单元
                  </label>
                  <input
                    type="text"
                    readOnly
                    id="meta-opunit"
                    value={formData.operatingUnit}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200/60 rounded-xl text-slate-800 font-semibold text-xs font-mono tabular-nums outline-none"
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    申报编号
                  </label>
                  <input
                    type="text"
                    readOnly
                    id="meta-id"
                    value={`#${formData.id}`}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200/60 rounded-xl text-slate-800 font-mono tabular-nums text-xs outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    矿山编号
                  </label>
                  <input
                    type="text"
                    readOnly
                    id="meta-mining-id"
                    value={formData.miningId}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200/60 rounded-xl text-slate-800 font-mono tabular-nums text-xs outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    匹配确权范式
                  </label>
                  <div className="w-full px-3 py-1.5 bg-slate-900 border border-slate-900 rounded-xl text-white font-bold text-center text-xs flex items-center justify-center gap-1">
                    <Coins className="w-3.5 h-3.5" />
                    <span className="tracking-widest">{formData.type} 级确权核算流</span>
                  </div>
                </div>
              </div>

              {/* System Benchmark Base points - ReadOnly */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100/60">
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    系统拟扣减申报积分
                  </span>
                  <input
                    type="text"
                    readOnly
                    id="meta-base-points"
                    value={formatMoney(formData.basePoints)}
                    className="w-full px-3 py-2 bg-slate-100/80 border border-slate-200 text-slate-700 font-mono tabular-nums text-xs font-black outline-none"
                  />
                </div>
                
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    标称系统结算基准额
                  </span>
                  <input
                    type="text"
                    readOnly
                    id="meta-calc-val"
                    value={formatMoney(targetValue)}
                    className="w-full px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono tabular-nums text-xs font-black outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 2. Sub-Fields A/B1/B2/C Value Populated Rows */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-black text-slate-700 tracking-wider">自动值联动联动映射 (数据集成)</span>
                <span className="text-[10px] text-slate-400 font-semibold uppercase font-mono">已映射数值</span>
              </div>

              <div className="grid grid-cols-2 gap-4 p-2 bg-slate-50/20 border border-slate-100 rounded-2xl">
                
                {/* Field A */}
                <div id="field-block-a" className="space-y-1">
                  <div className="flex items-center justify-between px-0.5">
                    <label className="text-[11px] font-bold text-slate-500">A类积分扣减项</label>
                    {formData.type === 'A' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-700">匹配</span>
                    )}
                  </div>
                  <input
                    type="text"
                    readOnly
                    id="input-field-a"
                    value={formData.aValue > 0 ? formatMoney(formData.aValue) : '—'}
                    className={`w-full p-2.5 rounded-xl border font-mono tabular-nums text-xs tracking-tight transition-all focus:outline-none min-w-48 ${
                      formData.type === 'A'
                        ? 'bg-emerald-50 border-emerald-200 text-slate-800 font-black'
                        : 'bg-slate-50 border-slate-150 text-gray-300 cursor-not-allowed outline-none select-none'
                    }`}
                  />
                </div>

                {/* Field B1 */}
                <div id="field-block-b1" className="space-y-1">
                  <div className="flex items-center justify-between px-0.5">
                    <label className="text-[11px] font-bold text-slate-500">B1类积分扣减项</label>
                    {formData.type === 'B1' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-700">匹配</span>
                    )}
                  </div>
                  <input
                    type="text"
                    readOnly
                    id="input-field-b1"
                    value={formData.b1Value > 0 ? formatMoney(formData.b1Value) : '—'}
                    className={`w-full p-2.5 rounded-xl border font-mono tabular-nums text-xs tracking-tight transition-all focus:outline-none min-w-48 ${
                      formData.type === 'B1'
                        ? 'bg-emerald-50 border-emerald-200 text-slate-800 font-black'
                        : 'bg-slate-50 border-slate-150 text-gray-300 cursor-not-allowed outline-none select-none'
                    }`}
                  />
                </div>

                {/* Field B2 */}
                <div id="field-block-b2" className="space-y-1">
                  <div className="flex items-center justify-between px-0.5">
                    <label className="text-[11px] font-bold text-slate-500">B2类积分扣减项</label>
                    {formData.type === 'B2' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-700">匹配</span>
                    )}
                  </div>
                  <input
                    type="text"
                    readOnly
                    id="input-field-b2"
                    value={formData.b2Value > 0 ? formatMoney(formData.b2Value) : '—'}
                    className={`w-full p-2.5 rounded-xl border font-mono tabular-nums text-xs tracking-tight transition-all focus:outline-none min-w-48 ${
                      formData.type === 'B2'
                        ? 'bg-emerald-50 border-emerald-200 text-slate-800 font-black'
                        : 'bg-slate-50 border-slate-150 text-gray-300 cursor-not-allowed outline-none select-none'
                    }`}
                  />
                </div>

                {/* Field C */}
                <div id="field-block-c" className="space-y-1">
                  <div className="flex items-center justify-between px-0.5">
                    <label className="text-[11px] font-bold text-slate-500">C类积分扣减项</label>
                    {formData.type === 'C' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-700">匹配</span>
                    )}
                  </div>
                  <input
                    type="text"
                    readOnly
                    id="input-field-c"
                    value={formData.cValue > 0 ? formatMoney(formData.cValue) : '—'}
                    className={`w-full p-2.5 rounded-xl border font-mono tabular-nums text-xs tracking-tight transition-all focus:outline-none min-w-48 ${
                      formData.type === 'C'
                        ? 'bg-emerald-50 border-emerald-200 text-slate-800 font-black'
                        : 'bg-slate-50 border-slate-150 text-gray-300 cursor-not-allowed outline-none select-none'
                    }`}
                  />
                </div>

                {/* Field D */}
                <div id="field-block-d" className="space-y-1">
                  <div className="flex items-center justify-between px-0.5">
                    <label className="text-[11px] font-bold text-slate-500">D类积分扣减项</label>
                    {formData.type === 'D' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-700">匹配</span>
                    )}
                  </div>
                  <input
                    type="text"
                    readOnly
                    id="input-field-d"
                    value={formData.dValue > 0 ? formatMoney(formData.dValue) : '—'}
                    className={`w-full p-2.5 rounded-xl border font-mono tabular-nums text-xs tracking-tight transition-all focus:outline-none min-w-48 ${
                      formData.type === 'D'
                        ? 'bg-emerald-50 border-emerald-200 text-slate-800 font-black'
                        : 'bg-slate-50 border-slate-150 text-gray-300 cursor-not-allowed outline-none select-none'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* 3. Interactive Human Audit Input & Logic */}
            <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 block">
                  1. 人工稽核校验输入
                </span>
                <button
                  type="button"
                  id="btn-fast-align"
                  onClick={() => {
                    setFormData(prev => ({
                      ...prev!,
                      verifiedAmount: Math.round(targetValue),
                    }));
                    toast.info('大区对账：自动对齐结算基准额');
                  }}
                  className="px-2.5 py-1 text-[10px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-transform active:scale-95 cursor-pointer whitespace-nowrap"
                >
                  对齐系统值 [{Math.round(targetValue)}]
                </button>
              </div>

              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    type="number"
                    step="1"
                    id="input-verified"
                    value={formData.verifiedAmount || ''}
                    onChange={(e) => {
                      const val = Math.round(parseFloat(e.target.value) || 0);
                      setFormData(prev => prev ? { ...prev, verifiedAmount: val } : null);
                    }}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-mono tabular-nums text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-800 transition-all min-w-48"
                    placeholder="输入实际核定金额 (整数)"
                  />
                </div>
              </div>

              {/* Exception Compensation Toggle Mechanism */}
              <div className="pt-1 border-t border-slate-200/50 space-y-3">
                <div id="check-adjustment-wrap" className="flex items-center">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      id="check-adj"
                      checked={formData.enableAdjustment}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData(prev => prev ? { 
                          ...prev, 
                          enableAdjustment: checked,
                          adjustmentValue: checked ? prev.adjustmentValue : 0
                        } : null);
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 focus:outline-none"
                    />
                    <span className="text-xs font-bold text-slate-600">
                      申请损缺/溢出调整偏差 (异常偏移模式)
                    </span>
                  </label>
                </div>

                <AnimatePresence>
                  {formData.enableAdjustment && (
                    <motion.div
                      id="compensation-panel"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2 overflow-hidden"
                    >
                      <div className="relative">
                        <input
                          type="number"
                          step="1"
                          id="input-adjustment"
                          value={formData.adjustmentValue || ''}
                          onChange={(e) => {
                            const val = Math.round(parseFloat(e.target.value) || 0);
                            setFormData(prev => prev ? { ...prev, adjustmentValue: val } : null);
                          }}
                          className="w-full px-4 py-2.5 bg-amber-50/20 border border-amber-200/60 rounded-xl font-mono tabular-nums text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 transition-all min-w-48"
                          placeholder="核销增减算金额 (整数，例如：-50)"
                        />
                      </div>
                      <p className="text-[10px] text-amber-600 font-medium leading-relaxed bg-amber-50/40 p-2 rounded-lg border border-amber-100 flex items-start gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 flex-none mt-0.5" />
                        <span>手动调整额将冲减或溢补结余。启用此例外机制必须在下方输入详细说明（不少于3位字元）以备后台审查。</span>
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Live Arithmetic Balances */}
              <div className="flex items-center justify-between bg-slate-100 p-3 rounded-xl border border-slate-200/40 text-xs font-mono">
                <div className="space-y-0.5">
                  <span className="text-slate-500 block">实时测算大区总额</span>
                  <span className="font-bold text-slate-900 tabular-nums">
                    {formatMoney(formData.verifiedAmount)} + [纠偏 {formatMoney(formData.adjustmentValue)}] = {formatMoney(auditSum)}
                  </span>
                </div>
                <div className="text-right space-y-0.5">
                  <span className="text-slate-500 block">相较物理基准偏差</span>
                  <span className={`font-bold tabular-nums ${isAuditBalanced ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {isAuditBalanced 
                      ? '✓ 契合平账 (0)' 
                      : `${deviation > 0 ? '+' : ''}${formatMoney(deviation)}`
                    }
                  </span>
                </div>
              </div>
            </div>

            {/* Audit Notes field */}
            <div className="space-y-1.5 p-2">
              <label className="text-xs font-bold text-slate-600 block">
                2. 确权及差异说明备注
              </label>
              <textarea
                id="input-notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => prev ? { ...prev, notes: e.target.value } : null)}
                rows={2}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-800 transition-all min-w-48"
                placeholder={formData.enableAdjustment ? "请输入不少于3字元的异常调整核心缘由..." : "系统审核通过，偏差核销在容差范围内，对账相符。"}
                required={formData.enableAdjustment}
              />
            </div>

            {/* Submit Block */}
            <div className="pt-2">
              <button
                type="submit"
                id="submit-audit-btn"
                disabled={!canSubmit || isSubmitting}
                className={`w-full py-3.5 text-white font-black rounded-2xl text-xs uppercase tracking-[0.2em] shadow-md transition-all duration-300 transform active:scale-95 disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer ${
                  canSubmit 
                    ? 'bg-slate-900 hover:bg-slate-800 text-white hover:shadow-lg' 
                    : 'bg-slate-300 text-slate-100 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-1.5 font-sans font-bold">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> 执行系统对数和过账...
                  </span>
                ) : (
                  '确权审计平衡并提交'
                )}
              </button>
              
              {!isAuditBalanced && (
                <p className="text-[10px] text-center text-rose-500 font-bold mt-2">
                  提示：当前核算值 ({formatMoney(auditSum)}) 与系统原始基准 ({formatMoney(targetValue)}) 不吻合，请调节对齐。
                </p>
              )}
              {formData.enableAdjustment && !isNotesValid && (
                <p className="text-[10px] text-center text-amber-500 font-bold mt-2">
                  提示：例外申请调整被启动，须填写至少3位字元的对账偏差理由。
                </p>
              )}
            </div>

          </form>
        )
      }} 
      onClose={onClose} 
    />
    </>
  );
};
