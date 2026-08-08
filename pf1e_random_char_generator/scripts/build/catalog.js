/**
 * Finding a row by name — from a compendium pack when one is installed, from the JSON bundle when
 * it is not.
 *
 * ## Why this exists
 *
 * `template-loader.js` used to hand out the parsed bundles as bare arrays, so every stage that
 * wanted a row by name wrote its own scan. `every_feat.json` is 8,816 rows and the feat stage
 * scanned it once per placed feat across nine buckets, then again inside `applyFeatTax` for every
 * granted chain feat. `npm run bench` put the feat stage at 68% of everything the build did.
 *
 * Indexing fixed the CPU. Reading a pack fixed the rest: Foundry keeps a compendium's index and
 * fetches documents only when asked, so a build stops parsing ~50 MB of feat, trait, item and spell
 * JSON to use about a hundred rows of it.
 *
 * ## The matching rules were never the same, and pretending otherwise would break sheets
 *
 * Three stages resolved names three different ways, each written out by hand:
 *
 *   feats, traits  — match on the name before the first " (", skip `(Mythic)` rows, FIRST wins.
 *   items, weapons — exact full name first; only if that misses, the name before " (". No mythic
 *                    exclusion. First wins. (`equipment.js` called this the "compendium variant"
 *                    fallback, for rows like "Belt of Physical Might +2 (Str & Dex)".)
 *   spells         — exact full name only, and LAST wins, because it built a `Map` in a loop and
 *                    `Map.set` overwrites. There are no duplicate spell names today so first and
 *                    last agree, but encoding the rule that was actually there costs one comparison
 *                    and means a future duplicate behaves as it always would have.
 *
 * `FAMILIES` below is those rules, written down once. A stage names the family it wants and gets
 * that family's semantics; nothing outside this file decides how a name resolves any more.
 *
 * ## Two sources, one interface
 *
 * `lookup()` is SYNCHRONOUS. What a pack-backed family needs first is a **prime**:
 * `await prime(family, names)` resolves the names it is given and fetches just those documents.
 * Every name is knowable before its stage runs — they are all fields on the backend payload — which
 * is what makes one batch possible instead of an await per lookup. The precedent is
 * `createCompanions.js`'s `featResolver`.
 *
 * A JSON-backed family ignores `prime` and indexes the array on first ask. `everyWeapon`,
 * `everyArmor` and `everyClass` stay on that path — see `tools/build_all_packs.macro.js` for why
 * they cannot be packs.
 *
 * ## The order stamp is load-bearing
 *
 * "First wins" needs an order, and a compendium is keyed by `_id`, so LevelDB returns rows in an
 * order unrelated to the bundle's. Each document carries `flags.pf1e_random_char_generator.idx`,
 * its position in the source array; the index keeps the lowest (or highest, for `prefer: 'last'`).
 * 445 feat keys and 142 item keys have more than one candidate — "skill focus" alone has 39 — so
 * without this a character would quietly get a different variant on every sheet.
 *
 * **A pack whose documents lack the stamp is refused**, with a warning, rather than resolved
 * arbitrarily. Silence there would be the worst outcome, because it looks like it works.
 *
 * ## Rows come back SHARED, not cloned
 *
 * A returned row is the live object out of the session cache (JSON) or the primed map (pack), so
 * **clone before you write**. The callers that mutate already do, right where they mutate.
 * `applyFeatTax` resolves a row only to read its name and description, and cloning on its behalf
 * would add a deep copy per tax child to pay for a write that never happens.
 */

const MODULE_ID = 'pf1e_random_char_generator';
const IDX_FIELD = `flags.${MODULE_ID}.idx`;

/**
 * Every bundle the stages resolve names in, its matching rule, and its pack when it has one.
 *
 * `packs` absent means JSON-only. `everyItem` names the same pack on both branches because
 * `every_item.json` has no `_MODS` twin — it never swapped.
 */
const FAMILIES = {
  everyFeat: {
    packs: { base: `${MODULE_ID}.feats`, mods: `${MODULE_ID}.feats-mods` },
    match: 'base', skipMythic: true, prefer: 'first',
  },
  everyTrait: {
    packs: { base: `${MODULE_ID}.traits`, mods: `${MODULE_ID}.traits-mods` },
    match: 'base', skipMythic: true, prefer: 'first',
  },
  everyItem: {
    packs: { base: `${MODULE_ID}.items`, mods: `${MODULE_ID}.items` },
    match: 'both', skipMythic: false, prefer: 'first',
  },
  everySpell: {
    packs: { base: `${MODULE_ID}.spells`, mods: `${MODULE_ID}.spells-mods` },
    match: 'exact', skipMythic: false, prefer: 'last',
  },
  // JSON-only, but they still resolve through here so the rule lives in one place.
  everyWeapon: { match: 'both', skipMythic: false, prefer: 'first' },
  everyArmor: { match: 'both', skipMythic: false, prefer: 'first' },
};

