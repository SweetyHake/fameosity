import { MODULE_ID } from '../constants.js';
import * as Data from '../data.js';
import { ReputationEvents } from '../events.js';

export { getValidChildLocationTypes } from './tree.js';

export function getLocations() {
  return Data.getData().locations || [];
}

export function getLocation(locationId) {
  return getLocations().find(l => l.id === locationId) || null;
}

export async function setLocations(locations) {
  const data = Data.getData();
  data.locations = locations;
  await Data.setData(data);
  ReputationEvents.emit(ReputationEvents.EVENTS.LOCATION_CHANGED, { locations });
}

export async function addLocation(locationData) {
  const locations = getLocations();
  const newLocation = {
    id: foundry.utils.randomID(),
    name: locationData.name || game.i18n.localize(`${MODULE_ID}.locations.new-location`),
    image: locationData.image || "icons/svg/village.svg",
    locationType: locationData.locationType || 'poi',
    customTypeName: locationData.customTypeName || "",
    parentId: locationData.parentId || null,
    factions: locationData.factions || [],
    actors: locationData.actors || []
  };
  locations.push(newLocation);
  await setLocations(locations);
  return newLocation;
}

export async function updateLocation(locationId, updates) {
  const locations = getLocations();
  const location = locations.find(l => l.id === locationId);
  if (!location) return null;
  Object.assign(location, updates);
  await setLocations(locations);
  return location;
}

export async function deleteLocation(locationId) {
  const locations = getLocations();
  const index = locations.findIndex(l => l.id === locationId);
  if (index > -1) {
    locations.splice(index, 1);
    await setLocations(locations);
    return true;
  }
  return false;
}

export async function setLocationParent(locationId, parentId) {
  const locations = getLocations();
  const location = locations.find(l => l.id === locationId);
  if (!location) return false;
  location.parentId = parentId || null;
  await setLocations(locations);
  return true;
}

export async function addActorToLocation(locationId, actorId) {
  const locations = getLocations();
  const location = locations.find(l => l.id === locationId);
  if (!location) return false;
  location.actors ??= [];
  if (!location.actors.includes(actorId)) {
    location.actors.push(actorId);
    await setLocations(locations);
    return true;
  }
  return false;
}

export async function removeActorFromLocation(locationId, actorId) {
  const locations = getLocations();
  const location = locations.find(l => l.id === locationId);
  if (!location?.actors) return false;
  const index = location.actors.indexOf(actorId);
  if (index > -1) {
    location.actors.splice(index, 1);
    await setLocations(locations);
    return true;
  }
  return false;
}

export async function addFactionToLocation(locationId, factionId) {
  const locations = getLocations();
  const location = locations.find(l => l.id === locationId);
  if (!location) return false;
  location.factions ??= [];
  if (!location.factions.includes(factionId)) {
    location.factions.push(factionId);
    await setLocations(locations);
    return true;
  }
  return false;
}

export async function removeFactionFromLocation(locationId, factionId) {
  const locations = getLocations();
  const location = locations.find(l => l.id === locationId);
  if (!location?.factions) return false;
  const index = location.factions.indexOf(factionId);
  if (index > -1) {
    location.factions.splice(index, 1);
    await setLocations(locations);
    return true;
  }
  return false;
}

export function getAncestorLocations(allLocs, locationId) {
  const result = [];
  let current = allLocs.find(l => l.id === locationId);
  while (current?.parentId) {
    const parent = allLocs.find(l => l.id === current.parentId);
    if (!parent) break;
    result.push(parent);
    current = parent;
  }
  return result;
}