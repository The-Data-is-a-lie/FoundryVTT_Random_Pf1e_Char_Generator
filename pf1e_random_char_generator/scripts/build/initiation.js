/**
 * Path of War initiation basics, shared by the three stages that talk about maneuvers.
 *
 * `resolveInitStat` has readers in the Path of War stage (stamping maneuverProgression onto Martial
 * Training characters), in the attack toggles (rider save DCs must match the DC pf1-pow rolls), and in
 * Spheres (a caster with no declared casting ability falls back to it). `capitalizeManeuverType` is
 * the label half of the same vocabulary. Neither belongs to one of those three stages, and the answer
 * has to be identical at all three call sites or the sheet contradicts itself — so they live here
 * rather than being re-derived, the same reasoning that gave `findMainWeapon` its own module.
 */

/**
 * The initiating ability THIS character actually uses, preferring what the sheet already says.
 *
 * An initiator class declares it on its class item (`every_class.json` `maneuverProgression.
 * initiatorAttr`); Martial Training characters have no such class, and get it stamped by
 * `applyManeuverProgression()` from `resolveInitStat` below. pf1-pow reads the same field to roll
 * real maneuver DCs, so every rider DC we write has to come through here to match it.
 *
 * Two readers, and they must agree: the stance buffs in the Path of War stage and the maneuver
 * conditionals in the attack toggles.
 */
export function maneuverInitAttr(ctx) {
  const cls = (ctx.exportTemplate.items || [])
    .filter(i => i.type === 'class')
    .find(c => ['int', 'wis', 'cha'].includes(c?.system?.maneuverProgression?.initiatorAttr));
  return cls ? cls.system.maneuverProgression.initiatorAttr : resolveInitStat(ctx);
}

export function capitalizeManeuverType(t) {
  const s = String(t || '').toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// Initiating ability ("int"/"wis"/"cha"): backend's initiation_stat export, else recompute the
// same way (FINAL score = base + inherents + level-up bumps; first max wins, so ties break
// int > wis > cha — mirrors skill_ranks.final_ability_score on the backend).
export function resolveInitStat(ctx) {
  const characterData = ctx.characterData;
  const exported = String(characterData.initiation_stat || '').toLowerCase();
  if (['int', 'wis', 'cha'].includes(exported)) return exported;
  const inh = characterData.inherents || {};
  const lvl = characterData.level_up_stats || {};
  const finalScore = s => (Number(characterData[s]) || 0) + (Number(inh[s]) || 0) + (Number(lvl[s]) || 0);
  let best = null;
  for (const s of ['int', 'wis', 'cha']) {
    if (best === null || finalScore(s) > finalScore(best)) best = s;
  }
  return best || 'wis';
}
