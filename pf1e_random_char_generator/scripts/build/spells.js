/**
 * Spells — the pf1 spellbooks, the spell items that fill them, and the riders on attack spells.
 *
 * One pf1 spellbook per caster class (primary/secondary/tertiary, highest class level first), each
 * configured from the backend's per-class book and then filled from `every_spell.json`. Legacy
 * payloads without `spellbooks` keep the old single-book path, which is why `assignSpellTypes` still
 * exists: it is that path's version of what `configureSpellbook` does for the modern one.
 *
 * `addSpellRiders` stays here rather than with the attack-toggle stage even though it goes through
 * the same `attachConditionals` engine, because it is the one attacher that targets a SPELL's actions
 * instead of the main weapon's — it has no interest in `findMainWeapon`, and none of hazard 2 applies
 * to it.
 *
 * **Two helpers are exported for readers outside this stage**, and both need the spellbook config, so
 * they belong with the stage that owns it rather than in `shared/`:
 *   - `subSpellTokens` — the spell-buff conditional caller substitutes `@slvl` / `@castMod` through it.
 *   - `spellCasterLevelNum` — the house aura ranges want the combined caster level as a number.
 */
import { DIVINE_CASTERS } from '../shared/class-roster.js';
import { appendJsonToTemplate } from './items.js';
import { attachConditionals } from './conditional-engine.js';
import { capitalizeWords } from '../shared/text.js';
import { log } from '../shared/log.js';

async function determineSpellType(ctx, className = ctx.upperCaseClass){
  let type = 'prepared';
  log.debug("determineSpellType for class ", className);

  const classUpper = String(className).toUpperCase();
  // Convert the list to uppercase for a case-insensitive check
  const prepared_caster_list_upper = ctx.preparedCasterList.map(c => c.toUpperCase());

  // Check if the class is in the list (case insensitive)
  if (prepared_caster_list_upper.includes(classUpper)) {
    log.debug("Prepared Casters");
    type = "prepared";
  }
  // // Arcanist
  else if (classUpper === "ARCANIST") {
    log.debug("Arcanist caster -> hybrid");
    // need to name it type hybrid (instead of Arcanist for some reason)
    type = "hybrid";
  }
  // Spontaneous casters
  else {
    log.debug("Spontaneous Casters");
    type = "spontaneous";
  }

  return type;
}

// Configure one pf1 spellbook slot (primary/secondary/tertiary) from a backend per-class book
// ({name, display, level, casting_level_string, casting_stat, divine, ...}). The book's `class`
// must be the class ITEM's tag so pf1 auto-derives caster level from that class's own levels.
async function configureSpellbook(ctx, slot, book) {
  const exportTemplate = ctx.exportTemplate;
  const pfBook = exportTemplate.system?.attributes?.spells?.spellbooks?.[slot];
  if (!pfBook) {
    console.error(`Spellbook slot "${slot}" missing from the export template.`);
    return;
  }
  const display = book.display || capitalizeWords(book.name || '');
  const classItem = (exportTemplate.items || []).find(i => i.type === 'class' && i.name === display);
  pfBook.inUse = true;
  pfBook.name = display;
  pfBook.class = classItem?.system?.tag || book.name;
  pfBook.casterType = book.casting_level_string === 'mid' ? 'med' : (book.casting_level_string || 'low');
  pfBook.ability = book.casting_stat || ctx.characterData.main_stat;
  const isDivine = (book.divine !== undefined)
    ? !!book.divine
    : DIVINE_CASTERS.some(c => c.toLowerCase() === String(book.name).toLowerCase());
  pfBook.kind = isDivine ? 'divine' : 'arcane';
  pfBook.arcaneSpellFailure = !isDivine;
  pfBook.spellPreparationMode = await determineSpellType(ctx, display);
  log.debug(`Spellbook ${slot} <- ${display} (${pfBook.casterType}, ${pfBook.ability}, ${pfBook.kind}, ${pfBook.spellPreparationMode})`);
}


