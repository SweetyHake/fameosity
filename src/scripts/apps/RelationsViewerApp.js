import { MODULE_ID } from '../constants.js';
import { getLimits, getTier, escapeHtml, getSettings } from '../data.js';
import { ReputationEvents } from '../events.js';
import {
  getTracked, removeTracked, addTracked,
  getActorRep, setActorRep,
  getDisplayName, getCustomName, setCustomName,
  getPCs, ensureImportant,
  getActorMode, setActorMode, getEffectiveActorRep
} from '../core/actors.js';
import {
  getIndRel, setIndRel,
  getFactionRel, setFactionRel,
  getActorFactionRel, setActorFactionRel,
  adjustIndRels
} from '../core/relations.js';
import {
  isHidden, toggleHidden, filterVisible,
  isRelationHidden, toggleRelationHidden,
  isMemberHidden, toggleMemberHidden,
  isLocationItemHidden, toggleLocationItemHidden,
  isWantedHidden, toggleWantedHidden,
  shouldShowNotification
} from '../core/visibility.js';
import {
  getFactions, getFaction, setFactions,
  addFaction, deleteFaction,
  addFactionMember, removeFactionMember,
  getFactionMode, setFactionMode,
  getFactionRep, changeFactionRep,
  getFactionRank, setMemberRank,
  addFactionRank, updateFactionRank, removeFactionRank,
  getFactionWantedPC, setFactionWantedPC, removeFactionWantedPC
} from '../core/factions.js';
import {
  getLocations, getLocation, setLocations,
  addLocation, deleteLocation,
  addActorToLocation, removeActorFromLocation,
  addFactionToLocation, removeFactionFromLocation,
  getLocationWanted, setLocationWanted, removeWanted
} from '../core/locations.js';
import { showRelationChangeNotification } from '../core/notifications.js';
import { confirmDelete } from '../core/index.js';
import { PickerApp } from './PickerApp.js';

