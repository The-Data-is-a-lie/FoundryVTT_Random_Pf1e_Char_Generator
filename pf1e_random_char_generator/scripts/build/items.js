/**
 * The item-building layer every stage sits on.
 *
 * These are the helpers `modify-abilities.js` calls from everywhere — `appendJsonToTemplate` alone
 * has 31 call sites — and they are extracted BEFORE any stage moves, deliberately. A stage pulled
 * out of the closure ahead of them either drags a private copy of each or reaches back into the
 * closure it was supposed to be leaving; the strangler split only stays honest if the shared floor
 * is already under it. That ordering is this file's whole reason to exist.
 *
 * The split inside this file is between helpers that need the build context and helpers that do not:
 *
 *   - **Pure**, taking only what they are handed — `appendJsonToTemplate`, `synthesizeFeatItem`,
 *     `assignSequentialSort`, `assignToFeatSection`, `addingReceivedLocationToName`. These keep the
 *     signatures they had in the closure, so no call site changes.
 *   - **Context-taking**, because they mint ids or read the thing being built — `applyBuffData`,
 *     `applyFeatBuffOverlay`, `appendFeatDivider`. These gain `ctx` as their first parameter.
 *
 * `generateUniqueID` and `randomChangeId` did NOT move here. Both were one-line forwards to
 * `ctx.newId` / `ctx.newChangeId` that existed only so closure code could reach the mint without
 * naming the context; a stage that already has `ctx` should just call it. They are deleted and their
 * callers now mint directly, which also drops fifteen `await`s on a function that never awaited
 * anything.
 */

/**
 * Append built items onto the actor payload.
 *
 * `sectionKey` is log-only — it names the caller for the console line and has never selected
 * anything. Every builder appends to the same flat `items` array; what actually sorts an item into
 * a section on the sheet is its `system.subType` plus its `sort`.
 */
export function appendJsonToTemplate(collectedItems, exportTemplate, sectionKey) {
  if (!exportTemplate.items) {
    exportTemplate.items = {}; // Initialize if it doesn't exist
  }

  // Append new items to the existing array under the sectionKey
  exportTemplate.items = [...exportTemplate.items, ...collectedItems];

  console.log(`Appended ${collectedItems.length} items to ${sectionKey} in exportTemplate.`);
}

/**
 * Minimal pf1 feat item for names with no `every_feat.json` template (homebrew style chains,
 * Martial Training, Path of War maneuvers). No `_id` — Foundry assigns one on `actor.update`.
 */
export function synthesizeFeatItem(name, descriptionHtml, img = "icons/svg/book.svg") {
  return {
    name, type: "feat", img,
    system: {
      description: { value: descriptionHtml || "" },
      tags: [], actions: [], attackNotes: [], effectNotes: [],
      uses: { value: null, per: "", autoDeductChargesCost: "", maxFormula: "", rechargeFormula: "" },
      changes: [], contextNotes: [], links: { children: [], charges: [] },
      tag: "", scriptCalls: [], subType: "feat", abilityType: "na",
      associations: { classes: [] }, showInQuickbar: false, disabled: false,
    },
    effects: [], flags: {},
  };
}

/** Number a run of items into consecutive sheet positions. */
export function assignSequentialSort(items, startingSort = 0, step = 10) {
  let currentSort = startingSort;
  for (const item of items) {
    item.sort = currentSort;
    currentSort += step;
  }
}

/** Put items in the Feats section of the sheet. */
export function assignToFeatSection(items) {
  for (const item of items) {
    if (item.system) {
      item.system.subType = "feat";
    } else {
      console.warn("Item missing 'system' property:", item);
    }
  }
}

/**
 * Prefix each item's name with where the character received it — `"(Level 3) Weapon Focus"`, or the
 * backend's own per-item label when it supplied one (`"Fighter 1: Weapon Focus"`).
 */
export function addingReceivedLocationToName(items, label = "Level", shouldIncrement = true, startingNumber = 1, step = 1, customLevels = null, labelArray = null) {
  let current = startingNumber;

  for (let i = 0; i < items.length; i++) {
    if (labelArray && labelArray[i] != null) {
      // Per-feat label from the backend, e.g. "Fighter 1: Weapon Focus"
      items[i].name = `${labelArray[i]}: ${items[i].name}`;
    } else {
      const level = customLevels?.[i] ?? current;
      items[i].name = `(${label} ${level}) ${items[i].name}`;
      if (!customLevels && shouldIncrement) current += step;
    }
  }
}

/**
 * Merge a backend `{changes, contextNotes}` entry onto ANY pf1 item (feats via
 * `applyFeatBuffOverlay`, equipment via `processItem`).
 *
 * Changes dedupe by target and contextNotes by exact text, and both matter: the compendium item may
 * already automate the same bonus (so e.g. Circlet of Persuasion's official change never
 * double-applies), and duplicate equipment names hit the same cached item twice.
 */
export function applyBuffData(ctx, item, buff) {
  if (!buff || !item) return;
  item.system = item.system || {};
  if (Array.isArray(buff.changes) && buff.changes.length) {
    const existing = Array.isArray(item.system.changes) ? item.system.changes : [];
    const existingTargets = new Set(existing.map(c => c && c.target));
    const additions = buff.changes
      .filter(ch => ch && !existingTargets.has(ch.target))
      .map(ch => Object.assign(
        { formula: "0", target: "", type: "untyped", operator: "add", priority: 0, value: 0 },
        ch, { _id: (ch && ch._id) || ctx.newChangeId(ch) }));
    if (additions.length) item.system.changes = existing.concat(additions);
  }
  if (Array.isArray(buff.contextNotes) && buff.contextNotes.length) {
    const existing = Array.isArray(item.system.contextNotes) ? item.system.contextNotes : [];
    const existingTexts = new Set(existing.map(n => n && n.text));
    const additions = buff.contextNotes.filter(n => n && !existingTexts.has(n.text));
    if (additions.length) item.system.contextNotes = existing.concat(additions);
  }
}

/**
 * The feat-shaped form of the overlay: backend-authored buffs for a placed feat, keyed by its
 * lowercased name. Only feats the compendium does NOT already automate are in the map, so nothing
 * double-applies.
 */
export function applyFeatBuffOverlay(ctx, item, itemLc) {
  applyBuffData(ctx, item, ctx.featChangesMap[itemLc]);
}

/**
 * Inline section divider (no template file needed): a feat item with an underscore name, sorted into
 * place. `subType` picks the sheet section — `"feat"` (Feats), `"classFeat"` (Class Features),
 * `"trait"` (Traits). Heads the Trainers / Professions blocks and the Class Features / Traits /
 * Flaws groups.
 */
export function appendFeatDivider(ctx, title, sort, subType = 'feat') {
  const div = synthesizeFeatItem(title, "");
  div.sort = sort;
  div.system.subType = subType;
  appendJsonToTemplate([div], ctx.exportTemplate, "Feat");
}
