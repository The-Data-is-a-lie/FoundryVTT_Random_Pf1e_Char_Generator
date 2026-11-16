/**
 * The Blank Character Generator: a sheet with the classes, levels and race you pick, nothing rolled,
 * and an empty slot for everything the character is owed.
 *
 * Where the random generator asks the backend for a finished character, this asks it for a BLANK
 * one (`blank` on the request, `utils/class_func/blank.py` on the other end) and builds the actor
 * through the very same pipeline -- `main()` then `createAndAssignActor()`. The answer carries no
 * feats, spells or gear and a `slots` list instead, which `build/slots.js` draws as placeholders.
 *
 * Nothing here knows a rule. How many feats a fighter 10 has, which class choices a rogue 4 makes,
 * and whether the house rules add story feats, are all the backend's answer -- which is also why a
 * backend that does not know the `blank` key is refused up front (`options.blank`): it would read
 * the flag as one of its positional inputs and hand back an ordinary random character.
 *
 * Layout mirrors selection-concepts.js: pure functions first (the form, reading it back, the
 * request), then the one function that touches Foundry.
 */
import { sendDataToServer } from './deliver-data.js';
import { main } from './modify-abilities.js';
import { createAndAssignActor } from './createCharacter.js';
import { fetchSelectionOptions } from './selection-concepts.js';
import { readDeliverData, clearExportPath } from './shared/storage.js';

