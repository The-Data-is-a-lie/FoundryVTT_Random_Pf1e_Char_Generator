/**
 * The Foundry surface, stubbed once for every harness in this repo.
 *
 * `modify-abilities.js` reaches for `fetch`, `FilePicker`, `localStorage`, `game.modules`,
 * `game.packs`, `ui.notifications` and `pf1.config` — none of which exist under bare `node`. Before
 * this module each harness re-stubbed its own subset, which is why `test_create_companions.mjs`
 * covers the companion path and nothing else. The interface here is one call in and one handle out;
 * everything about how a Foundry global is faked is depth behind it.
 *
 * TWO PROPERTIES ARE LOAD-BEARING and must survive any edit to this file:
 *
 *   1. TEMPLATE DATA IS REAL. `fetch` reads the actual JSON off `templates/`, never a mock. That is
 *      the whole reason the suite notices when someone edits `custom_buffs.json` into a shape the
 *      builder cannot read. A stubbed template would turn every harness into a test of the stub.
 *
 *   2. THE CACHE IS SHARED AND UNCLONED, ON PURPOSE. Parsing ~90 MB per fixture seven times over is
 *      unaffordable, so each file is parsed once and the SAME object is handed to every run. That is
 *      exactly what the cache ticket 03 designs will do in production, which makes this harness the
 *      place that finds out whether the build mutates its own templates. `drainMutatedTemplates()`
 *      is that check: it hashes every served file after a run and names the ones that moved. Handing
 *      out `structuredClone`s instead would be "safer" and would silently hide the one bug this
 *      arrangement exists to catch.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MODULE_ROOT = path.resolve(HERE, '..');
export const FIXTURES = path.join(HERE, 'fixtures');

/** The URL prefix Foundry serves this module's files under. */
const URL_PREFIX = 'modules/pf1e_random_char_generator/';

/** Files parsed once and shared across every run in the process. Keyed by absolute path. */
const templateCache = new Map();
/** Absolute path -> hash of the file's content as first parsed. */
const pristineHashes = new Map();

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Map a Foundry-relative URL onto this checkout. Returns null for anything outside the module. */
function resolveUrl(url) {
  const clean = String(url).replace(/^\/+/, '').split('?')[0];
  if (!clean.startsWith(URL_PREFIX)) return null;
  return path.join(MODULE_ROOT, clean.slice(URL_PREFIX.length));
}

function loadTemplate(absolute) {
  if (templateCache.has(absolute)) return templateCache.get(absolute);
  const parsed = JSON.parse(readFileSync(absolute, 'utf-8'));
  templateCache.set(absolute, parsed);
  pristineHashes.set(absolute, hash(parsed));
  return parsed;
}

/**
 * Names every template the last run mutated in place, and puts the cache back the way it was.
 *
 * This IS ticket 03's predicted bug, and the first run of the harness found it is bigger than the
 * ticket thought: not one `processItem` site but NINE template files come back changed from a single
 * generation. It is invisible in production only because `loadFiles()` re-fetches and re-parses all
 * ~90 MB on every click, so each generation starts from clean data and pays 90 MB for the privilege.
 * The moment ticket 03 adds the cache it is designing, this becomes cross-generation corruption:
 * the second character built in a session inherits the first one's damage.
 *
 * RESTORING IS NOT PAPERING OVER IT. The harness has to reproduce production, and production hands
 * every generation pristine data; without the restore, fixture 2 would be testing fixture 1's
 * leftovers and the goldens would depend on run order. The finding is kept by the caller, which
 * records the mutated set in the golden — so today's damage is written down and any NEW mutation is
 * a diff.
 */
export function drainMutatedTemplates() {
  const moved = [];
  for (const [absolute, parsed] of templateCache) {
    if (hash(parsed) === pristineHashes.get(absolute)) continue;
    moved.push(path.relative(MODULE_ROOT, absolute).replace(/\\/g, '/'));
    templateCache.set(absolute, JSON.parse(readFileSync(absolute, 'utf-8')));   // pristine again
  }
  return moved.sort();
}

