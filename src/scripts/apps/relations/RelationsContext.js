import { MODULE_ID } from '../../constants.js';
import * as Data from '../../data.js';
import * as Core from '../../core/index.js';
import { getMode, setMode } from '../../core/reputation.js';

export function attachContextMenu(html, app) {
  html.querySelectorAll('.fame-nav-item[data-entity-type]').forEach(item => {
    item.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      buildAndShowContextMenu(e, item.dataset.entityType, item.dataset.entityId, app);
    });
  });
}

export async function buildAndShowContextMenu(event, entityType, entityId, app) {
  document.querySelectorAll('.fame-context-menu').forEach(m => m.remove());

  const isGM = game.user.isGM;
  const items = [];

  items.push({
    icon: 'fa-solid fa-eye',
    label: game.i18n.localize(`${MODULE_ID}.context.select`),
    action: () => { app.selectedType = entityType; app.selectedId = entityId; app.scrollPos = 0; app._ensureTreeExpanded(entityType, entityId); app._saveState(); app.render(); }
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
  }

  if (isGM && entityType === 'faction') {
    const faction = Core.getFaction(entityId);
    if (faction?.factionType === 'group') {
      const isActive = Core.isActiveParty(entityId);
      if (!isActive) {
        items.push({
          icon: 'fa-solid fa-star',
          label: game.i18n.localize(`${MODULE_ID}.context.activate-party`),
          action: async () => { await Core.activateParty(entityId); }
        });
      }
    }
  }

  if (isGM) {
    if (entityType !== 'actor') {
      items.push({
        icon: 'fa-solid fa-copy',
        label: game.i18n.localize(`${MODULE_ID}.context.duplicate`),
        action: async () => { await duplicateEntity(entityType, entityId); }
      });
    }

    const hiddenState = Core.isHidden(entityType, entityId);
    items.push({
      icon: hiddenState ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash',
      label: hiddenState ? game.i18n.localize(`${MODULE_ID}.tooltips.show`) : game.i18n.localize(`${MODULE_ID}.tooltips.hide`),
      action: async () => { await Core.toggleHidden(entityType, entityId); }
    });

    if (entityType === 'location') {
      const loc = Core.getLocation(entityId);
      if (loc && Core.getValidChildLocationTypes(loc.locationType).length > 0) {
        items.push({ icon: 'fa-solid fa-plus', label: game.i18n.localize(`${MODULE_ID}.tooltips.add-child`), action: () => { import('../EntityCreatorApp.js').then(m => m.EntityCreatorApp.openLocationCreator(entityId)); } });
      }
      if (loc?.parentId) {
        items.push({ icon: 'fa-solid fa-arrow-up', label: game.i18n.localize(`${MODULE_ID}.tooltips.unnest`), action: async () => { await Core.setLocationParent(entityId, null); } });
      }
    }

    if (entityType === 'faction') {
      const fac = Core.getFaction(entityId);
      if (fac && Core.getValidChildFactionTypes(fac.factionType).length > 0) {
        items.push({ icon: 'fa-solid fa-plus', label: game.i18n.localize(`${MODULE_ID}.tooltips.add-child`), action: () => { import('../EntityCreatorApp.js').then(m => m.EntityCreatorApp.openFactionCreator(entityId)); } });
      }
      if (fac?.parentId) {
        items.push({ icon: 'fa-solid fa-arrow-up', label: game.i18n.localize(`${MODULE_ID}.tooltips.unnest`), action: async () => { await Core.setFactionParent(entityId, null); } });
      }
    }

    items.push({ separator: true });

    items.push({
      icon: 'fa-solid fa-trash',
      label: game.i18n.localize(`${MODULE_ID}.tooltips.delete`),
      danger: true,
      action: async () => {
        const typeKey = entityType === 'actor' ? 'actor' : entityType;
        if (!await Core.confirmDelete(game.i18n.localize(`${MODULE_ID}.confirm.delete-title`), game.i18n.localize(`${MODULE_ID}.confirm.delete-${typeKey}`))) return;
        if (entityType === 'faction') await Core.deleteFaction(entityId);
        else if (entityType === 'location') await Core.deleteLocation(entityId);
        else await Core.removeTracked(entityId);
        if (app.selectedId === entityId) { app.selectedType = null; app.selectedId = null; app._saveState(); }
      }
    });
  }

  renderContextMenu(event, items);
}

function renderContextMenu(event, items) {
  const menu = document.createElement('div');
  menu.className = 'fame-context-menu';
  menu.style.cssText = 'position:fixed;z-index:100000';

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
    row.addEventListener('click', e => { e.stopPropagation(); menu.remove(); item.action(); });
    menu.appendChild(row);
  }

  document.body.appendChild(menu);

  const rect = menu.getBoundingClientRect();
  let x = event.clientX;
  let y = event.clientY;
  if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
  if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const closeMenu = (e) => {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', closeMenu); }
  };
  setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
}

async function duplicateEntity(entityType, entityId) {
  const copyLabel = game.i18n.localize(`${MODULE_ID}.context.copy-suffix`) || 'Copy';

  if (entityType === 'location') {
    const loc = Core.getLocation(entityId);
    if (!loc) return;
    const newLoc = await Core.addLocation({
      name: `${loc.name} (${copyLabel})`, image: loc.image, locationType: loc.locationType,
      parentId: loc.parentId, factions: [...(loc.factions || [])],
      actors: [...(loc.actors || [])], wanted: foundry.utils.deepClone(loc.wanted || {})
    });
    const desc = Data.getDescription('locations', entityId);
    if (desc) await Data.setDescription('locations', newLoc.id, desc);
  } else if (entityType === 'faction') {
    const fac = Core.getFaction(entityId);
    if (!fac) return;
    const newFac = await Core.addFaction({
      name: `${fac.name} (${copyLabel})`, image: fac.image, factionType: fac.factionType,
      parentId: fac.parentId, members: [...(fac.members || [])],
      ranks: foundry.utils.deepClone(fac.ranks || []),
      memberRanks: foundry.utils.deepClone(fac.memberRanks || {})
    });
    const mode = getMode(entityId, 'faction');
    if (mode !== 'manual') await setMode(newFac.id, 'faction', mode);
    const desc = Data.getDescription('factions', entityId);
    if (desc) await Data.setDescription('factions', newFac.id, desc);
  }
}