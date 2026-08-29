import { MODULE_ID, DEFAULT_DATA, SOCKET_TYPES, DATA_SEGMENTS } from '../constants.js';
import { ReputationEvents } from '../events.js';
import { clamp } from './settings.js';

let _dataCache = null;
let _saveTimeout = null;
let _isSaving = false;
let _dirtySegments = new Set();
let _lastSavedSnapshots = {};
const SAVE_DELAY = 300;

// ─── Segment helpers ───────────────────────────────────────────────────────────

function _getSegmentForKey(dataKey) {
  for (const [segName, keys] of Object.entries(DATA_SEGMENTS)) {
    if (keys.includes(dataKey)) return segName;
  }
  return null;
}

function _buildDataFromSegments() {
  const data = {};
  for (const [segName, keys] of Object.entries(DATA_SEGMENTS)) {
    const seg = game.settings.get(MODULE_ID, segName) || {};
    for (const key of keys) {
      data[key] = seg[key] ?? foundry.utils.deepClone(DEFAULT_DATA[key]);
    }
  }
  return data;
}

function _extractSegment(data, segName) {
  const keys = DATA_SEGMENTS[segName];
  const seg = {};
  for (const key of keys) {
    seg[key] = data[key];
  }
  return seg;
}

function _markAllDirty() {
  for (const segName of Object.keys(DATA_SEGMENTS)) {
    _dirtySegments.add(segName);
  }
}

// ─── Migration ─────────────────────────────────────────────────────────────────

export async function migrateToSegments() {
  if (!game.user.isGM) return;

  const migrated = game.settings.get(MODULE_ID, "repData-migrated");
  if (migrated) return;

  // Read old monolithic data
  const oldData = game.settings.get(MODULE_ID, "reputationData");
  if (!oldData || Object.keys(oldData).length === 0) {
    await game.settings.set(MODULE_ID, "repData-migrated", true);
    return;
  }

  // Clean legacy fields
  delete oldData.personalVisibility;
  delete oldData.customPCs;

  // Ensure factionToFaction in hiddenRelations
  if (oldData.hiddenRelations && !oldData.hiddenRelations.factionToFaction) {
    oldData.hiddenRelations.factionToFaction = {};
  }

  // Split into segments
  for (const [segName, keys] of Object.entries(DATA_SEGMENTS)) {
    const seg = {};
    for (const key of keys) {
      seg[key] = oldData[key] ?? foundry.utils.deepClone(DEFAULT_DATA[key]);
    }
    await game.settings.set(MODULE_ID, segName, seg);
  }

  await game.settings.set(MODULE_ID, "repData-migrated", true);
  _dataCache = _buildDataFromSegments();
  for (const segName of Object.keys(DATA_SEGMENTS)) {
    _lastSavedSnapshots[segName] = JSON.stringify(_extractSegment(_dataCache, segName));
  }
  _dirtySegments.clear();
  broadcastDataUpdate();
  console.log(`${MODULE_ID} | Migrated monolithic data to incremental segments`);
}

// ─── Data access ───────────────────────────────────────────────────────────────

export function getData() {
  if (!_dataCache) {
    const migrated = game.settings.get(MODULE_ID, "repData-migrated");
    if (migrated) {
      _dataCache = _buildDataFromSegments();
    } else {
      // Not yet migrated — use legacy monolithic setting
      _dataCache = foundry.utils.deepClone(game.settings.get(MODULE_ID, "reputationData")) || foundry.utils.deepClone(DEFAULT_DATA);
    }
    // Snapshot for dirty detection
    for (const segName of Object.keys(DATA_SEGMENTS)) {
      _lastSavedSnapshots[segName] = JSON.stringify(_extractSegment(_dataCache, segName));
    }
  }
  return _dataCache;
}

export async function setData(data) {
  if (!data || Object.keys(data).length === 0) {
    console.warn(`${MODULE_ID} | Attempted to set empty/invalid data, aborting`, data);
    return;
  }

  _dataCache = data;

  for (const segName of Object.keys(DATA_SEGMENTS)) {
    const currentJson = JSON.stringify(_extractSegment(data, segName));
    if (currentJson !== _lastSavedSnapshots[segName]) {
      _dirtySegments.add(segName);
    }
  }

  ReputationEvents.emit(ReputationEvents.EVENTS.DATA_CHANGED, { data });

  if (!game.user.isGM) {
    requestGMUpdate(data).catch(err => {
      console.warn(`${MODULE_ID} | GM sync failed:`, err);
    });
    return;
  }

  if (_saveTimeout) clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(() => _executeSave(), SAVE_DELAY);
}

