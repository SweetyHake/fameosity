import { MODULE_ID } from '../constants.js';
import * as Data from '../data.js';
import * as Actors from './actors.js';
import * as Relations from './relations.js';
import * as Factions from './factions.js';
import * as Visibility from './visibility.js';
import { getRep, getMode } from './reputation.js';
import { showRelationChangeNotification, showNotification } from './notifications.js';

export const NOTIFICATION_MODES = {
  FORCE: 'force',
  DEFAULT: 'default',
  NONE: 'none'
};

function resolveEntities(input) {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input];

  return list.map(item => {
    if (typeof item === 'string') {
      const actor = game.actors.get(item);
      if (actor) return { type: 'actor', id: item, name: Actors.getDisplayName(item), entity: actor };
      const faction = Factions.getFaction(item);
      if (faction) return { type: 'faction', id: item, name: faction.name, entity: faction };
      return null;
    }
    if (item?.documentName === 'Actor' || item?.constructor?.documentName === 'Actor') {
      return { type: 'actor', id: item.id, name: Actors.getDisplayName(item.id), entity: item };
    }
    if (item?.id && item?.name && item?.members !== undefined) {
      return { type: 'faction', id: item.id, name: item.name, entity: item };
    }
    if (item?.type && item?.id) {
      if (item.type === 'actor') {
        const actor = game.actors.get(item.id);
        return actor ? { type: 'actor', id: item.id, name: Actors.getDisplayName(item.id), entity: actor } : null;
      }
      if (item.type === 'faction') {
        const faction = Factions.getFaction(item.id);
        return faction ? { type: 'faction', id: item.id, name: faction.name, entity: faction } : null;
      }
    }
    return null;
  }).filter(Boolean);
}

function getRelationType(sourceType, targetType) {
  if (sourceType === 'actor' && targetType === 'actor') return 'individual';
  if (sourceType === 'faction' && targetType === 'actor') return 'faction';
  if (sourceType === 'actor' && targetType === 'faction') return 'actorFaction';
  if (sourceType === 'faction' && targetType === 'faction') return 'factionToFaction';
  return null;
}

async function getRelation(sourceType, sourceId, targetType, targetId) {
  const relType = getRelationType(sourceType, targetType);
  switch (relType) {
    case 'individual': return Relations.getIndRel(sourceId, targetId);
    case 'faction': return Relations.getFactionRel(sourceId, targetId);
    case 'actorFaction': return Relations.getActorFactionRel(sourceId, targetId);
    case 'factionToFaction': return Relations.getFactionToFactionRel(sourceId, targetId);
    default: return 0;
  }
}

async function applyRelation(sourceType, sourceId, targetType, targetId, value) {
  const relType = getRelationType(sourceType, targetType);
  const clamped = Data.clamp(value);
  switch (relType) {
    case 'individual': await Relations.setIndRel(sourceId, targetId, clamped); break;
    case 'faction': await Relations.setFactionRel(sourceId, targetId, clamped); break;
    case 'actorFaction': await Relations.setActorFactionRel(sourceId, targetId, clamped); break;
    case 'factionToFaction': await Relations.setFactionToFactionRel(sourceId, targetId, clamped); break;
  }
}

function shouldNotify(notificationMode, sourceType, sourceId, targetType, targetId) {
  if (notificationMode === NOTIFICATION_MODES.NONE) return false;
  if (notificationMode === NOTIFICATION_MODES.FORCE) return true;
  if (Visibility.isHidden(sourceType, sourceId)) return false;
  if (Visibility.isHidden(targetType, targetId)) return false;
  const relType = getRelationType(sourceType, targetType);
  if (relType && Visibility.isRelationHidden(relType, sourceId, targetId)) return false;
  return true;
}

function getTargetPcId(targetType, targetId) {
  if (targetType === 'actor' && Actors.isPlayerCharacter(targetId)) return targetId;
  return null;
}

function collectOwnerIds(entityId) {
  const ownerIds = new Set();
  const actor = game.actors.get(entityId);
  if (actor?.hasPlayerOwner) {
    Object.entries(actor.ownership || {})
      .filter(([userId, level]) => level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && userId !== 'default')
      .forEach(([userId]) => ownerIds.add(userId));
  }
  return ownerIds;
}

function buildResults(sources, targets, changes) {
  return {
    sources: sources.map(s => ({ type: s.type, id: s.id, name: s.name })),
    targets: targets.map(t => ({ type: t.type, id: t.id, name: t.name })),
    changes
  };
}

