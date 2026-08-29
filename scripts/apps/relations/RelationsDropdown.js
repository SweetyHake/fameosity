/**
 * Lightweight anchored dropdown menus (context card pickers).
 * Follows the same lifecycle as the hand-built context menu in RelationsContext.js:
 * fixed positioning on document.body, closed by outside click / Escape.
 */
let activeMenu = null;

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function closeSlotDropdowns() {
  if (activeMenu) activeMenu.close();
}

/**
 * @param {object} [options]
 * @param {'left'|'center'} [options.align='left'] - horizontal anchor: 'center'
 *   keeps the menu centered over the trigger button, 'left' lines up left edges
 */
export function openSlotDropdown(anchorEl, items, { align = 'left' } = {}) {
  closeSlotDropdowns();

  const menu = document.createElement('div');
  menu.className = 'fame-context-menu fame-dropdown';
  menu.style.position = 'fixed';
  menu.style.visibility = 'hidden';
  menu.style.zIndex = '10000';

  let opened = false;
  const api = {
    close() {
      if (!opened) return;
      menu.remove();
      document.removeEventListener('pointerdown', outsideHandler, true);
      document.removeEventListener('keydown', keyHandler);
      // Foundry's #tooltip sits at z-index 9999 — drop it back after this menu (z-index 10000) is gone
      const tip = document.getElementById('tooltip');
      if (tip) tip.style.removeProperty('z-index');
      if (game.tooltip && typeof game.tooltip.deactivate === 'function') game.tooltip.deactivate();
      opened = false;
      if (activeMenu === api) activeMenu = null;
    }
  };

  const outsideHandler = e => {
    if (!menu.contains(e.target)) api.close();
  };

  const keyHandler = e => {
    if (e.key === 'Escape') api.close();
  };

  for (const item of items) {
    if (item.header) {
      const head = document.createElement('div');
      head.className = 'fame-dropdown-header';
      head.textContent = item.label;
      menu.appendChild(head);
      continue;
    }

    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'fame-context-separator';
      menu.appendChild(sep);
      continue;
    }

    const row = document.createElement('div');
    row.className = `fame-dropdown-item${item.checked ? ' is-current' : ''}${item.disabled ? ' disabled' : ''}`;
    const visual = item.img
      ? `<img class="fame-dropdown-img" src="${escapeHtml(item.img)}">`
      : `<i class="${item.icon || 'fa-solid fa-circle'} fame-dropdown-icon"></i>`;
    const check = item.checked ? '<i class="fa-solid fa-check fame-dropdown-check"></i>' : '';
    row.innerHTML = `${visual}<span class="fame-dropdown-label">${escapeHtml(item.label)}</span>${check}`;

    // plain-text tooltip; picked up by Foundry's delegated TooltipManager with no extra binding
    if (item.tooltip) {
      row.dataset.tooltipText = item.tooltip;
      row.dataset.tooltipDirection = 'RIGHT';
    }

    if (!item.disabled && item.action) {
      row.addEventListener('click', async e => {
        e.stopPropagation();
        api.close();
        await item.action();
      });
    }
    menu.appendChild(row);
  }

  document.body.appendChild(menu);
  activeMenu = api;
  opened = true;

  // this menu renders above windows, so the global tooltip must in turn render above the menu
  if (items.some(item => item.tooltip)) {
    const tip = document.getElementById('tooltip');
    if (tip) tip.style.zIndex = '10001';
  }

  requestAnimationFrame(() => {
    const rect = anchorEl.getBoundingClientRect();
    const box = menu.getBoundingClientRect();
    let x = align === 'center'
      ? rect.left + (rect.width - box.width) / 2
      : rect.left;
    let y = rect.bottom + 4;

    x = Math.max(5, Math.min(x, window.innerWidth - box.width - 5));
    if (y + box.height > window.innerHeight - 5) y = Math.max(5, rect.top - box.height - 4);

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.visibility = 'visible';
  });

  setTimeout(() => {
    document.addEventListener('pointerdown', outsideHandler, true);
    document.addEventListener('keydown', keyHandler);
  }, 0);

  return api;
}
