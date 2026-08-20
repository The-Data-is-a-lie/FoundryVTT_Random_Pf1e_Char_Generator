import { runGenerator, openGeneratorDialog } from './generator-launch.js';
import { log } from './shared/log.js';

/**
 * Where the "Character Generator" button is allowed to appear.
 *
 * For most of this module's life there was exactly one answer: a `position: fixed` button glued to
 * the bottom-left of the screen (button.js). That is a fine default and a poor only option — it
 * floats over the canvas, and there is nowhere else to put it. These four settings turn "where the
 * button lives" into the user's decision instead of the module's.
 *
 * They are independent booleans rather than one dropdown on purpose: a GM who wants it in the Create
 * Actor dialog usually still wants it on the scene controls, and CLIENT scope means each person at
 * the table answers for themselves. The defaults reproduce today's UI exactly — floating on, the
 * three new ones off — so upgrading changes nobody's screen until they ask it to.
 */
export const SETTINGS = Object.freeze({
  floating: 'buttonFloating',
  sceneControls: 'buttonSceneControls',
  createActor: 'buttonCreateActor',
  sidebar: 'buttonSidebar',
});

/** Registered defaults, mirrored here so a not-yet-registered setting still behaves correctly. */
const DEFAULTS = Object.freeze({
  [SETTINGS.floating]: true,
  [SETTINGS.sceneControls]: false,
  [SETTINGS.createActor]: false,
  [SETTINGS.sidebar]: false,
});

const MODULE_ID = 'pf1e_random_char_generator';

/** The floating button's element id — the handle `buttonFloating` shows and hides. */
export const FLOATING_BUTTON_ID = 'character-generator-button';
/** Ids on the injected elements: they double as the "already here" guard on re-render. */
const SIDEBAR_ENTRY_ID = 'rcg-sidebar-entry';
const CREATE_ACTOR_ROW_ID = 'rcg-create-actor-row';
const SCENE_CONTROL_TOOL = 'rcg-generate';

const ICON = 'fa-solid fa-dice-d20';
const LABEL = 'Random Character Generator';

/**
 * Read a location setting, defaulting to the shipped value if it isn't registered yet.
 *
 * Every caller here runs from a render hook or a click, long after "init" — but the module already
 * treats an unregistered setting as "behave as before" everywhere else (see generator-launch.js),
 * and a location toggle that throws would take a core render hook down with it.
 */
export function buttonLocationEnabled(key) {
  try {
    return !!game.settings.get(MODULE_ID, key);
  } catch (e) {
    return DEFAULTS[key] ?? false;
  }
}

/** What every location does on click, minus the Create Actor dialog (see below). */
function launch() {
  openGeneratorDialog();
  runGenerator();
}

/**
 * Foundry v13 hands render hooks a native HTMLElement; v10–v12 hand them a jQuery object.
 * This module supports both (module.json: minimum 10, verified 13), so normalise once.
 */
function toElement(html) {
  if (!html) return null;
  if (html instanceof HTMLElement) return html;
  return html[0] instanceof HTMLElement ? html[0] : null;
}

/* -------------------------------------------- */
/*  1. Scene controls — the Token group's tools */
/* -------------------------------------------- */

/**
 * Add the generator as a tool in the Token control group on the left rail.
 *
 * `button: true` is the important flag: it makes the tool fire and forget rather than become the
 * layer's "active" tool, so clicking it doesn't leave the Token layer in a state where dragging a
 * token does nothing (SceneControls##onChangeTool).
 *
 * v13 passes a Record keyed by control name; v10–v12 pass an Array of controls. The Token group is
 * `tokens` in v13 and `token` before it. The handler is named after the SAME shape, and EXACTLY ONE
 * of the two is ever set — v13 renamed `onClick` to `onChange` but still calls a surviving `onClick`
 * as a deprecation shim, so a tool carrying both fires TWICE and generates two characters per click
 * (SceneControls##onChange). Supplying both looked like harmless version-tolerance; it is not.
 */
