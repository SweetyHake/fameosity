# Fameosity - Reputation system for Foundry VTT

A system agnostic reputation and relations management module for Foundry VTT that allows Game Masters to track complex social dynamics between NPCs, factions, locations, and player characters.

>  **Early Development Notice**
> 
> This module is currently in active development and is **not a finished product**. Features may be incomplete, unstable, or subject to change without notice.
> 
> Feedback, bug reports, feature requests are greatly appreciated!

## Features

###  Actor Reputation Tracking
- Track reputation values for any actor in your world
- Customizable reputation range (default: -100 to +100)
- Visual reputation bar with color-coded tiers
- Support for custom display names
- Automatic or manual reputation calculation modes
![Actor Tracking](https://raw.githubusercontent.com/SweetyHake/fameosity/refs/heads/main/screenshots/actors.webp)

###  Faction System
- Create and manage factions with custom images
- Add members to factions with rank assignments
- Three reputation modes:
  - **Manual**: Set faction reputation directly
  - **Auto**: Automatically calculated from member reputations
  - **Hybrid**: Combines base reputation with member influence
- Customizable ranks with reputation thresholds and multipliers
![Faction System](https://raw.githubusercontent.com/SweetyHake/fameosity/refs/heads/main/screenshots/ranks.webp)

### Location Management
- Create locations to represent cities, regions, or territories
- Associate factions and actors with locations
![Location Management](https://raw.githubusercontent.com/SweetyHake/fameosity/refs/heads/main/screenshots/locations.webp)

### Individual Relations
- Track personal relationships between NPCs and PCs
- Per-character attitude tracking
- Visibility controls for GM-only information

### Relation Tiers
- Fully customizable relation tiers (Hatred → Alliance)
- Color-coded visual indicators
- Configurable reputation thresholds

### Player Features
- **Character Tab**: View your character's standing with factions, NPCs, and locations
- See wanted status across locations
- Track personal relationships with NPCs
- View faction membership and ranks

### Notifications
- Visual notifications for reputation changes
- Customizable notification sounds
- Socket-based sync for multiplayer
