/**
 * Compatibility with the installed pf1 system — not a build step.
 *
 * Nothing here decides anything about the character. It rewrites shapes the harvested templates
 * carry into the shapes the system expects, and it runs LAST, over everything already built. This
 * is its own named module rather than a tail-end loop in the orchestrator for one reason: it is the
 * file someone will need to find when a pf1 version bump breaks items on the sheet, and a
 * `pf1-compat.js` is findable in a way that "the bottom of the skills section" was not.
 */

/**
 * The item "trait" group fields, which pf1 v11 stores as BARE ARRAYS of keys.
 *
 * Its item `prepareData` (`item-pf.mjs`) only builds the iterable `{standard, custom}` model when
 * the stored value is already an array. The harvested templates carry legacy pf1 v10 OBJECT shapes
 * (`{base:[...]}` / `{value, custom}`), which the v11 model leaves untouched — so `trait.standard`
 * comes out undefined and opening the item sheet throws "a.standard is not iterable".
 */
const TRAIT_FIELDS = ['weaponGroups', 'weaponProf', 'armorProf', 'languages',
                      'descriptors', 'subschool', 'creatureTypes', 'creatureSubtypes'];

/** Coerce one trait field to the bare array v11 wants, from whichever legacy shape it is in. */
function toTraitArray(v) {
  if (v == null || Array.isArray(v)) return v;          // null / already a bare array -> leave
  if (typeof v === 'string') return [v];                // single value -> [value]
  if (typeof v === 'object') {                          // {base} | {value,custom} | {standard,custom}
    const out = [];
    for (const k of ['base', 'value', 'standard', 'custom']) {
      if (Array.isArray(v[k])) out.push(...v[k]);
    }
    return out;
  }
  return v;
}

function normalizeItemTraits(item) {
  const s = item?.system;
  if (!s) return;
  for (const k of TRAIT_FIELDS) if (k in s) s[k] = toTraitArray(s[k]);
}

/**
 * Normalize every built item's trait fields.
 *
 * Item-type-agnostic on purpose — it matches what Foundry-native items look like, rather than
 * enumerating which of our builders produce which legacy shape. **Runs last**, after every stage has
 * appended: an item added after this point keeps its legacy shape and throws on the sheet.
 */
export function normalizeTraitShapes(ctx) {
  const exportTemplate = ctx.exportTemplate;
  if (exportTemplate && Array.isArray(exportTemplate.items)) {
    for (const it of exportTemplate.items) normalizeItemTraits(it);
  }
}
