import { MODULE_ID } from '../constants.js';
import * as Data from '../data.js';
import { ReputationEvents } from '../events.js';

export { getValidChildFactionTypes } from './tree.js';

export function getFactions() {
  return Data.getData().factions || [];
}

export function getFaction(factionId) {
  return getFactions().find(f => f.id === factionId) || null;
}

export async function setFactions(factions) {
  const data = Data.getData();
  data.factions = factions;
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.FACTION_CHANGED, { factions });
}

export async function addFaction(factionData) {
  const settings = Data.getSettings();
  const factions = getFactions();
  const newFaction = {
    id: foundry.utils.randomID(),
    name: factionData.name || game.i18n.localize(`${MODULE_ID}.factions.new-faction`),
    image: factionData.image || "icons/svg/mystery-man.svg",
    factionType: factionData.factionType || 'group',
    customTypeName: factionData.customTypeName || "",
    parentId: factionData.parentId || null,
    reputation: factionData.reputation ?? 0,
    members: factionData.members || [],
    ranks: factionData.ranks || [],
    memberRanks: factionData.memberRanks || {}
  };
  factions.push(newFaction);
  await setFactions(factions);
  const { setMode } = await import('./reputation.js');
  await setMode(newFaction.id, 'faction', settings.defaultFactionMode || 'manual');
  return newFaction;
}

export async function updateFaction(factionId, updates) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction) return null;
  Object.assign(faction, updates);
  await setFactions(factions);
  return faction;
}

export async function deleteFaction(factionId) {
  const factions = getFactions();
  const index = factions.findIndex(f => f.id === factionId);
  if (index > -1) {
    factions.splice(index, 1);
    Data.cleanupEntityData('faction', factionId);
    await setFactions(factions);
    return true;
  }
  return false;
}

export async function setFactionParent(factionId, parentId) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction) return false;
  faction.parentId = parentId || null;
  await setFactions(factions);
  return true;
}

export async function addFactionMember(factionId, actorId) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction) return false;
  faction.members ??= [];
  if (!faction.members.includes(actorId)) {
    faction.members.push(actorId);
    await setFactions(factions);
    ReputationEvents.emit(ReputationEvents.EVENTS.MEMBER_CHANGED, { factionId, actorId, added: true });
    return true;
  }
  return false;
}

export async function removeFactionMember(factionId, actorId) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction?.members) return false;
  const index = faction.members.indexOf(actorId);
  if (index > -1) {
    faction.members.splice(index, 1);
    if (faction.memberRanks?.[actorId]) delete faction.memberRanks[actorId];
    await setFactions(factions);
    ReputationEvents.emit(ReputationEvents.EVENTS.MEMBER_CHANGED, { factionId, actorId, removed: true });
    return true;
  }
  return false;
}

export function getFactionRep(factionId) {
  const data = Data.getData();
  const partyId = data.activePartyId;
  if (!partyId) return 0;
  return data.factionToFactionRelations?.[factionId]?.[partyId] ?? 0;
}

let _repModule = null;
function _getRepModule() {
  if (!_repModule) {
    _repModule = { getRep: null, getMode: null };
    import('./reputation.js').then(m => {
      _repModule.getRep = m.getRep;
      _repModule.getMode = m.getMode;
    });
  }
  if (!_repModule.getRep) {
    const data = Data.getData();
    const partyId = data.activePartyId;
    return {
      getRep: (id, type) => {
        if (!partyId) return 0;
        return data.factionToFactionRelations?.[id]?.[partyId] ?? 0;
      },
      getMode: () => 'manual'
    };
  }
  return _repModule;
}

export async function setFactionRep(factionId, value) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction) return;
  faction.reputation = Data.clamp(value);
  await setFactions(factions);
}

export function getFactionRank(factionId, actorId) {
  const faction = getFaction(factionId);
  if (!faction?.ranks?.length) return null;
  const manualRankId = faction.memberRanks?.[actorId];
  if (!manualRankId) return null;
  return faction.ranks.find(r => r.id === manualRankId) || null;
}

export async function setMemberRank(factionId, actorId, rankId) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction) return;
  faction.memberRanks ??= {};
  if (rankId === null || rankId === '') {
    delete faction.memberRanks[actorId];
  } else {
    faction.memberRanks[actorId] = rankId;
  }
  await setFactions(factions);
  ReputationEvents.emit(ReputationEvents.EVENTS.RANK_CHANGED, { factionId, actorId, rankId });
}

export async function addFactionRank(factionId, rankData) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction) return null;
  faction.ranks ??= [];
  const newRank = {
    id: foundry.utils.randomID(),
    name: rankData.name || game.i18n.localize(`${MODULE_ID}.ranks.new-rank`),
    minReputation: rankData.minReputation ?? 0,
    color: rankData.color || "#6a6a6a",
    multiplier: rankData.multiplier ?? 1
  };
  faction.ranks.push(newRank);
  await setFactions(factions);
  ReputationEvents.emit(ReputationEvents.EVENTS.RANK_CHANGED, { factionId, rank: newRank });
  return newRank;
}

export async function updateFactionRank(factionId, rankId, updates) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction) return null;
  const rank = faction.ranks?.find(r => r.id === rankId);
  if (!rank) return null;
  Object.assign(rank, updates);
  await setFactions(factions);
  ReputationEvents.emit(ReputationEvents.EVENTS.RANK_CHANGED, { factionId, rankId, updates });
  return rank;
}

export async function removeFactionRank(factionId, rankId) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction?.ranks) return false;
  const index = faction.ranks.findIndex(r => r.id === rankId);
  if (index === -1) return false;
  faction.ranks.splice(index, 1);
  if (faction.memberRanks) {
    for (const actorId in faction.memberRanks) {
      if (faction.memberRanks[actorId] === rankId) delete faction.memberRanks[actorId];
    }
  }
  await setFactions(factions);
  ReputationEvents.emit(ReputationEvents.EVENTS.RANK_CHANGED, { factionId, rankId, removed: true });
  return true;
}

export async function reorderFactionRanks(factionId, rankIds) {
  const factions = getFactions();
  const faction = factions.find(f => f.id === factionId);
  if (!faction?.ranks) return;
  const reordered = [];
  for (const id of rankIds) {
    const rank = faction.ranks.find(r => r.id === id);
    if (rank) reordered.push(rank);
  }
  faction.ranks = reordered;
  await setFactions(factions);
  ReputationEvents.emit(ReputationEvents.EVENTS.RANK_CHANGED, { factionId, reordered: true });
}