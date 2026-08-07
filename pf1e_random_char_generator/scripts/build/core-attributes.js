/**
 * Core attributes — everything scalar the sheet carries about the character themselves.
 *
 * Ability scores, HP, alignment and deity, age, currency, languages, the token name, the legacy
 * single-spellbook configuration, and the biography. No items, no subsystems: this stage writes into
 * `exportTemplate.system` and `exportTemplate` directly and nothing later reads any of it back.
 *
 * That makes it a leaf, which is why it came out early. The body below is the closure block moved
 * verbatim -- deliberately, because the whole point of the strangle is that a stage behaves
 * identically once it is handed what it used to close over.
 *
 * `pf1` / `CONFIG` are read as globals, not injected. That is the settled decision for the Foundry
 * surface (build-context ticket 05): the harness stubs them instead.
 */
import { DIVINE_CASTERS } from '../shared/class-roster.js';
import { log } from '../shared/log.js';

/**
 * `attributePath[type] = variable`, and nothing else.
 *
 * It reads like an indirection with no purpose now, and it very nearly is -- but it used to
 * re-serialise the ENTIRE export template into localStorage on every call, which is most of what
 * this stage cost. Kept because unwinding ~50 call sites into direct assignments is churn with no
 * reader, and the name does say what each line is doing.
 */
function updateAttribute(variable, attributePath, type) {
  attributePath[type] = variable;
  log.debug(attributePath[type]);
}

