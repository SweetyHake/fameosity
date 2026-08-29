import { MODULE_ID } from '../constants.js';
import * as Data from '../data.js';
import * as Core from './index.js';
import { composedAttitude, isKnownToModule } from './disposition-colors.js';
import { getDisplayName } from './actors.js';

function _barHtml(value) {
  const { min, max } = Data.getLimits();
  const range = (max - min) || 1;
  const pct = Math.max(0, Math.min(1, (value - min) / range));
  const left = Math.min(50, pct * 100);
  const width = Math.abs(pct * 100 - 50);
  const color = Data.getTier(value)?.color || '#8a8a8a';
  return `<div class="fame-token-hud-bar"><span class="zero"></span><span class="fill" style="left:${left}%;width:${width}%;background:${color}"></span></div>`;
}

function _personalTargetId(npcId) {
  for (const token of (canvas?.tokens?.controlled || [])) {
    const actorId = token.document?.actorId || token.actor?.id;
    if (actorId && actorId !== npcId && token.actor) return actorId;
  }
  return null;
}

function _escapeAttr(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function _tip(key, args = {}) {
  return _escapeAttr(game.i18n.format(`${MODULE_ID}.tooltips.${key}`, args));
}

const FameTokenHudMixin = (BaseHUD) => class FameTokenHud extends BaseHUD {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    actions: {
      fameOpenRelations: function () {
        this.#openRelations();
      },
      famePartyRep: function (event, target) {
        const base = +target.dataset.delta || 0;
        this.#applyPartyRep(base * (event.ctrlKey ? 5 : 1));
      },
      famePersonalRel: function (event, target) {
        const base = +target.dataset.delta || 0;
        this.#applyPersonalRel(base * (event.ctrlKey ? 5 : 1));
      }
    }
  }, { inplace: false });

  async _renderHTML(context, options) {
    const result = await super._renderHTML(context, options);
    try {
      const root = result?.hud ?? this.element ?? null;
      if (root) this.#inject(root);
    } catch (err) {
      console.error(`${MODULE_ID} | TokenHUD injection failed:`, err);
    }
    return result;
  }

  #inject(hud) {
    hud.querySelector('.fame-token-hud')?.remove();

    if (!game.user.isGM) return;
    if (!Data.getSettings().enabled) {
      console.log(`${MODULE_ID} | HUD skip: system disabled`);
      return;
    }

    const actor = this.object?.actor;
    if (!actor) {
      console.log(`${MODULE_ID} | HUD skip: no actor bound`);
      return;
    }

    const activeParty = Core.getActiveParty();
    if (activeParty && (activeParty.members || []).includes(actor.id)) return;

    let value = null;
    try {
      value = composedAttitude(actor.id);
      if (!Core.isPlayerCharacter(actor.id) && !isKnownToModule(actor.id)) value = null;
    } catch (err) {
      console.error(`${MODULE_ID} | Attitude cascade failed:`, err);
    }

    const el = document.createElement('div');
    el.className = 'fame-token-hud';

    let html = '';
    if (value !== null && value !== undefined) html += _barHtml(value);

    html += '<div class="fame-hud-row">';
    const party = Core.getActiveParty();
    if (party) {
      html += `<button type="button" class="control-icon" data-action="famePartyRep" data-delta="-1" data-tooltip-text="${_tip('hud-rep-dec', { party: party.name })}"><i class="fa-solid fa-minus" inert></i></button>`;
      html += `<button type="button" class="control-icon fame-hud-open" data-action="fameOpenRelations" data-tooltip-text="${_tip('hud-open-relations')}"><i class="fa-solid fa-users" inert></i></button>`;
      html += `<button type="button" class="control-icon" data-action="famePartyRep" data-delta="1" data-tooltip-text="${_tip('hud-rep-inc', { party: party.name })}"><i class="fa-solid fa-plus" inert></i></button>`;
    }
    html += '</div>';

    const personalId = _personalTargetId(actor.id);
    if (personalId) {
      const name = getDisplayName(personalId);
      html += '<div class="fame-hud-row personal">';
      html += `<button type="button" class="control-icon" data-action="famePersonalRel" data-delta="-1" data-tooltip-text="${_tip('hud-personal-dec', { name })}"><i class="fa-solid fa-minus" inert></i></button>`;
      html += `<i class="fa-solid fa-arrow-right-long fame-hud-mark" data-tooltip-text="${_tip('hud-personal-target', { name })}"></i>`;
      html += `<button type="button" class="control-icon" data-action="famePersonalRel" data-delta="1" data-tooltip-text="${_tip('hud-personal-inc', { name })}"><i class="fa-solid fa-plus" inert></i></button>`;
      html += '</div>';
    }

    el.innerHTML = html;
    hud.appendChild(el);
  }

  async #applyPartyRep(delta) {
    const npcId = this.object?.actor?.id;
    const party = Core.getActiveParty();
    if (!npcId || !party) {
      ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.remember.warn-no-party`));
      return;
    }
    await Core.addRep(npcId, { type: 'faction', id: party.id }, delta);
    this.render();
  }

  async #applyPersonalRel(delta) {
    const npcId = this.object?.actor?.id;
    const pcId = _personalTargetId(npcId);
    if (!npcId || !pcId) return;
    await Core.addRep(npcId, pcId, delta);
    this.render();
  }

  async #openRelations() {
    const actorId = this.object?.actor?.id;
    if (!actorId) return;
    const actor = game.actors.get(actorId);
    if (actor && !Core.getTracked().includes(actorId)) {
      if (!actor.hasPlayerOwner) Core.ensureImportant(actor);
      await Core.addTracked(actorId);
    }
    const { RelationsViewerApp } = await import('../apps/RelationsViewerApp.js');
    const app = new RelationsViewerApp();
    app.selectedType = 'actor';
    app.selectedId = actorId;
    app.render(true);
  }
};


export function registerTokenHudIntegration() {
  try {
    let current = CONFIG.Token.hudClass;
    Object.defineProperty(CONFIG.Token, 'hudClass', {
      configurable: true,
      enumerable: true,
      get: () => current,
      set(v) {
        const origin = (new Error().stack || '').split('\n')[2]?.trim() ?? 'unknown';
        console.log(`${MODULE_ID} | hudClass <- ${v?.name || '(anonymous)'} | by: ${origin}`);
        current = v;
      }
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not trap CONFIG.Token.hudClass:`, err);
  }
  CONFIG.Token.hudClass = FameTokenHudMixin(CONFIG.Token.hudClass);
  console.log(`${MODULE_ID} | TokenHUD integration registered on`, CONFIG.Token.hudClass.name);
}