export class RelationsViewerApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: "fame-relations-viewer",
    classes: ["fame-relations-viewer", "standard-form"],
    position: { width: 680, height: 720 },
    window: { icon: "fa-solid fa-users", resizable: true },
    actions: {
      switchTab: RelationsViewerApp.#onSwitchTab,
      switchSubTab: RelationsViewerApp.#onSwitchSubTab,
      toggleExpand: RelationsViewerApp.#onToggleExpand,
      toggleSection: RelationsViewerApp.#onToggleSection,
      cycleActorMode: RelationsViewerApp.#onCycleActorMode,
      cycleFactionMode: RelationsViewerApp.#onCycleFactionMode,
      delete: RelationsViewerApp.#onDelete,
      addFaction: RelationsViewerApp.#onAddFaction,
      addLocation: RelationsViewerApp.#onAddLocation,
      addMember: RelationsViewerApp.#onAddMember,
      removeMember: RelationsViewerApp.#onRemoveMember,
      addRank: RelationsViewerApp.#onAddRank,
      deleteRank: RelationsViewerApp.#onDeleteRank,
      addFactionToLoc: RelationsViewerApp.#onAddFactionToLoc,
      removeFactionFromLoc: RelationsViewerApp.#onRemoveFactionFromLoc,
      addActorToLoc: RelationsViewerApp.#onAddActorToLoc,
      removeActorFromLoc: RelationsViewerApp.#onRemoveActorFromLoc,
      addLocationWanted: RelationsViewerApp.#onAddLocationWanted,
      deleteLocationWanted: RelationsViewerApp.#onDeleteLocationWanted,
      setLocationWantedLevel: RelationsViewerApp.#onSetLocationWantedLevel,
      addFactionWanted: RelationsViewerApp.#onAddFactionWanted,
      deleteFactionWanted: RelationsViewerApp.#onDeleteFactionWanted,
      setFactionWantedLevel: RelationsViewerApp.#onSetFactionWantedLevel,
      changeImage: RelationsViewerApp.#onChangeImage,
      navigate: RelationsViewerApp.#onNavigate,
      adjustRep: RelationsViewerApp.#onAdjustRep,
      toggleHidden: RelationsViewerApp.#onToggleHidden,
      toggleRelationHidden: RelationsViewerApp.#onToggleRelationHidden,
      toggleMemberHidden: RelationsViewerApp.#onToggleMemberHidden,
      toggleLocationItemHidden: RelationsViewerApp.#onToggleLocationItemHidden,
      toggleWantedHidden: RelationsViewerApp.#onToggleWantedHidden
    }
  };

  static PARTS = {
    content: { template: `modules/${MODULE_ID}/templates/relations/main.hbs` }
  };

  tabGroups = { primary: "locations" };

  constructor(options = {}) {
    super(options);
    this.currentTab = null;
    this.characterSubTab = 'locations';
    this.expandedFactions = new Set();
    this.expandedActors = new Set();
    this.expandedLocations = new Set();
    this.collapsedSections = new Set();
    this.scrollPos = 0;
    this._unsubscribers = [];
    this._busy = false;
  }

  get title() {
    return game.i18n.localize(`${MODULE_ID}.relations.viewer-title`);
  }

  _onFirstRender() {
    this._subscribeToEvents();
  }

  _subscribeToEvents() {
    const scheduleRender = foundry.utils.debounce(() => {
      if (this._busy || !this.rendered) return;
      this.render();
    }, 250);
    const events = ReputationEvents.EVENTS;
    this._unsubscribers = Object.values(events).map(event => ReputationEvents.on(event, scheduleRender));
  }

  async close(options = {}) {
    this._unsubscribers.forEach(unsub => typeof unsub === 'function' && unsub());
    this._unsubscribers = [];
    return super.close(options);
  }

  _getSelectedActor() {
    return canvas.tokens?.controlled[0]?.actor || game.user.character || null;
  }

  _isSectionOpen(entityId, sectionType) {
    return this.collapsedSections.has(`${sectionType}-${entityId}-open`);
  }

  _toggleSection(entityId, sectionType) {
    const key = `${sectionType}-${entityId}-open`;
    this.collapsedSections.has(key) ? this.collapsedSections.delete(key) : this.collapsedSections.add(key);
  }

  async _prepareContext(options) {
    const { min, max } = getLimits();
    const isGM = game.user.isGM;
    const pcs = getPCs();
    const selectedActor = this._getSelectedActor();
    const showCharTab = !!selectedActor;

    if (this.currentTab === 'character' && !showCharTab) this.currentTab = 'locations';
    else if (!this.currentTab) this.currentTab = showCharTab ? 'character' : 'locations';

    const rawFactions = getFactions();
    let allActors = getTracked().map(id => this._buildActorData(id, min, max, pcs, rawFactions)).filter(Boolean);
    let allFactions = rawFactions.map(f => this._buildFactionData(f, pcs, min, max, isGM));
    let allLocations = getLocations().map(l => this._buildLocationData(l, allFactions, allActors, isGM));

    if (!isGM) {
      allActors = allActors.filter(a => !a.hidden);
      allFactions = allFactions.filter(f => !f.hidden);
      allLocations = allLocations.filter(l => !l.hidden);
      
      allActors = allActors.map(a => ({
        ...a,
        relations: a.relations.filter(r => !r.hidden),
        factionRelations: a.factionRelations.filter(r => !r.hidden && !r.factionHidden && !r.memberHidden)
      }));
      
      allFactions = allFactions.map(f => ({
        ...f,
        members: f.members.filter(m => !m.hidden && !m.actorHidden),
        factionRels: f.factionRels.filter(r => !r.hidden),
        wantedEntries: f.wantedEntries.filter(w => !w.hidden)
      }));
      
      allLocations = allLocations.map(l => ({
        ...l,
        factionsList: l.factionsList.filter(f => !f.locItemHidden && !f.hidden),
        actorsList: l.actorsList.filter(a => !a.locItemHidden && !a.hidden),
        wantedEntries: l.wantedEntries.filter(w => !w.hidden)
      }));
    }

    const hasPlayerOwner = selectedActor ? Object.entries(selectedActor.ownership || {}).some(([userId, level]) => {
      const user = game.users.get(userId);
      return user && !user.isGM && level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    }) : false;

    const isCharacterOwner = selectedActor ? selectedActor.isOwner : false;
    const canEditOwnAttitude = isCharacterOwner && !isGM;

    let character = null;
    if (selectedActor) {
      character = this._buildCharacterData(selectedActor, allFactions, allActors, allLocations, pcs, hasPlayerOwner, isGM, min, max);
    }

    return {
      min, max, isGM, pcs,
      allActors, allFactions, allLocations,
      selectedActor, showCharTab, hasPlayerOwner, character,
      currentTab: this.currentTab,
      characterSubTab: this.characterSubTab,
      moduleId: MODULE_ID,
      canEditOwnAttitude
    };
  }

  _buildActorData(id, min, max, pcs, rawFactions) {
    const actor = game.actors.get(id);
    if (!actor) return null;
    const mode = getActorMode(id);
    const reputation = getEffectiveActorRep(id);
    const tier = getTier(reputation);
    const hidden = isHidden('actor', id);
    
    const relations = pcs.filter(pc => pc.id !== id).map(pc => {
      const value = getIndRel(id, pc.id);
      const relHidden = isRelationHidden('individual', id, pc.id);
      return {
        pcId: pc.id,
        pcName: getDisplayName(pc.id),
        pcImg: pc.img,
        value,
        tier: getTier(value),
        hidden: relHidden
      };
    });

    const factionRelations = rawFactions.map(faction => {
      const value = getActorFactionRel(id, faction.id);
      const isMember = (faction.members || []).includes(id);
      const memberHidden = isMemberHidden(faction.id, id);
      const rank = isMember ? getFactionRank(faction.id, id) : null;
      const relHidden = isRelationHidden('actorFaction', id, faction.id);
      return {
        factionId: faction.id,
        factionName: faction.name,
        factionImg: faction.image,
        value,
        tier: getTier(value),
        isMember,
        memberHidden,
        rank,
        hidden: relHidden,
        factionHidden: isHidden('faction', faction.id)
      };
    });

    return {
      id, 
      name: getDisplayName(id), 
      originalName: actor.name, 
      customName: getCustomName(id),
      img: actor.img,
      reputation, 
      mode,
      tier,
      hidden,
      expanded: this.expandedActors.has(id),
      relations,
      factionRelations,
      relationsOpen: this._isSectionOpen(id, 'actor-relations'),
      factionsOpen: this._isSectionOpen(id, 'actor-factions')
    };
  }

  _buildFactionData(faction, pcs, min, max, isGM) {
    const mode = getFactionMode(faction.id);
    const reputation = getFactionRep(faction.id);
    const tier = getTier(reputation);
    const hidden = isHidden('faction', faction.id);
    
    const factionRels = pcs.map(pc => {
      const value = getFactionRel(faction.id, pc.id);
      const relHidden = isRelationHidden('faction', faction.id, pc.id);
      return {
        pcId: pc.id,
        pcName: getDisplayName(pc.id),
        pcImg: pc.img,
        value,
        tier: getTier(value),
        hidden: relHidden
      };
    });

    const wantedEntries = Object.entries(faction.wanted || {}).map(([pcId, data]) => {
      const pc = game.actors.get(pcId);
      if (!pc) return null;
      const wantedHidden = data.hidden === true;
      return { 
        pcId, 
        pcName: getDisplayName(pcId), 
        pcImg: pc.img, 
        ...data,
        hidden: wantedHidden,
        stars: Array.from({ length: 6 }, (_, i) => ({ active: i < data.level, value: i + 1 }))
      };
    }).filter(Boolean);

    const members = (faction.members || []).map(id => {
      const actor = game.actors.get(id);
      if (!actor) return null;
      const rank = getFactionRank(faction.id, id);
      const memberHidden = isMemberHidden(faction.id, id);
      return {
        id,
        name: getDisplayName(id),
        img: actor.img,
        rank,
        manualRankId: faction.memberRanks?.[id] || null,
        hidden: memberHidden,
        actorHidden: isHidden('actor', id)
      };
    }).filter(Boolean);

    return {
      ...faction,
      reputation,
      mode,
      tier,
      members,
      hidden,
      expanded: this.expandedFactions.has(faction.id),
      factionRels,
      wantedEntries,
      hasRanks: (faction.ranks || []).length > 0,
      ranksOpen: this._isSectionOpen(faction.id, 'ranks'),
      membersOpen: this._isSectionOpen(faction.id, 'members'),
      relationsOpen: this._isSectionOpen(faction.id, 'relations'),
      wantedOpen: this._isSectionOpen(faction.id, 'faction-wanted')
    };
  }

  _buildLocationData(loc, allFactions, allActors, isGM) {
    const hidden = isHidden('location', loc.id);
    
    const factionsList = (loc.factions || []).map(fId => {
      const faction = allFactions.find(f => f.id === fId);
      if (!faction) return null;
      const locItemHidden = isLocationItemHidden(loc.id, 'faction', fId);
      return { ...faction, locItemHidden };
    }).filter(Boolean);
    
    const actorsList = (loc.actors || []).map(aId => {
      const tracked = allActors.find(a => a.id === aId);
      const locItemHidden = isLocationItemHidden(loc.id, 'actor', aId);
      if (tracked) return { ...tracked, isTracked: true, locItemHidden };
      const actor = game.actors.get(aId);
      return actor ? { id: aId, name: getDisplayName(aId), img: actor.img, isTracked: false, locItemHidden, hidden: isHidden('actor', aId) } : null;
    }).filter(Boolean);

    const wantedEntries = Object.entries(loc.wanted || {}).map(([pcId, data]) => {
      const pc = game.actors.get(pcId);
      if (!pc) return null;
      const wantedHidden = data.hidden === true;
      return { 
        pcId, 
        pcName: getDisplayName(pcId), 
        pcImg: pc.img, 
        ...data,
        hidden: wantedHidden,
        stars: Array.from({ length: 6 }, (_, i) => ({ active: i < data.level, value: i + 1 }))
      };
    }).filter(Boolean);

    return {
      ...loc,
      factionsList,
      actorsList,
      wantedEntries,
      factionCount: factionsList.length,
      actorCount: actorsList.length,
      wantedCount: wantedEntries.filter(w => w.level > 0).length,
      hidden,
      expanded: this.expandedLocations.has(loc.id),
      wantedOpen: this._isSectionOpen(loc.id, 'wanted'),
      factionsOpen: this._isSectionOpen(loc.id, 'loc-factions'),
      actorsOpen: this._isSectionOpen(loc.id, 'loc-actors')
    };
  }

  _buildCharacterData(selectedActor, allFactions, allActors, allLocations, pcs, hasPlayerOwner, isGM, min, max) {
    const characterFactions = allFactions.map(faction => {
      const directRel = getFactionRel(faction.id, selectedActor.id);
      const actorFactionRel = getActorFactionRel(selectedActor.id, faction.id);
      const memberRels = faction.members.filter(m => m.id !== selectedActor.id).map(m => getIndRel(m.id, selectedActor.id));
      const avgMemberRel = memberRels.length ? Math.round(memberRels.reduce((a, b) => a + b, 0) / memberRels.length) : 0;
      const isMember = faction.members.some(m => m.id === selectedActor.id);
      const rank = isMember ? getFactionRank(faction.id, selectedActor.id) : null;
      
      const wantedData = getFactionWantedPC(faction.id, selectedActor.id);
      const hasWanted = wantedData.level > 0;
      
      return { 
        ...faction, 
        directRel, 
        directRelTier: getTier(directRel),
        actorFactionRel,
        actorFactionRelTier: getTier(actorFactionRel),
        avgMemberRel, 
        avgMemberRelTier: getTier(avgMemberRel),
        isMember, 
        rank,
        wanted: {
          ...wantedData,
          stars: Array.from({ length: 6 }, (_, i) => ({ active: i < wantedData.level }))
        },
        hasWanted
      };
    });

    let characterActors;
    if (hasPlayerOwner) {
      characterActors = allActors.filter(a => a.id !== selectedActor.id).map(a => ({
        ...a,
        relationToChar: getIndRel(a.id, selectedActor.id),
        relationToCharTier: getTier(getIndRel(a.id, selectedActor.id)),
        charRelationToThem: getIndRel(selectedActor.id, a.id),
        charRelationToThemTier: getTier(getIndRel(selectedActor.id, a.id)),
        isTracked: true
      }));
    } else {
      characterActors = pcs.filter(pc => pc.id !== selectedActor.id).map(pc => ({
        id: pc.id,
        name: getDisplayName(pc.id),
        img: pc.img,
        relationToChar: getIndRel(selectedActor.id, pc.id),
        relationToCharTier: getTier(getIndRel(selectedActor.id, pc.id)),
        charRelationToThem: getIndRel(pc.id, selectedActor.id),
        charRelationToThemTier: getTier(getIndRel(pc.id, selectedActor.id)),
        hidden: false,
        isTracked: allActors.some(a => a.id === pc.id)
      }));
    }

    const characterLocations = allLocations.map(loc => {
      const wanted = getLocationWanted(loc.id, selectedActor.id);
      const wantedVisible = isGM || !wanted.hidden;
      return { 
        ...loc, 
        wanted: {
          ...wanted,
          stars: Array.from({ length: 6 }, (_, i) => ({ active: i < wanted.level }))
        }, 
        wantedVisible 
      };
    });

    return {
      id: selectedActor.id,
      name: getDisplayName(selectedActor.id),
      customName: getCustomName(selectedActor.id),
      originalName: selectedActor.name,
      img: selectedActor.img,
      factions: characterFactions,
      actors: characterActors,
      locations: characterLocations,
      subTab: this.characterSubTab
    };
  }

  setPosition(position = {}) {
    const saved = game.settings.get(MODULE_ID, "relationsViewerPosition") || {};
    if (position.left !== undefined || position.top !== undefined) {
      game.settings.set(MODULE_ID, "relationsViewerPosition", { 
        left: position.left ?? this.position.left, 
        top: position.top ?? this.position.top 
      });
    }
    return super.setPosition({ ...position, left: position.left ?? saved.left, top: position.top ?? saved.top });
  }

  _onRender(context, options) {
    const html = this.element;
    this._attachInputListeners(html);
    this._attachBarListeners(html);
    if (game.user.isGM) this._attachDropListeners(html);
    this._restoreScroll(html);
    
    const wrapper = html.querySelector('.fame-tab-wrapper');
    if (wrapper) {
      wrapper.addEventListener('scroll', () => this._saveScroll(html), { passive: true });
    }
  }

  _saveScroll(html) {
    const wrapper = html.querySelector('.fame-tab-wrapper');
    if (wrapper) this.scrollPos = wrapper.scrollTop;
  }

  _restoreScroll(html) {
    const wrapper = html.querySelector('.fame-tab-wrapper');
    if (wrapper && this.scrollPos) {
      wrapper.scrollTop = this.scrollPos;
    }
  }

  _attachInputListeners(html) {
    html.querySelectorAll('.fame-entity-name-input, .fame-char-profile-name-input').forEach(input => {
      input.addEventListener('change', async e => {
        const { id, type } = e.target.dataset;
        if (type === 'faction') {
          const factions = getFactions();
          const f = factions.find(x => x.id === id);
          if (f) { f.name = e.target.value; await setFactions(factions); }
        } else if (type === 'location') {
          const locations = getLocations();
          const l = locations.find(x => x.id === id);
          if (l) { l.name = e.target.value; await setLocations(locations); }
        } else {
          await setCustomName(id, e.target.value);
        }
      });
    });

    html.querySelectorAll('.fame-location-wanted-reward, .fame-faction-wanted-reward').forEach(input => {
      input.addEventListener('change', async e => {
        const { location, faction, pc } = e.target.dataset;
        if (location) {
          const cur = getLocationWanted(location, pc);
          await setLocationWanted(location, pc, { ...cur, reward: Math.max(0, parseInt(e.target.value) || 0) });
        } else if (faction) {
          const cur = getFactionWantedPC(faction, pc);
          await setFactionWantedPC(faction, pc, { ...cur, reward: Math.max(0, parseInt(e.target.value) || 0) });
        }
      });
    });

    html.querySelectorAll('.fame-location-wanted-reason, .fame-faction-wanted-reason').forEach(input => {
      input.addEventListener('change', async e => {
        const { location, faction, pc } = e.target.dataset;
        if (location) {
          const cur = getLocationWanted(location, pc);
          await setLocationWanted(location, pc, { ...cur, reason: e.target.value });
        } else if (faction) {
          const cur = getFactionWantedPC(faction, pc);
          await setFactionWantedPC(faction, pc, { ...cur, reason: e.target.value });
        }
      });
    });

    html.querySelectorAll('.fame-faction-wanted-rep-reward').forEach(input => {
      input.addEventListener('change', async e => {
        const cur = getFactionWantedPC(e.target.dataset.faction, e.target.dataset.pc);
        await setFactionWantedPC(e.target.dataset.faction, e.target.dataset.pc, { ...cur, reputationReward: parseInt(e.target.value) || 0 });
      });
    });

    html.querySelectorAll('.fame-rank-name').forEach(input => {
      input.addEventListener('change', async e => {
        await updateFactionRank(e.target.dataset.faction, e.target.dataset.rank, { name: e.target.value });
      });
    });

    html.querySelectorAll('.fame-rank-multiplier').forEach(input => {
      input.addEventListener('change', async e => {
        await updateFactionRank(e.target.dataset.faction, e.target.dataset.rank, { multiplier: parseFloat(e.target.value) || 1 });
      });
    });

    html.querySelectorAll('.fame-rank-color').forEach(input => {
      input.addEventListener('change', async e => {
        await updateFactionRank(e.target.dataset.faction, e.target.dataset.rank, { color: e.target.value });
      });
    });

    html.querySelectorAll('.fame-member-rank-select').forEach(sel => {
      sel.addEventListener('change', async e => {
        await setMemberRank(e.target.dataset.faction, e.target.dataset.actor, e.target.value || null);
      });
    });
  }

  _attachBarListeners(html) {
    html.querySelectorAll('.fame-bar-slider').forEach(slider => {
      slider.addEventListener('input', e => this._updateBarVisual(e.target.closest('.fame-bar-container'), +e.target.value));
      slider.addEventListener('change', async e => {
        await this._handleBarChange(e.target.dataset.id, e.target.dataset.type, +e.target.value);
      });
    });

    html.querySelectorAll('.fame-bar-val:not([readonly])').forEach(input => {
      input.addEventListener('change', async e => {
        const { min, max } = getLimits();
        const value = Math.max(min, Math.min(max, +e.target.value || 0));
        this._updateBarVisual(e.target.closest('.fame-bar-container'), value);
        await this._handleBarChange(e.target.dataset.id, e.target.dataset.type, value);
      });
    });
  }

  _updateBarVisual(container, value) {
    const { min, max } = getLimits();
    const tier = getTier(value);
    const color = tier.color;
    const percentage = ((value - min) / (max - min)) * 100;
    const midPercentage = ((0 - min) / (max - min)) * 100;

    const fill = container.querySelector('.fame-bar-fill');
    if (fill) {
      fill.style.left = `${Math.min(midPercentage, percentage)}%`;
      fill.style.width = `${Math.abs(percentage - midPercentage)}%`;
      fill.style.background = color;
    }

    const thumb = container.querySelector('.fame-bar-thumb');
    if (thumb) {
      thumb.style.left = `${percentage}%`;
      thumb.style.background = color;
    }

    const valueInput = container.querySelector('.fame-bar-val');
    if (valueInput) {
      valueInput.value = value;
      valueInput.style.color = color;
    }

    const slider = container.querySelector('.fame-bar-slider');
    if (slider) slider.value = value;
  }

  async _handleBarChange(id, type, value) {
    if (type === 'faction') {
      const faction = getFaction(id);
      if (!faction) return;
      const oldValue = faction.reputation ?? 0;
      const factions = getFactions();
      const f = factions.find(x => x.id === id);
      if (f) { 
        f.reputation = value; 
        await setFactions(factions);
        if (value !== oldValue && shouldShowNotification('faction', id, null)) {
          getPCs().forEach(pc => showRelationChangeNotification(faction.name, getDisplayName(pc.id), value - oldValue, pc.id, { sourceId: id, targetId: pc.id, relationType: 'faction' }));
        }
      }
    } else if (type === 'faction-rel') {
      const [factionId, pcId] = id.split(':');
      const oldValue = getFactionRel(factionId, pcId);
      await setFactionRel(factionId, pcId, value);
      if (value !== oldValue && shouldShowNotification('faction', factionId, pcId)) {
        const faction = getFaction(factionId);
        if (faction) showRelationChangeNotification(faction.name, getDisplayName(pcId), value - oldValue, pcId, { sourceId: factionId, targetId: pcId, relationType: 'faction' });
      }
    } else if (type === 'actor-faction') {
      const [actorId, factionId] = id.split(':');
      const oldValue = getActorFactionRel(actorId, factionId);
      await setActorFactionRel(actorId, factionId, value);
      if (value !== oldValue && shouldShowNotification('actorFaction', actorId, factionId)) {
        const faction = getFaction(factionId);
        if (faction) showRelationChangeNotification(getDisplayName(actorId), faction.name, value - oldValue, null, { sourceId: actorId, targetId: factionId, relationType: 'actorFaction' });
      }
    } else if (type === 'individual') {
      const [npcId, pcId] = id.split(':');
      const oldValue = getIndRel(npcId, pcId);
      await setIndRel(npcId, pcId, value);
      if (value !== oldValue && shouldShowNotification('individual', npcId, pcId)) {
        showRelationChangeNotification(getDisplayName(npcId), getDisplayName(pcId), value - oldValue, pcId, { sourceId: npcId, targetId: pcId, relationType: 'individual' });
      }
    } else if (type === 'actor') {
      const oldValue = getActorRep(id);
      await setActorRep(id, value);
      if (value !== oldValue && shouldShowNotification('actor', id, null)) {
        getPCs().filter(pc => pc.id !== id).forEach(pc => showRelationChangeNotification(getDisplayName(id), getDisplayName(pc.id), value - oldValue, pc.id, { sourceId: id, targetId: pc.id, relationType: 'individual' }));
      }
    }
  }

  _attachDropListeners(html) {
    const globalDropZone = html.querySelector('.fame-global-drop-zone');
    if (globalDropZone) {
      globalDropZone.addEventListener('dragover', e => { e.preventDefault(); globalDropZone.classList.add('drag-over'); });
      globalDropZone.addEventListener('dragleave', e => { if (!globalDropZone.contains(e.relatedTarget)) globalDropZone.classList.remove('drag-over'); });
      globalDropZone.addEventListener('drop', async e => { 
        e.preventDefault(); 
        globalDropZone.classList.remove('drag-over'); 
        let data; 
        try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; } 
        if (data.type !== 'Actor') return; 
        const actor = await fromUuid(data.uuid); 
        if (!actor) return; 
        if (!actor.hasPlayerOwner) await ensureImportant(actor); 
        await addTracked(actor.id); 
      });
    }

    html.querySelectorAll('.fame-member-drop').forEach(zone => {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', async e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        let data;
        try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
        if (data.type !== 'Actor') return;
        const actor = await fromUuid(data.uuid);
        if (!actor) return;
        if (!actor.hasPlayerOwner) await ensureImportant(actor);
        await addFactionMember(zone.dataset.factionId, actor.id);
      });
    });
  }

  static #onSwitchTab(event, target) { this.currentTab = target.dataset.tab; this.render(); }
  static #onSwitchSubTab(event, target) { this.characterSubTab = target.dataset.subtab; this.render(); }

  static async #onToggleHidden(event, target) {
    if (!game.user.isGM) return;
    await toggleHidden(target.dataset.type, target.dataset.id);
  }

  static async #onToggleRelationHidden(event, target) {
    if (!game.user.isGM) return;
    await toggleRelationHidden(target.dataset.relType, target.dataset.entityId, target.dataset.targetId);
  }

  static async #onToggleMemberHidden(event, target) {
    if (!game.user.isGM) return;
    await toggleMemberHidden(target.dataset.faction, target.dataset.actor);
  }

  static async #onToggleLocationItemHidden(event, target) {
    if (!game.user.isGM) return;
    await toggleLocationItemHidden(target.dataset.location, target.dataset.itemType, target.dataset.itemId);
  }

  static async #onToggleWantedHidden(event, target) {
    if (!game.user.isGM) return;
    await toggleWantedHidden(target.dataset.entityType, target.dataset.entityId, target.dataset.pc);
  }

  static #onToggleExpand(event, target) {
    const { id, type } = target.dataset;
    const set = type === 'faction' ? this.expandedFactions : type === 'actor' ? this.expandedActors : this.expandedLocations;
    set.has(id) ? set.delete(id) : set.add(id);
    this.render();
  }

  static #onToggleSection(event, target) {
    this._toggleSection(target.dataset.entity, target.dataset.section);
    this.render();
  }

  static async #onCycleActorMode(event, target) {
    if (!game.user.isGM) return;
    const modes = ['manual', 'auto', 'hybrid'];
    await setActorMode(target.dataset.id, modes[(modes.indexOf(target.dataset.current) + 1) % 3]);
  }

  static async #onCycleFactionMode(event, target) {
    if (!game.user.isGM) return;
    const modes = ['manual', 'auto', 'hybrid'];
    await setFactionMode(target.dataset.id, modes[(modes.indexOf(target.dataset.current) + 1) % 3]);
  }

  static async #onDelete(event, target) {
    if (!game.user.isGM) return;
    const { id, type } = target.dataset;
    if (!await confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.delete-${type}`))) return;
    if (type === 'faction') { this.expandedFactions.delete(id); await deleteFaction(id); }
    else if (type === 'location') { this.expandedLocations.delete(id); await deleteLocation(id); }
    else { this.expandedActors.delete(id); await removeTracked(id); }
  }

  static async #onAddFaction() { if (!game.user.isGM) return; const f = await addFaction({ name: game.i18n.localize(`${MODULE_ID}.factions.new-faction`) }); this.expandedFactions.add(f.id); }
  static async #onAddLocation() { if (!game.user.isGM) return; const l = await addLocation({ name: game.i18n.localize(`${MODULE_ID}.locations.new-location`) }); this.expandedLocations.add(l.id); }

  static async #onAddMember(event, target) {
    if (!game.user.isGM) return;
    const fac = getFaction(target.dataset.faction);
    PickerApp.openActorPicker({ filter: a => !(fac?.members || []).includes(a.id), callback: async aId => { const actor = game.actors.get(aId); if (actor && !actor.hasPlayerOwner) await ensureImportant(actor); await addFactionMember(target.dataset.faction, aId); }});
  }

  static async #onRemoveMember(event, target) {
    if (!game.user.isGM || !await confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.delete-member`))) return;
    await removeFactionMember(target.dataset.faction, target.dataset.actor);
  }

  static async #onAddRank(event, target) {
    if (!game.user.isGM) return;
    await addFactionRank(target.dataset.faction, { name: game.i18n.localize(`${MODULE_ID}.ranks.new-rank`), color: "#6a6a6a", multiplier: 1 });
    if (!this._isSectionOpen(target.dataset.faction, 'ranks')) this._toggleSection(target.dataset.faction, 'ranks');
  }

  static async #onDeleteRank(event, target) {
    if (!game.user.isGM || !await confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.delete-rank`))) return;
    await removeFactionRank(target.dataset.faction, target.dataset.rank);
  }

  static async #onAddFactionToLoc(event, target) {
    if (!game.user.isGM) return;
    const loc = getLocation(target.dataset.location);
    PickerApp.openFactionPicker({ filter: f => !(loc?.factions || []).includes(f.id), callback: async fId => await addFactionToLocation(target.dataset.location, fId) });
  }

  static async #onRemoveFactionFromLoc(event, target) {
    if (!game.user.isGM || !await confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.remove-from-location`))) return;
    await removeFactionFromLocation(target.dataset.location, target.dataset.faction);
  }

  static async #onAddActorToLoc(event, target) {
    if (!game.user.isGM) return;
    const loc = getLocation(target.dataset.location);
    PickerApp.openActorPicker({ filter: a => !(loc?.actors || []).includes(a.id), callback: async aId => await addActorToLocation(target.dataset.location, aId) });
  }

  static async #onRemoveActorFromLoc(event, target) {
    if (!game.user.isGM || !await confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.remove-from-location`))) return;
    await removeActorFromLocation(target.dataset.location, target.dataset.actor);
  }

  static async #onAddLocationWanted(event, target) {
    if (!game.user.isGM) return;
    const loc = getLocation(target.dataset.location);
    PickerApp.openActorPicker({ filter: a => !Object.keys(loc?.wanted || {}).includes(a.id), callback: async actorId => await setLocationWanted(target.dataset.location, actorId, { level: 0, reason: "", reward: 0, hidden: false }) });
  }

  static async #onDeleteLocationWanted(event, target) {
    if (!game.user.isGM || !await confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.delete-wanted`))) return;
    await removeWanted(target.dataset.location, target.dataset.pc);
  }

  static async #onSetLocationWantedLevel(event, target) {
    if (!game.user.isGM) return;
    const cur = getLocationWanted(target.dataset.location, target.dataset.pc);
    const clicked = parseInt(target.dataset.value);
    await setLocationWanted(target.dataset.location, target.dataset.pc, { ...cur, level: Math.max(0, cur.level === clicked ? clicked - 1 : clicked) });
  }

  static async #onAddFactionWanted(event, target) {
    if (!game.user.isGM) return;
    const faction = getFaction(target.dataset.faction);
    PickerApp.openActorPicker({ filter: a => !Object.keys(faction?.wanted || {}).includes(a.id), callback: async actorId => await setFactionWantedPC(target.dataset.faction, actorId, { level: 0, reason: "", reward: 0, reputationReward: 0 }) });
  }

  static async #onDeleteFactionWanted(event, target) {
    if (!game.user.isGM || !await confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.delete-wanted`))) return;
    await removeFactionWantedPC(target.dataset.faction, target.dataset.pc);
  }

  static async #onSetFactionWantedLevel(event, target) {
    if (!game.user.isGM) return;
    const cur = getFactionWantedPC(target.dataset.faction, target.dataset.pc);
    const clicked = parseInt(target.dataset.value);
    await setFactionWantedPC(target.dataset.faction, target.dataset.pc, { ...cur, level: Math.max(0, cur.level === clicked ? clicked - 1 : clicked) });
  }

  static async #onChangeImage(event, target) {
    if (!game.user.isGM) return;
    new FilePicker({ type: "image", callback: async path => {
      if (target.dataset.type === 'faction') { const factions = getFactions(); const f = factions.find(x => x.id === target.dataset.id); if (f) { f.image = path; await setFactions(factions); } }
      else if (target.dataset.type === 'location') { const locations = getLocations(); const l = locations.find(x => x.id === target.dataset.id); if (l) { l.image = path; await setLocations(locations); } }
    }}).render(true);
  }

  static #onNavigate(event, target) {
    const { type, id } = target.dataset;
    this.currentTab = type === 'faction' ? 'factions' : type === 'actor' ? 'actors' : 'locations';
    (type === 'faction' ? this.expandedFactions : type === 'actor' ? this.expandedActors : this.expandedLocations).add(id);
    this.render();
  }

  static async #onAdjustRep(event, target) {
    const { id, type, mode, direction } = target.dataset;
    const delta = (direction === 'plus' ? 1 : -1) * (event.ctrlKey ? 5 : 1);
    
    if (type === 'actor') {
      if (mode === 'auto') {
        await adjustIndRels(id, delta);
        getPCs().filter(pc => pc.id !== id).forEach(pc => showRelationChangeNotification(getDisplayName(id), getDisplayName(pc.id), delta, pc.id));
      } else {
        await setActorRep(id, getActorRep(id) + delta);
        getPCs().filter(pc => pc.id !== id).forEach(pc => showRelationChangeNotification(getDisplayName(id), getDisplayName(pc.id), delta, pc.id));
      }
    } else if (type === 'faction' && mode !== 'auto') {
      await changeFactionRep(id, delta);
      getPCs().forEach(pc => showRelationChangeNotification(getFaction(id)?.name || '', getDisplayName(pc.id), delta, pc.id));
    } else if (type === 'faction-rel') {
      const [entityId, pcId] = id.split(':');
      await setFactionRel(entityId, pcId, getFactionRel(entityId, pcId) + delta);
      showRelationChangeNotification(getFaction(entityId)?.name || '', getDisplayName(pcId), delta, pcId);
    } else if (type === 'actor-faction') {
      const [actorId, factionId] = id.split(':');
      await setActorFactionRel(actorId, factionId, getActorFactionRel(actorId, factionId) + delta);
      showRelationChangeNotification(getDisplayName(actorId), getFaction(factionId)?.name || '', delta, null);
    } else if (type === 'individual') {
      const [entityId, pcId] = id.split(':');
      await setIndRel(entityId, pcId, getIndRel(entityId, pcId) + delta);
      showRelationChangeNotification(getDisplayName(entityId), getDisplayName(pcId), delta, pcId);
    }
  }
}