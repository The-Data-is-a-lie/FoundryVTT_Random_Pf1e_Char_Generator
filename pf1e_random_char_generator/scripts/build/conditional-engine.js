/**
 * Per-roll conditionals — the pf1 toggles that appear in the attack dialog — written once.
 *
 * SEVEN places in `modify-abilities.js` attached conditionals to an action, and each of them
 * independently reimplemented the same eight steps: find the weapon, take its first action, make
 * sure `conditionals` is an array, dedupe by name, compose the row, mint ids, source-label the
 * formula, resolve the damage type, push. Roughly 400 lines of it, drifting apart one bug fix at a
 * time. This module is those steps; the seven callers are what remains, and what remains is
 * genuinely different between them.
 *
 * (Ticket 06 counted five. `addItemAttackConditionals` and `addSpellRiders` are the two it missed,
 * both name-only variants — the second is also the only one that targets a SPELL's actions rather
 * than the weapon's, which the engine does not care about because the action arrives on the entry.)
 *
 * WHAT STAYED WITH THE CALLERS, and why this is not an oversight:
 *
 *   - **The conditional's NAME.** It is the house convention (see the `foundry-conditionals` skill)
 *     that the descriptive rider — saves, ability damage, durations, with their numbers in `[[ ]]`
 *     inline rolls — rides in the name while only clean numbers become `modifiers`. Composing that
 *     name is domain knowledge each caller owns and no two share: a maneuver prefixes its
 *     capitalized type, a talent its sphere, a spell summarises the bonuses it just converted, an
 *     item toggle its display-cased item name. A `prefix` option — which is what ticket 06 sketched
 *     — would have covered three of the seven and lied about the rest.
 *   - **Which action to attach to**, carried per entry rather than per call. Six callers use one
 *     action for the whole batch; the sphere talents alternate between the main weapon and the
 *     synthesized Destructive Blast item, talent by talent. Grouping them by target would reorder
 *     the mint calls, and the ids are content-derived precisely so this merge could be read as a
 *     diff — so the entry carries its own action and nothing is reordered.
 *   - **The `writeToLocalStorage` breadcrumb and the console tally.** Intra-build trace with no
 *     reader (ticket 05); the remaining ones are retired stage-by-stage under ticket 08. The engine
 *     does not carry new ones out of the closure.
 *
 * The engine is SYNCHRONOUS even though every call site it replaced was `await`ed. The only reason
 * that code was async was `generateUniqueID`, which is a plain function behind an `async` keyword;
 * minting through `ctx.newId` drops the await and nothing else changes, because none of this ever
 * had anything to wait for.
 *
 * DO NOT "simplify" the `!/\[.*\]/` guard below. It is load-bearing, and the bug it prevents is not
 * one you would guess from reading it.
 */

/**
 * The base damage type(s) of the weapon (or attack item) a conditional is being attached to, read
 * from its first damage part — handles pf1 v11 `{type:{values:[...]}}` and the older `{types:[...]}`.
 */
export function weaponDamageTypes(action) {
  for (const p of ((action && action.damage && action.damage.parts) || [])) {
    const t = p && p.type;
    let vals = [];
    if (t && Array.isArray(t.values)) vals = t.values;
    else if (Array.isArray(p && p.types)) vals = p.types;
    else if (Array.isArray(t)) vals = t;
    vals = (vals || []).filter(Boolean);
    if (vals.length) return vals.slice();
  }
  return [];
}

/**
 * Resolve a conditional DAMAGE modifier's damageType at attach time:
 *   * `["as-weapon"]` sentinel -> the attached weapon's own type(s) (so bonus weapon dice like
 *     Gravity Bow / a martial strike show the weapon's real slashing/bludgeoning/piercing), untyped
 *     fallback;
 *   * empty on a DICE instance -> `["untyped"]` (an empty Set renders "undefined": pf1's damage-roll
 *     `??=` only defaults null/undefined). A curated element is left untouched, as are attack/flat
 *     mods.
 */
