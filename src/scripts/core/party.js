import { MODULE_ID } from '../constants.js';
import * as Data from '../data.js';
import { ReputationEvents } from '../events.js';
import * as Factions from './factions.js';
import * as Actors from './actors.js';

export function getActivePartyId() {
  return Data.getData().activePartyId || null;
}

export function getActiveParty() {
  const partyId = getActivePartyId();
  if (!partyId) return null;
  const factions = Factions.getFactions();
  return factions.find(f => f.id === partyId && f.factionType === 'group') || null;
}

export async function setActiveParty(factionId) {
  const data = Data.getData();
  
  if (factionId) {
    const faction = Factions.getFactions().find(f => f.id === factionId);
    if (!faction || faction.factionType !== 'group') {
      console.warn(`${MODULE_ID} | Cannot set non-group faction as active party`);
      return false;
    }
  }
  
  data.activePartyId = factionId || null;
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.FACTION_CHANGED, { activePartyId: factionId });
  return true;
}

export function isActiveParty(factionId) {
  return getActivePartyId() === factionId;
}

export async function activateParty(factionId) {
  await setActiveParty(factionId);
}

export async function ensureActiveParty() {
  const activeParty = getActiveParty();
  if (activeParty) return activeParty;
  
  const factions = Factions.getFactions();
  const existingGroup = factions.find(f => f.factionType === 'group' && (f.members || []).length > 0);
  
  if (existingGroup) {
    await setActiveParty(existingGroup.id);
    return existingGroup;
  }
  
  const pcs = Actors.getPCs();
  if (pcs.length === 0) return null;
  
  const newParty = await Factions.addFaction({
    name: game.i18n.localize(`${MODULE_ID}.party.default-name`),
    factionType: 'group',
    image: 'icons/svg/combat.svg'
  });
  
  for (const pc of pcs) {
    await Factions.addFactionMember(newParty.id, pc.id);
  }
  
  await setActiveParty(newParty.id);
  
  return Factions.getFactions().find(f => f.id === newParty.id);
}

export function getPartyReputation(factionId) {
  const party = getActiveParty();
  if (!party) return null;
  
  const data = Data.getData();
  return data.factionRelations?.[factionId]?.[party.id] ?? 0;
}

export async function setPartyReputation(factionId, value) {
  const party = getActiveParty();
  if (!party) return;
  
  const data = Data.getData();
  data.factionRelations ??= {};
  data.factionRelations[factionId] ??= {};
  data.factionRelations[factionId][party.id] = Data.clamp(value);
  await Data.setData(data);
  
  ReputationEvents.emit(ReputationEvents.EVENTS.RELATION_CHANGED, {
    factionId,
    partyId: party.id,
    newValue: data.factionRelations[factionId][party.id],
    type: 'party'
  });
}

export async function addPartyReputation(factionId, delta) {
  const current = getPartyReputation(factionId) ?? 0;
  await setPartyReputation(factionId, current + delta);
}