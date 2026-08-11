/**
 * Weapon finishing — the house trackers, the size-damage scaling rig, the rollable attack twin, and
 * the +N stamp.
 *
 * **This is hazard 1, and it is why all four are one module.** `applyEnhancementBonuses` renames the
 * weapon and its already-cloned attack twin TOGETHER, by matching their shared name. Run it before
 * `createScalingAttackItem` makes the clone and only one of the two gets stamped — the sheet then
 * shows a "+1 Corrosive Longsword" in inventory and a plain "Longsword" on the Combat tab, which
 * reads as a display glitch rather than the ordering bug it is. `addWeaponFinishing` fixes the order
 * inside one function so it cannot be split apart by accident.
 *
 * The attack twin is the ONLY Combat-tab entry (the inventory weapon is `showInCombat: false`), and
 * it carries a deliberately STRIPPED description: pf1 bakes an item's description into its attack
 * chat card unconditionally, and the full per-quality rules text used to drown every roll. It gets
 * only the one-line special-abilities summary back, through the equipment stage's own writer.
 *
 * `createScalingAttackItem` is one of the two non-conditional callers of `findMainWeapon`, which is
 * why that lookup lives in its own module rather than with the conditional engine.
 */
import { appendJsonToTemplate } from './items.js';
import { findMainWeapon } from './weapon.js';
import { appendEnhancementsToDescription } from './equipment.js';
import { characterHasNaturalArmor } from './natural-armor.js';
import { log } from '../shared/log.js';

// ----- Size-based damage scaling ----- //
// Every sheet gets a `sizefordamage` feature whose charge value (default 0) drives the
// "Scaling Weapon Damage" script via @resources.sizefordamage. BOTH the main weapon and a separate
// generated ATTACK item (pf1 "Create Attack" equivalent) carry that script and two actions in order:
//   [0] "Attack"      -- the rollable copy (inherits the weapon's maneuver conditionals);
//   [1] "Don't Touch" -- a duplicate the script reads as the pristine base damage to scale from.

// The feature only PROVIDES the resource (@resources.sizefordamage); the operative script lives on
// the attack item below.

// House tracker features (Damage Dice Progression, Natural Armor HP items, Death HP Pool, ...)
// cloned verbatim from house_features.json — sorts are baked in so each lands under its group
// divider (Variable Modifiers / Natural AC / Death HP) exactly like the template actor.
// Natural-armor tracker items are skipped for characters with no natural armor.
async function addHouseFeatures(ctx) {
  try {
    let features = ctx.templates.houseFeatures;
    if (!Array.isArray(features) || !features.length) {
      console.warn('House features: house_features.json missing or empty — skipping.');
      return;
    }
    if (!characterHasNaturalArmor(ctx)) {
      features = features.filter((f) => !/natural\s*a(c|rmor)/i.test(String(f?.name)));
    }
    // Trauma Survivor: "Add your negative luck score to the hitpoint threshold at which you die."
    // The Death HP Pool item IS that threshold on this sheet, so the trait extends its maxFormula
    // rather than inventing a second number that would immediately disagree with it. The formula
    // negates the score (which is negative) to get a magnitude, matching the trait's other half.
    //
    // Deliberately NOT touching the item's description, which already claims "level + 3*HD + 2*Con"
    // against an actual formula of 2*Con + 4*HD. That drift predates this change; fixing it here
    // would bury a real bug inside an unrelated diff.
    const deathBonus = ((ctx.characterData?.luck?.trait_changes) || {})['Trauma Survivor']
      ?.death_hp_pool_bonus;
    const clones = [];
    for (const f of features) {
      const clone = structuredClone(f);
      clone._id = ctx.newId('houseFeature', f);
      if (deathBonus && /death\s*hp/i.test(String(clone.name)) && clone.system?.uses) {
        const base = String(clone.system.uses.maxFormula || '0').trim();
        clone.system.uses.maxFormula = `${base} + ${deathBonus}`;
        log.debug(`Trauma Survivor: Death HP Pool max is now "${clone.system.uses.maxFormula}".`);
      }
      clones.push(clone);
    }
    appendJsonToTemplate(clones, ctx.exportTemplate, 'Feature');
    log.debug(`Added ${clones.length} house tracker feature(s) (Variable Modifiers / Natural AC / Death HP groups).`);
  } catch (error) {
    console.error('Error adding house tracker features:', error);
  }
}

async function addSizeForDamageFeature(ctx) {
  try {
    const feature = structuredClone(ctx.templates.sizeForDamageFeature);
    feature._id = ctx.newId('sizeForDamage', feature.name);
    // Pin it into the "Variable Modifiers" group (template actor slot), just under its divider.
    feature.sort = 121680;
    appendJsonToTemplate([feature], ctx.exportTemplate, 'Feature');
    log.debug(`Added sizefordamage feature (sort ${feature.sort}, Variable Modifiers group).`);
  } catch (error) {
    console.error('Error adding sizefordamage feature:', error);
  }
}

