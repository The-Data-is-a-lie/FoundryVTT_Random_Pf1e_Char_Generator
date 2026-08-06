/**
 * Class features — the Class Features tab: group dividers, the backend's per-class selections, and
 * the resource pools that sit at the top of it.
 *
 * Two exported stages, kept separate because the orchestrator's call order between them is the sheet
 * layout: `addClassFeatures` lays the dividers and the chosen features into the per-class bands, then
 * `addResourcePools` prepends the pool group AND deletes the harvested duplicates of any ability that
 * became a pool. Run the pools first and there is nothing yet to deduplicate against.
 *
 * **Reads `ctx.classFeatureBands` and mutates it.** The band records carry live sort counters
 * (`generalSort`, `ladderSort`) that this stage advances as it appends, so items land in the order
 * they were assigned. That mutation-while-iterating is deliberate and load-bearing (hazard 4 on the
 * strangler-split map): the bands are not read-only, and the classes stage hands them over unfrozen
 * on purpose.
 *
 * `CLASS_FEATURE_BUCKETS`'s keys are half of a contract with the backend, not a display detail — the
 * backend's `test_house_invariants.py` guards twelve psionic classes against the "generated but
 * invisible" failure by name. Renaming a key here is a behaviour change.
 *
 * What stayed with the caller: nothing. What moved out sideways: `characterHasNaturalArmor`, which
 * weapon finishing also asks (see build/natural-armor.js).
 */
import { appendJsonToTemplate, appendFeatDivider } from './items.js';
import { CF_CLASS_BAND_BASE, CF_CLASS_BAND_STEP } from './classes.js';
import { characterHasNaturalArmor } from './natural-armor.js';
import { toTitleCase, stableStringify, convertToStringSimple } from '../shared/text.js';

