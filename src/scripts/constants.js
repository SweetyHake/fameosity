export const MODULE_ID = "fameosity";

export const CONFIG_REMEMBER = {
  displayDuration: 3500,
  fadeInDuration: 600,
  fadeOutDuration: 400,
  positionTop: "80px",
  positionLeft: "120px",
  sound: null,
  soundVolume: 0.5
};

export const DEFAULT_TIER_KEYS = [
  { nameKey: "tiers.nemesis", minValue: -80, color: "#8b0000" },
  { nameKey: "tiers.hostile", minValue: -50, color: "#c45a2a" },
  { nameKey: "tiers.unfriendly", minValue: -30, color: "#b89a3a" },
  { nameKey: "tiers.wary", minValue: -10, color: "#7a7a6a" },
  { nameKey: "tiers.neutral", minValue: 10, color: "#717171" },
  { nameKey: "tiers.friendly", minValue: 30, color: "#659365" },
  { nameKey: "tiers.allied", minValue: 50, color: "#3a9a3a" },
  { nameKey: "tiers.devoted", minValue: 80, color: "#2a7a9a" }
];

export const DEFAULT_SETTINGS = {
  enabled: true,
  displayMode: "show",
  min: -100,
  max: 100,
  defaultActorMode: "manual",
  defaultFactionMode: "manual"
};

export const DEFAULT_DATA = {
  actors: {},
  factions: [],
  trackedActors: [],
  individualRelations: {},
  factionRelations: {},
  actorFactionRelations: {},
  factionToFactionRelations: {},
  modeFlags: {
    actors: {},
    factions: {}
  },
  hiddenItems: {
    factions: [],
    actors: [],
    locations: []
  },
  hiddenRelations: {
    individual: {},
    faction: {},
    actorFaction: {}
  },
  hiddenMembers: {},
  hiddenLocationItems: {
    factions: {},
    actors: {}
  },
  actorNames: {},
  personalVisibility: {},
  locations: [],
  entityInfo: {},
  descriptions: {
    actors: {},
    factions: {},
    locations: {}
  },
  customPCs: [],
  activePartyId: null
};

export const SOCKET_TYPES = {
  SHOW_NOTIFICATION: "showNotification",
  UPDATE_DATA: "updateData",
  REQUEST_DATA_UPDATE: "requestDataUpdate",
  SET_IND_REL: "setIndRel",
  SET_FACTION_REL: "setFactionRel",
  SET_ACTOR_FACTION_REL: "setActorFactionRel",
  SET_CUSTOM_NAME: "setCustomName"
};