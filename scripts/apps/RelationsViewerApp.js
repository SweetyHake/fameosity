import { MODULE_ID } from '../constants.js';
import * as Data from '../data.js';
import { ReputationEvents } from '../events.js';
import * as Core from '../core/index.js';
import { getMode, setMode } from '../core/reputation.js';
import { PickerApp } from './PickerApp.js';
import { LOCATION_TYPES, FACTION_TYPES, buildActorData, buildFactionData, buildLocationData, buildDetail, canEditActor } from './relations/RelationsBuilders.js';
import { loadState, saveState, resolvePinnedOwner, ensureTreeExpanded, restoreNavGroups, restoreSections, restoreDescriptions, restoreSubsections, restoreScroll, restoreNavWidth } from './relations/RelationsState.js';
import { openSlotDropdown, closeSlotDropdowns } from './relations/RelationsDropdown.js';
import { attachInputListeners, attachBarListeners, attachNavSearchListener, attachResizeHandle, attachImagePopout, attachRankDragDrop, updateBarVisual, fitTierBadges } from './relations/RelationsListeners.js';
import { attachDropListeners, attachNestingDragDrop, attachDetailSectionDrop, attachNavTreeSidebarDrop } from './relations/RelationsDragDrop.js';
import { attachContextMenu } from './relations/RelationsContext.js';
import { ensureRelationsTemplates } from '../core/templates.js';

const MODE_IDS = ['manual', 'auto', 'hybrid'];
const MODE_ICONS = {
  manual: 'fa-solid fa-hand',
  auto: 'fa-solid fa-robot',
  hybrid: 'fa-solid fa-shuffle'
};

export class RelationsViewerApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {

  static PARTS = {
    content: { template: `modules/${MODULE_ID}/templates/relations/main.hbs` }
  };

  constructor(options = {}) {
    super(options);
    loadState(this);
    this.scrollPos = 0;
    this._unsubscribers = [];
    this._busy = false;
    this._editingDescriptions = new Set();
    this.ownerActorId = resolvePinnedOwner(this);
    if (!this.selectedType && this.ownerActorId) {
      this.selectedType = 'actor';
      this.selectedId = this.ownerActorId;
    }
  }

  get title() {
    return game.i18n.localize(`${MODULE_ID}.relations.viewer-title`);
  }

  _saveState() { saveState(this); }
  _ensureTreeExpanded(type, id) { ensureTreeExpanded(this, type, id); }
  _updateBarVisual(container, value) { updateBarVisual(container, value); }

  _onFirstRender() {
    this._subscribeToEvents();
    if (game.user.isGM) Core.ensureActiveParty();
  }

  _subscribeToEvents() {
    this._unsubscribers.forEach(unsub => typeof unsub === 'function' && unsub());
    this._unsubscribers = [];

    const scheduleRender = foundry.utils.debounce(() => {
      if (this._busy || !this.rendered) return;
      this.render();
    }, 120);
    this._unsubscribers = Object.values(ReputationEvents.EVENTS).map(event =>
      ReputationEvents.on(event, scheduleRender)
    );
  }

  async close(options = {}) {
    this._saveState();
    closeSlotDropdowns();
    this._unsubscribers.forEach(unsub => typeof unsub === 'function' && unsub());
    this._unsubscribers = [];
    return super.close(options);
  }

