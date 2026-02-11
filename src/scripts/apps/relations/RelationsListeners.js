import { MODULE_ID } from '../../constants.js';
import * as Data from '../../data.js';
import * as Core from '../../core/index.js';

export function attachInputListeners(html, app) {
  html.querySelectorAll('.fame-detail-name-input').forEach(input => {
    input.addEventListener('change', async e => {
      const { id, type } = e.target.dataset;
      if (type === 'faction') {
        const factions = Core.getFactions();
        const f = factions.find(x => x.id === id);
        if (f) { f.name = e.target.value; await Core.setFactions(factions); }
      } else if (type === 'location') {
        const locations = Core.getLocations();
        const l = locations.find(x => x.id === id);
        if (l) { l.name = e.target.value; await Core.setLocations(locations); }
      } else {
        await Core.setCustomName(id, e.target.value);
      }
    });
  });

  html.querySelectorAll('.fame-type-select').forEach(select => {
    if (select.disabled) return;
    select.addEventListener('change', async e => {
      const { id, entityType } = e.target.dataset;
      const newType = e.target.value;
      if (entityType === 'location') {
        const locations = Core.getLocations();
        const loc = locations.find(x => x.id === id);
        if (!loc) return;
        loc.locationType = newType;
        if (loc.parentId) {
          const parent = locations.find(x => x.id === loc.parentId);
          if (parent && !Core.canNestLocation(parent.locationType, newType)) {
            loc.parentId = null;
          }
        }
        const children = locations.filter(x => x.parentId === id);
        for (const child of children) {
          if (!Core.canNestLocation(newType, child.locationType)) {
            child.parentId = null;
          }
        }
        await Core.setLocations(locations);
      } else if (entityType === 'faction') {
        if (Core.isActiveParty(id)) {
          e.target.value = 'group';
          return;
        }
        const factions = Core.getFactions();
        const fac = factions.find(x => x.id === id);
        if (!fac) return;
        fac.factionType = newType;
        if (fac.parentId) {
          const parent = factions.find(x => x.id === fac.parentId);
          if (parent && !Core.canNestFaction(parent.factionType, newType)) {
            fac.parentId = null;
          }
        }
        const children = factions.filter(x => x.parentId === id);
        for (const child of children) {
          if (!Core.canNestFaction(newType, child.factionType)) {
            child.parentId = null;
          }
        }
        await Core.setFactions(factions);
      }
    });
  });

  html.querySelectorAll('.fame-custom-type-label').forEach(input => {
    input.addEventListener('change', async e => {
      const { id, entityType } = e.target.dataset;
      if (entityType === 'location') {
        const locations = Core.getLocations();
        const l = locations.find(x => x.id === id);
        if (l) { l.customTypeName = e.target.value; await Core.setLocations(locations); }
      } else if (entityType === 'faction') {
        const factions = Core.getFactions();
        const f = factions.find(x => x.id === id);
        if (f) { f.customTypeName = e.target.value; await Core.setFactions(factions); }
      }
    });
  });

  html.querySelectorAll('.fame-detail-description').forEach(input => {
    input.addEventListener('change', async e => {
      await Data.setDescription(e.target.dataset.entityType, e.target.dataset.id, e.target.value);
    });
  });

  html.querySelectorAll('.fame-detail-type-select').forEach(select => {
    select.addEventListener('change', async e => {
      const { id, entityType } = e.target.dataset;
      if (entityType === 'faction') await Core.updateFaction(id, { factionType: e.target.value });
    });
  });

  html.querySelectorAll('.fame-rank-name').forEach(input => {
    input.addEventListener('change', async e => { await Core.updateFactionRank(e.target.dataset.faction, e.target.dataset.rank, { name: e.target.value }); });
  });

  html.querySelectorAll('.fame-rank-multiplier').forEach(input => {
    input.addEventListener('change', async e => { await Core.updateFactionRank(e.target.dataset.faction, e.target.dataset.rank, { multiplier: parseFloat(e.target.value) || 1 }); });
  });

  html.querySelectorAll('.fame-rank-color').forEach(input => {
    input.addEventListener('change', async e => { await Core.updateFactionRank(e.target.dataset.faction, e.target.dataset.rank, { color: e.target.value }); });
  });

  html.querySelectorAll('.fame-member-rank-select').forEach(sel => {
    sel.addEventListener('change', async e => { await Core.setMemberRank(e.target.dataset.faction, e.target.dataset.actor, e.target.value || null); });
  });
}

