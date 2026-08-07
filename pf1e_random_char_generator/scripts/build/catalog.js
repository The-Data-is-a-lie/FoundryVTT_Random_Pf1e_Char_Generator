/**
 * Finding a row by name in a loaded template bundle.
 *
 * ## Why this exists
 *
 * `template-loader.js` hands out the parsed bundles as bare arrays, so every stage that wanted a row
 * by name wrote its own scan. `every_feat.json` is 8,816 rows and the feat stage scanned it once per
 * placed feat across nine buckets, then AGAIN inside `applyFeatTax` for every granted chain feat —
 * and each scan re-derived `name.split(' (')[0].toLowerCase()` for all 8,816 candidates to compare
 * against one query. `npm run bench` put the feat stage at 68% of everything the build does.
 *
 * The fix is not clever: derive the key once per row instead of once per row per query. What makes it
 * worth a module rather than a local `Map` in `feats.js` is that the MATCHING RULE was duplicated
 * too — the same `split(' (')[0]`, the same `(Mythic)` exclusion, written out at four sites that
 * could drift apart. Now the rule is here and the stages ask a question instead of implementing one.
 *
 * `spells.js` already built exactly this Map inline before its own loop; so did the Path of War and
 * psionics stages for their compendium packs. Three stages found the answer independently and three
 * did not. That is the signal that it belonged one level down.
 *
 * ## The index is keyed by the array, not by the branch
 *
 * `indexes` is a WeakMap on the bundle array ITSELF, which gets the awkward part right for free.
 * The loader swaps six bundles for their `_MODS` twins when the modded flag is on and evicts the
 * other branch from its cache; a branch-keyed index here would have to be told about that. Keyed by
 * identity, a swapped-in array simply has no index yet and builds one, and the evicted arrays take
 * their indexes with them when they are collected. Nothing to invalidate, nothing to keep in sync.
 *
 * ## Rows come back SHARED, not cloned
 *
 * A returned row is the live object out of the session-cached bundle. Writing to it is the
 * cross-generation bug `template-loader.js` documents at length, so **clone before you write** — the
 * callers that mutate already do, right where they mutate. It is deliberately not cloned here:
 * `applyFeatTax` resolves a row only to read its name and description, and cloning on its behalf
 * would add a deep copy per tax child to pay for a write that never happens.
 */

/** Bundle array -> `Map<lowercased base name, first matching row>`. Built on first ask. */
const indexes = new WeakMap();

/**
 * The name a row is found by: everything before the first " (", lowercased.
 *
 * Applied to the ROW, never to the query. A query of "Weapon Focus (Longsword)" matched nothing
 * before this module existed — the candidate keys never contain " (" — and normalising the query too
 * would quietly start resolving it to plain "Weapon Focus".
 *
 * Exported so `tools/compendium_census.macro.js` measures pack coverage with THIS rule rather than
 * its own copy of it — a census that normalised differently would answer a question nobody asked.
 */
export const baseKey = (name) => name.split(' (')[0].toLowerCase();

function indexFor(bundle) {
  const cached = indexes.get(bundle);
  if (cached) return cached;

  const index = new Map();
  for (const row of bundle) {
    // Mythic rows are excluded at build time rather than at lookup: a `.find()` skipped them and
    // returned the next match, and a key that never holds a mythic row does the same thing.
    if (!row || typeof row.name !== 'string' || row.name.includes('(Mythic)')) continue;
    const key = baseKey(row.name);
    // First one wins, because `.find()` returned the first match in array order.
    if (!index.has(key)) index.set(key, row);
  }

  indexes.set(bundle, index);
  return index;
}

/**
 * Build the catalog for one run's templates.
 *
 * Takes the loaded bundle dictionary and closes over it, so a stage names the bundle it wants
 * ('everyFeat', 'everyTrait') and never touches the array. The indexes themselves outlive this
 * object — they hang off the arrays, which the loader caches for the session — so a second
 * generation re-uses the work the first one paid for.
 */
export function createCatalog(templates) {
  const lookup = (bundleName, query) => {
    const bundle = templates?.[bundleName];
    if (!Array.isArray(bundle)) return null;
    return indexFor(bundle).get(String(query).toLowerCase()) ?? null;
  };

  return {
    /** A row out of any named bundle, or null. The generic form; the stages mostly use the two below. */
    lookup,
    /** A feat row out of `every_feat.json`, or null when the compendium has no such feat. */
    feat: (name) => lookup('everyFeat', name),
    /** A trait row out of `every_trait.json`, or null. */
    trait: (name) => lookup('everyTrait', name),
  };
}
