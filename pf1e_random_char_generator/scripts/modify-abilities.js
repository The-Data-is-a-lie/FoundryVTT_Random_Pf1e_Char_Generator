import { createBuildContext } from './build/build-context.js';
import { loadTemplates } from './build/template-loader.js';
import { attachConditionals } from './build/conditional-engine.js';
import { findMainWeapon } from './build/weapon.js';
import { addRace } from './build/race.js';
import { addPathOfWar } from './build/path-of-war.js';
// addFeatSeparator is exported because the Path of War block still in the closure lays its own
// section divider with it.
import { addFeats, addTraits, addFeatSeparator } from './build/feats.js';
import { addSkills } from './build/skills.js';
import { addWeaponFinishing } from './build/weapon-finishing.js';
// Path of War vocabulary shared by three stages: the toggles' rider DCs, the PoW items still in the
// closure, and the Spheres casting-ability fallback all have to agree on the initiating ability.
import { capitalizeManeuverType, resolveInitStat, maneuverInitAttr } from './build/initiation.js';
import { addAttackToggles } from './build/attack-toggles.js';
import { addEquipment, addAmmo } from './build/equipment.js';
// subSpellTokens/spellCasterLevelNum are the spells stage's two exported readers: the spell-buff
// conditionals substitute @slvl/@castMod, and the house auras want the combined caster level.
import { addSpells, addSpellRiders, subSpellTokens, spellCasterLevelNum } from './build/spells.js';
import { addClassFeatures, addResourcePools } from './build/class-features.js';
import { addClasses } from './build/classes.js';
import { normalizeTraitShapes } from './build/pf1-compat.js';
import { addStatBuffs, addCustomBuffs } from './build/buffs.js';
import { applyCoreAttributes } from './build/core-attributes.js';
import {
  appendJsonToTemplate,
  synthesizeFeatItem,
  assignSequentialSort,
  applyBuffData,
  appendFeatDivider,
} from './build/items.js';
import {
  readDeliverData,
  readCharacterPayload,
  writeExportPath,
} from './shared/storage.js';
import {
  capitalizeWords,
  convertToStringSimple,
  sphereNorm,
  powNorm,
} from './shared/text.js';

/**
 * Build the pf1 actor payload from the generated character data.
 *
 * `deps` is the first sliver of the build context (ticket 05) and exists for one reason: a run of
 * this function is otherwise unreproducible, so nothing it produces can be diffed. Two things make
 * it vary, and they are DIFFERENT KINDS of variation:
 *
 *   rng()    - SEMANTIC choice. Exactly one caller: check_ammo() picks a random ammo item, so two
 *              runs of the same payload can put different content on the sheet. No amount of
 *              id-normalisation after the fact can hide that, which is why the randomness is
 *              injected rather than diffed around.
 *   mintId() - IDENTITY only. `kind` says what is being stamped, `key` is the content it is being
 *              stamped onto. The harness derives the id FROM that content rather than from a
 *              counter, so extracting or merging code (tickets 06, 07) cannot shift every
 *              subsequent id and turn the golden diff into noise on the very tickets that need to
 *              read it. Content-derived ids can collide where a sequence could not, so the harness
 *              asserts uniqueness to recover what the counter gave for free.
 *
 * PRODUCTION PASSES NOTHING. The defaults below are exactly what this file did before the seam
 * existed -- Math.random and 16 random characters -- so live output is unchanged and `kind`/`key`
 * are simply ignored. Only the harness supplies replacements.
 */
