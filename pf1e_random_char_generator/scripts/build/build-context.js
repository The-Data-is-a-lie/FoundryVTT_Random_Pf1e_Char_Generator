/**
 * The build context — what threads through the build stages in place of the closure.
 *
 * `modify-abilities.js` was one 4,000-line `async function main()` whose ~90 inner functions were
 * not modules but declarations closing over shared mutable state. Take any of them out of that
 * closure and it needs that state handed to it explicitly. This object IS that hand-off, and it is
 * the module's central domain term: a stage is a function that takes `ctx`, reads what it needs,
 * and pushes what it builds onto `ctx.exportTemplate.items`.
 *
 * **It is mutated in place, deliberately.** Every stage keeps doing exactly what it did inside the
 * closure, just through a parameter — which is what makes the golden-snapshot harness able to prove
 * a stage extraction changed nothing. The cost is real and worth naming: every stage has write
 * access to everything, so the seams here are a convention rather than something enforced, and
 * "which stage wrote this item" is not answerable from the context alone.
 *
 * **The split is finished, and the fields are no longer aliases.** For the length of the strangle
 * `main()` kept its own locals and assigned them onto the context as they came into existence, so
 * extracted stages could read `ctx.x` while the code still inside the closure read `x`. There are no
 * locals left to alias: the orchestrator fills these fields directly and every reader goes through
 * the context.
 *
 * One rule survives that history and still holds: **a field that does not exist yet is `null`, not
 * missing.** A stage that reads one is being called too early in the order, which is a real ordering
 * bug rather than a prompt for defensive coding.
 */

/**
 * @param {object}   deps
 * @param {Function} deps.rng     semantic randomness. Exactly one consumer: ammo selection picks a
 *                                random item, so two runs of one payload can put different content
 *                                on the sheet. Injected rather than diffed around.
 * @param {Function} deps.mintId  identity only, `(kind, key) => string`. The harness derives ids
 *                                from the content being stamped rather than from a counter, so
 *                                extracting or merging code cannot shift every later id and turn
 *                                the golden diff into noise. See `main()`'s header.
 */
export function createBuildContext({ rng, mintId }) {
  return {
    // --- injected seams -------------------------------------------------------------------
    rng,
    mintId,
    /** Mint an id for a document. `key` is the content being stamped, not a hand-written label. */
    newId: (kind = 'id', key = null) => mintId(kind, key),
    /** Mint the short id pf1's ChangeModel expects on each embedded change row. */
    newChangeId: (key = null) => String(mintId('change', key)).slice(0, 8),

    // --- inputs ---------------------------------------------------------------------------
    /** The backend payload (`pulledCharacterData`). Read by almost every stage. */
    characterData: null,
    /** The loaded template JSON, by stable name. Read by every template consumer. */
    templates: null,
    /**
     * Name -> row lookup over those same bundles, from `build/catalog.js`. Ask this rather than
     * scanning `templates.everyFeat` by hand: it owns the matching rule and the index, and a row it
     * returns is the SHARED object out of the session cache, so clone before writing to one.
     */
    catalog: null,
    /** `"y"`/`"n"` — whether this run is on the `_MODS` template branch. */
    modded: null,

    // --- the thing being built ------------------------------------------------------------
    /** The pf1 actor payload. Every builder pushes onto `exportTemplate.items`. */
    exportTemplate: null,

    // --- derived, produced by one stage and read by later ones ----------------------------
    /** Class-item ordering roster; also the boundary list `collectItems` scans between. */
    classList: null,
    /** The backend's display class name, e.g. `"Barbarian (Unchained)"`. */
    upperCaseClass: null,
    /**
     * Per-class feature bands, built by the classes stage and consumed by class features.
     * `updateClassFeatures` mutates the sort counters on these while iterating, and that mutation
     * is load-bearing for item ordering on the sheet — do not treat the bands as read-only.
     */
    classFeatureBands: null,

    // --- backend-authored lookup tables, all keyed lowercase ------------------------------
    /** Descriptions for feats absent from `every_feat.json` (homebrew chains, Martial Training). */
    homebrewFeatDescs: null,
    /** Always-on `changes` + situational `contextNotes` overlaid onto resolved feat items. */
    featChangesMap: null,
    /** Active-feat default-off toggles (Power Attack, Deadly Aim, ...) for the weapon's action. */
    featConditionalsMap: null,
    /** `changes`/`contextNotes` overlaid onto matched or synthesized equipment items. */
    itemChangesMap: null,
    /** `{itemName, text}` attack notes split off the items, for the weapon's attack action. */
    itemAttackToggles: null,
    /** Classes that prepare a daily loadout, as opposed to casting from spells known. */
    preparedCasterList: null,
  };
}
