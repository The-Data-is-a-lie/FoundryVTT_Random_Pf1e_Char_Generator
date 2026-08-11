import { reloadTemplates } from './build/template-loader.js';
import { setLogging } from './shared/log.js';

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