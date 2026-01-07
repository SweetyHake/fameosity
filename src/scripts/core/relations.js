import { getData, setData, clamp, requestOperation } from '../data.js';
import { SOCKET_TYPES } from '../constants.js';
import { ReputationEvents } from '../events.js';
import { getPCs } from './actors.js';

export function getIndRel(fromId, toId) {
  return getData().individualRelations?.[fromId]?.[toId] ?? 0;
}

export async function setIndRel(fromId, toId, value) {
  const oldValue = getIndRel(fromId, toId);
  const clampedValue = clamp(value);
  
  if (!game.user.isGM) {
    await requestOperation(SOCKET_TYPES.SET_IND_REL, { fromId, toId, value: clampedValue });
    const data = getData();
    data.individualRelations ??= {};
    data.individualRelations[fromId] ??= {};
    data.individualRelations[fromId][toId] = clampedValue;
    return;
  }
  
  const data = getData();
  data.individualRelations ??= {};
  data.individualRelations[fromId] ??= {};
  data.individualRelations[fromId][toId] = clampedValue;
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { npcId: fromId, pcId: toId, oldValue, newValue: clampedValue });
}

export async function adjustIndRels(actorId, delta) {
  const pcs = getPCs().filter(pc => pc.id !== actorId);
  if (!pcs.length) return;
  
  const data = getData();
  data.individualRelations ??= {};
  data.individualRelations[actorId] ??= {};
  
  for (const pc of pcs) {
    const current = data.individualRelations[actorId][pc.id] ?? 0;
    data.individualRelations[actorId][pc.id] = clamp(current + delta);
  }
  
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { actorId, delta, bulk: true });
}

export function getFactionRel(factionId, pcId) {
  return getData().factionRelations?.[factionId]?.[pcId] ?? 0;
}

export async function setFactionRel(factionId, pcId, value) {
  const oldValue = getFactionRel(factionId, pcId);
  const clampedValue = clamp(value);
  
  if (!game.user.isGM) {
    await requestOperation(SOCKET_TYPES.SET_FACTION_REL, { factionId, pcId, value: clampedValue });
    const data = getData();
    data.factionRelations ??= {};
    data.factionRelations[factionId] ??= {};
    data.factionRelations[factionId][pcId] = clampedValue;
    return;
  }
  
  const data = getData();
  data.factionRelations ??= {};
  data.factionRelations[factionId] ??= {};
  data.factionRelations[factionId][pcId] = clampedValue;
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { factionId, pcId, oldValue, newValue: clampedValue, type: 'faction' });
}

export function getActorFactionRel(actorId, factionId) {
  return getData().actorFactionRelations?.[actorId]?.[factionId] ?? 0;
}

export async function setActorFactionRel(actorId, factionId, value) {
  const oldValue = getActorFactionRel(actorId, factionId);
  const clampedValue = clamp(value);
  
  if (!game.user.isGM) {
    await requestOperation(SOCKET_TYPES.SET_ACTOR_FACTION_REL, { actorId, factionId, value: clampedValue });
    const data = getData();
    data.actorFactionRelations ??= {};
    data.actorFactionRelations[actorId] ??= {};
    data.actorFactionRelations[actorId][factionId] = clampedValue;
    return;
  }
  
  const data = getData();
  data.actorFactionRelations ??= {};
  data.actorFactionRelations[actorId] ??= {};
  data.actorFactionRelations[actorId][factionId] = clampedValue;
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { actorId, factionId, oldValue, newValue: clampedValue, type: 'actor-faction' });
}

export function getPersonalVis(npcId, pcId) {
  return getData().personalVisibility?.[npcId]?.[pcId] ?? true;
}

export async function setPersonalVis(npcId, pcId, visible) {
  const data = getData();
  data.personalVisibility ??= {};
  data.personalVisibility[npcId] ??= {};
  data.personalVisibility[npcId][pcId] = visible;
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { npcId, pcId, visibility: visible });
}

export async function togglePersonalVis(npcId, pcId) {
  const current = getPersonalVis(npcId, pcId);
  await setPersonalVis(npcId, pcId, !current);
}