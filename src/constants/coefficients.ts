import { RefineType } from '../types';

export const REFINE_FACTORS: Record<RefineType, { revenue: number; value: number }> = {
  [RefineType.Enterprise]: { revenue: 0.27, value: 0.48 },
  [RefineType.OccHealth]: { revenue: 0.30, value: 0.52 },
  [RefineType.SafetyEval]: { revenue: 0.30, value: 0.40 },
  [RefineType.OccHealthElectric]: { revenue: 0.30, value: 0.52 },
  [RefineType.Bidding]: { revenue: 0.20, value: 0.55 },
  [RefineType.Outsourced]: { revenue: 0.27, value: 0.55 },
  [RefineType.EmergencyG]: { revenue: 0.30, value: 0.55 },
  [RefineType.TrainingG]: { revenue: 0.30, value: 0.55 },
  [RefineType.NonEffectiveHours]: { revenue: 0.27, value: 0.48 }
};

export const TIER_COEFFICIENTS = {
  // Value Revenue Expert (收款专家) mapping
  REVENUE_HIGH: {
    Enterprise: 0.27,
    Bidding: 0.2,
    SafetyEval: 0.3,
  },
  REVENUE_MID_INITIAL: {
    Enterprise: 0.25,
    Bidding: 0.18,
    SafetyEval: 0.28,
  },
  // Value Creation Expert (产值专家) mapping
  VALUE_CHAN: {
    Enterprise: 0.48, // T1
    Bidding: 0.55,    // T2
    SafetyEval: 0.40, // T3
    OccHealth: 0.52,  // T4
  },
  VALUE_MANAGER: {
    Enterprise: 0.53, // T1
    Bidding: 0.60,    // T2
    SafetyEval: 0.50, // T3
    OccHealth: 0.52,  // T4
  },
  // Special factors
  BASE_LOSS: 0.933,
  BONUS_RATIO_SENIOR_MID: 0.06,
  BONUS_RATIO_INITIAL: 0.05
};