async function assignSpellTypes(ctx, type) {
  const exportTemplate = ctx.exportTemplate;
  if (exportTemplate.system && exportTemplate.system.attributes && exportTemplate.system.attributes.spells) {
    const primarySpellbook = exportTemplate.system.attributes.spells.spellbooks.primary;

    if (primarySpellbook) {
      log.debug('Before change:', primarySpellbook.spellPreparationMode);  // Log current value
      primarySpellbook.spellPreparationMode = type;
      // primarySpellbook.arcaneSpellFailure = false; // Set arcaneSpellFailure to false
      log.debug('After change:', primarySpellbook.spellPreparationMode);  // Log updated value
    } else {
      console.error('Primary spellbook not found in the exportTemplate.');
    }
  } else {
    console.error('Spell section structure missing in exportTemplate.');
  }
}


async function processSpell(ctx, spellListChooseFrom, slot = 'primary', book = null) {
  const characterData = ctx.characterData;
  const exportTemplate = ctx.exportTemplate;
  try {
    // Ensure only for characters with spells
    if (!Array.isArray(spellListChooseFrom) || spellListChooseFrom.length === 0) {
      console.error(`No spell list for ${book ? book.name : characterData.c_class} — nothing to cast.`);
      return;
    }


    // Retrieve spells data by template name
    const spells = ctx.templates.everySpell;

    // Check if spells is an array
    if (!Array.isArray(spells)) {
      console.error('Spells data is not an array or is undefined:', spells);
      return;
    }

    // The object, not a pre-built string -- see shared/log.js.
    log.debug("spell list structure", spellListChooseFrom);

    // Determine the spellbook's casting type up front so we know whether to mark spells prepared.
    const type = await determineSpellType(ctx, book ? (book.display || capitalizeWords(book.name || '')) : ctx.upperCaseClass);
    const markPrepared = (type === 'prepared' || type === 'hybrid');
    // Per-level prepared count from the backend (spells/day), aligned 1:1 to spellListChooseFrom.
    // Divine casters prepare their whole loadout (count == group size); spellbook casters (wizard,
    // witch, ...) prepare only a subset of the larger spellbook. Empty/0 for spontaneous casters.
    const preparedPerLevel = Array.isArray(book ? book.spells_prepared_per_level : characterData.spells_prepared_per_level)
      ? (book ? book.spells_prepared_per_level : characterData.spells_prepared_per_level) : [];

    // Consolidate all matched spells from the nested spell list, marking the prepared ones per level.
    const allMatchedSpells = [];

    // Case-insensitive name index. The backend sends names from data/spells.csv, whose article /
    // preposition casing ("Shield Of The Dawnflower") can differ from the compendium's canonical
    // casing ("Shield of the Dawnflower"). A strict === would silently drop ~250 such spells (while
    // their weapon conditional still attaches from spell_changes_dict, leaving an orphaned toggle).
    // Match leniently here, mirroring addSpellRiders and the feat lookups.
    const spellByLower = new Map();
    for (const r of spells) spellByLower.set((r.name || '').toLowerCase(), r);

    for (let level = 0; level < spellListChooseFrom.length; level++) {
      const spellArray = spellListChooseFrom[level] || [];
      let prepRemaining = markPrepared ? (Number(preparedPerLevel[level]) || 0) : 0;
      for (const spell of spellArray) {
        const matchedSpell = spellByLower.get((spell || '').toLowerCase());
        if (!matchedSpell) {
          console.warn(`Spell "${spell}" not found.`);
          continue;
        }
        // Clone so we don't mutate the shared every_spell.json cache.
        const item = JSON.parse(JSON.stringify(matchedSpell));
        // every_spell.json items ship with spellbook:"primary" baked in — point each spell at the
        // book that actually granted it (secondary/tertiary for the lower-leveled caster classes).
        if (item.system) item.system.spellbook = slot;
        if (item.system && item.system.level === 0) {
          // Cantrips/orisons: always prepared AND infinitely castable, for EVERY caster type
          // (prepared and spontaneous). Detected by the spell's own level so low casters with no
          // level-0 spells are unaffected.
          item.system.atWill = true;
          item.system.preparation = { ...(item.system.preparation || {}), value: 1, max: 1 };
        } else if (markPrepared && item.system) {
          const prepared = prepRemaining > 0 ? 1 : 0;
          if (prepared) prepRemaining--;
          // value = currently prepared; max = preparable (1 per spell, so spellbook spells stay
          // preparable even when not prepared today). Spontaneous books skip this entirely.
          item.system.preparation = { ...(item.system.preparation || {}), value: prepared, max: 1 };
        }
        allMatchedSpells.push(item);
      }
    }

    if (allMatchedSpells.length > 0) {

      if (!book) {
        // Legacy single-book payload: mark the primary book in use for the primary class.
        exportTemplate.system.attributes.spells.spellbooks.primary.inUse = true;
        exportTemplate.system.attributes.spells.spellbooks.primary.class = characterData.c_class;

        // Assign the spellbook's preparation mode (type determined above).
        await assignSpellTypes(ctx, type);
      }
      // (per-class books were already configured by configureSpellbook)

      // Append matched spells to the exportTemplate
      appendJsonToTemplate(allMatchedSpells, exportTemplate, "Spells");

    } else {
      console.error('No matching spells were found in the spell list.');
    }
  } catch (error) {
    console.error('Error reading or processing the Spell Section:', error);
  }
}

