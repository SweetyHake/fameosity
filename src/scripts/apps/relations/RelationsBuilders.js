import { MODULE_ID } from '../../constants.js';
import * as Data from '../../data.js';
import * as Core from '../../core/index.js';
import { getRep, getMode } from '../../core/reputation.js';

const LOCATION_TYPES = [
  { id: 'continent', icon: 'fa-globe' },
  { id: 'country', icon: 'fa-flag' },
  { id: 'settlement', icon: 'fa-city' },
  { id: 'poi', icon: 'fa-map-pin' }
];

const FACTION_TYPES = [
  { id: 'organization', icon: 'fa-landmark' },
  { id: 'group', icon: 'fa-users' }
];

export { LOCATION_TYPES, FACTION_TYPES };

export function getLocationTypeInfo(locationType, customTypeName) {
  const type = LOCATION_TYPES.find(t => t.id === locationType) || LOCATION_TYPES[3];
  return {
    type: locationType || 'poi',
    icon: type.icon,
    name: customTypeName || game.i18n.localize(`${MODULE_ID}.types.location.${type.id}`)
  };
}

export function getFactionTypeInfo(factionType, customTypeName) {
  const type = FACTION_TYPES.find(t => t.id === factionType) || FACTION_TYPES[1];
  return {
    type: factionType || 'group',
    icon: type.icon,
    name: customTypeName || game.i18n.localize(`${MODULE_ID}.types.faction.${type.id}`)
  };
}

export function canEditActor(actorId) {
  if (game.user.isGM) return true;
  const actor = game.actors.get(actorId);
  return actor?.isOwner ?? false;
}

export function canOpenSheet(actorId) {
  const actor = game.actors.get(actorId);
  return actor?.isOwner ?? false;
}

export function buildActorData(id, min, max, pcs, rawFactions) {
  const actor = game.actors.get(id);
  if (!actor) return null;

  const mode = getMode(id, 'actor');
  const reputation = getRep(id, 'actor');
  const tier = Data.getTier(reputation);
  const hidden = Core.isHidden('actor', id);
  const description = Data.getDescription('actors', id);
  const isPC = Core.isPlayerCharacter(id);

  const activeParty = Core.getActiveParty();
  const activePartyMembers = activeParty ? new Set(activeParty.members || []) : null;
  const isActivePartyMember = activePartyMembers ? activePartyMembers.has(id) : false;

  let partyReputation = null;
  let partyTier = null;
  let hasActiveParty = !!activeParty;

  if (activeParty && !isActivePartyMember) {
    partyReputation = getRep(id, 'actor');
    partyTier = Data.getTier(partyReputation);
  }

  const pcRelations = [];
  const npcRelations = [];
  const allTracked = Core.getTracked();
  const data = Data.getData();
  const indRels = data.individualRelations || {};

  for (const targetId of allTracked) {
    if (targetId === id) continue;
    if (Core.isHidden('actor', targetId)) continue;
    const targetActor = game.actors.get(targetId);
    if (!targetActor) continue;

    const targetIsPC = Core.isPlayerCharacter(targetId);
    const isTargetPartyMember = activePartyMembers ? activePartyMembers.has(targetId) : targetIsPC;

    const value = Core.getIndRel(id, targetId);
    const relationExists = indRels[id]?.[targetId] !== undefined;
    
    if (isTargetPartyMember) {
      const targetOwnerOnline = _isActorOwnerOnline(targetActor);
      pcRelations.push({
        pcId: targetId,
        pcName: Core.getDisplayName(targetId),
        pcImg: targetActor.img,
        value,
        tier: Data.getTier(value),
        hidden: Core.isRelationHidden('individual', id, targetId),
        isPC: targetIsPC,
        online: targetOwnerOnline
      });
    } else {
      const relHidden = Core.isRelationHidden('individual', id, targetId);
      if (!relationExists && !relHidden) continue;
      
      const targetOwnerOnline = _isActorOwnerOnline(targetActor);
      npcRelations.push({
        pcId: targetId,
        pcName: Core.getDisplayName(targetId),
        pcImg: targetActor.img,
        value,
        tier: Data.getTier(value),
        hidden: relHidden,
        isPC: targetIsPC,
        online: targetOwnerOnline
      });
    }
  }

  pcRelations.sort((a, b) => a.pcName.localeCompare(b.pcName));
  npcRelations.sort((a, b) => a.pcName.localeCompare(b.pcName));

  const actorFacRels = data.actorFactionRelations || {};

  const factionRelations = rawFactions.map(faction => {
    const value = Core.getActorFactionRel(id, faction.id);
    const isMember = (faction.members || []).includes(id);
    const relHidden = Core.isRelationHidden('actorFaction', id, faction.id);
    const relationExists = actorFacRels[id]?.[faction.id] !== undefined;
    
    if (!relationExists && !isMember && !relHidden) return null;
    
    return {
      factionId: faction.id, factionName: faction.name, factionImg: faction.image,
      value, tier: Data.getTier(value), isMember,
      memberHidden: Core.isMemberHidden(faction.id, id),
      rank: isMember ? Core.getFactionRank(faction.id, id) : null,
      hidden: relHidden,
      factionHidden: Core.isHidden('faction', faction.id)
    };
  }).filter(Boolean);

  factionRelations.sort((a, b) => a.factionName.localeCompare(b.factionName));

  return {
    id, name: Core.getDisplayName(id), originalName: actor.name,
    customName: Core.getCustomName(id), img: actor.img,
    reputation, mode, tier, hidden, description,
    canEdit: canEditActor(id), isPC, isActivePartyMember,
    partyReputation, partyTier, hasActiveParty,
    activePartyName: activeParty?.name || null,
    relations: [...pcRelations, ...npcRelations],
    playerRelations: pcRelations, npcRelations, factionRelations
  };
}