function onGetSceneControlButtons(controls) {
  if (!buttonLocationEnabled(SETTINGS.sceneControls)) return;

  const tool = {
    name: SCENE_CONTROL_TOOL,
    title: LABEL,
    icon: ICON,
    button: true,
    visible: true,
    order: 99,
  };

  try {
    if (Array.isArray(controls)) {
      tool.onClick = () => launch();      // v10–v12 shape, v10–v12 callback
      const tokens = controls.find(c => c?.name === 'tokens' || c?.name === 'token');
      if (!Array.isArray(tokens?.tools)) {
        log.debug('Button locations: no Token scene-control group to add the generator to.');
        return;
      }
      if (!tokens.tools.some(t => t?.name === SCENE_CONTROL_TOOL)) tokens.tools.push(tool);
      return;
    }

    const tokens = controls?.tokens ?? controls?.token;
    if (!tokens?.tools) {
      log.debug('Button locations: no Token scene-control group to add the generator to.');
      return;
    }
    tool.onChange = () => launch();       // v13 shape, v13 callback
    tokens.tools[SCENE_CONTROL_TOOL] = tool;
  } catch (error) {
    console.warn('Character Generator: could not add the scene-control tool —', error);
  }
}

/* -------------------------------------------- */
/*  2. Sidebar tab rail                         */
/* -------------------------------------------- */

/**
 * Put an icon at the bottom of the sidebar tab rail, below the settings gear.
 *
 * v13 markup is `nav#sidebar-tabs > menu.flexcol > li > button.ui-control`, with the collapse caret
 * as the final `<li>` — so the entry goes immediately before it, which is where the gap under the
 * gear is. v10–v12 used `nav#sidebar-tabs > a.item`, handled by the fallback branch.
 *
 * This runs as its own sync rather than only from the render hook so the setting's `onChange` can
 * add and remove the entry with no sidebar re-render at all.
 *
 * @param {ParentNode} [root]  Where to look for the rail; the hook passes the sidebar element.
 */
export function syncSidebarButton(root = null) {
  try {
    const nav = root?.querySelector?.('#sidebar-tabs') ?? document.getElementById('sidebar-tabs');
    if (!nav) return;

    // Idempotent: a re-render replaces the rail's children, but a setting toggle does not.
    nav.querySelector(`#${SIDEBAR_ENTRY_ID}`)?.remove();
    if (!buttonLocationEnabled(SETTINGS.sidebar)) return;

    const menu = nav.querySelector('menu');
    if (menu) {
      const entry = document.createElement('li');
      entry.id = SIDEBAR_ENTRY_ID;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `ui-control plain icon ${ICON}`;
      button.setAttribute('aria-label', LABEL);
      button.dataset.tooltip = LABEL;
      button.addEventListener('click', launch);
      entry.appendChild(button);

      const collapse = menu.querySelector('.collapse')?.closest('li');
      if (collapse) menu.insertBefore(entry, collapse);
      else menu.appendChild(entry);
      return;
    }

    // v10–v12 rail: flat anchors, collapse control last.
    const entry = document.createElement('a');
    entry.id = SIDEBAR_ENTRY_ID;
    entry.className = 'item';
    entry.title = LABEL;
    entry.innerHTML = `<i class="${ICON}"></i>`;
    entry.addEventListener('click', launch);
    const collapse = nav.querySelector('.collapse');
    if (collapse) nav.insertBefore(entry, collapse);
    else nav.appendChild(entry);
  } catch (error) {
    console.warn('Character Generator: could not add the sidebar button —', error);
  }
}

/* -------------------------------------------- */
/*  3. Create Actor dialog                      */
/* -------------------------------------------- */

/**
 * Is this the dialog that creates an Actor?
 *
 * Checked by the types the dialog offers rather than by its window title, because the title is
 * localized and the same `templates/sidebar/document-create.html` renders the create dialog for
 * every document class. If the Type select's options are Actor types, this is the Actor one.
 */
function isActorCreateForm(form) {
  const typeSelect = form.querySelector('select[name="type"]');
  if (!typeSelect) return false;
  const offered = Array.from(typeSelect.options).map(o => o.value).filter(v => v && v !== 'base');
  if (!offered.length) return false;
  const actorTypes = new Set((game.documentTypes?.Actor ?? []).filter(t => t !== 'base'));
  if (!actorTypes.size) return false;
  return offered.every(type => actorTypes.has(type));
}

/**
 * Add a "generate one instead" button to the Create Actor dialog, above its submit button.
 *
 * Two things are worth knowing about the markup. First, the dialog's own `<form id="document-create">`
 * does NOT survive into the DOM: DialogV2 interpolates the template into `<form class="dialog-form">`,
 * and the HTML parser drops a nested `<form>` start tag — which is why the fields are addressed
 * through the OUTER form here. Second, `button.type` must be explicitly `"button"`; the default
 * inside a form is `submit`, which would create a blank actor and generate one.
 *
 * Like every other location, this opens the generator's input dialog alongside the run. Note what
 * that dialog is: it edits the inputs used by the NEXT character, while the generation kicked off
 * here builds one from the inputs already saved. Only the Name and Folder come from the Create
 * Actor dialog itself.
 */
