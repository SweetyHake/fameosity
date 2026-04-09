import { MODULE_ID } from '../../constants.js';
import * as Core from '../../core/index.js';
import { getData, setData, getDescription, setDescription, getEntityInfo, setEntityInfo } from '../../data.js';
import * as Data from '../../data.js';
import { EntityCreatorApp } from '../EntityCreatorApp.js';

export function attachContextMenu(html, app) {
  html.querySelectorAll('.fame-nav-item[data-entity-type]').forEach(item => {
    item.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      buildAndShowContextMenu(e, item.dataset.entityType, item.dataset.entityId, app);
    });
  });

  html.querySelectorAll('.fame-nav-group-header').forEach(header => {
    header.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      const group = header.dataset.group;
      buildAndShowGroupContextMenu(e, group, app);
    });
  });
}

function getHiddenKey(entityType) {
  if (entityType === 'location') return 'locations';
  if (entityType === 'faction') return 'factions';
  if (entityType === 'actor') return 'actors';
  return null;
}

async function setHiddenState(entityType, entityId, hidden) {
  const data = getData();
  data.hiddenItems ??= { factions: [], actors: [], locations: [] };
  
  const key = getHiddenKey(entityType);
  if (!key) return;
  
  data.hiddenItems[key] ??= [];
  const set = new Set(data.hiddenItems[key]);
  
  if (hidden) {
    set.add(entityId);
  } else {
    set.delete(entityId);
  }
  
  data.hiddenItems[key] = [...set];
  await setData(data);
}

async function hideAllInGroup(group) {
  const data = getData();
  data.hiddenItems ??= { factions: [], actors: [], locations: [] };
  
  if (group === 'locations') {
    const locations = Core.getLocations();
    const ids = locations.map(l => l.id);
    data.hiddenItems.locations = [...new Set([...(data.hiddenItems.locations || []), ...ids])];
  } else if (group === 'factions') {
    const factions = Core.getFactions();
    const activePartyId = Core.getActivePartyId();
    const ids = factions.filter(f => f.id !== activePartyId).map(f => f.id);
    data.hiddenItems.factions = [...new Set([...(data.hiddenItems.factions || []), ...ids])];
  } else if (group === 'pcs') {
    const tracked = Core.getTracked();
    const activeParty = Core.getActiveParty();
    const partyMembers = new Set(activeParty?.members || []);
    const ids = tracked.filter(id => partyMembers.has(id));
    data.hiddenItems.actors = [...new Set([...(data.hiddenItems.actors || []), ...ids])];
  } else if (group === 'npcs') {
    const tracked = Core.getTracked();
    const activeParty = Core.getActiveParty();
    const partyMembers = new Set(activeParty?.members || []);
    const ids = tracked.filter(id => !partyMembers.has(id));
    data.hiddenItems.actors = [...new Set([...(data.hiddenItems.actors || []), ...ids])];
  }
  
  await setData(data);
}

async function showAllInGroup(group) {
  const data = getData();
  data.hiddenItems ??= { factions: [], actors: [], locations: [] };
  
  if (group === 'locations') {
    data.hiddenItems.locations = [];
  } else if (group === 'factions') {
    data.hiddenItems.factions = [];
  } else if (group === 'pcs') {
    const activeParty = Core.getActiveParty();
    const partyMembers = new Set(activeParty?.members || []);
    data.hiddenItems.actors = (data.hiddenItems.actors || []).filter(id => !partyMembers.has(id));
  } else if (group === 'npcs') {
    const activeParty = Core.getActiveParty();
    const partyMembers = new Set(activeParty?.members || []);
    data.hiddenItems.actors = (data.hiddenItems.actors || []).filter(id => partyMembers.has(id));
  }
  
  await setData(data);
}

function getDescendants(items, parentId) {
  const result = [];
  const children = items.filter(i => i.parentId === parentId);
  for (const child of children) {
    result.push(child);
    result.push(...getDescendants(items, child.id));
  }
  return result;
}

async function hideAllNested(entityType, entityId) {
  const data = getData();
  data.hiddenItems ??= { factions: [], actors: [], locations: [] };
  
  const key = getHiddenKey(entityType);
  if (!key) return;
  
  let allItems = [];
  if (entityType === 'location') {
    allItems = Core.getLocations();
  } else if (entityType === 'faction') {
    allItems = Core.getFactions();
  }
  
  const descendants = getDescendants(allItems, entityId);
  const idsToHide = [entityId, ...descendants.map(d => d.id)];
  
  data.hiddenItems[key] = [...new Set([...(data.hiddenItems[key] || []), ...idsToHide])];
  await setData(data);
}