export async function addSpells(ctx) {
  const characterData = ctx.characterData;
  // One pf1 spellbook per caster class: primary = highest class level (level ties broken by caster
  // tier — the backend pre-sorts `spellbooks`; re-sort defensively for robustness), secondary the
  // next, tertiary the third. Legacy payloads without `spellbooks` keep the old single-book path.
  if (Array.isArray(characterData.spellbooks) && characterData.spellbooks.length) {
    const TIER_RANK = { high: 0, mid: 1, med: 1, low: 2 };
    const SPELLBOOK_SLOTS = ['primary', 'secondary', 'tertiary'];
    const casterBooks = characterData.spellbooks
      .filter(b => b && Array.isArray(b.spell_list_choose_from) && b.spell_list_choose_from.length)
      .sort((a, b) => ((Number(b.level) || 0) - (Number(a.level) || 0))
        || ((TIER_RANK[a.casting_level_string] ?? 3) - (TIER_RANK[b.casting_level_string] ?? 3)));
    if (casterBooks.length > SPELLBOOK_SLOTS.length) {
      console.warn(`Spellbooks: ${casterBooks.length} caster classes but only ${SPELLBOOK_SLOTS.length} pf1 books — dropping ${casterBooks.slice(SPELLBOOK_SLOTS.length).map(b => b.name).join(', ')}.`);
    }
    for (let s = 0; s < casterBooks.length && s < SPELLBOOK_SLOTS.length; s++) {
      await configureSpellbook(ctx, SPELLBOOK_SLOTS[s], casterBooks[s]);
      await processSpell(ctx, casterBooks[s].spell_list_choose_from, SPELLBOOK_SLOTS[s], casterBooks[s]);
    }
  } else {
    await processSpell(ctx, characterData.spell_list_choose_from);
  }
}

