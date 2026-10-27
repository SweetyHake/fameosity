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

// actor types that can belong to a player without being a player character
// (pf2e: loot/familiar/hazard/party, dnd5e: vehicle/group, and similar in other systems)
const NON_CHARACTER_ACTOR_TYPES = new Set([
  'npc', 'loot', 'vehicle', 'hazard', 'familiar', 'group', 'party',
  'ship', 'cargo', 'community', 'settlement', 'creature'
]);

function _isCharacterLike(actor) {
  return !!actor && !NON_CHARACTER_ACTOR_TYPES.has(actor.type);
}

/**
 * Delete an actor from the module's view. Tracked actors leave tracking; untracked
 * ones (listed as active-party extras) leave the active party instead of silently
 * doing nothing (#16).
 */
export async function removeFromTrackedOrParty(actorId) {
  if (getTracked().includes(actorId)) {
    return removeTracked(actorId);
  }
  const { getActiveParty } = await import('./party.js');
  const party = getActiveParty();
  if (party && (party.members || []).includes(actorId)) {
    const { removeFactionMember } = await import('./factions.js');
    return removeFactionMember(party.id, actorId);
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
  if (custom) return Data.cleanName(custom) || custom;
  const actor = game.actors.get(actorId);
  return Data.cleanName(actor?.name) || actor?.name || "Unknown";
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
  // a player owning a loot container or familiar does not make it a party member (#16)
  if (!_isCharacterLike(actor)) {
    return false;
  }
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
    if (!_isCharacterLike(actor)) return false;
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