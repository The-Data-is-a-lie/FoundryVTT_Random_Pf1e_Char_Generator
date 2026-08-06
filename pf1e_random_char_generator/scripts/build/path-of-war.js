/**
 * Path of War — maneuvers, stances and disciplines as native pf1-pow items.
 *
 * The backend picks the maneuvers and computes the numbers; pf1-pow renders them. Every known
 * maneuver becomes a `pf1-pow.maneuver` item, cloned from the `pf1-pow.disciplines` compendium when
 * the name matches (clean text, real icons, save data) and synthesized from the backend's own
 * `maneuvers_desc_dict` when it does not. Stances additionally become inactive temporary buffs under
 * their own divider.
 *
 * `legacyProcessPathOfWarFeats` is the fallback for a world with pf1-pow disabled: maneuvers as plain
 * feat items. It is still reachable, and its name says exactly what it is.
 *
 * What stayed out of this module, deliberately:
 *   - `powNorm` (shared/text.js) — its comment records a real shipped bug, twelve pf1-pow documents
 *     with double-encoded apostrophes that the harness caught, and it travels with the function.
 *   - `resolveInitStat` / `maneuverInitAttr` / `capitalizeManeuverType` (build/initiation.js) — the
 *     attack toggles and Spheres read the same answers and all three have to agree.
 *   - `addFeatSeparator` (build/feats.js) — the legacy path lays a feats-section divider with it.
 *
 * `powDisplayName` is the display half of powNorm's defect and has no reader outside this stage, so
 * it stays here rather than joining it in shared/.
 */
import { appendJsonToTemplate, synthesizeFeatItem, assignSequentialSort } from './items.js';
import { addFeatSeparator } from './feats.js';
import { capitalizeManeuverType, resolveInitStat, maneuverInitAttr } from './initiation.js';
import { powNorm } from '../shared/text.js';

// The display half of the same defect (see powNorm in shared/text.js). Matching a corrupted compendium name is only half a fix: the
// clone carries `doc.name` onto the sheet verbatim, so without this a warder's stance reads
// "Turtle Knightâ€™s Stance" in the item list. Repaired rather than stripped -- the apostrophe is
// part of the name, and the sheet should show the name the book prints.
const powDisplayName = (s) => String(s).replace(/â€™/g, '’');

// Full pf1-pow.maneuver item from the backend's maneuvers_desc_dict entry (field set mirrors a
// pf1-pow.disciplines compendium export). Used only when the compendium has no name match.
function synthesizeManeuverItem(ctx, name, d, isStance, isReadied) {
  const typeCap = capitalizeManeuverType(d.type) || (isStance ? 'Stance' : 'Strike');
  const header = `<p><strong>${d.discipline || ''} ${d.type || 'maneuver'}${d.level ? ` ${d.level}` : ''}</strong></p>`;
  const meta = ['action', 'range', 'duration']
    .filter(k => d[k]).map(k => `<p><em>${k[0].toUpperCase() + k.slice(1)}:</em> ${d[k]}</p>`).join('');
  const body = d.description ? `<hr><p>${d.description}</p>` : '';
  const initMatch = String(d.action || '').toLowerCase().match(/\b(swift|immediate|standard|full)\b/);
  return {
    name: `(${typeCap}) ${name}`,
    type: "pf1-pow.maneuver",
    img: isStance ? "icons/svg/shield.svg" : "icons/svg/sword.svg",
    system: {
      description: { value: header + meta + body },
      discipline: d.discipline || "",
      initTime: { value: 1, units: initMatch ? initMatch[1] : "standard" },
      level: Number(d.level) || 1,
      saveEffect: "See text",
      saveType: "None",
      uses: { per: "", value: isStance || isReadied ? 1 : 0, maxFormula: "1", autoDeductChargesCost: "", rechargeFormula: "" },
      actions: [], changes: [], contextNotes: [], sources: [],
      maneuverType: typeCap,
      ready: !isStance && isReadied,
      granted: false,
      stanceActive: false,
      class: ctx.upperCaseClass,
    },
    effects: [], flags: {},
  };
}

// Martial Training characters (mt_feats non-empty <=> non-initiator with maneuvers): mark the
// class as an archetype initiator and set the global initiating-stat flag. pf1-pow then shows
// the Path of War tab (initLevel > 0) and rolls maneuver DCs off initiatorAttr.
function applyManeuverProgression(ctx) {
  if (!(ctx.characterData.mt_feats || []).length) return;
  const initStat = resolveInitStat(ctx);
  const classItem = (ctx.exportTemplate.items || []).find(i => i.type === 'class' && i.name === ctx.upperCaseClass);
  if (classItem) {
    classItem.system = classItem.system || {};
    classItem.system.maneuverProgression = { classType: 'archetype', type: 'regular', initiatorAttr: initStat };
  } else {
    console.warn(`Path of War: class item "${ctx.upperCaseClass}" not found — maneuverProgression not set.`);
  }
  ctx.exportTemplate.flags = ctx.exportTemplate.flags || {};
  ctx.exportTemplate.flags['pf1-pow'] = { ...(ctx.exportTemplate.flags['pf1-pow'] || {}), maneuverAttr: initStat };
  console.log(`Path of War: archetype maneuverProgression + maneuverAttr "${initStat}" set (Martial Training).`);
}

