/**
 * Psionics — powers, manifester books, and the flags that make pf1-psionics render at all.
 *
 * Structurally this is Path of War one more time (a legacy fallback, a synthesize path, a compendium
 * match, progression stamping), and the resemblance is left alone on purpose: whether that
 * duplication is worth unifying is a judgement to make on its own, not a discovery to act on in the
 * middle of an extraction.
 *
 * The synthesize path is not a theoretical branch — the `manifester` fixture exercises it, and the
 * harness has already caught one shipped bug in it (synthesized powers that were free to manifest).
 */
import { appendJsonToTemplate, appendFeatDivider, synthesizeFeatItem, assignSequentialSort } from './items.js';
import { capitalizeWords, powNorm } from '../shared/text.js';
import { log } from '../shared/log.js';

// Psionics is the Path of War shape one more time: the backend picks the powers and computes the
// numbers, a third-party module (pf1-psionics) renders them.
//
// The load-bearing difference is that pf1-psionics shows its ENTIRE Psionics tab off a single
// condition — actor-sheet.mjs checks whether any manifester book flag has inUse:true. It reads no
// class item, no class tag, no power item. So a generated manifester without these flags arrives
// with its powers in the Items directory and nothing on the sheet, and the GM has to add a class
// by hand in the settings panel to reveal it. configureManifesters is that fix.
//
// Powers become pf1-psionics.power items: cloned from the module's own pack when the name matches
// (real icons, actions, prepared descriptions), synthesized from the backend's powers_desc_dict
// otherwise. Misses are EXPECTED — a measured 67 of the backend's powers are Metzofitz-only
// content that exists in no compendium anywhere.
//
// Power POINTS stay the module's to compute (autoLevelPowerPoints), because its tables and ours
// are the same twenty numbers — validate_psionics_data.py asserts exactly that, every run. That
// only works if book.class is the class ITEM's tag, so a tag miss is warned about rather than
// left to surface as a plausible-looking zero. The backend's pp_per_day seeds the CURRENT pool
// instead, so a generated NPC arrives rested; .maximum is derived during actor prep, which has
// not run yet. With pf1-psionics disabled we fall back to feat items plus a charge pool, the same
// way the Path of War block above falls back.

const MANIFESTER_SLOTS = ['primary', 'secondary', 'tertiary'];
// The seven discipline keys pf1-psionics recognises (data/disciplines.mjs). Anything else makes
// system.school undefined and drops the power out of Psionics-Magic Transparency.
const PSIONIC_DISCIPLINES = ['athanatism', 'clairsentience', 'metacreativity', 'psychokinesis',
                             'psychometabolism', 'psychoportation', 'telepathy'];