  async _prepareContext(options) {
    await ensureRelationsTemplates();
    const { min, max } = Data.getLimits();
    const isGM = game.user.isGM;
    const pcs = Core.getPCs();
    const rawFactions = Core.getFactions();

    let allActorsFlat = (await Promise.all(
      Core.getTracked().map(id => buildActorData(id, min, max, pcs, rawFactions))
    )).filter(Boolean);

    // sidebar must list every active-party member, even if not added to tracking
    const earlyParty = Core.getActiveParty();
    const trackedSet = new Set(Core.getTracked());
    const untrackedPartyMembers = (earlyParty?.members || []).filter(id => !trackedSet.has(id));
    if (untrackedPartyMembers.length) {
      const extras = (await Promise.all(
        untrackedPartyMembers.map(id => buildActorData(id, min, max, pcs, rawFactions))
      )).filter(Boolean);
      allActorsFlat.push(...extras);
    }

    let allFactionsFlat = await Promise.all(
      rawFactions.map(f => buildFactionData(f, pcs, min, max, isGM))
    );

    let allLocationsFlat = await Promise.all(
      Core.getLocations().map(l => buildLocationData(l, allFactionsFlat, allActorsFlat, isGM))
    );

    if (!isGM) {
      allActorsFlat = allActorsFlat.filter(a => !a.hidden).map(a => ({
        ...a,
        relations: a.relations.filter(r => !r.hidden),
        playerRelations: a.playerRelations.filter(r => !r.hidden),
        npcRelations: a.npcRelations.filter(r => !r.hidden),
        factionRelations: a.factionRelations.filter(r => !r.hidden && !r.factionHidden)
      }));
      allFactionsFlat = allFactionsFlat.filter(f => !f.hidden).map(f => ({
        ...f,
        members: f.members.filter(m => !m.hidden && !m.actorHidden),
        factionRels: f.factionRels.filter(r => !r.hidden),
        factionPcRels: f.factionPcRels.filter(r => !r.hidden),
        factionNpcRels: f.factionNpcRels.filter(r => !r.hidden),
        factionToFactionRels: f.factionToFactionRels.filter(r => !r.hidden && !r.targetHidden)
      }));
      allLocationsFlat = allLocationsFlat.filter(l => !l.hidden).map(l => ({
        ...l,
        factionsList: l.factionsList.filter(f => !f.locItemHidden && !f.hidden),
        actorsList: l.actorsList.filter(a => !a.locItemHidden && !a.hidden)
      }));
    }

    allLocationsFlat.sort((a, b) => a.name.localeCompare(b.name));
    allFactionsFlat.sort((a, b) => a.name.localeCompare(b.name));

    let allLocations = Core.buildTree(allLocationsFlat, this.treeExpandedLocations);
    let allFactions = Core.buildTree(allFactionsFlat, this.treeExpandedFactions);

    if (this.navSearch) {
      const q = this.navSearch.toLowerCase();
      allLocations = allLocations.filter(l => l.name.toLowerCase().includes(q));
      allFactions = allFactions.filter(f => f.name.toLowerCase().includes(q));
      allActorsFlat = allActorsFlat.filter(a => a.name.toLowerCase().includes(q));
    }

    const activeParty = Core.getActiveParty();
    const activePartyMembers = activeParty ? new Set(activeParty.members || []) : null;
    const { pcs: playerActorsRaw, npcs: npcActorsRaw } = Core.separatePlayerAndNPC(allActorsFlat);

    let playerActors;
    let npcActors;
    if (activePartyMembers) {
      // party members form the first group; every other tracked actor must stay visible in the second one
      playerActors = allActorsFlat.filter(a => activePartyMembers.has(a.id));
      npcActors = allActorsFlat.filter(a => !activePartyMembers.has(a.id));
    } else {
      playerActors = playerActorsRaw;
      npcActors = npcActorsRaw;
    }

    playerActors.sort((a, b) => a.name.localeCompare(b.name));
    npcActors.sort((a, b) => a.name.localeCompare(b.name));

    let detail = null;
    if (this.selectedType && this.selectedId) {
      detail = buildDetail(this, this.selectedType, this.selectedId, allLocations, allFactions, allActorsFlat);
      if (detail && (isGM || detail.canEdit)) {
        detail.isEditingDescription = this._editingDescriptions.has(`${this.selectedType}:${this.selectedId}`);
      }
    }

    let ownerActor = null;
    if (this.ownerActorId) {
      const actor = game.actors.get(this.ownerActorId);
      if (actor) {
        ownerActor = {
          id: actor.id,
          name: Core.getDisplayName(actor.id),
          img: actor.img || 'icons/svg/mystery-man.svg',
          isTracked: Core.getTracked().includes(actor.id)
        };
      }
    }

    return {
      min, max, isGM, pcs, allLocations, allFactions, playerActors, npcActors,
      selectedType: this.selectedType, selectedId: this.selectedId,
      detail, navSearch: this.navSearch, moduleId: MODULE_ID, ownerActor,
      activePartyId: Core.getActivePartyId(),
      activePartyName: activeParty?.name || null,
      locationTypes: LOCATION_TYPES.map(t => ({ ...t, name: game.i18n.localize(`${MODULE_ID}.types.location.${t.id}`) })),
      factionTypes: FACTION_TYPES.map(t => ({ ...t, name: game.i18n.localize(`${MODULE_ID}.types.faction.${t.id}`) }))
    };
  }