export function attachBarListeners(html, app) {
  html.querySelectorAll('.fame-bar-slider').forEach(slider => {
    slider.addEventListener('input', e => {
      updateBarVisual(e.target.closest('.fame-bar-container'), +e.target.value);
    });
    slider.addEventListener('change', async e => {
      await handleBarChange(e.target.dataset.id, e.target.dataset.type, +e.target.value);
    });
  });

  html.querySelectorAll('.fame-bar-val:not([readonly])').forEach(input => {
    input.addEventListener('change', async e => {
      const { min, max } = Data.getLimits();
      const value = Math.max(min, Math.min(max, +e.target.value || 0));
      updateBarVisual(e.target.closest('.fame-bar-container'), value);
      await handleBarChange(e.target.dataset.id, e.target.dataset.type, value);
    });
  });
}

export function updateBarVisual(container, value) {
  const { min, max } = Data.getLimits();
  const tier = Data.getTier(value);
  const color = tier.color;
  const pct = ((value - min) / (max - min)) * 100;
  const mid = ((0 - min) / (max - min)) * 100;

  const fill = container.querySelector('.fame-bar-fill');
  if (fill) {
    fill.style.left = `${Math.min(mid, pct)}%`;
    fill.style.width = `${Math.abs(pct - mid)}%`;
    fill.style.background = color;
  }

  const thumb = container.querySelector('.fame-bar-thumb');
  if (thumb) { thumb.style.left = `${pct}%`; thumb.style.background = color; }

  const valInput = container.querySelector('.fame-bar-val');
  if (valInput) { valInput.value = value; valInput.style.color = color; }

  const slider = container.querySelector('.fame-bar-slider');
  if (slider) slider.value = value;

  const valueSpan = container.querySelector('.fame-bar-value');
  if (valueSpan) { valueSpan.textContent = value > 0 ? `+${value}` : `${value}`; valueSpan.style.color = color; }
}

async function handleBarChange(id, type, value) {
  if (type === 'faction') {
    await Core.setRep({ type: 'faction', id }, [], value, { setBaseRep: true });
  } else if (type === 'faction-rel') {
    const [factionId, pcId] = id.split(':');
    await Core.setRep({ type: 'faction', id: factionId }, pcId, value);
  } else if (type === 'faction-to-faction') {
    const [fId1, fId2] = id.split(':');
    await Core.setRep({ type: 'faction', id: fId1 }, { type: 'faction', id: fId2 }, value, { notification: 'none' });
  } else if (type === 'actor-faction') {
    const [actorId, factionId] = id.split(':');
    await Core.setRep(actorId, { type: 'faction', id: factionId }, value);
  } else if (type === 'individual') {
    const [npcId, pcId] = id.split(':');
    await Core.setRep(npcId, pcId, value);
  } else if (type === 'actor') {
    await Core.setRep(id, [], value, { setBaseRep: true });
  }
}

export function attachNavSearchListener(html, app) {
  const input = html.querySelector('.fame-nav-search-input');
  if (!input) return;
  input.addEventListener('input', e => {
    app.navSearch = e.target.value;
    app._navSearchFocus = { start: e.target.selectionStart, end: e.target.selectionEnd };
    app.render();
  });
  if (app._navSearchFocus) {
    input.focus();
    input.setSelectionRange(app._navSearchFocus.start, app._navSearchFocus.end);
  }
}

export function attachResizeHandle(html, app) {
  const handle = html.querySelector('.fame-nav-resize-handle');
  const nav = html.querySelector('.fame-navigator');
  if (!handle || !nav) return;

  let startX, startW;
  const onMove = e => {
    nav.style.width = `${Math.max(150, Math.min(400, startW + e.clientX - startX))}px`;
  };
  const onUp = () => {
    handle.classList.remove('dragging');
    app.navWidth = nav.offsetWidth;
    app._saveState();
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    startX = e.clientX;
    startW = nav.offsetWidth;
    handle.classList.add('dragging');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

export function attachImagePopout(html) {
  html.querySelectorAll('.fame-detail-img').forEach(img => {
    const actorId = img.dataset.actorId;

    if (img.classList.contains('editable') && game.user.isGM) return;

    if (actorId) {
      const actor = game.actors.get(actorId);
      if (actor) {
        img.setAttribute('draggable', 'true');
        img.addEventListener('dragstart', e => {
          e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'Actor', uuid: actor.uuid }));
          e.dataTransfer.effectAllowed = 'copyMove';
        });
      }
    }

    img.style.cursor = 'pointer';
    img.addEventListener('click', e => {
      e.stopPropagation();
      new ImagePopout(img.src, { title: '' }).render(true);
    });
  });
}