/** Drop the cache entirely. Only needed if a test wants to prove the first-run path. */
export function clearTemplateCache() {
  templateCache.clear();
  pristineHashes.clear();
}

// ---- compendium packs ---------------------------------------------------------------------------

/**
 * Foundry stores packs as LevelDB directories, which bare node cannot read, and a native LevelDB
 * dependency was rejected (ticket 11). So the packs are dumped to JSON by a GM macro,
 * `tools/dump_packs.macro.js`, and read from `tools/fixtures/packs/` here.
 *
 * A MISSING DUMP IS NOT AN ERROR — it reports the owning module as INACTIVE, which is a real code
 * path the build supports (a user without pf1spheres installed). It is a coverage hole, not a
 * failure, so `loadPackFixtures` returns what is missing and the harness says so out loud rather
 * than quietly recording goldens for half the file.
 */
export function loadPackFixtures(wanted) {
  const packs = new Map();
  const present = new Set();
  const missing = [];
  const stale = [];

  for (const { module: moduleId, packId } of wanted) {
    const file = path.join(FIXTURES, 'packs', `${packId}.json`);
    if (!existsSync(file)) { missing.push(packId); continue; }
    const dump = JSON.parse(readFileSync(file, 'utf-8'));
    const documents = dump.documents ?? [];
    packs.set(packId, {
      documents,
      async getDocuments() { return documents.map((d) => ({ ...d, toObject: () => structuredClone(d) })); },
      async getIndex() { return documents.map((d) => ({ _id: d._id, name: d.name })); },
      async getDocument(id) {
        const found = documents.find((d) => d._id === id);
        return found ? { ...found, toObject: () => structuredClone(found) } : undefined;
      },
    });
    present.add(moduleId);

    // The dumps go stale silently when a third-party module updates; nothing detects that but this.
    // A warning, not a failure: a version bump usually changes nothing the build reads, and a red
    // suite on someone else's release would train people to ignore it.
    const installed = path.join(MODULE_ROOT, '..', moduleId, 'module.json');
    if (dump._source?.version && existsSync(installed)) {
      const live = JSON.parse(readFileSync(installed, 'utf-8')).version;
      if (String(live) !== String(dump._source.version)) {
        stale.push(`${packId}: dumped from ${moduleId} v${dump._source.version}, installed is v${live}`);
      }
    }
  }
  return { packs, present, missing, stale };
}

// ---- this module's OWN packs, served out of the template JSON ------------------------------------

/**
 * The module ships `packs/feats`, `packs/traits` and their `_MODS` twins as LevelDB compendiums, and
 * `catalog.js` reads them. Bare node cannot open LevelDB (ticket 11 again), so the harness has to
 * fake them — and the honest way is to build the fakes from the SAME JSON the packs were generated
 * from. `templates/character_sheet_folder/every_feat.json` is already in the repo as the pack's
 * rebuild source, so serving it here costs nothing: no dumped fixture, no extra committed bytes, and
 * no second copy that can drift from the first.
 *
 * WHAT IS AND IS NOT UNDER TEST. The catalog's real code path runs — pack resolution, the indexed
 * lookup, `getIndex({fields})`, `getDocument()`, the lowest-`idx` tiebreak. What does not run is
 * LevelDB itself, which is Foundry's code, not ours. That is the same trade `fetch` already makes by
 * reading real files off disk instead of speaking HTTP.
 *
 * IDS ARE DERIVED, NOT RANDOM, for the same reason `mintId` is: a golden that changed every run
 * would be worthless. Same row, same id, run after run.
 */
const MODULE_ID = 'pf1e_random_char_generator';
const IDX_FLAG = `flags.${MODULE_ID}.idx`;

