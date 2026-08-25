/**
 * 术语 SSOT — 用户可见名称与 types.ts 字段对照
 * 改业务口径须同步：types.ts + 本文件 + 主指引
 */

/** User.id — 系统内部主键，人事表「工号」列导入时勿与 userId 混填 */
export const TERM_USER_ID = '系统编号';

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