export function attachActorRowDrag(html) {
  const makeRowDraggable = (row, actorId) => {
    const actor = game.actors.get(actorId);
    if (!actor) return;

    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'Actor', uuid: actor.uuid }));
      e.dataTransfer.setData('application/fame-nav', JSON.stringify({ type: 'actor', id: actorId }));
      e.dataTransfer.effectAllowed = 'copyMove';
    });
  };

  html.querySelectorAll('.fame-detail-member-row').forEach(row => {
    const nameEl = row.querySelector('.fame-detail-member-name[data-entity-id]');
    if (nameEl) makeRowDraggable(row, nameEl.dataset.entityId);
  });

  html.querySelectorAll('.fame-detail-rel-row').forEach(row => {
    const nameEl = row.querySelector('.fame-detail-rel-name[data-entity-type="actor"]');
    if (nameEl) makeRowDraggable(row, nameEl.dataset.entityId);
  });
}

export function attachRankDragDrop(html) {
  html.querySelectorAll('.fame-detail-rank-row[data-rank-id]').forEach(row => {
    const handle = row.querySelector('.fame-rank-drag-handle');
    if (!handle) return;

    handle.addEventListener('mousedown', () => row.setAttribute('draggable', 'true'));

    row.addEventListener('dragend', () => {
      row.removeAttribute('draggable');
      row.classList.remove('dragging');
      html.querySelectorAll('.fame-detail-rank-row.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    row.addEventListener('dragstart', e => {
      e.stopPropagation();
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'rank', rankId: row.dataset.rankId, factionId: row.dataset.factionId }));
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });

    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      const dragging = html.querySelector('.fame-detail-rank-row.dragging');
      if (!dragging || dragging === row || dragging.dataset.factionId !== row.dataset.factionId) return;
      row.classList.add('drag-over');
      e.dataTransfer.dropEffect = 'move';
    });

    row.addEventListener('dragleave', e => {
      if (!row.contains(e.relatedTarget)) row.classList.remove('drag-over');
    });

    row.addEventListener('drop', async e => {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove('drag-over');
      let data;
      try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
      if (data.type !== 'rank' || data.factionId !== row.dataset.factionId) return;
      const container = row.closest('.fame-detail-section-body');
      if (!container) return;
      const rows = [...container.querySelectorAll('.fame-detail-rank-row[data-rank-id]')];
      const rankIds = rows.map(r => r.dataset.rankId);
      const fromIdx = rankIds.indexOf(data.rankId);
      const toIdx = rankIds.indexOf(row.dataset.rankId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
      const draggedRow = rows[fromIdx];
      if (fromIdx < toIdx) row.after(draggedRow);
      else row.before(draggedRow);
      rankIds.splice(fromIdx, 1);
      rankIds.splice(toIdx, 0, data.rankId);
      await Core.reorderFactionRanks(data.factionId, rankIds);
    });
  });
}

export function fitTierBadges(html) {
  const badges = html.querySelectorAll('.fame-tier-badge');
  if (!badges.length) return;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  for (const badge of badges) {
    const text = badge.textContent.trim();
    if (!text) continue;

    const isSmall = badge.classList.contains('small');
    const maxWidth = isSmall ? 58 : 80;
    const maxFontSize = isSmall ? 0.6 : 0.7;
    const minFontSize = isSmall ? 0.35 : 0.4;

    const style = getComputedStyle(badge);
    const fontFamily = style.fontFamily || 'sans-serif';
    const fontWeight = style.fontWeight || '600';
    const letterSpacing = parseFloat(style.letterSpacing) || 0;

    let fontSize = maxFontSize;

    while (fontSize > minFontSize) {
      const px = fontSize * 16;
      ctx.font = `${fontWeight} ${px}px ${fontFamily}`;
      const measured = ctx.measureText(text.toUpperCase()).width + (text.length * letterSpacing);
      if (measured <= maxWidth) break;
      fontSize -= 0.02;
    }

    badge.style.fontSize = `${Math.max(minFontSize, fontSize).toFixed(3)}rem`;
  }
}