async function showAllNested(entityType, entityId) {
  const data = getData();
  data.hiddenItems ??= { factions: [], actors: [], locations: [] };
  
  const key = getHiddenKey(entityType);
  if (!key) return;
  
  let allItems = [];
  if (entityType === 'location') {
    allItems = Core.getLocations();
  } else if (entityType === 'faction') {
    allItems = Core.getFactions();
  }
  
  const descendants = getDescendants(allItems, entityId);
  const idsToShow = new Set([entityId, ...descendants.map(d => d.id)]);
  
  data.hiddenItems[key] = (data.hiddenItems[key] || []).filter(id => !idsToShow.has(id));
  await setData(data);
}

function hasChildren(entityType, entityId) {
  if (entityType === 'location') {
    const allLocs = Core.getLocations();
    return allLocs.some(l => l.parentId === entityId);
  } else if (entityType === 'faction') {
    const allFacs = Core.getFactions();
    return allFacs.some(f => f.parentId === entityId);
  }
  return false;
}

function canAddChild(entityType, entityId) {
  if (entityType === 'location') {
    const loc = Core.getLocation(entityId);
    if (!loc) return false;
    const validChildren = Core.getValidChildLocationTypes(loc.locationType);
    return validChildren.length > 0;
  } else if (entityType === 'faction') {
    const fac = Core.getFaction(entityId);
    if (!fac) return false;
    const validChildren = Core.getValidChildFactionTypes(fac.factionType);
    return validChildren.length > 0;
  }
  return false;
}

