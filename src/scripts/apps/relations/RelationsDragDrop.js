import * as Core from '../../core/index.js';
import * as Data from '../../data.js';

function _extractDragData(event) {
  let data = null;
  try {
    data = JSON.parse(event.dataTransfer.getData('text/plain'));
  } catch {}

  if (!data?.type) {
    try {
      const types = event.dataTransfer.types || [];
      for (const t of types) {
        if (t === 'text/plain') continue;
        try {
          data = JSON.parse(event.dataTransfer.getData(t));
          if (data?.type) break;
        } catch {}
      }
    } catch {}
  }

  if (!data?.type) {
    try {
      data = TextEditor.getDragEventData?.(event);
    } catch {}
  }

  return data?.type ? data : null;
}

export function attachDropListeners(html) {
  const dropZone = html.querySelector('.fame-global-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', e => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', async e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      let data = _extractDragData(e);
      if (!data || data.type !== 'Actor') return;
      let actor;
      if (data.uuid) actor = await fromUuid(data.uuid);
      else if (data.id) actor = game.actors.get(data.id);
      if (!actor) return;
      if (!actor.hasPlayerOwner) await Core.ensureImportant(actor);
      await Core.addTracked(actor.id);
    });
  }

  html.querySelectorAll('.fame-member-drop').forEach(zone => {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', async e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      let data = _extractDragData(e);
      if (!data || data.type !== 'Actor') return;
      let actor;
      if (data.uuid) actor = await fromUuid(data.uuid);
      else if (data.id) actor = game.actors.get(data.id);
      if (!actor) return;
      if (!actor.hasPlayerOwner) await Core.ensureImportant(actor);
      await Core.addFactionMember(zone.dataset.factionId, actor.id);
    });
  });
}

export function attachNestingDragDrop(html, app) {
  html.querySelectorAll('.fame-nav-item[data-entity-type="location"], .fame-nav-item[data-entity-type="faction"]').forEach(item => {
    item.setAttribute('draggable', 'true');

    item.addEventListener('dragstart', e => {
      e.stopPropagation();
      e.dataTransfer.setData('application/json', JSON.stringify({ type: item.dataset.entityType, id: item.dataset.entityId }));
      e.dataTransfer.effectAllowed = 'move';
      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      html.querySelectorAll('.fame-drop-highlight').forEach(el => el.classList.remove('fame-drop-highlight'));
    });

    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      const dragging = html.querySelector('.fame-nav-item.dragging');
      if (!dragging || dragging === item || dragging.dataset.entityType !== item.dataset.entityType) return;
      item.classList.add('fame-drop-highlight');
      e.dataTransfer.dropEffect = 'move';
    });

    item.addEventListener('dragleave', e => {
      if (!item.contains(e.relatedTarget)) item.classList.remove('fame-drop-highlight');
    });

    item.addEventListener('drop', async e => {
      e.preventDefault();
      e.stopPropagation();
      item.classList.remove('fame-drop-highlight');
      let data;
      try { data = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }
      if (!data?.type || !data?.id || data.id === item.dataset.entityId || data.type !== item.dataset.entityType) return;
      const targetId = item.dataset.entityId;
      if (data.type === 'location') {
        const allLocs = Core.getLocations();
        const child = allLocs.find(l => l.id === data.id);
        const parent = allLocs.find(l => l.id === targetId);
        if (!child || !parent || Core.isDescendant(allLocs, data.id, targetId)) return;
        if (!Core.canNestLocation(parent.locationType, child.locationType)) {
          ui.notifications.warn(game.i18n.localize(`fameosity.errors.cannotNest`));
          return;
        }
        await Core.setLocationParent(data.id, targetId);
        app.treeExpandedLocations.add(targetId);
      } else if (data.type === 'faction') {
        const allFacs = Core.getFactions();
        const child = allFacs.find(f => f.id === data.id);
        const parent = allFacs.find(f => f.id === targetId);
        if (!child || !parent || Core.isDescendant(allFacs, data.id, targetId)) return;
        if (!Core.canNestFaction(parent.factionType, child.factionType)) {
          ui.notifications.warn(game.i18n.localize(`fameosity.errors.cannotNest`));
          return;
        }
        await Core.setFactionParent(data.id, targetId);
        app.treeExpandedFactions.add(targetId);
      }
    });
  });

  html.querySelectorAll('.fame-nav-group-header[data-group="locations"], .fame-nav-group-header[data-group="factions"]').forEach(header => {
    header.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      const dragging = html.querySelector('.fame-nav-item.dragging');
      if (!dragging) return;
      const expectedType = header.dataset.group === 'locations' ? 'location' : 'faction';
      if (dragging.dataset.entityType !== expectedType) return;
      header.classList.add('fame-drop-highlight');
      e.dataTransfer.dropEffect = 'move';
    });
    header.addEventListener('dragleave', e => {
      if (!header.contains(e.relatedTarget)) header.classList.remove('fame-drop-highlight');
    });
    header.addEventListener('drop', async e => {
      e.preventDefault();
      e.stopPropagation();
      header.classList.remove('fame-drop-highlight');
      let data;
      try { data = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }
      if (!data?.type || !data?.id) return;
      if (data.type === 'location') await Core.setLocationParent(data.id, null);
      else if (data.type === 'faction') await Core.setFactionParent(data.id, null);
    });
  });
}

