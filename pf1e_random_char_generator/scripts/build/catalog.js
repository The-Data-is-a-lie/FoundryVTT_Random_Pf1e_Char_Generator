/**
 * Finding a row by name — from a compendium pack when one is installed, from the JSON bundle when
 * it is not.
 *
 * ## Why this exists
 *
 * `template-loader.js` hands out the parsed bundles as bare arrays, so every stage that wanted a row
 * by name wrote its own scan. `every_feat.json` is 8,816 rows and the feat stage scanned it once per
 * placed feat across nine buckets, then AGAIN inside `applyFeatTax` for every granted chain feat —
 * each scan re-deriving `name.split(' (')[0].toLowerCase()` for all 8,816 candidates to compare
 * against one query. `npm run bench` put the feat stage at 68% of everything the build did.
 *
 * Indexing fixed the CPU. Reading a pack fixes the rest: Foundry keeps a compendium's index (names
 * and ids) and fetches documents only when asked, so a build stops parsing and holding ~31 MB of
 * feat and trait JSON to use about fifty rows of it.
 *
 * ## Two sources, one interface
 *
 * `lookup()` is SYNCHRONOUS and stays that way, so the call sites in `feats.js` did not change.
 * What changed is that a pack-backed family must be **primed** first: `await prime(family, names)`
 * resolves the names it is given and fetches just those documents. Every name is knowable before the
 * stage runs — they are all fields on the backend payload — which is what makes one batch possible
 * instead of an await per lookup. The precedent is `createCompanions.js`'s `featResolver`, which
 * already does `getIndex()` → match names → `getDocument()` for the hits only.
 *
 * A JSON-backed family ignores `prime` entirely and indexes the array on first ask, exactly as
 * before. `everyClass`, `everyWeapon` and `everyArmor` stay on that path — see the notes in
 * `tools/build_all_packs.macro.js` for why they cannot be packs.
 *
 * ## The order stamp is load-bearing
 *
 * A lookup resolves a name to the FIRST matching row in bundle order, and 445 feat keys have more
 * than one candidate — "skill focus" has 39, "signature skill" 27. A compendium is keyed by `_id`,
 * so LevelDB returns rows in an order unrelated to the bundle's. Each document therefore carries
 * `flags.pf1e_random_char_generator.idx`, its position in the source array, and the index keeps the
 * LOWEST. Without it a character asking for Skill Focus would quietly get a different variant than
 * the JSON path gives, on every fixture, with nothing to say so.
 *
 * **A pack whose documents lack the stamp is not used.** It falls back to JSON with a warning rather
 * than resolving arbitrarily — silence there would be the worst outcome.
 *
 * ## Rows come back SHARED, not cloned
 *
 * Unchanged from the JSON-only version: a returned row is the live object out of the session cache
 * (JSON) or the primed map (pack), so **clone before you write**. The callers that mutate already
 * do, right where they mutate. `applyFeatTax` resolves a row only to read its name and description,
 * and cloning on its behalf would add a deep copy per tax child to pay for a write that never
 * happens.
 */

const MODULE_ID = 'pf1e_random_char_generator';
const IDX_FIELD = `flags.${MODULE_ID}.idx`;

/**
 * Which shipped pack backs which bundle name, per branch. A family absent here is JSON-only.
 * Mirrors the `packs` block in `module.json` and the targets in `tools/build_all_packs.macro.js`.
 */
const PACK_FOR = {
  everyFeat: { base: `${MODULE_ID}.feats`, mods: `${MODULE_ID}.feats-mods` },
  everyTrait: { base: `${MODULE_ID}.traits`, mods: `${MODULE_ID}.traits-mods` },
};

/** Bundle array -> `Map<lowercased base name, first matching row>`. The JSON path. Built on first ask. */
const indexes = new WeakMap();

/**
 * Pack id -> `{index, rows}`, kept for the whole session rather than per generation.
 *
 * MODULE-LEVEL ON PURPOSE, mirroring what the JSON path gets from the WeakMap above. Held on the
 * catalog instance instead, every generation re-walked all 8,816 index entries to rebuild the same
 * name map and re-fetched documents it already had — the bench caught it as a warm build going from
 * 12 ms to 26 ms, which would have made pack-reading a regression for the second character onward.
 *
 * Safe because a shipped pack is locked and cannot change mid-session. `reloadTemplates()` clears
 * this alongside the template cache for whoever is authoring pack data against a live world.
 */
