/**
 * Bonded creatures -> one Foundry Actor each (build slice #33, spec §8 D1/D2/D10).
 *
 * The backend emits `bonded_creatures`, one entry per companion / mount / familiar / eidolon, each
 * carrying a finished `stats` block. THE BACKEND OWNS EVERY NUMBER (D2) -- the standalone web sheet
 * has no game system to derive them from, so there is exactly one source and this file's job is to
 * make pf1 agree with it, not to recompute anything.
 *
 * THE THREE THINGS THAT MAKE THIS WORK, all settled by map ticket 02:
 *
 * 1. pf1 keeps what `template.json` declares and REBUILDS every `.total` on each render. So
 *    abilities, natural AC, save *bases*, speeds, size and skill ranks stick, while `hp.max`, save
 *    totals, `bab.total` and the AC totals cannot be written at all -- they arrive through class
 *    items and the change system.
 * 2. Every `pf-content` creature ships two items -- "STR/DEX Bonus" and "Natural Armor Bonus" --
 *    whose changes RE-APPLY the companion table off `floor(@class.level / 3)`. The backend already
 *    applied that table (`companion_stats.py`), so they are deleted on sight. Leaving them in is a
 *    silent double-count, the same shape as the size-package bug (D11).
 * 3. The clone's class item is driven at the MASTER'S EFFECTIVE LEVEL (`entry.effective_level`),
 *    which is what every formula pf-content writes on these bodies expects: `floor(@class.level/3)`
 *    reproduces the animal-companion Str/Dex column exactly at all twenty levels, and an eidolon
 *    body states its own HD as `round((@class.level - 1) * .75) + 1` -- a lag it can only compute
 *    because `@class.level` is the summoner's. Driving the item at the HD COUNT instead (which this
 *    file did until 2026-08-19) put a level-10 druid's companion on the sheet as "Animal Companion
 *    9" and a level-10 summoner's eidolon as "Eidolon 8".
 *    The cost is that pf1 core derives HD, and therefore BAB, saves and HP, straight from the class
 *    level with no table -- so above the first lag level it runs 1-2 points ahead of PF1e. The
 *    numbers stay RAW anyway because `reconcile()` seeds the difference back out (ruled 2026-08-19:
 *    the displayed level is worth a seed; letting the creature actually grow to the master's HD
 *    would be a house buff, and would put Foundry out of step with the web sheet).
 *
 * And then `reconcile()` proves it rather than trusting it: whatever pf1 derived is diffed against
 * the payload and the remainder is written into the stored seeds pf1 adds on top
 * (`savingThrows.*.base`, `hp.base`, `bab.value`). A world with a different health config, or a
 * familiar whose progression is not the animal one, lands on the payload's numbers anyway -- and
 * anything that could not be corrected is logged rather than left to look right.
 */
import { skillsDict } from './shared/skills-dict.js';
import { forceRederive } from './shared/foundry-doc.js';
import { buildSectionItems } from './companion-sections.js';
import { log } from './shared/log.js';

// D1: the body comes from pf-content. Actors there are type `character`, NOT `npc` -- which is also
// how a companion inherits the world's character health config, where the house maximised-HP rule
// already lives.
const PACK_BY_TYPE = {
  companion: 'pf-content.pf-companions',
  mount: 'pf-content.pf-companions',
  familiar: 'pf-content.pf-familiars',
  eidolon: 'pf-content.pf-eidolon-forms',
};
const ALL_PACKS = [...new Set(Object.values(PACK_BY_TYPE))];

// D10: each renderer composes its own title; the backend emits atoms and no label.
const TYPE_LABEL = {
  companion: 'animal companion',
  mount: 'mount',
  familiar: 'familiar',
  eidolon: 'eidolon',
};

const SIZE_IDS = {
  fine: 'fine', diminutive: 'dim', tiny: 'tiny', small: 'sm', medium: 'med',
  large: 'lg', huge: 'huge', gargantuan: 'grg', colossal: 'col',
};

// The two change-bearing items on every pf-content creature. Matching by name is safe: a census of
// all 205 `pf-companions` Actors found these two and nothing else carrying a change, with all three
// formulas identical pack-wide.
const TABLE_ITEMS = new Set(['str/dex bonus', 'natural armor bonus']);

