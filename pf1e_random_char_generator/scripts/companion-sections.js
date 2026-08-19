/**
 * Parity furniture for a bonded creature's sheet (spec §8 D14/D15/D16).
 *
 * A companion used to arrive as a stat block and a bare list of feat names, with its species
 * abilities dumped into the Actor description as prose. A PC gets dividers, labelled feats, tracker
 * groups, a Flaws section and the standard buffs; this file gives a companion the same, built from
 * the atoms the backend now emits (`feat_labels`, `feat_tax_dict`, `flaw_feats`, `flaws`,
 * `flaw_effects`, `stats.special*`).
 *
 * An eidolon gets one band nothing else does -- `evolutionItems()`, spec section 8 "Eidolon
 * (v1.1)". Its content is a LIST OF CHOICES WITH RULES TEXT rather than a stat block, most of which
 * the numbers deliberately do not express, which is why it needed its own function and its own
 * divider rather than a branch inside `classFeatureItems()`.
 *
 * TWO RULES, AND THEY ARE OPPOSITES ON PURPOSE (D14):
 *
 *   Feats and flaws ALWAYS apply, so `companion_stats.py` already folded their numbers into `stats`.
 *   Their items therefore ship with `system.changes` STRIPPED -- pf1 must not apply what the payload
 *   already counted. `contextNotes` survive, because they are situational text nobody totalled.
 *   `ac`-targeted changes survive too, and only those: see the note in `featItems`. AC is the one
 *   folded stat pf1 gives no seed for, so stripping it dropped the number on the floor instead of
 *   moving it somewhere else.
 *
 *   Buffs are situational, so they are NOT folded. Their items keep their changes and ship INACTIVE,
 *   which is what makes them safe: an inactive buff contributes nothing until a player toggles it,
 *   and at that moment the player wants the number.
 *
 * `buildSectionItems()` is a PURE function of (entry, assets) -- no `game`, no Actor, no fetch -- so
 * `tools/test_create_companions.mjs` can exercise every branch headlessly. Anything needing the
 * compendium is passed in as a resolver.
 *
 * The sort constants below are COPIED FROM `modify-abilities.js`'s CF_SORTS on purpose: the two
 * sheets are meant to read identically, and the group dividers are the reason a reader can tell one
 * band from another. If they drift there, drift them here.
 */

// Class Features tab, matching the PC's fixed group dividers exactly.
export const CF_SORTS = {
  variableModifiers: 115625,
  naturalAc: 121875,
  classFeatures: 200000,   // the companion's single band, between Natural AC and Death HP
  evolutions: 250000,      // eidolons only, immediately below their class-feature band
  deathHp: 396875,
};
// The PC pins the size-for-damage tracker just under the Variable Modifiers divider; same slot here,
// and it matters more for an animal, whose damage IS its natural attacks.
export const SIZE_FOR_DAMAGE_SORT = 121680;

// Feats tab. The chassis feats read like class bonus feats (`Animal Companion 5: Weapon Focus`), so
// they sit where a PC's do; flaw-bought feats sit in the Background band above them.
export const FEAT_SORTS = { background: 1, flawFeats: 250, chassisFeats: 3000 };
// Traits tab.
export const TRAIT_SORTS = { flaws: 50000 };

// D10: the backend emits atoms and no label, so each renderer composes its own. The same map
// `createCompanions.js::TYPE_LABEL` uses, title-cased for a divider.
const CREATURE_LABELS = {
  companion: 'Animal Companion',
  mount: 'Mount',
  familiar: 'Familiar',
  eidolon: 'Eidolon',
};

export const DIVIDERS = {
  variableModifiers: '__________________Variable Modifiers______________',
  naturalAc: '__________________Natural AC_________________',
  deathHp: '_________________Death HP____________________',
  // A function, because the band names the creature type: an eidolon's darkvision and share spells
  // come off the EIDOLON table, and reading "(Animal Companion)" over them is simply wrong. Unknown
  // types fall back to the companion label, which is what every sheet said before this was typed.
  classFeatures: (type) => `_______________Class Features (${CREATURE_LABELS[type] ?? CREATURE_LABELS.companion})_______________`,
  evolutions: '_______________Evolutions_______________',
  background: '_________________ Background _________________',
  flaws: '____________________ Flaws______________________',
};

