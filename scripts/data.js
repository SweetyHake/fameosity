import { MODULE_ID, DEFAULT_DATA, DEFAULT_SETTINGS, DEFAULT_TIER_KEYS, SOCKET_TYPES } from './constants.js';
import { ReputationEvents } from './events.js';

let _dataCache = null;
let _settingsCache = null;
let _tiersCache = null;
let _saveTimeout = null;
let _pendingResolvers = [];
let _isSaving = false;
const SAVE_DELAY = 300;

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function getData() {
  if (!_dataCache) {
    _dataCache = foundry.utils.deepClone(game.settings.get(MODULE_ID, "reputationData")) || { ...DEFAULT_DATA };
  }
  return _dataCache;
}

export async function setData(data) {
  if (!data || Object.keys(data).length === 0) {
    console.warn(`${MODULE_ID} | Attempted to set empty/invalid data, aborting`, data);
    return;
  }
  
  _dataCache = data;
  
  if (!game.user.isGM) {
    return requestGMUpdate(data);
  }
  
  return new Promise(resolve => {
    _pendingResolvers.push(resolve);
    if (_saveTimeout) clearTimeout(_saveTimeout);
    _saveTimeout = setTimeout(() => _executeSave(), SAVE_DELAY);
  });
}

async function _executeSave() {
  if (_isSaving) {
    if (_saveTimeout) clearTimeout(_saveTimeout);
    _saveTimeout = setTimeout(() => _executeSave(), SAVE_DELAY);
    return;
  }
  
  _isSaving = true;
  _saveTimeout = null;
  
  const resolvers = [..._pendingResolvers];
  _pendingResolvers = [];
  
  try {
    await game.settings.set(MODULE_ID, "reputationData", foundry.utils.deepClone(_dataCache));
    broadcastDataUpdate();
    ReputationEvents.emit(ReputationEvents.EVENTS.DATA_LOADED, { data: _dataCache });
  } catch (e) {
    console.error(`${MODULE_ID} | Save error:`, e);
    ui.notifications.error(game.i18n.localize(`${MODULE_ID}.errors.saveFailed`));
  } finally {
    _isSaving = false;
    resolvers.forEach(r => r());
    if (_pendingResolvers.length > 0) {
      _saveTimeout = setTimeout(() => _executeSave(), SAVE_DELAY);
    }
  }
}

function broadcastDataUpdate() {
  game.socket.emit(`module.${MODULE_ID}`, {
    type: SOCKET_TYPES.UPDATE_DATA,
    data: foundry.utils.deepClone(_dataCache)
  });
}

async function requestGMUpdate(data) {
  return new Promise((resolve, reject) => {
    const requestId = foundry.utils.randomID();
    const timeout = setTimeout(() => {
      game.socket.off(`module.${MODULE_ID}`, handler);
      reject(new Error('GM update request timed out'));
    }, 10000);
    
    const handler = (response) => {
      if (response.requestId === requestId) {
        clearTimeout(timeout);
        game.socket.off(`module.${MODULE_ID}`, handler);
        response.success ? resolve() : reject(new Error(response.error || 'Update failed'));
      }
    };
    
    game.socket.on(`module.${MODULE_ID}`, handler);
    game.socket.emit(`module.${MODULE_ID}`, {
      type: SOCKET_TYPES.REQUEST_DATA_UPDATE,
      data: foundry.utils.deepClone(data),
      requestId,
      userId: game.user.id
    });
  });
}

export function requestOperation(type, payload) {
  return new Promise((resolve, reject) => {
    const requestId = foundry.utils.randomID();
    const timeout = setTimeout(() => {
      game.socket.off(`module.${MODULE_ID}`, handler);
      reject(new Error('Operation request timed out'));
    }, 10000);
    
    const handler = (response) => {
      if (response.requestId === requestId) {
        clearTimeout(timeout);
        game.socket.off(`module.${MODULE_ID}`, handler);
        response.success ? resolve(response.result) : reject(new Error(response.error || 'Operation failed'));
      }
    };
    
    game.socket.on(`module.${MODULE_ID}`, handler);
    game.socket.emit(`module.${MODULE_ID}`, { type, ...payload, requestId, userId: game.user.id });
  });
}

