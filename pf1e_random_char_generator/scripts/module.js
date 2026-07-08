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

  // Settings must be registered during Foundry's "init" hook — game.settings isn't ready at
  // module-load time. Registering here guarantees the Backend URL setting exists before the
  // Character Generator button reads it.
  Hooks.once("init", () => MyModule.init());