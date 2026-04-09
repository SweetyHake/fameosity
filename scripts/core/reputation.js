import * as Data from '../data.js';
import { ReputationEvents } from '../events.js';
import { getIndRel } from './relations.js';
import { getActorFactionRel } from './relations.js';
import { getFactionToFactionRel } from './relations.js';

export function getMode(id, type) {
  const data = Data.getData();
  const modes = data.modeFlags || {};
  const key = type === 'faction' ? 'factions' : 'actors';
  return modes[key]?.[id] || 'manual';
}

export async function setMode(id, type, mode) {
  const data = Data.getData();
  data.modeFlags ??= { actors: {}, factions: {} };
  const key = type === 'faction' ? 'factions' : 'actors';
  data.modeFlags[key] ??= {};

  if (mode === 'manual') {
    delete data.modeFlags[key][id];
  } else {
    data.modeFlags[key][id] = mode;
  }

  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.AUTO_CHANGED, { id, type, mode });
}

export function getRep(id, type) {
  const mode = getMode(id, type);

  switch (mode) {
    case 'auto':
      return type === 'actor' ? _calcAutoActor(id) : _calcAutoFaction(id);
    case 'hybrid':
      return type === 'actor' ? _calcHybridActor(id) : _calcHybridFaction(id);
    default:
      return type === 'actor' ? _getManualActor(id) : _getManualFaction(id);
  }
}

function _getParty() {
  const data = Data.getData();
  const partyId = data.activePartyId;
  if (!partyId) return null;
  return (data.factions || []).find(f => f.id === partyId && f.factionType === 'group') || null;
}

function _getPartyMembers(excludeId = null) {
  const party = _getParty();
  if (!party) return [];
  return (party.members || []).filter(id => id !== excludeId);
}

function _getManualActor(actorId) {
  const party = _getParty();
  if (!party) return 0;
  return getActorFactionRel(actorId, party.id);
}

function _getManualFaction(factionId) {
  const party = _getParty();
  if (!party) return 0;
  return getFactionToFactionRel(factionId, party.id);
}

function _calcAutoActor(actorId) {
  const members = _getPartyMembers(actorId);
  if (!members.length) return 0;
  const sum = members.reduce((acc, memberId) => acc + getIndRel(actorId, memberId), 0);
  return Math.round(sum / members.length);
}

function _calcAutoFaction(factionId) {
  const data = Data.getData();
  const faction = (data.factions || []).find(f => f.id === factionId);
  if (!faction?.members?.length) return 0;

  const tracked = data.trackedActors || [];
  let totalWeight = 0;
  let weightedSum = 0;

  for (const memberId of faction.members) {
    if (!tracked.includes(memberId)) continue;
    const memberRep = getRep(memberId, 'actor');
    const rank = _getRankMultiplier(faction, memberId);
    weightedSum += memberRep * rank;
    totalWeight += rank;
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

function _calcHybridActor(actorId) {
  const base = _getManualActor(actorId);
  const bonus = _calcHybridBonus(actorId);
  return Data.clamp(base + bonus);
}

function _calcHybridFaction(factionId) {
  const base = _getManualFaction(factionId);
  const autoRep = _calcAutoFaction(factionId);
  const { max, min } = Data.getLimits();
  const maxBonus = Math.round((max - min) * 0.25);
  const diff = autoRep - base;
  const bonus = Math.round(Math.max(-maxBonus, Math.min(maxBonus, diff * 0.5)));
  return Data.clamp(base + bonus);
}

function _calcHybridBonus(actorId) {
  const members = _getPartyMembers(actorId);
  if (!members.length) return 0;

  const base = _getManualActor(actorId);
  const sum = members.reduce((acc, memberId) => acc + getIndRel(actorId, memberId), 0);
  const avg = sum / members.length;

  const { max, min } = Data.getLimits();
  const maxBonus = Math.round((max - min) * 0.25);
  const diff = avg - base;
  return Math.round(Math.max(-maxBonus, Math.min(maxBonus, diff * 0.5)));
}

function _getRankMultiplier(faction, actorId) {
  if (!faction.ranks?.length) return 1;
  const rankId = faction.memberRanks?.[actorId];
  if (!rankId) return 1;
  const rank = faction.ranks.find(r => r.id === rankId);
  return rank?.multiplier ?? 1;
}