/**
 * Where the Character Generator button is allowed to appear (`scripts/button-locations.js`).
 *
 *   node --test tools/button_locations.test.mjs
 *
 * WHAT THIS PINS. The scene-control injector writes into a data structure whose SHAPE CHANGED
 * between Foundry generations: v13 hands `getSceneControlButtons` a Record keyed by control name
 * and calls the Token group `tokens`, while v10–v12 hand it an Array and call the group `token`.
 * The module declares support for both (module.json: minimum 10, verified 13), so both branches are
 * exercised here — a regression in either is invisible until someone opens the wrong Foundry.
 *
 * WHAT THIS DOES NOT PIN. The sidebar and Create Actor injectors are DOM surgery against real
 * Foundry markup and there is no DOM in node (this repo carries no dev dependencies on purpose).
 * What IS tested for those two is the property that matters most in production: they are called
 * from inside CORE render hooks, where a thrown error takes down every other module listening on
 * the same hook. So they must swallow anything, and that is asserted below.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const MODULE_ID = 'pf1e_random_char_generator';
const TOOL = 'rcg-generate';

/** Settings the fake `game.settings.get` will report. Mutated per test. */
const settingValues = new Map();
/** Hook callbacks captured from `registerButtonLocations()`, keyed by hook name. */
const hooks = new Map();

let locations;

before(async () => {
  globalThis.Hooks = {
    on(name, fn) { hooks.set(name, fn); },
    once(name, fn) { hooks.set(`once:${name}`, fn); },
    callAll() {},
  };
  globalThis.game = {
    settings: {
      get(namespace, key) {
        if (namespace !== MODULE_ID) throw new Error(`unexpected namespace ${namespace}`);
        if (!settingValues.has(key)) throw new Error(`"${key}" is not a registered game setting`);
        return settingValues.get(key);
      },
    },
    documentTypes: { Actor: ['character', 'npc'] },
  };
  globalThis.ui = {};
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

  locations = await import('../scripts/button-locations.js');
  locations.registerButtonLocations();
});

const enable = (...keys) => {
  settingValues.clear();
  for (const key of Object.values(locations.SETTINGS)) settingValues.set(key, false);
  for (const key of keys) settingValues.set(key, true);
};

test('every location hook is registered', () => {
  for (const name of ['getSceneControlButtons', 'renderSidebar', 'renderDialogV2', 'renderDialog']) {
    assert.equal(typeof hooks.get(name), 'function', `${name} was not registered`);
  }
});

test('scene controls, Foundry v13: the tool lands in the `tokens` group as a button', () => {
  enable(locations.SETTINGS.sceneControls);
  const controls = { tokens: { name: 'tokens', tools: { select: { name: 'select' } } } };

  hooks.get('getSceneControlButtons')(controls);

  const tool = controls.tokens.tools[TOOL];
  assert.ok(tool, 'no tool was added to the tokens group');
  assert.equal(tool.name, TOOL);
  // `button: true` is what stops it becoming the layer's active tool and swallowing token drags.
  assert.equal(tool.button, true);
  assert.equal(typeof tool.onChange, 'function', 'v13 dispatches through onChange, not onClick');
  assert.equal(controls.tokens.tools.select.name, 'select', 'existing tools must survive');
});

test('the scene-control tool carries EXACTLY ONE click handler', () => {
  // v13's SceneControls##onChange calls `onChange` and then, as a deprecation shim, any surviving
  // `onClick`. A tool defining both therefore fires twice and generates two characters per click.
  // Supplying both reads like harmless version-tolerance, so this asserts it never comes back.
  enable(locations.SETTINGS.sceneControls);

  const record = { tokens: { tools: {} } };
  hooks.get('getSceneControlButtons')(record);
  const v13 = record.tokens.tools[TOOL];
  assert.equal(typeof v13.onChange, 'function');
  assert.equal(v13.onClick, undefined, 'v13 would call this as well as onChange — two characters');

  const array = [{ name: 'token', tools: [] }];
  hooks.get('getSceneControlButtons')(array);
  const v12 = array[0].tools[0];
  assert.equal(typeof v12.onClick, 'function');
  assert.equal(v12.onChange, undefined, 'v12 knows nothing of onChange; only onClick should be set');
});

test('scene controls, Foundry v10–v12: the tool is pushed onto the `token` group array', () => {
  enable(locations.SETTINGS.sceneControls);
  const controls = [
    { name: 'token', tools: [{ name: 'select' }] },
    { name: 'walls', tools: [] },
  ];

  hooks.get('getSceneControlButtons')(controls);

  const tools = controls[0].tools;
  assert.equal(tools.length, 2);
  assert.equal(tools[1].name, TOOL);
  assert.equal(typeof tools[1].onClick, 'function', 'v12 dispatches through onClick');
  assert.equal(tools[1].onChange, undefined, 'and only through onClick — see the double-fire test');
  assert.equal(controls[1].tools.length, 0, 'only the Token group is touched');
});

test('scene controls: calling the hook twice does not add the tool twice', () => {
  enable(locations.SETTINGS.sceneControls);

  const record = { tokens: { tools: {} } };
  hooks.get('getSceneControlButtons')(record);
  hooks.get('getSceneControlButtons')(record);
  assert.equal(Object.keys(record.tokens.tools).length, 1);

  const array = [{ name: 'tokens', tools: [] }];
  hooks.get('getSceneControlButtons')(array);
  hooks.get('getSceneControlButtons')(array);
  assert.equal(array[0].tools.length, 1);
});

test('scene controls: nothing is added while the setting is off', () => {
  enable();   // all four off
  const controls = { tokens: { tools: {} } };
  hooks.get('getSceneControlButtons')(controls);
  assert.deepEqual(controls.tokens.tools, {});
});

test('scene controls: an unrecognised controls shape is skipped, not thrown on', () => {
  enable(locations.SETTINGS.sceneControls);
  assert.doesNotThrow(() => hooks.get('getSceneControlButtons')(undefined));
  assert.doesNotThrow(() => hooks.get('getSceneControlButtons')({}));
  assert.doesNotThrow(() => hooks.get('getSceneControlButtons')([]));
  assert.doesNotThrow(() => hooks.get('getSceneControlButtons')({ tokens: {} }));
});

test('unregistered settings fall back to the shipped defaults', () => {
  settingValues.clear();   // every get() now throws, as it does before "init"
  assert.equal(locations.buttonLocationEnabled(locations.SETTINGS.floating), true,
    'the floating button is the historical behaviour and must survive a settings failure');
  for (const key of ['sceneControls', 'createActor', 'sidebar']) {
    assert.equal(locations.buttonLocationEnabled(locations.SETTINGS[key]), false);
  }
});

test('the render-hook injectors never throw into a core hook', () => {
  // Both of these run inside hooks that other modules listen on. Given no DOM at all — the worst
  // input they can be handed — they must return quietly rather than break the render for everyone.
  for (const enabled of [[], [locations.SETTINGS.sidebar, locations.SETTINGS.createActor]]) {
    enable(...enabled);
    assert.doesNotThrow(() => hooks.get('renderSidebar')({}, null));
    assert.doesNotThrow(() => hooks.get('renderDialogV2')({}, null));
    assert.doesNotThrow(() => hooks.get('renderDialog')({}, null));
    assert.doesNotThrow(() => locations.syncFloatingButtonVisibility());
    assert.doesNotThrow(() => locations.refreshSceneControls());
  }
});