async function addToPartyRelations(actorId) {
  const activeParty = Core.getActiveParty();
  if (!activeParty) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.remember.warn-no-party`));
    return;
  }
  
  const partyMembers = activeParty.members || [];
  if (partyMembers.length === 0) {
    return;
  }
  
  const data = Data.getData();
  data.individualRelations ??= {};
  
  for (const memberId of partyMembers) {
    if (memberId === actorId) continue;
    
    data.individualRelations[memberId] ??= {};
    
    if (data.individualRelations[memberId][actorId] === undefined) {
      data.individualRelations[memberId][actorId] = 0;
    }
  }
  
  await Data.setData(data);
}

export async function buildAndShowGroupContextMenu(event, group, app) {
  document.querySelectorAll('.fame-context-menu').forEach(m => m.remove());

  if (!game.user.isGM) return;

  const items = [];

  if (group === 'locations') {
    items.push({
      icon: 'fa-solid fa-plus',
      label: game.i18n.localize(`${MODULE_ID}.locations.add`),
      action: () => {
        EntityCreatorApp.openLocationCreator();
      }
    });
    items.push({ separator: true });
  } else if (group === 'factions') {
    items.push({
      icon: 'fa-solid fa-plus',
      label: game.i18n.localize(`${MODULE_ID}.factions.add`),
      action: () => {
        EntityCreatorApp.openFactionCreator();
      }
    });
    items.push({ separator: true });
  } else if (group === 'pcs' || group === 'npcs') {
    items.push({
      icon: 'fa-solid fa-plus',
      label: game.i18n.localize(`${MODULE_ID}.creator.title-actor`),
      action: () => {
        EntityCreatorApp.openActorCreator();
      }
    });
    items.push({ separator: true });
  }

  items.push({
    icon: 'fa-solid fa-eye-slash',
    label: game.i18n.localize(`${MODULE_ID}.context.hide-all`),
    action: async () => {
      app._busy = true;
      await hideAllInGroup(group);
      app._busy = false;
      app.render();
    }
  });

  items.push({
    icon: 'fa-solid fa-eye',
    label: game.i18n.localize(`${MODULE_ID}.context.show-all`),
    action: async () => {
      app._busy = true;
      await showAllInGroup(group);
      app._busy = false;
      app.render();
    }
  });

  renderContextMenu(event, items);
}

export async function buildAndShowContextMenu(event, entityType, entityId, app) {
  document.querySelectorAll('.fame-context-menu').forEach(m => m.remove());

  const isGM = game.user.isGM;
  const items = [];

  items.push({
    icon: 'fa-solid fa-eye',
    label: game.i18n.localize(`${MODULE_ID}.context.select`),
    action: () => {
      app.selectedType = entityType;
      app.selectedId = entityId;
      app.scrollPos = 0;
      app._ensureTreeExpanded(entityType, entityId);
      app._saveState();
      app.render();
    }
  });

  if (entityType === 'actor') {
    const actor = game.actors.get(entityId);
    if (actor?.isOwner) {
      items.push({
        icon: 'fa-solid fa-id-card',
        label: game.i18n.localize(`${MODULE_ID}.context.open-sheet`),
        action: () => actor.sheet?.render(true)
      });
    }
    
    if (isGM) {
      const activeParty = Core.getActiveParty();
      const isPartyMember = activeParty && (activeParty.members || []).includes(entityId);
      
      if (!isPartyMember && activeParty) {
        items.push({
          icon: 'fa-solid fa-handshake',
          label: game.i18n.localize(`${MODULE_ID}.context.add-to-relations`),
          action: async () => {
            app._busy = true;
            await addToPartyRelations(entityId);
            app._busy = false;
            app.render();
          }
        });
      }
    }
  }

  if (isGM && entityType === 'faction') {
    const faction = Core.getFaction(entityId);
    if (faction?.factionType === 'group') {
      const isActive = Core.isActiveParty(entityId);
      if (!isActive) {
        items.push({
          icon: 'fa-solid fa-star',
          label: game.i18n.localize(`${MODULE_ID}.context.activate-party`),
          action: async () => {
            app._busy = true;
            await Core.activateParty(entityId);
            app._busy = false;
            app.render();
          }
        });
      }
    }
  }

  if (isGM) {
    if (entityType === 'location' && canAddChild('location', entityId)) {
      items.push({
        icon: 'fa-solid fa-sitemap',
        label: game.i18n.localize(`${MODULE_ID}.context.add-child-location`),
        action: () => {
          EntityCreatorApp.openLocationCreator(entityId);
        }
      });
    }

    if (entityType === 'faction' && canAddChild('faction', entityId)) {
      items.push({
        icon: 'fa-solid fa-sitemap',
        label: game.i18n.localize(`${MODULE_ID}.context.add-child-faction`),
        action: () => {
          EntityCreatorApp.openFactionCreator(entityId);
        }
      });
    }

    if (entityType !== 'actor') {
      items.push({
        icon: 'fa-solid fa-copy',
        label: game.i18n.localize(`${MODULE_ID}.context.duplicate`),
        action: async () => {
          app._busy = true;
          await duplicateEntity(entityType, entityId);
          app._busy = false;
          app.render();
        }
      });
    }

    items.push({ separator: true });

    const isHidden = Core.isHidden(entityType, entityId);
    items.push({
      icon: isHidden ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash',
      label: game.i18n.localize(`${MODULE_ID}.tooltips.${isHidden ? 'show' : 'hide'}`),
      action: async () => {
        app._busy = true;
        await setHiddenState(entityType, entityId, !isHidden);
        app._busy = false;
        app.render();
      }
    });

    if ((entityType === 'location' || entityType === 'faction') && hasChildren(entityType, entityId)) {
      items.push({
        icon: 'fa-solid fa-eye-slash',
        label: game.i18n.localize(`${MODULE_ID}.context.hide-all-nested`),
        action: async () => {
          app._busy = true;
          await hideAllNested(entityType, entityId);
          app._busy = false;
          app.render();
        }
      });

      items.push({
        icon: 'fa-solid fa-eye',
        label: game.i18n.localize(`${MODULE_ID}.context.show-all-nested`),
        action: async () => {
          app._busy = true;
          await showAllNested(entityType, entityId);
          app._busy = false;
          app.render();
        }
      });
    }

    items.push({ separator: true });

    items.push({
      icon: 'fa-solid fa-trash',
      label: game.i18n.localize(`${MODULE_ID}.tooltips.delete`),
      danger: true,
      action: async () => {
        if (!await Core.confirmDelete(
          game.i18n.localize(`${MODULE_ID}.confirm.delete-title`),
          game.i18n.localize(`${MODULE_ID}.confirm.delete-${entityType}`)
        )) return;
        
        app._busy = true;
        if (entityType === 'faction') await Core.deleteFaction(entityId);
        else if (entityType === 'location') await Core.deleteLocation(entityId);
        else await Core.removeTracked(entityId);
        
        if (app.selectedId === entityId) {
          app.selectedType = null;
          app.selectedId = null;
          app._saveState();
        }
        app._busy = false;
        app.render();
      }
    });
  }

  renderContextMenu(event, items);
}

async function duplicateEntity(entityType, entityId) {
  const suffix = game.i18n.localize(`${MODULE_ID}.context.copy-suffix`);
  
  if (entityType === 'location') {
    const loc = Core.getLocation(entityId);
    if (loc) {
      const newLoc = await Core.addLocation({
        name: `${loc.name} (${suffix})`,
        locationType: loc.locationType,
        customTypeName: loc.customTypeName || "",
        parentId: loc.parentId,
        image: loc.image,
        factions: [...(loc.factions || [])],
        actors: [...(loc.actors || [])]
      });
      
      const description = Data.getDescription('locations', entityId);
      if (description) {
        await Data.setDescription('locations', newLoc.id, description);
      }
      
      const info = Data.getEntityInfo('locations', entityId);
      if (info && (info.public || info.gm)) {
        await Data.setEntityInfo('locations', newLoc.id, { ...info });
      }
    }
  } else if (entityType === 'faction') {
    const fac = Core.getFaction(entityId);
    if (fac) {
      const newFac = await Core.addFaction({
        name: `${fac.name} (${suffix})`,
        factionType: fac.factionType,
        customTypeName: fac.customTypeName || "",
        parentId: fac.parentId,
        image: fac.image,
        members: [...(fac.members || [])],
        ranks: (fac.ranks || []).map(r => ({
          id: foundry.utils.randomID(),
          name: r.name,
          minReputation: r.minReputation,
          color: r.color,
          multiplier: r.multiplier
        })),
        memberRanks: {}
      });
      
      if (fac.memberRanks && fac.ranks?.length) {
        const factions = Core.getFactions();
        const newFacData = factions.find(f => f.id === newFac.id);
        if (newFacData) {
          const oldToNewRankMap = {};
          (fac.ranks || []).forEach((oldRank, idx) => {
            if (newFacData.ranks[idx]) {
              oldToNewRankMap[oldRank.id] = newFacData.ranks[idx].id;
            }
          });
          newFacData.memberRanks = {};
          for (const [actorId, oldRankId] of Object.entries(fac.memberRanks)) {
            if (oldToNewRankMap[oldRankId]) {
              newFacData.memberRanks[actorId] = oldToNewRankMap[oldRankId];
            }
          }
          await Core.setFactions(factions);
        }
      }
      
      const description = Data.getDescription('factions', entityId);
      if (description) {
        await Data.setDescription('factions', newFac.id, description);
      }
      
      const info = Data.getEntityInfo('factions', entityId);
      if (info && (info.public || info.gm)) {
        await Data.setEntityInfo('factions', newFac.id, { ...info });
      }
      
      const data = Data.getData();
      
      if (data.factionRelations?.[entityId]) {
        data.factionRelations[newFac.id] = { ...data.factionRelations[entityId] };
      }
      
      if (data.factionToFactionRelations?.[entityId]) {
        data.factionToFactionRelations[newFac.id] = { ...data.factionToFactionRelations[entityId] };
      }
      
      await Data.setData(data);
    }
  }
}

function renderContextMenu(event, items) {
  const menu = document.createElement('div');
  menu.className = 'fame-context-menu';
  
  menu.style.position = 'fixed';
  menu.style.visibility = 'hidden';
  menu.style.zIndex = '10000';

  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'fame-context-separator';
      menu.appendChild(sep);
      continue;
    }

    const row = document.createElement('div');
    row.className = `fame-context-item${item.danger ? ' danger' : ''}`;
    row.innerHTML = `<i class="${item.icon}"></i><span>${item.label}</span>`;
    row.addEventListener('click', async e => {
      e.stopPropagation();
      menu.remove();
      await item.action();
    });
    menu.appendChild(row);
  }

  document.body.appendChild(menu);

  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    let x = event.clientX;
    let y = event.clientY;

    if (x + rect.width > window.innerWidth) {
      x = window.innerWidth - rect.width - 5;
    }
    if (y + rect.height > window.innerHeight) {
      y = window.innerHeight - rect.height - 5;
    }

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.visibility = 'visible';
  });

  const closeHandler = e => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeHandler);
      document.removeEventListener('contextmenu', closeHandler);
    }
  };

  setTimeout(() => {
    document.addEventListener('click', closeHandler);
    document.addEventListener('contextmenu', closeHandler);
  }, 0);
}