  _onRender(context, options) {
    closeSlotDropdowns();
    const html = this.element;
    const content = html.querySelector('.fame-relations-content');
    if (content) {
      content.classList.add('no-transitions');
      requestAnimationFrame(() => requestAnimationFrame(() => content.classList.remove('no-transitions')));
    }
    attachInputListeners(html, this);
    attachBarListeners(html, this);
    attachNavSearchListener(html, this);
    attachResizeHandle(html, this);
    attachContextMenu(html, this);
    attachImagePopout(html);
    if (game.user.isGM) {
      attachDropListeners(html);
      attachNestingDragDrop(html, this);
      attachRankDragDrop(html);
      attachDetailSectionDrop(html);
      attachNavTreeSidebarDrop(html, this);
    }
    restoreNavGroups(html, this);
    restoreSections(html, this);
    restoreDescriptions(html, this);
    restoreSubsections(html, this);
    restoreScroll(html, this);
    restoreNavWidth(html, this);
    fitTierBadges(html);
    const panel = html.querySelector('.fame-detail-panel');
    if (panel) panel.addEventListener('scroll', () => { this.scrollPos = panel.scrollTop; }, { passive: true });
    const navTree = html.querySelector('.fame-nav-tree');
    if (navTree) navTree.addEventListener('scroll', () => { this.navScrollPos = navTree.scrollTop; }, { passive: true });
  }

