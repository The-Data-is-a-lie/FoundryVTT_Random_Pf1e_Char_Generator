/**
 * Empty slots: the placeholders on a blank character sheet.
 *
 * The backend's blank mode (the Blank Character Generator) answers with a character that has
 * nothing chosen and a `slots` list -- one row per thing it is owed: a feat at 3rd level, a fighter
 * bonus feat at 4th, a rogue talent at 2nd, a minor flaw. This file turns each row into one
 * placeholder item, filed under the divider a generated character's real pick would sit under. The
 * player drags the real feat onto the sheet and deletes the placeholder.
 *
 * NOTHING HERE COUNTS ANYTHING. How many feats a fighter 10 gets, at which levels, and whether the
 * house rules add story feats to that, is the backend's answer (`utils/class_func/blank.py`); this
 * module has never carried that arithmetic and still does not. A payload without `slots` -- every
 * ordinary generated character, and every backend from before blank mode -- adds nothing at all.
 *
 * TWO ENTRY POINTS, because the sheet is laid out by two different mechanisms:
 *
 *   - `seedClassFeatureSlots` runs BEFORE the class-features stage. That stage already knows how to
 *     put a class choice under its class's band and its own ladder divider, from three payload
 *     fields. Rather than re-derive that layout, the slot rows are written into those fields as
 *     choices named "Empty slot N", and the stage draws them exactly as it draws a real pick.
 *   - `addSlots` runs after the feats and traits stages and appends the rest itself: those sections
 *     are plain sort ranges, copied below from build/feats.js.
 */
import { appendJsonToTemplate, appendFeatDivider, synthesizeFeatItem } from './items.js';

export const MODULE_ID = 'pf1e_random_char_generator';
/** The flag every placeholder carries, so a sheet (or a macro) can tell one from a real item. */
export const SLOT_FLAG = 'slot';

/**
 * Where each slot section sits: the sort its first placeholder takes and the sheet section
 * (`subType`) it belongs to. The sorts are the ones build/feats.js gives the real picks of the same
 * kind -- a placeholder for a story feat goes where a story feat goes.
 *
 * `divider` is for a section whose heading the other stages only draw when the character HAS
 * something in it (the Flaws heading needs a flaw), and for the one section that exists only on a
 * blank sheet.
 */
export const SLOT_SECTIONS = Object.freeze({
  flavor_feats:    { sort: 200,   subType: 'feat' },
  flaw_feats:      { sort: 250,   subType: 'feat' },
  story_feats:     { sort: 500,   subType: 'feat' },
  feats:           { sort: 1500,  subType: 'feat' },
  teamwork_feats:  { sort: 2500,  subType: 'feat' },
  class_feats:     { sort: 3000,  subType: 'feat' },
  monk_feats:      { sort: 3300,  subType: 'feat' },
  bloodline_feats: { sort: 3500,  subType: 'feat' },
  traits:          { sort: 100,   subType: 'trait' },
  flaws:           { sort: 50100, subType: 'trait',
                     divider: { title: '____________________ Flaws______________________', sort: 50000 } },
  abilities:       { sort: 6100,  subType: 'feat', divider: 'stillToChoose' },
  spells:          { sort: 6300,  subType: 'feat', divider: 'stillToChoose' },
  skills:          { sort: 6600,  subType: 'feat', divider: 'stillToChoose' },
});

/** The one heading that exists only on a blank sheet: what is owed that is not a feat or a trait. */
const STILL_TO_CHOOSE = { title: '__________________________ Still To Choose _____________________', sort: 6000 };

/** What a placeholder says when it is opened. */
const SLOT_NOTES = Object.freeze({
  feat: 'An empty feat slot. Drag the feat you choose onto the sheet, then delete this placeholder.',
  trait: 'An empty trait slot. Drag the trait you choose onto the sheet, then delete this placeholder.',
  flaw: 'An empty flaw slot. Add the flaw you choose, then delete this placeholder.',
  class_feature: 'An empty class choice. Add the option you choose, then delete this placeholder.',
  ability_increase: 'An ability score increase you have not applied yet. Raise one ability by 1, then delete this placeholder.',
  spells_known: 'Spells of this level still to choose. Add them to the spellbook, then delete this placeholder.',
  skill_ranks: 'Skill ranks still to spend. Assign them on the Skills tab, then delete this placeholder.',
});
const DEFAULT_NOTE = 'An empty slot. Fill it, then delete this placeholder.';

/** The payload's slot rows, or [] -- tolerant of an absent or malformed key. */
export function slotRows(characterData) {
  const rows = characterData?.slots;
  return Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object' && row.label) : [];
}

/** One placeholder item for one slot row. */
export function slotItem(row, sort, subType) {
  const item = synthesizeFeatItem(String(row.label), `<p>${SLOT_NOTES[row.kind] ?? DEFAULT_NOTE}</p>`);
  item.sort = sort;
  item.system.subType = subType;
  item.flags = {
    [MODULE_ID]: {
      [SLOT_FLAG]: { section: row.section, kind: row.kind, class: row.class ?? '', level: row.level ?? null },
    },
  };
  return item;
}

/**
 * Write the class-choice slots into the three payload fields the class-features stage lays out.
 *
 * Each row becomes a choice named "Empty slot N" in its bucket, stamped with the class level that
 * grants it and owned by its class -- so the stage files it in that class's band, under the
 * bucket's own divider, in level order, as "(Rogue Talent 2) Empty slot 1".
 *
 * @returns {number} how many class-choice slots were seeded.
 */
export function seedClassFeatureSlots(ctx) {
  const data = ctx.characterData;
  const rows = slotRows(data).filter((row) => row.section === 'class_features' && row.bucket);
  if (!rows.length) return 0;

  for (const key of ['class_features', 'class_feature_levels', 'class_feature_owners']) {
    if (!data[key] || typeof data[key] !== 'object' || Array.isArray(data[key])) data[key] = {};
  }
  const counts = {};
  for (const row of rows) {
    const bucket = String(row.bucket);
    counts[bucket] = (counts[bucket] ?? 0) + 1;
    const name = `Empty slot ${counts[bucket]}`;
    (data.class_features[bucket] ??= {})[name] = SLOT_NOTES.class_feature;
    (data.class_feature_levels[bucket] ??= {})[name] = Number(row.level);
    // The band is keyed by the lower-cased class name, which is the lower-cased display name.
    data.class_feature_owners[bucket] ??= String(row.class ?? '').toLowerCase();
  }
  return rows.length;
}

/**
 * Append a placeholder for every slot that is not a class choice.
 *
 * @returns {number} how many placeholders were added.
 */
export async function addSlots(ctx) {
  const rows = slotRows(ctx.characterData).filter((row) => row.section !== 'class_features');
  if (!rows.length) return 0;

  const next = {};                 // section -> the next sort to hand out
  const drawn = new Set();         // dividers already on the sheet
  let added = 0;
  for (const row of rows) {
    const section = SLOT_SECTIONS[row.section];
    if (!section) {
      console.warn(`Blank character: no sheet section for slot "${row.label}" (${row.section}); skipped.`);
      continue;
    }
    const divider = section.divider === 'stillToChoose' ? STILL_TO_CHOOSE : section.divider;
    if (divider && !drawn.has(divider.title)) {
      drawn.add(divider.title);
      await appendFeatDivider(ctx, divider.title, divider.sort, section.subType);
    }
    const sort = next[row.section] ?? section.sort;
    next[row.section] = sort + 1;
    appendJsonToTemplate([slotItem(row, sort, section.subType)], ctx.exportTemplate, 'Feat');
    added += 1;
  }
  return added;
}