async function createScalingAttackItem(ctx) {
  try {
    const weapon = findMainWeapon(ctx);
    if (!weapon) { console.warn('Scaling: no weapon item.'); return; }
    const srcActions = (weapon.system && weapon.system.actions) || [];
    if (!srcActions.length) { console.warn(`Scaling: weapon "${weapon.name}" has no action — skipping.`); return; }

    // "Don't Touch" = a copy of the rollable action that the Scaling Weapon Damage script reads as
    // the pristine base damage (actions[1]); a fresh script-call clone (reads @resources.sizefordamage).
    const dontTouchFrom = async (a0) => {
      const a1 = structuredClone(a0);
      a1._id = ctx.newId('action', ["Don't Touch", a0]);
      a1.name = "Don't Touch";
      return a1;
    };
    const freshScript = async () => {
      const sc = structuredClone(ctx.templates.scalingWeaponDamage);
      sc._id = (ctx.newId('scriptCall', sc)).slice(0, 8);
      return sc;
    };

    // The WEAPON itself keeps the 2-action + script setup so it still scales if someone rolls it
    // manually from inventory (it is no longer in the Combat tab — showInCombat false).
    srcActions[0].name = 'Attack';
    weapon.system.actions = [srcActions[0], await dontTouchFrom(srcActions[0])];
    weapon.system.scriptCalls = [await freshScript()];

    // The attack-type twin is the ONLY Combat-tab entry and thus what actually gets rolled
    // (same setup, fresh ids so nothing collides).
    const attack = structuredClone(weapon);
    attack.type = 'attack';
    attack._id = ctx.newId('attack', weapon.name);
    // pf1's Combat tab sections attack items by ATTACK subType (weapon/natural/ability/...); the
    // clone carries the WEAPON's subType ("simple"/"martial"), which matches no section, so the twin
    // existed on the actor but never rendered — players had to click "Create Attack" themselves.
    // Mirror what pf1's own Create Attack produces: subType "weapon", proficient.
    attack.system.subType = 'weapon';
    attack.system.proficient = true;
    // pf1 bakes an item's description into its attack chat card unconditionally, so the twin
    // carries only the one-line special-abilities summary — the full formatted rules text stays
    // on the inventory weapon item.
    if (attack.system?.description) {
      attack.system.description.value = "";
      appendEnhancementsToDescription(attack, ctx.characterData.weapon_enhancement_chosen_list);
    }
    const aAttack = structuredClone(weapon.system.actions[0]);
    aAttack._id = ctx.newId('action', ['Attack', weapon.name]);
    aAttack.name = 'Attack';
    attack.system.actions = [aAttack, await dontTouchFrom(aAttack)];
    attack.system.scriptCalls = [await freshScript()];

    appendJsonToTemplate([attack], ctx.exportTemplate, 'Attack');
    log.debug(`Scaling: weapon "${weapon.name}" + attack item set up (Attack + Don't Touch + Scaling Weapon Damage).`);
  } catch (error) {
    console.error('Error in scaling weapon/attack setup:', error);
  }
}

// ----- Numeric enhancement bonus (+N): stamp and rename ----- //
// weapon_/armor_/shield_enhancement_bonus (1-5; 0 = none) is the backend budget leftover after
// buying qualities. Weapons get system.enh, armor/shields get system.armor.enh, all get
// masterwork, and the item is renamed "+N <Qualities> <Base Name>" (e.g. "+1 Corrosive
// Longsword"). MUST run after every other weapon/armor step: earlier attach functions find the
// weapon by ctx.characterData.weapon_name, and the scaling attack item clones the weapon — both
// twins are renamed here together.
async function applyEnhancementBonuses(ctx) {
  try {
    const items = ctx.exportTemplate.items || [];
    let stamped = 0;
    const stamp = (item, bonus, qualities, isWeapon) => {
      if (!item || !item.system || !(bonus > 0)) return;
      if (isWeapon) item.system.enh = bonus;
      else if (item.system.armor) item.system.armor.enh = bonus;
      item.system.masterwork = true;
      item.name = ['+' + bonus, ...(Array.isArray(qualities) ? qualities : []), item.name].join(' ');
      stamped++;
    };

    const weaponItems = items.filter(i => i.type === 'weapon');
    const mainWeapon = weaponItems.find(w => w.name === (ctx.characterData.weapon_name || '')) || weaponItems[0];
    if (mainWeapon) {
      const twins = items.filter(i => (i.type === 'weapon' || i.type === 'attack') && i.name === mainWeapon.name);
      for (const t of twins) {
        stamp(t, Number(ctx.characterData.weapon_enhancement_bonus) || 0,
              ctx.characterData.weapon_enhancement_chosen_list, true);
      }
    }

    const equipItems = items.filter(i => i.type === 'equipment');
    stamp(equipItems.find(i => i.system?.subType === 'armor'),
          Number(ctx.characterData.armor_enhancement_bonus) || 0,
          ctx.characterData.armor_enhancement_chosen_list, false);
    stamp(equipItems.find(i => i.system?.subType === 'shield'),
          Number(ctx.characterData.shield_enhancement_bonus) || 0,
          ctx.characterData.shield_enhancement_chosen_list, false);

    log.debug(`Enhancement bonuses: stamped +N on ${stamped} item(s).`);
  } catch (error) {
    console.error('Error applying enhancement bonuses:', error);
  }
}

/**
 * HAZARD 1 lives in these four lines: the +N stamp must come last.
 *
 * It finds the weapon and its twin by their shared name and renames both together, so the twin has
 * to exist before it runs. Reordering these produces a sheet where only one of the two is stamped.
 */
export async function addWeaponFinishing(ctx) {
  await addHouseFeatures(ctx);
  await addSizeForDamageFeature(ctx);
  await createScalingAttackItem(ctx);
  await applyEnhancementBonuses(ctx);
}