/**
 * The name a row is found by when the exact name misses: everything before the first " (",
 * lowercased.
 *
 * Applied to the ROW, never to the query. A query of "Weapon Focus (Longsword)" matched nothing
 * before this module existed — the candidate keys never contain " (" — and normalising the query too
 * would quietly start resolving it to plain "Weapon Focus".
 *
 * Exported so `tools/verify_all_packs.macro.js` replays the resolution with THIS rule rather than a
 * copy of it — a verifier that normalised differently would answer a question nobody asked.
 */
export const baseKey = (name) => name.split(' (')[0].toLowerCase();

/** Bundle array -> `Map<family, index>`. The JSON path, per session. */
const jsonIndexes = new WeakMap();

/**
 * Pack id -> `{index, rows}`, kept for the whole session rather than per generation.
 *
 * MODULE-LEVEL ON PURPOSE, mirroring what the JSON path gets from the WeakMap above. Held on the
 * catalog instance instead, every generation re-walked all 8,816 index entries to rebuild the same
 * name map and re-fetched documents it already had — the bench caught it as a warm build going from
 * 12 ms to 26 ms. Safe because a shipped pack is locked and cannot change mid-session.
 */
const packState = new Map();

/** Drop the per-session pack indexes and fetched rows. Paired with `reloadTemplates()`. */
export function clearPackCache() {
  packState.clear();
}

const usable = (policy, name) =>
  typeof name === 'string' && (!policy.skipMythic || !name.includes('(Mythic)'));

/** Should a later candidate displace the one already held for this key? */
const displaces = (policy, incomingIdx, heldIdx) =>
  policy.prefer === 'last' ? incomingIdx > heldIdx : incomingIdx < heldIdx;

/**
 * `{exact, base}` name maps for one bundle, built to that family's rule.
 *
 * Both maps are populated only when the rule needs both; a family that matches one way pays for one
 * map. `value` is whatever the caller wants keyed — the row itself on the JSON path, `{id, idx}` on
 * the pack path — so the same builder serves both.
 */
function buildIndex(policy, entries) {
  const exact = new Map();
  const base = new Map();

  entries.forEach(({ name, idx, value }) => {
    if (!usable(policy, name)) return;

    if (policy.match === 'exact' || policy.match === 'both') {
      const key = name.toLowerCase();
      const held = exact.get(key);
      if (!held || displaces(policy, idx, held.idx)) exact.set(key, { idx, value });
    }
    if (policy.match === 'base' || policy.match === 'both') {
      const key = baseKey(name);
      const held = base.get(key);
      if (!held || displaces(policy, idx, held.idx)) base.set(key, { idx, value });
    }
  });

  return { exact, base };
}

/** Apply the family's rule to one query against a built index. */
function resolve(policy, index, query) {
  const key = String(query).toLowerCase();
  if (policy.match === 'exact') return index.exact.get(key)?.value ?? null;
  if (policy.match === 'base') return index.base.get(key)?.value ?? null;
  // 'both': exact name first, then the parenthesis-stripped fallback.
  return (index.exact.get(key) ?? index.base.get(key))?.value ?? null;
}

function jsonIndexFor(bundle, family, policy) {
  let byFamily = jsonIndexes.get(bundle);
  if (!byFamily) { byFamily = new Map(); jsonIndexes.set(bundle, byFamily); }

  const cached = byFamily.get(family);
  if (cached) return cached;

  const index = buildIndex(policy, bundle.map((row, idx) => ({ name: row?.name, idx, value: row })));
  byFamily.set(family, index);
  return index;
}

/**
 * Make a pack document indistinguishable from the JSON row it was built from.
 *
 * Two fields exist only because it went through a compendium, and both would otherwise ride onto the
 * sheet and show up as a difference from a JSON run:
 *
 *   `_id`  — Foundry minted it on import. The bundle rows have never carried one.
 *   `flags.pf1e_random_char_generator.idx` — the source-order stamp, build metadata rather than
 *          sheet data. The golden harness caught it reaching the actor on the first run.
 *
 * `flags` itself is removed when emptying the namespace leaves nothing behind, because the bundles
 * were stripped of empty containers and a bare `flags: {}` would be one more difference.
 */
function stripPackMetadata(data) {
  delete data._id;
  if (data.flags && typeof data.flags === 'object') {
    delete data.flags[MODULE_ID];
    if (!Object.keys(data.flags).length) delete data.flags;
  }
  return data;
}

