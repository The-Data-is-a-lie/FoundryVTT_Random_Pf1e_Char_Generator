/**
 * The two buff blocks: inherent/level-up stat trackers, and the optional custom-buff set.
 *
 * They share a module because they are the same kind of thing — buff items cloned from a template
 * bundle and then parameterised from the payload — and neither is read back by anything later. Both
 * are leaves.
 */
import { appendJsonToTemplate } from './items.js';
import { readCustomBuffsFlag } from '../shared/storage.js';
import { log } from '../shared/log.js';

/**
 * One stat-tracker buff item, built from the `inherents` template and named for what it tracks.
 *
 * Called twice, for the two different sources of permanent ability-score increases: the level-up
 * bumps and the inherent bonuses. Both come from the SAME template, which is what makes the
 * re-identification below matter.
 */
function addStatBuff(ctx, templateName, stats, label) {
  // Deep copy to avoid mutation of shared state -- the loader hands every generation in the session
  // the same parsed objects.
  const data = structuredClone(ctx.templates[templateName]);

  // Turns data -> array if it isn't already
  let wrappedData = Array.isArray(data) ? data : [data];

  wrappedData = changeStatBuff(ctx, wrappedData, stats, label);
  log.debug("this is the wrapped data", wrappedData);

  appendJsonToTemplate(wrappedData, ctx.exportTemplate, label);
}

function changeStatBuff(ctx, dataArray, stats, label) {
  // loops through each stat in the relevant stat array and assigns the value to the corresponding stat in the dataArray
  for (const item of dataArray) {
    item.name = label;
    item._id = ctx.newId('statBuff', [label, item]); // Generate a unique ID for each item

    // The template's ActiveEffect carries its OWN baked-in name and origin, and re-identifying the
    // item above does not reach them. Both stat buffs come from the same template, so without this
    // the character ends up with two tracker effects both labelled "Inherent" -- and every effect's
    // origin points at an item _id that no longer exists, because the line above just replaced it.
    for (const effect of item.effects ?? []) {
      effect.name = label;
      effect.origin = `.Item.${item._id}`;
    }

    if (!item.system?.changes) continue;

    for (const change of item.system.changes) {
      const target = change.target;
      if (stats.hasOwnProperty(target)) {
        change.formula = stats[target].toString();
      }
    }
  }
  return dataArray;
}

/** Both stat trackers, in the order they have always been appended. */
export function addStatBuffs(ctx) {
  addStatBuff(ctx, 'inherents', ctx.characterData.level_up_stats, 'level_up_stats');
  addStatBuff(ctx, 'inherents', ctx.characterData.inherents, 'Inherents');
}

/**
 * The house custom-buff set, if the player asked for it in the generator dialog.
 *
 * Opt-in: `button.js` records the choice and this reads it back through the named storage accessor.
 * Two of the eleven golden fixtures run with it on, so both branches stay covered.
 */
export function addCustomBuffs(ctx) {
  if (readCustomBuffsFlag().toLowerCase() !== 'y') return;

  const characterData = ctx.characterData;
  const buffs = structuredClone(ctx.templates.customBuffs);
  if (!Array.isArray(buffs)) { console.warn('custom_buffs.json missing or not an array'); return; }

  // Buffs that start active (the "X" set). Combat buffs + the acrobatics reference stay inactive.
  const ACTIVE = new Set(['Professions', 'Skill Synergies', 'Acrobatics Speed']);

  // Highest mental ability decides which skill-ranks buff to keep (Int highest -> neither;
  // ties -> Int > Wis > Cha). Prefer the backend's initiation_stat export — the same FINAL-score
  // calculation (base + inherents + level-ups) that drives the pf1-pow initiating stat — and
  // fall back to comparing raw scores for an un-redeployed backend.
  let mentalBuff = null;
  const exportedMental = String(characterData.initiation_stat || '').toLowerCase();
  if (['int', 'wis', 'cha'].includes(exportedMental)) {
    if (exportedMental === 'wis') mentalBuff = 'Skill Ranks Based on Wisdom';
    else if (exportedMental === 'cha') mentalBuff = 'Skill Ranks Based on Charisma';
  } else {
    const wis = Number(characterData.wis) || 0;
    const cha = Number(characterData.cha) || 0;
    const intel = Number(characterData.int) || 0;
    if (wis >= cha && wis > intel) mentalBuff = 'Skill Ranks Based on Wisdom';
    else if (cha > wis && cha > intel) mentalBuff = 'Skill Ranks Based on Charisma';
  }

  // Flat acrobatics number for the active buff: floor(land_speed/10 - 3) * 4
  const landSpeed = Number(characterData.land_speed) || 30;
  const acroFlat = Math.floor(landSpeed / 10 - 3) * 4;

  // Professions buff: one chosen profession per line
  let professions = characterData.professions;
  if (typeof professions === 'string') { try { professions = JSON.parse(professions); } catch (e) { professions = [professions]; } }
  const professionsHtml = Array.isArray(professions) ? professions.map(p => `<p>${p}</p>`).join('') : '';

  const result = [];
  for (const buff of buffs) {
    // keep only the selected mental-ranks buff
    if (buff.name === 'Skill Ranks Based on Wisdom' || buff.name === 'Skill Ranks Based on Charisma') {
      if (buff.name !== mentalBuff) continue;
    }
    buff.system = buff.system || {};
    buff.system.active = ACTIVE.has(buff.name) || buff.name === mentalBuff;

    if (buff.name === 'Professions') {
      buff.system.description = buff.system.description || {};
      buff.system.description.value = professionsHtml;
    }
    if (buff.name === 'Acrobatics Speed' && Array.isArray(buff.system.changes) && buff.system.changes[0]) {
      buff.system.changes[0].formula = String(acroFlat);
    }
    result.push(buff);
  }

  appendJsonToTemplate(result, ctx.exportTemplate, 'CustomBuffs');
  log.debug(`Added ${result.length} custom buffs (mental=${mentalBuff}, acroFlat=${acroFlat}).`);
}