// pf-content's eidolon bodies ship an item addressed to a human -- "Requires Manual Setup" -- asking
// for the two things the pack cannot know: pick the eidolon's four extra class skills by editing the
// class item, and keep whichever evolution-pool tracker matches your summoner. Both are answered by
// the payload (the skills it spent ranks on; `unchained_degraded` on the entry), so the module does
// them and the note goes with them. An instruction nobody has to follow should not be on the sheet:
// left there it reads as work outstanding on a creature that is finished.
const SETUP_NOTE = 'requires manual setup';
const POOL_ITEMS = { chained: 'evolution pool (chained)', unchained: 'evolution pool (unchained)' };

const norm = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The pf-content Actor for this creature, or null -- a miss is the D3 degrade.
 *
 * `species` is the match key for every creature the pack names after its species, which is every
 * animal, mount and familiar: the Bird actor is called "Bird". An EIDOLON is not one of those. Its
 * species is the base-form slug (`biped`) and its actor is "Biped Baseform", so the backend authors
 * the exact actor name on `entry.pf_content` and `validate_eidolon_data.py` asserts that mapping is
 * 1:1 against `pf_content_companions.json`. Ignoring the field made every eidolon miss and degrade
 * to a bare npc -- no art, no natural attacks -- while the data proving the match sat on the entry.
 *
 * `pf_content` is tried FIRST and `species` remains the fallback, so nothing that matched before
 * stops matching.
 */
async function findSource(entry) {
  const preferred = PACK_BY_TYPE[entry.type];
  const packIds = [...new Set([preferred, ...ALL_PACKS].filter(Boolean))];
  const wanted = [entry.pf_content, entry.species].map(norm).filter(Boolean);

  for (const packId of packIds) {
    const pack = game.packs.get(packId);
    if (!pack) continue;
    const index = await pack.getIndex();
    for (const name of wanted) {
      const hit = index.find((row) => norm(row.name) === name);
      if (hit) return pack.getDocument(hit._id);
    }
  }
  return null;
}

/**
 * "10 ft. , fly 80 ft. (average)" -> pf1's five speed bases.
 *
 * The unlabelled leading figure is the land speed. A mode the prose does not mention is zeroed
 * rather than left at the clone's value: the merged advancement is the authority on how this
 * creature moves, and a leftover 30 ft. burrow from the compendium body is a number nobody chose.
 */
function speedsFrom(prose) {
  const speeds = { land: 0, climb: 0, swim: 0, burrow: 0, fly: 0 };
  let maneuverability = 'average';
  const text = String(prose ?? '');

  const land = text.match(/^\s*(\d+)\s*ft/i);
  if (land) speeds.land = Number(land[1]);

  for (const mode of ['climb', 'swim', 'burrow', 'fly']) {
    const found = text.match(new RegExp(`${mode}\\s+(\\d+)\\s*ft`, 'i'));
    if (found) speeds[mode] = Number(found[1]);
  }

  const clumsiness = text.match(/\((clumsy|poor|average|good|perfect)\)/i);
  if (clumsiness) maneuverability = clumsiness[1].toLowerCase();

  return { speeds, maneuverability };
}

/**
 * The class item a degraded (un-cloned) creature needs.
 *
 * Its level is the master's, for the same reason the cloned body's is (see 3 in the header) -- a
 * degraded creature is still the same creature, and a sheet that reads two levels lower than its
 * twin would be a difference nobody chose. pf1's med-BAB and high/high/low progressions then run
 * ahead of the animal-companion table by the HD lag, and `reconcile()` seeds that back out.
 */
function classItemData(stats, level) {
  const die = Number(String(stats?.hit_die ?? 'd8').replace(/\D/g, '')) || 8;
  return {
    name: 'Animal Companion',
    type: 'class',
    system: {
      subType: 'base',
      level: Number(level) || Number(stats?.hd) || 1,
      hd: die,
      hp: 0,
      bab: 'med',
      skillsPerLevel: 0,
      // Same rule as the cloned path, through the same owner -- a degraded creature has no pack list
      // to merge into, so without this every one of its trained skills reads 3 low.
      classSkills: Object.fromEntries(
        Object.keys(classSkillPatch(stats)).map((path) => [path.split('.').pop(), true])),
      savingThrows: {
        fort: { value: 'high' },
        ref: { value: 'high' },
        will: { value: 'low' },
      },
    },
  };
}

