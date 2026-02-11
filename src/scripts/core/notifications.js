import { MODULE_ID, CONFIG_REMEMBER } from '../constants.js';
import * as Data from '../data.js';
import * as Actors from './actors.js';

const activeNotifications = new Map();
const pendingDeltas = new Map();
const ACCUMULATE_DELAY = 800;

function playNotificationSound() {
  if (!CONFIG_REMEMBER.sound) return;
  foundry.audio.AudioHelper.play({
    src: CONFIG_REMEMBER.sound,
    volume: CONFIG_REMEMBER.soundVolume ?? 0.5,
    autoplay: true,
    loop: false
  }, false);
}

function getOrCreateContainer() {
  let container = document.getElementById("fame-notification-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "fame-notification-container";
    container.style.cssText = `top:${CONFIG_REMEMBER.positionTop};left:${CONFIG_REMEMBER.positionLeft}`;
    document.body.appendChild(container);
  }
  return container;
}

function escapeHtmlLocal(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function createNotificationElement(message, delta) {
  const isPositive = delta > 0;
  const notification = document.createElement("div");
  notification.className = `fame-notification ${isPositive ? 'positive' : 'negative'}`;
  notification.innerHTML = `
    <div class="fame-notification-icon">
      <i class="fa-solid fa-${isPositive ? 'arrow-up' : 'arrow-down'}"></i>
    </div>
    <div class="fame-notification-content">
      <span class="fame-notification-message">${escapeHtmlLocal(message)}</span>
    </div>
    <span class="fame-notification-delta">${isPositive ? '+' : ''}${delta}</span>
  `;
  return notification;
}

function updateNotificationElement(notification, delta) {
  const isPositive = delta > 0;
  notification.className = `fame-notification ${isPositive ? 'positive' : 'negative'}`;
  const icon = notification.querySelector('.fame-notification-icon i');
  if (icon) icon.className = `fa-solid fa-${isPositive ? 'arrow-up' : 'arrow-down'}`;
  const deltaEl = notification.querySelector('.fame-notification-delta');
  if (deltaEl) deltaEl.textContent = `${isPositive ? '+' : ''}${delta}`;
}

function scheduleRemoval(notification, key, container) {
  const cleanup = () => {
    if (notification.parentNode) notification.remove();
    activeNotifications.delete(key);
    pendingDeltas.delete(key);
    if (container && !container.children.length) container.remove();
  };
  if (notification._removalTimeout) clearTimeout(notification._removalTimeout);
  if (notification._cleanupTimeout) clearTimeout(notification._cleanupTimeout);
  notification._removalTimeout = setTimeout(() => {
    notification.classList.add('out');
    notification.addEventListener('animationend', cleanup, { once: true });
    notification._cleanupTimeout = setTimeout(cleanup, CONFIG_REMEMBER.fadeOutDuration + 100);
  }, CONFIG_REMEMBER.displayDuration);
}

function flushPending(key) {
  const pending = pendingDeltas.get(key);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingDeltas.delete(key);
  const totalDelta = pending.delta;
  if (totalDelta === 0) return;
  const container = getOrCreateContainer();
  const existing = activeNotifications.get(key);
  if (existing && existing.parentNode) {
    updateNotificationElement(existing, totalDelta);
    scheduleRemoval(existing, key, container);
  } else {
    const notification = createNotificationElement(pending.message, totalDelta);
    container.appendChild(notification);
    activeNotifications.set(key, notification);
    playNotificationSound();
    scheduleRemoval(notification, key, container);
  }
}


export function showNotification(message, delta, ownerIds = null) {
  if (delta === 0) return;

  const key = message;
  const pending = pendingDeltas.get(key);
  if (pending) {
    pending.delta += delta;
    clearTimeout(pending.timer);
    pending.timer = setTimeout(() => flushPending(key), ACCUMULATE_DELAY);
    const existing = activeNotifications.get(key);
    if (existing && existing.parentNode && pending.delta !== 0) {
      updateNotificationElement(existing, pending.delta);
      scheduleRemoval(existing, key, getOrCreateContainer());
    }
  } else {
    pendingDeltas.set(key, {
      delta, message,
      timer: setTimeout(() => flushPending(key), ACCUMULATE_DELAY)
    });
  }
}

export function showBroadcastNotification(message) {
  const container = getOrCreateContainer();
  const notification = document.createElement("div");
  notification.className = 'fame-notification negative';
  notification.innerHTML = `
    <div class="fame-notification-icon">
      <i class="fa-solid fa-exclamation-triangle"></i>
    </div>
    <div class="fame-notification-content">
      <span class="fame-notification-message">${escapeHtmlLocal(message)}</span>
    </div>
  `;
  container.appendChild(notification);
  playNotificationSound();
  const key = `broadcast-${Date.now()}`;
  activeNotifications.set(key, notification);
  scheduleRemoval(notification, key, container);
}

export function showRelationChangeNotification(sourceName, targetName, delta, targetPcId = null, options = {}) {
  const settings = Data.getSettings();
  if (!settings.enabled || delta === 0) return;

  const locKey = delta > 0 ? `${MODULE_ID}.remember.relation-improved` : `${MODULE_ID}.remember.relation-worsened`;
  const message = game.i18n.format(locKey, { source: sourceName, target: targetName });

  game.socket.emit(`module.${MODULE_ID}`, {
    type: "showNotification", message, delta
  });

  showNotification(message, delta);
}

export function broadcastWantedAnnouncement(pcName, locationName, level) {
  const message = game.i18n.format(`${MODULE_ID}.wanted.announced`, {
    name: pcName, location: locationName, level: '★'.repeat(level)
  });

  game.socket.emit(`module.${MODULE_ID}`, {
    type: "showNotification", message, delta: -1, ownerIds: null
  });

  showBroadcastNotification(message);
}

export async function changeReputation(delta, actorId = null) {
  const { addRep } = await import('./api.js');
  const { getActiveParty } = await import('./party.js');
  const settings = Data.getSettings();
  if (!settings.enabled) return;

  let actor;
  if (actorId) {
    actor = game.actors.get(actorId);
  } else {
    const token = canvas.tokens.controlled[0];
    if (token) actor = token.actor;
    else actor = game.user.character;
  }

  if (!actor) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.remember.warn-no-token`));
    return;
  }

  const party = getActiveParty();
  if (!party) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.remember.warn-no-party`));
    return;
  }

  await addRep(actor.id, { type: 'faction', id: party.id }, delta);
}