/** pf1 feat item skeleton -- the shape `modify-abilities.js::synthesizeFeatItem` builds. */
export function synthesizeFeatItem(name, descriptionHtml, subType = 'feat', img = 'icons/svg/book.svg') {
  return {
    name, type: 'feat', img,
    system: {
      description: { value: descriptionHtml || '' },
      tags: [], actions: [], attackNotes: [], effectNotes: [],
      uses: { value: null, per: '', autoDeductChargesCost: '', maxFormula: '', rechargeFormula: '' },
      changes: [], contextNotes: [], links: { children: [], charges: [] },
      tag: '', scriptCalls: [], subType, abilityType: 'na',
      associations: { classes: [] }, showInQuickbar: false, disabled: false,
    },
    effects: [], flags: {},
  };
}

function divider(title, sort, subType = 'classFeat') {
  const item = synthesizeFeatItem(title, '', subType);
  item.sort = sort;
  return item;
}

/** `system.contextNotes` in the pf1 shape, from the backend's `{text, target}` records. */
function contextNotes(records) {
  return (records ?? [])
    .filter((note) => note && note.text)
    .map((note) => ({ text: String(note.text), target: String(note.target ?? 'effect') }));
}

/**
 * The creature's feats, named the way a PC's class bonus feats are named.
 *
 * `feat_labels` is parallel to `feats` and carries the grant level the chassis table dates each slot
 * at, so this reads `Animal Companion 5: Weapon Focus` beside a PC's `Fighter 1: Weapon Focus`. Tax
 * children append ` > Child`, the same bundling `applyFeatTax` does on the PC side -- a taxed feat
 * is one entry, not two, because it cost one slot.
 */
export function featItems(entry, resolveFeat) {
  const out = [];
  const labels = entry.feat_labels ?? [];
  const tax = entry.feat_tax_dict ?? {};

  const build = (name, displayName, sort) => {
    const source = resolveFeat?.(name);
    const item = source
      ? { ...source, name: displayName, system: { ...(source.system ?? {}) } }
      : synthesizeFeatItem(displayName, '');
    delete item._id;
    item.system = item.system ?? {};
    // D14: the payload already counted this feat. Leaving the compendium's automation on would make
    // the Foundry sheet disagree with the web sheet, which has no way to derive anything.
    //
    // ONE EXCEPTION, and it is the whole reason a companion's AC used to render a point low:
    // stripping works because every folded number has a SEED on the actor for `reconcile()` to write
    // the difference into -- `hp.base`, `savingThrows.*.base`, `bab.value`. AC has none. pf1 derives
    // `attributes.ac` entirely from changes and offers nothing to seed, which is exactly why
    // `reconcile()` says AC is "deliberately NOT corrected" and only warns. So a feat's AC
    // contribution had nowhere to live and simply vanished.
    //
    // Keeping the compendium's own `ac` changes puts it back WITH ITS BONUS TYPE intact, which
    // matters: the reef snake's Dodge is `+1 dodge`, and the payload proves the type -- its ac 18 and
    // touch 14 both include the point while flat-footed 14 does not, which is dodge behaviour and
    // nothing else's. Nothing double-counts, because nothing seeds AC.
    //
    // `nac` is deliberately NOT kept. Natural armour DOES have a seed -- `attributes.naturalAC`, set
    // from `stats.natural_armor`, which is the post-fold figure -- so keeping Improved Natural
    // Armor's change would count it twice. `ac` is the only target with no home.
    item.system.changes = (item.system.changes ?? []).filter((change) => change?.target === 'ac');
    item.system.subType = 'feat';
    item.sort = sort;
    return item;
  };

  const withTax = (name) => {
    const children = tax[name] ?? [];
    return children.length ? `${name} > ${children.join(' > ')}` : name;
  };

  (entry.feats ?? []).forEach((name, index) => {
    const label = labels[index];
    const display = label ? `${label}: ${withTax(name)}` : withTax(name);
    out.push(build(name, display, FEAT_SORTS.chassisFeats + index * 10));
  });

  // Flaw-bought feats land in the Background band, numbered like a PC's `(Flaw 1) Toughness`.
  (entry.flaw_feats ?? []).forEach((name, index) => {
    out.push(build(name, `(Flaw ${index + 1}) ${withTax(name)}`, FEAT_SORTS.flawFeats + index * 10));
  });

  return out;
}