export function applyCoreAttributes(ctx) {
  const characterData = ctx.characterData;
  const exportTemplate = ctx.exportTemplate;


  // Stamp the backend's generator version onto the actor as a hidden flag, so any exported sheet
  // reveals which backend build produced it (instant stale-vs-fresh diagnosis when feats look wrong).
  exportTemplate.flags = exportTemplate.flags || {};
  exportTemplate.flags['pf1e_random_char_generator'] = { version: characterData.generator_version || 'unknown' };


  // Stats
  updateAttribute(characterData.str, exportTemplate.system.abilities.str, 'value');
  updateAttribute(characterData.dex, exportTemplate.system.abilities.dex, 'value');
  updateAttribute(characterData.con, exportTemplate.system.abilities.con, 'value');
  updateAttribute(characterData.int, exportTemplate.system.abilities.int, 'value');
  updateAttribute(characterData.wis, exportTemplate.system.abilities.wis, 'value');
  updateAttribute(characterData.cha, exportTemplate.system.abilities.cha, 'value');


  // Saving Throws
  //  updateAttribute(characterData.fort_saving_throw, exportTemplate.system.attributes.savingThrows.fort, 'base');
  //  updateAttribute(characterData.will_saving_throw, exportTemplate.system.attributes.savingThrows.will, 'base');
  //  updateAttribute(characterData.ref_saving_throw, exportTemplate.system.attributes.savingThrows.ref, 'base');

  // Health (HP)
  updateAttribute(characterData.total_rolled_hp, exportTemplate.system.attributes.hp, 'base');

  // Deity
  updateAttribute(characterData.mini_alignment, exportTemplate.system.details, 'alignment');
  // Older backends ship deity_name as a list of aliases; pf1's details.deity is a StringField
  // and an array in source data crashes actor data preparation -> take the primary name.
  const deityName = Array.isArray(characterData.deity_name)
    ? (characterData.deity_name[0] ?? '')
    : characterData.deity_name;
  updateAttribute(deityName, exportTemplate.system.details, 'deity');
  updateAttribute(characterData.age_number, exportTemplate.system.details, 'age');

  // Currency
  updateAttribute(characterData.platnium, exportTemplate.system.currency, 'pp');

  // Languages: pf1 renders traits.languages.value entries via its lowercase language ids
  // (pf1.config.languages); names it doesn't know (Druidic, homebrew) belong in .custom.
  function normalizeLanguages(languageList) {
    const pf1Languages = pf1?.config?.languages ?? CONFIG?.PF1?.languages ?? {};
    const idsByName = {};
    for (const [id, label] of Object.entries(pf1Languages)) {
      idsByName[String(label).toLowerCase()] = id;
      idsByName[id.toLowerCase()] = id;
    }
    const ids = [];
    const custom = [];
    for (const lang of languageList ?? []) {
      const id = idsByName[String(lang).toLowerCase()];
      if (id) {
        if (!ids.includes(id)) ids.push(id);
      } else if (!custom.includes(lang)) {
        custom.push(lang);
      }
    }
    return { ids, custom };
  }

  // Background info
  updateAttribute(characterData.character_full_name, exportTemplate, 'name');
  // pf1 v11 stores traits as FLAT ARRAYS in source data — prep splits known ids into .standard
  // and unknown strings into .custom. The old {value, custom} object shape is silently ignored
  // (Array.isArray fails on it), which left only race-granted languages showing on the sheet.
  const normalizedLanguages = normalizeLanguages(characterData.language_text);
  updateAttribute(
    [...normalizedLanguages.ids, ...normalizedLanguages.custom],
    exportTemplate.system.traits, 'languages');
  updateAttribute(characterData.gender, exportTemplate.system.details, 'gender');
  updateAttribute(characterData.height_number, exportTemplate.system.details, 'height');
  updateAttribute(characterData.weight_number, exportTemplate.system.details, 'weight');

  // Edit token name
  updateAttribute(characterData.character_full_name, exportTemplate.prototypeToken, 'name');

  // Fixing Casting level / stat / kind.

  // LEGACY single-book path: backends without a `spellbooks` payload configure the primary book
  // from the flat primary-class fields. New backends ship per-caster-class `spellbooks` and the
  // Spell Section assigns one pf1 book (primary/secondary/tertiary) per caster class instead.
  if (!Array.isArray(characterData.spellbooks) || !characterData.spellbooks.length) {
  updateAttribute(characterData.casting_level_str_foundry, exportTemplate.system.attributes.spells.spellbooks.primary, 'casterType');
  updateAttribute(characterData.casting_level_str_foundry, exportTemplate.system.attributes.spells.spellbooks.secondary, 'casterType');

  // Fixing casting stat
  updateAttribute(characterData.main_stat, exportTemplate.system.attributes.spells.spellbooks.primary, 'ability');
  updateAttribute(characterData.main_stat, exportTemplate.system.attributes.spells.spellbooks.secondary, 'ability');

  log.debug("this is the casting level", characterData.casting_level_str_foundry);
  //  Arcane spell failure
  // Check if the class (in lower case) is in the list
  if (DIVINE_CASTERS.some(cls => cls.toLowerCase() === characterData.c_class.toLowerCase())) {
   // spell failure
   updateAttribute(false, exportTemplate.system.attributes.spells.spellbooks.primary, 'arcaneSpellFailure');
   updateAttribute(false, exportTemplate.system.attributes.spells.spellbooks.secondary, 'arcaneSpellFailure');
   // spell type
   updateAttribute('divine', exportTemplate.system.attributes.spells.spellbooks.primary, 'kind');
   updateAttribute('divine', exportTemplate.system.attributes.spells.spellbooks.secondary, 'kind');

  } else {
   // spell failure
   updateAttribute(true, exportTemplate.system.attributes.spells.spellbooks.primary, 'arcaneSpellFailure');
   updateAttribute(true, exportTemplate.system.attributes.spells.spellbooks.secondary, 'arcaneSpellFailure');

   // spell type
   updateAttribute('arcane', exportTemplate.system.attributes.spells.spellbooks.primary, 'kind');
   updateAttribute('arcane', exportTemplate.system.attributes.spells.spellbooks.secondary, 'kind');
  }
}

  // Fixing spell level

  function stackWithParagraphs(...items) {
   return items.map(item => `<p>${item.label} ${item.value}</p><p></p>`).join('');
  }

  // Convert the backend's plain-text backstory (paragraphs separated by blank lines) into safe
  // biography HTML.
  function backstoryToHtml(text) {
   const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
   return String(text).split(/\n\s*\n/)
     .map(p => p.trim()).filter(Boolean)
     .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  }

  // LEGACY raw labeled dump -- only rendered for payloads that predate formatted_bio (see below).
  const combined_bio = stackWithParagraphs(
   { label: "", value: characterData.younger_brothers },
   { label: "", value: characterData.younger_sisters },
   { label: "", value: characterData.older_brothers },
   { label: "", value: characterData.older_sisters },
   { label: "this is your situation growing up with your parents: ", value: characterData.parents },
   { label: "these are your typical mannerisms:", value: characterData.mannerisms},
   { label: "these are your personality traits: ", value: characterData.personality_traits},
   { label: "these are your flaws:", value: characterData.flaw},
   { label: "this is your hair type:", value: characterData.hair_type },
   { label: "this is your hair color:", value: characterData.hair_color },
   { label: "this is your eye color: ", value: characterData.eye_color },
   { label: "this is your appearance:", value: characterData.appearance },
   { label: "these are your professions: ", value: characterData.professions },
   { label: "these are your background traits: ", value: characterData.background_traits },
   { label: "this is your region of origin: ", value: characterData.region },
   { label: "These are your specialty schools: ", value: characterData.specialty_schools },
   { label: "These are your counter schools:   ", value: characterData.counter_schools },
   { label: "These are your favored spell types, you prefer these:     ", value: characterData.chosen_spell_descriptor },
   { label: "These are your counter spell types, you don't want these: ", value: characterData.counter_spell_descriptor }
  );

  // Drop the prose's legacy closing labeled list (Personality:/Mannerisms:/Appearance:/Flaws:) --
  // the structured fact block above it shows those facts. New backends already strip it; this
  // covers payloads from a not-yet-redeployed backend (and cached localStorage payloads).
  function stripTrailingLabelList(text) {
    const paragraphs = String(text || '').trim().split(/\n\s*\n/);
    while (paragraphs.length
           && /^(personality|mannerisms|appearance|flaws|traits)\s*:/i.test(paragraphs[paragraphs.length - 1].trim())) {
      paragraphs.pop();
    }
    return paragraphs.join('\n\n').trim();
  }

  // Biography = the backend's structured fact block (formatted_bio), then a centered bold
  // "Backstory:" heading (with breathing room under the Appearance section), then the prose;
  // the Notes tab stays empty for session use (the old raw labeled dump is retired).
  // Old payloads without formatted_bio keep the previous behavior (prose in Biography + raw dump
  // in Notes, or raw dump alone), so nothing regresses on backend/module version skew.
  const backstoryText = stripTrailingLabelList(characterData.backstory);
  const formattedBio = (characterData.formatted_bio || '').trim();
  if (formattedBio) {
    let bioHtml = backstoryToHtml(formattedBio);
    if (backstoryText) {
      bioHtml += '<p></p><p></p>'
        + '<h2 style="text-align:center"><strong>Backstory:</strong></h2>'
        + backstoryToHtml(backstoryText);
    }
    updateAttribute(bioHtml, exportTemplate.system.details.biography, 'value');
  } else if (backstoryText) {
    updateAttribute(backstoryToHtml(backstoryText), exportTemplate.system.details.biography, 'value');
    updateAttribute(combined_bio, exportTemplate.system.details.notes, 'value');
  } else {
    updateAttribute(combined_bio, exportTemplate.system.details.biography, 'value');
  }
}