export async function main(deps = {}) {
  const {
    rng = Math.random,
    mintId = (_kind, _key) => {
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      return [...Array(16)].map(() => characters.charAt(Math.floor(Math.random() * characters.length))).join('');
    },
  } = deps;

  // The build context (see build/build-context.js). During the strangler split its fields are
  // ALIASES of the locals below: `main()` still declares them, and assigns them here as they come
  // into existence, so an extracted stage reading `ctx.x` and closure code still reading `x` see
  // the same object. Each assignment sits at the point the local is finished being reassigned.
  const ctx = createBuildContext({ rng, mintId });

  try {
    // Retrieve the module dynamically using the module name
    const module = game.modules.get('pf1e_random_char_generator');
    if (!module) {
      console.error("Module 'pf1e_random_char_generator' not found.");
      return;
    }

    var savedData = readDeliverData();
    var modded = savedData.modded_char_sheet; // y or n
    console.log("Is it modded????????????", modded);

    // Templates, by stable name. The loader owns the paths, the modded/base swap and its
    // missing-file fallback, and the session cache -- see build/template-loader.js. `modded` is
    // reassigned from what it RETURNS, not from what it was asked for: the fallback downgrades a
    // modded run to the base bundles when the _MODS templates aren't installed.
    const loaded = await loadTemplates({ modded });
    const templates = loaded.templates;
    modded = loaded.modded;
    ctx.templates = templates;
    ctx.modded = modded;


const characterData = readCharacterPayload();
// The backend wraps any generation exception as {"error": "..."} (app.py process_input_values), so
// a payload without c_class is a failed generation, not a character — surface the real error and
// abort (main() returning false makes button.js skip actor creation) instead of crashing on the
// first field access with a cryptic "cannot read toLowerCase of undefined".
if (!characterData || characterData.error || !characterData.c_class) {
  const reason = characterData?.error || 'the backend returned no character data';
  console.error('Character Generator: backend generation failed:', reason, characterData);
  ui.notifications?.error(`Character Generator: the backend failed to generate a character (${reason}).`);
  return false;
}
// Backend-supplied descriptions for feats absent from every_feat.json (Metzofitz style chains,
// Martial Training I-VI). Keyed lowercase so processFeatTrait/applyFeatTax can resolve them
// case-insensitively and synthesize items instead of silently dropping the rows.
const homebrewFeatDescs = {};
for (const [hbName, hbDesc] of Object.entries(characterData.homebrew_feat_desc_dict || {})) {
  homebrewFeatDescs[hbName.toLowerCase()] = { name: hbName, desc: String(hbDesc) };
}
// Backend-authored feat buffs. feat_changes_dict: always-on pf1 `changes` (+ situational
// contextNotes) overlaid onto the resolved feat item (only for feats the compendium does NOT already
// automate, so nothing double-applies). feat_conditionals_dict: active-feat default-off toggles
// (Power Attack, Deadly Aim, ...) attached to the main weapon's attack action. Keyed lowercase.
const featChangesMap = {};
for (const [fn, fv] of Object.entries(characterData.feat_changes_dict || {})) {
  featChangesMap[fn.toLowerCase()] = fv;
}
const featConditionalsMap = {};
for (const [fn, fv] of Object.entries(characterData.feat_conditionals_dict || {})) {
  featConditionalsMap[fn.toLowerCase()] = fv;
}
// Backend-authored equipment buffs. item_changes_dict: pf1 `changes` + `contextNotes` parsed from
// items_best.json descriptions (generated by scripts/build_item_changes.py), overlaid onto the
// matched/synthesized equipment item — deduped by change target, so items every_item.json already
// automates don't double-apply. Attack-target contextNotes are SPLIT OUT here instead of riding the
// item: pf1 prints an item's attack notes in full on every attack chat card, and these are mostly
// multi-sentence activation text (Swordmaster's Shirt, Battle Strider's Boots, Doomsday Key). Each
// becomes a default-off "(Item Name): <text>" toggle on the main weapon's attack action via
// addItemAttackConditionals(); non-attack notes still overlay the item as before.
// enhancement_effects_dict: curated weapon/armor special-ability effects (quality_effects.json) —
// `conditionals` go on the main weapon's attack action, `changes`/`contextNotes` on the
// armor/shield/weapon item itself. Both keyed lowercase.
const itemChangesMap = {};
const itemAttackToggles = [];   // {itemName, text} — consumed by addItemAttackConditionals()
for (const [inName, inVal] of Object.entries(characterData.item_changes_dict || {})) {
  const inNotes = Array.isArray(inVal?.contextNotes) ? inVal.contextNotes : [];
  const attackNotes = inNotes.filter(n => n && n.target === 'attack' && n.text);
  if (attackNotes.length) {
    for (const n of attackNotes) itemAttackToggles.push({ itemName: inName, text: String(n.text).trim() });
    itemChangesMap[inName.toLowerCase()] = { ...inVal, contextNotes: inNotes.filter(n => !attackNotes.includes(n)) };
  } else {
    itemChangesMap[inName.toLowerCase()] = inVal;
  }
}
// enhancement_effects_dict is SECTIONED ({weapon: {...}, armor: {...}, shield: {...}}) — consumed
// directly by addEnhancementEffects() after the weapon/armor items exist.
// Prepared casters (prepare a daily spell loadout). Bard, Summoner, Summoner (Unchained), and Skald
// are SPONTANEOUS in PF1 (cast from spells known, no preparation) and are intentionally excluded so
// they fall through to the spontaneous branch in determineSpellType().
const prepared_caster_list = ["Alchemist", "Cleric", "Druid", "Inquisitor", "Investigator", "Magus", "Paladin", "Ranger", "Warpriest", "Wizard", "Witch"]
// Prefer the backend's display name (e.g. "Barbarian (Unchained)"), which is already in the exact
// every_class.json format. Do NOT run it through capitalizeWords (that lowercases the "(unchained)"
// part). Fall back to capitalizeWords(c_class) for an un-redeployed backend.
const upper_case_class = characterData.c_class_display || capitalizeWords(characterData.c_class);

ctx.characterData = characterData;
ctx.homebrewFeatDescs = homebrewFeatDescs;
ctx.featChangesMap = featChangesMap;
ctx.featConditionalsMap = featConditionalsMap;
ctx.itemChangesMap = itemChangesMap;
ctx.itemAttackToggles = itemAttackToggles;
ctx.preparedCasterList = prepared_caster_list;
ctx.upperCaseClass = upper_case_class;

   // ----- Start of exportTemplate setup ----- //

   // we want to use unmodifed template if it exists
   let exportTemplate;
   const storedTemplate = templates.unmodifiedPreExportTemplate; 
   if (storedTemplate) {
     // If the template was loaded, set exportTemplate to that
     exportTemplate = JSON.parse(JSON.stringify(storedTemplate)); // Deep copy to avoid references
   } else {
     // If not found, use the 'preExportTemplate' as fallback  (We typically don't want to use this one)
     const template = templates.preExportTemplate;
     exportTemplate = JSON.parse(JSON.stringify(template)); // Deep copy
   }

   // ----- End of exportTemplate setup ----- //

   // Assigned here and not earlier: `exportTemplate` is the one local the build REASSIGNS rather
   // than mutates, and both reassignments are in the block above.
   ctx.exportTemplate = exportTemplate;

   applyCoreAttributes(ctx);



   await addClasses(ctx);

addRace(ctx);



// ------ Generalized Features Page Functions ------ //


// ------ End of Generalized Features Page Functions ------ //


   // ----- Class Features ----- //
   // Order matters: addResourcePools removes the harvested duplicate of any ability that became a
   // pool, so it runs after the features are laid down, not before.
   await addClassFeatures(ctx);
   await addResourcePools(ctx);


// camelCase a display sphere name for the flags.pf1spheres.sphere fallback when a talent isn't in the
// compendium (e.g. "Dual Wielding" -> "dualWielding", "Fallen Fey" -> "fallenFey", "Lancer" -> "lancer").
function sphereKeyFromName(s) {
  const words = String(s).replace(/\s*\[[^\]]*\]\s*/g, ' ').trim().split(/\s+/).filter(Boolean);
  return words.map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
}

// Human-readable casting-tradition writeup: what the casting ability means, the mana pool breakdown
// (only when a pool exists -- pure martials carry a latent tradition with no pool), each drawback
// (with its 1-/2-point weight) and boon spelled out, and the drawback->boon->bonus-SP math. Shared by
// the "Spheres Casting" summary feat (magic dabblers) and the Casting Traditions trait every NPC gets.
function buildTraditionHtml(tradition, manaPool) {
  const parts = [];
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const plural = (n, word) => `${n} ${word}${Number(n) === 1 ? '' : 's'}`;
  // Each drawback/boon is now {name, description, counts_as?}; tolerate bare-name strings from
  // payloads generated before descriptions were carried through (still cached in localStorage).
  const traitName = t => (t && typeof t === 'object') ? (t.name || '') : String(t);
  const traitDesc = t => (t && typeof t === 'object') ? (t.description || '') : '';
  const traitWeight = t => (t && typeof t === 'object') ? (Number(t.counts_as) || 1) : 1;
  const renderDrawback = t => {
    const wt = ` <em>(${plural(traitWeight(t), 'drawback point')})</em>`;
    const d = traitDesc(t);
    return `<li><strong>${esc(traitName(t))}</strong>${wt}${d ? ` &mdash; ${esc(d)}` : ''}</li>`;
  };
  const renderBoon = t => {
    const d = traitDesc(t);
    return `<li><strong>${esc(traitName(t))}</strong>${d ? ` &mdash; ${esc(d)}` : ''}</li>`;
  };

  const cam = (tradition && tradition.casting_ability_modifier) || '';
  // Prefer the rich {name, description, counts_as} dicts; fall back to the plain name-string arrays
  // (which the backend always keeps .join()-safe) so an older payload still renders clean names.
  const dbs = (tradition && (tradition.drawbacks_detail || tradition.drawbacks)) || [];
  const boons = (tradition && (tradition.boons_detail || tradition.boons)) || [];
  const bonusSp = Number(tradition && tradition.bonus_spell_points) || 0;
  const pool = Number(manaPool) || 0;
  const base = Math.max(0, pool - bonusSp);

  if (dbs.length || boons.length) {
    parts.push(`<p><em>This character's casting tradition &mdash; the limitations (drawbacks) and perks (boons) that shape how their magic works${pool > 0 ? '' : ' (latent: it applies to any sphere magic they ever pick up)'}.</em></p>`);
  }
  if (cam) {
    parts.push(`<p><strong>Casting ability:</strong> ${esc(cam)} &mdash; the mental ability score that powers their sphere magic. It sets the save DC of their sphere effects (DC 10 + 1/2 caster level + ${esc(cam)} modifier) and their base pool of spell points.</p>`);
  }
  if (pool > 0) {
    const breakdown = bonusSp
      ? ` (base ${base} from the ${esc(cam || 'casting')} modifier + ${plural(bonusSp, 'bonus spell point')} from unspent drawbacks)`
      : ` (from the ${esc(cam || 'casting')} modifier)`;
    parts.push(`<p><strong>Spell points (mana pool):</strong> ${pool} &mdash; the daily pool spent to fuel the more powerful sphere abilities; it refreshes after a night's rest.${breakdown}</p>`);
  }
  if (dbs.length) {
    parts.push(`<p><strong>Drawbacks</strong> &mdash; limits accepted on their magic; each is worth 1 or 2 drawback points:</p><ul>${dbs.map(renderDrawback).join('')}</ul>`);
  }
  if (boons.length) {
    parts.push(`<p><strong>Boons</strong> &mdash; perks purchased with drawback points (2 drawback points buy 1 boon):</p><ul>${boons.map(renderBoon).join('')}</ul>`);
  }
  if (dbs.length) {
    const totalPts = dbs.reduce((n, t) => n + traitWeight(t), 0);
    const leftover = Math.max(0, totalPts - boons.length * 2);
    const spInto = pool > 0 ? ' (rising triangular chart, folded into the mana pool above)' : ' (rising triangular chart; banked until they have a mana pool)';
    parts.push(`<p><strong>Tradition math:</strong> ${plural(totalPts, 'drawback point')} total &rarr; ${plural(boons.length, 'boon')} bought (2 points each) &rarr; ${plural(leftover, 'point')} left over &rarr; +${plural(bonusSp, 'bonus spell point')}${spInto}.</p>`);
  }
  return parts.join('');
}

// Spheres (of Power / Might) -> NATIVE pf1spheres talent items so they land in the module's Combat /
// Magic Talents section (not the Features list), exactly like a talent dragged in from the compendium.
// Each backend talent is matched (by normalized name) to the pf1spheres.combat-talents /
// .magic-talents pack and cloned (the clone carries subType "combatTalent"/"magicTalent",
// flags.pf1spheres.sphere, the sphere icon, and the compendium source). Talents absent from the
// compendium (or with the module disabled) are synthesized as feat items tagged with the same subType
// + sphere flag so they still appear in the talents section. Magic dabblers also get one informational
// casting-tradition / mana-pool summary feat. The sphere FEATS ride the normal feat pipeline elsewhere.
async function processSpheres(magicItems, combatItems, tradition, manaPool, startingSort = 4210) {
  magicItems = Array.isArray(magicItems) ? magicItems : [];
  combatItems = Array.isArray(combatItems) ? combatItems : [];
  if (!magicItems.length && !combatItems.length) return;

  const active = !!game.modules.get('pf1spheres')?.active;
  if (!active) console.warn('Spheres: pf1spheres module inactive — synthesizing talent items (still tagged for the talents section).');

  async function loadPack(packId) {
    const map = new Map();
    if (!active) return map;
    try {
      const pack = game.packs.get(packId);
      if (pack) {
        const docs = await pack.getDocuments();
        for (const d of docs) map.set(sphereNorm(d.name), d);
      } else {
        console.warn(`Spheres: pack ${packId} not found — synthesizing those talents.`);
      }
    } catch (e) {
      console.warn(`Spheres: could not read ${packId} — synthesizing.`, e);
    }
    return map;
  }
  const magicPack = await loadPack('pf1spheres.magic-talents');
  const combatPack = await loadPack('pf1spheres.combat-talents');

  const talentEntries = [];   // {item, sphere, advanced, name} -> sorted below
  let misses = 0;
  function buildTalent(t, pack, subType) {
    let item;
    const doc = pack.get(sphereNorm(t.name || ''));
    if (doc) {
      item = doc.toObject();
      delete item._id;            // fresh embedded id on actor creation
    } else {
      misses++;
      const cleanName = String(t.name || 'Talent').split(' (')[0].replace(/\s*\[[^\]]*\]\s*/g, ' ').trim();
      item = synthesizeFeatItem(cleanName, t.description ? `<p>${t.description}</p>` : '');
      item.system.subType = subType;   // combatTalent / magicTalent -> shows in the pf1spheres section
      item.flags = item.flags || {};
      item.flags.pf1spheres = { sphere: sphereKeyFromName(t.sphere || '') };
    }
    // Backend-authored numeric buffs for COMBAT (Might) talents -> the Foundry Changes tab (Power
    // talents carry none). Fill the pf1 ChangeModel defaults like processProfessionAbilities.
    if (Array.isArray(t.changes) && t.changes.length) {
      item.system = item.system || {};
      const ex = Array.isArray(item.system.changes) ? item.system.changes : [];
      item.system.changes = ex.concat(t.changes.map(ch => Object.assign(
        { formula: "0", target: "", type: "untyped", operator: "add", priority: 0, value: 0 },
        ch, { _id: (ch && ch._id) || ctx.newChangeId(ch) })));
    }
    if (Array.isArray(t.contextNotes) && t.contextNotes.length) {
      item.system = item.system || {};
      const ex = Array.isArray(item.system.contextNotes) ? item.system.contextNotes : [];
      item.system.contextNotes = ex.concat(t.contextNotes);
    }
    if (t.advanced) item.name = `(Advanced) ${item.name}`;   // label advanced talents (compendium clone has no flag)
    const sphere = (item.flags && item.flags.pf1spheres && item.flags.pf1spheres.sphere) || sphereKeyFromName(t.sphere || '');
    talentEntries.push({ item, sphere, advanced: !!t.advanced, name: item.name });
  }
  for (const t of combatItems) buildTalent(t, combatPack, 'combatTalent');
  for (const t of magicItems) buildTalent(t, magicPack, 'magicTalent');

  // Order each sphere: normal talents alphabetical, then advanced talents (alphabetical) at the bottom.
  // pf1spheres' Spheres tab lists a sphere's talents by their `sort` field, so we assign `sort` in this
  // order. (Cross-sphere order is irrelevant -- each sphere renders as its own group.)
  talentEntries.sort((a, b) =>
    a.sphere.localeCompare(b.sphere)
    || (a.advanced === b.advanced ? 0 : (a.advanced ? 1 : -1))
    || a.name.localeCompare(b.name));
  const built = talentEntries.map(e => e.item);

  // Magic dabblers: one informational casting-tradition / mana-pool summary feat (not a talent).
  if (Number(manaPool) > 0 || (tradition && Object.keys(tradition).length)) {
    const html = buildTraditionHtml(tradition, manaPool);
    if (html) built.push(synthesizeFeatItem(`Spheres Casting (mana pool ${Number(manaPool) || 0})`, html));
  }

  assignSequentialSort(built, startingSort);
  appendJsonToTemplate(built, exportTemplate, "Feat");
  console.log(`Spheres: injected ${built.length} item(s) (${misses} synthesized).`);
}