// ----- Spell riders: save + non-damage riders on Bucket-B attack spells ----- //
// Damaging touch-attack spells (Chill Touch, Frigid Touch, Acid Arrow) already carry their attack +
// damage from every_spell.json; the backend's spell_riders_dict adds the formal save (only if the
// compendium action has none) and the non-damage riders (ability damage, conditions, ongoing damage)
// as default-on text conditionals with the numbers in [[ ]]. Keyed by display-cased spell name.
// Enriched rider clauses (enrich_conditional_riders.py) restate the spell save DC as
// `[[ 10 + @slvl + @castMod ]]`. Those two tokens aren't real pf1 roll-data paths, so substitute them
// to concrete forms at attach time (mirrors the @INITMOD / @spheres.* substitution the maneuver and
// sphere paths already do): @slvl -> the spell's own level, @castMod -> @abilities.<book ability>.mod.
// Combined pf1-spell caster level for the homebrew rule: each casting class contributes its FULL class
// level (high/med), or level-3 for a 'low' caster (bard/ranger/paladin RAW), summed over the
// spellbooks and floored to 1 -- the pf1-spell analog of sphereCLExpr(). Uses @classes.<tag>.level,
// NOT @spells.<book>.cl.total (which pf1 leaves at full class level even for low casters, since
// casterType only drives slots/max spell level).
function spellCLExpr(ctx) {
  const books = ctx.exportTemplate.system?.attributes?.spells?.spellbooks || {};
  const terms = ['primary', 'secondary', 'tertiary']
    .map(s => books[s]).filter(b => b && b.inUse && b.class)
    .map(b => {
      const lvl = `@classes.${b.class}.level`;
      return b.casterType === 'low' ? `max(${lvl} - 3, 0)` : lvl;   // high/med -> full level
    });
  return `max(${terms.join(' + ') || '0'}, 1)`;
}
// NUMERIC twin of spellCLExpr(): the same homebrew combined caster level as a concrete integer, for
// places that need a number now rather than a pf1 roll-data formula (e.g. aura ranges in feet).
// The backend already bakes the low-caster -3 into each book -- caster_formula() in spells.py sets
// casting_level_num to the class level and only the 'low' branch subtracts 3 -- so summing the books
// reproduces the rule exactly. Falls back to the legacy primary-class level for payloads that predate
// the `spellbooks` key (see the LEGACY single-book path above), so those render unchanged.
export function spellCasterLevelNum(ctx) {
  const characterData = ctx.characterData;
  const books = characterData.spellbooks;
  if (!Array.isArray(books) || !books.length) return Number(characterData.level) || 1;
  const total = books.reduce((n, b) => n + Math.max(0, Number(b?.casting_level_num) || 0), 0);
  return Math.max(1, total);
}
export function subSpellTokens(ctx, text, spell) {
  const books = ctx.exportTemplate.system?.attributes?.spells?.spellbooks || {};
  const bk = spell?.system?.spellbook;
  const ability = (books[bk] && books[bk].ability) || (books.primary && books.primary.ability) || 'int';
  const level = spell?.system?.level ?? 0;
  return String(text == null ? '' : text)
    .replaceAll('@spells.primary.cl.total', spellCLExpr(ctx))
    .replaceAll('@slvl', String(level))
    .replaceAll('@castMod', `@abilities.${ability}.mod`);
}

export async function addSpellRiders(ctx) {
  const exportTemplate = ctx.exportTemplate;
  try {
    const spellRiders = ctx.characterData.spell_riders_dict || {};
    if (!Object.keys(spellRiders).length) return;
    const SAVE_ID = { fortitude: 'fort', reflex: 'ref', will: 'will' };
    const spells = (exportTemplate.items || []).filter(i => i.type === 'spell');
    let added = 0;
    for (const [spellName, entry] of Object.entries(spellRiders)) {
      if (!entry) continue;
      const lc = spellName.toLowerCase();
      const spell = spells.find(s => (s.name || '').toLowerCase() === lc);
      if (!spell) { console.warn(`Spell riders: "${spellName}" not built — skipping.`); continue; }
      for (const action of (spell.system?.actions || [])) {
        // Formal save — map the backend's full word to the pf1 id; don't clobber a compendium save.
        if (entry.save && !(action.save && action.save.type)) {
          action.save = {
            type: SAVE_ID[String(entry.save.type || '').toLowerCase()] || '',
            dc: entry.save.dc || '',
            description: entry.save.description || '',
            harmless: !!entry.save.harmless,
          };
        }
        // Riders → default-on text conditionals (no structured modifier; the spell's own damage
        // stands). The only attacher that targets a SPELL's actions rather than the weapon's — the
        // engine does not care, since the action arrives on the entry.
        if (Array.isArray(entry.riders) && entry.riders.length) {
          added += attachConditionals(ctx, entry.riders.map(riderText => ({
            action,
            name: subSpellTokens(ctx, riderText, spell),
            default: true,
            modifiers: [],
          })));
        }
      }
    }
    log.debug(`Spells: attached ${added} spell rider(s) across ${Object.keys(spellRiders).length} spell(s).`);
  } catch (error) {
    console.error('Error attaching spell riders:', error);
  }
}
