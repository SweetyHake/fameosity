import * as Locations from './locations.js';
import * as Factions from './factions.js';
import * as Actors from './actors.js';

export function findByName(name, type = null) {
  if (!name) return null;
  const query = name.toLowerCase().trim();
  
  const searchLocations = () => {
    const location = Locations.getLocations().find(l => l.name.toLowerCase() === query);
    return location ? { ...location, entityType: 'location' } : null;
  };
  
  const searchFactions = () => {
    const faction = Factions.getFactions().find(f => f.name.toLowerCase() === query);
    return faction ? { ...faction, entityType: 'faction' } : null;
  };
  
  const searchActors = () => {
    const tracked = Actors.getTracked();
    for (const actorId of tracked) {
      const displayName = Actors.getDisplayName(actorId);
      if (displayName.toLowerCase() === query) {
        const actor = game.actors.get(actorId);
        if (actor) {
          return {
            id: actor.id,
            name: displayName,
            img: actor.img,
            entityType: 'actor'
          };
        }
      }
    }
    return null;
  };
  
  if (type === 'location') return searchLocations();
  if (type === 'faction') return searchFactions();
  if (type === 'actor') return searchActors();
  
  return searchLocations() || searchFactions() || searchActors();
}