export async function setRep(sources, targets, value, options = {}) {
  const {
    notification = NOTIFICATION_MODES.DEFAULT,
    bidirectional = false,
    reason = '',
    setBaseRep = false
  } = options;

  const resolvedSources = resolveEntities(sources);
  const resolvedTargets = resolveEntities(targets);
  const changes = [];

  if (setBaseRep && resolvedTargets.length === 0) {
    for (const source of resolvedSources) {
      if (source.type === 'actor') {
        const { getActiveParty } = await import('./party.js');
        const party = getActiveParty();
        if (!party) {
          ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.remember.warn-no-party`));
          continue;
        }
        const oldValue = Relations.getActorFactionRel(source.id, party.id);
        const newValue = Data.clamp(value);
        await Relations.setActorFactionRel(source.id, party.id, newValue);
        const delta = newValue - oldValue;
        changes.push({ source: source.id, type: 'partyRep', oldValue, newValue, delta });
        if (delta !== 0 && notification !== NOTIFICATION_MODES.NONE) {
          notifyAllPlayers(source.name, party.name, delta, source.id);
        }
      } else if (source.type === 'faction') {
        const { getActiveParty } = await import('./party.js');
        const party = getActiveParty();
        if (!party) {
          ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.remember.warn-no-party`));
          continue;
        }
        const oldValue = Relations.getFactionToFactionRel(source.id, party.id);
        const newValue = Data.clamp(value);
        await Relations.setFactionToFactionRel(source.id, party.id, newValue);
        const delta = newValue - oldValue;
        changes.push({ source: source.id, type: 'factionBaseRep', oldValue, newValue, delta });
        if (delta !== 0 && notification !== NOTIFICATION_MODES.NONE) {
          notifyAllPlayers(source.name, party.name, delta, null);
        }
      }
    }
    return buildResults(resolvedSources, resolvedTargets, changes);
  }

  for (const source of resolvedSources) {
    for (const target of resolvedTargets) {
      if (source.type === target.type && source.id === target.id) continue;
      const oldValue = await getRelation(source.type, source.id, target.type, target.id);
      const newValue = Data.clamp(value);
      await applyRelation(source.type, source.id, target.type, target.id, newValue);
      const delta = newValue - oldValue;
      changes.push({ source: source.id, target: target.id, relationType: getRelationType(source.type, target.type), oldValue, newValue, delta });
      
      if (delta !== 0 && shouldNotify(notification, source.type, source.id, target.type, target.id)) {
        if (_isActivePartyRelation(source, target)) {
          notifyAllPlayers(source.name, target.name, delta, source.type === 'actor' ? source.id : null);
        } else {
          const pcId = getTargetPcId(target.type, target.id);
          showRelationChangeNotification(source.name, target.name, delta, pcId, { sourceId: source.id, targetId: target.id, relationType: getRelationType(source.type, target.type) });
        }
      }

      if (bidirectional) {
        const reverseOld = await getRelation(target.type, target.id, source.type, source.id);
        const reverseNew = Data.clamp(value);
        await applyRelation(target.type, target.id, source.type, source.id, reverseNew);
        const reverseDelta = reverseNew - reverseOld;
        changes.push({ source: target.id, target: source.id, relationType: getRelationType(target.type, source.type), oldValue: reverseOld, newValue: reverseNew, delta: reverseDelta });
        
        if (reverseDelta !== 0 && shouldNotify(notification, target.type, target.id, source.type, source.id)) {
          if (_isActivePartyRelation(target, source)) {
            notifyAllPlayers(target.name, source.name, reverseDelta, target.type === 'actor' ? target.id : null);
          } else {
            const pcId = getTargetPcId(source.type, source.id);
            showRelationChangeNotification(target.name, source.name, reverseDelta, pcId, { sourceId: target.id, targetId: source.id, relationType: getRelationType(target.type, source.type) });
          }
        }
      }
    }
  }

  return buildResults(resolvedSources, resolvedTargets, changes);
}

