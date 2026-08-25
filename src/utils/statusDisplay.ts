import { AuditStatus, ProjectStatus } from '../../types';
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