export function dmgTypeOrUntyped(dt, target, formula, weaponTypes) {
  const arr = Array.isArray(dt) ? dt.slice() : [];
  if ((target || 'damage') !== 'damage') return arr;
  if (arr.length === 1 && arr[0] === 'as-weapon')
    return (Array.isArray(weaponTypes) && weaponTypes.length) ? weaponTypes.slice() : ['untyped'];
  if (arr.length === 0 && /[\d)]d\d/.test(String(formula || ''))) return ['untyped'];
  return arr;
}

/**
 * Attach a batch of conditionals, in order, and return how many were added.
 *
 * @param {object} ctx                 the build context — read for `newId` only.
 * @param {object[]} entries           one per conditional the caller wants, already named:
 *   @param {object}   entries[].action    the action to attach to. A missing action is SKIPPED, not
 *                                         an error — see `findMainWeapon`'s note on the silent
 *                                         failure mode this preserves.
 *   @param {string}   entries[].name      the composed conditional name; also the dedupe key.
 *   @param {boolean}  entries[].default   whether the toggle starts ticked.
 *   @param {object[]} entries[].modifiers the SOURCE modifier rows (backend- or template-authored),
 *                                         not pf1 rows — this is what turns them into pf1 rows.
 *   @param {string}   entries[].label     what to source-label the formulas with. Usually the name
 *                                         with its rider text cut off, so the roll shows "8d6
 *                                         (Sting of the Rattler)" rather than the whole sentence.
 * @param {object} [opts]
 *   @param {Function} [opts.sub]       formula token substitution, applied before source-labeling.
 *                                      Maneuvers replace `@INITMOD`, spells `@slvl`/`@castMod`,
 *                                      sphere talents `@spheres.*`. The default is `String`, which
 *                                      is exactly what the callers that substitute nothing did.
 */
export function attachConditionals(ctx, entries, { sub = String } = {}) {
  let added = 0;

  for (const entry of entries) {
    const action = entry.action;
    if (!action) continue;
    if (!Array.isArray(action.conditionals)) action.conditionals = [];

    const name = entry.name;
    // Deduped against the LIVE array rather than a Set seeded up front, so one batch can span two
    // actions (sphere talents do) without the caller tracking a Set per action. The arrays are ~100
    // rows at the very largest, and every caller it replaced added its name to the Set immediately
    // before pushing it, so the two are the same check.
    if (!name || action.conditionals.some(c => c && c.name === name)) continue;

    const weaponTypes = weaponDamageTypes(action);
    const label = String(entry.label ?? '').replace(/[\[\]]/g, '').trim();

    const modifiers = [];
    for (const m of (entry.modifiers || [])) {
      const isAttack = m.target === 'attack';
      let formula = sub(m.formula);
      // Source-label EVERY modifier (attack AND damage) so the rolled term shows where it came from
      // on the chat card. On ATTACK formulas the label is not cosmetic but REQUIRED: a conditional
      // name carrying `[[ ]]` inline rolls — which the house convention puts there constantly —
      // otherwise makes pf1 embed the whole name as the term's flavour, nesting the brackets, and
      // that crashes the d20 parser. The guard leaves an already-bracketed formula alone so nothing
      // gets double-labeled.
      if (formula && !/\[.*\]/.test(formula)) {
        formula = `${formula}[${label}]`;
      }
      modifiers.push({
        _id: String(ctx.newId('modifier', [name, m])).slice(0, 8),
        formula,
        target: m.target || 'damage',
        subTarget: m.subTarget || (isAttack ? 'allAttack' : 'allDamage'),
        type: m.type || 'untyped',
        damageType: dmgTypeOrUntyped(m.damageType, m.target, formula, weaponTypes),
        critical: m.critical || 'normal',
      });
    }

    action.conditionals.push({
      _id: String(ctx.newId('conditional', name)).slice(0, 8),
      name,
      default: entry.default === true,
      modifiers,
    });
    added++;
  }

  return added;
}