function _isActorOwnerOnline(actor) {
  if (!actor) return false;
  return Object.entries(actor.ownership || {}).some(([userId, level]) => {
    if (userId === 'default') return false;
    const user = game.users.get(userId);
    return user && !user.isGM && level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && user.active;
  });
}

export function buildFactionData(faction, pcs, min, max, isGM) {
  const mode = getMode(faction.id, 'faction');
  const reputation = getRep(faction.id, 'faction');
  const tier = Data.getTier(reputation);
  const hidden = Core.isHidden('faction', faction.id);
  const typeInfo = getFactionTypeInfo(faction.factionType, faction.customTypeName);
  const description = Data.getDescription('factions', faction.id);
  const isPartyActive = Core.isActiveParty(faction.id);
  const isGroup = faction.factionType === 'group';

  const activeParty = Core.getActiveParty();
  const activePartyMembers = activeParty ? new Set(activeParty.members || []) : null;
  let partyReputation = null;
  let partyTier = null;
  let hasActiveParty = !!activeParty;

  if (activeParty && !isPartyActive) {
    partyReputation = getRep(faction.id, 'faction');
    partyTier = Data.getTier(partyReputation);
  }

  const memberSet = new Set(faction.members || []);

  const pcRels = [];
  const npcRels = [];
  const allTracked = Core.getTracked();
  const data = Data.getData();
  const facRels = data.factionRelations || {};

  for (const targetId of allTracked) {
    if (memberSet.has(targetId)) continue;
    if (Core.isHidden('actor', targetId)) continue;
    const targetActor = game.actors.get(targetId);
    if (!targetActor) continue;

    const value = Core.getFactionRel(faction.id, targetId);
    const targetIsPC = Core.isPlayerCharacter(targetId);
    const isActiveMember = activePartyMembers ? activePartyMembers.has(targetId) : targetIsPC;
    const relationExists = facRels[faction.id]?.[targetId] !== undefined;
    
    if (isActiveMember) {
      pcRels.push({
        pcId: targetId, pcName: Core.getDisplayName(targetId), pcImg: targetActor.img,
        value, tier: Data.getTier(value),
        hidden: Core.isRelationHidden('faction', faction.id, targetId),
        isPC: targetIsPC
      });
    } else {
      const relHidden = Core.isRelationHidden('faction', faction.id, targetId);
      if (!relationExists && !relHidden) continue;
      
      npcRels.push({
        pcId: targetId, pcName: Core.getDisplayName(targetId), pcImg: targetActor.img,
        value, tier: Data.getTier(value),
        hidden: relHidden,
        isPC: targetIsPC
      });
    }
  }

  pcRels.sort((a, b) => a.pcName.localeCompare(b.pcName));
  npcRels.sort((a, b) => a.pcName.localeCompare(b.pcName));

  const allFactions = Core.getFactions();
  const facToFacRels = data.factionToFactionRelations || {};
  
  const factionToFactionRels = allFactions
    .filter(f => f.id !== faction.id)
    .map(f => {
      const value = Core.getFactionToFactionRel(faction.id, f.id);
      const relHidden = Core.isRelationHidden('factionToFaction', faction.id, f.id);
      const relationExists = facToFacRels[faction.id]?.[f.id] !== undefined;
      
      if (!relationExists && !relHidden) return null;
      
      return {
        targetFactionId: f.id, targetFactionName: f.name,
        targetFactionImg: f.image || 'icons/svg/mystery-man.svg',
        value, tier: Data.getTier(value),
        hidden: relHidden,
        targetHidden: Core.isHidden('faction', f.id)
      };
    }).filter(Boolean);

  factionToFactionRels.sort((a, b) => a.targetFactionName.localeCompare(b.targetFactionName));

  const partyId = Core.getActivePartyId();

  const members = (faction.members || []).map(id => {
    if (Core.isHidden('actor', id)) return null;
    const actor = game.actors.get(id);
    if (!actor) return null;
    const memberRep = partyId ? Core.getActorFactionRel(id, partyId) : 0;
    return {
      id, name: Core.getDisplayName(id), img: actor.img,
      rank: Core.getFactionRank(faction.id, id),
      manualRankId: faction.memberRanks?.[id] || null,
      hidden: Core.isMemberHidden(faction.id, id),
      actorHidden: false,
      sourceName: null, sourceFactionId: faction.id,
      tier: Data.getTier(memberRep)
    };
  }).filter(Boolean);

  if (faction.factionType === 'organization') {
    const descendantGroups = _getDescendantFactions(allFactions, faction.id);
    const existingMemberIds = new Set(members.map(m => m.id));
    for (const childFac of descendantGroups) {
      for (const childMemberId of (childFac.members || [])) {
        if (existingMemberIds.has(childMemberId)) continue;
        if (Core.isHidden('actor', childMemberId)) continue;
        const actor = game.actors.get(childMemberId);
        if (!actor) continue;
        existingMemberIds.add(childMemberId);
        const memberRep = partyId ? Core.getActorFactionRel(childMemberId, partyId) : 0;
        members.push({
          id: childMemberId, name: Core.getDisplayName(childMemberId), img: actor.img,
          rank: Core.getFactionRank(childFac.id, childMemberId),
          manualRankId: childFac.memberRanks?.[childMemberId] || null,
          hidden: Core.isMemberHidden(childFac.id, childMemberId),
          actorHidden: false,
          sourceName: childFac.name, sourceFactionId: childFac.id,
          tier: Data.getTier(memberRep)
        });
      }
    }
  }

  members.sort((a, b) => a.name.localeCompare(b.name));

  return {
    ...faction, reputation, mode, tier, members, hidden, typeInfo, description,
    partyReputation, partyTier, hasActiveParty,
    activePartyName: activeParty?.name || null,
    factionRels: [...pcRels, ...npcRels],
    factionPcRels: pcRels, factionNpcRels: npcRels,
    factionToFactionRels,
    hasRanks: (faction.ranks || []).length > 0,
    isPartyActive, isGroup
  };
}