/**
 * The Traits-tab Flaws block: one trait item per rolled flaw, tier in the name.
 *
 * Changes are stripped for the same reason feats' are (the fold owns them); contextNotes are kept,
 * because a "Will save DC 5 or bolt" is a reminder the sheet should carry and no number counted it.
 */
export function flawItems(entry) {
  const effects = entry.flaw_effects ?? {};
  const names = Object.keys(effects);
  if (!names.length) return [];

  const out = [divider(DIVIDERS.flaws, TRAIT_SORTS.flaws, 'trait')];
  names.forEach((name, index) => {
    const effect = effects[name] ?? {};
    const tier = String(effect.tier ?? 'minor') === 'major' ? 'Major' : 'Minor';
    const item = synthesizeFeatItem(`(Flaw, ${tier}) ${name}`,
      effect.description ? `<p>${effect.description}</p>` : '', 'trait');
    item.system.contextNotes = contextNotes(effect.contextNotes);
    item.sort = TRAIT_SORTS.flaws + 100 + index * 10;
    out.push(item);
  });
  return out;
}

/**
 * The `Class Features (<creature type>)` band.
 *
 * These used to be prose in the Actor description -- the chassis row's `special` (link, share
 * spells, evasion, devotion, multiattack), the species' `special_qualities` / `special_attacks`, and
 * the one-off keys `stats.other` collects. A sheet cannot be read that way, and pf1 has a section
 * built for exactly this, so they become real items under their own divider.
 *
 * An eidolon reaches here too: its `stats.special` is the EIDOLON table's own column, accumulated
 * and de-duped by `companion_stats.py::_eidolon_specials`. What it does NOT carry is a single one of
 * its evolutions -- those are `evolutionItems()`, the band below.
 */
export function classFeatureItems(entry) {
  const stats = entry?.stats ?? {};
  const type = entry?.type ?? 'companion';
  const label = CREATURE_LABELS[type] ?? CREATURE_LABELS.companion;
  const rows = [];
  const push = (name, description) => {
    const text = String(name ?? '').trim();
    if (text) rows.push([text, description]);
  };
  const split = (value) => String(value ?? '').split(',').map((part) => part.trim()).filter(Boolean);

  split(stats?.special).forEach((name) => push(name, `${label} class feature.`));
  split(stats?.special_qualities).forEach((name) => push(name, 'Special quality of the species.'));
  split(stats?.special_attacks).forEach((name) => push(name, 'Special attack of the species.'));
  // `stats.other` is the merge's leftovers -- `climb`, `fly`, `bonus feat`, `cmd trip`, `sudden
  // charge (ex)`. It is the key that makes the advancement merge lossless, so it must reach the
  // sheet rather than stay a payload curiosity.
  Object.entries(stats?.other ?? {}).forEach(([key, value]) => push(key, String(value ?? '')));

  if (!rows.length) return [];
  const out = [divider(DIVIDERS.classFeatures(type), CF_SORTS.classFeatures)];
  rows.forEach(([name, description], index) => {
    const item = synthesizeFeatItem(titleCase(name), description ? `<p>${description}</p>` : '',
                                    'classFeat');
    item.sort = CF_SORTS.classFeatures + 100 + index * 10;
    out.push(item);
  });
  return out;
}

