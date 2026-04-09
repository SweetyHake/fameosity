const LOCATION_HIERARCHY = ['continent', 'country', 'settlement', 'poi'];
const FACTION_HIERARCHY = ['organization', 'group'];

export function buildTree(items, expandedSet) {
  const map = new Map();
  const roots = [];

  for (const item of items) {
    map.set(item.id, { ...item, children: [], level: 0 });
  }

  for (const item of items) {
    const node = map.get(item.id);
    const parentId = item.parentId;
    if (parentId && map.has(parentId)) {
      const parent = map.get(parentId);
      node.level = parent.level + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const result = [];
  const flatten = (nodes) => {
    for (const node of nodes) {
      node.hasChildren = node.children.length > 0;
      node.childrenVisible = expandedSet.has(node.id);
      result.push(node);
      if (node.childrenVisible) {
        flatten(node.children);
      }
    }
  };
  flatten(roots);
  return result;
}

export function canNestLocation(parentType, childType) {
  const parentIdx = LOCATION_HIERARCHY.indexOf(parentType || 'poi');
  const childIdx = LOCATION_HIERARCHY.indexOf(childType || 'poi');
  return childIdx > parentIdx;
}

export function canNestFaction(parentType, childType) {
  const parentIdx = FACTION_HIERARCHY.indexOf(parentType || 'group');
  const childIdx = FACTION_HIERARCHY.indexOf(childType || 'group');
  return childIdx > parentIdx;
}

export function isDescendant(items, parentId, childId) {
  if (parentId === childId) return true;
  const children = items.filter(i => i.parentId === parentId);
  for (const child of children) {
    if (isDescendant(items, child.id, childId)) return true;
  }
  return false;
}

export function separatePlayerAndNPC(actors) {
  const pcs = [];
  const npcs = [];

  for (const actorData of actors) {
    const actor = game.actors.get(actorData.id);
    if (!actor) {
      npcs.push(actorData);
      continue;
    }

    const hasRealOwner = Object.entries(actor.ownership || {}).some(([userId, level]) => {
      if (userId === 'default') return false;
      const user = game.users.get(userId);
      return user && !user.isGM && level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    });

    if (hasRealOwner || actorData.isPC) {
      pcs.push(actorData);
    } else {
      npcs.push(actorData);
    }
  }

  return { pcs, npcs };
}

export function getValidChildTypes(parentType, hierarchy) {
  const parentIdx = hierarchy.indexOf(parentType);
  if (parentIdx === -1) return [];
  return hierarchy.slice(parentIdx + 1);
}

export function getValidChildLocationTypes(parentType) {
  return getValidChildTypes(parentType || 'poi', LOCATION_HIERARCHY);
}

export function getValidChildFactionTypes(parentType) {
  return getValidChildTypes(parentType || 'group', FACTION_HIERARCHY);
}