function _validateDataStructure(data) {
  if (!data || typeof data !== 'object') return false;
  const requiredKeys = ['actors', 'factions', 'trackedActors'];
  for (const key of requiredKeys) {
    if (!(key in data)) return false;
  }
  if (!Array.isArray(data.factions)) return false;
  if (!Array.isArray(data.trackedActors)) return false;
  return true;
}

export function handleSocketMessage(message) {
  switch (message.type) {
    case SOCKET_TYPES.REQUEST_DATA_UPDATE:
      if (game.user.isGM) handleGMDataUpdate(message);
      break;
    case SOCKET_TYPES.UPDATE_DATA:
      if (!game.user.isGM) {
        if (_validateDataStructure(message.data)) {
          _dataCache = message.data;
          ReputationEvents.emit(ReputationEvents.EVENTS.DATA_LOADED, { data: _dataCache });
        }
      }
      break;
    case SOCKET_TYPES.SHOW_NOTIFICATION:
      import('./core/notifications.js').then(m => m.showNotification(message.message, message.delta));
      break;
    case SOCKET_TYPES.SET_IND_REL:
      if (game.user.isGM) handleSetIndRel(message);
      break;
    case SOCKET_TYPES.SET_FACTION_REL:
      if (game.user.isGM) handleSetFactionRel(message);
      break;
    case SOCKET_TYPES.SET_ACTOR_FACTION_REL:
      if (game.user.isGM) handleSetActorFactionRel(message);
      break;
    case SOCKET_TYPES.SET_CUSTOM_NAME:
      if (game.user.isGM) handleSetCustomName(message);
      break;
    case SOCKET_TYPES.SET_FACTION_TO_FACTION_REL:
      if (game.user.isGM) handleSetFactionToFactionRel(message);
      break;
  }
}

async function handleGMDataUpdate(message) {
  try {
    if (!_validateDataStructure(message.data)) {
      game.socket.emit(`module.${MODULE_ID}`, { requestId: message.requestId, success: false, error: 'Invalid data structure' });
      return;
    }
    _dataCache = message.data;
    await game.settings.set(MODULE_ID, "reputationData", foundry.utils.deepClone(_dataCache));
    broadcastDataUpdate();
    game.socket.emit(`module.${MODULE_ID}`, { requestId: message.requestId, success: true });
    ReputationEvents.emit(ReputationEvents.EVENTS.DATA_LOADED, { data: _dataCache });
  } catch (e) {
    console.error(`${MODULE_ID} | GM update error:`, e);
    game.socket.emit(`module.${MODULE_ID}`, { requestId: message.requestId, success: false, error: e.message });
  }
}

async function handleSetIndRel(message) {
  try {
    const { fromId, toId, value, requestId } = message;
    const data = getData();
    data.individualRelations ??= {};
    data.individualRelations[fromId] ??= {};
    data.individualRelations[fromId][toId] = clamp(value);
    _dataCache = data;
    await game.settings.set(MODULE_ID, "reputationData", foundry.utils.deepClone(_dataCache));
    broadcastDataUpdate();
    game.socket.emit(`module.${MODULE_ID}`, { requestId, success: true });
    ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { npcId: fromId, pcId: toId, newValue: data.individualRelations[fromId][toId] });
  } catch (e) {
    console.error(`${MODULE_ID} | handleSetIndRel error:`, e);
    game.socket.emit(`module.${MODULE_ID}`, { requestId: message.requestId, success: false, error: e.message });
  }
}

async function handleSetFactionRel(message) {
  try {
    const { factionId, pcId, value, requestId } = message;
    const data = getData();
    data.factionRelations ??= {};
    data.factionRelations[factionId] ??= {};
    data.factionRelations[factionId][pcId] = clamp(value);
    _dataCache = data;
    await game.settings.set(MODULE_ID, "reputationData", foundry.utils.deepClone(_dataCache));
    broadcastDataUpdate();
    game.socket.emit(`module.${MODULE_ID}`, { requestId, success: true });
    ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { factionId, pcId, newValue: data.factionRelations[factionId][pcId], type: 'faction' });
  } catch (e) {
    console.error(`${MODULE_ID} | handleSetFactionRel error:`, e);
    game.socket.emit(`module.${MODULE_ID}`, { requestId: message.requestId, success: false, error: e.message });
  }
}