/**
 * The class-skill flags the creature's own numbers imply, as dotted paths onto the class item.
 *
 * pf1 grants the +3 trained-in-a-class-skill bonus off `system.classSkills` on the class item, and
 * the backend has already granted it: `companion_stats._skills` adds 3 to every skill it puts a rank
 * in. So every ranked skill has to be flagged here or the sheet quietly reads 3 lower than the
 * payload and the web sheet on each one -- which it did, unseen, because nothing compares skill
 * TOTALS: the harness sums ranks and `reconcile()` covers saves, HP and BAB only.
 *
 * The gap is not small and it is not confined to the eidolon. `pf-content`'s Animal Companion class
 * item declares six class skills; PF1e's animal companion has NINE (the missing three are Escape
 * Artist, Intimidate and Survival, and the backend's `ANIMAL_SKILLS` is the RAW nine). The eidolon
 * body declares six and expects a human to add four -- which is half of what its "Requires Manual
 * Setup" item is asking for, and is why doing this here retires that note.
 *
 * Existing flags are merged, never replaced: a body's own list is the pack's claim about the
 * species, and dotted paths leave everything they do not name alone.
 */
function classSkillPatch(stats) {
  const patch = {};
  for (const [skill, spend] of Object.entries(stats?.skills ?? {})) {
    if (!(Number(spend?.ranks) > 0)) continue;
    const id = skillsDict[skill];
    if (id) patch[`system.classSkills.${id}`] = true;
  }
  return patch;
}

/** Everything that is a STORED field, so everything that survives a re-render. */
function systemPatch(entry) {
  const stats = entry.stats ?? {};
  const { speeds, maneuverability } = speedsFrom(stats.speed);
  const patch = {
    'system.attributes.naturalAC': Number(stats.natural_armor) || 0,
    'system.attributes.speed.land.base': speeds.land,
    'system.attributes.speed.climb.base': speeds.climb,
    'system.attributes.speed.swim.base': speeds.swim,
    'system.attributes.speed.burrow.base': speeds.burrow,
    'system.attributes.speed.fly.base': speeds.fly,
    'system.attributes.speed.fly.maneuverability': maneuverability,
    'system.traits.size': SIZE_IDS[String(stats.size ?? '').toLowerCase()] ?? 'med',
    'system.details.gender': entry.sex ?? '',
  };

  // Initiative is the one folded number with nowhere else to land. pf1 derives `init.total` from
  // Dexterity and adds the stored `init.value` misc bonus on top, and Improved Initiative is in the
  // companion feat pool -- so without this the payload says +7 and the sheet says +3. The Dex mod is
  // subtracted back out because pf1 supplies it: writing the payload's total would count it twice.
  const dexMod = Math.floor(((Number(stats.abilities?.dex) || 10) - 10) / 2);
  const initiative = Number(stats.initiative);
  if (Number.isFinite(initiative)) patch['system.attributes.init.value'] = initiative - dexMod;

  for (const [ability, score] of Object.entries(stats.abilities ?? {})) {
    patch[`system.abilities.${ability}.value`] = Number(score);
  }

  // Ranks only. The totals in the payload are for the web sheet; pf1 adds the ability modifier and
  // the class-skill bonus itself, and writing a total would fight it.
  for (const [skill, spend] of Object.entries(stats.skills ?? {})) {
    const id = skillsDict[skill];
    if (!id) {
      console.warn(`Companion: no pf1 skill id for "${skill}" — ${spend?.ranks} rank(s) dropped.`);
      continue;
    }
    patch[`system.skills.${id}.rank`] = Number(spend?.ranks) || 0;
  }

  return patch;
}

