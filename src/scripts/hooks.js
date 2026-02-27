import { MODULE_ID, DEFAULT_SETTINGS, DEFAULT_DATA } from './constants.js';
import { getSettings, handleSocketMessage, getData, setData, invalidateCache } from './data.js';
import { ReputationEvents } from './events.js';
import { ReputationSettingsApp } from './apps/ReputationSettingsApp.js';
import { RelationsViewerApp } from './apps/RelationsViewerApp.js';
import { setRep, addRep, NOTIFICATION_MODES } from './core/api.js';
import { getRep, getMode, setMode } from './core/reputation.js';
import { showNotification } from './core/notifications.js';
import { findByName } from './core/search.js';
import { getTracked, addTracked, removeTracked, getDisplayName, getPCs, isPlayerCharacter } from './core/actors.js';
import { getFactions, getFaction, addFaction, deleteFaction, addFactionMember, removeFactionMember } from './core/factions.js';
import { getLocations, getLocation, addLocation, deleteLocation } from './core/locations.js';
import { getTiers, getTier } from './data.js';

// Settings that are managed by this module's internal save mechanism and don't require cache invalidation
const CACHE_MANAGED_SETTINGS = new Set([
  'reputationData',
  'reputationSettings',
  'relationTiers'
]);

export function openRelationsViewer() {
  new RelationsViewerApp().render(true);
}

export function openReputationSettings() {
  new ReputationSettingsApp().render(true);
}

function createModuleAPI() {
  return {
    setRep, addRep, getRep, NOTIFICATION_MODES, showNotification, findByName,
    getTracked, addTracked, removeTracked, getDisplayName, getPCs, isPlayerCharacter,
    getFactions, getFaction, addFaction, deleteFaction, addFactionMember, removeFactionMember,
    getLocations, getLocation, addLocation, deleteLocation,
    getTiers, getTier, getSettings,
    getMode, setMode,
    openRelationsViewer, openReputationSettings, ReputationEvents,
  };
}

async function migrateData() {
  if (!game.user.isGM) return;
  const data = getData();
  let dirty = false;

  if (!data.modeFlags) {
    data.modeFlags = { actors: {}, factions: {} };
    const autoActors = data.autoFlags?.actors || [];
    const hybridActors = data.hybridFlags?.actors || [];
    for (const id of autoActors) data.modeFlags.actors[id] = 'auto';
    for (const id of hybridActors) data.modeFlags.actors[id] = 'hybrid';
    const autoFactions = data.autoFlags?.factions || [];
    const hybridFactions = data.hybridFlags?.factions || [];
    for (const id of autoFactions) data.modeFlags.factions[id] = 'auto';
    for (const id of hybridFactions) data.modeFlags.factions[id] = 'hybrid';
    delete data.autoFlags;
    delete data.hybridFlags;
    dirty = true;
  }

  if (!data.factionToFactionRelations) {
    data.factionToFactionRelations = {};
    dirty = true;
  }

  if (data.actors && Object.keys(data.actors).length > 0 && data.activePartyId) {
    data.actorFactionRelations ??= {};
    for (const [actorId, rep] of Object.entries(data.actors)) {
      if (rep === 0) continue;
      data.actorFactionRelations[actorId] ??= {};
      if (data.actorFactionRelations[actorId][data.activePartyId] === undefined) {
        data.actorFactionRelations[actorId][data.activePartyId] = rep;
        dirty = true;
      }
    }
  }

  if (dirty) {
    await setData(data);
    console.log(`${MODULE_ID} | Data migration completed`);
  }
}

