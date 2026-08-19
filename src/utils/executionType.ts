import { MiningResource } from '../../types';

export type ExecutionTypeName = '自签自做' | '自签它做' | '它签自做' | '多元协同' | '未指派';

export function getExecutionType(resource: MiningResource | null | undefined, currentUnit: string): ExecutionTypeName {
  if (!resource || !currentUnit || !currentUnit.trim()) {
    return '未指派';
  }

  const cleanCurrentUnit = currentUnit.trim();

  // 款侧：收款指派；为空则用总指派 (assignedToRevenue || assignedTo)
  const revAssign = resource.assignedToRevenue || resource.assignedTo || '';
  // 产侧：产值指派；为空则用总指派 (assignedToValue || assignedTo)
  const valAssign = resource.assignedToValue || resource.assignedTo || '';

  const revUnits = revAssign.split(',').map(s => s.trim()).filter(Boolean);
  const valUnits = valAssign.split(',').map(s => s.trim()).filter(Boolean);

  const hasRev = revUnits.includes(cleanCurrentUnit);
  const hasVal = valUnits.includes(cleanCurrentUnit);

  // 1. 款侧或产侧为空，或本单元两侧都不在 → 未指派
  if (!revAssign.trim() || !valAssign.trim() || (!hasRev && !hasVal)) {
    return '未指派';
  }

  // 2. 本单元在款侧且在产侧，且两侧集合完全相同 → 自签自做
  const revSet = new Set(revUnits);
  const valSet = new Set(valUnits);
  const setsAreEqual = revSet.size === valSet.size && [...revSet].every(u => valSet.has(u));

  if (hasRev && hasVal && setsAreEqual) {
    return '自签自做';
  }

  // 3. 本单元只在款侧 → 自签它做 (自签它做、它签自做优先于多元协同)
  if (hasRev && !hasVal) {
    return '自签它做';
  }

  // 4. 本单元只在产侧 → 它签自做
  if (!hasRev && hasVal) {
    return '它签自做';
  }

  // 5. 其余（含本单元两侧都在但两侧集合不同）→ 多元协同
  return '多元协同';
}

export function getExecutionTypeBadgeColor(type: ExecutionTypeName): { bg: string; text: string; border: string } {
  switch (type) {
    case '自签自做':
      return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
    case '自签它做':
      return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    case '它签自做':
      return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
    case '多元协同':
      return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
    case '未指派':
    default:
      return { bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200' };
  }
}

export const EXECUTION_TYPE_EXPLANATIONS: Record<ExecutionTypeName, string> = {
  '自签自做': '本单元签收款，本单元做产值',
  '自签它做': '本单元签收款，其他单元做产值',
  '它签自做': '其他单元签收款，本单元做产值',
  '多元协同': '款、产分属不同单元，或本单元两侧都在但两侧集合不完全相同',
  '未指派': '未指派或本单元不在款产指派中'
};
