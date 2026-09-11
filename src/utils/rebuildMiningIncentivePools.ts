import { ValueCreationLog, MiningResource, User } from '../types';
import { computeValueOutput5Incentive, computeCollection2Incentive } from './business';

/**
 * @businessRule 重建矿山专项激励池 (rebuildMiningIncentivePools)
 * @description 与服务端 mineralReconcile / computeLogIncentives 逻辑完全同构
 * - 经营单元本级 = Σ(incentiveOutput5 + incentiveCollection2)，按矿山 assignedTo 归属经营单元
 * - 产值计提 (incentiveOutput5)：仅初产专、中产专；已确权产值 amount × 5%；高产专/经管员不触发；不乘 C/B2
 * - 收款计提 (incentiveCollection2)：仅初款专、中款专；已确权收款 amount × 2%；高款专、经管员高款专、含「经管员」不触发；不乘 C/B2
 */
export function rebuildMiningIncentivePools(
  resources: MiningResource[],
  logs: ValueCreationLog[],
  users: User[]
): MiningResource[] {
  const userMap = new Map<string, User>();
  (users || []).forEach(u => userMap.set(u.id, u));

  return (resources || []).map(resource => {
    const resLogs = (logs || []).filter(l => l.miningId === resource.id);
    
    let incentiveOutput5 = 0;
    let incentiveCollection2 = 0;

    resLogs.forEach(log => {
      const collectorUser = log.recordedCollectorId ? userMap.get(log.recordedCollectorId) : undefined;
      incentiveOutput5 += computeValueOutput5Incentive(log, collectorUser);
      incentiveCollection2 += computeCollection2Incentive(log, collectorUser);
    });

    return {
      ...resource,
      incentiveOutput5,
      incentiveCollection2
    };
  });
}
