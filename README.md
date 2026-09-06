# Fameosity - Reputation system for Foundry VTT

A system agnostic reputation and relations management module for Foundry VTT that allows Game Masters to track complex social dynamics between NPCs, factions, locations, and player characters.

> **Early Development Notice**
>
> This module is currently in active development and is **not a finished product**. Features may be incomplete, unstable, or subject to change without notice.
>
> Feedback, bug reports, feature requests are greatly appreciated!

## Features

### Relations Viewer
A single window to manage everything: a navigator tree with locations, factions, and tracked characters, plus an active character and an active party selector. Every entity opens into a detailed dossier with its reputation bar, relations, and GM editing tools.

![Relations Viewer](https://raw.githubusercontent.com/SweetyHake/fameosity/refs/heads/main/screenshots/relations.webp)

### Actor Reputation Tracking
- Track reputation values for any actor in your world
- Customizable reputation range (default: -100 to +100)
- Visual reputation bar with color-coded tiers
- Support for custom display names
- Manual, automatic, or hybrid reputation calculation modes
![Actor Tracking](https://raw.githubusercontent.com/SweetyHake/fameosity/refs/heads/main/screenshots/actors.webp)

### Faction System
- Create organizations and sub-groups with custom images
- Add members to factions with rank assignments
- Three reputation modes:
  - **Manual**: Set faction reputation directly
  - **Auto**: Automatically calculated from member reputations
  - **Hybrid**: Combines base reputation with member influence
- Customizable ranks with reputation thresholds and multipliers
![Faction System](https://raw.githubusercontent.com/SweetyHake/fameosity/refs/heads/main/screenshots/ranks.webp)

### Location Management
- Build a hierarchy of locations: continents, countries, settlements, and points of interest
- Associate factions and actors with each location
- Assign which faction controls a location
![Location Management](https://raw.githubusercontent.com/SweetyHake/fameosity/refs/heads/main/screenshots/locations.webp)

### Individual Relations
- Track personal relationships between NPCs and PCs
- Per-character attitude tracking with sliders and tiers
- Acquaintance badges for characters that already know each other
- Visibility controls for GM-only information

### Relation Tiers
- Fully customizable relation tiers (Hatred → Alliance)
- Color-coded visual indicators
- Configurable reputation thresholds
![Relation Tiers](https://raw.githubusercontent.com/SweetyHake/fameosity/refs/heads/main/screenshots/settings.webp)

### Token HUD Integration
- Live reputation bar directly on the token HUD
- Quick +/- controls for party and personal reputation
- One-click acquaintance toggle
![Token HUD](https://raw.githubusercontent.com/SweetyHake/fameosity/refs/heads/main/screenshots/token-hud.webp)

### Player Features
- **Active Character**: Players see the world through their character's eyes
- View the character's standing with factions, NPCs, and locations
- GM controls what is visible and what stays secret

### Notifications
- Floating notifications for reputation changes
- Changes accumulate smoothly instead of spamming
- Customizable notification sounds
- Socket-based sync for multiplayer
![Notifications](https://raw.githubusercontent.com/SweetyHake/fameosity/refs/heads/main/screenshots/notifications.webp)

### Living Factions
- Faction simulation layered on top of reputations: each faction gets an agenda (goal, strategy, resources, traits, clocks)
- On every world-time tick factions act: recruit, invest, trade blows, scheme — and propose decisions for GM approval
- Time comes from the built-in Foundry VTT calendar (or Seasons & Stars / Simple Calendar / manual)
- **Living Map**: a world map plus maps bound to your Fameosity locations — squares or hexes (every Foundry grid type)
- Location maps show the factions bound to that location; the world map holds territories and location pins
- Map settings live in a dedicated map editor: grid, size, scene import, backdrop image
- Every applied event is logged with old values and can be reverted

### And more
- Keybindings to quickly increase/decrease the reputation of the selected token (Shift+1 / Shift+2 by default)
- Public JavaScript API for macro and module authors:

```js
const api = game.modules.get('fameosity').api;
await api.addTracked(actor);        // start tracking an actor
await api.setRep(npc, pc, 40);      // set a relation value
await api.addFaction({ name: 'My Faction' });
await api.openRelationsViewer();
```

## Languages
- English
- Russian
- Spanish
