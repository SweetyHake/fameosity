import { MODULE_ID } from '../../constants.js';
import * as Core from '../../core/index.js';

export function loadState(app) {
  const saved = game.settings.get(MODULE_ID, "relationsViewerState") || {};
  app.closedNavGroups = new Set(saved.closedNavGroups || ['locations', 'factions', 'pcs', 'npcs']);
  app.openSections = new Set(saved.openSections || []);
  app.collapsedDescriptions = new Set(saved.collapsedDescriptions || []);
  app.collapsedSubsections = new Set(saved.collapsedSubsections || []);
  app.treeExpandedLocations = new Set(saved.treeExpandedLocations || []);
  app.treeExpandedFactions = new Set(saved.treeExpandedFactions || []);
  app.navWidth = saved.navWidth || null;
  app.selectedType = saved.selectedType || null;
  app.selectedId = saved.selectedId || null;
  app.pinnedOwnerActorId = game.user.getFlag(MODULE_ID, 'ownerActorId') || null;
  app.navSearch = '';
  app.scrollPos = saved.scrollPos || 0;
  app.navScrollPos = saved.navScrollPos || 0;
}

export function saveState(app) {
  game.settings.set(MODULE_ID, "relationsViewerState", {
    closedNavGroups: [...app.closedNavGroups],
    openSections: [...app.openSections],
    collapsedDescriptions: [...app.collapsedDescriptions],
    collapsedSubsections: [...app.collapsedSubsections],
    treeExpandedLocations: [...app.treeExpandedLocations],
    treeExpandedFactions: [...app.treeExpandedFactions],
    navWidth: app.navWidth,
    selectedType: app.selectedType,
    selectedId: app.selectedId,
    scrollPos: app.scrollPos,
    navScrollPos: app.navScrollPos
  });
}

export function resolveOwnerActor() {
  const controlled = canvas?.tokens?.controlled?.[0];
  if (controlled?.actor) return controlled.actor.id;
  if (game.user.character) return game.user.character.id;
  const pcs = Core.getPCs();
  if (pcs.length) return pcs[0].id;
  return null;
}

export function resolvePinnedOwner(app) {
  if (app.pinnedOwnerActorId && game.actors.get(app.pinnedOwnerActorId)) {
    return app.pinnedOwnerActorId;
  }
  return resolveOwnerActor();
}

export function ensureTreeExpanded(app, type, id) {
  if (type === 'location') {
    const allLocs = Core.getLocations();
    let current = allLocs.find(l => l.id === id);
    while (current?.parentId) {
      app.treeExpandedLocations.add(current.parentId);
      current = allLocs.find(l => l.id === current.parentId);
    }
    app.closedNavGroups.delete('locations');
  } else if (type === 'faction') {
    const allFacs = Core.getFactions();
    let current = allFacs.find(f => f.id === id);
    while (current?.parentId) {
      app.treeExpandedFactions.add(current.parentId);
      current = allFacs.find(f => f.id === current.parentId);
    }
    app.closedNavGroups.delete('factions');
  } else if (type === 'actor') {
    const isPC = Core.isPlayerCharacter(id);
    app.closedNavGroups.delete(isPC ? 'pcs' : 'npcs');
  }
}

export function restoreNavGroups(html, app) {
  html.querySelectorAll('.fame-nav-group').forEach(g => {
    const group = g.dataset.group;
    if (app.closedNavGroups.has(group)) g.classList.remove('open');
    else g.classList.add('open');
  });
}

export function restoreSections(html, app) {
  html.querySelectorAll('.fame-detail-section').forEach(s => {
    const id = s.dataset.sectionId;
    if (id && app.openSections.has(id)) s.classList.add('open');
    else s.classList.remove('open');
  });
}

export function restoreDescriptions(html, app) {
  html.querySelectorAll('.fame-description-block[data-desc-key]').forEach(b => {
    const key = b.dataset.descKey;
    // description editor is always fully visible; collapse applies to read-only view
    if (b.querySelector('prose-mirror')) {
      app.collapsedDescriptions.delete(key);
      return;
    }
    b.classList.toggle('collapsed', app.collapsedDescriptions.has(key));
  });
}

export function restoreSubsections(html, app) {
  html.querySelectorAll('.fame-detail-subsection[data-subsection-id]').forEach(s => {
    const id = s.dataset.subsectionId;
    s.classList.toggle('collapsed', !!id && app.collapsedSubsections.has(id));
  });
}

export function restoreScroll(html, app) {
  const panel = html.querySelector('.fame-detail-panel');
  if (panel && app.scrollPos) panel.scrollTop = app.scrollPos;
  const navTree = html.querySelector('.fame-nav-tree');
  if (navTree && app.navScrollPos) navTree.scrollTop = app.navScrollPos;
}

export function restoreNavWidth(html, app) {
  if (app.navWidth) {
    const nav = html.querySelector('.fame-navigator');
    if (nav) nav.style.width = `${app.navWidth}px`;
  }
}