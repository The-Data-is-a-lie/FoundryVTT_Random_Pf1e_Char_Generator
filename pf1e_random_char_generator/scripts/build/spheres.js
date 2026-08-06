/**
 * Spheres of Power / Might — talent items, talent conditionals, the Destructive Blast, and the
 * distributable buffs.
 *
 * These lived in two halves at opposite ends of the closure: the talent ITEMS were built in the
 * middle of the feats section, and the talent CONDITIONALS three hundred lines later, after the
 * weapon existed. One module now, four entry points, called at the two points in the spine where the
 * halves have to happen:
 *
 *   addSphereTalents      — the pf1spheres talent items, with the feats (they are placed as feats are)
 *   addCastingTradition   — the Casting Traditions trait every NPC carries, at the top of Traits
 *   addSphereConditionals — talent toggles + the Destructive Blast + aura buffs, after the weapon
 *   addSpellBuffs         — the distributable spell buffs
 *
 * **These are DABBLING NPCs** — Spheres through feats, not a spherecasting class — so the sphere
 * roll-data tokens are substituted to concrete forms rather than left native: `@spheres.cam`/`.pam`
 * become `@abilities.<mod>.mod`, and `@spheres.cl.total` becomes a live tier-accurate expression
 * built from the character's real caster classes. The importable palette actor keeps the native
 * tokens instead, so a conditional copied off it still scales on a real spherecasting PC.
 *
 * `addSphereAuraBuffs` and `addSpellBuffs` are distributors, not attachers: they build inactive
 * temporary buffs for the Multi-Buff Distributor macro instead of hanging conditionals on an action,
 * which is why they never belonged with the conditional engine.
 *
 * The `sop` fixture is the coverage for the Power half — the roster's one hand-authored payload,
 * because every backend payload is Might-only. It exercises the Destructive Blast item and the
 * per-talent blast-vs-weapon conditional target.
 */
