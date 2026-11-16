/**
 * Empty slots: the placeholders on a blank character sheet.
 *
 * The backend's blank mode (the Blank Character Generator) answers with a character that has
 * nothing chosen and a `slots` list -- one row per thing it is owed: a feat, a fighter bonus feat at
 * 4th level, a rogue talent at 2nd, a trait, a minor flaw. This file turns each row into one
 * placeholder item, filed under the divider a generated character's real pick would sit under. The
 * player drags the real feat onto the sheet and deletes the placeholder.
 *
 * A PLACEHOLDER IS A TAG AND NOTHING ELSE (ruled 2026-11-16, after the first sheets were looked at):
 * its name is the tag a generated row of the same kind carries -- "(Feat 3)", "(Story Feat 5)",
 * "(Fighter 4)", "(Rogue Talent 2)", "(Flaw, Minor)" -- with no name after it, and its description
 * is empty. So a blank sheet reads like a generated one with the names rubbed out.
 *
 * NOTHING HERE COUNTS ANYTHING. How many feats a fighter 10 gets, at which class levels, and whether
 * the house rules add story feats to that, is the backend's answer (`utils/class_func/blank.py`);
 * this module has never carried that arithmetic and still does not. What it DOES own is how a row
 * is numbered on the sheet, because it already numbers a generated character's rows -- see
 * `FEAT_ROW_NUMBERING` in build/feats.js, which both paths read. A payload without `slots` -- every
 * ordinary generated character, and every backend from before blank mode -- adds nothing at all.
 *
 * TWO ENTRY POINTS, because the sheet is laid out by two different mechanisms:
 *
 *   - `seedClassFeatureSlots` runs BEFORE the class-features stage. That stage already knows how to
 *     put a class choice under its class's band and its own ladder divider, from three payload
 *     fields. Rather than re-derive that layout, the slot rows are written into those fields as
 *     seeded choices, and the stage draws them exactly as it draws a real pick.
 *   - `addSlots` runs after the feats and traits stages. It strips the seeded choices back to
 *     their bare tag, and appends everything else itself: those sections are plain sort ranges,
 *     the ones build/feats.js gives the real picks.
 */
import {
  appendJsonToTemplate, appendFeatDivider, synthesizeFeatItem, addingReceivedLocationToName,
} from './items.js';
import { FEAT_ROW_NUMBERING } from './feats.js';

export const MODULE_ID = 'pf1e_random_char_generator';
/** The flag every placeholder carries, so a sheet (or a macro) can tell one from a real item. */
export const SLOT_FLAG = 'slot';

/**
 * Where each slot section sits: the sort its first placeholder takes and the sheet section
 * (`subType`) it belongs to. The sorts are the ones build/feats.js gives the real picks of the same
 * kind -- a placeholder for a story feat goes where a story feat goes.
 *
 * `divider` is for a section whose heading the other stages only draw when the character HAS
 * something in it: the Flaws heading needs a flaw, and the Trainers heading a trainer feat.
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
  trainer_feats:   { sort: 3610,  subType: 'feat',
                     divider: { title: '__________________________ Trainers _______________________', sort: 3600 } },
  traits:          { sort: 100,   subType: 'trait' },
  flaws:           { sort: 50100, subType: 'trait',
                     divider: { title: '____________________ Flaws______________________', sort: 50000 } },
});

/**
 * What a class-choice slot is called while it passes through the class-features stage. That stage
 * needs a distinct name per choice in a bucket, so each is seeded as "<this> N"; `addSlots` then
 * strips it, leaving the stage's own "(Rogue Talent 2)" tag.
 */
const SEEDED_CHOICE = 'Empty slot';
const SEEDED_CHOICE_NAME = new RegExp(`^(\\(.+\\)) ${SEEDED_CHOICE} \\d+$`);

/** The payload's slot rows, or [] -- tolerant of an absent or malformed key. */
export function slotRows(characterData) {
  const rows = characterData?.slots;
  return Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object' && row.label) : [];
}

