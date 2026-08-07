import { log } from '../shared/log.js';
/**
 * Loading the module's template JSON — the paths, the modded/base swap, and the session cache.
 *
 * ~30 bundles, ~90 MB, and every one of them used to be re-fetched and re-parsed on every click:
 * `every_feat.json` alone is 26 MB, `every_item.json` 25 MB. The precedent for fixing that was
 * already in the codebase and applied to the wrong path — `createCompanions.js` memoizes its three
 * small template reads with the comment "Fetched once per import, not per creature" — while the
 * path loading two orders of magnitude more data never got the same treatment.
 *
 * ## Keys are names, not paths
 *
 * The dictionary used to be keyed by full file path, and ~45 read sites indexed it with path
 * variables that lived inside `main()`'s closure. Keeping that scheme would have meant threading
 * all ~30 path constants onto the build context permanently, just so an extracted stage could name
 * the bundle it wanted. So the loader owns path construction and hands back an object keyed by
 * stable name: `templates.everyFeat`, `templates.maneuverChanges`, and so on.
 *
 * ## The cache
 *
 * Module-scoped and keyed by branch, because `modded_char_sheet` is re-read from the dialog's
 * saved state on every click and can change between them. The second branch evicts the first
 * rather than both staying resident — holding two full bundles is ~180 MB of parsed object graph
 * for a switch almost nobody makes twice in a session.
 *
 * **Every bundle handed out here is shared, so writing to one is a cross-run bug.** That was
 * harmless while the dictionary was rebuilt per click; with the cache it corrupts the SECOND
 * character built in a session, which single-run fixtures cannot catch. The build did exactly
 * this in nine files, and the six sites responsible now clone on read — the golden harness
 * measures the damage as `mutatedTemplates` and that list is empty.
 *
 * A new entry in `mutatedTemplates` is not a cosmetic regression any more. It is a live bug.
 *
 * The directory listings are re-browsed on every call, cache hit or not. They are cheap, and they
 * are what the missing-templates fallback reads — skipping them would silently change when that
 * warning fires and when a modded run gets downgraded.
 */

import { clearPackCache } from './catalog.js';

const CHAR_SHEET_DIR = 'modules/pf1e_random_char_generator/templates/character_sheet_folder';
const BASE_DIR = 'modules/pf1e_random_char_generator/templates/base_folder';

/** Bundles in `character_sheet_folder` that are the same on both branches. */
const CHAR_SHEET_TEMPLATES = {
  unmodifiedPreExportTemplate: 'unmodified_pre_export_template.json',
  preExportTemplate: 'pre_export_template.json',
  everyArmor: 'every_armor.json',
  everyItem: 'every_item.json',
  everyRace: 'every_race.json',
  archetype: 'archetype.json',
  spaceBackground: 'space_Background.json',
  spaceFeats: 'space_Feats.json',
  spaceClassBonusFeats: 'space_ClassBonusFeats.json',
  spacePathOfWar: 'space_Path_of_War.json',
  spacePathOfWarBuffs: 'space_Path_of_War_buffs.json',
  stanceChanges: 'stance_changes.json',
  maneuverChanges: 'maneuver_changes.json',
  // Spheres of Power / Might per-roll conditionals (nested {Sphere:{Talent:{modifiers,rider}}}).
  combatTalentConditionals: 'combat_talent_conditionals.json',
  magicTalentConditionals: 'magic_talent_conditionals.json',
  // Affects-others sphere buffs (multi-buff distributor): temp buffs named "<Talent> (TAG)".
  talentAuraBuffs: 'talent_aura_buffs.json',
  // Every buff spell as a distributable temp buff "<Spell> (TAG)" (multi-buff distributor).
  spellBuffs: 'spell_buffs.json',
  // One template, used twice: addStatBuff renames and re-ids every clone, so the level-up-stats
  // buff and the inherents buff are both built from this file.
  inherents: 'inherents.json',
  customBuffs: 'custom_buffs.json',
  // size-based damage scaling: a feature that exposes @resources.sizefordamage + the script call
  // that reads it (attached to every generated attack's "Don't Touch" action reference).
  sizeForDamageFeature: 'sizefordamage_feature.json',
  scalingWeaponDamage: 'scaling_weapon_damage.json',
  // House tracker features (extracted from the hand-built template actor): Variable Modifiers /
  // Natural AC / Death HP group items, sorts baked in to match the template layout.
  houseFeatures: 'house_features.json',
  // Resource pool items ({poolKey: pf1 classFeat item with a uses/charges formula}): Hero Points
  // for everyone, Stamina for fighters / Combat Stamina takers, plus per-class pools.
  resourcePools: 'resource_pools.json',
};

/** Bundles in `base_folder` that are the same on both branches. */
const BASE_TEMPLATES = {
  baseSkill: 'base_skill.json',
};