import {
  appendJsonToTemplate,
  appendFeatDivider,
  synthesizeFeatItem,
  assignSequentialSort,
} from './items.js';
import { findMainWeapon } from './weapon.js';
import { attachConditionals } from './conditional-engine.js';
import { resolveInitStat } from './initiation.js';
import { spellCasterLevelNum } from './spells.js';
import { capitalizeWords, sphereNorm } from '../shared/text.js';

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
async function processSpheres(ctx, magicItems, combatItems, tradition, manaPool, startingSort = 4210) {
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
  appendJsonToTemplate(built, ctx.exportTemplate, "Feat");
  console.log(`Spheres: injected ${built.length} item(s) (${misses} synthesized).`);
}

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
function resolveSphereAbilities(ctx) {
  const trad = ctx.characterData.casting_tradition || {};
  const cam = sphereWordToAbbrev(trad.casting_ability_modifier) || resolveInitStat(ctx);
  const pam = 'wis';   // Spheres: a non-practitioner's practitioner modifier defaults to Wis
  return { cam, pam };
}
// Build the live sphere-CL expression for a dabbler: caster levels from multiple casting classes STACK
// (Spheres RAW), each contributing its tier fraction of that class's level -- high = level, mid (pf1
// 'med') = 3/4, low = 1/2 (Pathfinder rounds down). Uses @classes.<tag>.level (class level, not the
// spellbook CL) so a low caster contributes before it gains spells (e.g. paladin 3 -> floor(3/2)=1).
// Floored to 1 so a magic dabbler with no populated spellbook (e.g. kineticist) still reads CL 1.
function sphereCLExpr(ctx) {
  const books = ctx.exportTemplate.system?.attributes?.spells?.spellbooks || {};
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
function makeSubSpheres(ctx, cam, pam) {
  const clExpr = sphereCLExpr(ctx);
  return s => String(s == null ? '' : s)
    .replaceAll('@spheres.cl.total', clExpr)
    .replaceAll('@spheres.cam', `@abilities.${cam}.mod`)
    .replaceAll('@spheres.pam', `@abilities.${pam}.mod`);
}
// Mark the generated actor as a spheres caster/practitioner (castingAbility/practitionerAbility drive
// @spheres.cam/@spheres.pam on the pf1spheres tab + talent-sheet DCs) and stamp the dabbler's live,
// tier-accurate caster level (sphereCLExpr) onto the "Spheres Casting" summary feat so the pf1spheres
// tab CL matches the talent/blast DCs. Harmless when the pf1spheres module is disabled.
function applySpheresFlags(ctx, cam, pam) {
  const hasMagic = Array.isArray(ctx.characterData.magic_talent_items) && ctx.characterData.magic_talent_items.length;
  const hasCombat = Array.isArray(ctx.characterData.combat_talent_items) && ctx.characterData.combat_talent_items.length;
  if (!hasMagic && !hasCombat) return;
  ctx.exportTemplate.flags = ctx.exportTemplate.flags || {};
  const f = Object.assign({}, ctx.exportTemplate.flags.pf1spheres);
  if (hasMagic) f.castingAbility = cam;
  f.practitionerAbility = pam;
  ctx.exportTemplate.flags.pf1spheres = f;
  if (hasMagic) {
    const feat = (ctx.exportTemplate.items || []).find(i =>
      i.type === 'feat' && typeof i.name === 'string' && i.name.startsWith('Spheres Casting'));
    if (feat) {
      feat.system = feat.system || {};
      const ch = Array.isArray(feat.system.changes) ? feat.system.changes : [];
      if (!ch.some(c => c && c.target === 'spherecl')) {
        ch.push({ _id: ctx.newChangeId('spherecl'), formula: sphereCLExpr(ctx), target: 'spherecl', type: 'untyped', operator: 'add', priority: 0, value: 0 });
        feat.system.changes = ch;
      }
    }
  }
}

// Synthesize a "Destructive Blast" attack item (Destruction sphere base ability): a touch attack whose
// base damage scales (ceil(@spheres.cl.total/2))d6 -> 1d6 for a CL-1 dabbler. Blast-type/shape talents
// attach as conditionals via addSphereTalentConditionals; the spell-point boost rides here as a
// built-in toggle. Cloned from the main weapon so the pf1 v11 action schema is guaranteed valid.
async function addDestructiveBlastAttack(ctx, subSpheres) {
  try {
    const chosen = ctx.characterData.spheres_chosen || [];
    const magic = ctx.characterData.magic_talent_items || [];
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
    appendJsonToTemplate([blast], ctx.exportTemplate, 'Attack');
    console.log('Spheres: added Destructive Blast attack item.');
  } catch (error) {
    console.error('Error adding Destructive Blast:', error);
  }
}

async function addSphereTalentConditionals(ctx, subSpheres) {
  try {
    const combat = ctx.characterData.combat_talent_items || [];
    const magic = ctx.characterData.magic_talent_items || [];
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
    const combatByNorm = buildByNorm(ctx.templates.combatTalentConditionals);
    const magicByNorm = buildByNorm(ctx.templates.magicTalentConditionals);

    const weapon = findMainWeapon(ctx);
    const weaponAction = weapon && (weapon.system?.actions || [])[0];
    const blast = (ctx.exportTemplate.items || []).find(i => i.type === 'attack' && i.name === 'Destructive Blast');
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
async function addSphereAuraBuffs(ctx, subSpheres) {
  try {
    const table = ctx.templates.talentAuraBuffs;
    if (!table || typeof table !== 'object') return;
    const combat = ctx.characterData.combat_talent_items || [];
    const magic = ctx.characterData.magic_talent_items || [];
    if (!combat.length && !magic.length) return;
    const byNorm = {};
    for (const [sph, tals] of Object.entries(table)) {
      if (!tals || typeof tals !== 'object') continue;
      const k = sphereNorm(sph); byNorm[k] = byNorm[k] || {};
      for (const [tn, e] of Object.entries(tals)) byNorm[k][sphereNorm(tn)] = e;
    }
    const tag = deriveBuffTag(ctx.characterData.character_full_name);
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
    appendJsonToTemplate(all, ctx.exportTemplate, 'SphereAuraBuffs');
    console.log(`Spheres: injected ${buffs.length} affects-others buff(s) tagged (${tag}).`);
  } catch (error) {
    console.error('Error adding sphere aura buffs:', error);
  }
}
// Every buff spell the NPC KNOWS -> an inactive distributable temp buff "<Spell> (TAG)" (parsed from
// spell_buffs.json). Toggle + Multi-Buff Distributor shares it with allies (even Personal/Self spells).
export async function addSpellBuffs(ctx) {
  try {
    const table = ctx.templates.spellBuffs;
    if (!table || typeof table !== 'object') return;
    const known = [];
    for (const lvl of (ctx.characterData.spell_list_choose_from || [])) {
      for (const s of (lvl || [])) if (s) known.push(String(s));
    }
    if (!known.length) return;
    const byLower = {};
    for (const [k, v] of Object.entries(table)) byLower[k.toLowerCase()] = { name: k, entry: v };
    const tag = deriveBuffTag(ctx.characterData.character_full_name);
    // Aura Range = the spell's range as a concrete number of feet at the NPC's caster level (close/
    // medium/long conventions). Distributor reads this integer. One CL for the whole table: these
    // spells come from the flat spell_list_choose_from with no per-book attribution, so a single
    // combined CL is the (deliberate) approximation -- but it is now the REAL homebrew combined CL
    // (spellCasterLevelNum) rather than ctx.characterData.level, which is only the PRIMARY class's level
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
    appendJsonToTemplate(all, ctx.exportTemplate, 'SpellBuffs');
    console.log(`Spells: injected ${count} distributable spell buff(s) tagged (${tag}), grouped by duration.`);
  } catch (error) {
    console.error('Error adding spell buffs:', error);
  }
}

// ----- Entry points, in spine order -----

/**
 * The pf1spheres talent items. Called from between addFeats and addTraits, which is exactly where
 * Feats_n_Traits used to call it from its own middle (hazard 3) -- same position, no longer hidden.
 */
export async function addSphereTalents(ctx) {
  const characterData = ctx.characterData;
  if ((Array.isArray(characterData.magic_talent_items) && characterData.magic_talent_items.length)
      || (Array.isArray(characterData.combat_talent_items) && characterData.combat_talent_items.length)) {
    await processSpheres(ctx, characterData.magic_talent_items, characterData.combat_talent_items,
      characterData.casting_tradition, characterData.sphere_mana_pool, 4210);
  }
}

/**
 * The Casting Traditions section at the very top of the Traits tab. Every NPC carries one -- for a
 * non-caster it is latent flavor, how their magic WOULD work. Old payloads without casting_tradition
 * simply skip it. The divider's underscore runs are deliberately symmetric, unlike the legacy
 * dividers around it.
 */
export async function addCastingTradition(ctx) {
  const castingTrad = ctx.characterData.casting_tradition || {};
  if (!Object.keys(castingTrad).length) return;
  await appendFeatDivider(ctx, "____________________ Casting Traditions ____________________", -200000, 'trait');
  const camName = castingTrad.casting_ability_modifier;
  const tradItem = synthesizeFeatItem(
    camName ? `Casting Tradition (${camName})` : "Casting Tradition",
    buildTraditionHtml(castingTrad, ctx.characterData.sphere_mana_pool));
  tradItem.system.subType = 'trait';
  tradItem.sort = -199900;
  appendJsonToTemplate([tradItem], ctx.exportTemplate, "Trait");
}

/**
 * Talent conditionals, the Destructive Blast attack item, and the aura buffs.
 *
 * Runs after the weapon exists and BEFORE the scaling attack twin is cloned, so the clone inherits
 * these conditionals -- the same window the attack toggles live in.
 */
export async function addSphereConditionals(ctx) {
  const { cam, pam } = resolveSphereAbilities(ctx);
  const subSpheres = makeSubSpheres(ctx, cam, pam);
  applySpheresFlags(ctx, cam, pam);
  await addDestructiveBlastAttack(ctx, subSpheres);
  await addSphereTalentConditionals(ctx, subSpheres);
  await addSphereAuraBuffs(ctx, subSpheres);
}
