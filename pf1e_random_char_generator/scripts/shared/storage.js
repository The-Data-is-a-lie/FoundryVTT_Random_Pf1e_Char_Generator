/**
 * The `localStorage` bus between the module's files, stated once.
 *
 * Four untyped string keys were the entire interface between `button.js`, `deliver-data.js`,
 * `modify-abilities.js` and `createCharacter.js`. Nothing declared their shape, nothing validated
 * them, and one of them is pinned to a contract in a different repository. This module does not
 * change the transport — it labels it, so a malformed payload fails at the contract instead of
 * three files later on a field access.
 *
 * | Key                    | Written by        | Read by                                  |
 * |------------------------|-------------------|------------------------------------------|
 * | `deliverData.json`     | the dialog        | the dialog (remembered form state), main |
 * | `addCustomBuffs`       | the dialog        | the dialog, main                         |
 * | `pulledCharacterData`  | `deliver-data.js` | main, `createCharacter.js`               |
 * | `exportFoundryPath`    | main              | `createCharacter.js`; cleared by the button |
 *
 * `addCustomBuffs` is stored SEPARATELY from `deliverData.json` on purpose: the backend exposes a
 * fixed 19-input endpoint, and folding a twentieth field into that payload breaks it. That
 * positional contract lives in the generator repo and this module cannot change it — but it should
 * not be invisible either, which is why it is written down here.
 *
 * Not covered here: the ~60 intra-build breadcrumb writes inside `modify-abilities.js`. Those are
 * bookkeeping within one run, not a contract between files, and they are being retired onto the
 * build context rather than given an accessor.
 */

const KEY = {
  deliverData: 'deliverData.json',
  customBuffs: 'addCustomBuffs',
  characterPayload: 'pulledCharacterData',
  exportPath: 'exportFoundryPath',
};

/**
 * Parse a stored key, returning `null` rather than throwing.
 *
 * The bus carries JSON as strings with no schema, so a truncated or half-written value used to
 * surface as a `SyntaxError` from whichever file happened to read it first. Failing here names the
 * key that is bad.
 */
function readJson(key) {
  const raw = localStorage.getItem(key);
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Character Generator: '${key}' in localStorage is not valid JSON —`, error);
    return null;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// --- deliverData.json: the dialog's remembered form state, and the backend request body ---------

/** The dialog's saved inputs. Always an object — an unset or unreadable key reads as `{}`. */
export function readDeliverData() {
  return readJson(KEY.deliverData) || {};
}

export function writeDeliverData(data) {
  writeJson(KEY.deliverData, data);
}

// --- addCustomBuffs: the twentieth input, kept out of the 19-input backend payload --------------

/**
 * The custom-buffs flag as the dialog stored it, defaulting to `"n"`. Returned verbatim rather
 * than folded to lower case: the dialog compares it against its own option values.
 */
export function readCustomBuffsFlag() {
  return localStorage.getItem(KEY.customBuffs) || 'n';
}

export function writeCustomBuffsFlag(value) {
  localStorage.setItem(KEY.customBuffs, value);
}

// --- pulledCharacterData: the backend's generated character --------------------------------

/**
 * The backend payload, or `null` if there is none.
 *
 * Callers must still check what came back. The backend wraps a generation exception as
 * `{"error": "..."}`, so a payload that parses fine can still be a failed generation — a shape
 * this module deliberately does not judge, because the two callers respond to it differently.
 */
export function readCharacterPayload() {
  return readJson(KEY.characterPayload);
}

export function writeCharacterPayload(payload) {
  writeJson(KEY.characterPayload, payload);
}

// --- exportFoundryPath: the built sheet, handed from the build to actor creation ----------------

/** The built actor payload, or `null` if the last run produced none. */
export function readExportPath() {
  return readJson(KEY.exportPath);
}

/** Whether a built sheet is waiting to be injected. */
export function hasExportPath() {
  return !!localStorage.getItem(KEY.exportPath);
}

export function writeExportPath(sheet) {
  writeJson(KEY.exportPath, sheet);
}

/**
 * Drop the previous run's built sheet.
 *
 * Called before a run starts: if any step of the build then fails, there is nothing stale left for
 * actor creation to inject as a bogus "new" character. The guard protects an invariant between the
 * build and actor creation, so it lives here rather than in the button that happens to call it.
 */
export function clearExportPath() {
  localStorage.removeItem(KEY.exportPath);
}
