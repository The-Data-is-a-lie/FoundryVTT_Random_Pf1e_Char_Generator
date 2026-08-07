/**
 * Attack toggles — the five callers that hang conditional modifiers on the main weapon's action.
 *
 * Each one is thin because the shared half already left: `conditional-engine.js` owns building the
 * conditional, its modifiers and its source label. What is left in each caller here is the part that
 * was never shared — composing the conditional's NAME, and choosing which formula tokens to
 * substitute (@INITMOD for maneuvers, @slvl/@castMod for spells, nothing for item activations).
 *
 * `addEnhancementEffects` is only half an attacher: its other half writes armor and shield changes
 * through `applyBuffData`. Both halves are here, and the split inside the function is kept.
 *
 * **This stage sits between two hazards.** It must run after equipment — every caller finds its
 * target with `findMainWeapon(ctx)` and warns-and-returns when there is none, so running early
 * produces a plausible-looking sheet with no toggles on it (hazard 2) — and before weapon finishing,
 * because `createScalingAttackItem` clones the weapon's action and the clone has to inherit
 * everything attached here.
 */
import { attachConditionals } from './conditional-engine.js';
import { findMainWeapon } from './weapon.js';
import { applyBuffData } from './items.js';
import { appendQualityDescription } from './equipment.js';
import { subSpellTokens } from './spells.js';
import { capitalizeManeuverType, maneuverInitAttr } from './initiation.js';
import { capitalizeWords, powNorm } from '../shared/text.js';
import { log } from '../shared/log.js';

// ----- Path of War: maneuver conditionals on the main weapon ----- //
// Each KNOWN strike/boost/counter that has a curated combat modifier (maneuver_changes.json)
// becomes a DEFAULT-OFF conditional modifier on the main weapon's attack action — a toggle the
// player ticks in the attack dialog when they use that maneuver (e.g. "(Strike) Sting of the
// Rattler" adds +1d4 damage). Runs AFTER the weapon item exists in ctx.exportTemplate. Stances are
// untouched (they're buffs; their dice damage stays description-only because buff changes can't
// roll per-hit dice).
async function addManeuverConditionals(ctx) {
  try {
    const known = (ctx.characterData.maneuvers_choose_from || []).flat();   // strikes/boosts/counters (no stances)
    const knownStances = ctx.characterData.stances_chosen || [];            // stances may carry a damage conditional
    if (!known.length && !knownStances.length) return;
    const table = ctx.templates.maneuverChanges;
    if (!table || typeof table !== 'object') {
      console.warn('maneuver_changes.json missing or invalid — no maneuver conditionals added.');
      return;
    }
    const byNorm = {};
    for (const [k, v] of Object.entries(table)) byNorm[powNorm(k)] = v;

    const weapon = findMainWeapon(ctx);
    if (!weapon) { console.warn('Path of War: no weapon item to attach maneuver conditionals to.'); return; }
    const action = (weapon.system?.actions || [])[0];
    if (!action) { console.warn(`Path of War: weapon "${weapon.name}" has no attack action — skipping conditionals.`); return; }

    const descs = ctx.characterData.maneuvers_desc_dict || {};
    // Riders embed the initiation modifier as the token @INITMOD; substitute the character's REAL
    // initiating ability (see maneuverInitAttr) so the rider DC matches pf1-pow's computed DC.
    const init = maneuverInitAttr(ctx);
    const subInit = s => String(s == null ? '' : s).replaceAll('@INITMOD', `@abilities.${init}.mod`);

    // Strikes/boosts/counters first, then stances — one list, because the two used to share a `seen`
    // set and the second could be deduped against the first.
    const entries = [];
    for (const name of known) {
      const entry = byNorm[powNorm(name)];
      if (!entry) continue;
      const rider = typeof entry.rider === 'string' ? entry.rider.trim() : '';
      const hasMods = Array.isArray(entry.modifiers) && entry.modifiers.length;
      if (!rider && !hasMods) continue;   // nothing to attach for this maneuver
      const typeCap = capitalizeManeuverType((descs[name] || {}).type) || 'Strike';
      // The descriptive rider (saves / ability damage / conditions, with [[ ]] inline rolls) rides
      // in the conditional NAME; numeric damage/attack stays in modifiers (which may be empty).
      entries.push({
        action,
        name: rider ? `(${typeCap}) ${name}: ${subInit(rider)}` : `(${typeCap}) ${name}`,
        default: false,
        modifiers: entry.modifiers,
        label: name,
      });
    }
    // Stances with a damage/attack modifier (e.g. Savage Stance) become a default-ON weapon
    // conditional — the rolled dice scale off @attributes.hd.total and apply while the stance is
    // active. (Pure-buff stances carry no modifiers and stay buffs via addStanceBuffs.)
    for (const name of knownStances) {
      const entry = byNorm[powNorm(name)];
      if (!entry || !(Array.isArray(entry.modifiers) && entry.modifiers.length)) continue;
      const rider = typeof entry.rider === 'string' ? entry.rider.trim() : '';
      entries.push({
        action,
        name: rider ? `(Stance) ${name}: ${subInit(rider)}` : `(Stance) ${name}`,
        default: true,
        modifiers: entry.modifiers,
        label: name,
      });
    }
    const added = attachConditionals(ctx, entries, { sub: subInit });
    log.debug(`Path of War: attached ${added} maneuver/stance conditional(s) to "${weapon.name}".`);
  } catch (error) {
    console.error('Error attaching Path of War maneuver conditionals:', error);
  }
}

