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
import { appendJsonToTemplate, appendFeatDivider, synthesizeFeatItem, applyBuffData } from './items.js';
import { CF_CLASS_BAND_BASE, CF_CLASS_BAND_STEP } from './classes.js';
import { characterHasNaturalArmor } from './natural-armor.js';
import { toTitleCase, stableStringify, convertToStringSimple } from '../shared/text.js';
import { log } from '../shared/log.js';

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

  log.debug("****************** starting class features ******************");
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

/**
 * The item that DELIVERS a seller's payout, and shows its working.
 *
 * This is not a report. The three budgets the sale pays into — hit points, skill ranks and
 * attribute points — deliberately no longer apply the payout on the backend; this item's `changes`
 * are what apply it, on pf1's own targets (`mhp`, `bonusSkillRanks`, and the ability keys).
 *
 * That was a fix, not a preference. The module builds actor HP from `total_rolled_hp` — the raw
 * dice — and never from `Total_HP`, so every hit point the backend added for a luck sale was
 * invisible on the sheet the character is played from. Two sellers paid 18 and 8 HP both shipped
 * the same `hp.base`. A change lands where an added-up total did not.
 *
 * The table below is the audit that made that discoverable: each pool's budget before, what a BUYER
 * spent from it, and what the sale is owed. `final` is the budget the sheet uses, which no longer
 * includes the payout precisely because the payout now arrives as a change instead.
 *
 * Sorted far below every class-feature band so it lands at the bottom of Class Features.
 */
