
import { RefineType, ProjectType } from './types';

export const USER_LIST = [];

// 系数定义：收款(Marketing)系数 与 产值(Technical)系数
// 依据用户指令：收款 A=0.27, B=0.2, C=0.3 | 产值 A=0.48, B=0.55
// 安全评价：营销 30% (Revenue 0.3), 技术 50%-10%管理=40% (Wood 0.4)
export const REFINE_FACTORS: Record<RefineType, { revenue: number; value: number }> = {
  [RefineType.Enterprise]: { revenue: 0.27, value: 0.48 },
  [RefineType.OccHealth]: { revenue: 0.30, value: 0.52 }, // 60%-8%=52%
  [RefineType.SafetyEval]: { revenue: 0.30, value: 0.40 }, // 50%-10%=40%
  [RefineType.OccHealthElectric]: { revenue: 0.30, value: 0.52 }, // 53%-5%=48% -> Adjusted to match D mapping if needed, but keeping factors for now
  [RefineType.Bidding]: { revenue: 0.20, value: 0.55 },
  [RefineType.Outsourced]: { revenue: 0.27, value: 0.55 },
  [RefineType.EmergencyG]: { revenue: 0.30, value: 0.55 },
  [RefineType.TrainingG]: { revenue: 0.30, value: 0.55 },
  [RefineType.NonEffectiveHours]: { revenue: 0.27, value: 0.48 }
};

export const PROJECT_RATIOS: Record<ProjectType, { marketing: number; tech: number }> = {
  [ProjectType.OccupationalHealth]: { marketing: 0.30, tech: 0.60 },
  [ProjectType.SafetyEval]: { marketing: 0.30, tech: 0.50 },
  [ProjectType.ElectricTest]: { marketing: 0.30, tech: 0.53 },
  [ProjectType.FireTest]: { marketing: 0.30, tech: 0.53 },
  [ProjectType.Enterprise]: { marketing: 0.27, tech: 0.53 },
  [ProjectType.Bidding]: { marketing: 0.20, tech: 0.60 },
  [ProjectType.Outsourced]: { marketing: 0.27, tech: 0.60 }
};

export const RESERVOIR_CONFIG = {
  riskMarginRatio: 0.10,
  opsSupportRatio: 0.10, // 默认10%
  baseMultiplier: 0.933, // 基础乘数（税率）
  occHealthMultiplier: 0.90
};

export const RANK_DICTIONARY = [
  '初产专',
  '中产专',
  '高产专',
  '初款专',
  '中款专',
  '高款专',
  '经管员高款专',
  '经管员高产专',
  'NPC',
  '系统管理员',
  'VP',
  '经管员NPC'
];

export const MENU_ITEMS = [
  { id: 'kanban', label: '经营看板', icon: '📊' },
  { id: 'resources', label: '矿山资源', icon: '🗺️' },
  { id: 'creation', label: '价值创造', icon: '💎' },
  { id: 'consumption', label: '动态消耗', icon: '📉' },
  { id: 'audit', label: '价值确权', icon: '🛡️' },
  { id: 'transactions', label: '内部交易', icon: '🤝' },
  { id: 'evaluation', label: '价值评价', icon: '⚖️' },
  { id: 'distribution', label: '价值分配', icon: '💸' },
  { id: 'reservoir', label: '水库管理', icon: '🌊' },
  { id: 'personnel', label: '人事矩阵', icon: '👥' },
  { id: 'account', label: '我的帐户', icon: '👤' },
  { id: 'instructions', label: '系统说明', icon: '📖' }
];
