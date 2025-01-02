export default class MyModule {
    static registerSettings() {
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
  
  // Call init to register settings
  MyModule.init();