// Scraped discipline prose -> the module's key. The wiki writes "Telepathy (Compulsion)
// [Mind-Affecting]"; the key is the first word, lowercased.
function disciplineKey(raw) {
  const first = String(raw || '').trim().split(/[\s([]/)[0].toLowerCase();
  return PSIONIC_DISCIPLINES.includes(first) ? first : 'athanatism';
}

// "Auditory and visual" / "Material, Mental" -> the module's five display booleans.
function displayFlags(ctx, raw) {
  const s = String(raw || '').toLowerCase();
  const has = k => s.includes(k);
  return { auditory: has('auditory'), material: has('material'), mental: has('mental'),
           olfactory: has('olfactory'), visual: has('visual') };
}

// The manifester entries that get a pf1-psionics book, in payload order. Two kinds are filtered
// out and both are legitimate: the soulknife carries an entry with no key ability (it manifests
// nothing — its mind blade is a weapon, not a subsystem), and a manifester whose key ability
// failed the score gate reads all zeroes. The aegis DOES get one: power points, no powers.
function manifestingBooks(ctx) {
  return (ctx.characterData.manifesters || []).filter(m => m && m.manifesting_stat && m.caster_type);
}

// Write the pf1-psionics manifester book flags. Returns backend class name -> book slot, so the
// power items below can point at the book that granted them.
function configureManifesters(ctx, books) {
  const flags = ctx.exportTemplate.flags || (ctx.exportTemplate.flags = {});
  const psionics = flags['pf1-psionics'] || (flags['pf1-psionics'] = {});
  const manifesters = psionics.manifesters || (psionics.manifesters = {});

  if (books.length > MANIFESTER_SLOTS.length) {
    console.warn(`Psionics: ${books.length} manifesting classes but only ${MANIFESTER_SLOTS.length} pf1-psionics books — dropping ${books.slice(MANIFESTER_SLOTS.length).map(b => b.name).join(', ')}.`);
  }

  const slotFor = new Map();
  for (let s = 0; s < books.length && s < MANIFESTER_SLOTS.length; s++) {
    const book = books[s];
    const slot = MANIFESTER_SLOTS[s];
    const display = book.display || capitalizeWords(book.name || '');
    const classItem = (ctx.exportTemplate.items || []).find(i => i.type === 'class' && i.name === display);
    const tag = classItem?.system?.tag;
    if (!tag) {
      // pf1-psionics derives power points from book.cl.classLevelTotal, which needs this tag. A
      // miss reads as zero points with no error anywhere, so it gets said out loud here.
      console.warn(`Psionics: no class item tag for "${display}" — its power points will read 0.`);
    }
    manifesters[slot] = Object.assign({}, manifesters[slot], {
      inUse: true,               // <- the whole condition pf1-psionics gates its tab on
      name: display,
      class: tag || book.name,
      casterType: book.caster_type,
      ability: book.manifesting_stat,
      autoLevelPowerPoints: true,
      autoAttributePowerPoints: true,
      autoMaxPowerLevel: true,
    });
    slotFor.set(book.name, slot);
    log.debug(`Manifester ${slot} <- ${display} (${book.caster_type}, ${book.manifesting_stat}, ML ${book.manifester_level}, ${book.pp_per_day} pp)`);
  }

  const pp = books.slice(0, MANIFESTER_SLOTS.length)
    .reduce((sum, b) => sum + (Number(b.pp_per_day) || 0), 0);
  psionics.powerPoints = Object.assign({}, psionics.powerPoints, { current: pp, temporary: 0 });
  return slotFor;
}

// Full pf1-psionics.power item from a powers_desc_dict entry (field set mirrors the module's
// PowerModel). Used only when the powers pack has no name match.
function synthesizePowerItem(ctx, name, d, slot, level) {
  const header = `<p><strong>${d.discipline || ''}${level ? ` ${level}` : ''}</strong></p>`;
  const meta = [['manifesting time', 'Manifesting Time'], ['range', 'Range'],
                ['duration', 'Duration'], ['saving throw', 'Saving Throw'],
                ['power resistance', 'Power Resistance'], ['power points', 'Power Points']]
    .filter(([k]) => d[k]).map(([k, label]) => `<p><em>${label}:</em> ${d[k]}</p>`).join('');
  const body = d.text ? `<hr>${String(d.text).split(/\n{2,}/).map(p => `<p>${p}</p>`).join('')}` : '';
  const augment = d.augment ? `<hr><p><em>Augment:</em> ${d.augment}</p>` : '';
  const timeMatch = String(d['manifesting time'] || '').toLowerCase()
    .match(/\b(swift|immediate|standard|move|full)\b/);
  return {
    name,
    type: "pf1-psionics.power",
    img: "icons/svg/daze.svg",
    system: {
      description: { value: header + meta + body + augment },
      discipline: disciplineKey(d.discipline),
      subdiscipline: [], descriptors: [],
      level: Number(level) || 0,
      manifester: slot,
      manifestTime: { value: 1, units: timeMatch ? timeMatch[1] : "standard" },
      display: displayFlags(ctx, d.display),
      modifiers: { cl: 0, sl: 0 },
      known: true,
      prepared: false,
      // "No" / "None" mean the power ignores power resistance; the module's default is true.
      sr: !/^\s*(no|none)\b/i.test(String(d['power resistance'] || '')),
      showInCombat: true,
      actions: [], changes: [], contextNotes: [], sources: [],
      // The rest of pf1-psionics' PowerModel, filled with the defaults all 593 pack documents
      // share. A synthesized power used to be missing these, which made it structurally different
      // from a native one -- and one of them is not cosmetic: `uses.autoDeductChargesCost` is the
      // formula that spends power points when the power is manifested, so a gap-filled power was
      // free to cast. The pack is missing "Suppress Veil" and "Malefic Metamorphosis" outright, so
      // this path is the only thing standing between those powers and a broken sheet.
      attackNotes: [], effectNotes: [], scriptCalls: [], tags: [],
      links: { children: [] },
      // pf1's own boolean/dictionary flag bags, which live INSIDE system. The item-level `flags`
      // below is Foundry's module bag and a different thing -- every pack document carries
      // `{"pf1-psionics": {sourceUrl: ...}}` there, which a synthesized power has no URL for.
      flags: { boolean: {}, dictionary: {} },
      // Deliberately empty: `learnedAt` drives the "which class can learn this at what level" UI,
      // and the power is already granted and known here.
      learnedAt: { class: {} },
      uses: { autoDeductChargesCost: "max(0, @sl * 2 - 1)" },
    },
    effects: [], flags: {},
  };
}

// Pre-pf1-psionics fallback: powers as plain feat items under a divider, plus one per-class power
// point pool so the number the backend computed is still on the sheet somewhere.
async function legacyProcessPsionicsFeats(ctx, books) {
  const descs = ctx.characterData.powers_desc_dict || {};
  await appendFeatDivider(ctx, "__________________Psionics______________", 4200, 'feat');

  const items = [];
  for (const book of books) {
    const display = book.display || capitalizeWords(book.name || '');
    // The power point pool: a flat maxFormula, not a @classes.<tag>.level expression, because
    // power points are a published table plus an ability formula, not a per-level slope.
    const pool = synthesizeFeatItem(`Power Points (${display})`,
      `<p>Power points per day for ${display} at manifester level ${book.manifester_level}.</p>`,
      "systems/pf1/icons/skills/blue_36.jpg");
    pool.system.uses = { value: Number(book.pp_per_day) || 0, per: "day",
                         maxFormula: String(Number(book.pp_per_day) || 0),
                         autoDeductChargesCost: "", rechargeFormula: "" };
    items.push(pool);

    (book.powers_by_level || []).forEach((bucket, level) => {
      for (const name of bucket) {
        const d = descs[name] || {};
        const header = `<p><strong>${d.discipline || ''} power ${level}</strong></p>`;
        const meta = ['manifesting time', 'range', 'duration', 'saving throw', 'power points']
          .filter(k => d[k]).map(k => `<p><em>${capitalizeWords(k)}:</em> ${d[k]}</p>`).join('');
        const body = d.text ? `<hr><p>${d.text}</p>` : '';
        items.push(synthesizeFeatItem(`${name} (Power ${level})`, header + meta + body,
                                      "icons/svg/daze.svg"));
      }
    });
  }
  assignSequentialSort(items, 4210);
  appendJsonToTemplate(items, ctx.exportTemplate, 'Psionics');
  log.debug(`Psionics (legacy): injected ${items.length} power/pool feat items.`);
}

export async function addPsionics(ctx) {
  try {
    const books = manifestingBooks(ctx);
    if (!books.length) return;   // non-manifesters and old payloads: no psionics at all

    if (!game.modules.get('pf1-psionics')?.active) {
      console.warn('Psionics: pf1-psionics module inactive — falling back to legacy feat items.');
      return legacyProcessPsionicsFeats(ctx, books);
    }

    const slotFor = configureManifesters(ctx, books);
    const descs = ctx.characterData.powers_desc_dict || {};

    // One-shot compendium load keyed by normalized name. powNorm also folds the curly apostrophe,
    // which this pack genuinely mixes: "Artificer's Surge" (U+2019) sits beside "Reaper's Blade".
    let packDocs = new Map();
    try {
      const pack = game.packs.get('pf1-psionics.powers');
      if (pack) {
        const docs = await pack.getDocuments();
        packDocs = new Map(docs.map(doc => [powNorm(doc.name), doc]));
      } else {
        console.warn('Psionics: pf1-psionics.powers pack not found — synthesizing all items.');
      }
    } catch (e) {
      console.warn('Psionics: could not read pf1-psionics.powers — synthesizing all items.', e);
    }

    const items = [];
    let misses = 0;
    for (const book of books) {
      const slot = slotFor.get(book.name);
      if (!slot) continue;   // dropped for want of a book slot; already warned about
      // powers_by_level is the only record of which power sits at which level: the description
      // entry keys its levels by power LIST ("psion/wilder"), not by class.
      (book.powers_by_level || []).forEach((bucket, level) => {
        for (const name of bucket) {
          const d = descs[name] || {};
          const doc = packDocs.get(powNorm(name));
          if (doc) {
            const item = doc.toObject();
            delete item._id;            // fresh embedded id on actor creation
            item.system = item.system || {};
            item.system.manifester = slot;
            item.system.known = true;
            item.system.level = level;  // the level THIS class learns it at
            items.push(item);
          } else {
            misses++;
            console.warn(`Psionics: "${name}" not in pf1-psionics.powers — synthesizing from backend data.`);
            items.push(synthesizePowerItem(ctx, name, d, slot, level));
          }
        }
      });
    }

    assignSequentialSort(items, 4210);
    appendJsonToTemplate(items, ctx.exportTemplate, 'Psionics');
    log.debug(`Psionics: ${books.length} manifester book(s), ${items.length} native pf1-psionics.power items (${misses} synthesized).`);
  } catch (error) {
    console.error('Error processing the Psionics section:', error);
  }
}