  static #onSelectEntity(event, target) {
    event.stopPropagation();
    this.selectedType = target.dataset.entityType;
    this.selectedId = target.dataset.entityId;
    this.scrollPos = 0;
    this._ensureTreeExpanded(this.selectedType, this.selectedId);
    this._saveState();
    this.render();
  }

  static #onGoToOwner(event, target) {
    event.stopPropagation();
    if (!this.ownerActorId) return;
    RelationsViewerApp.#trackAndSelectActor(this, this.ownerActorId);
  }

  static #trackAndSelectActor(app, actorId) {
    const actor = game.actors.get(actorId);
    const tracked = Core.getTracked();
    if (actor && !tracked.includes(actorId)) {
      if (!actor.hasPlayerOwner) Core.ensureImportant(actor);
      Core.addTracked(actorId);
    }
    app.selectedType = 'actor';
    app.selectedId = actorId;
    app.scrollPos = 0;
    app._saveState();
    app.render();
  }

  static #onOpenOwnerPicker(event, target) {
    event.stopPropagation();
    const pcs = Core.getPCs().filter(a =>
      game.user.isGM || a.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER));
    if (!pcs.length) return;

    const items = [{ header: true, label: game.i18n.localize(`${MODULE_ID}.ui.pick-character`) }];
    for (const pc of pcs) {
      items.push({
        img: pc.img,
        label: Core.getDisplayName(pc.id),
        checked: pc.id === this.ownerActorId,
        action: async () => {
          this.pinnedOwnerActorId = pc.id;
          this.ownerActorId = pc.id;
          try {
            await game.user.setFlag(MODULE_ID, 'ownerActorId', pc.id);
          } catch (err) {
            console.warn(`${MODULE_ID} | Could not persist pinned owner on user:`, err);
          }
          RelationsViewerApp.#trackAndSelectActor(this, pc.id);
        }
      });
    }

    openSlotDropdown(target.closest('.fame-context-slot') ?? target, items);
  }

  static #onOpenPartyPicker(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;

    const items = [{ header: true, label: game.i18n.localize(`${MODULE_ID}.ui.pick-party`) }];
    for (const group of Core.getFactions().filter(f => f.factionType === 'group')) {
      items.push({
        img: group.image,
        label: group.name,
        checked: Core.isActiveParty(group.id),
        action: async () => {
          await Core.setActiveParty(group.id);
          this.render();
        }
      });
    }

    items.push({ separator: true });
    items.push({
      icon: 'fa-solid fa-plus',
      label: game.i18n.localize(`${MODULE_ID}.ui.create-group`),
      action: () => import('./EntityCreatorApp.js').then(m => m.EntityCreatorApp.openFactionCreator())
    });

    openSlotDropdown(target.closest('.fame-context-slot') ?? target, items);
  }

  static async #onCreateActiveParty(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    const before = Core.getActivePartyId();
    await Core.ensureActiveParty();
    if (Core.getActivePartyId() !== before) {
      this.render();
    } else if (!Core.getActivePartyId()) {
      ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.ui.no-active-party-gm`));
    }
  }

  static #onOpenActorSheet(event, target) {
    event.stopPropagation();
    const actor = game.actors.get(target.dataset.actorId);
    if (actor?.isOwner) actor.sheet.render(true);
  }

  static #onToggleNavGroup(event, target) {
    event.stopPropagation();
    const group = target.dataset.group;
    const el = target.closest('.fame-nav-group');
    if (!el) return;
    el.classList.toggle('open');
    if (el.classList.contains('open')) this.closedNavGroups.delete(group);
    else this.closedNavGroups.add(group);
    this._saveState();
  }

  static #onToggleTreeExpand(event, target) {
    event.stopPropagation();
    const { id, type } = target.dataset;
    const set = type === 'faction' ? this.treeExpandedFactions : this.treeExpandedLocations;
    set.has(id) ? set.delete(id) : set.add(id);
    this._saveState();
    this.render();
  }

  static #onToggleDetailSection(event, target) {
    event.stopPropagation();
    const section = target.dataset.section;
    const el = target.closest('.fame-detail-section');
    if (!el) return;
    el.classList.toggle('open');
    if (el.classList.contains('open')) this.openSections.add(section);
    else this.openSections.delete(section);
    this._saveState();
  }

  static async #onToggleHidden(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    target.classList.toggle('active');
    this.element?.querySelector(`.fame-nav-item[data-entity-id="${target.dataset.id}"]`)?.classList.toggle('is-hidden');
    await Core.toggleHidden(target.dataset.type, target.dataset.id);
  }

  static async #onToggleRelationHidden(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    target.classList.toggle('active');
    target.closest('.fame-detail-rel-row')?.classList.toggle('is-hidden');
    await Core.toggleRelationHidden(target.dataset.relType, target.dataset.entityId, target.dataset.targetId);
  }

  static async #onSetLocationControl(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    const { PickerApp } = await import('./PickerApp.js');
    PickerApp.openFactionPicker({
      callback: async factionId => {
        const locations = Core.getLocations();
        const loc = locations.find(l => l.id === target.dataset.location);
        if (loc) {
          loc.controlledBy = factionId;
          await Core.setLocations(locations);
        }
      }
    });
  }

  static async #onClearLocationControl(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    const locations = Core.getLocations();
    const loc = locations.find(l => l.id === target.dataset.location);
    if (loc) {
      delete loc.controlledBy;
      await Core.setLocations(locations);
    }
  }

  static async #onToggleMemberHidden(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    target.classList.toggle('active');
    target.closest('.fame-detail-member-row')?.classList.toggle('is-hidden');
    await Core.toggleMemberHidden(target.dataset.faction, target.dataset.actor);
  }

  static async #onToggleLocationItemHidden(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    target.classList.toggle('active');
    target.closest('.fame-detail-rel-row')?.classList.toggle('is-hidden');
    await Core.toggleLocationItemHidden(target.dataset.location, target.dataset.itemType, target.dataset.itemId);
  }

  static #onOpenActorModePicker(event, target) {
    RelationsViewerApp.#openModeDropdown(event, target, 'actor');
  }

  static #onOpenFactionModePicker(event, target) {
    RelationsViewerApp.#openModeDropdown(event, target, 'faction');
  }

  static #openModeDropdown(event, target, type) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    const id = target.dataset.id;
    const current = getMode(id, type);
    openSlotDropdown(target, MODE_IDS.map(mode => ({
      icon: MODE_ICONS[mode],
      label: game.i18n.localize(`${MODULE_ID}.mode.${mode}`),
      tooltip: game.i18n.localize(`${MODULE_ID}.tooltips.mode-${mode}`),
      checked: mode === current,
      action: () => setMode(id, type, mode)
    })), { align: 'center' });
  }

  static async #onDelete(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    const { id, type } = target.dataset;
    if (!await Core.confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.delete-${type}`))) return;
    if (type === 'faction') await Core.deleteFaction(id);
    else if (type === 'location') await Core.deleteLocation(id);
    else await Core.removeTracked(id);
    if (this.selectedId === id) { this.selectedType = null; this.selectedId = null; this._saveState(); }
  }

  static async #onUnnest(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    if (target.dataset.type === 'location') await Core.setLocationParent(target.dataset.id, null);
    else if (target.dataset.type === 'faction') await Core.setFactionParent(target.dataset.id, null);
  }

  static async #onAddChildLocation(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    const loc = Core.getLocation(target.dataset.parent);
    if (!loc || Core.getValidChildLocationTypes(loc.locationType).length === 0) {
      ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.errors.cannotNest`));
      return;
    }
    import('./EntityCreatorApp.js').then(m => m.EntityCreatorApp.openLocationCreator(target.dataset.parent));
  }

  static async #onAddChildFaction(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    const fac = Core.getFaction(target.dataset.parent);
    if (!fac || Core.getValidChildFactionTypes(fac.factionType).length === 0) {
      ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.errors.cannotNest`));
      return;
    }
    import('./EntityCreatorApp.js').then(m => m.EntityCreatorApp.openFactionCreator(target.dataset.parent));
  }

  static #onOpenLocationCreator() { import('./EntityCreatorApp.js').then(m => m.EntityCreatorApp.openLocationCreator()); }
  static #onOpenFactionCreator() { import('./EntityCreatorApp.js').then(m => m.EntityCreatorApp.openFactionCreator()); }
  static #onOpenActorCreator() { import('./EntityCreatorApp.js').then(m => m.EntityCreatorApp.openActorCreator()); }
  static #onOpenReputationSettings() { game.modules.get(MODULE_ID)?.api?.openReputationSettings?.(); }

  static async #onTogglePartyActive(event, target) {
    event.stopPropagation();
    if (game.user.isGM) await Core.activateParty(target.dataset.factionId);
  }

  static async #onAddMember(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    const fac = Core.getFaction(target.dataset.faction);
    PickerApp.openActorPicker({
      filter: a => !(fac?.members || []).includes(a.id),
      callback: async aId => {
        const actor = game.actors.get(aId);
        if (actor && !actor.hasPlayerOwner) await Core.ensureImportant(actor);
        await Core.addFactionMember(target.dataset.faction, aId);
      }
    });
  }

  static async #onRemoveMember(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    if (!await Core.confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.delete-member`))) return;
    await Core.removeFactionMember(target.dataset.faction, target.dataset.actor);
  }

  static async #onAddRank(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    await Core.addFactionRank(target.dataset.faction, { name: game.i18n.localize(`${MODULE_ID}.ranks.new-rank`), color: "#6a6a6a", multiplier: 1 });
  }

  static async #onDeleteRank(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    if (!await Core.confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.delete-rank`))) return;
    await Core.removeFactionRank(target.dataset.faction, target.dataset.rank);
  }

  static async #onAddFactionToLoc(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    const loc = Core.getLocation(target.dataset.location);
    PickerApp.openFactionPicker({ filter: f => !(loc?.factions || []).includes(f.id), callback: async fId => await Core.addFactionToLocation(target.dataset.location, fId) });
  }

  static async #onRemoveFactionFromLoc(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    if (!await Core.confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.remove-from-location`))) return;
    await Core.removeFactionFromLocation(target.dataset.location, target.dataset.faction);
  }

  static async #onAddActorToLoc(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    const loc = Core.getLocation(target.dataset.location);
    PickerApp.openActorPicker({ filter: a => !(loc?.actors || []).includes(a.id), callback: async aId => await Core.addActorToLocation(target.dataset.location, aId) });
  }

  static async #onRemoveActorFromLoc(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    if (!await Core.confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.remove-from-location`))) return;
    await Core.removeActorFromLocation(target.dataset.location, target.dataset.actor);
  }

  static async #onChangeImage(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    new FilePicker({
      type: "image",
      callback: async path => {
        if (target.dataset.type === 'faction') {
          const factions = Core.getFactions();
          const f = factions.find(x => x.id === target.dataset.id);
          if (f) { f.image = path; await Core.setFactions(factions); }
        } else if (target.dataset.type === 'location') {
          const locations = Core.getLocations();
          const l = locations.find(x => x.id === target.dataset.id);
          if (l) { l.image = path; await Core.setLocations(locations); }
        }
      }
    }).render(true);
  }

  static async #onAddActorRelation(event, target) {
    event.stopPropagation();
    const entityId = target.dataset.entityId;
    if (!game.user.isGM && !canEditActor(entityId)) return;
    const relType = target.dataset.relType;
    
    PickerApp.openActorPicker({
      filter: a => a.id !== entityId,
      callback: async targetId => {
        if (relType === 'individual') {
          if (Data.getData().individualRelations?.[entityId]?.[targetId] !== undefined) return;
          await Core.setIndRel(entityId, targetId, 0);
        } else if (relType === 'faction') {
          if (Data.getData().factionRelations?.[entityId]?.[targetId] !== undefined) return;
          await Core.setFactionRel(entityId, targetId, 0);
        }
      }
    });
  }

  static async #onAddFactionRelation(event, target) {
    event.stopPropagation();
    const entityId = target.dataset.entityId;
    if (!game.user.isGM && !canEditActor(entityId)) return;
    
    PickerApp.openFactionPicker({
      callback: async factionId => {
        if (Data.getData().actorFactionRelations?.[entityId]?.[factionId] !== undefined) return;
        await Core.setActorFactionRel(entityId, factionId, 0);
      }
    });
  }

  static async #onAddFactionToFactionRelation(event, target) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    const entityId = target.dataset.entityId;
    
    PickerApp.openFactionPicker({
      filter: f => f.id !== entityId,
      callback: async targetFactionId => {
        if (Data.getData().factionToFactionRelations?.[entityId]?.[targetFactionId] !== undefined) return;
        await Core.setFactionToFactionRel(entityId, targetFactionId, 0);
      }
    });
  }

  static async #onRemoveRelation(event, target) {
    event.stopPropagation();
    
    const { relType, entityId, targetId } = target.dataset;
    if (!game.user.isGM && !canEditActor(entityId)) return;
    
    if (relType === 'individual') {
      await Core.removeIndRel(entityId, targetId);
    } else if (relType === 'faction') {
      await Core.removeFactionRel(entityId, targetId);
    } else if (relType === 'actorFaction') {
      await Core.removeActorFactionRel(entityId, targetId);
    } else if (relType === 'factionToFaction') {
      await Core.removeFactionToFactionRel(entityId, targetId);
    }
  }

  static async #onAdjustRep(event, target) {
    event.stopPropagation();
    const { id, type, mode, direction } = target.dataset;
    const delta = (direction === 'plus' ? 1 : -1) * (event.ctrlKey ? 5 : 1);

    if ((mode === 'auto' || mode === 'hybrid') && (type === 'actor' || type === 'faction' || type === 'faction-to-faction')) {
      if (mode === 'auto') {
        if (type === 'actor') {
          const party = Core.getActiveParty();
          if (party) {
            const members = (party.members || []).filter(m => m !== id);
            if (members.length) await Core.addRep(id, members.map(m => m), delta);
          }
        } else if (type === 'faction' || type === 'faction-to-faction') {
          return;
        }
      } else {
        return;
      }

      const container = target.closest('.fame-bar-container');
      if (container) {
        const { getRep: getRepFn } = await import('../core/reputation.js');
        const entityId = type === 'faction-to-faction' ? id.split(':')[0] : id;
        const entityType = (type === 'faction' || type === 'faction-to-faction') ? 'faction' : 'actor';
        const newVal = getRepFn(entityId, entityType);
        this._updateBarVisual(container, newVal);
      }
      return;
    }

    const container = target.closest('.fame-bar-container');
    if (container) {
      const { min, max } = Data.getLimits();
      const valInput = container.querySelector('.fame-bar-val');
      const currentVal = valInput ? +valInput.value : 0;
      this._updateBarVisual(container, Math.max(min, Math.min(max, currentVal + delta)));
    }

    if (type === 'actor') {
      await Core.addRep(id, [], delta, { addBaseRep: true });
    } else if (type === 'faction') {
      await Core.addRep({ type: 'faction', id }, [], delta, { addBaseRep: true });
    } else if (type === 'faction-rel') {
      const [factionId, pcId] = id.split(':');
      await Core.addRep({ type: 'faction', id: factionId }, pcId, delta);
    } else if (type === 'faction-to-faction') {
      const [fId1, fId2] = id.split(':');
      await Core.addRep({ type: 'faction', id: fId1 }, { type: 'faction', id: fId2 }, delta, { notification: 'none' });
    } else if (type === 'actor-faction') {
      const [actorId, factionId] = id.split(':');
      await Core.addRep(actorId, { type: 'faction', id: factionId }, delta);
    } else if (type === 'individual') {
      const [entityId, pcId] = id.split(':');
      await Core.addRep(entityId, pcId, delta);
    }
  }

  static #onToggleDescriptionEdit(event, target) {
    event.stopPropagation();
    const entityId = target.dataset.entityId;
    const entityType = target.dataset.entityType;
    if (!game.user.isGM && !(entityType === 'actor' && canEditActor(entityId))) return;
    const key = `${target.dataset.entityType}:${target.dataset.entityId}`;
    if (this._editingDescriptions.has(key)) {
      this._editingDescriptions.delete(key);
    } else {
      this._editingDescriptions.add(key);
    }
    this.render();
  }

  static #onToggleDescription(event, target) {
    event.stopPropagation();
    const key = target.dataset.descKey;
    const el = target.closest('.fame-description-block');
    if (!key || !el) return;
    el.classList.toggle('collapsed');
    if (el.classList.contains('collapsed')) this.collapsedDescriptions.add(key);
    else this.collapsedDescriptions.delete(key);
    this._saveState();
  }

  static #onToggleDetailSubsection(event, target) {
    event.stopPropagation();
    const id = target.dataset.subsection;
    const el = target.closest('.fame-detail-subsection');
    if (!el || !id) return;
    el.classList.toggle('collapsed');
    if (el.classList.contains('collapsed')) this.collapsedSubsections.add(id);
    else this.collapsedSubsections.delete(id);
    this._saveState();
  }

  static DEFAULT_OPTIONS = {
    id: "fame-relations-viewer",
    classes: ["fame-relations-viewer", "standard-form"],
    position: { width: 1024, height: 768 },
    window: { icon: "fa-solid fa-users", resizable: true },
    actions: {
      selectEntity: RelationsViewerApp.#onSelectEntity,
      toggleNavGroup: RelationsViewerApp.#onToggleNavGroup,
      toggleTreeExpand: RelationsViewerApp.#onToggleTreeExpand,
      toggleDetailSection: RelationsViewerApp.#onToggleDetailSection,
      toggleDetailSubsection: RelationsViewerApp.#onToggleDetailSubsection,
      openActorModePicker: RelationsViewerApp.#onOpenActorModePicker,
      openFactionModePicker: RelationsViewerApp.#onOpenFactionModePicker,
      delete: RelationsViewerApp.#onDelete,
      addMember: RelationsViewerApp.#onAddMember,
      removeMember: RelationsViewerApp.#onRemoveMember,
      addRank: RelationsViewerApp.#onAddRank,
      deleteRank: RelationsViewerApp.#onDeleteRank,
      addFactionToLoc: RelationsViewerApp.#onAddFactionToLoc,
      removeFactionFromLoc: RelationsViewerApp.#onRemoveFactionFromLoc,
      addActorToLoc: RelationsViewerApp.#onAddActorToLoc,
      removeActorFromLoc: RelationsViewerApp.#onRemoveActorFromLoc,
      changeImage: RelationsViewerApp.#onChangeImage,
      adjustRep: RelationsViewerApp.#onAdjustRep,
      toggleHidden: RelationsViewerApp.#onToggleHidden,
      toggleRelationHidden: RelationsViewerApp.#onToggleRelationHidden,
      toggleMemberHidden: RelationsViewerApp.#onToggleMemberHidden,
      toggleLocationItemHidden: RelationsViewerApp.#onToggleLocationItemHidden,
      openLocationCreator: RelationsViewerApp.#onOpenLocationCreator,
      openFactionCreator: RelationsViewerApp.#onOpenFactionCreator,
      openActorCreator: RelationsViewerApp.#onOpenActorCreator,
      openReputationSettings: RelationsViewerApp.#onOpenReputationSettings,
      unnest: RelationsViewerApp.#onUnnest,
      addChildLocation: RelationsViewerApp.#onAddChildLocation,
      addChildFaction: RelationsViewerApp.#onAddChildFaction,
      goToOwner: RelationsViewerApp.#onGoToOwner,
      openOwnerPicker: RelationsViewerApp.#onOpenOwnerPicker,
      openPartyPicker: RelationsViewerApp.#onOpenPartyPicker,
      createActiveParty: RelationsViewerApp.#onCreateActiveParty,
      openActorSheet: RelationsViewerApp.#onOpenActorSheet,
      togglePartyActive: RelationsViewerApp.#onTogglePartyActive,
      setLocationControl: RelationsViewerApp.#onSetLocationControl,
      clearLocationControl: RelationsViewerApp.#onClearLocationControl,
      addActorRelation: RelationsViewerApp.#onAddActorRelation,
      addFactionRelation: RelationsViewerApp.#onAddFactionRelation,
      addFactionToFactionRelation: RelationsViewerApp.#onAddFactionToFactionRelation,
      removeRelation: RelationsViewerApp.#onRemoveRelation,
      toggleDescriptionEdit: RelationsViewerApp.#onToggleDescriptionEdit,
      toggleDescription: RelationsViewerApp.#onToggleDescription,
    }
  };
}