const packState = new Map();

/** Drop the per-session pack indexes and fetched rows. Paired with `reloadTemplates()`. */
export function clearPackCache() {
  packState.clear();
}

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

/** Shared by both sources: is this row eligible to own a key at all? */
const eligible = (name) => typeof name === 'string' && !name.includes('(Mythic)');

/**
 * Make a pack document indistinguishable from the JSON row it was built from.
 *
 * Two fields exist only because it went through a compendium, and both would otherwise ride onto the
 * sheet and show up as a difference from a JSON run:
 *
 *   `_id`  — Foundry minted it on import. The bundle rows have never carried one.
 *   `flags.pf1e_random_char_generator.idx` — the source-order stamp this module puts on at build
 *          time purely so lookups can reproduce first-in-array-order. It is build metadata, not
 *          sheet data, and the golden harness caught it reaching the actor on the first run.
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

function indexFor(bundle) {
  const cached = indexes.get(bundle);
  if (cached) return cached;

  const index = new Map();
  for (const row of bundle) {
    // Mythic rows are excluded at build time rather than at lookup: a `.find()` skipped them and
    // returned the next match, and a key that never holds a mythic row does the same thing.
    if (!row || !eligible(row.name)) continue;
    const key = baseKey(row.name);
    // First one wins, because `.find()` returned the first match in array order.
    if (!index.has(key)) index.set(key, row);
  }

  indexes.set(bundle, index);
  return index;
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
  /** Families that tried to use a pack and could not. Logged once, then treated as JSON. */
  const declined = new Set();

  function packFor(family) {
    if (declined.has(family)) return null;
    const id = PACK_FOR[family]?.[branch];
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
    const pack = packFor(family);
    if (!pack) return false;

    const packId = pack.metadata?.id ?? PACK_FOR[family][branch];
    let state = packState.get(packId);

    if (!state) {
      // The index is requested WITH the order field, because getIndex caches per field set: asking
      // once with it costs a single query, asking without and then with costs two.
      let entries;
      try {
        entries = await pack.getIndex({ fields: [IDX_FIELD] });
      } catch (error) {
        console.warn(`Catalog: could not index "${pack.metadata?.id ?? family}" — falling back to JSON.`, error);
        declined.add(family);
        return false;
      }

      const index = new Map();
      let stamped = 0;
      for (const entry of entries) {
        if (!eligible(entry?.name)) continue;
        const idx = entry?.flags?.[MODULE_ID]?.idx;
        if (!Number.isInteger(idx)) continue;
        stamped++;
        const key = baseKey(entry.name);
        const held = index.get(key);
        // Lowest idx wins: that is the row `.find()` would have reached first in the source array.
        if (!held || idx < held.idx) index.set(key, { id: entry._id, idx });
      }

      if (!stamped) {
        console.warn(`Catalog: "${pack.metadata?.id ?? family}" carries no ${IDX_FIELD} on any document. `
          + `Its rows would resolve in an arbitrary order, so it is being ignored — rebuild it with `
          + `tools/build_all_packs.macro.js. Falling back to ${family} JSON.`);
        declined.add(family);
        return false;
      }

      state = { index, rows: new Map() };
      packState.set(packId, state);
    }
    packed.set(family, state);

    const wanted = [];
    for (const raw of names) {
      const key = String(raw).toLowerCase();
      if (state.rows.has(key)) continue;
      const hit = state.index.get(key);
      // A miss is recorded as null so the stage's synthesize-on-miss branch fires exactly as it did
      // on the JSON path, and so a repeated prime does not re-look-up a name known to be absent.
      if (!hit) { state.rows.set(key, null); continue; }
      wanted.push({ key, id: hit.id });
    }

    await Promise.all(wanted.map(async ({ key, id }) => {
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
    const key = String(query).toLowerCase();

    const state = packed.get(family);
    if (state) return state.rows.get(key) ?? null;

    const bundle = templates?.[family];
    if (!Array.isArray(bundle)) return null;
    return indexFor(bundle).get(key) ?? null;
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
  };
}