async function addLuckAudit(ctx) {
  try {
    const luck = ctx.characterData.luck;
    const audit = luck?.audit;
    if (!audit || !Object.keys(audit).length) return;
    // Sellers only. record_audit runs for every character, so without this the ~75% with no luck
    // stake would each carry an all-zero table named "Negative Luck Payout". A buyer's spending is
    // already spelled out on the Personal Luck item's derivation ("Bought +8 (30 skill ranks…)").
    if (luck?.stake?.direction !== 'sell') return;

    // Both spellings on purpose: the audit rows are keyed by POOL (`skill_ranks`, the budget that
    // moved) and the stake's payout is keyed by what the Doc SELLS (`skill_points`). Mapping only
    // one left the "Promised" line printing a raw key.
    const LABELS = {
      hp: 'Hit points',
      skill_ranks: 'Skill ranks',
      skill_points: 'Skill ranks',
      attribute_points: 'Attribute points',
      feats: 'Feats',
    };
    const num = (n) => (Number(n) || 0);
    const signed = (n) => (num(n) > 0 ? `+${num(n)}` : String(num(n)));
    // WHERE each pool's payout actually arrives, so the table is not just numbers with no mechanism.
    const DELIVERY = {
      hp: 'Max HP change',
      skill_ranks: 'Bonus Skill Ranks change',
      attribute_points: 'ability score change',
      feats: 'Negative Luck feats',
    };
    // Ordered so the table reads the same on every character, rather than following object order.
    const ORDER = ['hp', 'skill_ranks', 'attribute_points', 'feats'];
    const entries = ORDER.filter((k) => audit[k]).map((k) => [k, audit[k]]);
    let running = 0;
    const rows = entries.map(([key, r]) => {
      const balances = num(r.before) - num(r.spent) === num(r.after);
      running += num(r.luck_cost);
      return `<tr>
        <td>${LABELS[key] || key}</td>
        <td style="text-align:right">${num(r.before)}</td>
        <td style="text-align:right"><strong>${num(r.received) ? signed(r.received) : '—'}</strong></td>
        <td style="text-align:right">${num(r.luck_cost) ? `−${num(r.luck_cost)}` : '—'}</td>
        <td style="text-align:right">${running ? `−${running}` : '—'}</td>
        <td style="text-align:right">${num(r.final)}</td>
        <td style="font-size:0.9em">${num(r.received) ? DELIVERY[key] || '' : '—'}</td>
        <td style="text-align:center">${balances ? '✓' : '✗'}</td>
      </tr>`;
    }).join('');

    // The table has to CLOSE, or the columns are four unrelated numbers. Compared against what was
    // SOLD rather than the final score: a Luck Trait (Increase Luck) can move the score afterwards,
    // so the two legitimately differ by a point or two and only the sale is what these rows bought.
    const sold = Math.abs(num(luck?.stake?.target));
    const totalRow = `<tr style="border-top:1px solid currentColor">
      <td><strong>Total</strong></td><td></td><td></td>
      <td style="text-align:right"><strong>−${running}</strong></td>
      <td style="text-align:right"><strong>−${running}</strong></td>
      <td colspan="3" style="font-size:0.9em">${running === sold
        ? `matches the ${sold} luck sold ✓`
        : `<strong>does not match the ${sold} luck sold ✗</strong>`}</td>
    </tr>`;

    const bumps = luck?.attribute_bumps || {};
    const bumpText = Object.entries(bumps).map(([a, n]) => `+${n} ${a.toUpperCase()}`).join(', ');
    const changeText = (luck?.payout_changes || [])
      .map((c) => `${signed(c.formula)} ${c.target}`).join(', ');

    const html = `
      <p><strong>Luck score ${num(luck.score)}.</strong> This item <em>delivers</em> the payout —
      the bonuses below are on its Changes tab, not baked into the numbers the backend sent.</p>
      ${changeText ? `<p><em>Applied as changes:</em> ${changeText}${bumpText ? ` (${bumpText})` : ''}</p>` : ''}
      <table style="width:100%; border-collapse:collapse">
        <thead><tr>
          <th style="text-align:left">Pool</th><th>Budget</th><th>Sale paid</th>
          <th>Luck cost</th><th>Total spent</th><th>Sheet budget</th>
          <th style="text-align:left">Arrives as</th><th>=</th>
        </tr></thead>
        <tbody>${rows}${totalRow}</tbody>
      </table>
      <p style="font-size:0.9em"><em>Luck cost</em> is what that row was paid for at the Doc's rates
      (2 HP or 2 skill points per −1 luck; 5 luck for an attribute point or a feat), and
      <em>Total spent</em> is the running sum — so the table closes against the luck actually sold
      instead of being four unrelated numbers. The payout is deliberately NOT in "Sheet budget":
      it arrives through the Changes tab, so it stays visible and attributable rather than folded
      silently into a total. ("Sheet budget" still includes ordinary later additions — favored-class
      HP, background skill points.)</p>`;

    const item = synthesizeFeatItem('Negative Luck Payout', html);
    item.system.subType = 'classFeat';
    item._id = ctx.newId('luckAudit', 'audit');
    item.sort = 9000000;   // far below every class-feature band, so it lands last
    // THE CHANGES ARE THE POINT. applyBuffData mints ids and dedupes by target, the same path the
    // feat overlay and the E-Kat traits use.
    applyBuffData(ctx, item, { changes: luck?.payout_changes || [] });
    appendJsonToTemplate([item], ctx.exportTemplate, 'Feature');
    log.debug(`Negative Luck Payout: ${(luck?.payout_changes || []).length} change(s) attached.`);
  } catch (error) {
    console.error('Error adding the luck audit row:', error);
  }
}

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
    // E-Kats sit directly beneath Hero Points, matching the hand-built reference sheet. Only for a
    // character actually in the E-Kat economy -- the backend sends  when the house-rule
    // flag is off, and an empty pool on every NPC in the game is clutter.
    const luck = characterData.luck;
    const inEKatEconomy = !!luck && (luck.stake || (luck.feats || []).length
      || luck.e_kat_reserve || (luck.traits || []).length);
    if (inEKatEconomy) {
      wanted.push('eKats');
      // Luck doubles as a daily DR pool ("Gary has 20 luck ... uses 11 points ... refreshes
      // daily"), so it is a charge pool rather than a readout. A NEGATIVE score still gets the
      // item: it used to be gated on score > 0 on the reasoning that a negative-luck character has
      // no pool to spend, which is true but threw away the only place the sheet shows the score at
      // all -- and its derivation, the audit trail explaining where the number came from. A seller
      // generated correctly and then displayed as though nothing had happened. See the negative
      // branch below for how it renders.
      wanted.push('personalLuck');
      // Ass Pull grants 4 temporary E-Kats per session; It Just Works a temporary Hero Point.
      const featNames = new Set((luck.feats || []).map(n => String(n).toLowerCase()));
      if (featNames.has('ass pull')) wanted.push('eKatsTemporary');
      if (featNames.has('it just works')) wanted.push('heroPointsTemporary');
    }
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
      // Current charges = what the character actually carries into play; the cap is its own store
      // cap, which Enhanced Luck Storage raises by 100 a stack, so it is read rather than assumed.
      if (key === 'personalLuck' && clone.system?.uses) {
        const score = Number(luck?.score) || 0;
        clone.system.uses.value = score;
        clone.system.uses.maxFormula = String(score);
        // EXPLICIT TAG, and it is load-bearing. The negative Luck Traits carry live change formulas
        // reading @resources.personalLuck.value, and pf1 derives a resource's key from the item's
        // TAG -- falling back to its NAME when the tag is blank, which every pool item ships. The
        // "(Negative)" prefix below would therefore move the path and silently zero every trait
        // bonus. Pinning the tag makes the path independent of what the item is called.
        clone.system.tag = 'personalLuck';
        // A negative score is carried as negative charges (-6 / -6) so the number on the sheet IS
        // the character's luck, and the name says so up front -- matching this module's own
        // "(E-Kat Trait) X" / "(-5 Luck) Y" prefix convention. pf1 stores this: uses.max is rolled
        // from maxFormula, and its only clamp lives in recharge(), behind a `uses.max > 0` branch
        // that a negative max never enters -- so a daily refresh cannot quietly reset it to 0.
        // The prefix is deliberately belt-and-braces: if a future pf1 paints the charge bar oddly
        // for negatives, the name still carries the meaning.
        if (score < 0) clone.name = `(Negative) ${clone.name}`;
        // Show the working, the way the hand-built sheets do -- the score is auditable on the sheet
        // instead of being a bare number nobody can check.
        const lines = luck?.derivation || [];
        clone.system.description.value = lines.length
          ? lines.map(l => `<p>${l}</p>`).join('')
          : (score < 0
            ? '<p>Negative luck. Applies to percentile rolls made about you; there is no DR pool to spend.</p>'
            : '<p>Luck score, spendable as a daily DR pool. Refreshes daily.</p>');
      }
      if (key === 'eKats' && clone.system?.uses) {
        clone.system.uses.value = Number(luck?.e_kat_reserve) || 0;
        clone.system.uses.maxFormula = String(Number(luck?.e_kat_store_cap) || 99);
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
    log.debug(`Resource pools: added ${clones.length} pool(s) [${[...new Set(wanted)].join(', ')}], removed ${removed} duplicate class feature(s).`);
  } catch (error) {
    console.error('Error adding resource pools:', error);
  }
  // TEMPORARY. Called from here rather than as its own build step so the whole diagnostic is one
  // function plus this line, in one file, and deleting it later is trivial. Outside the try above
  // so a resource-pool failure does not also swallow the audit.
  await addLuckAudit(ctx);
}