export function attachNavItemDrag(html) {
  html.querySelectorAll('.fame-nav-item[data-entity-type="actor"]').forEach(item => {
    item.setAttribute('draggable', 'true');
    item.addEventListener('dragstart', e => {
      e.stopPropagation();
      const actorId = item.dataset.entityId;
      const actor = game.actors.get(actorId);
      const fameData = JSON.stringify({ type: 'actor', id: actorId });
      e.dataTransfer.setData('application/fame-nav', fameData);
      if (actor) {
        const foundryData = JSON.stringify({ type: 'Actor', uuid: actor.uuid });
        e.dataTransfer.setData('text/plain', foundryData);
      }
      e.dataTransfer.effectAllowed = 'copyMove';
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      html.querySelectorAll('.fame-drop-highlight').forEach(el => el.classList.remove('fame-drop-highlight'));
    });
  });

  html.querySelectorAll('.fame-nav-item[data-entity-type="faction"]').forEach(item => {
    if (!item.getAttribute('draggable')) item.setAttribute('draggable', 'true');
    item.addEventListener('dragstart', e => {
      e.stopPropagation();
      e.dataTransfer.setData('application/fame-nav', JSON.stringify({ type: 'faction', id: item.dataset.entityId }));
      e.dataTransfer.setData('application/json', JSON.stringify({ type: item.dataset.entityType, id: item.dataset.entityId }));
      e.dataTransfer.effectAllowed = 'copyMove';
      item.classList.add('dragging');
    });
  });
}

export function attachDetailSectionDrop(html) {
  attachSectionDropByPrefix(html, 'fac-members-', async (sectionEl, factionId, data) => {
    if (data?.type === 'actor') await Core.addFactionMember(factionId, data.id);
  }, true);

  attachSectionDropByPrefix(html, 'loc-actors-', async (sectionEl, locationId, data) => {
    if (data?.type === 'actor') await Core.addActorToLocation(locationId, data.id);
  }, true);

  attachSectionDropByPrefix(html, 'loc-factions-', async (sectionEl, locationId, data) => {
    if (data?.type === 'faction') await Core.addFactionToLocation(locationId, data.id);
  }, false);
}

function attachSectionDropByPrefix(html, prefix, handler, acceptActorSidebar) {
  html.querySelectorAll(`.fame-detail-section[data-section-id^="${prefix}"]`).forEach(section => {
    const entityId = section.dataset.sectionId?.replace(prefix, '');
    if (!entityId) return;

    const setupDropTarget = (target) => {
      target.addEventListener('dragover', e => {
        e.preventDefault();
        e.stopPropagation();
        section.classList.add('fame-drop-highlight');
        e.dataTransfer.dropEffect = 'copy';
      });
      target.addEventListener('dragleave', e => {
        if (!section.contains(e.relatedTarget)) section.classList.remove('fame-drop-highlight');
      });
      target.addEventListener('drop', async e => {
        e.preventDefault();
        e.stopPropagation();
        section.classList.remove('fame-drop-highlight');

        let data;
        try { data = JSON.parse(e.dataTransfer.getData('application/fame-nav')); } catch {}

        if (!data && acceptActorSidebar) {
          const raw = _extractDragData(e);
          if (raw?.type === 'Actor') {
            let actor;
            if (raw.uuid) actor = await fromUuid(raw.uuid);
            else if (raw.id) actor = game.actors.get(raw.id);
            if (actor) {
              if (!actor.hasPlayerOwner) await Core.ensureImportant(actor);
              await Core.addTracked(actor.id);
              data = { type: 'actor', id: actor.id };
            }
          }
        }

        if (data) await handler(section, entityId, data);
      });
    };

    const header = section.querySelector('.fame-detail-section-header');
    const body = section.querySelector('.fame-detail-section-body');
    if (header) setupDropTarget(header);
    if (body) setupDropTarget(body);
  });
}

