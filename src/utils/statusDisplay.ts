import { AuditStatus, ProjectStatus, RefineType, ValueCreationLog, User } from '../../types';
import { UI_LABELS } from '../constants/uiLabels';

export function formatAuditStatusLabel(status: AuditStatus): string {
  switch (status) {
    case AuditStatus.Pending:
      return UI_LABELS.PENDING;
    case AuditStatus.Confirmed:
      return UI_LABELS.CONFIRMED;
    case AuditStatus.Approved:
      return UI_LABELS.APPROVED;
    case AuditStatus.Rejected:
      return UI_LABELS.REJECTED;
    default:
      return status;
  }
}

export function formatProjectStatusLabel(status: ProjectStatus | string): string {
  switch (status) {
    case '进行中':
    case ProjectStatus.InProgress:
      return '运营中';
    case '待封存':
    case ProjectStatus.Capping:
      return '静置中';
    case '已结案':
    case ProjectStatus.Archived:
      return '已封存';
    default:
      return status;
  }
}

/**
 * 提炼类型中文映射 (附录 F-4 / D′-0)
 */
export function formatRefineTypeLabel(type: RefineType | string): string {
  const str = String(type);
  switch (str) {
    case RefineType.Enterprise:
    case 'Enterprise':
    case 'ENTERPRISE':
    case '企业项目':
      return '企业项目';
    case RefineType.OccHealth:
    case 'OccHealth':
    case 'OCCHEALTH':
    case '职业卫生':
      return '职业卫生';
    case RefineType.SafetyEval:
    case 'SafetyEval':
    case 'SAFETYEVAL':
    case '安全评价':
      return '安全评价';
    case RefineType.OccHealthElectric:
    case 'OccHealthElectric':
    case '职业卫生/电气检测':
      return '职业卫生/电气检测';
    case RefineType.Bidding:
    case 'Bidding':
    case 'BIDDING':
    case '招采项目':
    case '招标项目':
      return '招采项目';
    case RefineType.Outsourced:
    case 'Outsourced':
    case 'OUTSOURCED':
    case '战略性外派':
    case '外派项目':
      return '战略性外派';
    case RefineType.EmergencyG:
    case 'EmergencyG':
    case 'EMERGENCYG':
    case '应急演练（G)':
      return '应急演练（G)';
    case RefineType.TrainingG:
    case 'TrainingG':
    case 'TRAININGG':
    case '培训（G）':
      return '培训（G）';
    case RefineType.NonEffectiveHours:
    case 'NonEffectiveHours':
    case 'NONEFFECTIVEHOURS':
    case '非有效工时对冲':
    case '非有效工时':
      return '非有效工时';
    case 'Financial':
    case 'FINANCIAL':
    case '金融项目':
      return '金融项目';
    case 'Operational':
    case 'OPERATIONAL':
    case '运营项目':
      return '运营项目';
    case 'Innovation':
    case 'INNOVATION':
    case '创新研发':
      return '创新研发';
    default:
      return type;
  }
}

/**
 * 术语统一显示辅助函数 (附录 F-5)
 */
export function labelLogOperator(log: ValueCreationLog, users?: User[]): string {
  if (users && users.length > 0) {
    const u = users.find(user => user.id === log.rankId || user.userId === log.rankId);
    if (u) return u.name || u.userId || log.rankId;
  }
  return log.rankId || '未知主体';
}

export function labelBusinessUnit(center?: string | null): string {
  if (!center || center.trim() === '') return '平台公共';
  return center;
}