async function handleSetActorFactionRel(message) {
  try {
    const { actorId, factionId, value, requestId } = message;
    const data = getData();
    data.actorFactionRelations ??= {};
    data.actorFactionRelations[actorId] ??= {};
    data.actorFactionRelations[actorId][factionId] = clamp(value);
    _dataCache = data;
    await game.settings.set(MODULE_ID, "reputationData", foundry.utils.deepClone(_dataCache));
    broadcastDataUpdate();
    game.socket.emit(`module.${MODULE_ID}`, { requestId, success: true });
    ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { actorId, factionId, newValue: data.actorFactionRelations[actorId][factionId], type: 'actor-faction' });
  } catch (e) {
    console.error(`${MODULE_ID} | handleSetActorFactionRel error:`, e);
    game.socket.emit(`module.${MODULE_ID}`, { requestId: message.requestId, success: false, error: e.message });
  }
}

async function handleSetFactionToFactionRel(message) {
  try {
    const { factionId1, factionId2, value, requestId } = message;
    const data = getData();
    data.factionToFactionRelations ??= {};
    data.factionToFactionRelations[factionId1] ??= {};
    data.factionToFactionRelations[factionId1][factionId2] = clamp(value);
    _dataCache = data;
    await game.settings.set(MODULE_ID, "reputationData", foundry.utils.deepClone(_dataCache));
    broadcastDataUpdate();
    game.socket.emit(`module.${MODULE_ID}`, { requestId, success: true });
    ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, { factionId1, factionId2, newValue: data.factionToFactionRelations[factionId1][factionId2], type: 'faction-to-faction' });
  } catch (e) {
    console.error(`${MODULE_ID} | handleSetFactionToFactionRel error:`, e);
    game.socket.emit(`module.${MODULE_ID}`, { requestId: message.requestId, success: false, error: e.message });
  }
}

async function handleSetCustomName(message) {
  try {
    const { actorId, name, requestId } = message;
    const data = getData();
    data.actorNames ??= {};
    data.actorNames[actorId] = name;
    _dataCache = data;
    await game.settings.set(MODULE_ID, "reputationData", foundry.utils.deepClone(_dataCache));
    broadcastDataUpdate();
    game.socket.emit(`module.${MODULE_ID}`, { requestId, success: true });
  } catch (e) {
    console.error(`${MODULE_ID} | handleSetCustomName error:`, e);
    game.socket.emit(`module.${MODULE_ID}`, { requestId: message.requestId, success: false, error: e.message });
  }
}

export async function flushData() {
  if (_saveTimeout && _dataCache) {
    clearTimeout(_saveTimeout);
    _saveTimeout = null;
    const resolvers = [..._pendingResolvers];
    _pendingResolvers = [];
    try {
      if (game.user.isGM) {
        await game.settings.set(MODULE_ID, "reputationData", foundry.utils.deepClone(_dataCache));
      } else {
        await requestGMUpdate(_dataCache);
      }
    } catch (e) {
      console.error(`${MODULE_ID} | Flush error:`, e);
    }
    resolvers.forEach(r => r());
  }
}

export function getSettings() {
  if (!_settingsCache) {
    _settingsCache = game.settings.get(MODULE_ID, "reputationSettings") || { ...DEFAULT_SETTINGS };
  }
  return _settingsCache;
}

export async function setSettings(settings) {
  _settingsCache = settings;
  await game.settings.set(MODULE_ID, "reputationSettings", settings);
  ReputationEvents.emit(ReputationEvents.EVENTS.SETTINGS_CHANGED, { settings });
}

export function getLimits() {
  const settings = getSettings();
  return { min: settings.min, max: settings.max };
}

export function clamp(value, min = null, max = null) {
  if (min === null || max === null) {
    const limits = getLimits();
    min = min ?? limits.min;
    max = max ?? limits.max;
  }
  return Math.max(min, Math.min(max, value));
}

export function getDefaultTiers() {
  return DEFAULT_TIER_KEYS.map(tier => ({
    name: game.i18n.localize(`${MODULE_ID}.${tier.nameKey}`),
    minValue: tier.minValue,
    color: tier.color
  }));
}