async function _persistSegments() {
  const migrated = game.settings.get(MODULE_ID, "repData-migrated");
  if (!migrated) {
    await game.settings.set(MODULE_ID, "reputationData", foundry.utils.deepClone(_dataCache));
    _dirtySegments.clear();
    return;
  }

  const segNames = [];
  for (const segName of _dirtySegments) segNames.push(segName);
  _dirtySegments.clear();

  const failures = [];
  await Promise.all(segNames.map(async segName => {
    const seg = _extractSegment(_dataCache, segName);
    try {
      await game.settings.set(MODULE_ID, segName, foundry.utils.deepClone(seg));
      _lastSavedSnapshots[segName] = JSON.stringify(seg);
    } catch (e) {
      console.error(`${MODULE_ID} | Failed to save segment ${segName}:`, e);
      _dirtySegments.add(segName);
      failures.push(segName);
    }
  }));

  if (failures.length > 0) {
    throw new Error(`${MODULE_ID} | Failed to save segments: ${failures.join(', ')}`);
  }
}

function _scheduleRetry() {
  if (_saveTimeout || _dirtySegments.size === 0) return;
  _saveTimeout = setTimeout(() => _executeSave(), SAVE_DELAY * 2);
}

async function _executeSave() {
  if (_isSaving) {
    if (_saveTimeout) clearTimeout(_saveTimeout);
    _saveTimeout = setTimeout(() => _executeSave(), SAVE_DELAY);
    return;
  }

  _isSaving = true;
  _saveTimeout = null;

  try {
    await _persistSegments();
    broadcastDataUpdate();
    ReputationEvents.emit(ReputationEvents.EVENTS.DATA_LOADED, { data: _dataCache });
  } catch (e) {
    console.error(`${MODULE_ID} | Save error:`, e);
    ui.notifications.error(game.i18n.localize(`${MODULE_ID}.errors.saveFailed`));
    _scheduleRetry();
  } finally {
    _isSaving = false;
    if (_dirtySegments.size > 0 && !_saveTimeout) {
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

export function validateDataStructure(data) {
  if (!data || typeof data !== 'object') return false;
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
        if (validateDataStructure(message.data)) {
          _dataCache = message.data;
          // Update snapshots
          for (const segName of Object.keys(DATA_SEGMENTS)) {
            _lastSavedSnapshots[segName] = JSON.stringify(_extractSegment(_dataCache, segName));
          }
          ReputationEvents.emit(ReputationEvents.EVENTS.DATA_LOADED, { data: _dataCache });
        }
      }
      break;
    case SOCKET_TYPES.SHOW_NOTIFICATION:
      import('../core/notifications.js').then(m => m.showNotification(message.message, message.delta));
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
    if (!validateDataStructure(message.data)) {
      game.socket.emit(`module.${MODULE_ID}`, { requestId: message.requestId, success: false, error: 'Invalid data structure' });
      return;
    }
    _dataCache = message.data;
    _markAllDirty();
    await _executeSaveImmediate();
    broadcastDataUpdate();
    game.socket.emit(`module.${MODULE_ID}`, { requestId: message.requestId, success: true });
    ReputationEvents.emit(ReputationEvents.EVENTS.DATA_LOADED, { data: _dataCache });
  } catch (e) {
    console.error(`${MODULE_ID} | GM update error:`, e);
    game.socket.emit(`module.${MODULE_ID}`, { requestId: message.requestId, success: false, error: e.message });
  }
}

async function _executeSaveImmediate() {
  await _persistSegments();
}

async function handleSetIndRel(message) {
  try {
    const { fromId, toId, value, requestId } = message;
    const data = getData();
    data.individualRelations ??= {};
    data.individualRelations[fromId] ??= {};
    data.individualRelations[fromId][toId] = clamp(value);
    _dataCache = data;
    _dirtySegments.add('repData-relations');
    await _executeSaveImmediate();
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
    _dirtySegments.add('repData-relations');
    await _executeSaveImmediate();
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
    _dirtySegments.add('repData-relations');
    await _executeSaveImmediate();
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
    _dirtySegments.add('repData-relations');
    await _executeSaveImmediate();
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
    _dirtySegments.add('repData-entities');
    await _executeSaveImmediate();
    broadcastDataUpdate();
    game.socket.emit(`module.${MODULE_ID}`, { requestId, success: true });
  } catch (e) {
    console.error(`${MODULE_ID} | handleSetCustomName error:`, e);
    game.socket.emit(`module.${MODULE_ID}`, { requestId: message.requestId, success: false, error: e.message });
  }
}

export async function flushData() {
  if (!_dataCache) return;
  if (_saveTimeout) {
    clearTimeout(_saveTimeout);
    _saveTimeout = null;
  }
  try {
    if (game.user.isGM) {
      if (!_isSaving && _dirtySegments.size > 0) {
        await _executeSaveImmediate();
      }
    } else if (_dirtySegments.size > 0) {
      await requestGMUpdate(_dataCache);
      _dirtySegments.clear();
    }
  } catch (e) {
    console.error(`${MODULE_ID} | Flush error:`, e);
  }
}

export function clearDataCache() {
  _dataCache = null;
  _lastSavedSnapshots = {};
  _dirtySegments.clear();
}