// Display metadata for the backend's class-feature selection buckets (class_features payload,
// {bucket: {choice: data}}). `ladder: true` = a multi-pick talent ladder that gets its OWN
// divider ("_____ Rage Powers _____") with items labeled "(Rage Power <level>) <name>" from
// class_feature_levels; everything else lands under the "_____ Class Features _____" divider
// with the same label scheme. Unknown buckets fall back to Title Case / trimmed-s / non-ladder.
const CLASS_FEATURE_BUCKETS = {
  rage_powers:          { title: 'Rage Powers',          singular: 'Rage Power',          ladder: true },
  rogue_talents:        { title: 'Rogue Talents',        singular: 'Rogue Talent',        ladder: true },
  ninja_talents:        { title: 'Ninja Talents',        singular: 'Ninja Talent',        ladder: true },
  slayer_talents:       { title: 'Slayer Talents',       singular: 'Slayer Talent',       ladder: true },
  investigator_talents: { title: 'Investigator Talents', singular: 'Investigator Talent', ladder: true },
  vigilante_talents:    { title: 'Vigilante Talents',    singular: 'Vigilante Talent',    ladder: true },
  social_talents:       { title: 'Social Talents',       singular: 'Social Talent',       ladder: true },
  discoveries:          { title: 'Discoveries',          singular: 'Discovery',           ladder: true },
  hexes:                { title: 'Hexes',                singular: 'Hex',                 ladder: true },
  arcana:               { title: 'Magus Arcana',         singular: 'Arcana',              ladder: true },
  exploits:             { title: 'Arcanist Exploits',    singular: 'Exploit',             ladder: true },
  armor_training:       { title: 'Armor Training',       singular: 'Armor Training',      ladder: true },
  weapon_training:      { title: 'Weapon Training',      singular: 'Weapon Training',     ladder: true },
  mercy:                { title: 'Mercies',              singular: 'Mercy',               ladder: true },
  cruelty:              { title: 'Cruelties',            singular: 'Cruelty',             ladder: true },
  ki_powers:            { title: 'Ki Powers',            singular: 'Ki Power',            ladder: true },
  mysteries:            { title: 'Mystery & Revelations', singular: 'Revelation',         ladder: true },
  curses:               { title: 'Oracle Curse',         singular: 'Curse',               ladder: false },
  spirits:              { title: 'Shaman Spirit',        singular: 'Spirit',              ladder: false },
  // Psionics (backend utils/class_func/psionics.py -> SUBSYSTEM_BUCKET). The fallback below would
  // already render these, but not well: it lands them in the generic band with no divider of their
  // own, and its trailing-s trim turns 'strategies' into "Strategie". The aegis and the soulknife
  // are the classes that need this most -- their subsystem is ALL the psionics they have.
  customizations:       { title: 'Astral Suit Customizations', singular: 'Customization',  ladder: true },
  insights:             { title: 'Cryptic Insights',     singular: 'Insight',             ladder: true },
  terrors:              { title: 'Terrors',              singular: 'Terror',              ladder: true },
  decrees:              { title: 'Decrees',              singular: 'Decree',              ladder: true },
  strategies:           { title: 'Strategies',           singular: 'Strategy',            ladder: true },
  blade_skills:         { title: 'Blade Skills',         singular: 'Blade Skill',         ladder: true },
  warrior_path:         { title: 'Warrior Path',         singular: 'Warrior Path',        ladder: false },
  vitalist_method:      { title: 'Vitalist Method',      singular: 'Method',              ladder: false },
  combat_style:         { title: 'Combat Style',         singular: 'Combat Style',        ladder: false },
  // Occult Adventures (backend main_test.py, the generic_class_option_chooser block right after
  // the psionics one). Registered for the same reason psionics is: the fallback renders them, but
  // in the generic band with no divider of their own. For the KINETICIST this is the entire sheet
  // -- wild talents and infusions are all it has, since burn is deliberately unmodelled backend
  // side, so an unregistered bucket would leave the class looking empty.
  implements:           { title: 'Implement Schools',    singular: 'Implement',           ladder: true },
  focus_powers:         { title: 'Focus Powers',         singular: 'Focus Power',         ladder: true },
  elemental_focus:      { title: 'Elemental Focus',      singular: 'Element',             ladder: false },
  wild_talents:         { title: 'Wild Talents',         singular: 'Wild Talent',         ladder: true },
  infusions:            { title: 'Infusions',            singular: 'Infusion',            ladder: true },
  // 'medium_spirit', not 'spirit': the shaman already owns 'spirits' above, and two buckets one
  // letter apart is a trap for anything that registers them by name.
  medium_spirit:        { title: 'Channeled Spirit',     singular: 'Spirit',              ladder: false },
  mesmerist_tricks:     { title: 'Mesmerist Tricks',     singular: 'Trick',               ladder: true },
  bold_stare:           { title: 'Bold Stare',           singular: 'Bold Stare',          ladder: true },
  psychic_discipline:   { title: 'Psychic Discipline',   singular: 'Discipline',          ladder: false },
  phrenic_amplifications: { title: 'Phrenic Amplifications', singular: 'Amplification',   ladder: true },
  emotional_focus:      { title: 'Phantom Emotional Focus', singular: 'Emotional Focus',  ladder: false },
};

// Class Features tab layout: fixed group dividers up front, then one "Class Features (Class)"
// band per rolled class (classFeatureBands, built by the classes stage — level-desc order,
// harvested features already rebased into each band). Ladder buckets get sub-dividers inside
// their owning class's band; buckets with no recorded owner fall back to a trailing generic
// "Class Features" band (old backends, non-class buckets like Skill Unlocks).
const CF_SORTS = {
  variableModifiers: 115625,
  naturalAc: 121875,
  deathHp: 396875,
  ladderStep: 25000,   // spacing between ladder sub-dividers inside a class band
};

