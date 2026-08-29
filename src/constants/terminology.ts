/**
 * 术语 SSOT — 用户可见名称与 types.ts 字段对照
 * 改业务口径须同步：types.ts + 本文件 + 主指引
 */

import { ProjectStatus, RefineType } from '../types';

/** User.id — 系统内部主键，人事表「工号」列导入时勿与 userId 混填 */
export const TERM_USER_ID = '系统编号';

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  [ProjectStatus.InProgress]: '运营中',
  [ProjectStatus.Capping]: '静置中',
  [ProjectStatus.Archived]: '已封存',
};

export const REFINE_TYPE_LABELS: Record<string, string> = {
  [RefineType.Enterprise]: '企业项目',
  [RefineType.OccHealth]: '职业卫生',
  [RefineType.SafetyEval]: '安全评价',
  [RefineType.OccHealthElectric]: '职业卫生/电气检测',
  [RefineType.Bidding]: '招采项目',
  [RefineType.Outsourced]: '战略性外派',
  [RefineType.EmergencyG]: '应急演练（G)',
  [RefineType.TrainingG]: '培训（G）',
  [RefineType.NonEffectiveHours]: '非有效工时',
  '招标项目': '招采项目',
  '外派项目': '战略性外派',
  '非有效工时': '非有效工时',
};

/** User.userId — 登录账号 */
export const TERM_LOGIN_ID = '登录账号';

/** User.category — 人员职级（初产专/款专…），≠ 评价等级，≠ 流水 RefineCategory */
export const TERM_USER_RANK = '职级';

/** User.center — 所属经营单元（存库字段仍叫 center） */
export const TERM_BUSINESS_UNIT = '经营单元';

/** MiningResource.id — 全局矿山唯一标识 */
export const TERM_MINING_ID = '矿山编号';

/**
 * ValueCreationLog.rankId — 历史字段名，实际存 **采集主体 User.id**（不是职级！）
 * UI 禁止写「职级ID」「等级ID」「rankId」
 */
export const TERM_LOG_OPERATOR_ID = '采集主体';

/** ValueCreationLog.recordedCollectorId — 提炼记录人，仅存档 */
export const TERM_RECORDED_COLLECTOR = '记录人';

/** ValueCreationLog.category — RefineCategory：收款 | 产值 */
export const TERM_REFINE_CHANNEL = '提炼通道';

/** MiningResource.category — 100% | 据实（资源计费类别，≠ 人员职级） */
export const TERM_RESOURCE_BILLING = '计费类别';

/** 流水确权 AuditStatus — 用 statusDisplay.formatAuditStatusLabel */
/** 矿山项目态 ProjectStatus — 用 statusDisplay.formatProjectStatusLabel（运营中/静置中/已封存） */

/** 表分工（主指引 §一 1.0 / 附录 H） */
export const TERM_TABLE_JZCZ = '价值创造流水';
export const TERM_TABLE_DTCB = '动态消耗流水';

/** 日志网关（App.tsx） */
export const TERM_FILTERED_LOGS = 'filteredLogs'; // 仅 jzcz，供价值动态流/收款轨产值轨
export const TERM_AUDIT_LOGS = 'auditLogs';       // jzcz ∪ dtcb，供成本/确权待办

export const TERMINOLOGY = {
  USER_ID: TERM_USER_ID,
  LOGIN_ID: TERM_LOGIN_ID,
  USER_RANK: TERM_USER_RANK,
  BUSINESS_UNIT: TERM_BUSINESS_UNIT,
  MINING_RESOURCE_ID: TERM_MINING_ID,
  MINING_ID: TERM_MINING_ID,
  LOG_OPERATOR_ID: TERM_LOG_OPERATOR_ID,
  RECORDED_COLLECTOR: TERM_RECORDED_COLLECTOR,
  REFINE_CHANNEL: TERM_REFINE_CHANNEL,
  RESOURCE_BILLING: TERM_RESOURCE_BILLING,
  TABLE_JZCZ: TERM_TABLE_JZCZ,
  TABLE_DTCB: TERM_TABLE_DTCB,
  FILTERED_LOGS: TERM_FILTERED_LOGS,
  AUDIT_LOGS: TERM_AUDIT_LOGS,
};
