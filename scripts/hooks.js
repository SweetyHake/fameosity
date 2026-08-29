import { MODULE_ID, DEFAULT_SETTINGS, DEFAULT_DATA, DATA_SEGMENTS } from './constants.js';
import { getSettings, handleSocketMessage, getData, setData, invalidateCache, invalidateSettingsCache, invalidateTiersCache, migrateLegacySettings, migrateToSegments } from './data.js';
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
import { registerDispositionColors } from './core/disposition-colors.js';
import { registerTokenHudIntegration } from './core/token-hud.js';
import { ensureRelationsTemplates } from './core/templates.js';

// Settings that are managed by this module's internal save mechanism and don't require cache invalidation
const CACHE_MANAGED_SETTINGS = new Set([
  'reputationData',
  'reputationSettings',
  'relationTiers',
  ...Object.keys(DATA_SEGMENTS),
  'repData-migrated'
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
    openRelationsViewer, openReputationSettings, ReputationEvents
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
  game.settings.register(MODULE_ID, "reputationData", { scope: "world", config: false, type: Object, default: { ...DEFAULT_DATA } });
  game.settings.register(MODULE_ID, "relationTiers", { scope: "world", config: false, type: Array, default: [] });
  game.settings.register(MODULE_ID, "reputationSettings", { scope: "world", config: false, type: Object, default: { ...DEFAULT_SETTINGS } });

  game.settings.register(MODULE_ID, "enabled", {
    name: game.i18n.localize(`${MODULE_ID}.settings.enabled.name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.enabled.hint`),
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "min", {
    name: game.i18n.localize(`${MODULE_ID}.settings.reputationMin.name`),
    scope: "world", config: true, type: Number, default: DEFAULT_SETTINGS.min
  });
  game.settings.register(MODULE_ID, "max", {
    name: game.i18n.localize(`${MODULE_ID}.settings.reputationMax.name`),
    scope: "world", config: true, type: Number, default: DEFAULT_SETTINGS.max
  });
  game.settings.register(MODULE_ID, "displayMode", {
    name: game.i18n.localize(`${MODULE_ID}.settings.displayMode.name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.displayMode.hint`),
    scope: "world", config: true, type: String, choices: {
      show: game.i18n.localize(`${MODULE_ID}.settings.displayMode.show`),
      hide: game.i18n.localize(`${MODULE_ID}.settings.displayMode.hide`)
    }, default: "show"
  });
  const modeChoices = {
    manual: game.i18n.localize(`${MODULE_ID}.mode.manual`),
    auto: game.i18n.localize(`${MODULE_ID}.mode.auto`),
    hybrid: game.i18n.localize(`${MODULE_ID}.mode.hybrid`)
  };
  game.settings.register(MODULE_ID, "defaultActorMode", {
    name: game.i18n.localize(`${MODULE_ID}.settings.defaultActorMode.name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.defaultActorMode.hint`),
    scope: "world", config: true, type: String, choices: modeChoices, default: "manual"
  });
  game.settings.register(MODULE_ID, "defaultFactionMode", {
    name: game.i18n.localize(`${MODULE_ID}.settings.defaultFactionMode.name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.defaultFactionMode.hint`),
    scope: "world", config: true, type: String, choices: modeChoices, default: "manual"
  });
  game.settings.register(MODULE_ID, "dynamicDispositionColors", {
    name: game.i18n.localize(`${MODULE_ID}.settings.dynamicDispositionColors.name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.dynamicDispositionColors.hint`),
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "settings-granular-migrated", { scope: "world", config: false, type: Boolean, default: false });

  // Incremental data segments
  for (const segKey of Object.keys(DATA_SEGMENTS)) {
    game.settings.register(MODULE_ID, segKey, { scope: "world", config: false, type: Object, default: {} });
  }
  game.settings.register(MODULE_ID, "repData-migrated", { scope: "world", config: false, type: Boolean, default: false });

  game.settings.register(MODULE_ID, "relationsViewerPosition", { scope: "client", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, "relationsViewerState", { scope: "client", config: false, type: Object, default: { closedNavGroups: [], openSections: [], treeExpandedLocations: [], treeExpandedFactions: [], navWidth: null } });

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
  await ensureRelationsTemplates();
}

export function registerHooks() {
  console.log(`${MODULE_ID} | hooks registered, waiting for init`);
  Hooks.once('init', async () => {
    console.log(`${MODULE_ID} | init: registering settings`);
    registerSettings();
    registerTokenHudIntegration();

    Handlebars.registerHelper('eq', (a, b) => a === b);
    Handlebars.registerHelper('ne', (a, b) => a !== b);
    Handlebars.registerHelper('gt', (a, b) => a > b);
    Handlebars.registerHelper('gte', (a, b) => a >= b);
    Handlebars.registerHelper('lt', (a, b) => a < b);
    Handlebars.registerHelper('lte', (a, b) => a <= b);
    Handlebars.registerHelper('and', (...args) => args.slice(0, -1).every(Boolean));
    Handlebars.registerHelper('or', (...args) => args.slice(0, -1).some(Boolean));
    Handlebars.registerHelper('not', a => !a);
    Handlebars.registerHelper('sum', (a, b) => ((Array.isArray(a) ? a.length : +a || 0)) + ((Array.isArray(b) ? b.length : +b || 0)));
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
    Handlebars.registerHelper('zeroPosition', (min, max) => {
      return ((0 - min) / (max - min)) * 100;
    });
    Handlebars.registerHelper('tierBadge', (tier, small) => {
      if (!tier) return '';
      const cls = small === true ? 'fame-tier-badge small' : 'fame-tier-badge';
      const len = tier.name ? tier.name.length : 0;
      return new Handlebars.SafeString(`<span class="${cls}" style="--text-length:${len};color:${tier.color};border-color:${tier.color}">${Handlebars.Utils.escapeExpression(tier.name)}</span>`);
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

    try {
      registerDispositionColors();
    } catch (err) {
      console.error(`${MODULE_ID} | Disposition colors init failed:`, err);
    }

    await migrateLegacySettings();
    await migrateData();
    await migrateToSegments();

    window.addEventListener('beforeunload', () => {
      import('./data.js').then(m => m.flushData());
    });
  });

  Hooks.on('updateSetting', setting => {
    const key = setting.key || '';
    if (key.startsWith(`${MODULE_ID}.`)) {
      const settingName = key.slice(MODULE_ID.length + 1);
      if (settingName === 'relationTiers') {
        invalidateTiersCache();
      } else if (['enabled', 'min', 'max', 'displayMode', 'defaultActorMode', 'defaultFactionMode', 'dynamicDispositionColors'].includes(settingName)) {
        invalidateSettingsCache();
      } else if (settingName && !CACHE_MANAGED_SETTINGS.has(settingName)) {
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