// ----- Feat toggles: active-feat conditionals on the main weapon ----- //
// Active feats (Power Attack, Deadly Aim, Piranha Strike, ...) become DEFAULT-OFF conditional
// modifiers on the main weapon's attack action — a toggle the player ticks when they use the feat.
// Clean damage/attack bonuses are structured modifiers; the tradeoff / AC-side rule rides in the
// conditional NAME (with [[ ]] inline rolls). Mirrors addManeuverConditionals; runs after the weapon
// exists. Keyed by feat_conditionals_dict (lowercased feat name -> {name, default, modifiers}).
async function addFeatConditionals(ctx) {
  try {
    if (!ctx.featConditionalsMap || !Object.keys(ctx.featConditionalsMap).length) return;
    const weapon = findMainWeapon(ctx);
    if (!weapon) { console.warn('Feat toggles: no weapon item to attach conditionals to.'); return; }
    const action = (weapon.system?.actions || [])[0];
    if (!action) { console.warn(`Feat toggles: weapon "${weapon.name}" has no attack action — skipping.`); return; }
    // The clean feat name is everything before the ':' rider text — that is what the roll shows as
    // the modifier's source.
    const added = attachConditionals(ctx, Object.values(ctx.featConditionalsMap).map(entry => ({
      action,
      name: (entry && entry.name) || '',
      default: false,
      modifiers: entry && entry.modifiers,
      label: String((entry && entry.name) || '').split(':')[0],
    })));
    log.debug(`Feats: attached ${added} feat toggle conditional(s) to "${weapon.name}".`);
  } catch (error) {
    console.error('Error attaching feat conditionals:', error);
  }
}

