import { MODULE_ID, CONFIG_REMEMBER } from '../constants.js';
import { getSettings, clamp } from '../data.js';
import { getDisplayName, getActorMode, getActorRep, setActorRep, getPCs } from './actors.js';
import { adjustIndRels } from './relations.js';
import { getFaction, changeFactionRep, getFactionMode } from './factions.js';
import { shouldShowNotification } from './visibility.js';

const activeNotifications = new Map();
const NOTIFICATION_TIMEOUT = 5000;

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

function createNotificationElement(tokenName, actionText, delta) {
  const icon = delta > 0 ? "+" : "−";
  const iconColor = delta > 0 ? "var(--fame-color-success)" : "var(--fame-color-error)";
  const notification = document.createElement("div");
  notification.className = "fame-notification";
  notification.innerHTML = `
    <div class="fame-notification-icon" style="border-color:${iconColor};color:${iconColor}">${icon}</div>
    <div class="fame-notification-content">
      <span class="fame-notification-name">${escapeHtml(tokenName)}</span>
      <span class="fame-notification-action">${escapeHtml(actionText)}</span>
    </div>
  `;
  return notification;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function scheduleRemoval(notification, key, container) {
  const cleanup = () => {
    if (notification.parentNode) notification.remove();
    activeNotifications.delete(key);
    if (container && !container.children.length) container.remove();
  };
  setTimeout(() => {
    notification.classList.add('out');
    notification.addEventListener('animationend', cleanup, { once: true });
    setTimeout(cleanup, CONFIG_REMEMBER.fadeOutDuration + 100);
  }, CONFIG_REMEMBER.displayDuration);
  setTimeout(() => {
    if (activeNotifications.has(key)) cleanup();
  }, CONFIG_REMEMBER.displayDuration + NOTIFICATION_TIMEOUT);
}

export function showNotification(tokenName, actionText, delta, ownerIds = null) {
  if (ownerIds !== null) {
    if (!ownerIds.includes(game.user.id) && !game.user.isGM) return;
  } else {
    if (!game.user.isGM) return;
  }
  
  const notificationKey = `${tokenName}-${actionText}-${delta > 0 ? 'up' : 'down'}`;
  if (activeNotifications.has(notificationKey)) return;
  const container = getOrCreateContainer();
  const notification = createNotificationElement(tokenName, actionText, delta);
  container.appendChild(notification);
  activeNotifications.set(notificationKey, notification);
  playNotificationSound();
  scheduleRemoval(notification, notificationKey, container);
}

export function showRelationChangeNotification(sourceName, targetName, delta, targetPcId = null, options = {}) {
  const settings = getSettings();
  if (!settings.enabled || delta === 0) return;
  
  const { sourceId, targetId, relationType } = options;
  if (sourceId && targetId && relationType) {
    if (!shouldShowNotification(relationType, sourceId, targetId)) return;
  }
  
  const ownerIds = new Set();
  
  if (sourceId) {
    const sourceActor = game.actors.get(sourceId);
    if (sourceActor?.hasPlayerOwner) {
      Object.entries(sourceActor.ownership || {})
        .filter(([userId, level]) => level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && userId !== 'default')
        .forEach(([userId]) => ownerIds.add(userId));
    }
  }
  
  if (targetPcId) {
    const targetActor = game.actors.get(targetPcId);
    if (targetActor?.hasPlayerOwner) {
      Object.entries(targetActor.ownership || {})
        .filter(([userId, level]) => level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && userId !== 'default')
        .forEach(([userId]) => ownerIds.add(userId));
    }
  }
  
  if (targetId && targetId !== targetPcId) {
    const targetActor = game.actors.get(targetId);
    if (targetActor?.hasPlayerOwner) {
      Object.entries(targetActor.ownership || {})
        .filter(([userId, level]) => level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && userId !== 'default')
        .forEach(([userId]) => ownerIds.add(userId));
    }
  }

  const ownerIdsArray = [...ownerIds];
  
  const actionKey = delta > 0 ? "relation-improved" : "relation-worsened";
  const actionText = game.i18n.format(`${MODULE_ID}.remember.${actionKey}`, { target: targetName });

  game.socket.emit(`module.${MODULE_ID}`, {
    type: "showNotification",
    tokenName: sourceName,
    actionText,
    delta,
    ownerIds: ownerIdsArray
  });

  showNotification(sourceName, actionText, delta, ownerIdsArray);
}

export async function changeReputation(delta, actorId = null) {
  const settings = getSettings();
  if (!settings.enabled) return;

  let actor, displayName;

  if (actorId) {
    actor = game.actors.get(actorId);
    displayName = getDisplayName(actorId);
  } else {
    const token = canvas.tokens.controlled[0];
    if (token) {
      actor = token.actor;
      displayName = token.name;
    } else {
      actor = game.user.character;
      if (actor) displayName = getDisplayName(actor.id);
    }
  }

  if (!actor) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.remember.warn-no-token`));
    return;
  }

  const mode = getActorMode(actor.id);
  const pcs = getPCs().filter(pc => pc.id !== actor.id);

  if (mode === 'auto') {
    await adjustIndRels(actor.id, delta);
    for (const pc of pcs) {
      showRelationChangeNotification(displayName, getDisplayName(pc.id), delta, pc.id, {
        sourceId: actor.id,
        targetId: pc.id,
        relationType: 'individual'
      });
    }
  } else if (mode === 'hybrid') {
    const currentRep = getActorRep(actor.id);
    await setActorRep(actor.id, clamp(currentRep + delta));
    for (const pc of pcs) {
      showRelationChangeNotification(displayName, getDisplayName(pc.id), delta, pc.id, {
        sourceId: actor.id,
        targetId: pc.id,
        relationType: 'individual'
      });
    }
  } else {
    const currentRep = getActorRep(actor.id);
    await setActorRep(actor.id, clamp(currentRep + delta));
    for (const pc of pcs) {
      showRelationChangeNotification(displayName, getDisplayName(pc.id), delta, pc.id, {
        sourceId: actor.id,
        targetId: pc.id,
        relationType: 'individual'
      });
    }
  }
}

export async function changeFactionRepWithNotify(factionId, delta) {
  const settings = getSettings();
  const faction = getFaction(factionId);
  if (!faction) return;

  const mode = getFactionMode(factionId);
  if (mode === 'auto') return;

  await changeFactionRep(factionId, delta);

  if (!settings.enabled) return;
  if (!shouldShowNotification('faction', factionId, null)) return;

  const pcs = getPCs();
  for (const pc of pcs) {
    showRelationChangeNotification(faction.name, getDisplayName(pc.id), delta, pc.id, {
      sourceId: factionId,
      targetId: pc.id,
      relationType: 'faction'
    });
  }
}