export async function addClassFeatures(ctx) {
  const characterData = ctx.characterData;
  const exportTemplate = ctx.exportTemplate;
  const baseFeatTemplate = ctx.templates.baseFeat;
  const classFeatures = characterData.class_features;

  console.log("****************** starting class features ******************");
  if (!baseFeatTemplate || typeof baseFeatTemplate !== 'object' || !classFeatures || typeof classFeatures !== 'object') {
      console.error("Invalid input data.");
      return;
  }

  // Fixed group dividers (trackers/sizefordamage populate them). Natural AC only appears for
  // characters that actually have natural armor (see build/natural-armor.js).
  await appendFeatDivider(ctx, "__________________Variable Modifiers______________", CF_SORTS.variableModifiers, 'classFeat');
  if (characterHasNaturalArmor(ctx)) {
    await appendFeatDivider(ctx, "__________________Natural AC_________________", CF_SORTS.naturalAc, 'classFeat');
  }
  await appendFeatDivider(ctx, "_________________Death HP____________________", CF_SORTS.deathHp, 'classFeat');

  // One divider per rolled class, highest class level first (band order = classEntries order).
  const bandsInOrder = Object.values(ctx.classFeatureBands).sort((a, b) => a.base - b.base);
  for (const band of bandsInOrder) {
    await appendFeatDivider(ctx, `_______________Class Features (${band.display})_______________`, band.base, 'classFeat');
  }
  // Fallback band for buckets whose owning class is unknown; its divider is only added when used.
  const genericBase = CF_CLASS_BAND_BASE + bandsInOrder.length * CF_CLASS_BAND_STEP;
  const genericBand = { display: null, base: genericBase, generalSort: genericBase + 125, ladderSort: genericBase + 500000 };
  let genericDividerAdded = false;

  // bucket (lowercase) -> owning class name (lowercase), from the backend's chooser bookkeeping.
  const owners = {};
  for (const [k, v] of Object.entries(characterData.class_feature_owners || {})) {
    owners[String(k).toLowerCase()] = String(v).toLowerCase();
  }

  const levelsAll = characterData.class_feature_levels || {};

  const mkFeature = async (name, descriptionHtml, sort) => {
      const feature = JSON.parse(stableStringify(baseFeatTemplate));
      // The base feat template carries a hardcoded _id, so every clone would share it and
      // Foundry would collapse them into one embedded item on actor.update().
      feature._id = ctx.newId('classFeature', [name, sort]);
      feature.name = name;
      feature.system.description.value = descriptionHtml;
      feature.sort = sort;
      appendJsonToTemplate([feature], exportTemplate, "classFeature");
  };

  for (const [bucket, choices] of Object.entries(classFeatures)) {
      if (!choices || typeof choices !== 'object') {
          console.warn(`Skipping invalid feature bucket: ${bucket}`);
          continue;
      }
      const band = ctx.classFeatureBands[owners[String(bucket).toLowerCase()]] || genericBand;
      if (band === genericBand && !genericDividerAdded) {
        genericDividerAdded = true;
        await appendFeatDivider(ctx, "_______________Class Features_______________", genericBand.base, 'classFeat');
      }
      // Only genuine selection buckets (known key, or gain-levels recorded by the backend) get
      // exploded into per-choice items. Everything else (wizard school, Skill Unlock, ...) is a
      // single feature whose dict is its ATTRIBUTES — keep it as one item in its class's band.
      const isSelection = !!CLASS_FEATURE_BUCKETS[bucket] || !!levelsAll[bucket];
      if (!isSelection) {
          await mkFeature(toTitleCase(String(bucket)), convertToStringSimple(bucket, choices), band.generalSort);
          band.generalSort += 125;
          continue;
      }

      const meta = CLASS_FEATURE_BUCKETS[bucket] || {
        title: toTitleCase(String(bucket).replace(/_/g, ' ')),
        singular: toTitleCase(String(bucket).replace(/_/g, ' ')).replace(/s$/, ''),
        ladder: false,
      };
      const levels = levelsAll[bucket] || {};
      let sort;
      if (meta.ladder) {
        await appendFeatDivider(ctx, `_______________${meta.title}__________________`, band.ladderSort, 'classFeat');
        sort = band.ladderSort + 125;
        band.ladderSort += CF_SORTS.ladderStep;
      } else {
        sort = band.generalSort;
      }

      // One item per choice, ordered by the level it was gained at (unknown levels last).
      const names = Object.keys(choices).sort((a, b) =>
        (Number.isFinite(levels[a]) ? levels[a] : 99) - (Number.isFinite(levels[b]) ? levels[b] : 99));
      for (const choice of names) {
          const lvl = levels[choice];
          const name = Number.isFinite(lvl) ? `(${meta.singular} ${lvl}) ${choice}` : `(${meta.singular}) ${choice}`;
          const choiceData = choices[choice];
          const html = (choiceData && typeof choiceData === 'object')
            ? convertToStringSimple(choice, choiceData)
            : `<p>${choiceData ?? ''}</p>`;
          await mkFeature(name, html, sort);
          sort += 125;
      }
      if (!meta.ladder) band.generalSort = sort;
  }
}