/**
 * Diff what pf1 derived against what the backend said, and close the gap through the stored seeds.
 *
 * `savingThrows.*.base`, `hp.base` and `bab.value` are all read by pf1 as starting values that its
 * changes accumulate on top of (`actor-pf.mjs`), so a delta written here lands exactly. AC is
 * deliberately NOT corrected: its inputs (natural armour, Dex, size) are already ours, so a
 * disagreement means something else is on the body and is worth seeing rather than papering over.
 *
 * Since the class item moved to the master's effective level (header, 3) this corrects nearly every
 * creature rather than nearly none. pf1 has no companion table -- it reads a class level as a count
 * of hit dice -- so above the first lag level it derives 1-2 points too much BAB, save and HP, and
 * the seed written here is what keeps the sheet on the PF1e numbers the payload and the web sheet
 * both carry. A correction is now expected; its ABSENCE on a lagging creature would be the surprise.
 */
async function reconcile(actor, stats) {
  const attributes = actor.system.attributes ?? {};
  const corrections = {};
  const notes = [];

  for (const save of ['fort', 'ref', 'will']) {
    const want = Number(stats?.saves?.[save]);
    if (!Number.isFinite(want)) continue;
    const got = Number(attributes.savingThrows?.[save]?.total) || 0;
    if (got === want) continue;
    const base = Number(attributes.savingThrows?.[save]?.base) || 0;
    corrections[`system.attributes.savingThrows.${save}.base`] = base + (want - got);
    notes.push(`${save} ${got}->${want}`);
  }

  const wantHp = Number(stats?.hp);
  const gotHp = Number(attributes.hp?.max) || 0;
  if (Number.isFinite(wantHp) && gotHp !== wantHp) {
    corrections['system.attributes.hp.base'] = (Number(attributes.hp?.base) || 0) + (wantHp - gotHp);
    notes.push(`hp ${gotHp}->${wantHp}`);
  }

  const wantBab = Number(stats?.bab);
  const gotBab = Number(attributes.bab?.total) || 0;
  if (Number.isFinite(wantBab) && gotBab !== wantBab) {
    corrections['system.attributes.bab.value'] = (Number(attributes.bab?.value) || 0) + (wantBab - gotBab);
    notes.push(`bab ${gotBab}->${wantBab}`);
  }

  if (Object.keys(corrections).length) {
    await actor.update(corrections);
    log.debug(`Companion ${actor.name}: reconciled ${notes.join(', ')}.`);
  }

}

/**
 * Audit AC, AFTER the parity sections have landed.
 *
 * This used to sit at the bottom of `reconcile()` and was therefore mistimed: reconcile runs before
 * `attachSections()`, so the feat items carrying the fold's own `ac` changes were not on the actor
 * yet and the check compared an incomplete sheet against a complete payload. It warned on every
 * companion with an AC feat, which is how a real one-point shortfall hid inside an expected warning
 * for as long as it did.
 *
 * Still a warning and not a correction: pf1 gives AC no seed to write a delta into, so there is
 * nothing to correct THROUGH. A disagreement now genuinely means something on the body is
 * contributing that the payload did not count, which is worth seeing rather than papering over.
 */
function auditAc(actor, stats) {
  const wantAc = Number(stats?.ac);
  const gotAc = Number(actor.system.attributes?.ac?.normal?.total);
  if (Number.isFinite(wantAc) && Number.isFinite(gotAc) && gotAc !== wantAc) {
    console.warn(`Companion ${actor.name}: AC ${gotAc} on the sheet vs ${wantAc} in the payload — ` +
                 `something on the body is contributing that the payload did not count.`);
  }
}

/**
 * The three template files the parity sections clone from. Fetched once per import, not per
 * creature: a druid/ranger/hunter stack makes this function run three times and the files do not
 * change between them.
 */
let assetCache = null;
async function loadAssets() {
  if (assetCache) return assetCache;
  const base = 'modules/pf1e_random_char_generator/templates/character_sheet_folder';
  const read = async (file) => {
    try {
      const response = await fetch(`${base}/${file}`);
      if (!response.ok) throw new Error(`${response.status}`);
      return await response.json();
    } catch (error) {
      // A missing template costs one section, not the creature. Say which, so the gap is legible.
      console.warn(`Companion sections: could not read ${file} (${error.message}) — ` +
                   'that group will be missing from the sheet.');
      return null;
    }
  };
  const [houseFeatures, sizeForDamage, customBuffs] = await Promise.all([
    read('house_features.json'), read('sizefordamage_feature.json'), read('custom_buffs.json'),
  ]);
  assetCache = {
    houseFeatures: Array.isArray(houseFeatures) ? houseFeatures : [],
    sizeForDamage: sizeForDamage && !Array.isArray(sizeForDamage) ? sizeForDamage : null,
    customBuffs: Array.isArray(customBuffs) ? customBuffs : [],
  };
  return assetCache;
}