export function attachNavTreeSidebarDrop(html, app) {
  const handleSidebarDrop = async (e) => {
    let rawData;
    try {
      rawData = JSON.parse(e.dataTransfer.getData('text/plain'));
    } catch {
      try {
        const types = e.dataTransfer.types || [];
        for (const t of types) {
          if (t === 'text/plain' || t === 'application/json') continue;
          try {
            rawData = JSON.parse(e.dataTransfer.getData(t));
            if (rawData?.type) break;
          } catch {}
        }
      } catch {}
    }

    if (!rawData) {
      try {
        rawData = TextEditor.getDragEventData?.(e);
      } catch {}
    }

    if (!rawData?.type) return;

    if (rawData.type === 'Actor') {
      let actor;
      if (rawData.uuid) actor = await fromUuid(rawData.uuid);
      else if (rawData.id) actor = game.actors.get(rawData.id);
      if (actor) await handleActorSidebarDrop(actor);
    } else if (rawData.type === 'Folder') {
      let folder;
      if (rawData.uuid) folder = await fromUuid(rawData.uuid);
      else if (rawData.id) folder = game.folders.get(rawData.id);
      if (folder?.type === 'Actor') await handleFolderSidebarDrop(folder);
    }
  };

  const setupDropTarget = (el) => {
    if (!el) return;
    el.addEventListener('dragover', e => {
      e.preventDefault();
      el.classList.add('fame-drop-highlight');
      e.dataTransfer.dropEffect = 'copy';
    });
    el.addEventListener('dragleave', e => {
      if (!el.contains(e.relatedTarget)) el.classList.remove('fame-drop-highlight');
    });
    el.addEventListener('drop', async e => {
      const navItem = e.target.closest?.('.fame-nav-item[data-entity-type]');
      if (navItem && el.classList.contains('fame-nav-tree')) return;
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('fame-drop-highlight');
      await handleSidebarDrop(e);
    });
  };

  setupDropTarget(html.querySelector('.fame-nav-tree'));
  setupDropTarget(html.querySelector('.fame-nav-actions'));
}

async function handleActorSidebarDrop(actor) {
  if (actor.type === 'group') {
    await handleGroupActorDrop(actor);
    return;
  }
  if (!['npc', 'character'].includes(actor.type)) return;
  if (!actor.hasPlayerOwner) await Core.ensureImportant(actor);
  await Core.addTracked(actor.id);
}

async function handleFolderSidebarDrop(folder) {
  const validTypes = ['npc', 'character', 'group'];
  const processActors = async (actors) => {
    for (const actor of actors) {
      if (!validTypes.includes(actor.type)) continue;
      if (actor.type === 'group') { await handleGroupActorDrop(actor); continue; }
      if (!actor.hasPlayerOwner) await Core.ensureImportant(actor);
      await Core.addTracked(actor.id);
    }
  };

  await processActors(folder.contents || []);
  for (const subfolder of (folder.getSubfolders?.(true) || [])) {
    if (subfolder) await processActors(subfolder.contents || []);
  }
}

async function handleGroupActorDrop(actor) {
  const newFaction = await Core.addFaction({
    name: actor.name,
    image: actor.img || 'icons/svg/mystery-man.svg',
    factionType: 'group'
  });

  const bio = actor.system?.details?.biography?.value
    || actor.system?.details?.biography
    || actor.system?.description?.value
    || '';
  if (bio) await Data.setDescription('factions', newFaction.id, bio);

  const groupId = actor.id;
  const groupUuid = actor.uuid;

  const memberActors = game.actors.filter(a => {
    if (a.id === groupId || a.type === 'group' || !['npc', 'character'].includes(a.type)) return false;
    const system = a.system || {};
    const group = system.details?.group;
    if (group) {
      if ((typeof group === 'string' && (group === groupId || group === groupUuid)) ||
          group?.id === groupId || group?.uuid === groupUuid || group?._id === groupId) return true;
    }
    if (system.group) {
      if ((typeof system.group === 'string' && (system.group === groupId || system.group === groupUuid)) ||
          system.group?.id === groupId) return true;
    }
    const members = actor.system?.members;
    if (members && Array.isArray(members)) {
      return members.some(m => {
        if (typeof m === 'string') return m === a.id || m === a.uuid;
        return m?.id === a.id || m?.uuid === a.uuid || m?.actor?.id === a.id;
      });
    }
    return false;
  });

  const addMember = async (memberActor) => {
    if (!memberActor || !['npc', 'character'].includes(memberActor.type)) return;
    if (!memberActor.hasPlayerOwner) await Core.ensureImportant(memberActor);
    await Core.addTracked(memberActor.id);
    await Core.addFactionMember(newFaction.id, memberActor.id);
  };

  if (memberActors.length === 0) {
    const groupMembers = actor.system?.members;
    if (Array.isArray(groupMembers)) {
      for (const memberRef of groupMembers) {
        let memberActor = null;
        if (typeof memberRef === 'string') {
          memberActor = game.actors.get(memberRef) || await fromUuid(memberRef).catch(() => null);
        } else if (memberRef?.actor) {
          memberActor = typeof memberRef.actor === 'string'
            ? (game.actors.get(memberRef.actor) || await fromUuid(memberRef.actor).catch(() => null))
            : memberRef.actor;
        } else if (memberRef?.id) {
          memberActor = game.actors.get(memberRef.id);
        } else if (memberRef?.uuid) {
          memberActor = await fromUuid(memberRef.uuid).catch(() => null);
        }
        await addMember(memberActor);
      }
    }
  } else {
    for (const member of memberActors) await addMember(member);
  }
}