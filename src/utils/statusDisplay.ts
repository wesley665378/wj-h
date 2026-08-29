import { AuditStatus, ProjectStatus, RefineType, ValueCreationLog, User } from '../../types';
import { UI_LABELS } from '../constants/uiLabels';
import { PROJECT_STATUS_LABELS, REFINE_TYPE_LABELS } from '../constants/terminology';

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
  return PROJECT_STATUS_LABELS[status] || status;
}

/**
 * 提炼类型中文映射 (附录 F-4 / D′-0)
 */
export function formatRefineTypeLabel(type: RefineType | string): string {
  const str = String(type);
  return REFINE_TYPE_LABELS[str] || type;
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