export function registerSettings() {
  game.settings.register(MODULE_ID, "reputationSettings", { scope: "world", config: false, type: Object, default: { ...DEFAULT_SETTINGS } });
  game.settings.register(MODULE_ID, "reputationData", { scope: "world", config: false, type: Object, default: { ...DEFAULT_DATA } });
  game.settings.register(MODULE_ID, "relationTiers", { scope: "world", config: false, type: Array, default: [] });
  game.settings.register(MODULE_ID, "relationsViewerPosition", { scope: "client", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, "relationsViewerState", { scope: "client", config: false, type: Object, default: { closedNavGroups: [], openSections: [], treeExpandedLocations: [], treeExpandedFactions: [], navWidth: null } });

  game.settings.registerMenu(MODULE_ID, "reputationSettingsMenu", {
    name: game.i18n.localize(`${MODULE_ID}.settings.reputationSettings.name`),
    label: game.i18n.localize(`${MODULE_ID}.settings.reputationSettings.label`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.reputationSettings.hint`),
    icon: "fa-solid fa-star",
    type: ReputationSettingsApp,
    restricted: true
  });

  game.keybindings.register(MODULE_ID, "increaseReputation", {
    name: game.i18n.localize(`${MODULE_ID}.keybindings.increase.name`),
    hint: game.i18n.localize(`${MODULE_ID}.keybindings.increase.hint`),
    editable: [{ key: "Digit1", modifiers: ["Shift"] }],
    onDown: async () => { (await import('./core/notifications.js')).changeReputation(1); return true; },
    restricted: true, precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });

  game.keybindings.register(MODULE_ID, "decreaseReputation", {
    name: game.i18n.localize(`${MODULE_ID}.keybindings.decrease.name`),
    hint: game.i18n.localize(`${MODULE_ID}.keybindings.decrease.hint`),
    editable: [{ key: "Digit2", modifiers: ["Shift"] }],
    onDown: async () => { (await import('./core/notifications.js')).changeReputation(-1); return true; },
    restricted: true, precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
}

async function preloadHandlebarsTemplates() {
  const partials = {
    "relations/partials/navigator": `modules/${MODULE_ID}/templates/relations/partials/navigator.hbs`,
    "relations/partials/detail-location": `modules/${MODULE_ID}/templates/relations/partials/detail-location.hbs`,
    "relations/partials/detail-faction": `modules/${MODULE_ID}/templates/relations/partials/detail-faction.hbs`,
    "relations/partials/detail-actor": `modules/${MODULE_ID}/templates/relations/partials/detail-actor.hbs`,
    "relations/partials/rep-bar": `modules/${MODULE_ID}/templates/relations/partials/rep-bar.hbs`,
    "relations/partials/rel-row": `modules/${MODULE_ID}/templates/relations/partials/rel-row.hbs`,
  };

  const mainTemplates = [
    `modules/${MODULE_ID}/templates/relations/main.hbs`
  ];

  const fetchPromises = Object.entries(partials).map(async ([name, path]) => {
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(response.statusText);
      const text = await response.text();
      Handlebars.registerPartial(name, text);
      Handlebars.registerPartial(path, text);
    } catch (e) {
      console.error(`Fameosity | Failed to load partial ${name}:`, e);
    }
  });

  await Promise.all(fetchPromises);
  await loadTemplates(mainTemplates);
}

export function registerHooks() {
  Hooks.once('init', async () => {
    registerSettings();

    Handlebars.registerHelper('eq', (a, b) => a === b);
    Handlebars.registerHelper('ne', (a, b) => a !== b);
    Handlebars.registerHelper('gt', (a, b) => a > b);
    Handlebars.registerHelper('gte', (a, b) => a >= b);
    Handlebars.registerHelper('lt', (a, b) => a < b);
    Handlebars.registerHelper('lte', (a, b) => a <= b);
    Handlebars.registerHelper('and', (...args) => args.slice(0, -1).every(Boolean));
    Handlebars.registerHelper('or', (...args) => args.slice(0, -1).some(Boolean));
    Handlebars.registerHelper('not', a => !a);
    Handlebars.registerHelper('concat', (...args) => args.slice(0, -1).join(''));
    Handlebars.registerHelper('navIndent', (level) => 8 + (level || 0) * 16);
    Handlebars.registerHelper('indentStyle', (level) => {
      if (!level || level < 1) return '';
      return new Handlebars.SafeString(`padding-left:${level * 20}px`);
    });
    Handlebars.registerHelper('percentage', (value, min, max) => ((value - min) / (max - min)) * 100);
    Handlebars.registerHelper('fillLeft', (value, min, max) => {
      const percentage = ((value - min) / (max - min)) * 100;
      const midPercentage = ((0 - min) / (max - min)) * 100;
      return Math.min(midPercentage, percentage);
    });
    Handlebars.registerHelper('fillWidth', (value, min, max) => {
      const percentage = ((value - min) / (max - min)) * 100;
      const midPercentage = ((0 - min) / (max - min)) * 100;
      return Math.abs(percentage - midPercentage);
    });
    Handlebars.registerHelper('tierBadge', (tier, small) => {
      if (!tier) return '';
      const cls = small === true ? 'fame-tier-badge small' : 'fame-tier-badge';
      const len = tier.name ? tier.name.length : 0;
      return new Handlebars.SafeString(`<span class="${cls}" style="--text-length:${len};background:${tier.color}">${Handlebars.Utils.escapeExpression(tier.name)}</span>`);
    });
    Handlebars.registerHelper('tierText', (tier) => {
      if (!tier) return '';
      return new Handlebars.SafeString(`<span class="fame-tier-text" style="color:${tier.color}">${Handlebars.Utils.escapeExpression(tier.name)}</span>`);
    });

    await preloadHandlebarsTemplates();

    game.modules.get(MODULE_ID).api = createModuleAPI();
  });

  Hooks.once('ready', async () => {
    const savedTiers = game.settings.get(MODULE_ID, "relationTiers");
    if (!savedTiers || savedTiers.length === 0 || savedTiers.some(t => t.name?.startsWith('FAMEOCITY.'))) {
      import('./data.js').then(m => game.settings.set(MODULE_ID, "relationTiers", m.getDefaultTiers()));
    }
    game.socket.on(`module.${MODULE_ID}`, data => handleSocketMessage(data));
    await migrateData();
  });

  Hooks.on('updateSetting', setting => {
    const key = setting.key || '';
    if (key.startsWith(`${MODULE_ID}.`)) {
      const settingName = key.slice(MODULE_ID.length + 1);
      if (settingName && !CACHE_MANAGED_SETTINGS.has(settingName)) {
        invalidateCache();
      }
    }
  });

  Hooks.on('getSceneControlButtons', controls => {
    if (!getSettings().enabled) return;
    const tokenControls = controls.tokens;
    if (!tokenControls?.tools) return;
    tokenControls.tools["sweety-relations"] = {
      name: "sweety-relations",
      title: game.i18n.localize(`${MODULE_ID}.relations.viewer-title`),
      icon: "fa-solid fa-users",
      visible: true,
      onClick: openRelationsViewer,
      button: true
    };
  });
}