/**
 * The name of every non-class-choice placeholder, in the order of `rows`.
 *
 * The general, story, flavor and flaw feats are numbered by POSITION with the very table and the
 * very function a generated character's rows go through -- "(Feat 1)", "(Feat 3)", "(Story Feat 5)"
 * -- so the two kinds of sheet cannot drift apart. Every other row is its backend label in
 * parentheses: "(Fighter 4)", "(Trainer 1)", "(Flaw, Minor)", "(Trait 3)".
 */
export function slotNames(rows) {
  const names = new Map();
  for (const [section, numbering] of Object.entries(FEAT_ROW_NUMBERING)) {
    const inSection = rows.filter((row) => row.section === section);
    const numbered = inSection.map(() => ({ name: '' }));
    addingReceivedLocationToName(numbered, numbering.label, true, numbering.start, numbering.step, numbering.levels, null);
    inSection.forEach((row, index) => names.set(row, numbered[index].name.trim()));
  }
  return rows.map((row) => names.get(row) ?? `(${String(row.label)})`);
}

const slotFlag = (row) => ({
  [MODULE_ID]: {
    [SLOT_FLAG]: { section: row.section, kind: row.kind, class: row.class ?? '', level: row.level ?? null },
  },
});

/** One placeholder item for one slot row: a name, an empty description, a flag. */
export function slotItem(row, name, sort, subType) {
  const item = synthesizeFeatItem(name, '');
  item.sort = sort;
  item.system.subType = subType;
  item.flags = slotFlag(row);
  return item;
}

/**
 * Write the class-choice slots into the three payload fields the class-features stage lays out.
 *
 * Each row becomes a seeded choice in its bucket, stamped with the class level that grants it and
 * owned by its class -- so the stage files it in that class's band, under the bucket's own divider,
 * in level order. `addSlots` strips the seed name afterwards.
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
    const name = `${SEEDED_CHOICE} ${counts[bucket]}`;
    (data.class_features[bucket] ??= {})[name] = '';
    (data.class_feature_levels[bucket] ??= {})[name] = Number(row.level);
    // The band is keyed by the lower-cased class name, which is the lower-cased display name.
    data.class_feature_owners[bucket] ??= String(row.class ?? '').toLowerCase();
  }
  return rows.length;
}

/**
 * Strip the seeded class choices back to their tag: "(Rogue Talent 2) Empty slot 1" becomes
 * "(Rogue Talent 2)", with an empty description and the placeholder flag.
 *
 * @returns {number} how many were stripped.
 */
function finishClassFeatureSlots(ctx) {
  let finished = 0;
  for (const item of ctx.exportTemplate?.items ?? []) {
    const seeded = SEEDED_CHOICE_NAME.exec(String(item?.name ?? ''));
    if (!seeded) continue;
    item.name = seeded[1];
    if (item.system?.description) item.system.description.value = '';
    item.flags = { ...(item.flags ?? {}), ...slotFlag({ section: 'class_features', kind: 'class_feature' }) };
    finished += 1;
  }
  return finished;
}

/**
 * Finish the class-choice placeholders and append one for every other slot.
 *
 * @returns {number} how many placeholders the sheet now carries.
 */
export async function addSlots(ctx) {
  const all = slotRows(ctx.characterData);
  if (!all.length) return 0;
  let added = finishClassFeatureSlots(ctx);

  const rows = all.filter((row) => row.section !== 'class_features');
  const names = slotNames(rows);
  const next = {};                 // section -> the next sort to hand out
  const drawn = new Set();         // dividers already on the sheet
  for (const [index, row] of rows.entries()) {
    const section = SLOT_SECTIONS[row.section];
    if (!section) {
      console.warn(`Blank character: no sheet section for slot "${row.label}" (${row.section}); skipped.`);
      continue;
    }
    if (section.divider && !drawn.has(section.divider.title)) {
      drawn.add(section.divider.title);
      await appendFeatDivider(ctx, section.divider.title, section.divider.sort, section.subType);
    }
    const sort = next[row.section] ?? section.sort;
    next[row.section] = sort + 1;
    appendJsonToTemplate([slotItem(row, names[index], sort, section.subType)], ctx.exportTemplate, 'Feat');
    added += 1;
  }
  return added;
}