// Each chosen stance becomes an inactive temporary buff under a "____ Path of War ____" buff
// divider so it can be toggled during play. Mechanical changes/contextNotes come from
// stance_changes.json where curated (IL scaling uses @pow.initLevel with ifelse()/gte();
// pf1 v11 formulas have no JS ternaries); uncurated stances are description-only toggles.
async function addStanceBuffs(ctx, stances, descs, matchedDocs) {
  if (!stances.length) return;
  const stanceChanges = ctx.templates.stanceChanges;
  const changesByNorm = {};
  if (stanceChanges && typeof stanceChanges === 'object') {
    for (const [k, v] of Object.entries(stanceChanges)) changesByNorm[powNorm(k)] = v;
  } else {
    console.warn('Path of War: stance_changes.json missing or invalid — stance buffs will be description-only.');
  }

  const divider = structuredClone(ctx.templates.spacePathOfWarBuffs);
  const buffs = [];
  // Resolve @INITMOD in stance contextNotes, same as addManeuverConditionals does for maneuver riders.
  const stanceInit = maneuverInitAttr(ctx);
  const subInit = s => String(s == null ? '' : s).replaceAll('@INITMOD', `@abilities.${stanceInit}.mod`);
  for (const name of stances) {
    const doc = matchedDocs.get(name);
    const d = descs[name] || {};
    const curated = changesByNorm[powNorm(name)] || {};
    const changes = structuredClone(Array.isArray(curated.changes) ? curated.changes : []);
    for (const ch of changes) {
      if (!ch._id) ch._id = (ctx.newId('change', [name, ch])).slice(0, 8);
    }
    buffs.push({
      name: `(Stance) ${doc ? powDisplayName(doc.name) : name}`,
      type: "buff",
      img: doc?.img || "icons/svg/shield.svg",
      system: {
        description: { value: doc?.system?.description?.value || d.description || "", instructions: "", unidentified: "" },
        tags: [],
        changes,
        changeFlags: {},
        contextNotes: (Array.isArray(curated.contextNotes) ? curated.contextNotes : [])
          .map(n => ({ ...structuredClone(n), text: subInit(n.text) })),
        actions: [], attackNotes: [], effectNotes: [],
        uses: { value: null, per: "", autoDeductChargesCost: "", maxFormula: "", rechargeFormula: "" },
        links: { children: [] },
        tag: "",
        flags: { boolean: {}, dictionary: {} },
        scriptCalls: [],
        subType: "temp",
        active: false,
        level: 0,
        duration: { value: "", units: "" },
        conditions: [],
        hideFromToken: false,
        showInQuickbar: false,
      },
      effects: [], flags: {},
    });
  }
  const all = [divider, ...buffs];
  assignSequentialSort(all, 4000);   // divider 4000, stance buffs 4010+ (Buffs tab "temp" section)
  appendJsonToTemplate(all, ctx.exportTemplate, 'PathOfWarBuffs');
  console.log(`Path of War: injected ${buffs.length} stance buff(s) under the buff divider.`);
}

// Pre-pf1-pow fallback: maneuvers/stances as plain feat items under a feats-section divider
// (subType "combatTalent" on the modded sheet, "martialDiscipline" otherwise).
async function legacyProcessPathOfWarFeats(ctx) {
  const known = (ctx.characterData.maneuvers_choose_from || []).flat();
  const stances = ctx.characterData.stances_chosen || [];
  const readied = new Set((ctx.characterData.maneuvers_readied_names || []).flat());
  const descs = ctx.characterData.maneuvers_desc_dict || {};
  const powSubType = (modded === "y") ? "combatTalent" : "martialDiscipline";

  await addFeatSeparator(ctx, 'spacePathOfWar', 'space_function', 4000);

  const items = [];
  for (const name of [...known, ...stances]) {
    const d = descs[name] || {};
    const isStance = String(d.type || '').toLowerCase() === 'stance' || stances.includes(name);
    const header = `<p><strong>${d.discipline || ''} ${d.type || 'maneuver'}${d.level ? ` ${d.level}` : ''}</strong></p>`;
    const meta = ['action', 'range', 'duration']
      .filter(k => d[k]).map(k => `<p><em>${k[0].toUpperCase() + k.slice(1)}:</em> ${d[k]}</p>`).join('');
    const body = d.description ? `<hr><p>${d.description}</p>` : '';
    const item = synthesizeFeatItem(isStance ? `${name} (Stance)` : name, header + meta + body,
                                    isStance ? "icons/svg/shield.svg" : "icons/svg/sword.svg");
    item.system.subType = powSubType;
    if (!isStance) {     // every known maneuver carries 1 max charge; readied ones start charged
      item.system.uses = { value: readied.has(name) ? 1 : 0, per: "charges",
                           maxFormula: "1", autoDeductChargesCost: "", rechargeFormula: "" };
    }
    items.push(item);
  }
  assignSequentialSort(items, 4010);
  appendJsonToTemplate(items, ctx.exportTemplate, 'PathOfWar');
  console.log(`Path of War (legacy): injected ${items.length} maneuver/stance feat items (${powSubType}).`);
}