/**
 * Foundry's spelling of a feat name, or null.
 *
 * `data/feats.csv` writes the qualifier first (`Light Armor Proficiency`) and the pf1 compendium
 * writes it last (`Armor Proficiency, Light`). The backend keeps the CSV spelling because that is
 * what its prerequisite and feat-tax lookups read, so the inversion has to happen HERE -- and it is
 * the same two-sided normalisation `validate_companion_names.py` already does for species. Without
 * it those three feats silently arrive as bare items with no rules text.
 */
function nameCandidates(name) {
  const out = [name];
  if (name.includes(',')) {
    const [head, tail] = name.split(',');
    out.push(`${tail.trim()} ${head.trim()}`);
  } else {
    const words = name.split(' ');
    for (let cut = 1; cut < words.length; cut += 1) {
      out.push(`${words.slice(cut).join(' ')}, ${words.slice(0, cut).join(' ')}`);
    }
  }
  return out;
}

/** A name -> compendium feat data resolver, prefetched so `buildSectionItems` can stay pure. */
async function featResolver(entry) {
  const wanted = [...(entry.feats ?? []), ...(entry.flaw_feats ?? [])].filter(Boolean);
  const resolved = new Map();
  if (!wanted.length) return () => null;

  const pack = game.packs.get('pf1.feats');
  const index = pack ? await pack.getIndex() : null;
  for (const name of wanted) {
    const hit = index?.find((row) => nameCandidates(name).some((alt) => norm(row.name) === norm(alt)));
    if (!hit) {
      console.warn(`Companion: no pf1.feats entry for "${name}" — it will render with no rules text.`);
      continue;
    }
    const data = (await pack.getDocument(hit._id)).toObject();
    delete data._id;
    resolved.set(norm(name), data);
  }
  return (name) => resolved.get(norm(name)) ?? null;
}

/**
 * The parity sections: dividers, labelled feats, tracker groups, Flaws and the basic buffs.
 *
 * Everything about WHAT is built lives in `companion-sections.js`, which is pure; this function is
 * only the I/O around it. Items the body already carries under the same name are skipped, which is
 * the `every_feat.json` double-apply guard in miniature -- a cloned wolf that already ships Weapon
 * Focus must not get a second copy of it.
 */
async function attachSections(actor, entry) {
  const [assets, resolveFeat] = await Promise.all([loadAssets(), featResolver(entry)]);
  const existing = new Set(actor.items.map((item) => norm(item.name)));
  const creations = [];
  for (const item of buildSectionItems(entry, assets, resolveFeat)) {
    // A divider's name is underscores; two of those would collide on this check, so only real
    // items are deduped. Dividers are unique by construction anyway.
    const key = norm(item.name);
    if (key && existing.has(key)) continue;
    if (key) existing.add(key);
    creations.push(item);
  }
  if (creations.length) await actor.createEmbeddedDocuments('Item', creations);
  return creations.length;
}

