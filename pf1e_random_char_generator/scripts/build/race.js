/**
 * The race stage — one item, and the smallest stage in the build.
 *
 * It is a leaf: nothing downstream reads back what it wrote, and it reads nothing but the payload's
 * chosen race and the `everyRace` bundle. That is why it was extracted first, as the cheapest proof
 * that a stage can leave the closure and change nothing.
 */
import { extractItems, appendJsonToTemplate } from './items.js';

export function addRace(ctx) {
  const race = ctx.characterData.chosen_race;

  // Clone: the matched race items go onto the sheet by reference, and the trait-normalization pass
  // at the end of the build then rewrites their system fields. Without this, that pass would edit
  // the loaded template, which the loader hands to every later generation in the session.
  const everyRacePathData = structuredClone(ctx.templates.everyRace);
  const items = extractItems(everyRacePathData);
  const matchedItems = items.filter(item => item.name === race);
  console.log("matchedItems", matchedItems);
  if (!matchedItems) return;

  // "Class" is the log label, not a destination — see appendJsonToTemplate on why sectionKey has
  // never selected anything. The race item sorts itself into place like every other item.
  appendJsonToTemplate(matchedItems, ctx.exportTemplate, "Class");
}