/**
 * Build the catalog for one run.
 *
 * @param {object} templates  the loaded bundle dictionary, still the source for JSON-backed families.
 * @param {object} [options]
 * @param {string} [options.modded]  `"y"`/`"n"`, as resolved by the loader AFTER its missing-file
 *                 fallback — so a downgraded modded run reads the base packs too, matching the
 *                 bundles it was handed.
 */
export function createCatalog(templates, { modded } = {}) {
  const branch = modded === 'y' ? 'mods' : 'base';

  /** family -> the shared `packState` entry for its pack, once primed. */
  const packed = new Map();
  /** Families that tried to use a pack and could not. Warned once, then treated as JSON. */
  const declined = new Set();

  function packFor(family) {
    if (declined.has(family)) return null;
    const id = FAMILIES[family]?.packs?.[branch];
    if (!id) return null;
    const pack = globalThis.game?.packs?.get(id);
    if (!pack) {
      console.warn(`Catalog: no compendium "${id}" — falling back to ${family} JSON.`);
      declined.add(family);
      return null;
    }
    return pack;
  }

  /**
   * Resolve names to documents for one family, in a single batch.
   *
   * Safe to call more than once per family — the second call fetches only what the first did not,
   * which is what lets the feat stage prime its buckets and its tax chains separately without
   * paying twice.
   */
  async function prime(family, names) {
    const policy = FAMILIES[family];
    if (!policy) return false;
    const pack = packFor(family);
    if (!pack) return false;

    const packId = pack.metadata?.id ?? policy.packs[branch];
    let state = packState.get(packId);

    if (!state) {
      // The index is requested WITH the order field, because getIndex caches per field set: asking
      // once with it costs a single query, asking without and then with costs two.
      let entries;
      try {
        entries = await pack.getIndex({ fields: [IDX_FIELD] });
      } catch (error) {
        console.warn(`Catalog: could not index "${packId}" — falling back to ${family} JSON.`, error);
        declined.add(family);
        return false;
      }

      const rowsForIndex = [];
      let stamped = 0;
      for (const entry of entries) {
        const idx = entry?.flags?.[MODULE_ID]?.idx;
        if (!Number.isInteger(idx)) continue;
        stamped++;
        rowsForIndex.push({ name: entry.name, idx, value: entry._id });
      }

      if (!stamped) {
        console.warn(`Catalog: "${packId}" carries no ${IDX_FIELD} on any document. Its rows would `
          + `resolve in an arbitrary order, so it is being ignored — rebuild it with `
          + `tools/build_all_packs.macro.js. Falling back to ${family} JSON.`);
        declined.add(family);
        return false;
      }

      state = { index: buildIndex(policy, rowsForIndex), rows: new Map() };
      packState.set(packId, state);
    }
    packed.set(family, state);

    const wanted = new Map();
    for (const raw of names) {
      const key = String(raw).toLowerCase();
      if (state.rows.has(key)) continue;
      const id = resolve(policy, state.index, key);
      // A miss is recorded as null so the stage's synthesize-on-miss branch fires exactly as it did
      // on the JSON path, and so a repeated prime does not re-look-up a name known to be absent.
      if (!id) { state.rows.set(key, null); continue; }
      wanted.set(key, id);
    }

    await Promise.all([...wanted].map(async ([key, id]) => {
      try {
        const doc = await pack.getDocument(id);
        const data = doc?.toObject ? doc.toObject() : (doc ? { ...doc } : null);
        state.rows.set(key, data ? stripPackMetadata(data) : null);
      } catch (error) {
        console.warn(`Catalog: could not fetch "${key}" from ${family}.`, error);
        state.rows.set(key, null);
      }
    }));

    return true;
  }

  const lookup = (family, query) => {
    const policy = FAMILIES[family];
    if (!policy) return null;

    const state = packed.get(family);
    if (state) return state.rows.get(String(query).toLowerCase()) ?? null;

    const bundle = templates?.[family];
    if (!Array.isArray(bundle)) return null;
    return resolve(policy, jsonIndexFor(bundle, family, policy), query);
  };

  return {
    /** Resolve a batch of names for a pack-backed family. No-op for JSON-backed ones. */
    prime,
    /** A row out of any named family, or null. Synchronous; pack families must be primed first. */
    lookup,
    /** A feat row, or null when neither the pack nor the bundle has one. */
    feat: (name) => lookup('everyFeat', name),
    /** A trait row, or null. */
    trait: (name) => lookup('everyTrait', name),
    /** An item row, or null. Exact name first, then the parenthesised-variant fallback. */
    item: (name) => lookup('everyItem', name),
    /** A spell row, or null. Exact name only. */
    spell: (name) => lookup('everySpell', name),
  };
}
