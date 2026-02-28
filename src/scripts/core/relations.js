import { SOCKET_TYPES } from '../constants.js';
import * as Data from '../data.js';
import { ReputationEvents } from '../events.js';
import { getPCs } from './actors.js';

export function getIndRel(fromId, toId) {
  return Data.getData().individualRelations?.[fromId]?.[toId] ?? 0;
}

export async function setIndRel(fromId, toId, value) {
  const oldValue = getIndRel(fromId, toId);
  const clampedValue = Data.clamp(value);
  
  if (!game.user.isGM) {
    await Data.requestOperation(SOCKET_TYPES.SET_IND_REL, { fromId, toId, value: clampedValue });
    const data = Data.getData();
    data.individualRelations ??= {};
    data.individualRelations[fromId] ??= {};
    data.individualRelations[fromId][toId] = clampedValue;
    return;
  }
  
  const data = Data.getData();
  data.individualRelations ??= {};
  data.individualRelations[fromId] ??= {};
  data.individualRelations[fromId][toId] = clampedValue;
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { npcId: fromId, pcId: toId, oldValue, newValue: clampedValue });
}

export async function adjustIndRels(actorId, delta) {
  const pcs = getPCs().filter(pc => pc.id !== actorId);
  if (!pcs.length) return;
  
  const data = Data.getData();
  data.individualRelations ??= {};
  data.individualRelations[actorId] ??= {};
  
  for (const pc of pcs) {
    const current = data.individualRelations[actorId][pc.id] ?? 0;
    data.individualRelations[actorId][pc.id] = Data.clamp(current + delta);
  }
  
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { actorId, delta, bulk: true });
}

export function getFactionRel(factionId, pcId) {
  return Data.getData().factionRelations?.[factionId]?.[pcId] ?? 0;
}

export async function setFactionRel(factionId, pcId, value) {
  const oldValue = getFactionRel(factionId, pcId);
  const clampedValue = Data.clamp(value);
  
  if (!game.user.isGM) {
    await Data.requestOperation(SOCKET_TYPES.SET_FACTION_REL, { factionId, pcId, value: clampedValue });
    const data = Data.getData();
    data.factionRelations ??= {};
    data.factionRelations[factionId] ??= {};
    data.factionRelations[factionId][pcId] = clampedValue;
    return;
  }
  
  const data = Data.getData();
  data.factionRelations ??= {};
  data.factionRelations[factionId] ??= {};
  data.factionRelations[factionId][pcId] = clampedValue;
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { factionId, pcId, oldValue, newValue: clampedValue, type: 'faction' });
}

export function getActorFactionRel(actorId, factionId) {
  return Data.getData().actorFactionRelations?.[actorId]?.[factionId] ?? 0;
}

export async function setActorFactionRel(actorId, factionId, value) {
  const oldValue = getActorFactionRel(actorId, factionId);
  const clampedValue = Data.clamp(value);
  
  if (!game.user.isGM) {
    await Data.requestOperation(SOCKET_TYPES.SET_ACTOR_FACTION_REL, { actorId, factionId, value: clampedValue });
    const data = Data.getData();
    data.actorFactionRelations ??= {};
    data.actorFactionRelations[actorId] ??= {};
    data.actorFactionRelations[actorId][factionId] = clampedValue;
    return;
  }
  
  const data = Data.getData();
  data.actorFactionRelations ??= {};
  data.actorFactionRelations[actorId] ??= {};
  data.actorFactionRelations[actorId][factionId] = clampedValue;
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { actorId, factionId, oldValue, newValue: clampedValue, type: 'actor-faction' });
}

export function getFactionToFactionRel(factionId1, factionId2) {
  return Data.getData().factionToFactionRelations?.[factionId1]?.[factionId2] ?? 0;
}

export async function setFactionToFactionRel(factionId1, factionId2, value) {
  const oldValue = getFactionToFactionRel(factionId1, factionId2);
  const clampedValue = Data.clamp(value);

  if (!game.user.isGM) {
    await Data.requestOperation(SOCKET_TYPES.SET_FACTION_TO_FACTION_REL, { factionId1, factionId2, value: clampedValue });
    const data = Data.getData();
    data.factionToFactionRelations ??= {};
    data.factionToFactionRelations[factionId1] ??= {};
    data.factionToFactionRelations[factionId1][factionId2] = clampedValue;
    return;
  }

  const data = Data.getData();
  data.factionToFactionRelations ??= {};
  data.factionToFactionRelations[factionId1] ??= {};
  data.factionToFactionRelations[factionId1][factionId2] = clampedValue;
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { factionId1, factionId2, oldValue, newValue: clampedValue, type: 'faction-to-faction' });
}

export async function removeIndRel(fromId, toId) {
  const data = Data.getData();
  if (data.individualRelations?.[fromId]) {
    delete data.individualRelations[fromId][toId];
    if (Object.keys(data.individualRelations[fromId]).length === 0) {
      delete data.individualRelations[fromId];
    }
  }
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { npcId: fromId, pcId: toId, removed: true });
}

export async function removeFactionRel(factionId, pcId) {
  const data = Data.getData();
  if (data.factionRelations?.[factionId]) {
    delete data.factionRelations[factionId][pcId];
    if (Object.keys(data.factionRelations[factionId]).length === 0) {
      delete data.factionRelations[factionId];
    }
  }
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { factionId, pcId, removed: true, type: 'faction' });
}

export async function removeActorFactionRel(actorId, factionId) {
  const data = Data.getData();
  if (data.actorFactionRelations?.[actorId]) {
    delete data.actorFactionRelations[actorId][factionId];
    if (Object.keys(data.actorFactionRelations[actorId]).length === 0) {
      delete data.actorFactionRelations[actorId];
    }
  }
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { actorId, factionId, removed: true, type: 'actor-faction' });
}

export async function removeFactionToFactionRel(factionId1, factionId2) {
  const data = Data.getData();
  if (data.factionToFactionRelations?.[factionId1]) {
    delete data.factionToFactionRelations[factionId1][factionId2];
    if (Object.keys(data.factionToFactionRelations[factionId1]).length === 0) {
      delete data.factionToFactionRelations[factionId1];
    }
  }
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { factionId1, factionId2, removed: true, type: 'faction-to-faction' });
}