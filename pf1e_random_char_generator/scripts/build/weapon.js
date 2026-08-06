/**
 * The main weapon, once.
 *
 * `weapons.find(w => w.name === characterData.weapon_name) || weapons[0]` was copy-pasted EIGHT
 * times through `modify-abilities.js` — six conditional attachers plus the Destructive Blast base
 * and the scaling attack twin. It is one rule ("the character has one main weapon; prefer the one
 * the backend named, else take whatever weapon there is") and it now has one place to live.
 *
 * This module exists rather than the lookup living in `conditional-engine.js` because two of its
 * eight callers have nothing to do with conditionals — a weapon-finishing stage importing from the
 * conditional engine would be a dependency that describes where the code came from rather than what
 * it is. Ticket 08 grows `weapon-finishing.js` / `equipment.js`; they belong beside this.
 */

/**
 * The weapon everything attack-related hangs off, or `undefined` when the character has none.
 *
 * Returning `undefined` rather than throwing is deliberate for now: every caller today warns and
 * returns on a missing weapon, which means a character whose weapon failed to build silently gets
 * no conditionals at all. That silent-failure mode is a known bug, tracked in ticket 08, and it is
 * preserved here exactly — turning it into a throw is a behaviour change and belongs in its own
 * commit, not in a de-duplication.
 */
export function findMainWeapon(ctx) {
  const weapons = (ctx.exportTemplate.items || []).filter(i => i.type === 'weapon');
  return weapons.find(w => w.name === (ctx.characterData.weapon_name || '')) || weapons[0];
}