export function getTiers() {
  if (!_tiersCache) {
    _tiersCache = game.settings.get(MODULE_ID, "relationTiers") || getDefaultTiers();
  }
  return _tiersCache;
}

export async function setTiers(tiers) {
  _tiersCache = tiers;
  await game.settings.set(MODULE_ID, "relationTiers", tiers);
}

export function getTier(value) {
  const tiers = getTiers();
  if (!tiers || tiers.length === 0) {
    return { name: "Unknown", color: "#666666", minValue: -Infinity };
  }
  if (value >= 0) {
    const positiveTiers = tiers.filter(t => t.minValue >= 0).sort((a, b) => b.minValue - a.minValue);
    return positiveTiers.find(tier => value >= tier.minValue) || positiveTiers[positiveTiers.length - 1] || tiers[0];
  } else {
    const negativeTiers = tiers.filter(t => t.minValue < 0).sort((a, b) => a.minValue - b.minValue);
    return negativeTiers.find(tier => value <= tier.minValue) || negativeTiers[negativeTiers.length - 1] || tiers[0];
  }
}

export function getRepColor(value) {
  return getTier(value).color;
}

export function invalidateCache() {
  _dataCache = null;
  _settingsCache = null;
  _tiersCache = null;
}

export function getLocations() {
  return getData().locations || [];
}

export async function setLocations(locations) {
  const data = getData();
  data.locations = locations;
  await setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.LOCATION_CHANGED, { locations });
}

export function getEntityInfo(entityType, entityId) {
  const data = getData();
  data.entityInfo ??= {};
  data.entityInfo[entityType] ??= {};
  return data.entityInfo[entityType][entityId] || { public: "", gm: "", perPlayer: {} };
}

export async function setEntityInfo(entityType, entityId, info) {
  const data = getData();
  data.entityInfo ??= {};
  data.entityInfo[entityType] ??= {};
  data.entityInfo[entityType][entityId] = info;
  await setData(data);
}

export function getDescription(entityType, entityId) {
  const data = getData();
  return data.descriptions?.[entityType]?.[entityId] || "";
}

export async function setDescription(entityType, entityId, description) {
  const data = getData();
  data.descriptions ??= { actors: {}, factions: {}, locations: {} };
  data.descriptions[entityType] ??= {};
  data.descriptions[entityType][entityId] = description;
  await setData(data);
}

