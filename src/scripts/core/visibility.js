import * as Data from '../data.js';
import { ReputationEvents } from '../events.js';

function getHiddenKey(type) {
  const typeMap = {
    'faction': 'factions',
    'factions': 'factions',
    'actor': 'actors',
    'actors': 'actors',
    'location': 'locations',
    'locations': 'locations'
  };
  return typeMap[type] || 'actors';
}

export function getHiddenItems() {
  const data = Data.getData();
  const hidden = data.hiddenItems || {};
  return {
    factions: Array.isArray(hidden.factions) ? [...hidden.factions] : [],
    actors: Array.isArray(hidden.actors) ? [...hidden.actors] : [],
    locations: Array.isArray(hidden.locations) ? [...hidden.locations] : []
  };
}

export async function setHiddenItems(hidden) {
  const data = Data.getData();
  data.hiddenItems = {
    factions: Array.isArray(hidden.factions) ? [...hidden.factions] : [],
    actors: Array.isArray(hidden.actors) ? [...hidden.actors] : [],
    locations: Array.isArray(hidden.locations) ? [...hidden.locations] : []
  };
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.HIDDEN_CHANGED, { hidden: data.hiddenItems });
}

export function isHidden(type, id) {
  if (!type || !id) return false;
  const hidden = getHiddenItems();
  const key = getHiddenKey(type);
  const arr = hidden[key];
  return Array.isArray(arr) && arr.includes(id);
}

export async function toggleHidden(type, id) {
  if (!type || !id) return;
  const data = Data.getData();
  const key = getHiddenKey(type);
  data.hiddenItems ??= { factions: [], actors: [], locations: [] };
  if (!Array.isArray(data.hiddenItems[key])) data.hiddenItems[key] = [];
  const arr = data.hiddenItems[key];
  const index = arr.indexOf(id);
  index > -1 ? arr.splice(index, 1) : arr.push(id);
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.HIDDEN_CHANGED, { hidden: data.hiddenItems });
}

export async function setHidden(type, id, hide) {
  if (!type || !id) return;
  const data = Data.getData();
  const key = getHiddenKey(type);
  data.hiddenItems ??= { factions: [], actors: [], locations: [] };
  if (!Array.isArray(data.hiddenItems[key])) data.hiddenItems[key] = [];
  const arr = data.hiddenItems[key];
  const index = arr.indexOf(id);
  if (hide && index === -1) {
    arr.push(id);
    await Data.setData(data);
    ReputationEvents.emit(ReputationEvents.EVENTS.HIDDEN_CHANGED, { hidden: data.hiddenItems });
  } else if (!hide && index > -1) {
    arr.splice(index, 1);
    await Data.setData(data);
    ReputationEvents.emit(ReputationEvents.EVENTS.HIDDEN_CHANGED, { hidden: data.hiddenItems });
  }
}

export function filterVisible(items, type) {
  if (game.user.isGM) return items;
  return items.filter(item => !isHidden(type, item.id));
}

export function isRelationHidden(type, entityId, targetId) {
  const data = Data.getData();
  const hiddenRels = data.hiddenRelations || {};
  if (type === 'individual') {
    return hiddenRels.individual?.[entityId]?.[targetId] === true;
  } else if (type === 'faction') {
    return hiddenRels.faction?.[entityId]?.[targetId] === true;
  } else if (type === 'actorFaction') {
    return hiddenRels.actorFaction?.[entityId]?.[targetId] === true;
  } else if (type === 'factionToFaction') {
    return hiddenRels.factionToFaction?.[entityId]?.[targetId] === true;
  }
  return false;
}

export async function toggleRelationHidden(type, entityId, targetId) {
  const data = Data.getData();
  data.hiddenRelations ??= { individual: {}, faction: {}, actorFaction: {}, factionToFaction: {} };
  const typeKey = type === 'individual' ? 'individual' : type === 'faction' ? 'faction' : type === 'factionToFaction' ? 'factionToFaction' : 'actorFaction';
  data.hiddenRelations[typeKey] ??= {};
  data.hiddenRelations[typeKey][entityId] ??= {};
  data.hiddenRelations[typeKey][entityId][targetId] = !data.hiddenRelations[typeKey][entityId][targetId];
  if (!data.hiddenRelations[typeKey][entityId][targetId]) {
    delete data.hiddenRelations[typeKey][entityId][targetId];
    if (Object.keys(data.hiddenRelations[typeKey][entityId]).length === 0) {
      delete data.hiddenRelations[typeKey][entityId];
    }
  }
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.HIDDEN_CHANGED, { type: 'relation', entityId, targetId });
}

export function isMemberHidden(factionId, actorId) {
  const data = Data.getData();
  const hiddenMembers = data.hiddenMembers || {};
  return Array.isArray(hiddenMembers[factionId]) && hiddenMembers[factionId].includes(actorId);
}

export async function toggleMemberHidden(factionId, actorId) {
  const data = Data.getData();
  data.hiddenMembers ??= {};
  data.hiddenMembers[factionId] ??= [];
  const arr = data.hiddenMembers[factionId];
  const index = arr.indexOf(actorId);
  index > -1 ? arr.splice(index, 1) : arr.push(actorId);
  if (arr.length === 0) delete data.hiddenMembers[factionId];
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.HIDDEN_CHANGED, { type: 'member', factionId, actorId });
}

export function isLocationItemHidden(locationId, type, itemId) {
  const data = Data.getData();
  const hidden = data.hiddenLocationItems || {};
  const key = type === 'faction' ? 'factions' : 'actors';
  return Array.isArray(hidden[key]?.[locationId]) && hidden[key][locationId].includes(itemId);
}

export async function toggleLocationItemHidden(locationId, type, itemId) {
  const data = Data.getData();
  data.hiddenLocationItems ??= { factions: {}, actors: {} };
  const key = type === 'faction' ? 'factions' : 'actors';
  data.hiddenLocationItems[key] ??= {};
  data.hiddenLocationItems[key][locationId] ??= [];
  const arr = data.hiddenLocationItems[key][locationId];
  const index = arr.indexOf(itemId);
  index > -1 ? arr.splice(index, 1) : arr.push(itemId);
  if (arr.length === 0) delete data.hiddenLocationItems[key][locationId];
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.HIDDEN_CHANGED, { type: 'locationItem', locationId, itemType: type, itemId });
}

export function shouldShowNotification(type, entityId, targetId = null) {
  if (isHidden('actor', entityId) || isHidden('faction', entityId) || isHidden('location', entityId)) {
    return false;
  }
  if (targetId) {
    if (isHidden('actor', targetId) || isHidden('faction', targetId)) {
      return false;
    }
    if (type === 'individual' || type === 'faction' || type === 'actorFaction') {
      if (isRelationHidden(type, entityId, targetId)) {
        return false;
      }
    }
  }
  return true;
}