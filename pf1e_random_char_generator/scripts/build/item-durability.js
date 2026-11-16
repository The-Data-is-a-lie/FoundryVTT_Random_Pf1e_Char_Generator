/**
 * Special materials and the durability breakdown, as the backend reports them.
 *
 * **This module computes nothing.** The backend (`utils/class_func/item_materials.py`) owns every
 * number: which material was bought, and — when the house rules are on — a per-item
 * `item_durability` block whose labelled lines already sum to its totals. This file writes those
 * onto the pf1 item (`system.material`, `system.hp`, `system.hardness`) and prints the lines under
 * the item's description. A second implementation of the arithmetic here could only disagree.
 *
 * **PURE on purpose** — no `game`, no `ctx`, no reads of the template. Everything takes the item and
 * the payload fragment it needs, so `tools/item_durability.test.mjs` can drive every branch without
 * building a character.
 *
 * **A payload without these keys is a normal payload.** An older backend sends none of them, and a
 * character with the house rules off sends an empty `item_durability`. Every function here is a
 * no-op on missing input rather than a guard its caller has to remember.
 *
 * **Size is a line, never a field.** Items stay `system.size: "med"`: the breakdown's numbers are
 * Medium numbers and the size multiplier is one of its lines, which is how the table's GM writes
 * them by hand. Nothing here touches `system.size`.
 */

// The pf1 registry marks alchemical silver as an ADD-ON (a coating over the base metal), which
// lives in `system.material.addon` rather than `system.material.normal`. The registry is asked
// first; this is only what answers when there is no `pf1` global (the node harness).
const ADDON_FALLBACK = new Set(['alchemicalSilver']);
// Materials that are masterwork by definition (their price already includes it).
const MASTERWORK_FALLBACK = new Set(['adamantine', 'mithral', 'darkwood']);

const registryEntry = (id) => globalThis.pf1?.registry?.materials?.get?.(id);

/** "coldIron" -> "Cold Iron". The backend's ids are pf1's own, so the label is derivable. */
export function materialLabel(id) {
  if (!id || typeof id !== 'string') return '';
  const spaced = id.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Stamp the special material onto a weapon / attack / equipment item. No-op without one. */
export function applyMaterial(item, id) {
  if (!item?.system || !id) return false;
  const material = (item.system.material ??= {});
  if (registryEntry(id)?.addon ?? ADDON_FALLBACK.has(id)) {
    const addon = Array.isArray(material.addon) ? material.addon : [];
    material.addon = addon.includes(id) ? addon : [...addon, id];
  } else {
    material.normal = { ...(material.normal || {}), custom: false, value: id };
  }
  if (registryEntry(id)?.masterwork ?? MASTERWORK_FALLBACK.has(id)) item.system.masterwork = true;
  return true;
}

/**
 * Write the breakdown's totals into the item's real fields.
 *
 * The two shapes are both live: compendium weapons carry `hardness: {base, total}` and
 * `hp: {base, max, offset, value}`, equipment carries a bare `hardness` number and `hp: {max, value}`.
 * Each item keeps the shape it arrived in — only the numbers change.
 */
export function applyDurabilityTotals(item, block) {
  if (!item?.system || !block || !Number.isFinite(block.hp) || !Number.isFinite(block.hardness)) {
    return false;
  }
  const system = item.system;
  if (system.hardness && typeof system.hardness === 'object') {
    system.hardness = { ...system.hardness, base: block.hardness, total: block.hardness };
  } else {
    system.hardness = block.hardness;
  }
  const hp = (system.hp && typeof system.hp === 'object') ? { ...system.hp } : {};
  if ('base' in hp || !('max' in hp)) { hp.base = block.hp; hp.offset = 0; }
  if ('max' in hp) hp.max = block.hp;
  if ('value' in hp) hp.value = block.hp;
  system.hp = hp;
  return true;
}

const escapeHtml = (text) => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const signed = (value) => (value >= 0 ? `+${value}` : String(value));

// The marker every durability block starts with — what makes the append idempotent.
const MARKER = '<h3>Material</h3>';

/**
 * The breakdown as HTML, in the same `<h3>` blocks the per-quality rules text uses:
 *
 *   Material         Iron
 *   Hardness: 40     +10 Two-Handed Blade / +10 Iron / +10 Enhancement / +10 Impervious
 *   Hit Points: 280  +10 Two-Handed Blade / +30 Iron / +50 Enhancement / +50 Impervious / x2 for Large
 *   Size: Large      the source of each size step, when the item is not Medium
 */
export function durabilityHtml(block) {
  if (!block || !Array.isArray(block.hardness_lines) || !Array.isArray(block.hp_lines)) return '';
  const lines = (rows) => rows.map(([label, value]) => `${signed(value)} ${escapeHtml(label)}`);
  const sizeLines = Array.isArray(block.size_lines) ? block.size_lines : [];
  const hpLines = [...lines(block.hp_lines),
    ...sizeLines.map(([size, factor]) => `${escapeHtml(factor)} for ${escapeHtml(size)}`)];
  let html = `${MARKER}<p>${escapeHtml(block.material_label || materialLabel(block.material))}</p>`
    + `<h3>Hardness: ${block.hardness}</h3><p>${lines(block.hardness_lines).join('<br>')}</p>`
    + `<h3>Hit Points: ${block.hp}</h3><p>${hpLines.join('<br>')}</p>`;
  if (sizeLines.length) {
    const sources = (Array.isArray(block.size_sources) ? block.size_sources : []).filter(Boolean);
    const detail = sources.length ? sources.map(escapeHtml).join('<br>') : 'Sized for its wielder';
    html += `<h3>Size: ${escapeHtml(sizeLines[0][0])}</h3><p>${detail}</p>`;
  }
  return html;
}

/** Append the breakdown under the item's description, once. */
export function appendDurabilityDescription(item, block) {
  if (!item?.system?.description) return false;
  const html = durabilityHtml(block);
  if (!html || String(item.system.description.value || '').includes(MARKER)) return false;
  item.system.description.value = `${item.system.description.value || ''}${html}`;
  return true;
}

/** Everything for one inventory item: material, totals and the written breakdown. */
export function applyItemDurability(item, materialId, block) {
  applyMaterial(item, materialId);
  applyDurabilityTotals(item, block);
  appendDurabilityDescription(item, block);
}
