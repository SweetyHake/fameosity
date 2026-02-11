import { MODULE_ID } from '../constants.js';
import { getLocation, addLocation, getValidChildLocationTypes } from '../core/locations.js';
import { getFaction, addFaction, getValidChildFactionTypes } from '../core/factions.js';
import { getPCs, ensureImportant, addTracked } from '../core/actors.js';
import { setDescription } from '../data.js';

export class EntityCreatorApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "fame-entity-creator",
    classes: ["fame-entity-creator", "standard-form"],
    position: { width: 450, height: "auto" },
    window: { resizable: false }
  };

  static PARTS = { content: { template: null } };

  static TYPES = {
    LOCATION: 'location',
    FACTION: 'faction',
    ACTOR: 'actor'
  };

  static LOCATION_TYPES = [
    { id: 'continent', nameKey: 'creator.location-types.continent', icon: 'fa-globe', canContain: ['country', 'settlement', 'poi'] },
    { id: 'country', nameKey: 'creator.location-types.country', icon: 'fa-flag', canContain: ['settlement', 'poi'] },
    { id: 'settlement', nameKey: 'creator.location-types.settlement', icon: 'fa-city', canContain: ['poi'] },
    { id: 'poi', nameKey: 'creator.location-types.poi', icon: 'fa-map-pin', canContain: [] }
  ];

  static FACTION_TYPES = [
    { id: 'organization', nameKey: 'creator.faction-types.organization', icon: 'fa-landmark', canContain: ['group'] },
    { id: 'group', nameKey: 'creator.faction-types.group', icon: 'fa-users', canContain: [] }
  ];

  constructor(options = {}) {
    super(options);
    this.entityType = options.entityType || EntityCreatorApp.TYPES.LOCATION;
    this.parentId = options.parentId || null;
    this.parentType = options.parentType || null;
    this.pendingActors = [];
    this.selectedSubType = null;
  }

  get title() {
    const titleMap = {
      [EntityCreatorApp.TYPES.LOCATION]: `${MODULE_ID}.creator.title-location`,
      [EntityCreatorApp.TYPES.FACTION]: `${MODULE_ID}.creator.title-faction`,
      [EntityCreatorApp.TYPES.ACTOR]: `${MODULE_ID}.creator.title-actor`
    };
    return game.i18n.localize(titleMap[this.entityType]);
  }

  get windowIcon() {
    const iconMap = {
      [EntityCreatorApp.TYPES.LOCATION]: 'fa-solid fa-map-marker-alt',
      [EntityCreatorApp.TYPES.FACTION]: 'fa-solid fa-flag',
      [EntityCreatorApp.TYPES.ACTOR]: 'fa-solid fa-user-plus'
    };
    return iconMap[this.entityType];
  }

  _getFilteredTypes() {
    let locationTypes = [...EntityCreatorApp.LOCATION_TYPES];
    let factionTypes = [...EntityCreatorApp.FACTION_TYPES];

    if (this.parentId && this.entityType === EntityCreatorApp.TYPES.LOCATION) {
      const parent = getLocation(this.parentId);
      if (parent) {
        const valid = getValidChildLocationTypes(parent.locationType);
        locationTypes = locationTypes.filter(t => valid.includes(t.id));
      }
    }

    if (this.parentId && this.entityType === EntityCreatorApp.TYPES.FACTION) {
      const parent = getFaction(this.parentId);
      if (parent) {
        const valid = getValidChildFactionTypes(parent.factionType);
        factionTypes = factionTypes.filter(t => valid.includes(t.id));
      }
    }

    return { locationTypes, factionTypes };
  }

  _prepareContext() {
    const { locationTypes, factionTypes } = this._getFilteredTypes();

    return {
      entityType: this.entityType,
      isLocation: this.entityType === EntityCreatorApp.TYPES.LOCATION,
      isFaction: this.entityType === EntityCreatorApp.TYPES.FACTION,
      isActor: this.entityType === EntityCreatorApp.TYPES.ACTOR,
      locationTypes: locationTypes.map(t => ({
        ...t,
        name: game.i18n.localize(`${MODULE_ID}.${t.nameKey}`),
        selected: this.selectedSubType === t.id
      })),
      factionTypes: factionTypes.map(t => ({
        ...t,
        name: game.i18n.localize(`${MODULE_ID}.${t.nameKey}`),
        selected: this.selectedSubType === t.id
      })),
      pendingActors: this.pendingActors,
      parentId: this.parentId,
      parentType: this.parentType
    };
  }

  _renderHTML(_context) {
    const context = this._prepareContext();
    const div = document.createElement("div");
    div.className = "fame-creator-content";

    if (context.isActor) {
      div.innerHTML = this._renderActorCreator(context);
    } else {
      div.innerHTML = this._renderEntityCreator(context);
    }

    return div;
  }

  _renderEntityCreator(context) {
    const types = context.isLocation ? context.locationTypes : context.factionTypes;
    const typesHtml = types.map(t => `
      <div class="fame-creator-type-item ${t.selected ? 'selected' : ''}" data-type-id="${t.id}">
        <i class="fa-solid ${t.icon}"></i>
        <span class="fame-creator-type-name">${t.name}</span>
      </div>
    `).join('');

    const entityLabel = context.isLocation 
      ? game.i18n.localize(`${MODULE_ID}.creator.select-location-type`)
      : game.i18n.localize(`${MODULE_ID}.creator.select-faction-type`);

    const namePlaceholder = context.isLocation
      ? game.i18n.localize(`${MODULE_ID}.creator.location-name-placeholder`)
      : game.i18n.localize(`${MODULE_ID}.creator.faction-name-placeholder`);

    return `
      <div class="fame-creator-section">
        <label class="fame-creator-label">${entityLabel}</label>
        <div class="fame-creator-types">${typesHtml}</div>
      </div>
      <div class="fame-creator-section">
        <label class="fame-creator-label">${game.i18n.localize(`${MODULE_ID}.creator.name-label`)}</label>
        <input type="text" class="fame-creator-name-input" placeholder="${namePlaceholder}">
      </div>
      <div class="fame-creator-footer">
        <button type="button" class="fame-creator-btn fame-creator-submit full-width" ${!this.selectedSubType ? 'disabled' : ''}>
          <i class="fa-solid fa-plus"></i> ${game.i18n.localize(`${MODULE_ID}.creator.create-btn`)}
        </button>
      </div>
    `;
  }

  _renderActorCreator(context) {
    const actorsHtml = context.pendingActors.length
      ? context.pendingActors.map(a => `
          <div class="fame-creator-actor-item" data-actor-id="${a.id}">
            <img class="fame-creator-actor-img" src="${a.img}">
            <span class="fame-creator-actor-name">${a.name}</span>
            <button type="button" class="fame-icon-btn fame-creator-actor-remove" data-actor-id="${a.id}">
              <i class="fa-solid fa-times"></i>
            </button>
          </div>
        `).join('')
      : `<div class="fame-creator-drop-hint">${game.i18n.localize(`${MODULE_ID}.creator.drop-actors-hint`)}</div>`;

    return `
      <div class="fame-creator-section">
        <label class="fame-creator-label">${game.i18n.localize(`${MODULE_ID}.creator.actors-label`)}</label>
        <div class="fame-creator-actor-drop-zone" data-drop-type="actor">
          ${actorsHtml}
        </div>
      </div>
      <div class="fame-creator-quick-actions">
        <button type="button" class="fame-creator-quick-btn" data-action="addPlayerCharacters">
          <i class="fa-solid fa-users"></i> ${game.i18n.localize(`${MODULE_ID}.creator.add-player-characters`)}
        </button>
        <button type="button" class="fame-creator-quick-btn" data-action="addImportantNPCs">
          <i class="fa-solid fa-user-tie"></i> ${game.i18n.localize(`${MODULE_ID}.creator.add-important-npcs`)}
        </button>
      </div>
      <div class="fame-creator-footer">
        <button type="button" class="fame-creator-btn fame-creator-submit full-width" ${!context.pendingActors.length ? 'disabled' : ''}>
          <i class="fa-solid fa-plus"></i> ${game.i18n.localize(`${MODULE_ID}.creator.add-all-btn`)}
        </button>
      </div>
    `;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
    this._attachListeners(content);
  }

  _attachListeners(html) {
    html.querySelectorAll('.fame-creator-type-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectedSubType = item.dataset.typeId;
        this.render();
      });
    });

    html.querySelector('.fame-creator-submit')?.addEventListener('click', () => this._handleSubmit(html));

    html.querySelectorAll('.fame-creator-actor-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const actorId = btn.dataset.actorId;
        this.pendingActors = this.pendingActors.filter(a => a.id !== actorId);
        this.render();
      });
    });

    html.querySelector('[data-action="addPlayerCharacters"]')?.addEventListener('click', () => this._addPlayerCharacters());
    html.querySelector('[data-action="addImportantNPCs"]')?.addEventListener('click', () => this._addImportantNPCs());

    const dropZone = html.querySelector('.fame-creator-actor-drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', e => {
        if (!dropZone.contains(e.relatedTarget)) {
          dropZone.classList.remove('drag-over');
        }
      });
      dropZone.addEventListener('drop', async e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        await this._handleActorDrop(e);
      });
    }
  }

  async _handleActorDrop(event) {
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch {
      return;
    }

    if (data.type !== 'Actor') return;

    const actor = await fromUuid(data.uuid);
    if (!actor) return;

    if (this.pendingActors.some(a => a.id === actor.id)) return;

    this.pendingActors.push({
      id: actor.id,
      name: actor.name,
      img: actor.img || 'icons/svg/mystery-man.svg'
    });

    this.render();
  }

  _addPlayerCharacters() {
    const pcs = game.actors.filter(actor => {
      if (this.pendingActors.some(a => a.id === actor.id)) return false;
      return Object.entries(actor.ownership || {}).some(([userId, level]) => {
        if (userId === 'default') return false;
        const user = game.users.get(userId);
        return user && !user.isGM && level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
      });
    });
    for (const actor of pcs) {
      this.pendingActors.push({
        id: actor.id,
        name: actor.name,
        img: actor.img || 'icons/svg/mystery-man.svg'
      });
    }
    this.render();
  }

  _addImportantNPCs() {
    const hasPlayerOwner = (actor) => {
      return Object.entries(actor.ownership || {}).some(([userId, level]) => {
        if (userId === 'default') return false;
        const user = game.users.get(userId);
        return user && !user.isGM && level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
      });
    };

    const npcs = game.actors.filter(actor => {
      if (this.pendingActors.some(a => a.id === actor.id)) return false;
      if (hasPlayerOwner(actor)) return false;
      if (actor.type === 'group') return false;
      const isLinked = actor.prototypeToken?.actorLink === true;
      const isImportant = actor.system?.traits?.important === true;
      return isLinked || isImportant;
    });

    for (const actor of npcs) {
      this.pendingActors.push({
        id: actor.id,
        name: actor.name,
        img: actor.img || 'icons/svg/mystery-man.svg'
      });
    }
    this.render();
  }

  async _handleSubmit(html) {
    if (this.entityType === EntityCreatorApp.TYPES.ACTOR) {
      await this._submitActors();
    } else {
      await this._submitEntity(html);
    }
  }

  async _submitActors() {
    for (const actorData of this.pendingActors) {
      const actor = game.actors.get(actorData.id);
      if (actor) {
        if (!actor.hasPlayerOwner) {
          await ensureImportant(actor);
        }
        await addTracked(actorData.id);
      }
    }
    this.close();
  }

  async _submitEntity(html) {
    if (!this.selectedSubType) return;

    const nameInput = html.querySelector('.fame-creator-name-input');
    const name = nameInput?.value?.trim();

    if (this.entityType === EntityCreatorApp.TYPES.LOCATION) {
      const typeInfo = EntityCreatorApp.LOCATION_TYPES.find(t => t.id === this.selectedSubType);
      await addLocation({
        name: name || game.i18n.localize(`${MODULE_ID}.${typeInfo.nameKey}`),
        locationType: this.selectedSubType,
        parentId: this.parentId
      });
    } else if (this.entityType === EntityCreatorApp.TYPES.FACTION) {
      const typeInfo = EntityCreatorApp.FACTION_TYPES.find(t => t.id === this.selectedSubType);
      await addFaction({
        name: name || game.i18n.localize(`${MODULE_ID}.${typeInfo.nameKey}`),
        factionType: this.selectedSubType,
        parentId: this.parentId
      });
    }

    this.close();
  }

  static openLocationCreator(parentId = null, parentType = null) {
    new EntityCreatorApp({
      entityType: EntityCreatorApp.TYPES.LOCATION,
      parentId,
      parentType
    }).render(true);
  }

  static openFactionCreator(parentId = null, parentType = null) {
    new EntityCreatorApp({
      entityType: EntityCreatorApp.TYPES.FACTION,
      parentId,
      parentType
    }).render(true);
  }

  static openActorCreator() {
    new EntityCreatorApp({
      entityType: EntityCreatorApp.TYPES.ACTOR
    }).render(true);
  }
}