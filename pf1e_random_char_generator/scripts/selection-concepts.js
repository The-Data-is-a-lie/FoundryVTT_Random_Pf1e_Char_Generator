/**
 * Build concepts: selection mode's Foundry side.
 *
 * A build concept is a NAMED set of pins -- classes with optional levels, a stat priority, arcane
 * schools, spheres, Path of War disciplines -- that the backend treats as guarantees and rolls the
 * rest of the character around (backend: `Backend/utils/class_func/selection.py`). This file owns
 * three things and nothing else:
 *
 *   1. STORAGE. Concepts live on the player's OWN User document, as a flag. Not in localStorage
 *      (which is per browser, so a player who switches machines would lose them) and not in a
 *      world setting (which only a GM may write, and which every player would share). A User flag
 *      is the one place that is both per player and writable by that player.
 *   2. THE REQUEST. `applySelectionToRequest` adds the active concept to a generation request as
 *      the named `selection` key -- but only after the backend has said it knows that key. See
 *      the function for why that check is not optional.
 *   3. THE EDITOR. A dialog whose every list comes from the backend's `GET /selection_options`.
 *      The module restates none of them: a class, sphere or discipline the backend learns is
 *      pinnable here the moment it is, and one it does not know cannot be offered.
 *
 * The pure parts (everything above the "Dialogs" banner) take what they need as arguments and touch
 * no globals, which is what lets `tools/selection_concepts.test.mjs` run them in plain node.
 */

export const MODULE_ID = 'pf1e_random_char_generator';
/** `{ [concept name]: selection }` on the User document. */
export const CONCEPTS_FLAG = 'buildConcepts';
/** The name of the concept this player generates with; '' or absent means none. */
export const ACTIVE_FLAG = 'activeBuildConcept';

/** The request keys a selection may carry -- the backend's `selection.REQUEST_KEYS`. */
export const SELECTION_KEYS = ['classes', 'stat_priority', 'schools', 'spheres', 'path_of_war', 'feats', 'build'];

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
/** How many pinned feats the one-line summary names before it says "+N more". */
const SUMMARY_FEATS = 4;
const SPECIALTY_TABLE_LABELS = {
  schools: 'Arcane schools',
  subschools: 'Focused subschools',
  elemental_schools: 'Elemental schools',
  elemental_subschools: 'Elemental subschools',
};

// ---------------------------------------------------------------------------------------------
// Pure: shaping a selection
// ---------------------------------------------------------------------------------------------

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
const list = (value) => (Array.isArray(value) ? value : (value === null || value === undefined || value === '' ? [] : [value]));
const uniqueStrings = (value) => [...new Set(list(value).map(text).filter(Boolean))];

/**
 * Reduce whatever a form or a stored flag holds to the selection the backend should receive, or
 * `null` when nothing is pinned.
 *
 * `null` matters: an empty selection must not be SENT. The backend treats `{}` as "nothing pinned"
 * too, but a backend that predates selection mode does not know the key at all (see
 * `applySelectionToRequest`), so "no pins" has to mean "no key".
 */