// ----- Feats, then Spheres talents, then Traits ----- //
// The Spheres block below used to sit INSIDE Feats_n_Traits, which built the talent items as a
// side effect of placing feats (hazard 3). Splitting that function at this exact boundary pulls
// them apart without moving anything: the append order is what it always was.
await addFeats(ctx);
// Spheres -> NATIVE pf1spheres talent items (Combat/Magic Talents section, not the Features list).
// processSpheres clones each talent from the pf1spheres compendium (or synthesizes a subType-tagged
// fallback) + adds a casting-tradition / mana-pool summary feat for magic dabblers. No feat divider:
// the talents live in the module's talents section, grouped by sphere.
if ((Array.isArray(characterData.magic_talent_items) && characterData.magic_talent_items.length)
    || (Array.isArray(characterData.combat_talent_items) && characterData.combat_talent_items.length)) {
  await processSpheres(characterData.magic_talent_items, characterData.combat_talent_items,
    characterData.casting_tradition, characterData.sphere_mana_pool, 4210);
}
// Casting tradition -> its own section at the very TOP of the Traits tab. Every NPC carries one
// now (for non-casters it's latent flavor -- how their magic would work if they ever pick any up);
// old payloads without casting_tradition simply skip the section. The divider's underscore runs are
// deliberately SYMMETRIC (equal on both sides), unlike the legacy dividers around it.
const castingTrad = characterData.casting_tradition || {};
if (Object.keys(castingTrad).length) {
  await appendFeatDivider(ctx, "____________________ Casting Traditions ____________________", -200000, 'trait');
  const camName = castingTrad.casting_ability_modifier;
  const tradItem = synthesizeFeatItem(
    camName ? `Casting Tradition (${camName})` : "Casting Tradition",
    buildTraditionHtml(castingTrad, characterData.sphere_mana_pool));
  tradItem.system.subType = 'trait';
  tradItem.sort = -199900;
  appendJsonToTemplate([tradItem], exportTemplate, "Trait");
}
await addTraits(ctx);

