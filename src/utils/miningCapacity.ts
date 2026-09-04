import { MiningResource, ValueCreationLog } from '../../types';
import { calculateHedgeCapacitiesAndWeights } from './consumptionHedge';
import { importNetAmount } from './purification';

export { importNetAmount };

export function getInitialRevenueCapacity(r: MiningResource): number {
  return r ? (r.initialRevenueCapacity || r.revenueCapacity || 0) : 0;
}

export function getInitialValueCapacity(r: MiningResource): number {
  return r ? (r.initialValueCapacity || r.valueCapacity || 0) : 0;
}

export function getCurrentRevenueCapacity(r: MiningResource, logs?: ValueCreationLog[]): number {
  if (!r) return 0;
  if (!logs) return getInitialRevenueCapacity(r);
  return calculateHedgeCapacitiesAndWeights(r, logs).revCurrent;
}

export function getCurrentValueCapacity(r: MiningResource, logs?: ValueCreationLog[]): number {
  if (!r) return 0;
  if (!logs) return getInitialValueCapacity(r);
  return calculateHedgeCapacitiesAndWeights(r, logs).valCurrent;
}

export function getCWeightRevenue(r: MiningResource, logs?: ValueCreationLog[]): number {
  if (!r || !logs) return 1;
  return calculateHedgeCapacitiesAndWeights(r, logs).cWeightRev;
}

export function getCWeightValue(r: MiningResource, logs?: ValueCreationLog[]): number {
  if (!r || !logs) return 1;
  return calculateHedgeCapacitiesAndWeights(r, logs).cWeightVal;
}

export function getB2WeightValue(r: MiningResource, logs?: ValueCreationLog[]): number {
  if (!r || !logs) return 1;
  return calculateHedgeCapacitiesAndWeights(r, logs).b2Weight;
}

export function getHedgedRevenueCapacity(r: MiningResource, logs?: ValueCreationLog[]): number {
  return getCurrentRevenueCapacity(r, logs);
}

export function getHedgedValueCapacity(r: MiningResource, logs?: ValueCreationLog[]): number {
  return getCurrentValueCapacity(r, logs);
}

export function mergeMiningResources(existing: MiningResource[], incoming: MiningResource[]): MiningResource[] {
  if (!incoming || incoming.length === 0) return existing || [];
  if (!existing || existing.length === 0) return incoming || [];

  const incomingMap = new Map<string, MiningResource>();
  incoming.forEach(r => {
    if (r && r.id) {
      incomingMap.set(r.id, r);
    }
  });

  const updatedExisting = existing.map(r => (r && incomingMap.has(r.id)) ? incomingMap.get(r.id)! : r);
  const existingIds = new Set(existing.map(r => r?.id).filter(Boolean));
  const trulyNew = incoming.filter(r => r && r.id && !existingIds.has(r.id));

  return [...updatedExisting, ...trulyNew];
}

