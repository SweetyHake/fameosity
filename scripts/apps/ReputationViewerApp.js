import { MODULE_ID } from '../constants.js';
import { getLimits, clamp, getRepColor, getTier } from '../data.js';
import { getActorRep, setActorRep } from '../core/actors.js';

function updateBar(container, value) {
  const { min, max } = getLimits();
  value = clamp(value);

  const color = getRepColor(value);
  const percentage = ((value - min) / (max - min)) * 100;
  const midPercentage = ((0 - min) / (max - min)) * 100;
  const tier = getTier(value);

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

  const valueSpan = container.querySelector('.fame-bar-value');
  if (valueSpan) {
    valueSpan.textContent = value > 0 ? `+${value}` : value;
    valueSpan.style.color = color;
  }

  const slider = container.querySelector('.fame-bar-slider');
  if (slider) slider.value = value;

  const badge = container.closest('.fame-entity-item, .fame-relation-item')?.querySelector('.fame-tier-badge');
  if (badge) {
    badge.textContent = tier.name;
    badge.style.background = tier.color;
    badge.style.setProperty('--text-length', tier.name.length);
  }
}

function createBarHTML(value, min, max, actorId, isGM) {
  const color = getRepColor(value);
  const percentage = ((value - min) / (max - min)) * 100;
  const midPercentage = ((0 - min) / (max - min)) * 100;

  if (!isGM) {
    return `<span class="fame-bar-value" style="color:${color}">${value > 0 ? '+' : ''}${value}</span>`;
  }

  return `
    <div class="fame-bar-container" data-id="${actorId}" data-type="actor" data-mode="manual">
      <span class="fame-bar-min">${min}</span>
      <div class="fame-bar">
        <div class="fame-bar-track">
          <div class="fame-bar-zero" style="left:${midPercentage}%"></div>
          <div class="fame-bar-fill" style="left:${Math.min(midPercentage, percentage)}%;width:${Math.abs(percentage - midPercentage)}%;background:${color}"></div>
          <div class="fame-bar-thumb" style="left:${percentage}%;background:${color}"></div>
        </div>
        <input type="range" class="fame-bar-slider" min="${min}" max="${max}" value="${value}" data-id="${actorId}" data-type="actor">
      </div>
      <span class="fame-bar-max">${max}</span>
      <div class="fame-bar-controls">
        <button type="button" class="fame-bar-adj fame-minus"><i class="fa-solid fa-minus"></i></button>
        <input type="number" class="fame-bar-val" value="${value}" min="${min}" max="${max}" style="color:${color}">
        <button type="button" class="fame-bar-adj fame-plus"><i class="fa-solid fa-plus"></i></button>
      </div>
    </div>
  `;
}

export class ReputationViewerApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "fame-reputation-viewer",
    classes: ["fame-reputation-viewer", "standard-form"],
    position: { width: 400, height: "auto" },
    window: { icon: "fa-solid fa-star", resizable: false }
  };

  static PARTS = { content: { template: null } };

  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
  }

  get title() {
    return `${game.i18n.localize(`${MODULE_ID}.reputation.window-title`)} - ${this.actor.name}`;
  }

  async _prepareContext() {
    const { min, max } = getLimits();
    return {
      actor: this.actor,
      reputation: getActorRep(this.actor.id),
      isGM: game.user.isGM,
      min,
      max
    };
  }

  async _renderHTML(context) {
    const div = document.createElement("div");
    div.className = "fame-viewer-content";

    div.innerHTML = `
      <div class="fame-form-group">
        <label>${game.i18n.localize(`${MODULE_ID}.reputation.current-label`)}</label>
        ${createBarHTML(context.reputation, context.min, context.max, this.actor.id, context.isGM)}
      </div>
      ${context.isGM ? `
        <button type="button" class="fame-reset-btn" data-action="reset">
          <i class="fa-solid fa-rotate-left"></i>
        </button>
      ` : ''}
    `;

    return div;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
    this._attachListeners(content);
  }

  _attachListeners(html) {
    const slider = html.querySelector('.fame-bar-slider');

    if (slider) {
      slider.addEventListener('input', e => {
        updateBar(e.target.closest('.fame-bar-container'), +e.target.value);
      });
      slider.addEventListener('change', async e => {
        await setActorRep(this.actor.id, +e.target.value);
      });
    }

    html.querySelectorAll('.fame-bar-val').forEach(input => {
      input.addEventListener('change', async e => {
        const value = clamp(+e.target.value || 0);
        updateBar(e.target.closest('.fame-bar-container'), value);
        await setActorRep(this.actor.id, value);
      });
    });

    html.querySelectorAll('.fame-bar-adj').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const container = e.currentTarget.closest('.fame-bar-container');
        const input = container.querySelector('.fame-bar-val');
        const delta = e.currentTarget.classList.contains('fame-plus') ? 1 : -1;
        const value = clamp((+input.value || 0) + delta);
        updateBar(container, value);
        await setActorRep(this.actor.id, value);
      });
    });

    html.querySelector('.fame-reset-btn')?.addEventListener('click', async () => {
      await setActorRep(this.actor.id, 0);
      this.render();
    });
  }

  static open(actor) {
    if (actor) new ReputationViewerApp(actor).render(true);
  }
}