export function cleanSelection(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};

  const classes = [];
  for (const entry of list(raw.classes)) {
    const name = text(entry && typeof entry === 'object' ? entry.name : entry);
    if (!name || classes.some((c) => c.name === name)) continue;
    const level = Number.parseInt(entry && typeof entry === 'object' ? entry.level : NaN, 10);
    classes.push(Number.isInteger(level) && level >= 1 ? { name, level } : { name });
  }
  if (classes.length) out.classes = classes;

  const stats = [...new Set(uniqueStrings(raw.stat_priority).map((s) => s.toLowerCase()))];
  if (stats.length) out.stat_priority = stats;

  const schoolsRaw = raw.schools && typeof raw.schools === 'object' ? raw.schools : {};
  const schools = {};
  if (text(schoolsRaw.specialty)) schools.specialty = text(schoolsRaw.specialty);
  const preferred = uniqueStrings(schoolsRaw.preferred);
  const opposition = uniqueStrings(schoolsRaw.opposition);
  if (preferred.length) schools.preferred = preferred;
  if (opposition.length) schools.opposition = opposition;
  if (Object.keys(schools).length) out.schools = schools;

  const spheres = uniqueStrings(raw.spheres);
  if (spheres.length) out.spheres = spheres;

  const martialRaw = raw.path_of_war && typeof raw.path_of_war === 'object' ? raw.path_of_war : {};
  const martial = {};
  const disciplines = uniqueStrings(martialRaw.disciplines);
  if (disciplines.length) martial.disciplines = disciplines;
  const paths = Number.parseInt(martialRaw.paths, 10);
  if (Number.isInteger(paths) && paths >= 0 && text(martialRaw.paths) !== '') martial.paths = paths;
  if (Object.keys(martial).length) out.path_of_war = martial;

  // Feats keep the order they were pinned in: the backend takes them in that order, so the first
  // ones are the last to be squeezed out when the character has fewer slots than pins.
  const feats = [];
  for (const name of uniqueStrings(raw.feats)) {
    if (!feats.some((f) => f.toLowerCase() === name.toLowerCase())) feats.push(name);
  }
  if (feats.length) out.feats = feats;

  if (typeof raw.build === 'string' && text(raw.build)) out.build = text(raw.build);

  return Object.keys(out).length ? out : null;
}

/** True when the concept decides the class list -- the dialog's class dropdown is then moot. */
export function conceptPinsClasses(selection) {
  return !!cleanSelection(selection)?.classes?.length;
}