/** Which template bundle backs which shipped pack. Mirrors `tools/build_all_packs.macro.js`. */
const MODULE_PACK_SOURCES = {
  [`${MODULE_ID}.feats`]: 'every_feat.json',
  [`${MODULE_ID}.feats-mods`]: 'every_feat_MODS.json',
  [`${MODULE_ID}.traits`]: 'every_trait.json',
  [`${MODULE_ID}.traits-mods`]: 'every_trait_MODS.json',
};

const setPath = (target, path, value) => {
  const parts = path.split('.');
  let node = target;
  for (const part of parts.slice(0, -1)) node = (node[part] ??= {});
  node[parts.at(-1)] = value;
};

const getPath = (source, path) => path.split('.').reduce((node, part) => node?.[part], source);

/**
 * Build stubs for the module's own packs, keyed by pack id, ready to merge into `installFoundryStubs`'s
 * `packs` map.
 *
 * The `idx` flag is stamped from the array position exactly as the build macro does it, because it is
 * what makes a lookup deterministic: 445 feat names have more than one candidate, and the catalog
 * resolves them by lowest `idx`. A harness that omitted the stamp would pass while production
 * resolved those names differently.
 */
export function loadModulePacks() {
  const packs = new Map();

  for (const [packId, file] of Object.entries(MODULE_PACK_SOURCES)) {
    const absolute = path.join(MODULE_ROOT, 'templates', 'character_sheet_folder', file);
    if (!existsSync(absolute)) continue;

    const parsed = loadTemplate(absolute);
    const rows = Array.isArray(parsed) ? parsed : (parsed.items ?? []);

    // Built once per process and shared, like the template cache above. Each document is cloned on
    // the way out, so a build that writes to what it fetched cannot corrupt the next fixture.
    const documents = rows.map((row, i) => {
      const id = createHash('sha256').update(`${packId}:${i}:${row?.name ?? ''}`)
        .digest('hex').slice(0, 16);
      const doc = { ...row, _id: id };
      setPath(doc, IDX_FLAG, i);
      return doc;
    });
    const byId = new Map(documents.map((d) => [d._id, d]));

    packs.set(packId, {
      documents,
      locked: true,
      metadata: { id: packId, type: 'Item' },
      /**
       * Foundry's index carries `_id`/`name`/`img` and nothing else unless asked. Honour that
       * exactly: a stub that handed back whole documents would let a catalog bug — reading a field
       * it never requested — pass here and fail in a real world.
       */
      async getIndex({ fields = [] } = {}) {
        return documents.map((doc) => {
          const entry = { _id: doc._id, name: doc.name, img: doc.img };
          for (const field of fields) {
            const value = getPath(doc, field);
            if (value !== undefined) setPath(entry, field, value);
          }
          return entry;
        });
      },
      async getDocument(id) {
        const found = byId.get(id);
        return found ? { ...found, toObject: () => structuredClone(found) } : undefined;
      },
      async getDocuments() {
        return documents.map((d) => ({ ...d, toObject: () => structuredClone(d) }));
      },
    });
  }

  return packs;
}

// ---- the stub surface ---------------------------------------------------------------------------

/**
 * Install the globals `modify-abilities.js` expects.
 *
 * @param {object}  options
 * @param {object}  options.storage        seed key -> value (value is JSON.stringify'd unless a string)
 * @param {Set}     options.activeModules  module ids `game.modules.get(id).active` should answer true for
 * @param {Map}     options.packs          pack id -> pack stub, from loadPackFixtures
 * @param {boolean} options.captureConsole silence and record console output (default true)
 * @returns a handle with the storage map, captured output, and a restore()
 */