export async function addRep(sources, targets, delta, options = {}) {
  const {
    notification = NOTIFICATION_MODES.DEFAULT,
    bidirectional = false,
    reason = '',
    addBaseRep = false
  } = options;

  const resolvedSources = resolveEntities(sources);
  const resolvedTargets = resolveEntities(targets);
  const changes = [];

  if (addBaseRep && resolvedTargets.length === 0) {
    for (const source of resolvedSources) {
      if (source.type === 'actor') {
        const { getActiveParty } = await import('./party.js');
        const party = getActiveParty();
        if (!party) {
          ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.remember.warn-no-party`));
          continue;
        }
        const oldValue = Relations.getActorFactionRel(source.id, party.id);
        const newValue = Data.clamp(oldValue + delta);
        await Relations.setActorFactionRel(source.id, party.id, newValue);
        const actualDelta = newValue - oldValue;
        changes.push({ source: source.id, type: 'partyRep', oldValue, newValue, delta: actualDelta });
        if (actualDelta !== 0 && notification !== NOTIFICATION_MODES.NONE) {
          notifyAllPlayers(source.name, party.name, actualDelta, source.id);
        }
      } else if (source.type === 'faction') {
        const { getActiveParty } = await import('./party.js');
        const party = getActiveParty();
        if (!party) {
          ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.remember.warn-no-party`));
          continue;
        }
        const oldValue = Relations.getFactionToFactionRel(source.id, party.id);
        const newValue = Data.clamp(oldValue + delta);
        await Relations.setFactionToFactionRel(source.id, party.id, newValue);
        const actualDelta = newValue - oldValue;
        changes.push({ source: source.id, type: 'factionBaseRep', oldValue, newValue, delta: actualDelta });
        if (actualDelta !== 0 && notification !== NOTIFICATION_MODES.NONE) {
          notifyAllPlayers(source.name, party.name, actualDelta, null);
        }
      }
    }
    return buildResults(resolvedSources, resolvedTargets, changes);
  }

  for (const source of resolvedSources) {
    for (const target of resolvedTargets) {
      if (source.type === target.type && source.id === target.id) continue;
      const oldValue = await getRelation(source.type, source.id, target.type, target.id);
      const newValue = Data.clamp(oldValue + delta);
      await applyRelation(source.type, source.id, target.type, target.id, newValue);
      const actualDelta = newValue - oldValue;
      changes.push({ source: source.id, target: target.id, relationType: getRelationType(source.type, target.type), oldValue, newValue, delta: actualDelta });
      
      if (actualDelta !== 0 && shouldNotify(notification, source.type, source.id, target.type, target.id)) {
        if (_isActivePartyRelation(source, target)) {
          notifyAllPlayers(source.name, target.name, actualDelta, source.type === 'actor' ? source.id : null);
        } else {
          const pcId = getTargetPcId(target.type, target.id);
          showRelationChangeNotification(source.name, target.name, actualDelta, pcId, { sourceId: source.id, targetId: target.id, relationType: getRelationType(source.type, target.type) });
        }
      }

      if (bidirectional) {
        const reverseOld = await getRelation(target.type, target.id, source.type, source.id);
        const reverseNew = Data.clamp(reverseOld + delta);
        await applyRelation(target.type, target.id, source.type, source.id, reverseNew);
        const reverseDelta = reverseNew - reverseOld;
        changes.push({ source: target.id, target: source.id, relationType: getRelationType(target.type, source.type), oldValue: reverseOld, newValue: reverseNew, delta: reverseDelta });
        
        if (reverseDelta !== 0 && shouldNotify(notification, target.type, target.id, source.type, source.id)) {
          if (_isActivePartyRelation(target, source)) {
            notifyAllPlayers(target.name, source.name, reverseDelta, target.type === 'actor' ? target.id : null);
          } else {
            const pcId = getTargetPcId(source.type, source.id);
            showRelationChangeNotification(target.name, source.name, reverseDelta, pcId, { sourceId: target.id, targetId: source.id, relationType: getRelationType(target.type, source.type) });
          }
        }
      }
    }
  }

  return buildResults(resolvedSources, resolvedTargets, changes);
}

function _isActivePartyRelation(source, target) {
  let partyId = null;
  try {
    const data = Data.getData();
    partyId = data.activePartyId;
  } catch { return false; }
  if (!partyId) return false;
  if (target.type === 'faction' && target.id === partyId) return true;
  if (source.type === 'faction' && source.id === partyId) return true;
  return false;
}

function shouldNotifyFactionToParty(sourceType, sourceId, targetType, targetId) {
  if (sourceType !== 'faction' || targetType !== 'faction') return false;
  
  const data = Data.getData();
  const partyId = data.activePartyId;
  if (!partyId) return false;
  
  if (targetId !== partyId) return false;
  if (Visibility.isHidden('faction', sourceId)) return false;
  if (Visibility.isRelationHidden('factionToFaction', sourceId, targetId)) return false;
  
  return true;
}

function notifyAllPlayers(sourceName, targetName, delta, sourceActorId) {
  const locKey = delta > 0 ? `${MODULE_ID}.remember.relation-improved` : `${MODULE_ID}.remember.relation-worsened`;
  const message = game.i18n.format(locKey, { source: sourceName, target: targetName });

  game.socket.emit(`module.${MODULE_ID}`, {
    type: "showNotification", message, delta
  });

  showNotification(message, delta);
}

export { getRep } from './reputation.js';