/** One Actor for one granted creature. */
async function createBondedCreature(entry, folderId, masterName) {
  const stats = entry.stats ?? {};
  const label = TYPE_LABEL[entry.type] ?? entry.type ?? 'companion';
  const name = `${masterName}'s ${label}: ${entry.name ?? entry.species}`;

  const source = await findSource(entry);
  const data = source ? source.toObject() : { type: 'character', system: {} };
  delete data._id;
  data.name = name;
  data.folder = folderId;

  // The number the class item is driven at. `effective_level` is the grantor's own class level after
  // stacking, which is what the sheet must read; `hd` is the fallback for a payload old enough not to
  // carry it, and keeps this file working against a recorded fixture from before the field existed.
  const classLevel = Number(entry.effective_level) || Number(stats.hd) || 1;

  if (!source) data.items = [classItemData(stats, classLevel)];

  const actor = await Actor.create(data);
  if (!actor) throw new Error(`Actor.create returned nothing for ${name}`);

  // 1. Delete the companion table the clone re-applies (see the header), the pack's manual-setup
  // note, and whichever evolution-pool tracker does not match this summoner. Exactly one of the two
  // pools applies and the body ships both; the one that stays prints the same figure the Evolutions
  // band does, off `@class.level`, which agrees with `eidolon_table.json` at all twenty levels.
  const stale = new Set([...TABLE_ITEMS, SETUP_NOTE]);
  if (entry.type === 'eidolon') {
    stale.add((entry.flags ?? []).includes('unchained_degraded')
      ? POOL_ITEMS.chained : POOL_ITEMS.unchained);
  }
  const doubled = actor.items.filter((item) => stale.has(String(item.name).trim().toLowerCase()));
  if (doubled.length) {
    await actor.deleteEmbeddedDocuments('Item', doubled.map((item) => item.id));
  }

  // 2. Drive the class item at the MASTER'S EFFECTIVE LEVEL. Prefer the one with a real progression:
  // 35 of the 205 bodies carry a second, level-0 class item naming the creature type (Vermin, Plant,
  // ...) whose bab and saves are empty, and levelling that one would grant nothing.
  const classes = actor.itemTypes.class;
  const chassis = classes.find((item) => item.system?.bab) ?? classes[0];
  if (chassis) {
    const die = Number(String(stats.hit_die ?? '').replace(/\D/g, ''));
    // A same-value update is a no-op Foundry fires no change event for, and pf1 then never
    // re-derives — see forceRederive in shared/foundry-doc.js.
    await forceRederive(chassis, 'system.level', classLevel, {
      current: chassis.system.level,
      extra: { ...(die ? { 'system.hd': die } : {}), ...classSkillPatch(stats) },
    });
  } else {
    await actor.createEmbeddedDocuments('Item', [classItemData(stats, classLevel)]);
  }

  // 3. Stored fields, then prove the derived ones.
  await actor.update(systemPatch(entry));
  await reconcile(actor, stats);
  await attachSections(actor, entry);
  auditAc(actor, stats);   // after the sections: the fold's own AC changes ride in on the feat items

  return { actor, cloned: !!source };
}

/**
 * Every bonded creature on the payload, as its own Actor in the Random Characters folder.
 *
 * Absence entries are skipped and LOGGED: an entry with `species: null` exists precisely to record
 * why there is no creature (a druid's domain flip, an archetype trade-away), and dropping it in
 * silence would look identical to a bug.
 */
export async function createBondedCreatures(payload, folderId) {
  const entries = Array.isArray(payload?.bonded_creatures) ? payload.bonded_creatures : [];
  if (!entries.length) return { created: 0, degraded: 0, absent: 0 };

  const masterName = payload.character_full_name || payload.full_name || 'Unnamed';
  const summary = { created: 0, degraded: 0, absent: 0, failed: 0 };

  for (const entry of entries) {
    if (!entry?.species || !entry?.stats) {
      summary.absent += 1;
      log.debug(`Companion: ${entry?.grantor ?? 'unknown'} granted nothing (${entry?.outcome ?? 'no outcome'}).`);
      continue;
    }
    try {
      const { actor, cloned } = await createBondedCreature(entry, folderId, masterName);
      summary[cloned ? 'created' : 'degraded'] += 1;
      if (!cloned) {
        console.warn(`Companion: no pf-content Actor named "${entry.pf_content ?? entry.species}" — built from payload ` +
                     `numbers alone (no art, no natural attacks).`);
      }
      log.debug(`Companion created: ${actor.name} (${entry.type}, level ${entry.effective_level}, ` +
                `${entry.stats.hd} HD).`);
    } catch (error) {
      summary.failed += 1;
      console.error(`Companion: failed to create ${entry.species}:`, error);
    }
  }

  const made = summary.created + summary.degraded;
  if (made) {
    ui.notifications?.info(`Created ${made} bonded creature sheet(s)` +
      `${summary.degraded ? ` (${summary.degraded} without a compendium body)` : ''}.`);
  }
  if (summary.failed) {
    ui.notifications?.warn(`${summary.failed} bonded creature(s) could not be created — see the console.`);
  }
  return summary;
}
