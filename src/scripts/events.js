import { MODULE_ID } from './constants.js';

export class ReputationEvents {
  static _listeners = new Map();
  
  static EVENTS = {
    FACTION_CHANGED: 'faction:changed',
    ACTOR_REP_CHANGED: 'actor:reputation:changed',
    RELATION_CHANGED: 'relation:changed',
    LOCATION_CHANGED: 'location:changed',
    DATA_LOADED: 'data:loaded',
    SETTINGS_CHANGED: 'settings:changed',
    MEMBER_CHANGED: 'member:changed',
    RANK_CHANGED: 'rank:changed',
    HIDDEN_CHANGED: 'hidden:changed',
    AUTO_CHANGED: 'auto:changed',
    HYBRID_CHANGED: 'hybrid:changed'
  };

  static on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  static off(event, callback) {
    this._listeners.get(event)?.delete(callback);
  }

  static emit(event, data) {
    this._listeners.get(event)?.forEach(cb => {
      try {
        cb(data);
      } catch (e) {
        console.error(`${MODULE_ID} | Event handler error:`, e);
      }
    });
  }

  static clear() {
    this._listeners.clear();
  }
}