// Native pf1-pow integration. Every known maneuver/stance becomes a pf1-pow.maneuver item —
// cloned from the pf1-pow.disciplines compendium when the name matches (clean text, real
// icons, save data), synthesized from the backend's maneuvers_desc_dict otherwise. Names are
// prefixed "(Strike)/(Boost)/(Counter)/(Stance)"; system.class points at the class item so
// pf1-pow's Path of War tab groups them under the class; readied maneuvers start ready with a
// charge. Martial Training (non-initiator) characters additionally get
// system.maneuverProgression = archetype on their class item plus the pf1-pow maneuverAttr
// actor flag (initiation stat = highest FINAL mental stat, computed by the backend; client
// fallback below for old payloads). Initiator classes are untouched — their every_class.json
// items already carry maneuverProgression, which pf1-pow prefers over the actor flag. Each
// stance also becomes an inactive TEMPORARY buff under a "____ Path of War ____" buff divider
// (addStanceBuffs). With pf1-pow disabled we fall back to the legacy feat items.
export async function addPathOfWar(ctx) {
  try {
    const known = (ctx.characterData.maneuvers_choose_from || []).flat();
    const stances = ctx.characterData.stances_chosen || [];
    if (!known.length && !stances.length) return;   // zero-PoW characters / old payloads: no section

    if (!game.modules.get('pf1-pow')?.active) {
      console.warn('Path of War: pf1-pow module inactive — falling back to legacy feat items.');
      return legacyProcessPathOfWarFeats(ctx);
    }

    const readied = new Set((ctx.characterData.maneuvers_readied_names || []).flat());
    const descs = ctx.characterData.maneuvers_desc_dict || {};
    const stanceSet = new Set(stances);

    // One-shot compendium load (~1000 small docs per generation) keyed by normalized name.
    let packDocs = new Map();
    try {
      const pack = game.packs.get('pf1-pow.disciplines');
      if (pack) {
        const docs = await pack.getDocuments();
        packDocs = new Map(docs.map(doc => [powNorm(doc.name), doc]));
      } else {
        console.warn('Path of War: pf1-pow.disciplines pack not found — synthesizing all items.');
      }
    } catch (e) {
      console.warn('Path of War: could not read pf1-pow.disciplines — synthesizing all items.', e);
    }

    const items = [];
    const matchedDocs = new Map();   // backend name -> compendium doc (reused for stance buffs)
    let misses = 0;
    for (const name of [...known, ...stances]) {
      const d = descs[name] || {};
      const isStance = String(d.type || '').toLowerCase() === 'stance' || stanceSet.has(name);
      const isReadied = readied.has(name);
      const doc = packDocs.get(powNorm(name));
      if (doc) {
        matchedDocs.set(name, doc);
        const item = doc.toObject();
        delete item._id;   // fresh embedded id on actor creation
        // WE outrank the pack on stance-ness. pf1-pow types 17 of its 69 "...Stance" documents as
        // Boost (16) or Strike (1) -- Poisoner's Stance, Battle Dragon's Stance, Skirmisher's Stance
        // and so on -- so deferring to `maneuverType` labelled them "(Boost) Poisoner's Stance" while
        // addStanceBuffs simultaneously built them a "(Stance)" buff. `isStance` is the better
        // source: it comes from the backend's own `stances_chosen` / desc `type`, which is what put
        // the maneuver in the stance list in the first place.
        const typeCap = isStance
          ? 'Stance'
          : (item.system?.maneuverType || capitalizeManeuverType(d.type) || 'Strike');
        item.name = `(${typeCap}) ${powDisplayName(doc.name)}`;
        item.system.class = ctx.upperCaseClass;
        item.system.granted = false;
        item.system.stanceActive = false;
        item.system.ready = !isStance && isReadied;
        if (!isStance) {
          item.system.uses = { ...(item.system.uses || {}), value: isReadied ? 1 : 0, maxFormula: "1" };
        }
        items.push(item);
      } else {
        misses++;
        console.warn(`Path of War: "${name}" not in pf1-pow.disciplines — synthesizing from backend data.`);
        items.push(synthesizeManeuverItem(ctx, name, d, isStance, isReadied));
      }
    }
    assignSequentialSort(items, 4010);   // PoW tab ignores sort; keeps the Items directory tidy
    appendJsonToTemplate(items, ctx.exportTemplate, 'PathOfWar');

    applyManeuverProgression(ctx);
    await addStanceBuffs(ctx, stances, descs, matchedDocs);

    console.log(`Path of War: injected ${items.length} native pf1-pow.maneuver items (${misses} synthesized).`);
  } catch (error) {
    console.error('Error processing the Path of War section:', error);
  }
}