function titleCase(text) {
  return String(text).replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * The `Evolutions` band -- an eidolon's, and nothing else's.
 *
 * The backend BUILDS an eidolon rather than picking one (spec section 8 "Eidolon (v1.1)"): a base
 * form, its free evolutions, then an evolution-point budget spent until nothing legal is affordable.
 * None of that reached a sheet before this band existed -- `classFeatureItems()` reads the eidolon
 * TABLE's specials and stops, so a creature that had spent 15 of 16 points showed none of them.
 *
 * TWO THINGS THIS FUNCTION MUST GET RIGHT:
 *
 *   1. IDENTICAL NAMES COLLAPSE. `createCompanions.js::attachSections` dedupes creations by
 *      normalised name -- the `every_feat.json` double-apply guard in miniature. An eidolon may buy
 *      the same evolution more than once (Limbs twice, Ability Increase four times), so repeats are
 *      GROUPED into one item with a count rather than pushed as separate items that would silently
 *      collapse to one and lose the count with them. The `(N EP)` suffix also keeps an evolution
 *      from colliding with a same-named class feature in the band above.
 *
 *   2. FOLDED AND NOT-FOLDED READ DIFFERENTLY. Only 8 of the 81 evolutions can be expressed as
 *      numbers; `companion_stats.py::_eidolon_unapplied` names the other 73 on `stats.unapplied` as
 *      `"<Name> (<choice>): <holdback>"`, which is exactly the string this rebuilds from the pick.
 *      An item on that list says so on its face. Rendering it as though the block had counted it
 *      would be worse than not rendering it at all (D12).
 */
export function evolutionItems(entry) {
  if (entry?.type !== 'eidolon') return [];
  const out = [divider(DIVIDERS.evolutions, CF_SORTS.evolutions)];
  const push = (name, html, index) => {
    const item = synthesizeFeatItem(name, html, 'classFeat');
    item.sort = CF_SORTS.evolutions + 100 + index * 10;
    out.push(item);
  };

  // The unchained summoner degrades on purpose: its subtype-granted evolutions, alignment locks and
  // separate EP table are unsourced (ticket 07 ruling 1). The band still ships, carrying the debt in
  // words, because an unmodelled feature that is merely absent looks exactly like a bug.
  if ((entry.flags ?? []).includes('unchained_degraded')) {
    push('Evolutions — not modelled', `<p>${entry.holdback ?? 'Not modelled in this version.'}</p>`, 0);
    return out;
  }

  const stats = entry.stats ?? {};
  let index = 0;

  const ep = entry.ep ?? {};
  if (ep.pool != null) {
    const diverted = Number(ep.diverted) || 0;
    const aspect = diverted ? `, ${diverted} diverted to the summoner's Aspect` : '';
    push(`Evolution Pool — ${ep.pool} EP`,
         `<p>${ep.spent ?? 0} EP spent on the evolutions below${aspect}. The pool is the eidolon `
         + `table's at effective level ${entry.effective_level ?? '?'}.</p>`, index++);
  }

  // The base form's freebies, which cost nothing and are therefore absent from `evolutions`. They
  // are still on the creature -- `_eidolon_evolution_data` folds them into the stat block alongside
  // the bought ones -- so a sheet that omitted them would understate it.
  const free = Object.entries(entry.free_evolutions ?? {})
    .flatMap(([key, choices]) => (choices ?? [null]).map(
      (choice) => (choice ? `${titleCase(key)} (${titleCase(choice)})` : titleCase(key))));
  if (free.length) {
    push(`Free Evolutions — ${titleCase(entry.base_form ?? 'base')} base form`,
         `<p>Granted by the base form at no cost: ${free.join(', ')}.</p>`, index++);
  }

  // `unapplied` is keyed by the same `<Name> (<choice>)` string the pick rebuilds, so the lookup is
  // exact rather than a substring guess.
  const heldBack = new Map();
  for (const line of stats.unapplied ?? []) {
    const split = String(line).indexOf(': ');
    if (split > 0) heldBack.set(String(line).slice(0, split), String(line).slice(split + 2));
  }
  const folded = new Map();
  for (const change of stats.applied_changes ?? []) {
    const source = String(change?.source ?? '');
    if (!source) continue;
    const value = Number(change.value) >= 0 ? `+${change.value}` : String(change.value);
    folded.set(source, [...(folded.get(source) ?? []), `${value} ${change.target}`]);
  }

  const groups = new Map();
  for (const pick of entry.evolutions ?? []) {
    const shown = pick.choice ? `${pick.name} (${titleCase(pick.choice)})` : String(pick.name);
    const existing = groups.get(shown);
    if (existing) existing.count += 1;
    else groups.set(shown, { pick, shown, count: 1 });
  }

  for (const { pick, shown, count } of groups.values()) {
    // `unapplied` lower-cases nothing but the choice comes off the pick verbatim, so match on the
    // raw pick first and fall back to the title-cased display string.
    const rawShown = pick.choice ? `${pick.name} (${pick.choice})` : String(pick.name);
    const holdback = heldBack.get(rawShown) ?? heldBack.get(shown);
    const numbers = folded.get(pick.name);
    // `rules text only` is `_eidolon_unapplied`'s DEFAULT -- it means "the curation wrote no
    // holdback sentence", not a sentence worth printing after one that already says it.
    const detail = holdback && holdback !== 'rules text only' ? ` ${holdback}` : '';
    const provenance = holdback
      ? `<p><strong>Not folded into this stat block — apply at the table.</strong>${detail}</p>`
      : `<p><strong>Folded into this stat block.</strong> ${numbers ? numbers.join(', ') : 'Counted in the numbers above.'}</p>`;
    const repeat = count > 1 ? ` ×${count}` : '';
    push(`${shown} (${pick.cost} EP)${repeat}`, `<p>${pick.benefit ?? ''}</p>${provenance}`, index++);
  }

  return out;
}

/**
 * The house tracker groups, exactly as a PC gets them.
 *
 * Natural AC is UNCONDITIONAL here, unlike on the PC where `characterHasNaturalArmor()` gates it:
 * every bonded creature has natural armour, by the chassis table if not by its species, so the test
 * would pass every time and would only be a way to get it wrong.
 *
 * Resource Pools is deliberately absent -- an animal has no Hero Points.
 */
export function trackerItems(assets) {
  const out = [
    divider(DIVIDERS.variableModifiers, CF_SORTS.variableModifiers),
    divider(DIVIDERS.naturalAc, CF_SORTS.naturalAc),
    divider(DIVIDERS.deathHp, CF_SORTS.deathHp),
  ];
  for (const feature of assets?.houseFeatures ?? []) {
    const clone = structuredClone(feature);
    delete clone._id;
    out.push(clone);
  }
  if (assets?.sizeForDamage) {
    const clone = structuredClone(assets.sizeForDamage);
    delete clone._id;
    clone.sort = SIZE_FOR_DAMAGE_SORT;
    out.push(clone);
  }
  return out;
}

// The PC's set that starts toggled ON. `Professions` and `Skill Synergies` describe a PC's
// professions and are empty on a companion, but they ship anyway (D16: all eleven, unfiltered) --
// an empty tracker is the player's to delete, and a filtered list is one more thing to keep in sync.
const ACTIVE_BUFFS = new Set(['Professions', 'Skill Synergies', 'Acrobatics Speed']);

/**
 * All eleven basic buffs, verbatim, INACTIVE except the PC's own active set.
 *
 * They keep their `changes` -- see the header. Nothing here is folded into `stats`, so nothing here
 * can double-count while it is switched off, and a player who switches one on is asking for it.
 * `Combat Expertise` is unusable at Int 1-2 and ships anyway; it arrives inactive, so it is a toggle
 * the player simply leaves alone rather than a number on the sheet.
 */
export function buffItems(assets) {
  return (assets?.customBuffs ?? []).map((buff) => {
    const clone = structuredClone(buff);
    delete clone._id;
    clone.system = clone.system ?? {};
    clone.system.active = ACTIVE_BUFFS.has(clone.name);
    return clone;
  });
}

/**
 * Every item a bonded creature's sheet gains beyond its stat block.
 *
 * `resolveFeat(name)` returns a compendium feat's data object or null; `assets` carries the three
 * template files (`houseFeatures`, `sizeForDamage`, `customBuffs`). Both are injected so this stays
 * a pure function -- see the header.
 */
export function buildSectionItems(entry, assets = {}, resolveFeat = null) {
  return [
    ...trackerItems(assets),
    ...classFeatureItems(entry),
    ...evolutionItems(entry),
    divider(DIVIDERS.background, FEAT_SORTS.background, 'feat'),
    ...featItems(entry, resolveFeat),
    ...flawItems(entry),
    ...buffItems(assets),
  ];
}
