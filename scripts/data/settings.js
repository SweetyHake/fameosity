import { MODULE_ID, DEFAULT_SETTINGS, DEFAULT_TIER_KEYS } from '../constants.js';
import { ReputationEvents } from '../events.js';

const GRANULAR_SETTINGS = ['enabled', 'min', 'max', 'displayMode', 'defaultActorMode', 'defaultFactionMode', 'dynamicDispositionColors'];

let _settingsCache = null;
let _tiersCache = null;

export async function migrateLegacySettings() {
  if (!game.user.isGM) {
    getSettings();
    return;
  }
  const flag = game.settings.get(MODULE_ID, 'settings-granular-migrated');
  if (!flag) {
    const legacy = game.settings.get(MODULE_ID, 'reputationSettings');
    if (legacy && typeof legacy === 'object') {
      for (const key of GRANULAR_SETTINGS) {
        if (legacy[key] !== undefined) {
          await game.settings.set(MODULE_ID, key, legacy[key]);
        }
      }
    }
    await game.settings.set(MODULE_ID, 'settings-granular-migrated', true);
  }
  _settingsCache = null;
}

export function getSettings() {
  if (!_settingsCache) {
    const settings = {};
    for (const key of GRANULAR_SETTINGS) {
      let value;
      try {
        value = game.settings.get(MODULE_ID, key);
      } catch {
        value = undefined;
      }
      if (value === undefined) value = DEFAULT_SETTINGS[key];
      settings[key] = value;
    }
    _settingsCache = settings;
  }
  return _settingsCache;
}

export async function setSettings(settings) {
  _settingsCache = { ...getSettings(), ...settings };
  await Promise.all(
    Object.entries(settings)
      .filter(([key]) => GRANULAR_SETTINGS.includes(key))
      .map(([key, value]) => game.settings.set(MODULE_ID, key, value))
  );
  ReputationEvents.emit(ReputationEvents.EVENTS.SETTINGS_CHANGED, { settings: getSettings() });
}

export function getLimits() {
  const settings = getSettings();
  return { min: settings.min, max: settings.max };
}

export function clamp(value, min = null, max = null) {
  if (min === null || max === null) {
    const limits = getLimits();
    min = min ?? limits.min;
    max = max ?? limits.max;
  }
  return Math.max(min, Math.min(max, value));
}

export function getDefaultTiers() {
  return DEFAULT_TIER_KEYS.map(tier => ({
    name: game.i18n.localize(`${MODULE_ID}.${tier.nameKey}`),
    minValue: tier.minValue,
    color: tier.color
  }));
}

export function getTiers() {
  if (!_tiersCache) {
    _tiersCache = game.settings.get(MODULE_ID, "relationTiers") || getDefaultTiers();
  }
  return _tiersCache;
}

export async function setTiers(tiers) {
  _tiersCache = tiers;
  await game.settings.set(MODULE_ID, "relationTiers", tiers);
}

export function getTier(value) {
  const tiers = getTiers();
  if (!tiers || tiers.length === 0) {
    return { name: "Unknown", color: "#666666", minValue: -Infinity };
  }
  if (value >= 0) {
    const positiveTiers = tiers.filter(t => t.minValue >= 0).sort((a, b) => b.minValue - a.minValue);
    return positiveTiers.find(tier => value >= tier.minValue) || positiveTiers[positiveTiers.length - 1] || tiers[0];
  } else {
    const negativeTiers = tiers.filter(t => t.minValue < 0).sort((a, b) => a.minValue - b.minValue);
    return negativeTiers.find(tier => value <= tier.minValue) || negativeTiers[negativeTiers.length - 1] || tiers[0];
  }
}

export function getRepColor(value) {
  return getTier(value).color;
}

export function clearSettingsCache() {
  _settingsCache = null;
}

export function clearTiersCache() {
  _tiersCache = null;
}
