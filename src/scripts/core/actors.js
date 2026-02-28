import { MODULE_ID } from '../constants.js';
import * as Data from '../data.js';
import { ReputationEvents } from '../events.js';

export function getTracked() {
  return Data.getData().trackedActors || [];
}

export async function setTracked(actors) {
  const data = Data.getData();
  data.trackedActors = actors;
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.MEMBER_CHANGED, { trackedActors: actors });
}

export async function addTracked(actorId) {
  const tracked = getTracked();
  if (!tracked.includes(actorId)) {
    tracked.push(actorId);
    await setTracked(tracked);
    const settings = Data.getSettings();
    const { setMode } = await import('./reputation.js');
    await setMode(actorId, 'actor', settings.defaultActorMode || 'manual');
    return true;
  }
  return false;
}

export async function removeTracked(actorId) {
  const tracked = getTracked();
  const index = tracked.indexOf(actorId);
  if (index > -1) {
    tracked.splice(index, 1);
    Data.cleanupEntityData('actor', actorId);
    await setTracked(tracked);
    return true;
  }
  return false;
}

export function getActorRep(actorId) {
  return Data.getData().actors[actorId] ?? 0;
}

export async function setActorRep(actorId, value) {
  const oldValue = getActorRep(actorId);
  const data = Data.getData();
  data.actors[actorId] = Data.clamp(value);
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.ACTOR_REP_CHANGED, {
    actorId, oldValue, newValue: data.actors[actorId]
  });
}

export function getCustomName(actorId) {
  return Data.getData().actorNames?.[actorId] || "";
}

export async function setCustomName(actorId, name) {
  const data = Data.getData();
  data.actorNames ??= {};
  data.actorNames[actorId] = name;
  await Data.setData(data);
}

export function getDisplayName(actorId) {
  const custom = getCustomName(actorId);
  if (custom) return custom;
  const actor = game.actors.get(actorId);
  return actor?.name || "Unknown";
}

export async function ensureImportant(actor) {
  if (!actor) return;
  if (!actor.hasPlayerOwner && !actor.system?.traits?.important) {
    await actor.update({ "system.traits.important": true });
  }
}

export function isPlayerCharacter(actorId) {
  const actor = game.actors.get(actorId);
  if (!actor) return false;
  const hasRealOwner = Object.entries(actor.ownership || {}).some(([userId, level]) => {
    if (userId === 'default') return false;
    const user = game.users.get(userId);
    return user && !user.isGM && level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  });
  if (hasRealOwner) return true;
  const data = Data.getData();
  const partyId = data.activePartyId;
  if (partyId) {
    const party = (data.factions || []).find(f => f.id === partyId);
    if (party && (party.members || []).includes(actorId)) return true;
  }
  return false;
}

export function getPCs() {
  const natural = game.actors.filter(actor => {
    return Object.entries(actor.ownership || {}).some(([userId, level]) => {
      if (userId === 'default') return false;
      const user = game.users.get(userId);
      return user && !user.isGM && level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    });
  });
  const data = Data.getData();
  const partyId = data.activePartyId;
  const result = [...natural];
  if (partyId) {
    const party = (data.factions || []).find(f => f.id === partyId);
    if (party) {
      for (const id of (party.members || [])) {
        if (!result.some(a => a.id === id)) {
          const actor = game.actors.get(id);
          if (actor) result.push(actor);
        }
      }
    }
  }
  return result;
}