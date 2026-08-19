import { MiningResource, ProjectStatus, ResourceStatus } from '../../types';

/**
 * 衍生项目状态 (Project Status)
 * 规则：
 * 1. lifecycleStatus 为 archived（忽略大小写） -> 已结案
 * 2. 触顶且未满 90 天 -> 待封存
 *    - 触顶条件：已确权收产值约等于 capacity (>= 99%)，且 pending 约等于 0
 *    - 兼容条件：ResourceStatus 为 '入库' 且 lifecycleStatus 不为 'archived'
 *    - 静置起点：优先取 reachedDate (string) 或 cappedAt (timestamp)
 * 3. 其他 -> 进行中
 */
export function deriveProjectStatus(resource?: MiningResource | null): { status: ProjectStatus; remainingDays?: number } {
  if (!resource) {
    return { status: ProjectStatus.Archived };
  }

  const lifecycle = (resource.lifecycleStatus || '').toLowerCase();
  
  // 1. 已结案
  if (lifecycle === 'archived') {
    return { status: ProjectStatus.Archived };
  }

  // 计算触顶状态
  const isRevenueCapped = (resource.confirmedRevenue || 0) >= (resource.revenueCapacity || 0) * 0.99 && (resource.pendingRevenue || 0) < 1;
  const isValueCapped = (resource.confirmedValue || 0) >= (resource.valueCapacity || 0) * 0.99 && (resource.pendingValue || 0) < 1;
  const isStockIn = resource.status === ResourceStatus.StockIn;
  
  const isCapped = (isRevenueCapped && isValueCapped) || isStockIn;

  if (isCapped) {
    // 获取触顶时间
    let cappedTime: number | null = null;
    if (resource.cappedAt) {
      cappedTime = resource.cappedAt;
    } else if (resource.reachedDate) {
      cappedTime = new Date(resource.reachedDate).getTime();
    }

    if (cappedTime) {
      const now = Date.now();
      const diffMs = now - cappedTime;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays < 90) {
        return { 
          status: ProjectStatus.Capping, 
          remainingDays: 90 - diffDays 
        };
      } else {
        return { 
          status: ProjectStatus.Capping, 
          remainingDays: 0 
        };
      }
    }
    
    // 如果没有记录时间但触发了 isCapped (比如状态是入库)，也视为待封存
    return { status: ProjectStatus.Capping, remainingDays: 90 };
  }

  return { status: ProjectStatus.InProgress };
}

/**
 * 判断项目是否可提报（写操作）
 * 规则：仅进行中可提报，待封存默认也禁止新申报；如果项目不存在则返回 false
 */
export function isProjectWritable(resource?: MiningResource | null): boolean {
  if (!resource) return false;
  const { status } = deriveProjectStatus(resource);
  return status === ProjectStatus.InProgress;
}
