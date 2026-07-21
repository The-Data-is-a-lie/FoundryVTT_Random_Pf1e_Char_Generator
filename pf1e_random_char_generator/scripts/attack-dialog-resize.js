// Make the pf1 attack-roll dialog a resizable window so a weapon stacked with many conditionals can
// be dragged larger. pf1's AttackDialog (ApplicationV1) ships with resizable:false; patch its static
// defaultOptions getter so every new instance opts in. Paired with styles/attack-dialog.css, which
// flexes the conditionals list to fill the extra height.
Hooks.once("ready", () => {
  const AD = globalThis.pf1?.applications?.AttackDialog;
  if (!AD) {
    console.warn("pf1e_random_char_generator | AttackDialog not found; resize patch skipped");
    return;
  }
  const desc = Object.getOwnPropertyDescriptor(AD, "defaultOptions");
  if (!desc?.get) {
    console.warn("pf1e_random_char_generator | AttackDialog.defaultOptions has no getter; resize patch skipped");
    return;
  }
  const superGet = desc.get;
  Object.defineProperty(AD, "defaultOptions", {
    configurable: true,
    get() {
      return foundry.utils.mergeObject(superGet.call(this), { resizable: true }, { inplace: false });
    },
  });
  console.log("pf1e_random_char_generator | AttackDialog is now resizable");
});
