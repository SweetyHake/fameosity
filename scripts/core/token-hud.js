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

// does the element itself paint anything (background/border/shadow/text/glyph)?
// layout containers like the HUD columns must not count as obstacles
function _paints(el) {
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  const tag = el.tagName.toUpperCase();
  if (['IMG', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SVG'].includes(tag)) return true;
  if (!el.firstElementChild) {
    if (el.textContent.trim()) return true;
    // font icons and other pseudo-element glyphs
    if (getComputedStyle(el, '::before').content !== 'none') return true;
    if (getComputedStyle(el, '::after').content !== 'none') return true;
  }
  const bg = style.backgroundColor;
  if (bg && bg !== 'transparent' && !/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(bg)) return true;
  if (style.boxShadow !== 'none') return true;
  const sides = ['Top', 'Right', 'Bottom', 'Left'];
  const borderWidth = sides.reduce((sum, side) => sum + (parseFloat(style[`border${side}Width`]) || 0), 0);
  const bordered = sides.some(side => style[`border${side}Style`] !== 'none');
  return borderWidth > 0 && bordered;
}

const FameTokenHudMixin = (BaseHUD) => class FameTokenHud extends BaseHUD {
  #mutationObserver = null;
  #resizeObserver = null;
  #observedForm = null;
  #repositionQueued = false;

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
    const settings = Data.getSettings();
    if (!settings.enabled) {
      console.log(`${MODULE_ID} | HUD skip: system disabled`);
      return;
    }
    if (!settings.tokenHud) {
      console.log(`${MODULE_ID} | HUD skip: token HUD disabled by setting`);
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
    this.#scheduleReposition();
  }

  // foreign panels land in the HUD after our _renderHTML (renderTokenHUD hooks), so
  // position passes must run post-mount and re-run whenever the HUD content changes
  #scheduleReposition() {
    if (this.#repositionQueued) return;
    this.#repositionQueued = true;
    requestAnimationFrame(() => {
      this.#repositionQueued = false;
      this.#reposition();
    });
  }

  #ensureWatching(form) {
    this.#mutationObserver ??= new MutationObserver(records => {
      const panel = this.element?.querySelector('.fame-token-hud');
      // ignore mutations of our own panel so shifting never feeds back into itself
      if (panel && records.every(record => panel === record.target || panel.contains(record.target))) return;
      this.#scheduleReposition();
    });
    this.#resizeObserver ??= new ResizeObserver(() => this.#scheduleReposition());
    if (this.#observedForm !== form) {
      this.#mutationObserver.disconnect();
      this.#resizeObserver.disconnect();
      this.#mutationObserver.observe(form, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
      this.#resizeObserver.observe(form);
      this.#observedForm = form;
    }
  }

  #stopWatching() {
    this.#mutationObserver?.disconnect();
    this.#resizeObserver?.disconnect();
    this.#observedForm = null;
  }

  // raise the panel above the topmost foreign HUD element over the token so panels
  // injected by other modules never overlap ours; clamped to stay on screen
  #reposition() {
    const form = this.element;
    const panel = form?.querySelector('.fame-token-hud');
    if (!form || !panel) return;
    if (!form.isConnected) {
      this.#stopWatching();
      return;
    }
    this.#ensureWatching(form);

    const formRect = form.getBoundingClientRect();
    if (!formRect.width || !formRect.height) return;
    const scale = formRect.width / form.offsetWidth || 1;

    let foreignTop = Infinity;
    for (const el of form.querySelectorAll('*')) {
      if (panel === el || panel.contains(el)) continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      // side columns hang left/right of the token strip and never block us
      if (rect.right <= formRect.left || rect.left >= formRect.right) continue;
      // only elements poking above the HUD top edge can collide with the panel
      if (rect.top >= formRect.top) continue;
      if (!_paints(el)) continue;
      foreignTop = Math.min(foreignTop, rect.top);
    }

    const panelRect = panel.getBoundingClientRect();
    const height = panelRect.height;

    // rest 8px above the HUD; climb above foreign elements, but never off-screen
    let bottom = Math.min(formRect.top - 8, foreignTop - 4);
    bottom = Math.max(bottom, height + 4);

    const shift = (bottom - formRect.top) / scale + 8;
    panel.style.setProperty('--fame-hud-shift', `${Math.abs(shift) < 0.5 ? 0 : shift.toFixed(2)}px`);
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