/** One line describing a concept, for the dropdown's tooltip and the editor's list. */
export function conceptSummary(selection) {
  const clean = cleanSelection(selection);
  if (!clean) return 'nothing pinned';
  const parts = [];
  if (clean.build) parts.push(`build: ${clean.build}`);
  if (clean.classes) {
    parts.push(clean.classes.map((c) => (c.level ? `${c.name} ${c.level}` : c.name)).join(' / '));
  }
  if (clean.stat_priority) parts.push(`stats ${clean.stat_priority.join(' > ')}`);
  if (clean.schools) {
    const s = clean.schools;
    const bits = [];
    if (s.specialty) bits.push(s.specialty);
    if (s.preferred) bits.push(`+${s.preferred.join(', ')}`);
    if (s.opposition) bits.push(`no ${s.opposition.join(', ')}`);
    parts.push(`schools: ${bits.join('; ')}`);
  }
  if (clean.spheres) parts.push(`spheres: ${clean.spheres.join(', ')}`);
  if (clean.path_of_war) {
    const p = clean.path_of_war;
    const bits = [];
    if (p.disciplines) bits.push(p.disciplines.join(', '));
    if (p.paths !== undefined) bits.push(`${p.paths} path${p.paths === 1 ? '' : 's'}`);
    parts.push(`Path of War: ${bits.join('; ')}`);
  }
  if (clean.feats) {
    const shown = clean.feats.slice(0, SUMMARY_FEATS);
    const more = clean.feats.length - shown.length;
    parts.push(`feats: ${shown.join(', ')}${more > 0 ? ` +${more} more` : ''}`);
  }
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------------------------
// Pure: storage on a User document (anything with getFlag / setFlag / unsetFlag)
// ---------------------------------------------------------------------------------------------

/** Every concept this user has saved, as `{ name: selection }`. Never null. */
export function readConcepts(user) {
  let stored;
  try {
    stored = user?.getFlag?.(MODULE_ID, CONCEPTS_FLAG);
  } catch (e) {
    stored = null;      // flag scope not registered yet (module still initialising)
  }
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  const out = {};
  for (const [name, selection] of Object.entries(stored)) {
    const clean = cleanSelection(selection);
    if (text(name) && clean) out[name] = clean;
  }
  return out;
}

/**
 * Save one concept. The whole map is written back rather than a dotted path, because a concept
 * NAME is free text and Foundry would read a "." in it as a path separator.
 */
export async function saveConcept(user, name, selection) {
  const key = text(name);
  const clean = cleanSelection(selection);
  if (!key) throw new Error('A build concept needs a name.');
  if (!clean) throw new Error('A build concept needs at least one pin.');
  const concepts = readConcepts(user);
  concepts[key] = clean;
  // unset first: setFlag MERGES objects, so a pin removed from a concept would otherwise survive.
  await user.unsetFlag(MODULE_ID, CONCEPTS_FLAG);
  await user.setFlag(MODULE_ID, CONCEPTS_FLAG, concepts);
  return clean;
}

export async function deleteConcept(user, name) {
  const concepts = readConcepts(user);
  if (!(name in concepts)) return false;
  delete concepts[name];
  await user.unsetFlag(MODULE_ID, CONCEPTS_FLAG);
  if (Object.keys(concepts).length) await user.setFlag(MODULE_ID, CONCEPTS_FLAG, concepts);
  if (readActiveConceptName(user) === name) await setActiveConcept(user, '');
  return true;
}

/** The active concept's name, or '' -- also '' when the named concept no longer exists. */
export function readActiveConceptName(user) {
  let name;
  try {
    name = user?.getFlag?.(MODULE_ID, ACTIVE_FLAG);
  } catch (e) {
    name = '';
  }
  name = text(name);
  return name && name in readConcepts(user) ? name : '';
}

export async function setActiveConcept(user, name) {
  const key = text(name);
  if (!key) {
    await user.unsetFlag(MODULE_ID, ACTIVE_FLAG);
    return '';
  }
  await user.setFlag(MODULE_ID, ACTIVE_FLAG, key);
  return key;
}

/** `{ name, selection }` for the concept this user generates with, or null. */
export function activeConcept(user) {
  const name = readActiveConceptName(user);
  return name ? { name, selection: readConcepts(user)[name] } : null;
}

// ---------------------------------------------------------------------------------------------
// Pure-ish: the backend's side of the conversation
// ---------------------------------------------------------------------------------------------

/** The options endpoint that sits beside a generation endpoint, or null for an unusable URL. */
export function selectionOptionsUrl(deliverUrl) {
  try {
    return new URL('/selection_options', deliverUrl).toString();
  } catch (e) {
    return null;
  }
}

const optionsCache = new Map();

/**
 * The backend's pickable lists, or null when this backend has no selection mode (or is down).
 *
 * Only a GOOD answer is cached. A failure is retried on the next ask, because the usual cause is
 * a hosted server that was asleep -- remembering "unsupported" for the session would switch build
 * concepts off until a reload for a reason that had already gone away.
 */
export async function fetchSelectionOptions(deliverUrl, fetchImpl = globalThis.fetch) {
  const url = selectionOptionsUrl(deliverUrl);
  if (!url || typeof fetchImpl !== 'function') return null;
  if (optionsCache.has(url)) return optionsCache.get(url);
  try {
    const response = await fetchImpl(url, { method: 'GET', cache: 'no-store' });
    if (!response.ok) return null;
    const options = await response.json();
    if (!options || !Array.isArray(options.classes) || !Array.isArray(options.keys)) return null;
    optionsCache.set(url, options);
    return options;
  } catch (e) {
    return null;
  }
}

/** Test seam: forget what any backend said. */
export function clearSelectionOptionsCache() {
  optionsCache.clear();
}

/**
 * Add the user's active build concept to a generation request -- if the backend can take it.
 *
 * THE CHECK IS NOT A NICETY. The generation endpoint reads its inputs positionally and pops the
 * named keys it knows first. A backend from before selection mode does not pop `selection`, so the
 * object lands in the positional list and the request fails outright: no character, and an error
 * that names nothing useful. So the key is only ever sent to a backend that has answered
 * `GET /selection_options`, which is the same deploy that learned to pop it.
 *
 * Mutates `request` (adds `selection`) and returns what happened, for the caller to narrate:
 *   { status: 'none' }                       no active concept; request untouched
 *   { status: 'sent', name, selection }      concept added
 *   { status: 'unsupported', name }          backend has no selection mode; request untouched
 */
export async function applySelectionToRequest(request, { user, deliverUrl, fetchImpl } = {}) {
  const concept = activeConcept(user);
  if (!concept) return { status: 'none' };
  const options = await fetchSelectionOptions(deliverUrl, fetchImpl);
  if (!options) return { status: 'unsupported', name: concept.name };
  request.selection = concept.selection;
  return { status: 'sent', name: concept.name, selection: concept.selection };
}

/** The backend's unmet-pin rows, tidied: `[{ pin, reason }]`, never null. */
export function unmetPins(payload) {
  const rows = Array.isArray(payload?.selection_report) ? payload.selection_report : [];
  return rows
    .filter((row) => row && typeof row === 'object' && text(row.pin))
    .map((row) => ({ pin: text(row.pin), reason: text(row.reason) }));
}

const escapeHtml = (value) => text(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** The unmet-pin report as dialog HTML. Empty string when every pin held. */
export function unmetPinsHtml(conceptName, rows) {
  if (!rows?.length) return '';
  const items = rows.map((row) =>
    `<li><strong>${escapeHtml(row.pin)}</strong>${row.reason ? ` — ${escapeHtml(row.reason)}` : ''}</li>`).join('');
  return `<p>The character was created, but ${rows.length === 1 ? 'one pin' : `${rows.length} pins`} `
    + `from the build concept <strong>${escapeHtml(conceptName)}</strong> could not be honoured:</p>`
    + `<ul>${items}</ul>`;
}

// ---------------------------------------------------------------------------------------------
// Pure: the editor's HTML (a string in, a string out -- the DOM work is further down)
// ---------------------------------------------------------------------------------------------

const option = (value, label, selected) =>
  `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;

/** `<option>`s for the generator dialog's "Build concept" dropdown. */
export function conceptDropdownOptions(concepts, activeName) {
  return option('', 'None (fully random)', !activeName)
    + Object.keys(concepts).sort((a, b) => a.localeCompare(b))
      .map((name) => option(name, name, name === activeName)).join('');
}

function classSelect(index, options, chosen) {
  const groups = new Map();
  for (const row of options.classes) {
    if (!groups.has(row.group_label)) groups.set(row.group_label, []);
    groups.get(row.group_label).push(row);
  }
  const body = [...groups.entries()].map(([label, rows]) =>
    `<optgroup label="${escapeHtml(label)}">`
      + rows.map((row) => option(row.name, row.label, row.name === chosen?.name)).join('')
      + '</optgroup>').join('');
  return `<div class="rcg-concept-row">
      <label>${index === 0 ? 'Primary class' : `Class ${index + 1}`}</label>
      <select data-rcg="class" data-index="${index}">${option('', '— not pinned —', !chosen)}${body}</select>
      <input type="number" data-rcg="class-level" data-index="${index}" min="1" max="${options.limits?.max_level ?? 40}"
             placeholder="level (roll)" value="${chosen?.level ?? ''}">
    </div>`;
}

function multiSelect(key, values, chosen, size = 6) {
  const picked = new Set((chosen ?? []).map((v) => v.toLowerCase()));
  return `<select multiple size="${size}" data-rcg="${key}">`
    + values.map((v) => option(v, v, picked.has(v.toLowerCase()))).join('') + '</select>';
}

function checkboxes(key, values, chosen) {
  const picked = new Set((chosen ?? []).map((v) => v.toLowerCase()));
  return `<div class="rcg-concept-checks">` + values.map((v) =>
    `<label><input type="checkbox" data-rcg="${key}" value="${escapeHtml(v)}"${picked.has(v.toLowerCase()) ? ' checked' : ''}> ${escapeHtml(v)}</label>`).join('')
    + '</div>';
}

/**
 * What the editor says under the Build dropdown for the build named `name`: what the build is, and
 * the classes it fits best (the ones a build with no class pinned is drawn from). '' for no build.
 */
export function buildHintText(options, name) {
  const row = (options.builds ?? []).find((b) => b.name === name);
  if (!row) return '';
  const classes = (row.classes ?? []).map((c) => c.replace(/\b\w/g, (m) => m.toUpperCase()));
  return text(row.definition) + (classes.length ? ` Fits best: ${classes.join(', ')}.` : '');
}

/**
 * The Build section. A backend that does not offer builds (one from before the build pin) gets no
 * dropdown -- only the stored build, carried as a hidden field so a save does not strip it.
 */
function buildFieldset(options, chosen) {
  if (!Array.isArray(options.builds) || !options.builds.length) {
    return chosen ? `<input type="hidden" data-rcg="build" value="${escapeHtml(chosen)}">` : '';
  }
  const families = new Map();
  for (const row of options.builds) {
    const family = row.family || 'Other';
    if (!families.has(family)) families.set(family, []);
    families.get(family).push(row);
  }
  const body = [...families.entries()].map(([family, rows]) =>
    `<optgroup label="${escapeHtml(family)}">`
      + rows.map((row) => option(row.name, row.name, row.name === chosen)).join('') + '</optgroup>').join('');
  // A stored build the backend no longer offers stays selectable, so it is not dropped on save.
  const stale = chosen && !options.builds.some((row) => row.name === chosen) ? option(chosen, chosen, true) : '';
  return `<fieldset><legend>Build</legend>
      <p class="notes">A build steers what is rolled: the class (when you have not pinned one), where the ability scores go, the weapon, armor and shield, the spells and the feats. The finished character is then measured, and if it comes out as a different build the unmet-pins dialog says so.</p>
      <div class="rcg-concept-row">
        <label>Build</label>
        <select data-rcg="build">${option('', '— not pinned —', !chosen)}${stale}${body}</select>
        <span></span>
      </div>
      <p class="notes" data-rcg="build-hint">${escapeHtml(buildHintText(options, chosen))}</p>
    </fieldset>`;
}

/** One pinned feat in the editor: its name, the value the form reads back, and a remove link. */
export function featChipHtml(name) {
  return `<span class="rcg-chip" data-rcg="feat-chip"><input type="hidden" data-rcg="feat" value="${escapeHtml(name)}">`
    + `${escapeHtml(name)} <a data-rcg="feat-remove" title="Remove this feat">&times;</a></span>`;
}

/**
 * The Feats section. A backend that does not offer feats (one from before the feats pin) gets no
 * picker -- only the stored feats, carried as hidden fields, so opening and saving a concept
 * against an older backend does not quietly strip the feats out of it.
 *
 * Well over a thousand feats, so the picker is a text box with the browser's own type-ahead
 * (`<datalist>`), not a list to scroll: type a few letters, pick, Add.
 */
function featsFieldset(options, chosen) {
  if (!Array.isArray(options.feats) || !options.feats.length) {
    return (chosen ?? []).map((name) => `<input type="hidden" data-rcg="feat" value="${escapeHtml(name)}">`).join('');
  }
  const known = new Map(options.feats.map((row) => [row.name.toLowerCase(), row.name]));
  // A stored feat the backend no longer offers is still drawn, so it is not silently dropped on
  // the next save -- the backend reports it, which is how the player learns it is gone.
  const chips = (chosen ?? []).map((name) => featChipHtml(known.get(name.toLowerCase()) ?? name)).join('');
  const choices = options.feats.map((row) =>
    `<option value="${escapeHtml(row.name)}">${escapeHtml(row.homebrew ? `${row.type} (homebrew)` : row.type)}</option>`).join('');
  return `<fieldset><legend>Feats</legend>
      <p class="notes">Pinned feats are taken first and cost feat slots like any other feat. A feat's prerequisite feats are taken with it; one the character cannot qualify for (base attack bonus, an ability score, no slot left) is reported. Feats are pinned by base name &mdash; "Weapon Focus", not a weapon.</p>
      <div class="rcg-concept-row">
        <label for="rcg-feat-entry">Add a feat</label>
        <input type="text" id="rcg-feat-entry" data-rcg="feat-entry" list="rcg-feat-list" placeholder="type to search ${options.feats.length} feats">
        <button type="button" data-rcg="feat-add">Add</button>
      </div>
      <datalist id="rcg-feat-list">${choices}</datalist>
      <div class="rcg-concept-chips" data-rcg="feat-chips">${chips}</div>
    </fieldset>`;
}

/**
 * Wire the parts of the form that are more than inputs: the feat picker's Add button, Enter in
 * its text box, and the remove links. Call it whenever the form's HTML is (re)drawn.
 *
 * @returns {boolean} whether there was a feat picker to wire (false on a backend without feats).
 */
export function wireConceptForm(root, options, notify = () => {}) {
  const build = root.querySelector?.('[data-rcg="build"]');
  const hint = root.querySelector?.('[data-rcg="build-hint"]');
  if (build && hint) {
    build.addEventListener('change', () => { hint.textContent = buildHintText(options, build.value); });
  }
  const entry = root.querySelector?.('[data-rcg="feat-entry"]');
  const holder = root.querySelector?.('[data-rcg="feat-chips"]');
  if (!entry || !holder) return false;
  const known = new Map((options.feats ?? []).map((row) => [row.name.toLowerCase(), row.name]));
  const add = () => {
    const typed = text(entry.value);
    if (!typed) return;
    const name = known.get(typed.toLowerCase());
    if (!name) {
      notify(`"${typed}" is not a feat the generator knows. Pick one from the list.`);
      return;
    }
    const held = [...holder.querySelectorAll('[data-rcg="feat"]')].map((node) => node.value.toLowerCase());
    if (!held.includes(name.toLowerCase())) holder.insertAdjacentHTML('beforeend', featChipHtml(name));
    entry.value = '';
  };
  root.querySelector('[data-rcg="feat-add"]')?.addEventListener('click', add);
  entry.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    // Enter in a Dialog presses its default button (Save). Here it means "add this feat".
    event.preventDefault();
    event.stopPropagation();
    add();
  });
  holder.addEventListener('click', (event) => {
    const link = event.target?.closest?.('[data-rcg="feat-remove"]');
    link?.closest('[data-rcg="feat-chip"]')?.remove();
  });
  return true;
}

/** The editor's whole form for one concept (a blank one when `selection` is null). */
export function conceptFormHtml(options, name, selection) {
  const sel = cleanSelection(selection) ?? {};
  const maxClasses = options.limits?.max_classes ?? 4;
  const classRows = Array.from({ length: maxClasses }, (_, i) => classSelect(i, options, sel.classes?.[i])).join('');
  const stats = sel.stat_priority ?? [];
  const statRows = options.abilities.map((_, i) =>
    `<label>${ORDINALS[i] ?? `${i + 1}th`} <select data-rcg="stat" data-index="${i}">${option('', '—', !stats[i])}`
      + options.abilities.map((a) => option(a, a.toUpperCase(), stats[i] === a)).join('') + '</select></label>').join('');
  const specialtyGroups = Object.entries(options.schools.specialty).map(([table, names]) =>
    `<optgroup label="${escapeHtml(SPECIALTY_TABLE_LABELS[table] ?? table)}">`
      + names.map((n) => option(n, n, sel.schools?.specialty === n)).join('') + '</optgroup>').join('');
  const paths = sel.path_of_war?.paths;

  return `<form class="rcg-concept-form" autocomplete="off">
    <style>
      .rcg-concept-form fieldset { margin: 0 0 8px; padding: 6px 8px; }
      .rcg-concept-form legend { font-weight: bold; }
      .rcg-concept-row { display: grid; grid-template-columns: 110px 1fr 110px; gap: 6px; align-items: center; margin-bottom: 4px; }
      .rcg-concept-checks { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px 8px; }
      .rcg-concept-stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
      .rcg-concept-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .rcg-concept-form select[multiple] { width: 100%; }
      .rcg-concept-form .notes { font-size: 0.85em; opacity: 0.8; margin: 2px 0 6px; }
      .rcg-concept-chips { display: flex; flex-wrap: wrap; gap: 4px; min-height: 1.6em; }
      .rcg-chip { border: 1px solid currentColor; border-radius: 10px; padding: 0 8px; opacity: 0.9; }
      .rcg-chip a { cursor: pointer; margin-left: 4px; font-weight: bold; }
    </style>
    <div class="rcg-concept-row">
      <label for="rcg-concept-name">Concept name</label>
      <input type="text" id="rcg-concept-name" data-rcg="name" value="${escapeHtml(name ?? '')}" placeholder="e.g. Shield warder">
      <span></span>
    </div>
    ${buildFieldset(options, sel.build)}
    <fieldset><legend>Classes</legend>
      <p class="notes">The first class is the primary. Leave a level blank to let the level range decide it; pin every level and the range is ignored.</p>
      ${classRows}
    </fieldset>
    <fieldset><legend>Stat priority</legend>
      <p class="notes">Rolled scores and inherent bonuses are placed in this order. Abilities you leave out follow in the usual order.</p>
      <div class="rcg-concept-stats">${statRows}</div>
    </fieldset>
    <fieldset><legend>Spell schools</legend>
      <div class="rcg-concept-row">
        <label>Specialty</label>
        <select data-rcg="specialty">${option('', '— not pinned —', !sel.schools?.specialty)}${specialtyGroups}</select>
        <span></span>
      </div>
      <p class="notes">Preferred schools are favoured like the specialty. Opposition schools are never picked from (and are a wizard's opposition schools).</p>
      <label>Preferred</label>${checkboxes('preferred', options.schools.spell_schools, sel.schools?.preferred)}
      <label>Opposition</label>${checkboxes('opposition', options.schools.spell_schools, sel.schools?.opposition)}
    </fieldset>
    <fieldset><legend>Spheres</legend>
      <p class="notes">Ctrl-click to pick several. Pinning a sphere turns Spheres on for this character.</p>
      <div class="rcg-concept-pair">
        <div><label>Spheres of Power</label>${multiSelect('sphere', options.spheres.power, sel.spheres)}</div>
        <div><label>Spheres of Might</label>${multiSelect('sphere', options.spheres.might, sel.spheres)}</div>
      </div>
    </fieldset>
    <fieldset><legend>Path of War</legend>
      <p class="notes">Each pinned discipline is its own Martial Training chain (or part of an initiator's set). The path count applies to non-initiators; blank leaves it to the roll.</p>
      <div class="rcg-concept-pair">
        <div><label>Disciplines</label>${multiSelect('discipline', options.disciplines, sel.path_of_war?.disciplines)}</div>
        <div><label>Martial paths</label>
          <input type="number" data-rcg="paths" min="0" max="6" placeholder="roll" value="${paths ?? ''}"></div>
      </div>
    </fieldset>
    ${featsFieldset(options, sel.feats)}
  </form>`;
}

/** Read the editor's form back into `{ name, selection }`. `root` is any element containing it. */
export function readConceptForm(root) {
  const all = (key) => [...root.querySelectorAll(`[data-rcg="${key}"]`)];
  const byIndex = (nodes) => nodes.slice().sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index));
  const levels = new Map(all('class-level').map((n) => [n.dataset.index, n.value]));
  const selectedValues = (node) => [...node.options].filter((o) => o.selected).map((o) => o.value);
  const checked = (key) => all(key).filter((n) => n.checked).map((n) => n.value);

  const selection = cleanSelection({
    classes: byIndex(all('class')).filter((n) => n.value)
      .map((n) => ({ name: n.value, level: levels.get(n.dataset.index) })),
    stat_priority: byIndex(all('stat')).map((n) => n.value).filter(Boolean),
    schools: {
      specialty: all('specialty')[0]?.value,
      preferred: checked('preferred'),
      opposition: checked('opposition'),
    },
    spheres: all('sphere').flatMap(selectedValues),
    path_of_war: {
      disciplines: all('discipline').flatMap(selectedValues),
      paths: all('paths')[0]?.value,
    },
    feats: all('feat').map((n) => n.value),
    build: all('build')[0]?.value,
  });
  return { name: text(all('name')[0]?.value), selection };
}

// ---------------------------------------------------------------------------------------------
// Dialogs (Foundry globals from here down)
// ---------------------------------------------------------------------------------------------

const element = (html) => html?.[0] ?? html;      // V1 Dialog hands jQuery; later APIs an element

/** Show the unmet-pin report, if there is one. */
export function showUnmetPins(conceptName, payload) {
  const rows = unmetPins(payload);
  if (!rows.length) return;
  ui.notifications?.warn(
    `Character Generator: ${rows.length} pin${rows.length === 1 ? '' : 's'} from "${conceptName}" could not be honoured.`);
  new Dialog({
    title: 'Build concept: unmet pins',
    content: unmetPinsHtml(conceptName, rows),
    buttons: { ok: { label: 'OK' } },
    default: 'ok',
  }).render(true);
}

/**
 * The concept editor. Lists come from the backend, so it needs the generation endpoint's URL.
 *
 * @param {object}   opts
 * @param {string}   opts.deliverUrl   The generation endpoint (its sibling serves the options).
 * @param {string}   [opts.name]       Concept to open; blank for a new one.
 * @param {Function} [opts.onChange]   Called after a save or delete, with the concept name ('' on
 *                                     delete), so the caller can refresh its own dropdown.
 */
export async function openConceptEditor({ deliverUrl, name = '', onChange } = {}) {
  const user = game.user;
  const options = await fetchSelectionOptions(deliverUrl);
  if (!options) {
    ui.notifications?.warn(
      'Character Generator: this backend does not offer build concepts yet (no /selection_options). '
      + 'Check the "Backend URL" module setting, or update the backend.');
    return;
  }
  const concepts = readConcepts(user);
  const picker = `<div class="rcg-concept-row" style="display:grid;grid-template-columns:110px 1fr;gap:6px;margin-bottom:8px;">
      <label for="rcg-concept-pick">Edit</label>
      <select id="rcg-concept-pick">${option('', '— new concept —', !name)}`
      + Object.keys(concepts).sort((a, b) => a.localeCompare(b)).map((n) => option(n, n, n === name)).join('')
      + '</select></div>';
  const body = (conceptName) =>
    `<div id="rcg-concept-body">${conceptFormHtml(options, conceptName, concepts[conceptName] ?? null)}</div>`;

  const finish = async (label, work) => {
    try {
      const changed = await work();
      if (changed !== undefined) onChange?.(changed);
    } catch (error) {
      ui.notifications?.error(`Character Generator: could not ${label} the build concept (${error.message}).`);
    }
  };

  new Dialog({
    title: 'Build concepts',
    content: picker + body(name),
    buttons: {
      save: {
        label: 'Save concept',
        callback: (html) => finish('save', async () => {
          const form = readConceptForm(element(html));
          await saveConcept(user, form.name, form.selection);
          ui.notifications?.info(`Character Generator: saved build concept "${form.name}".`);
          return form.name;
        }),
      },
      remove: {
        label: 'Delete concept',
        callback: (html) => finish('delete', async () => {
          const target = element(html).querySelector('#rcg-concept-pick')?.value;
          if (!target) return undefined;
          await deleteConcept(user, target);
          ui.notifications?.info(`Character Generator: deleted build concept "${target}".`);
          return '';
        }),
      },
      close: { label: 'Close' },
    },
    default: 'save',
    render: (html) => {
      const root = element(html);
      const warn = (message) => ui.notifications?.warn(`Character Generator: ${message}`);
      const wire = () => wireConceptForm(root.querySelector('#rcg-concept-body') ?? root, options, warn);
      wire();
      root.querySelector('#rcg-concept-pick')?.addEventListener('change', (event) => {
        const holder = root.querySelector('#rcg-concept-body');
        if (!holder) return;
        holder.innerHTML = conceptFormHtml(options, event.target.value, concepts[event.target.value] ?? null);
        wire();                                   // the old form's listeners went with its nodes
      });
    },
  }, { width: 640, resizable: true }).render(true);
}