// ----- Weapon/armor special abilities: mechanics from enhancement_effects_dict ----- //
// Curated quality_effects.json entries (via the backend, keyed by the chosen quality names).
// weapon.*: each quality's `conditionals` attach to the main weapon's attack action — same shape
// and source-labeling as maneuver/feat conditionals (clean dice as modifiers, riders with [[ ]]
// inline rolls in the name) — and its full rules text renders under the WEAPON item. That text
// never reaches the roll: the weapon is inventory-only (processItem sets showInCombat false), and
// the rollable attack twin cloned in createScalingAttackItem() gets a stripped description (pf1
// bakes an item's description into its attack chat card unconditionally, which used to drown
// every roll in text). armor.*/shield.*: `changes`/`contextNotes` overlay the armor/shield item
// via applyBuffData (same target-dedupe as everything else). Runs after the items exist.
async function addEnhancementEffects(ctx) {
  try {
    const eff = ctx.characterData.enhancement_effects_dict || {};
    const wEff = eff.weapon || {}, aEff = eff.armor || {}, sEff = eff.shield || {};
    if (!Object.keys(wEff).length && !Object.keys(aEff).length && !Object.keys(sEff).length) return;

    // Weapon qualities -> conditionals on the main weapon's attack action
    const weapon = findMainWeapon(ctx);
    const action = weapon ? (weapon.system?.actions || [])[0] : null;
    // Rules text: every quality renders its full description under the WEAPON item. Safe now that
    // the weapon is never rolled — the rollable attack twin gets a stripped description instead.
    if (weapon) {
      for (const [qName, entry] of Object.entries(wEff)) appendQualityDescription(weapon, qName, entry.description);
    }
    if (Object.keys(wEff).length && weapon && action) {
      const entries = [];
      for (const [qName, entry] of Object.entries(wEff)) {
        // Quality not yet curated (description-only safety net): a name-only toggle keeps the
        // quality visible on the roll; its rules text is on the weapon description above.
        const conds = (entry.conditionals || []).length ? entry.conditionals
          : (entry.description ? [{ name: qName, default: true, modifiers: [] }] : []);
        for (const cond of conds) {
          const condName = cond.name || qName;
          entries.push({
            action,
            name: condName,
            // Curated qualities are always-on unless the curation says otherwise: a flaming weapon
            // burns without the player ticking anything.
            default: cond.default !== false,
            modifiers: cond.modifiers,
            label: String(condName).split(':')[0],
          });
        }
      }
      const added = attachConditionals(ctx, entries);
      log.debug(`Enhancements: attached ${added} weapon quality conditional(s) to "${weapon.name}".`);
    }

    // Armor/shield qualities -> changes + context notes + rules text on the armor/shield item
    const equipItems = (ctx.exportTemplate.items || []).filter(i => i.type === 'equipment');
    const armorItem = equipItems.find(i => i.system?.subType === 'armor');
    const shieldItem = equipItems.find(i => i.system?.subType === 'shield') || armorItem;
    for (const [qName, entry] of Object.entries(aEff)) {
      applyBuffData(ctx, armorItem, entry);
      appendQualityDescription(armorItem, qName, entry.description);
    }
    for (const [qName, entry] of Object.entries(sEff)) {
      applyBuffData(ctx, shieldItem, entry);
      appendQualityDescription(shieldItem, qName, entry.description);
    }

  } catch (error) {
    console.error('Error attaching enhancement effects:', error);
  }
}

// ----- Item activations: attack-note toggles on the main weapon ----- //
// Wondrous-item attack-target contextNotes (split out of item_changes_dict at itemChangesMap build)
// used to ride the equipment item, so pf1 printed their full activation text on every attack chat
// card. Each becomes a DEFAULT-OFF "(Item Name): <note text>" conditional on the main weapon's
// attack action instead — an opt-in toggle like the feat/maneuver ones. The note text arrives with
// its [[ ]] inline rolls already baked in by build_item_changes.py; modifiers stay empty (name-only
// rider, so no source-labeling is needed). Runs after the weapon exists, like addFeatConditionals.
async function addItemAttackConditionals(ctx) {
  try {
    if (!ctx.itemAttackToggles.length) return;
    const weapon = findMainWeapon(ctx);
    if (!weapon) { console.warn('Item toggles: no weapon item to attach conditionals to.'); return; }
    const action = (weapon.system?.actions || [])[0];
    if (!action) { console.warn(`Item toggles: weapon "${weapon.name}" has no attack action — skipping.`); return; }
    // Name-only riders: no modifiers, so nothing to substitute or source-label. The item name gets
    // the same display-casing processItem gives the inventory item, so the toggle matches it.
    const added = attachConditionals(ctx, ctx.itemAttackToggles.map(({ itemName, text }) => ({
      action,
      name: `(${capitalizeWords(itemName)}): ${text}`,
      default: false,
      modifiers: [],
    })));
    log.debug(`Items: attached ${added} item activation toggle(s) to "${weapon.name}".`);
  } catch (error) {
    console.error('Error attaching item attack conditionals:', error);
  }
}