function _getDescendantFactions(allFactions, parentId) {
  const result = [];
  const children = allFactions.filter(f => f.parentId === parentId);
  for (const child of children) {
    result.push(child);
    result.push(..._getDescendantFactions(allFactions, child.id));
  }
  return result;
}

export function buildLocationData(loc, allFactions, allActors, isGM) {
  const hidden = Core.isHidden('location', loc.id);
  const typeInfo = getLocationTypeInfo(loc.locationType, loc.customTypeName);
  const description = Data.getDescription('locations', loc.id);

  let controlledByFaction = null;
  if (loc.controlledBy) {
    const fac = allFactions.find(f => f.id === loc.controlledBy);
    if (fac) {
      controlledByFaction = { id: fac.id, name: fac.name, image: fac.image || 'icons/svg/mystery-man.svg' };
    }
  }

  const factionsList = (loc.factions || []).map(fId => {
    const faction = allFactions.find(f => f.id === fId);
    if (!faction) return null;
    return { ...faction, locItemHidden: Core.isLocationItemHidden(loc.id, 'faction', fId), sourceName: null, sourceLocationId: loc.id };
  }).filter(Boolean);

  const actorsList = (loc.actors || []).map(aId => {
    const tracked = allActors.find(a => a.id === aId);
    const locItemHidden = Core.isLocationItemHidden(loc.id, 'actor', aId);
    if (tracked) return { ...tracked, isTracked: true, locItemHidden, sourceName: null, sourceLocationId: loc.id };
    const actor = game.actors.get(aId);
    if (!actor) return null;
    const rep = Core.getActorFactionRel(aId, Core.getActivePartyId());
    return {
      id: aId, name: Core.getDisplayName(aId), img: actor.img,
      isTracked: false, locItemHidden, hidden: Core.isHidden('actor', aId),
      sourceName: null, sourceLocationId: loc.id,
      isPC: Core.isPlayerCharacter(aId),
      tier: Data.getTier(rep)
    };
  }).filter(Boolean);

  const allLocs = Core.getLocations();
  const ancestors = Core.getAncestorLocations(allLocs, loc.id);

  for (const parentLoc of ancestors) {
    const parentName = parentLoc.name;
    for (const fId of (parentLoc.factions || [])) {
      if (factionsList.some(f => f.id === fId)) continue;
      const faction = allFactions.find(f => f.id === fId);
      if (!faction) continue;
      factionsList.push({ ...faction, locItemHidden: Core.isLocationItemHidden(parentLoc.id, 'faction', fId), sourceName: parentName, sourceLocationId: parentLoc.id });
    }
  }

  factionsList.sort((a, b) => a.name.localeCompare(b.name));
  actorsList.sort((a, b) => a.name.localeCompare(b.name));

  return {
    ...loc, factionsList, actorsList,
    factionCount: factionsList.length, actorCount: actorsList.length,
    hidden, typeInfo, description, controlledByFaction
  };
}

export function buildDetail(app, type, id, allLocations, allFactions, allActors) {
  if (type === 'location') {
    const loc = allLocations.find(l => l.id === id);
    if (!loc) return null;
    const validChildren = Core.getValidChildLocationTypes(loc.locationType || loc.typeInfo?.type);
    return { ...loc, entityType: 'location', canAddChild: validChildren.length > 0 };
  }
  if (type === 'faction') {
    const fac = allFactions.find(f => f.id === id);
    if (!fac) return null;
    const validChildren = Core.getValidChildFactionTypes(fac.factionType || fac.typeInfo?.type);
    return { ...fac, entityType: 'faction', canAddChild: validChildren.length > 0, image: fac.image || 'icons/svg/mystery-man.svg' };
  }
  if (type === 'actor') {
    const act = allActors.find(a => a.id === id);
    if (!act) return null;
    return { ...act, entityType: 'actor', canOpenSheet: canOpenSheet(id) };
  }
  return null;
}