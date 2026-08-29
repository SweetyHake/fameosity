import { MODULE_ID } from '../constants.js';
import * as Data from '../data.js';
import * as Core from './index.js';
import { ReputationEvents } from '../events.js';
import { partyAttitude } from './reputation.js';

const PATCH_FLAG = '__fameosityDispositionPatch';

function _hexToInt(hex) {
  const n = parseInt(String(hex ?? '').replace('#', ''), 16);
  return Number.isFinite(n) ? n : 0x8a8a8a;
}

function _getReferenceActorId(selfId) {
  for (const token of (canvas?.tokens?.controlled || [])) {
    const actorId = token.document?.actorId || token.actor?.id;
    if (actorId && actorId !== selfId) return actorId;
  }
  return null;
}

export function isKnownToModule(actorId) {
  const data = Data.getData();
  if ((data.trackedActors || []).includes(actorId)) return true;
  if ((data.factions || []).some(f => (f.members || []).includes(actorId))) return true;
  if (data.individualRelations?.[actorId]) return true;
  if (data.actorFactionRelations?.[actorId]) return true;
  return false;
}

function _factionOf(actorId) {
  const faction = (Data.getData().factions || []).find(f => (f.members || []).includes(actorId));
  return faction?.id ?? null;
}

export function composedAttitude(npcId) {
  const data = Data.getData();
  const refId = _getReferenceActorId(npcId);

  if (refId) {
    const direct = data.individualRelations?.[npcId]?.[refId];
    if (direct !== undefined && direct !== 0) return direct;

    let resolved = null;
    const party = Core.getActiveParty();
    if (party && (party.members || []).includes(refId)) {
      resolved = partyAttitude(npcId, party.id);
    } else {
      const refFaction = _factionOf(refId);
      const npcFaction = _factionOf(npcId);
      if (refFaction && npcFaction && refFaction !== npcFaction) {
        const factionStance = data.factionToFactionRelations?.[npcFaction]?.[refFaction];
        if (factionStance !== undefined) resolved = factionStance;
      }
    }
    if (resolved !== null && resolved !== undefined) return resolved;
    return direct !== undefined ? direct : null;
  }

  const party = Core.getActiveParty();
  return party ? partyAttitude(npcId, party.id) : null;
}

function _overrideColor(token) {
  if (Data.getSettings().dynamicDispositionColors === false) return null;

  const D = CONST.TOKEN_DISPOSITIONS;
  if (token.document.disposition === D.SECRET) return null;

  const actor = token.actor;
  if (!actor) return null;
  const npcId = actor.id;
  if (!isKnownToModule(npcId)) return null;

  const refId = _getReferenceActorId(npcId);
  const refIsNpc = !!refId && !Core.isPlayerCharacter(refId);

  if (Core.isPlayerCharacter(npcId)) {
    if (!refIsNpc) return null;
    const data = Data.getData();
    const value = data.individualRelations?.[refId]?.[npcId]
      ?? data.individualRelations?.[npcId]?.[refId]
      ?? 0;
    const color = Data.getTier(value)?.color;
    return color ? _hexToInt(color) : null;
  }

  const value = composedAttitude(npcId);
  if (value === null || value === undefined) return null;

  const color = Data.getTier(value)?.color;
  return color ? _hexToInt(color) : null;
}

function _applyPatch() {
  const TokenClass = foundry.canvas?.placeables?.Token;
  if (!TokenClass?.prototype?.getDispositionColor) return;
  const proto = TokenClass.prototype;
  if (proto[PATCH_FLAG]) return;
  proto[PATCH_FLAG] = true;
  const original = proto.getDispositionColor;
  proto.getDispositionColor = function () {
    try {
      const override = _overrideColor(this);
      if (override !== null && override !== undefined) return override;
    } catch (err) {
      console.error(`${MODULE_ID} | Disposition color override failed:`, err);
    }
    return original.call(this);
  };
}

export function refreshDispositionBorders() {
  if (!canvas?.ready || !canvas.tokens) return;
  for (const token of canvas.tokens.placeables) {
    try {
      token.renderFlags?.set?.({ refreshBorder: true });
    } catch (err) {
      console.error(`${MODULE_ID} | Border refresh failed:`, err);
    }
  }
}

export function registerDispositionColors() {
  Hooks.on('canvasReady', () => {
    _applyPatch();
    refreshDispositionBorders();
  });

  if (canvas?.ready) {
    _applyPatch();
    refreshDispositionBorders();
  }

  Hooks.on('controlToken', refreshDispositionBorders);

  Hooks.on('updateToken', foundry.utils.debounce(refreshDispositionBorders, 100));

  Hooks.on('updateSetting', setting => {
    if (String(setting?.key ?? '').startsWith(`${MODULE_ID}.`)) {
      refreshDispositionBorders();
    }
  });

  ReputationEvents.on(ReputationEvents.EVENTS.DATA_CHANGED, refreshDispositionBorders);
  ReputationEvents.on(ReputationEvents.EVENTS.DATA_LOADED, refreshDispositionBorders);
}