export function cleanupEntityData(entityType, entityId) {
  const data = getData();

  if (entityType === 'actor' || entityType === 'actors') {
    const id = entityId;
    delete data.actors?.[id];
    delete data.actorNames?.[id];
    delete data.descriptions?.actors?.[id];
    delete data.entityInfo?.actors?.[id];

    if (data.modeFlags?.actors) delete data.modeFlags.actors[id];

    const hiddenActors = data.hiddenItems?.actors;
    if (Array.isArray(hiddenActors)) {
      const idx = hiddenActors.indexOf(id);
      if (idx > -1) hiddenActors.splice(idx, 1);
    }

    if (data.individualRelations) {
      delete data.individualRelations[id];
      for (const key of Object.keys(data.individualRelations)) {
        delete data.individualRelations[key][id];
        if (Object.keys(data.individualRelations[key]).length === 0) delete data.individualRelations[key];
      }
    }

    if (data.actorFactionRelations) delete data.actorFactionRelations[id];

    if (data.factionRelations) {
      for (const key of Object.keys(data.factionRelations)) {
        delete data.factionRelations[key][id];
        if (Object.keys(data.factionRelations[key]).length === 0) delete data.factionRelations[key];
      }
    }

    if (data.hiddenRelations) {
      for (const relType of ['individual', 'faction', 'actorFaction']) {
        if (data.hiddenRelations[relType]) {
          delete data.hiddenRelations[relType][id];
          for (const key of Object.keys(data.hiddenRelations[relType])) {
            delete data.hiddenRelations[relType][key]?.[id];
          }
        }
      }
    }

    if (data.hiddenMembers) {
      for (const factionId of Object.keys(data.hiddenMembers)) {
        const arr = data.hiddenMembers[factionId];
        if (Array.isArray(arr)) {
          const idx = arr.indexOf(id);
          if (idx > -1) arr.splice(idx, 1);
          if (arr.length === 0) delete data.hiddenMembers[factionId];
        }
      }
    }

    if (data.hiddenLocationItems) {
      for (const key of ['actors']) {
        if (data.hiddenLocationItems[key]) {
          for (const locId of Object.keys(data.hiddenLocationItems[key])) {
            const arr = data.hiddenLocationItems[key][locId];
            if (Array.isArray(arr)) {
              const idx = arr.indexOf(id);
              if (idx > -1) arr.splice(idx, 1);
              if (arr.length === 0) delete data.hiddenLocationItems[key][locId];
            }
          }
        }
      }
    }

    for (const faction of (data.factions || [])) {
      if (faction.members) {
        const idx = faction.members.indexOf(id);
        if (idx > -1) faction.members.splice(idx, 1);
      }
      if (faction.memberRanks) delete faction.memberRanks[id];
    }

    for (const loc of (data.locations || [])) {
      if (loc.actors) {
        const idx = loc.actors.indexOf(id);
        if (idx > -1) loc.actors.splice(idx, 1);
      }
    }
  }

  if (entityType === 'faction' || entityType === 'factions') {
    const id = entityId;
    delete data.descriptions?.factions?.[id];
    delete data.entityInfo?.factions?.[id];

    if (data.modeFlags?.factions) delete data.modeFlags.factions[id];

    const hiddenFactions = data.hiddenItems?.factions;
    if (Array.isArray(hiddenFactions)) {
      const idx = hiddenFactions.indexOf(id);
      if (idx > -1) hiddenFactions.splice(idx, 1);
    }

    if (data.factionRelations) delete data.factionRelations[id];
    if (data.factionToFactionRelations) {
      delete data.factionToFactionRelations[id];
      for (const key of Object.keys(data.factionToFactionRelations)) {
        delete data.factionToFactionRelations[key][id];
        if (Object.keys(data.factionToFactionRelations[key]).length === 0) delete data.factionToFactionRelations[key];
      }
    }

    if (data.actorFactionRelations) {
      for (const key of Object.keys(data.actorFactionRelations)) {
        delete data.actorFactionRelations[key][id];
        if (Object.keys(data.actorFactionRelations[key]).length === 0) delete data.actorFactionRelations[key];
      }
    }

    if (data.hiddenRelations) {
      for (const relType of ['faction', 'factionToFaction', 'actorFaction']) {
        if (data.hiddenRelations[relType]) {
          delete data.hiddenRelations[relType][id];
          for (const key of Object.keys(data.hiddenRelations[relType])) {
            delete data.hiddenRelations[relType][key]?.[id];
          }
        }
      }
    }

    delete data.hiddenMembers?.[id];

    if (data.hiddenLocationItems?.factions) {
      for (const locId of Object.keys(data.hiddenLocationItems.factions)) {
        const arr = data.hiddenLocationItems.factions[locId];
        if (Array.isArray(arr)) {
          const idx = arr.indexOf(id);
          if (idx > -1) arr.splice(idx, 1);
          if (arr.length === 0) delete data.hiddenLocationItems.factions[locId];
        }
      }
    }

    for (const loc of (data.locations || [])) {
      if (loc.factions) {
        const idx = loc.factions.indexOf(id);
        if (idx > -1) loc.factions.splice(idx, 1);
      }
      if (loc.controlledBy === id) delete loc.controlledBy;
    }

    for (const fac of (data.factions || [])) {
      if (fac.parentId === id) fac.parentId = null;
    }

    if (data.activePartyId === id) data.activePartyId = null;
  }

  if (entityType === 'location' || entityType === 'locations') {
    const id = entityId;
    delete data.descriptions?.locations?.[id];
    delete data.entityInfo?.locations?.[id];

    const hiddenLocations = data.hiddenItems?.locations;
    if (Array.isArray(hiddenLocations)) {
      const idx = hiddenLocations.indexOf(id);
      if (idx > -1) hiddenLocations.splice(idx, 1);
    }

    if (data.hiddenLocationItems) {
      for (const key of ['factions', 'actors']) {
        if (data.hiddenLocationItems[key]) delete data.hiddenLocationItems[key][id];
      }
    }

    for (const loc of (data.locations || [])) {
      if (loc.parentId === id) loc.parentId = null;
    }
  }
}