/**
 * The bundles that swap on the modded branch: `[folder, base file, _MODS file]`.
 * The `_MODS` twins are hand-maintained and have drifted from their base counterparts; that drift
 * is deliberately out of scope here. This loader only picks a branch, it never reconciles them.
 *
 * **`everyFeat` and `everyTrait` are gone from here and that is the point.** They are compendium
 * packs now (`packs/feats`, `packs/traits`, and their `-mods` twins), read through
 * `build/catalog.js`, which asks Foundry for an index and fetches the ~50 documents a character
 * actually uses. Loading the JSON as well would parse ~31 MB per session to answer nothing, so the
 * files stay in the repo as the packs' rebuild source and the harness's fixture, and
 * `release.ps1` keeps them out of the zip.
 *
 * If a pack is missing, the catalog says so loudly and the feat stage falls through to its
 * synthesize-on-miss branch — the same path that already handles the ~45% of requested feat names
 * the bundle never resolved. Degraded, visible, and not a crash.
 */
const SWAPPED_TEMPLATES = {
  everyClass: ['charSheet', 'every_class.json', 'every_class_MODS.json'],
  everySpell: ['charSheet', 'every_spell.json', 'every_spell_MODS.json'],
  everyWeapon: ['charSheet', 'every_weapon.json', 'every_weapon_MODS.json'],
  baseFeat: ['base', 'base_feat.json', 'base_feat_MODS.json'],
};

/** branch (`"base"` | `"mods"`) -> the loaded bundles. At most one entry. */
const cache = new Map();

/**
 * Read a JSON template.
 *
 * The status is checked before parsing because Foundry answers a missing template with an HTML
 * error page, and calling `.json()` on that reports a bare "unexpected character" with no clue
 * which file broke.
 */
async function readFile(filePath) {
  const predata = await fetch(filePath);
  if (!predata.ok) throw new Error(`Template not found (${predata.status}): ${filePath}`);
  try {
    return await predata.json();
  } catch (e) {
    throw new Error(`Template is not valid JSON: ${filePath} (${e.message})`);
  }
}

/**
 * Load every template bundle for the given branch.
 *
 * @param {object} opts
 * @param {string} opts.modded  `"y"` to use the `_MODS` bundles, anything else for the base ones.
 * @returns {Promise<{templates: object, modded: string}>} the bundles by stable name, and the
 *          branch actually used — which is NOT always the branch asked for; see the fallback.
 */
export async function loadTemplates({ modded }) {
  const charSheetBase = await FilePicker.browse('data', CHAR_SHEET_DIR);
  const base = await FilePicker.browse('data', BASE_DIR);
  const dirs = { charSheet: charSheetBase.target, base: base.target };

  let branchFlag = modded;

  // Releases up to and including v2.0.1 shipped a zip with every *_MODS.json stripped out, so on
  // those installs the modded branch fetches six 404s. FilePicker.browse already gave us the
  // directory listings, so check them before committing to the modded paths and fall back rather
  // than dying on an HTML error page.
  if (branchFlag === "y") {
    const present = new Set([...(charSheetBase.files || []), ...(base.files || [])]);
    const missing = Object.values(SWAPPED_TEMPLATES)
      .map(([dir, , moddedFile]) => `${dirs[dir]}/${moddedFile}`)
      .filter(f => !present.has(f));
    if (missing.length) {
      console.warn("Missing modded templates, falling back to base templates:", missing);
      ui.notifications?.warn(
        "Character Generator: the modded-sheet templates aren't installed " +
        `(${missing.length} file(s) missing). Using the base templates instead. ` +
        "Update the module to get them."
      );
      branchFlag = "n";
    }
  }

  const branch = branchFlag === "y" ? 'mods' : 'base';
  const cached = cache.get(branch);
  if (cached) return { templates: cached, modded: branchFlag };

  const paths = {};
  for (const [name, file] of Object.entries(CHAR_SHEET_TEMPLATES)) {
    paths[name] = `${dirs.charSheet}/${file}`;
  }
  for (const [name, file] of Object.entries(BASE_TEMPLATES)) {
    paths[name] = `${dirs.base}/${file}`;
  }
  for (const [name, [dir, baseFile, moddedFile]] of Object.entries(SWAPPED_TEMPLATES)) {
    paths[name] = `${dirs[dir]}/${branch === 'mods' ? moddedFile : baseFile}`;
  }

  const templates = {};
  for (const [name, filePath] of Object.entries(paths)) {
    templates[name] = await readFile(filePath);
  }

  cache.clear();                 // the other branch, if resident, goes
  cache.set(branch, templates);

  return { templates, modded: branchFlag };
}

/**
 * Drop the cached bundles so the next generation re-reads them from disk.
 *
 * Without a cache, editing a template by hand and clicking Generate again picked the change up.
 * With one it does not, which is a real regression for whoever is authoring `spell_buffs.json` or
 * `quality_effects.json` against a live world. This is the escape hatch, reachable from the
 * console as:
 *
 *     game.modules.get('pf1e_random_char_generator').api.reloadTemplates()
 */
export function reloadTemplates() {
  cache.clear();
  // The catalog holds its own per-session state for the pack-backed families, so clearing only this
  // one would leave feats and traits answering from a cache the escape hatch claims to have dropped.
  clearPackCache();
  log.debug('Character Generator: template cache cleared — the next character re-reads from disk.');
}