function onRenderCreateDialog(app, html) {
  if (!buttonLocationEnabled(SETTINGS.createActor)) return;

  try {
    const root = toElement(html) ?? toElement(app?.element);
    if (!root) return;

    const form = root.querySelector('form.dialog-form') ?? root.querySelector('form');
    if (!form) return;
    if (form.querySelector(`#${CREATE_ACTOR_ROW_ID}`)) return;       // already injected
    if (!form.querySelector('input[name="name"]')) return;           // not a create-document form
    if (!isActorCreateForm(form)) return;                            // ...or not an Actor one

    const row = document.createElement('div');
    row.className = 'form-group';
    row.id = CREATE_ACTOR_ROW_ID;

    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = `<i class="${ICON}"></i> ${LABEL}`;
    button.style.width = '100%';
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      // Read before closing — `app.close()` tears the form out of the DOM.
      // An empty name field means the greyed placeholder, not a name: leave it blank and let the
      // generated character keep the name the backend gave it. An empty folder means the root of
      // the directory, which is where createAndAssignActor's "Random Characters" default applies.
      const name = form.elements.name?.value?.trim() ?? '';
      const folder = form.elements.folder?.value ?? '';

      await app.close?.();
      openGeneratorDialog();
      await runGenerator({ name, folder });
    });

    row.appendChild(button);

    // The footer holding "Create Actor" is a sibling of the fields, so inserting before it puts the
    // button exactly where the screenshots asked for it: under Folder, above Create Actor.
    const footer = form.querySelector('footer.form-footer, footer, .form-footer');
    const content = form.querySelector('.dialog-content');
    if (footer && footer.parentNode === form) form.insertBefore(row, footer);
    else if (content) content.appendChild(row);
    else form.appendChild(row);

    app.setPosition?.({ height: 'auto' });
  } catch (error) {
    console.warn('Character Generator: could not add the Create Actor button —', error);
  }
}

/* -------------------------------------------- */

/**
 * Register every location hook, unconditionally.
 *
 * The settings are read INSIDE each callback rather than gating registration on them, for the same
 * reason generator-launch.js reads the backend URL at click time: a change then takes effect without
 * reloading Foundry, and there is no init-order question about whether the setting existed yet.
 */
export function registerButtonLocations() {
  Hooks.on('getSceneControlButtons', onGetSceneControlButtons);

  // v13 renders the rail as part of the Sidebar application; older versions fire the same hook.
  Hooks.on('renderSidebar', (app, html) => syncSidebarButton(toElement(html)));
  Hooks.once('ready', () => syncSidebarButton());

  // v13 builds the create dialog with DialogV2; v10–v12 used the V1 Dialog. Both hooks are
  // registered and both callbacks bail unless the form really is an Actor create form.
  Hooks.on('renderDialogV2', onRenderCreateDialog);
  Hooks.on('renderDialog', onRenderCreateDialog);
}

/** Show or hide the floating button to match `buttonFloating`. Called by button.js and by onChange. */
export function syncFloatingButtonVisibility() {
  try {
    const button = document.getElementById(FLOATING_BUTTON_ID);
    if (button) button.hidden = !buttonLocationEnabled(SETTINGS.floating);
  } catch (error) {
    console.warn('Character Generator: could not toggle the floating button —', error);
  }
}

/**
 * Re-draw the scene-control rail so a `buttonSceneControls` change lands without a reload.
 *
 * A plain `render()` is NOT enough on v13 and this is not obvious: SceneControls builds its list of
 * controls ONCE and reuses it for every subsequent render, so `getSceneControlButtons` — the only
 * hook that can add a tool — never fires again. `{reset: true}` is what re-prepares the list
 * (SceneControls#_configureRenderOptions). Without it the setting appears to do nothing until the
 * next reload. v12 and earlier spelt the same thing `initialize()`.
 */
export function refreshSceneControls() {
  try {
    const controls = ui.controls;
    if (!controls) return;
    if ((game.release?.generation ?? 0) >= 13) controls.render({ reset: true });
    else if (typeof controls.initialize === 'function') controls.initialize();
    else controls.render(true);
  } catch (error) {
    log.debug('Button locations: scene controls not ready to re-render —', error);
  }
}