export function installFoundryStubs({
  storage = {},
  activeModules = new Set(),
  packs = new Map(),
  captureConsole = true,
} = {}) {
  const saved = {
    fetch: globalThis.fetch, FilePicker: globalThis.FilePicker, localStorage: globalThis.localStorage,
    game: globalThis.game, ui: globalThis.ui, pf1: globalThis.pf1, CONFIG: globalThis.CONFIG,
    log: console.log, warn: console.warn, error: console.error,
  };

  // ---- localStorage --------------------------------------------------------------------------
  // A fresh Map per install, which is the point: in a browser this bus PERSISTS across generations,
  // so a key an earlier run wrote is still there for the next one. Starting empty is stricter than
  // production and will surface anything that reads a key it never wrote.
  const store = new Map();
  for (const [key, value] of Object.entries(storage)) {
    store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  };

  // ---- fetch, over the real template files ---------------------------------------------------
  const served = new Set();
  globalThis.fetch = async (url) => {
    const absolute = resolveUrl(url);
    if (!absolute || !existsSync(absolute)) {
      // Foundry answers a missing file with an HTML error page, and readFile() in the build checks
      // .ok before parsing precisely because of that. Reproduce the shape, not a thrown error.
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => { throw new SyntaxError('Unexpected token <'); }, text: async () => '<!DOCTYPE html>' };
    }
    served.add(absolute);
    const data = loadTemplate(absolute);
    return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
  };

  // ---- FilePicker ----------------------------------------------------------------------------
  // Returns Foundry's shape: `target` echoes the requested path and `files` are full relative paths.
  // The MODS fallback check reads `files` to decide whether the modded templates are installed, so a
  // wrong shape here silently sends every fixture down the base-template branch.
  globalThis.FilePicker = {
    async browse(_source, target) {
      const absolute = resolveUrl(target);
      const clean = String(target).replace(/\/+$/, '');
      if (!absolute || !existsSync(absolute)) return { target: clean, dirs: [], files: [] };
      const entries = readdirSync(absolute, { withFileTypes: true });
      return {
        target: clean,
        dirs: entries.filter((e) => e.isDirectory()).map((e) => `${clean}/${e.name}`),
        files: entries.filter((e) => e.isFile()).map((e) => `${clean}/${e.name}`),
      };
    },
  };

  // ---- game ----------------------------------------------------------------------------------
  // `game.modules.get(id)` must answer for the module itself too: main() bails at line 6 if it
  // cannot find 'pf1e_random_char_generator', which would make every fixture return early.
  globalThis.game = {
    modules: {
      get: (id) => {
        if (id === 'pf1e_random_char_generator') return { id, active: true, version: '0.0.0-test' };
        return activeModules.has(id) ? { id, active: true } : undefined;
      },
    },
    packs: { get: (id) => packs.get(id) },
    settings: { get: () => undefined, set: async () => undefined },
    i18n: { localize: (key) => key, format: (key) => key },
  };

  // ---- pf1 / CONFIG --------------------------------------------------------------------------
  // Real, localised language ids dumped from the installed pf1 system. normalizeLanguages() sorts a
  // name into traits.languages.value or .custom by looking it up here, so a stubbed-empty map would
  // push every language into .custom and change the golden for every fixture.
  const pf1Config = existsSync(path.join(FIXTURES, 'pf1-config.json'))
    ? JSON.parse(readFileSync(path.join(FIXTURES, 'pf1-config.json'), 'utf-8'))
    : { languages: {} };
  globalThis.pf1 = { config: { languages: pf1Config.languages ?? {} } };
  globalThis.CONFIG = { PF1: { languages: pf1Config.languages ?? {} } };

  // ---- ui.notifications + console ------------------------------------------------------------
  const captured = { info: [], warn: [], error: [], notifications: [] };
  globalThis.ui = {
    notifications: {
      info: (m) => captured.notifications.push(`INFO ${m}`),
      warn: (m) => captured.notifications.push(`WARN ${m}`),
      error: (m) => captured.notifications.push(`ERROR ${m}`),
    },
  };
  if (captureConsole) {
    // The build logs the whole exportTemplate at the end. Left uncaptured that is megabytes of noise
    // per fixture; left captured forever it swallows the harness's own failure report, which is a
    // mistake the companion harness already made and documented. restore() is not optional.
    console.log = (...a) => captured.info.push(a.map(String).join(' '));
    console.warn = (...a) => captured.warn.push(a.map(String).join(' '));
    console.error = (...a) => captured.error.push(a.map(String).join(' '));
  }

  return {
    storage: store,
    captured,
    served,
    /** What the build wrote out. This is the snapshot. */
    exportTemplate() {
      const raw = store.get('exportFoundryPath');
      return raw == null ? null : JSON.parse(raw);
    },
    restore() {
      console.log = saved.log; console.warn = saved.warn; console.error = saved.error;
      globalThis.fetch = saved.fetch; globalThis.FilePicker = saved.FilePicker;
      globalThis.localStorage = saved.localStorage; globalThis.game = saved.game;
      globalThis.ui = saved.ui; globalThis.pf1 = saved.pf1; globalThis.CONFIG = saved.CONFIG;
    },
  };
}