/** The race a new blank character starts on in the dialog. */
export const DEFAULT_BLANK_RACE = 'Human';
/** The level a class row starts on, and what a row left without a level is read as. */
export const DEFAULT_BLANK_LEVEL = 1;

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
const escapeHtml = (value) => text(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const option = (value, label, selected) =>
  `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
/** The value the backend's race input takes: lower-cased, spaces as hyphens ("half-elf"). */
export const raceSlug = (race) => text(race).toLowerCase().replace(/\s+/g, '-');

function classRow(index, options) {
  const groups = new Map();
  for (const row of options.classes ?? []) {
    if (!groups.has(row.group_label)) groups.set(row.group_label, []);
    groups.get(row.group_label).push(row);
  }
  const body = [...groups.entries()].map(([label, rows]) =>
    `<optgroup label="${escapeHtml(label)}">` + rows.map((row) => option(row.name, row.label, false)).join('')
    + '</optgroup>').join('');
  const first = index === 0;
  return `<div class="rcg-blank-row">
      <label>${first ? 'Class' : `Class ${index + 1}`}</label>
      <select data-rcg="blank-class" data-index="${index}">${option('', first ? '— choose a class —' : '— none —', true)}${body}</select>
      <input type="number" data-rcg="blank-level" data-index="${index}" min="1" max="${options.limits?.max_level ?? 40}"
             value="${first ? DEFAULT_BLANK_LEVEL : ''}" placeholder="level">
    </div>`;
}

/**
 * The dialog's form: one row per class the backend allows on a character, and a race.
 *
 * @param {object}   options  What `GET /selection_options` answered (its `classes` and `limits`).
 * @param {string[]} races    Race names to offer, as the random generator's dialog lists them.
 */
export function blankFormHtml(options, races) {
  const rows = Array.from({ length: options.limits?.max_classes ?? 4 }, (_, i) => classRow(i, options)).join('');
  const raceOptions = races.map((race) => option(raceSlug(race), race, race === DEFAULT_BLANK_RACE)).join('');
  return `<form class="rcg-blank-form" autocomplete="off">
    <style>
      .rcg-blank-row { display: grid; grid-template-columns: 90px 1fr 90px; gap: 6px; align-items: center; margin-bottom: 4px; }
      .rcg-blank-form .notes { font-size: 0.85em; opacity: 0.8; margin: 2px 0 8px; }
    </style>
    <p class="notes">Makes a sheet with nothing rolled: every ability at 10, no feats, spells or gear, and an empty slot for each feat, class choice, trait and flaw the character is owed. Drag what you choose onto the sheet and delete the placeholder.</p>
    ${rows}
    <div class="rcg-blank-row">
      <label>Race</label>
      <select data-rcg="blank-race">${raceOptions}</select>
      <span></span>
    </div>
    <p class="notes">House-rule slots (story and flavor feats, flaws) follow the house-rule choices saved in the Character Generator dialog.</p>
  </form>`;
}

/**
 * Read the form back: `{ classes: [{ name, level }], race }`. Rows with no class are skipped, a
 * class picked twice is kept once, and a row with no level is level `DEFAULT_BLANK_LEVEL`.
 */
export function readBlankForm(root) {
  const all = (key) => [...root.querySelectorAll(`[data-rcg="${key}"]`)];
  const levels = new Map(all('blank-level').map((node) => [node.dataset.index, node.value]));
  const classes = [];
  for (const node of all('blank-class').sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index))) {
    const name = text(node.value);
    if (!name || classes.some((entry) => entry.name === name)) continue;
    const level = Number.parseInt(levels.get(node.dataset.index), 10);
    classes.push({ name, level: Number.isInteger(level) && level >= 1 ? level : DEFAULT_BLANK_LEVEL });
  }
  return { classes, race: text(all('blank-race')[0]?.value) };
}

/**
 * The request for a blank character.
 *
 * It is the generator's own saved request with four things changed, because the backend reads that
 * request positionally and a blank one must arrive in the same shape: the race, the class input
 * left to the pins, multiclass off (one pinned class would otherwise roll partners), and the two
 * named keys -- the class pins and the `blank` flag. Everything else, the house-rule choices
 * included, is whatever the Character Generator dialog last saved.
 *
 * Returns null when the form names no class: there is nothing to make a sheet of.
 */
export function blankRequest(saved, form) {
  if (!form?.classes?.length) return null;
  const request = { ...(saved ?? {}) };
  for (const perClick of ['selection', 'blank', 'optimize', 'mythic', 'luck_direction']) delete request[perClick];
  if (form.race) request.race = form.race;
  request.class = 'random';
  request.multiclass = 'N';
  request.selection = { classes: form.classes.map(({ name, level }) => ({ name, level })) };
  request.blank = 'Y';
  return request;
}

/** How many placeholders a blank payload asks for, for the "created" notice. */
export function slotCount(payload) {
  return Array.isArray(payload?.slots) ? payload.slots.length : 0;
}

// ---------------------------------------------------------------------------------------------
// Foundry from here down
// ---------------------------------------------------------------------------------------------

const element = (html) => html?.[0] ?? html;      // V1 Dialog hands jQuery; later APIs an element

/**
 * Ask the backend for a blank character and build the actor from it.
 *
 * @param {object} form        What `readBlankForm` returned.
 * @param {string} deliverUrl  The generation endpoint.
 * @param {object} [overrides] Actor name / folder from the Create Actor dialog, as for runGenerator.
 * @returns {Promise<boolean>} whether an actor was created.
 */
export async function runBlankGenerator(form, deliverUrl, overrides = {}) {
  const request = blankRequest(readDeliverData(), form);
  if (!request) {
    ui.notifications?.warn('Blank Character Generator: choose at least one class.');
    return false;
  }
  // Drop the previous run's built sheet first, exactly as runGenerator does.
  clearExportPath();
  let payload;
  try {
    payload = await sendDataToServer(request, deliverUrl);
  } catch (error) {
    return false;                          // sendDataToServer already told the user why
  }
  if (payload?.error) {
    ui.notifications?.error(`Blank Character Generator: the backend could not make the sheet (${payload.error}).`);
    return false;
  }
  let built = false;
  try {
    built = await main();
  } catch (error) {
    console.error('Blank Character Generator: the sheet build failed —', error);
    ui.notifications?.error('Blank Character Generator: the sheet build failed. No character was created.');
  }
  if (!built) return false;
  try {
    await createAndAssignActor(overrides);
  } catch (error) {
    console.error('Blank Character Generator: could not create the actor —', error);
    ui.notifications?.error(`Blank Character Generator: couldn't create the actor (${error.message}).`);
    return false;
  }
  ui.notifications?.info(`Blank Character Generator: created "${overrides.name || payload.character_full_name}" `
    + `with ${slotCount(payload)} empty slots.`);
  return true;
}

/**
 * Open the Blank Character Generator dialog.
 *
 * @param {object}   opts
 * @param {Function} opts.backendUrl  Resolves the generation endpoint (generator-launch.js owns the
 *                                    rule for which backend that is).
 * @param {string[]} opts.races       Race names to offer.
 * @param {object}   [opts.overrides] Actor name / folder to pass through to the created actor.
 */
export async function openBlankCharacterDialog({ backendUrl, races, overrides = {} }) {
  const deliverUrl = await backendUrl();
  const options = await fetchSelectionOptions(deliverUrl);
  if (!options?.blank) {
    ui.notifications?.warn(
      'Blank Character Generator: this backend cannot make a blank character yet. '
      + 'Check the "Backend URL" module setting, or update the backend.');
    return;
  }
  new Dialog({
    title: 'Blank Character Generator',
    content: blankFormHtml(options, races),
    buttons: {
      create: {
        label: 'Create blank character',
        callback: (html) => runBlankGenerator(readBlankForm(element(html)), deliverUrl, overrides),
      },
      cancel: { label: 'Cancel' },
    },
    default: 'create',
  }, { width: 460 }).render(true);
}
