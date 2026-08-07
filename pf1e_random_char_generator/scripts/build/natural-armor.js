/**
 * Does this character have natural armor at all?
 *
 * Its own module because two stages ask, and they are not near each other: the class-features stage
 * decides whether to lay down the "Natural AC" group divider, and weapon finishing decides whether to
 * clone the natural-armor tracker items (HP / hardness / DR) under it. A divider with nothing beneath
 * it, or trackers with no divider, is the failure this predicate exists to prevent — so it answers
 * both callers identically rather than being reimplemented at each.
 *
 * Sources checked: the Strength of a Warrior homebrew feat (Str/Con variants — any feat bucket, or
 * bundled as a feat-tax child), racial natural armor (the race item ships a change targeting 'nac'),
 * an Amulet of Natural Armor in the equipment, or any backend buff-dict change targeting 'nac'.
 */
import { extractItems } from './items.js';
import { log } from '../shared/log.js';

/**
 * Memoized PER BUILD, not per session: the answer is a property of one character, and the module
 * outlives the build. Keyed by the context so the entry dies with it — a plain module-level cache
 * would answer the next character out of the previous one's payload, which is exactly what the
 * harness's "a character built after a different one is unaffected by it" fixture watches for.
 */
const cache = new WeakMap();

export function characterHasNaturalArmor(ctx) {
  if (cache.has(ctx)) return cache.get(ctx);
  const characterData = ctx.characterData;
  const isSoaW = (n) => String(n).toLowerCase().startsWith('strength of a warrior');
  const featLists = [
    characterData.feats, characterData.class_feats, characterData.story_feats,
    characterData.flaw_feats, characterData.flavor_feats, characterData.teamwork_feats,
    characterData.bloodline_feats, characterData.trainer_feats, characterData.profession_feats,
    characterData.sphere_feats, characterData.mt_feats,
  ];
  let has = featLists.some((l) => Array.isArray(l) && l.some(isSoaW));
  if (!has) {
    const taxDicts = [
      characterData.story_feat_tax_dict, characterData.flaw_feat_tax_dict,
      characterData.flavor_feat_tax_dict, characterData.class_feat_tax_dict,
      characterData.feats_feat_tax_dict, characterData.trainer_feat_tax_dict,
    ];
    has = taxDicts.some((d) => d && typeof d === 'object' &&
      Object.values(d).some((children) => Array.isArray(children) && children.some(isSoaW)));
  }
  if (!has && Array.isArray(characterData.equipment_list)) {
    has = characterData.equipment_list.some((e) => /amulet of natural armor/i.test(String(e)));
  }
  if (!has) {
    const raceItems = extractItems(ctx.templates.everyRace) || [];
    const raceItem = raceItems.find((item) => item.name === characterData.chosen_race);
    has = !!raceItem?.system?.changes?.some((c) => c && c.target === 'nac');
  }
  if (!has) {
    const changeDicts = [
      characterData.feat_changes_dict, characterData.class_feature_changes_dict,
      characterData.item_changes_dict,
    ];
    has = changeDicts.some((d) => d && typeof d === 'object' && Object.values(d).some(
      (v) => Array.isArray(v?.changes) && v.changes.some((c) => c && c.target === 'nac')));
  }
  cache.set(ctx, has);
  log.debug(`Natural armor detected: ${has} — Natural AC section ${has ? 'kept' : 'omitted'}.`);
  return has;
}
