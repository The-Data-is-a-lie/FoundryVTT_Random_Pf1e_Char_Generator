/**
 * Helpers for driving Foundry documents that the module needs in more than one place.
 */

/**
 * Set `path` on `doc` to `value`, guaranteeing Foundry actually fires a change event.
 *
 * A same-value `update()` is a no-op that raises no change event, so pf1 never re-derives anything
 * downstream of it. Two places in this module hit that trap with the same symptom:
 *
 *   - a level-20 character, whose class item arrives from the `every_class.json` template already
 *     at level 20, sits on the sheet as "Level 0 / missing a class" until somebody clicks Level Up
 *     by hand;
 *   - a bonded creature cloned from a source body whose HD already match the rolled HD never
 *     recomputes its saves or BAB.
 *
 * Nudging one step away first forces the event. Documents that already differ from the target skip
 * the nudge, so for them this is just the plain update.
 *
 * THE NUDGE DOES NOT RENDER. It writes a value that is wrong by one and is corrected on the very
 * next line, so painting it costs a full sheet re-render to show a number nobody should ever see.
 * `render: false` suppresses only the UI pass — the change event still fires and pf1 still
 * re-derives, which is the entire reason the nudge exists. The settling update renders normally.
 *
 * @param {object} doc      the Document to update.
 * @param {string} path     the update path, e.g. `"system.level"`.
 * @param {number} value    the value it must end up at.
 * @param {object} [opts]
 * @param {number} [opts.current]  the value the document holds now. The caller passes it because
 *                 reading it here would mean walking `path` with `foundry.utils.getProperty`, which
 *                 the node test harness does not stub.
 * @param {object} [opts.extra]    further fields to apply alongside the real update.
 */
export async function forceRederive(doc, path, value, { current, extra } = {}) {
  if (Number(current) === value) {
    await doc.update({ [path]: value > 1 ? value - 1 : value + 1 }, { render: false });
  }
  await doc.update({ [path]: value, ...(extra || {}) });
}
