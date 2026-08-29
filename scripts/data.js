/**
 * Facade over scripts/data/*.
 * All existing `from './data.js'` / `from '../data.js'` imports keep working.
 */
export { escapeHtml, cleanName } from './data/utils.js';

export {
  migrateToSegments,
  getData,
  setData,
  requestOperation,
  validateDataStructure,
  handleSocketMessage,
  flushData,
  clearDataCache
} from './data/cache.js';

export {
  migrateLegacySettings,
  getSettings,
  setSettings,
  getLimits,
  clamp,
  getDefaultTiers,
  getTiers,
  setTiers,
  getTier,
  getRepColor,
  clearSettingsCache,
  clearTiersCache
} from './data/settings.js';

export {
  getLocations,
  setLocations,
  getEntityInfo,
  setEntityInfo,
  getDescription,
  setDescription,
  cleanupEntityData
} from './data/content.js';

import { clearDataCache } from './data/cache.js';
import { clearSettingsCache, clearTiersCache } from './data/settings.js';

export function invalidateCache() {
  clearDataCache();
  clearSettingsCache();
  clearTiersCache();
}

export function invalidateSettingsCache() {
  clearSettingsCache();
}

export function invalidateTiersCache() {
  clearTiersCache();
}
