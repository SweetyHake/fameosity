import { MODULE_ID } from '../constants.js';
import { escapeHtml, getSettings, setSettings, getTiers, setTiers, getDefaultTiers, getData, setData } from '../data.js';

export class ReputationSettingsApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "fame-reputation-settings",
    classes: ["fame-reputation-settings", "standard-form"],
    position: { width: 520, height: "auto" },
    window: { icon: "fa-solid fa-star", resizable: false }
  };

  static PARTS = { content: { template: null } };

  constructor(options = {}) {
    super(options);
    this.currentTab = 'general';
  }

  get title() {
    return game.i18n.localize(`${MODULE_ID}.settings.reputationSettings.title`);
  }

  async _prepareContext() {
    return {
      settings: getSettings(),
      tiers: getTiers(),
      currentTab: this.currentTab
    };
  }

  async _renderHTML(context) {
    const div = document.createElement("div");
    div.className = "fame-settings-content";

    const tiersHtml = context.tiers.map((tier, index) => `
      <div class="fame-tier-item" data-index="${index}">
        <input type="text" class="fame-tier-name" value="${escapeHtml(tier.name)}">
        <input type="number" class="fame-tier-min" value="${tier.minValue}">
        <input type="color" class="fame-tier-color" value="${tier.color}">
        <button type="button" class="fame-tier-del fame-icon-btn">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `).join('');

    const modeOptions = ['manual', 'auto', 'hybrid'].map(mode =>
      `<option value="${mode}">${game.i18n.localize(`${MODULE_ID}.mode.${mode}`)}</option>`
    ).join('');

    div.innerHTML = `
      <nav class="fame-settings-tabs">
        <a class="fame-settings-tab ${context.currentTab === 'general' ? 'active' : ''}" data-tab="general">
          <i class="fa-solid fa-cog"></i> ${game.i18n.localize(`${MODULE_ID}.settings.tab-general`)}
        </a>
        <a class="fame-settings-tab ${context.currentTab === 'modes' ? 'active' : ''}" data-tab="modes">
          <i class="fa-solid fa-sliders"></i> ${game.i18n.localize(`${MODULE_ID}.settings.tab-modes`)}
        </a>
        <a class="fame-settings-tab ${context.currentTab === 'tiers' ? 'active' : ''}" data-tab="tiers">
          <i class="fa-solid fa-layer-group"></i> ${game.i18n.localize(`${MODULE_ID}.settings.tab-tiers`)}
        </a>
        <a class="fame-settings-tab ${context.currentTab === 'data' ? 'active' : ''}" data-tab="data">
          <i class="fa-solid fa-database"></i> ${game.i18n.localize(`${MODULE_ID}.settings.tab-data`)}
        </a>
      </nav>

      <div class="fame-settings-panel ${context.currentTab === 'general' ? 'active' : ''}" data-tab="general">
        <div class="fame-form-group">
          <label>${game.i18n.localize(`${MODULE_ID}.settings.enabled.name`)}</label>
          <input type="checkbox" name="enabled" ${context.settings.enabled ? 'checked' : ''}>
          <p class="fame-hint">${game.i18n.localize(`${MODULE_ID}.settings.enabled.hint`)}</p>
        </div>
        <div class="fame-form-group">
          <label>${game.i18n.localize(`${MODULE_ID}.settings.displayMode.name`)}</label>
          <select name="displayMode">
            <option value="show" ${context.settings.displayMode === 'show' ? 'selected' : ''}>${game.i18n.localize(`${MODULE_ID}.settings.displayMode.show`)}</option>
            <option value="hide" ${context.settings.displayMode === 'hide' ? 'selected' : ''}>${game.i18n.localize(`${MODULE_ID}.settings.displayMode.hide`)}</option>
          </select>
          <p class="fame-hint">${game.i18n.localize(`${MODULE_ID}.settings.displayMode.hint`)}</p>
        </div>
        <div class="fame-form-group-row">
          <div class="fame-form-group">
            <label>${game.i18n.localize(`${MODULE_ID}.settings.reputationMin.name`)}</label>
            <input type="number" name="min" value="${context.settings.min}">
          </div>
          <div class="fame-form-group">
            <label>${game.i18n.localize(`${MODULE_ID}.settings.reputationMax.name`)}</label>
            <input type="number" name="max" value="${context.settings.max}">
          </div>
        </div>
      </div>

      <div class="fame-settings-panel ${context.currentTab === 'modes' ? 'active' : ''}" data-tab="modes">
        <div class="fame-form-group">
          <label>${game.i18n.localize(`${MODULE_ID}.settings.defaultActorMode.name`)}</label>
          <select name="defaultActorMode">
            ${modeOptions.replace(`value="${context.settings.defaultActorMode || 'manual'}"`, `value="${context.settings.defaultActorMode || 'manual'}" selected`)}
          </select>
          <p class="fame-hint">${game.i18n.localize(`${MODULE_ID}.settings.defaultActorMode.hint`)}</p>
        </div>
        <div class="fame-form-group">
          <label>${game.i18n.localize(`${MODULE_ID}.settings.defaultFactionMode.name`)}</label>
          <select name="defaultFactionMode">
            ${modeOptions.replace(`value="${context.settings.defaultFactionMode || 'manual'}"`, `value="${context.settings.defaultFactionMode || 'manual'}" selected`)}
          </select>
          <p class="fame-hint">${game.i18n.localize(`${MODULE_ID}.settings.defaultFactionMode.hint`)}</p>
        </div>
      </div>

      <div class="fame-settings-panel ${context.currentTab === 'tiers' ? 'active' : ''}" data-tab="tiers">
        <div class="fame-form-group fame-tiers-section">
          <label>${game.i18n.localize(`${MODULE_ID}.relations.tiers`)}</label>
          <div class="fame-tiers-list">${tiersHtml}</div>
          <button type="button" class="fame-tier-add fame-add-btn">
            <i class="fa-solid fa-plus"></i> ${game.i18n.localize(`${MODULE_ID}.relations.addTier`)}
          </button>
        </div>
      </div>

      <div class="fame-settings-panel ${context.currentTab === 'data' ? 'active' : ''}" data-tab="data">
        <div class="fame-form-group">
          <label>${game.i18n.localize(`${MODULE_ID}.settings.exportImport.name`)}</label>
          <p class="fame-hint">${game.i18n.localize(`${MODULE_ID}.settings.exportImport.hint`)}</p>
        </div>
        <div class="fame-export-import-section">
          <div class="fame-export-import-row">
            <button type="button" class="fame-export-btn"><i class="fa-solid fa-download"></i> ${game.i18n.localize(`${MODULE_ID}.settings.export`)}</button>
            <button type="button" class="fame-import-btn"><i class="fa-solid fa-upload"></i> ${game.i18n.localize(`${MODULE_ID}.settings.import`)}</button>
          </div>
          <input type="file" class="fame-import-file" accept=".json" style="display:none">
          <div class="fame-form-group fame-import-options">
            <label class="fame-checkbox-label"><input type="checkbox" name="importSettings" checked> ${game.i18n.localize(`${MODULE_ID}.settings.importSettings`)}</label>
            <label class="fame-checkbox-label"><input type="checkbox" name="importTiers" checked> ${game.i18n.localize(`${MODULE_ID}.settings.importTiers`)}</label>
            <label class="fame-checkbox-label"><input type="checkbox" name="importData" checked> ${game.i18n.localize(`${MODULE_ID}.settings.importData`)}</label>
          </div>
        </div>
        <div class="fame-form-group fame-danger-zone">
          <label>${game.i18n.localize(`${MODULE_ID}.settings.dangerZone`)}</label>
          <button type="button" class="fame-reset-all-btn"><i class="fa-solid fa-trash"></i> ${game.i18n.localize(`${MODULE_ID}.settings.resetAll`)}</button>
        </div>
      </div>

      <div class="fame-settings-footer">
        <button type="button" class="fame-save-btn"><i class="fa-solid fa-save"></i> ${game.i18n.localize("Save")}</button>
      </div>
    `;

    return div;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
    this._attachListeners(content);
  }

  _attachListeners(html) {
    const tiersList = html.querySelector('.fame-tiers-list');

    html.querySelectorAll('.fame-settings-tab').forEach(tab => {
      tab.addEventListener('click', e => {
        e.preventDefault();
        this.currentTab = e.currentTarget.dataset.tab;
        this.render();
      });
    });

    html.querySelector('.fame-tier-add')?.addEventListener('click', () => {
      const tierItem = document.createElement('div');
      tierItem.className = 'fame-tier-item';
      tierItem.innerHTML = `
        <input type="text" class="fame-tier-name" value="${game.i18n.localize(`${MODULE_ID}.relations.newTier`)}">
        <input type="number" class="fame-tier-min" value="0">
        <input type="color" class="fame-tier-color" value="#8a8a8a">
        <button type="button" class="fame-tier-del fame-icon-btn"><i class="fa-solid fa-trash"></i></button>
      `;
      tiersList.appendChild(tierItem);
      tierItem.querySelector('.fame-tier-del').addEventListener('click', () => tierItem.remove());
    });

    html.querySelectorAll('.fame-tier-del').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.fame-tier-item').remove());
    });

    html.querySelector('.fame-export-btn')?.addEventListener('click', () => this._exportData());
    html.querySelector('.fame-import-btn')?.addEventListener('click', () => html.querySelector('.fame-import-file').click());
    html.querySelector('.fame-import-file')?.addEventListener('change', e => this._importData(e, html));
    html.querySelector('.fame-reset-all-btn')?.addEventListener('click', () => this._resetAllData());

    html.querySelector('.fame-save-btn')?.addEventListener('click', async () => {
      const tiers = [...html.querySelectorAll('.fame-tier-item')]
        .map(item => ({
          name: item.querySelector('.fame-tier-name').value,
          minValue: parseInt(item.querySelector('.fame-tier-min').value) || 0,
          color: item.querySelector('.fame-tier-color').value
        }))
        .sort((a, b) => a.minValue - b.minValue);

      await setSettings({
        enabled: html.querySelector('[name="enabled"]').checked,
        displayMode: html.querySelector('[name="displayMode"]').value,
        min: parseInt(html.querySelector('[name="min"]').value),
        max: parseInt(html.querySelector('[name="max"]').value),
        defaultActorMode: html.querySelector('[name="defaultActorMode"]').value,
        defaultFactionMode: html.querySelector('[name="defaultFactionMode"]').value
      });

      await setTiers(tiers);
      this.close();
    });
  }

  _exportData() {
    const exportObj = {
      version: 2,
      timestamp: Date.now(),
      settings: getSettings(),
      tiers: getTiers(),
      data: getData()
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fameosity-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ui.notifications.info(game.i18n.localize(`${MODULE_ID}.settings.exportSuccess`));
  }

  async _importData(event, html) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const importObj = JSON.parse(text);
      if (!importObj.version) {
        ui.notifications.error(game.i18n.localize(`${MODULE_ID}.settings.importInvalid`));
        return;
      }
      const importSettings = html.querySelector('[name="importSettings"]').checked;
      const importTiers = html.querySelector('[name="importTiers"]').checked;
      const importData = html.querySelector('[name="importData"]').checked;
      if (importSettings && importObj.settings) await setSettings(importObj.settings);
      if (importTiers && importObj.tiers) await setTiers(importObj.tiers);
      if (importData && importObj.data) await setData(importObj.data);
      ui.notifications.info(game.i18n.localize(`${MODULE_ID}.settings.importSuccess`));
      this.render();
    } catch (e) {
      console.error(`${MODULE_ID} | Import error:`, e);
      ui.notifications.error(game.i18n.localize(`${MODULE_ID}.settings.importError`));
    }
    event.target.value = '';
  }

  async _resetAllData() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize(`${MODULE_ID}.settings.resetConfirmTitle`) },
      content: `<p>${game.i18n.localize(`${MODULE_ID}.settings.resetConfirmContent`)}</p>`,
      yes: { default: false },
      no: { default: true }
    });
    if (!confirmed) return;
    const { DEFAULT_DATA, DEFAULT_SETTINGS } = await import('../constants.js');
    await setSettings({ ...DEFAULT_SETTINGS });
    await setTiers(getDefaultTiers());
    await setData({ ...DEFAULT_DATA });
    ui.notifications.info(game.i18n.localize(`${MODULE_ID}.settings.resetSuccess`));
    this.render();
  }
}