import { MODULE_ID } from '../constants.js';

/**
 * Central template registry for the relations viewer.
 *
 * Uses the official loadTemplates() API so partials land in the same
 * managed store ApplicationV2 part rendering resolves against.
 */
export const RELATIONS_PARTIALS = {
  'relations/partials/navigator': `modules/${MODULE_ID}/templates/relations/partials/navigator.hbs`,
  'relations/partials/detail-location': `modules/${MODULE_ID}/templates/relations/partials/detail-location.hbs`,
  'relations/partials/detail-faction': `modules/${MODULE_ID}/templates/relations/partials/detail-faction.hbs`,
  'relations/partials/detail-actor': `modules/${MODULE_ID}/templates/relations/partials/detail-actor.hbs`,
  'relations/partials/rep-bar': `modules/${MODULE_ID}/templates/relations/partials/rep-bar.hbs`,
  'relations/partials/rel-row': `modules/${MODULE_ID}/templates/relations/partials/rel-row.hbs`
};

export const RELATIONS_MAIN_TEMPLATES = [
  `modules/${MODULE_ID}/templates/relations/main.hbs`
];

let templatesLoaded = false;

/**
 * Registers all module templates and partials once per client session.
 * Safe to call repeatedly and before init finishes; subsequent calls are no-ops.
 */
export async function ensureRelationsTemplates() {
  if (templatesLoaded && Object.keys(RELATIONS_PARTIALS).every(name => name in (Handlebars.partials ?? {}))) return;

  try {
    await foundry.applications.handlebars.loadTemplates(RELATIONS_PARTIALS);
    await foundry.applications.handlebars.loadTemplates(RELATIONS_MAIN_TEMPLATES);
  } catch (err) {
    console.error(`${MODULE_ID} | Template preloading failed:`, err);
    return;
  }

  const missing = Object.keys(RELATIONS_PARTIALS).filter(name => !(name in (Handlebars.partials ?? {})));
  if (missing.length) {
    console.error(`${MODULE_ID} | Partials did not register:`, missing);
    return;
  }

  templatesLoaded = true;
  console.log(`${MODULE_ID} | ${Object.keys(RELATIONS_PARTIALS).length} partials registered`);
}