// ----- Spell buffs: cast-buff conditionals on the main weapon ----- //
// Bucket-A buff spells (Bless, Divine Favor, Magic Weapon, True Strike, Flame Arrow) become
// DEFAULT-OFF conditional toggles on the main weapon's attack action — the same mechanism as feat
// toggles. spell_changes_dict entries arrive in two shapes: {name, default, modifiers} (one-shot/dice
// buffs — used verbatim) and {changes, contextNotes} (sustained typed bonuses — converted to attack/
// damage modifiers here, with the number wrapped in [[ ]] in the toggle name). Keyed by display-cased
// spell name; already filtered to the NPC's chosen spells by the backend.
async function addSpellConditionals(ctx) {
  try {
    const spellChanges = ctx.characterData.spell_changes_dict || {};
    if (!Object.keys(spellChanges).length) return;
    const weapon = findMainWeapon(ctx);
    if (!weapon) { console.warn('Spell buffs: no weapon item to attach conditionals to.'); return; }
    const action = (weapon.system?.actions || [])[0];
    if (!action) { console.warn(`Spell buffs: weapon "${weapon.name}" has no attack action — skipping.`); return; }
    const entries = [];
    for (const [spellName, entry] of Object.entries(spellChanges)) {
      if (!entry) continue;
      // Resolve this spell's source modifier list + the toggle's display name.
      let mods, condName;
      if (Array.isArray(entry.modifiers)) {
        mods = entry.modifiers;
        condName = entry.name || spellName;
      } else if (Array.isArray(entry.changes)) {
        const parts = [];
        mods = entry.changes.map(ch => {
          const onAttack = ch.target === 'attack';
          const typeLabel = ch.type && ch.type !== 'untyped' ? ` ${ch.type}` : '';
          parts.push(`+[[${ch.formula}]]${typeLabel} ${onAttack ? 'attack' : 'damage'}`);
          return { formula: ch.formula, target: onAttack ? 'attack' : 'damage',
                   subTarget: onAttack ? 'allAttack' : 'allDamage', type: ch.type || 'untyped',
                   damageType: [], critical: 'normal' };
        });
        condName = `${spellName}: ${parts.join(' & ')}`;
      } else {
        continue;
      }
      // Optional rider text (saves / conditions / combat-maneuver CMB rolls) rides the conditional
      // NAME with its numbers in [[ ]] -- mirrors addManeuverConditionals so spells follow the same
      // house convention. The [label] guard below keeps the attack modifier safe even though the
      // name now carries inline rolls.
      if (entry.rider) {
        const spellItem = (ctx.exportTemplate.items || []).find(
          i => i.type === 'spell' && (i.name || '').toLowerCase() === spellName.toLowerCase());
        condName += `; ${subSpellTokens(ctx, entry.rider, spellItem)}`;
      }
      entries.push({ action, name: condName, default: false, modifiers: mods, label: spellName });
    }
    const added = attachConditionals(ctx, entries);
    log.debug(`Spells: attached ${added} spell buff toggle(s) to "${weapon.name}".`);
  } catch (error) {
    console.error('Error attaching spell conditionals:', error);
  }
}

/**
 * Run the five attachers in the order the closure ran them.
 *
 * They all append to the same action's `conditionals` array, and that array's order is what the
 * player sees in the attack dialog — so this order is output, not sequencing preference, and it is
 * kept exactly as the fixtures recorded it.
 */
export async function addAttackToggles(ctx) {
  await addManeuverConditionals(ctx);
  await addFeatConditionals(ctx);
  await addEnhancementEffects(ctx);
  await addItemAttackConditionals(ctx);
  await addSpellConditionals(ctx);
}
