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

      game.settings.register("pf1e_random_char_generator", "modulePath", {
        name: "Module Path",
        hint: "Path to the module's resources.",
        scope: "world",  // or "client" depending on where you want it to be stored
        config: true,    // whether it should appear in the settings menu
        type: String,
        default: "",     // Default path or empty string
      });
    }

    static init() {
      // Register the settings when the module is initialized
      this.registerSettings();
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