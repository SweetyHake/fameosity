import { MODULE_ID } from '../constants.js';
import { escapeHtml, getTier } from '../data.js';
import { getTracked, getDisplayName, getPCs } from '../core/actors.js';
import { getFactions } from '../core/factions.js';
import { getRep, getMode } from '../core/reputation.js';
import { isHidden } from '../core/visibility.js';
import { fitTierBadges } from './relations/RelationsListeners.js';

export class PickerApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "fame-picker-app",
    classes: ["fame-picker-app", "standard-form"],
    position: { width: 400, height: 500 },
    window: { resizable: true }
  };

  static PARTS = { content: { template: null } };

  static TYPES = {
    ACTOR: 'actor',
    FACTION: 'faction',
    PC: 'pc'
  };

  constructor(options = {}) {
    super(options);
    this.pickerType = options.type || PickerApp.TYPES.ACTOR;
    this.callback = options.callback || null;
    this.filter = options.filter || null;
    this.customItems = options.customItems || null;
    this.searchQuery = "";

    const iconMap = {
      [PickerApp.TYPES.ACTOR]: "fa-solid fa-user",
      [PickerApp.TYPES.FACTION]: "fa-solid fa-flag",
      [PickerApp.TYPES.PC]: "fa-solid fa-user"
    };
    this.options.window.icon = iconMap[this.pickerType] || "fa-solid fa-list";
  }

  get title() {
    const titleMap = {
      [PickerApp.TYPES.FACTION]: `${MODULE_ID}.picker.select-faction`,
      [PickerApp.TYPES.ACTOR]: `${MODULE_ID}.picker.select-actor`,
      [PickerApp.TYPES.PC]: `${MODULE_ID}.picker.select-actor`
    };
    return game.i18n.localize(titleMap[this.pickerType]);
  }

  async _prepareContext() {
    let items = [];

    if (this.customItems) {
      items = [...this.customItems];
    } else if (this.pickerType === PickerApp.TYPES.FACTION) {
      items = this._prepareFactions();
    } else if (this.pickerType === PickerApp.TYPES.PC) {
      items = this._preparePCs();
    } else {
      items = this._prepareActors();
    }

    if (this.filter) {
      items = items.filter(this.filter);
    }

    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      items = items.filter(item => item.name.toLowerCase().includes(query));
    }

    return {
      items,
      searchQuery: this.searchQuery,
      pickerType: this.pickerType,
      isActorPicker: this.pickerType === PickerApp.TYPES.ACTOR || this.pickerType === PickerApp.TYPES.PC,
      isFactionPicker: this.pickerType === PickerApp.TYPES.FACTION
    };
  }

  _prepareActors() {
    const tracked = getTracked();
    return tracked
      .map(id => {
        const actor = game.actors.get(id);
        if (!actor) return null;
        return { id: actor.id, name: getDisplayName(id), img: actor.img };
      })
      .filter(Boolean);
  }

  _preparePCs() {
    return getPCs().map(pc => ({ id: pc.id, name: getDisplayName(pc.id), img: pc.img }));
  }

  _prepareFactions() {
    return getFactions()
      .filter(f => !isHidden('faction', f.id))
      .map(faction => {
        const rep = getRep(faction.id, 'faction');
        const tier = getTier(rep);
        return {
          id: faction.id, name: faction.name, img: faction.image,
          reputation: rep, tier, memberCount: (faction.members || []).length
        };
      });
  }

  async _renderHTML(context) {
    const div = document.createElement("div");
    div.className = "fame-picker-content";

    const itemsHtml = context.items.length
      ? context.items.map(item => this._renderItem(item, context)).join('')
      : `<div class="fame-no-items center">${this._getEmptyMessage()}</div>`;

    div.innerHTML = `
      <div class="fame-picker-search">
        <input type="text" class="fame-picker-search-input"
               placeholder="${game.i18n.localize(`${MODULE_ID}.picker.search`)}"
               value="${escapeHtml(this.searchQuery)}">
        <i class="fa-solid fa-search"></i>
      </div>
      <div class="fame-picker-list">${itemsHtml}</div>
    `;

    return div;
  }

  _renderItem(item, context) {
    if (context.isFactionPicker) {
      return `
        <div class="fame-picker-item" data-id="${escapeHtml(item.id)}">
          <img class="fame-picker-img" src="${item.img || 'icons/svg/mystery-man.svg'}">
          <div class="fame-picker-info">
            <span class="fame-picker-name">${escapeHtml(item.name)}</span>
            <span class="fame-picker-meta">
              <span class="fame-tier-badge small" style="background:${item.tier.color}">${escapeHtml(item.tier.name)}</span>
              <span class="fame-picker-stat"><i class="fa-solid fa-users"></i> ${item.memberCount}</span>
            </span>
          </div>
        </div>
      `;
    }
    return `
      <div class="fame-picker-item" data-id="${escapeHtml(item.id)}">
        <img class="fame-picker-img" src="${item.img || 'icons/svg/mystery-man.svg'}">
        <span class="fame-picker-name">${escapeHtml(item.name)}</span>
      </div>
    `;
  }

  _getEmptyMessage() {
    const messageMap = {
      [PickerApp.TYPES.FACTION]: `${MODULE_ID}.picker.no-factions`,
      [PickerApp.TYPES.ACTOR]: `${MODULE_ID}.picker.no-actors`,
      [PickerApp.TYPES.PC]: `${MODULE_ID}.picker.no-actors`
    };
    return game.i18n.localize(messageMap[this.pickerType]);
  }

  _replaceHTML(result, content) {
    const oldInput = content.querySelector('.fame-picker-search-input');
    const selStart = oldInput?.selectionStart;
    const selEnd = oldInput?.selectionEnd;
    const hadFocus = oldInput === document.activeElement;

    content.replaceChildren(result);
    this._attachListeners(content);
    fitTierBadges(content);

    if (hadFocus) {
      const newInput = content.querySelector('.fame-picker-search-input');
      if (newInput) {
        newInput.focus();
        if (selStart !== undefined) newInput.setSelectionRange(selStart, selEnd);
      }
    }
  }

  _attachListeners(html) {
    html.querySelector('.fame-picker-search-input')?.addEventListener('input', e => {
      this.searchQuery = e.target.value;
      this.render();
    });
    html.querySelectorAll('.fame-picker-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = item.dataset.id;
        if (this.callback) await this.callback(id);
        this.close();
      });
    });
  }

  static openActorPicker(options = {}) {
    const app = new PickerApp({ ...options, type: PickerApp.TYPES.ACTOR });
    app.render(true);
    return app;
  }

  static openFactionPicker(options = {}) {
    const app = new PickerApp({ ...options, type: PickerApp.TYPES.FACTION });
    app.render(true);
    return app;
  }

  static openPCPicker(options = {}) {
    const app = new PickerApp({ ...options, type: PickerApp.TYPES.PC });
    app.render(true);
    return app;
  }
}