// ---- deterministic run context (ticket 01) -------------------------------------------------------

/**
 * The `deps` main() takes. Production passes nothing and stays random; this makes a run repeatable.
 *
 * `mintId` is CONTENT-DERIVED, not sequential, and that is the whole design. A counter would be
 * simpler and would also mean that inserting one item anywhere renumbers every id after it — so the
 * golden diff on tickets 06 (merging five duplicated conditional blocks) and 07 (de-duplicating
 * helpers) would be a wall of id churn hiding the one line that actually changed. Hashing the
 * content instead keeps an item's id stable as long as the item is.
 *
 * The cost of dropping the counter is that identical content now collides where a sequence could
 * not. Two defences: an occurrence index per (kind, key) so the second identical change row hashes
 * differently from the first, and a re-hash loop against ids already handed out.
 */
export function deterministicDeps({ seed = 1 } = {}) {
  const occurrences = new Map();
  const issued = new Set();      // full ids AND their 8-char prefixes, so both stay unique
  const minted = new Set();      // full ids only -- comparable against the call count
  let calls = 0;

  // mulberry32 — a tiny, well-behaved PRNG. Any seeded generator would do; what matters is that the
  // same seed gives the same ammo pick, and that it is written down rather than being Math.random.
  let state = seed >>> 0;
  const rng = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const toBase62 = (hex, length) => {
    let out = '';
    let value = BigInt('0x' + hex);
    for (let i = 0; i < length; i++) { out += BASE62[Number(value % 62n)]; value /= 62n; }
    return out;
  };

  const mintId = (kind, key) => {
    calls++;
    // JSON.stringify is order-sensitive on objects, which is fine: the key is a live object built by
    // the code under test, and its key order is as deterministic as the code that built it.
    let seedText;
    try { seedText = `${kind} ${JSON.stringify(key) ?? 'null'}`; }
    catch { seedText = `${kind} ${String(key)}`; }        // circular / unserialisable

    const n = (occurrences.get(seedText) ?? 0) + 1;
    occurrences.set(seedText, n);

    // Most callers slice(0, 8) off the front -- pf1's ChangeModel and every conditional/modifier row
    // want a short id -- so the PREFIX has to be unique too. Checking only the full 16 would let two
    // change rows land on the same 8-character _id, and pf1 collapses embedded rows that share one.
    let id;
    let salt = 0;
    do {
      id = toBase62(createHash('sha256').update(`${seedText} ${n} ${salt}`).digest('hex'), 16);
      salt++;
    } while (issued.has(id) || issued.has(id.slice(0, 8)));
    issued.add(id);
    issued.add(id.slice(0, 8));
    minted.add(id);
    return id;
  };

  // `minted.size === calls` is the uniqueness property, checked at the source. Asserting it on the
  // built sheet instead would be weaker AND noisier: template files supply plenty of ids the build
  // never chose, including duplicates it is not responsible for.
  return { rng, mintId, minted, get calls() { return calls; } };
}