// ----- Path of War ----- //


await addPathOfWar(ctx);

// ----- Start of Psionics Section ----- //
// Psionics is the Path of War shape one more time: the backend picks the powers and computes the
// numbers, a third-party module (pf1-psionics) renders them.
//
// The load-bearing difference is that pf1-psionics shows its ENTIRE Psionics tab off a single
// condition — actor-sheet.mjs checks whether any manifester book flag has inUse:true. It reads no
// class item, no class tag, no power item. So a generated manifester without these flags arrives
// with its powers in the Items directory and nothing on the sheet, and the GM has to add a class
// by hand in the settings panel to reveal it. configureManifesters is that fix.
//
// Powers become pf1-psionics.power items: cloned from the module's own pack when the name matches
// (real icons, actions, prepared descriptions), synthesized from the backend's powers_desc_dict
// otherwise. Misses are EXPECTED — a measured 67 of the backend's powers are Metzofitz-only
// content that exists in no compendium anywhere.
//
// Power POINTS stay the module's to compute (autoLevelPowerPoints), because its tables and ours
// are the same twenty numbers — validate_psionics_data.py asserts exactly that, every run. That
// only works if book.class is the class ITEM's tag, so a tag miss is warned about rather than
// left to surface as a plausible-looking zero. The backend's pp_per_day seeds the CURRENT pool
// instead, so a generated NPC arrives rested; .maximum is derived during actor prep, which has
// not run yet. With pf1-psionics disabled we fall back to feat items plus a charge pool, the same
// way the Path of War block above falls back.

const MANIFESTER_SLOTS = ['primary', 'secondary', 'tertiary'];
// The seven discipline keys pf1-psionics recognises (data/disciplines.mjs). Anything else makes
// system.school undefined and drops the power out of Psionics-Magic Transparency.
const PSIONIC_DISCIPLINES = ['athanatism', 'clairsentience', 'metacreativity', 'psychokinesis',
                             'psychometabolism', 'psychoportation', 'telepathy'];

