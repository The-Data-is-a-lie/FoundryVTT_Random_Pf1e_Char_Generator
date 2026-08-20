import { reloadTemplates } from './build/template-loader.js';
import { setLogging } from './shared/log.js';
import {
  SETTINGS,
  syncFloatingButtonVisibility,
  syncSidebarButton,
  refreshSceneControls,
} from './button-locations.js';

export default class MyModule {
    static registerSettings() {
      // Where the generator POSTs the character inputs. Kept as a setting (not a hardcoded const in
      // button.js) so the shipped default can never be a stray localhost dev endpoint, and so local
      // development just points this at http://localhost:5001/update_character_data.
      game.settings.register("pf1e_random_char_generator", "backendUrl", {
        name: "Backend URL",
        hint: "The character-generator backend endpoint the module POSTs to. Defaults to the hosted server. For local development point it at http://localhost:5001/update_character_data.",
        scope: "world",  // GM sets it once for the whole table
        config: true,    // show it in the module settings menu
        type: String,
        default: "https://pathfinder-char-creator-web-public-use.onrender.com/update_character_data",
      });

      // Dev convenience: prefer a locally running backend over the hosted one. CLIENT scope —
      // stored per-browser/per-machine, so it never syncs to players and a shipped release can
      // never arrive with it enabled (defaults live in code: false / localhost). When the local
      // server isn't up, button.js falls back to the Backend URL setting automatically.
      game.settings.register("pf1e_random_char_generator", "preferLocalBackend", {
        name: "Prefer local backend (dev)",
        hint: "Try the local dev backend first when generating; falls back to the hosted server automatically if it isn't running. Per-machine setting.",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
      });
      game.settings.register("pf1e_random_char_generator", "localBackendUrl", {
        name: "Local backend URL (dev)",
        hint: "Endpoint tried first when 'Prefer local backend' is on.",
        scope: "client",
        config: true,
        type: String,
        default: "http://localhost:5001/update_character_data",
      });

      // Inherent luck is a MINORITY trait by design: a quarter of characters take a stake and a
      // quarter of those sell, so a negative-luck character is roughly 1 in 13. That is the right
      // number for play and a miserable one for testing — you can roll ten characters and see none.
      // This forces the backend's `luck_direction` input, which exists for exactly this and is
      // otherwise unreachable from Foundry. CLIENT scope + default "" so it is per-machine, never
      // syncs to players, and can never ship enabled.
      game.settings.register("pf1e_random_char_generator", "forceLuckDirection", {
        name: "Force luck direction (dev)",
        hint: "Testing aid. 'Sell' makes every generated character take NEGATIVE luck; 'Buy' makes every one positive. Off means the normal weighted roll (~1 in 13 characters sells). Per-machine setting.",
        scope: "client",
        config: true,
        type: String,
        choices: { "": "Off (normal roll)", "sell": "Sell — always negative luck", "buy": "Buy — always positive luck" },
        default: "",
      });

      // Optimized mode (backend spec §15) is a named backend key the dialog does not carry. Same
      // shape as forceLuckDirection: CLIENT scope + default false, merged in at click time so it
      // is a per-machine testing switch that never joins the saved character request and can never
      // ship enabled.
      game.settings.register("pf1e_random_char_generator", "optimizeBuilds", {
        name: "Optimized builds (dev)",
        hint: "Testing aid. Generate every character in optimized mode — the backend picks the power role from its class map and makes every unspecified choice well. Requires a backend that supports optimized mode (the local dev server); leave OFF against the hosted server, which would misread the request. Per-machine setting.",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
      });

      // The build narrates itself through ~100 log lines per character. CLIENT scope, default off:
      // it is a debugging aid, and left on it both buries the console and stops devtools releasing
      // every object it was handed. See shared/log.js.
      game.settings.register("pf1e_random_char_generator", "verboseLogging", {
        name: "Verbose logging (dev)",
        hint: "Narrate every build step to the browser console. Off by default; warnings and errors are always shown either way.",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: (value) => setLogging(value),
      });

      // WHERE the Character Generator button lives. Four independent toggles rather than one
      // dropdown, because these are not mutually exclusive: a GM who puts it in the Create Actor
      // dialog usually still wants it on the scene controls. CLIENT scope throughout — where a
      // button sits on your screen is your business, not the world's, and a player at the same
      // table should not have the GM's layout pushed at them.
      //
      // Defaults reproduce today's UI exactly: the floating button on, the three new locations off.
      // An upgrade must not silently rearrange anyone's interface. Turning all four off leaves no
      // button at all, which is a legitimate thing to want (macro users) and is always undone from
      // this same settings page.
      //
      // Each onChange applies the change live; button-locations.js reads these settings inside its
      // render hooks, so nothing here needs a reload.
      game.settings.register("pf1e_random_char_generator", SETTINGS.floating, {
        name: "Button: floating (draggable)",
        hint: "Show the draggable Character Generator button that floats over the canvas. This is the original location and is on by default.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true,
        onChange: () => syncFloatingButtonVisibility(),
      });

      game.settings.register("pf1e_random_char_generator", SETTINGS.sceneControls, {
        name: "Button: scene controls",
        hint: "Add a Character Generator tool to the Token controls on the left toolbar. Needs a loaded scene, like every other scene-control tool.",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: () => refreshSceneControls(),
      });

      game.settings.register("pf1e_random_char_generator", SETTINGS.createActor, {
        name: "Button: Create Actor dialog",
        hint: "Add a Character Generator button to Foundry's Create Actor dialog, above 'Create Actor'. It uses the Name and Folder you typed there and generates straight away — it does not open the generator's options dialog.",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        // No onChange: the dialog reads this setting each time it renders, so the next one is right.
      });

      game.settings.register("pf1e_random_char_generator", SETTINGS.sidebar, {
        name: "Button: sidebar tabs",
        hint: "Add a Character Generator icon to the bottom of the sidebar tab bar, below the settings gear.",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: () => syncSidebarButton(),
      });

    }

    static init() {
      // Register the settings when the module is initialized
      this.registerSettings();
      // Settings only take effect on change once registered, so seed the current value.
      setLogging(game.settings.get("pf1e_random_char_generator", "verboseLogging"));
      this.exposeApi();
    }

    /**
     * Hang the module's console-facing helpers off its Foundry module entry.
     *
     * `reloadTemplates` exists because the template cache has a cost: templates are parsed once per
     * session, so editing spell_buffs.json (or any other template) by hand and clicking Generate
     * again no longer picks the change up. Whoever is authoring template data against a live world
     * needs a way out that isn't reloading Foundry:
     *
     *     game.modules.get('pf1e_random_char_generator').api.reloadTemplates()
     *
     * `setLogging` is the same setting as "Verbose logging" in the module config, reachable without
     * leaving the console mid-investigation:
     *
     *     game.modules.get('pf1e_random_char_generator').api.setLogging(true)
     */
    static exposeApi() {
      const module = game.modules?.get('pf1e_random_char_generator');
      if (!module) return;
      module.api = { ...(module.api || {}), reloadTemplates, setLogging };
    }
  }

  // Robust against load order: main.js imports this file dynamically from an async IIFE, so it
  // can resolve either BEFORE Foundry's "init" hook (register on the hook) or AFTER it already
  // fired (the hook would never run — register immediately; game.settings exists by then).
  if (globalThis.game?.settings?.register) {
    MyModule.init();
  } else {
    Hooks.once("init", () => MyModule.init());
  }