// ----- Resource Pools group (top of Class Features, template sort -137000) ----- //
// Hero Points for EVERY character (current value = the generated hero_points count);
// Stamina only for fighters (free at level 1) or characters with the Combat Stamina feat;
// class pools (Rage, Ki Pool, Bardic Performance, ...) per CLASS_RESOURCE_POOLS. Pool items
// come from resource_pools.json with charge maxFormulas keyed to @classes.<tag>.level —
// current charges start at 0, so a Foundry rest fills them.
const CLASS_RESOURCE_POOLS = {
  'barbarian':             ['rage'],
  'barbarian (unchained)': ['rageUnchained'],
  'bloodrager':            ['bloodrage'],
  'skald':                 ['ragingSong'],
  'bard':                  ['bardicPerformance'],
  'cleric':                ['channelEnergy'],
  'paladin':               ['smiteEvil', 'layOnHands'],
  'antipaladin':           ['smiteGood', 'touchOfCorruption'],
  'alchemist':             ['bomb'],
  'monk':                  ['kiPoolMonk'],
  'monk (unchained)':      ['kiPoolUnchainedMonk'],
  'ninja':                 ['kiPoolNinja'],
  'magus':                 ['arcanePool'],
  'arcanist':              ['arcaneReservoir'],
  'gunslinger':            ['grit'],
  'swashbuckler':          ['panache'],
  'warpriest':             ['fervor'],
  'investigator':          ['inspiration'],
  'inquisitor':            ['judgment'],
};

export async function addResourcePools(ctx) {
  const characterData = ctx.characterData;
  const exportTemplate = ctx.exportTemplate;
  try {
    const pools = ctx.templates.resourcePools;
    if (!pools || typeof pools !== 'object') {
      console.warn('Resource pools: resource_pools.json missing — skipping.');
      return;
    }
    const classes = (Array.isArray(characterData.classes) && characterData.classes.length
      ? characterData.classes.map(c => c.name)
      : [characterData.c_class, characterData.c_class_2])
      .filter(Boolean).map(c => String(c).toLowerCase());
    const featLists = ['feats', 'class_feats', 'story_feats', 'flaw_feats', 'flavor_feats',
                       'teamwork_feats', 'bloodline_feats', 'trainer_feats'];
    const hasStaminaFeat = featLists.some(k => (characterData[k] || [])
      .some(n => String(n).toLowerCase().includes('combat stamina')));

    const wanted = ['heroPoints'];
    if (classes.includes('fighter') || hasStaminaFeat) wanted.push('stamina');
    for (const cls of classes) wanted.push(...(CLASS_RESOURCE_POOLS[cls] || []));

    await appendFeatDivider(ctx, "__________________Resource Pools______________", -137000, 'classFeat');
    const clones = [];
    for (const key of [...new Set(wanted)]) {
      const src = pools[key];
      if (!src) { console.warn(`Resource pools: no "${key}" entry in resource_pools.json.`); continue; }
      const clone = structuredClone(src);
      clone._id = ctx.newId('resourcePool', key);
      if (key === 'heroPoints' && clone.system?.uses) {
        clone.system.uses.value = Number(characterData.hero_points) || 1;
      }
      clones.push(clone);
    }

    // A pool ability must live ONLY here: the every_class.json harvest already ships the same
    // feature as a plain classFeat item (Rage, "Ki Pool (UC)", "Channel Energy (WAR)", ...).
    // Drop those duplicates — exact name match after stripping a trailing "(UC)"-style tag, so
    // "Greater Rage" / "Rage Powers" / "(Rage Power 4) X" all survive — and let the pool item
    // adopt the harvest copy's fuller rules text.
    const normName = s => String(s).toLowerCase().replace(/\s*\([^)]*\)\s*$/, '').trim();
    const poolByName = new Map(clones.map(c => [normName(c.name), c]));
    let removed = 0;
    exportTemplate.items = (exportTemplate.items || []).filter(i => {
      if (i.type !== 'feat' || i.system?.subType !== 'classFeat') return true;
      const pool = poolByName.get(normName(i.name));
      if (!pool) return true;
      const oldDesc = i.system?.description?.value || '';
      if (pool.system?.description && oldDesc.length > (pool.system.description.value || '').length) {
        pool.system.description.value = oldDesc;
      }
      removed++;
      return false;
    });

    appendJsonToTemplate(clones, exportTemplate, 'Feature');
    console.log(`Resource pools: added ${clones.length} pool(s) [${[...new Set(wanted)].join(', ')}], removed ${removed} duplicate class feature(s).`);
  } catch (error) {
    console.error('Error adding resource pools:', error);
  }
}