// Scraped discipline prose -> the module's key. The wiki writes "Telepathy (Compulsion)
// [Mind-Affecting]"; the key is the first word, lowercased.
function disciplineKey(raw) {
  const first = String(raw || '').trim().split(/[\s([]/)[0].toLowerCase();
  return PSIONIC_DISCIPLINES.includes(first) ? first : 'athanatism';
}

// "Auditory and visual" / "Material, Mental" -> the module's five display booleans.
function displayFlags(raw) {
  const s = String(raw || '').toLowerCase();
  const has = k => s.includes(k);
  return { auditory: has('auditory'), material: has('material'), mental: has('mental'),
           olfactory: has('olfactory'), visual: has('visual') };
}

// The manifester entries that get a pf1-psionics book, in payload order. Two kinds are filtered
// out and both are legitimate: the soulknife carries an entry with no key ability (it manifests
// nothing — its mind blade is a weapon, not a subsystem), and a manifester whose key ability
// failed the score gate reads all zeroes. The aegis DOES get one: power points, no powers.
function manifestingBooks() {
  return (characterData.manifesters || []).filter(m => m && m.manifesting_stat && m.caster_type);
}

// Write the pf1-psionics manifester book flags. Returns backend class name -> book slot, so the
// power items below can point at the book that granted them.
function configureManifesters(books) {
  const flags = exportTemplate.flags || (exportTemplate.flags = {});
  const psionics = flags['pf1-psionics'] || (flags['pf1-psionics'] = {});
  const manifesters = psionics.manifesters || (psionics.manifesters = {});

  if (books.length > MANIFESTER_SLOTS.length) {
    console.warn(`Psionics: ${books.length} manifesting classes but only ${MANIFESTER_SLOTS.length} pf1-psionics books — dropping ${books.slice(MANIFESTER_SLOTS.length).map(b => b.name).join(', ')}.`);
  }

  const slotFor = new Map();
  for (let s = 0; s < books.length && s < MANIFESTER_SLOTS.length; s++) {
    const book = books[s];
    const slot = MANIFESTER_SLOTS[s];
    const display = book.display || capitalizeWords(book.name || '');
    const classItem = (exportTemplate.items || []).find(i => i.type === 'class' && i.name === display);
    const tag = classItem?.system?.tag;
    if (!tag) {
      // pf1-psionics derives power points from book.cl.classLevelTotal, which needs this tag. A
      // miss reads as zero points with no error anywhere, so it gets said out loud here.
      console.warn(`Psionics: no class item tag for "${display}" — its power points will read 0.`);
    }
    manifesters[slot] = Object.assign({}, manifesters[slot], {
      inUse: true,               // <- the whole condition pf1-psionics gates its tab on
      name: display,
      class: tag || book.name,
      casterType: book.caster_type,
      ability: book.manifesting_stat,
      autoLevelPowerPoints: true,
      autoAttributePowerPoints: true,
      autoMaxPowerLevel: true,
    });
    slotFor.set(book.name, slot);
    console.log(`Manifester ${slot} <- ${display} (${book.caster_type}, ${book.manifesting_stat}, ML ${book.manifester_level}, ${book.pp_per_day} pp)`);
  }

  const pp = books.slice(0, MANIFESTER_SLOTS.length)
    .reduce((sum, b) => sum + (Number(b.pp_per_day) || 0), 0);
  psionics.powerPoints = Object.assign({}, psionics.powerPoints, { current: pp, temporary: 0 });
  return slotFor;
}

// Full pf1-psionics.power item from a powers_desc_dict entry (field set mirrors the module's
// PowerModel). Used only when the powers pack has no name match.
function synthesizePowerItem(name, d, slot, level) {
  const header = `<p><strong>${d.discipline || ''}${level ? ` ${level}` : ''}</strong></p>`;
  const meta = [['manifesting time', 'Manifesting Time'], ['range', 'Range'],
                ['duration', 'Duration'], ['saving throw', 'Saving Throw'],
                ['power resistance', 'Power Resistance'], ['power points', 'Power Points']]
    .filter(([k]) => d[k]).map(([k, label]) => `<p><em>${label}:</em> ${d[k]}</p>`).join('');
  const body = d.text ? `<hr>${String(d.text).split(/\n{2,}/).map(p => `<p>${p}</p>`).join('')}` : '';
  const augment = d.augment ? `<hr><p><em>Augment:</em> ${d.augment}</p>` : '';
  const timeMatch = String(d['manifesting time'] || '').toLowerCase()
    .match(/\b(swift|immediate|standard|move|full)\b/);
  return {
    name,
    type: "pf1-psionics.power",
    img: "icons/svg/daze.svg",
    system: {
      description: { value: header + meta + body + augment },
      discipline: disciplineKey(d.discipline),
      subdiscipline: [], descriptors: [],
      level: Number(level) || 0,
      manifester: slot,
      manifestTime: { value: 1, units: timeMatch ? timeMatch[1] : "standard" },
      display: displayFlags(d.display),
      modifiers: { cl: 0, sl: 0 },
      known: true,
      prepared: false,
      // "No" / "None" mean the power ignores power resistance; the module's default is true.
      sr: !/^\s*(no|none)\b/i.test(String(d['power resistance'] || '')),
      showInCombat: true,
      actions: [], changes: [], contextNotes: [], sources: [],
      // The rest of pf1-psionics' PowerModel, filled with the defaults all 593 pack documents
      // share. A synthesized power used to be missing these, which made it structurally different
      // from a native one -- and one of them is not cosmetic: `uses.autoDeductChargesCost` is the
      // formula that spends power points when the power is manifested, so a gap-filled power was
      // free to cast. The pack is missing "Suppress Veil" and "Malefic Metamorphosis" outright, so
      // this path is the only thing standing between those powers and a broken sheet.
      attackNotes: [], effectNotes: [], scriptCalls: [], tags: [],
      links: { children: [] },
      // pf1's own boolean/dictionary flag bags, which live INSIDE system. The item-level `flags`
      // below is Foundry's module bag and a different thing -- every pack document carries
      // `{"pf1-psionics": {sourceUrl: ...}}` there, which a synthesized power has no URL for.
      flags: { boolean: {}, dictionary: {} },
      // Deliberately empty: `learnedAt` drives the "which class can learn this at what level" UI,
      // and the power is already granted and known here.
      learnedAt: { class: {} },
      uses: { autoDeductChargesCost: "max(0, @sl * 2 - 1)" },
    },
    effects: [], flags: {},
  };
}

// Pre-pf1-psionics fallback: powers as plain feat items under a divider, plus one per-class power
// point pool so the number the backend computed is still on the sheet somewhere.
async function legacyProcessPsionicsFeats(books) {
  const descs = characterData.powers_desc_dict || {};
  await appendFeatDivider(ctx, "__________________Psionics______________", 4200, 'feat');

  const items = [];
  for (const book of books) {
    const display = book.display || capitalizeWords(book.name || '');
    // The power point pool: a flat maxFormula, not a @classes.<tag>.level expression, because
    // power points are a published table plus an ability formula, not a per-level slope.
    const pool = synthesizeFeatItem(`Power Points (${display})`,
      `<p>Power points per day for ${display} at manifester level ${book.manifester_level}.</p>`,
      "systems/pf1/icons/skills/blue_36.jpg");
    pool.system.uses = { value: Number(book.pp_per_day) || 0, per: "day",
                         maxFormula: String(Number(book.pp_per_day) || 0),
                         autoDeductChargesCost: "", rechargeFormula: "" };
    items.push(pool);

    (book.powers_by_level || []).forEach((bucket, level) => {
      for (const name of bucket) {
        const d = descs[name] || {};
        const header = `<p><strong>${d.discipline || ''} power ${level}</strong></p>`;
        const meta = ['manifesting time', 'range', 'duration', 'saving throw', 'power points']
          .filter(k => d[k]).map(k => `<p><em>${capitalizeWords(k)}:</em> ${d[k]}</p>`).join('');
        const body = d.text ? `<hr><p>${d.text}</p>` : '';
        items.push(synthesizeFeatItem(`${name} (Power ${level})`, header + meta + body,
                                      "icons/svg/daze.svg"));
      }
    });
  }
  assignSequentialSort(items, 4210);
  appendJsonToTemplate(items, exportTemplate, 'Psionics');
  console.log(`Psionics (legacy): injected ${items.length} power/pool feat items.`);
}

async function processPsionics() {
  try {
    const books = manifestingBooks();
    if (!books.length) return;   // non-manifesters and old payloads: no psionics at all

    if (!game.modules.get('pf1-psionics')?.active) {
      console.warn('Psionics: pf1-psionics module inactive — falling back to legacy feat items.');
      return legacyProcessPsionicsFeats(books);
    }

    const slotFor = configureManifesters(books);
    const descs = characterData.powers_desc_dict || {};

    // One-shot compendium load keyed by normalized name. powNorm also folds the curly apostrophe,
    // which this pack genuinely mixes: "Artificer's Surge" (U+2019) sits beside "Reaper's Blade".
    let packDocs = new Map();
    try {
      const pack = game.packs.get('pf1-psionics.powers');
      if (pack) {
        const docs = await pack.getDocuments();
        packDocs = new Map(docs.map(doc => [powNorm(doc.name), doc]));
      } else {
        console.warn('Psionics: pf1-psionics.powers pack not found — synthesizing all items.');
      }
    } catch (e) {
      console.warn('Psionics: could not read pf1-psionics.powers — synthesizing all items.', e);
    }

    const items = [];
    let misses = 0;
    for (const book of books) {
      const slot = slotFor.get(book.name);
      if (!slot) continue;   // dropped for want of a book slot; already warned about
      // powers_by_level is the only record of which power sits at which level: the description
      // entry keys its levels by power LIST ("psion/wilder"), not by class.
      (book.powers_by_level || []).forEach((bucket, level) => {
        for (const name of bucket) {
          const d = descs[name] || {};
          const doc = packDocs.get(powNorm(name));
          if (doc) {
            const item = doc.toObject();
            delete item._id;            // fresh embedded id on actor creation
            item.system = item.system || {};
            item.system.manifester = slot;
            item.system.known = true;
            item.system.level = level;  // the level THIS class learns it at
            items.push(item);
          } else {
            misses++;
            console.warn(`Psionics: "${name}" not in pf1-psionics.powers — synthesizing from backend data.`);
            items.push(synthesizePowerItem(name, d, slot, level));
          }
        }
      });
    }

    assignSequentialSort(items, 4210);
    appendJsonToTemplate(items, exportTemplate, 'Psionics');
    console.log(`Psionics: ${books.length} manifester book(s), ${items.length} native pf1-psionics.power items (${misses} synthesized).`);
  } catch (error) {
    console.error('Error processing the Psionics section:', error);
  }
}

await processPsionics();
// ----- End of Psionics Section ----- //

// ------ End of Feat/Trait Section ------ //

addStatBuffs(ctx);
addCustomBuffs(ctx);



   // ----- Spells ----- //
   // Riders attach to spell items, so they run after the books are filled.
   await addSpells(ctx);
   await addSpellRiders(ctx);


// ----- Equipment ----- //
// HAZARD: everything below that touches the weapon finds it with findMainWeapon(ctx) and
// warn-and-returns when there is none. Nothing that attaches to the weapon may run before this.
await addEquipment(ctx);

// ----- Attack toggles ----- //
// HAZARD: after equipment (they warn-and-return without a weapon), and before the attack twin is
// cloned below -- the clone has to inherit what these attach.
await addAttackToggles(ctx);

// ----- Spheres of Power / Might: talent conditionals + a Destructive Blast ----- //
// Each attack-relevant sphere talent (curated in combat_talent_conditionals.json /
// magic_talent_conditionals.json, nested {Sphere:{Talent:{modifiers,rider,default?}}}) becomes a
// conditional toggle: Might talents + non-Destruction Power talents on the main weapon's attack
// action, Destruction blast-type/shape talents on a synthesized "Destructive Blast" attack item.
// Mirrors addManeuverConditionals — clean numbers are structured modifiers (auto source-labeled),
// saves/conditions/durations ride the conditional NAME with [[ ]] inline rolls. Runs after the weapon
// exists (processEquipment) and BEFORE createScalingAttackItem (so the scaling clone inherits them).
//
// These are DABBLING NPCs (Spheres via feats, not a spherecasting class), so the sphere roll-data
// tokens are substituted to CONCRETE forms here: @spheres.cam/@spheres.pam -> @abilities.<mod>.mod, and
// @spheres.cl.total -> a LIVE, tier-accurate sphere caster level built from the character's real caster
// classes (see sphereCLExpr). (The importable palette actor keeps the native @spheres.* tokens instead,
// so a conditional copied off it scales on a real spherecasting PC via pf1spheres.)
function sphereWordToAbbrev(w) {
  const m = { intelligence: 'int', wisdom: 'wis', charisma: 'cha', int: 'int', wis: 'wis', cha: 'cha' };
  return m[String(w || '').toLowerCase()] || '';
}
function resolveSphereAbilities() {
  const trad = characterData.casting_tradition || {};
  const cam = sphereWordToAbbrev(trad.casting_ability_modifier) || resolveInitStat(ctx);
  const pam = 'wis';   // Spheres: a non-practitioner's practitioner modifier defaults to Wis
  return { cam, pam };
}
// Build the live sphere-CL expression for a dabbler: caster levels from multiple casting classes STACK
// (Spheres RAW), each contributing its tier fraction of that class's level -- high = level, mid (pf1
// 'med') = 3/4, low = 1/2 (Pathfinder rounds down). Uses @classes.<tag>.level (class level, not the
// spellbook CL) so a low caster contributes before it gains spells (e.g. paladin 3 -> floor(3/2)=1).
// Floored to 1 so a magic dabbler with no populated spellbook (e.g. kineticist) still reads CL 1.
function sphereCLExpr() {
  const books = exportTemplate.system?.attributes?.spells?.spellbooks || {};
  const terms = ['primary', 'secondary', 'tertiary']
    .map(s => books[s]).filter(b => b && b.inUse && b.class)
    .map(b => {
      const lvl = `@classes.${b.class}.level`;
      if (b.casterType === 'high') return lvl;
      if (b.casterType === 'med') return `floor(3 * ${lvl} / 4)`;
      return `floor(${lvl} / 2)`;   // 'low' (and any unrecognized tier -> conservative half)
    });
  return `max(${terms.join(' + ') || '0'}, 1)`;
}
function makeSubSpheres(cam, pam) {
  const clExpr = sphereCLExpr();
  return s => String(s == null ? '' : s)
    .replaceAll('@spheres.cl.total', clExpr)
    .replaceAll('@spheres.cam', `@abilities.${cam}.mod`)
    .replaceAll('@spheres.pam', `@abilities.${pam}.mod`);
}
// Mark the generated actor as a spheres caster/practitioner (castingAbility/practitionerAbility drive
// @spheres.cam/@spheres.pam on the pf1spheres tab + talent-sheet DCs) and stamp the dabbler's live,
// tier-accurate caster level (sphereCLExpr) onto the "Spheres Casting" summary feat so the pf1spheres
// tab CL matches the talent/blast DCs. Harmless when the pf1spheres module is disabled.
function applySpheresFlags(cam, pam) {
  const hasMagic = Array.isArray(characterData.magic_talent_items) && characterData.magic_talent_items.length;
  const hasCombat = Array.isArray(characterData.combat_talent_items) && characterData.combat_talent_items.length;
  if (!hasMagic && !hasCombat) return;
  exportTemplate.flags = exportTemplate.flags || {};
  const f = Object.assign({}, exportTemplate.flags.pf1spheres);
  if (hasMagic) f.castingAbility = cam;
  f.practitionerAbility = pam;
  exportTemplate.flags.pf1spheres = f;
  if (hasMagic) {
    const feat = (exportTemplate.items || []).find(i =>
      i.type === 'feat' && typeof i.name === 'string' && i.name.startsWith('Spheres Casting'));
    if (feat) {
      feat.system = feat.system || {};
      const ch = Array.isArray(feat.system.changes) ? feat.system.changes : [];
      if (!ch.some(c => c && c.target === 'spherecl')) {
        ch.push({ _id: ctx.newChangeId('spherecl'), formula: sphereCLExpr(), target: 'spherecl', type: 'untyped', operator: 'add', priority: 0, value: 0 });
        feat.system.changes = ch;
      }
    }
  }
}

// Synthesize a "Destructive Blast" attack item (Destruction sphere base ability): a touch attack whose
// base damage scales (ceil(@spheres.cl.total/2))d6 -> 1d6 for a CL-1 dabbler. Blast-type/shape talents
// attach as conditionals via addSphereTalentConditionals; the spell-point boost rides here as a
// built-in toggle. Cloned from the main weapon so the pf1 v11 action schema is guaranteed valid.
async function addDestructiveBlastAttack(subSpheres) {
  try {
    const chosen = characterData.spheres_chosen || [];
    const magic = characterData.magic_talent_items || [];
    const hasDestruction =
      chosen.some(s => s && String(s.sphere).toLowerCase() === 'destruction'
        && String(s.system || '').toLowerCase().startsWith('p'))
      || magic.some(t => t && String(t.sphere).toLowerCase() === 'destruction');
    if (!hasDestruction) return;
    const weapon = findMainWeapon(ctx);
    if (!weapon) { console.warn('Spheres: no weapon to base the Destructive Blast on.'); return; }
    const blast = structuredClone(weapon);
    blast.type = 'attack';
    blast._id = ctx.newId('attack', 'Destructive Blast');
    blast.name = 'Destructive Blast';
    blast.flags = {};
    blast.system = blast.system || {};
    blast.system.description = { value: '<p><strong>Destructive Blast</strong> (Destruction sphere) &mdash; a ranged or melee touch attack within close range (25 ft + 5 ft / 2 caster levels), subject to spell resistance. Deals <strong>(ceil(CL/2))d6</strong> bludgeoning by default (1d6 for a caster-level-1 dabbler). Blast-type talents (Fire/Frost/Acid/&hellip;) change the damage type and add a save rider; blast-shape talents change the delivery; toggle "Empowered Blast" to spend a spell point for one die per caster level.</p>' };
    const action = (blast.system.actions || [])[0];
    if (!action) { console.warn('Spheres: cloned weapon has no action for the blast.'); return; }
    action._id = ctx.newId('action', 'Destructive Blast');
    action.name = 'Destructive Blast';
    action.actionType = 'rwak';
    action.ability = Object.assign({}, action.ability, { attack: 'dex', damage: '', damageMult: 0 });
    action.damage = action.damage || {};
    action.damage.parts = [{ formula: subSpheres('(ceil(@spheres.cl.total / 2))d6'), types: ['bludgeoning'] }];
    action.damage.critParts = [];
    action.damage.nonCritParts = [];
    action.conditionals = [{
      _id: (ctx.newId('conditional', 'Empowered Blast')).slice(0, 8),
      name: '(Destruction) Empowered Blast: spend [[1]] spell point — blast dice increase to one die per caster level',
      default: false,
      modifiers: [{
        _id: (ctx.newId('modifier', 'Empowered Blast')).slice(0, 8),
        formula: subSpheres('(floor(@spheres.cl.total / 2))d6') + '[Empowered Blast]',
        target: 'damage', subTarget: 'allDamage', type: 'untyped', damageType: ['bludgeoning'], critical: 'nonCrit',
      }],
    }];
    appendJsonToTemplate([blast], exportTemplate, 'Attack');
    console.log('Spheres: added Destructive Blast attack item.');
  } catch (error) {
    console.error('Error adding Destructive Blast:', error);
  }
}

async function addSphereTalentConditionals(subSpheres) {
  try {
    const combat = characterData.combat_talent_items || [];
    const magic = characterData.magic_talent_items || [];
    if (!combat.length && !magic.length) return;
    // Nested {Sphere:{Talent:{...}}} -> byNorm[sphereNorm(sphere)][sphereNorm(talent)].
    const buildByNorm = table => {
      const out = {};
      for (const [sph, talents] of Object.entries(table || {})) {
        if (!talents || typeof talents !== 'object') continue;
        const key = sphereNorm(sph);
        out[key] = out[key] || {};
        for (const [tname, entry] of Object.entries(talents)) out[key][sphereNorm(tname)] = entry;
      }
      return out;
    };
    const combatByNorm = buildByNorm(templates.combatTalentConditionals);
    const magicByNorm = buildByNorm(templates.magicTalentConditionals);

    const weapon = findMainWeapon(ctx);
    const weaponAction = weapon && (weapon.system?.actions || [])[0];
    const blast = (exportTemplate.items || []).find(i => i.type === 'attack' && i.name === 'Destructive Blast');
    const blastAction = blast && (blast.system?.actions || [])[0];

    // This is the caller that decides its target action PER TALENT rather than per batch, which is
    // why the engine takes the action on the entry. Collect combat then magic in payload order and
    // hand the interleaved list over as one batch: grouping the Destruction talents together first
    // would produce the same two arrays but mint their ids in a different order, and the ids are
    // content-derived so that this merge could be read as a diff.
    const entries = [];
    const collect = (items, byNorm, isMagic) => {
      for (const t of items) {
        if (!t) continue;
        const sKey = sphereNorm(t.sphere || '');
        const entry = (byNorm[sKey] || {})[sphereNorm(t.name || '')];
        if (!entry) continue;
        const rider = typeof entry.rider === 'string' ? entry.rider.trim() : '';
        const hasMods = Array.isArray(entry.modifiers) && entry.modifiers.length;
        if (!rider && !hasMods) continue;
        entries.push({
          // Destruction Power talents ride the Destructive Blast item; everything else the main
          // weapon. A talent whose target does not exist (no blast built, no weapon) is skipped.
          action: (isMagic && sKey === 'destruction') ? blastAction : weaponAction,
          name: rider ? `(${t.sphere}) ${t.name}: ${subSpheres(rider)}` : `(${t.sphere}) ${t.name}`,
          default: entry.default === true,
          modifiers: entry.modifiers,
          label: t.name,
        });
      }
    };
    collect(combat, combatByNorm, false);
    collect(magic, magicByNorm, true);
    const added = attachConditionals(ctx, entries, { sub: subSpheres });
    console.log(`Spheres: attached ${added} talent conditional(s).`);
  } catch (error) {
    console.error('Error attaching sphere talent conditionals:', error);
  }
}
// Affects-others sphere talents (ally/companion/aura recipients) -> inactive temp buffs the player
// distributes with the Multi-Buff Distributor macro. Named "<Talent> (TAG)" where TAG is the first 5
// letters of the NPC's name (uppercased, stopping at the first non-letter; UNAMED fallback). Markers
// "Aura Range: N" / "onlyOthers;" ride the description. See the multi-buff-distributor skill.
function deriveBuffTag(name) {
  const m = String(name || '').match(/[A-Za-z]{1,5}/);
  return m ? m[0].toUpperCase() : 'UNAMED';
}
async function addSphereAuraBuffs(subSpheres) {
  try {
    const table = templates.talentAuraBuffs;
    if (!table || typeof table !== 'object') return;
    const combat = characterData.combat_talent_items || [];
    const magic = characterData.magic_talent_items || [];
    if (!combat.length && !magic.length) return;
    const byNorm = {};
    for (const [sph, tals] of Object.entries(table)) {
      if (!tals || typeof tals !== 'object') continue;
      const k = sphereNorm(sph); byNorm[k] = byNorm[k] || {};
      for (const [tn, e] of Object.entries(tals)) byNorm[k][sphereNorm(tn)] = e;
    }
    const tag = deriveBuffTag(characterData.character_full_name);
    const buffs = [];
    const seen = new Set();
    for (const t of [...combat, ...magic]) {
      if (!t) continue;
      const e = (byNorm[sphereNorm(t.sphere || '')] || {})[sphereNorm(t.name || '')];
      if (!e) continue;
      const key = sphereNorm(t.name || '');
      if (seen.has(key)) continue;
      seen.add(key);
      const parts = [];
      if (e.aura_range != null && e.aura_range !== '' && e.aura_range !== 0) parts.push(`<p>Aura Range: ${e.aura_range}</p>`);
      if (e.only_others) parts.push('<p>onlyOthers;</p>');
      if (e.description) parts.push(`<p>${subSpheres(e.description)}</p>`);
      const changes = (Array.isArray(e.changes) ? e.changes : []).map(ch => Object.assign(
        { formula: '0', target: '', type: 'untyped', operator: 'add', priority: 0, value: 0 },
        ch, { formula: subSpheres(String(ch.formula ?? '0')), _id: ctx.newChangeId(ch) }));
      buffs.push({
        name: `(${tag}) ${t.name}`, type: 'buff', img: 'icons/svg/aura.svg',
        system: {
          description: { value: parts.join(''), instructions: '', unidentified: '' },
          tags: [], changes, changeFlags: {}, contextNotes: Array.isArray(e.contextNotes) ? e.contextNotes : [],
          actions: [], attackNotes: [], effectNotes: [],
          uses: { value: null, per: '', autoDeductChargesCost: '', maxFormula: '', rechargeFormula: '' },
          links: { children: [] }, tag: '', flags: { boolean: {}, dictionary: {} }, scriptCalls: [],
          subType: 'temp', active: false, level: 0, duration: { value: '', units: '' },
          conditions: [], hideFromToken: false, showInQuickbar: false,
        }, effects: [], flags: {},
      });
    }
    if (!buffs.length) return;
    const divider = {
      name: '____________________ Spheres — shared / aura buffs ____________________',
      type: 'buff', img: 'icons/svg/book.svg',
      system: {
        description: { value: '<p>Toggle and run the Multi-Buff Distributor to share these with allies / apply auras.</p>' },
        tags: [], changes: [], changeFlags: {}, contextNotes: [], actions: [], attackNotes: [], effectNotes: [],
        uses: { value: null, per: '', autoDeductChargesCost: '', maxFormula: '', rechargeFormula: '' },
        links: { children: [] }, tag: '', flags: { boolean: {}, dictionary: {} }, scriptCalls: [],
        subType: 'temp', active: false, level: 0, duration: { value: '', units: '' },
        conditions: [], hideFromToken: true, showInQuickbar: false,
      }, effects: [], flags: {},
    };
    const all = [divider, ...buffs];
    assignSequentialSort(all, 4300);
    appendJsonToTemplate(all, exportTemplate, 'SphereAuraBuffs');
    console.log(`Spheres: injected ${buffs.length} affects-others buff(s) tagged (${tag}).`);
  } catch (error) {
    console.error('Error adding sphere aura buffs:', error);
  }
}
// Every buff spell the NPC KNOWS -> an inactive distributable temp buff "<Spell> (TAG)" (parsed from
// spell_buffs.json). Toggle + Multi-Buff Distributor shares it with allies (even Personal/Self spells).
async function addSpellBuffs() {
  try {
    const table = templates.spellBuffs;
    if (!table || typeof table !== 'object') return;
    const known = [];
    for (const lvl of (characterData.spell_list_choose_from || [])) {
      for (const s of (lvl || [])) if (s) known.push(String(s));
    }
    if (!known.length) return;
    const byLower = {};
    for (const [k, v] of Object.entries(table)) byLower[k.toLowerCase()] = { name: k, entry: v };
    const tag = deriveBuffTag(characterData.character_full_name);
    // Aura Range = the spell's range as a concrete number of feet at the NPC's caster level (close/
    // medium/long conventions). Distributor reads this integer. One CL for the whole table: these
    // spells come from the flat spell_list_choose_from with no per-book attribution, so a single
    // combined CL is the (deliberate) approximation -- but it is now the REAL homebrew combined CL
    // (spellCasterLevelNum) rather than characterData.level, which is only the PRIMARY class's level
    // and sized a Monk 8 / Summoner 7 / Wizard 5's auras at CL 8 instead of 12.
    const cl = spellCasterLevelNum(ctx);
    const spellAuraRange = (units, value) => {
      switch (units) {
        case 'personal': return 0;
        case 'touch': return 5;
        case 'close': return 25 + 5 * Math.floor(cl / 2);
        case 'medium': return 100 + 10 * cl;
        case 'long': return 400 + 40 * cl;
        case 'ft': return Number(value) || 0;
        case 'mi': return (Number(value) || 1) * 5280;
        default: return 0;
      }
    };
    const mkBuff = (name, descHtml, changes, hide, notes) => ({
      name, type: 'buff', img: hide ? 'icons/svg/book.svg' : 'icons/svg/aura.svg',
      system: {
        description: { value: descHtml, instructions: '', unidentified: '' },
        tags: [], changes: changes || [], changeFlags: {}, contextNotes: Array.isArray(notes) ? notes : [],
        actions: [], attackNotes: [], effectNotes: [],
        uses: { value: null, per: '', autoDeductChargesCost: '', maxFormula: '', rechargeFormula: '' },
        links: { children: [] }, tag: '', flags: { boolean: {}, dictionary: {} }, scriptCalls: [],
        subType: 'spell', active: false, level: 0, duration: { value: '', units: '' },
        conditions: [], hideFromToken: !!hide, showInQuickbar: false,
      }, effects: [], flags: {},
    });
    // Bucket the known buff spells by duration (rounds/minutes/hours/other).
    const buckets = { rounds: [], minutes: [], hours: [], other: [] };
    const seen = new Set();
    for (const nm of known) {
      const hit = byLower[nm.toLowerCase()];
      if (!hit || seen.has(hit.name)) continue;
      seen.add(hit.name);
      const e = hit.entry || {};
      // Unplaced-only spells (no changes, no contextNotes — just unanchored effect text) stay in
      // spell_buffs.json as reference data but get NO buff item: they only bulk up the Buffs tab.
      const hasMechanics = (Array.isArray(e.changes) && e.changes.length)
        || (Array.isArray(e.contextNotes) && e.contextNotes.length);
      if (!hasMechanics) continue;
      (buckets[e.duration_bucket] || buckets.other).push({ name: hit.name, e });
    }
    const BUCKET_LABELS = [['rounds', 'rounds'], ['minutes', 'minutes'], ['hours', 'hours'], ['other', 'other durations']];
    const all = [];
    let count = 0;
    for (const [key, label] of BUCKET_LABELS) {
      const rows = buckets[key];
      if (!rows.length) continue;
      all.push(mkBuff(`____________________ ${label} ____________________`,
        `<p>Buff spells you know with a <strong>${label}</strong> duration &mdash; toggle + Multi-Buff Distributor (even Personal/Self spells).</p>`, [], true));
      rows.sort((a, b) => ((a.e.level ?? 99) - (b.e.level ?? 99)) || a.name.localeCompare(b.name));
      for (const { name, e } of rows) {
        const parts = [`<p>Aura Range: ${spellAuraRange(e.range_units, e.range_value)}</p>`];  // always first line
        if (e.only_others) parts.push('<p>onlyOthers;</p>');
        if (e.description) parts.push(String(e.description));   // pre-formatted spell stat-block HTML, raw
        const changes = (Array.isArray(e.changes) ? e.changes : []).map(ch => Object.assign(
          { formula: '0', target: '', type: 'untyped', operator: 'add', priority: 0, value: 0 },
          ch, { _id: ctx.newChangeId(ch) }));
        const title = `(${tag}) ${name}` + (e.level != null ? ` (level ${e.level})` : '');
        all.push(mkBuff(title, parts.join(''), changes, false, e.contextNotes));
        count++;
      }
    }
    if (!count) return;
    assignSequentialSort(all, 4400);
    appendJsonToTemplate(all, exportTemplate, 'SpellBuffs');
    console.log(`Spells: injected ${count} distributable spell buff(s) tagged (${tag}), grouped by duration.`);
  } catch (error) {
    console.error('Error adding spell buffs:', error);
  }
}
{
  const { cam, pam } = resolveSphereAbilities();
  const subSpheres = makeSubSpheres(cam, pam);
  applySpheresFlags(cam, pam);
  await addDestructiveBlastAttack(subSpheres);
  await addSphereTalentConditionals(subSpheres);
  await addSphereAuraBuffs(subSpheres);
}
await addSpellBuffs();

// ----- Weapon finishing ----- //
// HAZARD: the +N stamp inside renames the weapon and its attack twin together, so this whole block
// runs after everything that attaches to the weapon and after the twin exists.
await addWeaponFinishing(ctx);
// ----- Ammo ----- //
// Reads the weapon the equipment stage recorded, so it cannot move above it.
await addAmmo(ctx);


// ----- Skills ----- //
await addSkills(ctx);


normalizeTraitShapes(ctx);

// Rewriting the export file directly (with export template)
console.log("About to write exportFoundryPath to localStorage");
console.log("exportTemplate exists:", !!exportTemplate);
console.log("exportTemplate:", exportTemplate);

if (exportTemplate) {
  writeExportPath(exportTemplate);
  console.log("Successfully wrote exportFoundryPath to localStorage");
} else {
  console.error("exportTemplate is undefined! Cannot write to localStorage.");
  console.log("Available template names:", Object.keys(templates));
}

// ----- End of Skills Section ----- //

if (!exportTemplate) return false;
return true;


} catch (error) {
   console.error("Error in main function:", error);
   // Report failure: the caller must NOT build an actor, or it would inject whatever
   // exportFoundryPath the previous run left in localStorage (a stale character sheet).
   ui.notifications?.error(`Character Generator: character build failed (${error.message}). No character was created.`);
   return false;
 }
}