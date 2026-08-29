import { ReputationEvents } from '../events.js';
import { getData, setData } from './cache.js';

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
      for (const relType of ['individual', 'faction', 'actorFaction', 'factionToFaction']) {
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
