/**
 * The one class roster this module has.
 *
 * WHY THIS FILE EXISTS. The roster used to be hard-coded in three places -- the dropdown in
 * button.js, a byte-identical dead copy in html_dialog.js, and the collectItems() boundary list in
 * modify-abilities.js -- with nothing checking that they agreed. They stopped agreeing: the six
 * Occult Adventures classes shipped in the backend on 2026-08-03 and reached modify-abilities.js
 * but never the dropdown, so for a day they were only reachable by rolling Random. One list, one
 * gate: Backend/scripts/validate_class_roster.py fails if this file disagrees with the backend's
 * class_data.json or with every_class.json.
 *
 * TWO EXPORTS, TWO ORDERS, AND THEY ARE NOT INTERCHANGEABLE:
 *
 *   CLASS_GROUPS      display order, grouped by family. Drives the dropdown's <optgroup>s and the
 *                     per-group "Random <group>" entries. Group order = the order the sections
 *                     appear; class order inside a group = the order they are listed.
 *   CLASS_ITEM_ORDER  the order the class Items appear in every_class.json. collectItems() slices
 *                     from one class boundary to the NEXT, so this order is a contract, not a
 *                     preference: a name in the wrong place makes the preceding class swallow the
 *                     next one's items, and a missing name makes it swallow them all.
 *
 * The `token` on each group is the other half of a contract, with data.CLASS_GROUPS in the backend.
 * The dropdown sends "random-<token>"; util.py::_group_pool turns it back into a pool of that
 * family. Renaming a token here without renaming it there silently degrades that entry into a
 * whole-pool random roll.
 *
 * Regenerating: run Backend/scripts/validate_class_roster.py -- it prints the exact roster the
 * backend expects, so a class that lands in class_data.json turns into a one-line edit here.
 *
 * NOT LISTED, deliberately: `stalker` and `zealot`. They are fully defined in the backend but
 * pf1-pow 1.6.4 ships no class Item for either, so the sheet cannot resolve them; they sit in
 * data.pow_classes_pending_foundry. Add them here on the day a release ships them, and empty that
 * list in data.py.
 */

export const CLASS_GROUPS = [
  {
    token: 'base',
    label: 'Paizo base classes',
    classes: [
      'Alchemist', 'Antipaladin', 'Arcanist', 'Barbarian', 'Barbarian (Unchained)', 'Bard',
      'Bloodrager', 'Brawler', 'Cavalier', 'Cleric', 'Druid', 'Fighter', 'Gunslinger', 'Hunter',
      'Inquisitor', 'Investigator', 'Magus', 'Monk', 'Monk (Unchained)', 'Ninja', 'Omdura',
      'Oracle', 'Paladin', 'Ranger', 'Rogue', 'Rogue (Unchained)', 'Samurai', 'Shaman', 'Shifter',
      'Skald', 'Slayer', 'Sorcerer', 'Summoner', 'Summoner (Unchained)', 'Swashbuckler',
      'Vampire Hunter', 'Vigilante', 'Warpriest', 'Witch', 'Wizard',
    ],
  },
  {
    // Initiator classes (pf1-pow). "Medic" is a Metzofitz homebrew initiator that ships in the
    // same pack.
    token: 'pow',
    label: 'Path of War',
    classes: ['Harbinger', 'Medic', 'Mystic', 'Warder', 'Warlord'],
  },
  {
    // Dreamscarred Press, via the Library of Metzofitz (pf1-psionics). "Psychic Warrior" slugs to
    // "psychic-warrior"; chooseClass turns the hyphen back into the backend's space-separated key,
    // exactly as it does for the Unchained variants.
    token: 'psionic',
    label: 'Psionics',
    classes: [
      'Aegis', 'Cryptic', 'Dread', 'Highlord', 'Marksman', 'Psion', 'Psychic Warrior', 'Soulknife',
      'Tactician', 'Vitalist', 'Voyager', 'Wilder',
    ],
  },
  {
    token: 'occult',
    label: 'Occult Adventures',
    classes: ['Kineticist', 'Medium', 'Mesmerist', 'Occultist', 'Psychic', 'Spiritualist'],
  },
  {
    // The five Paizo NPC classes. They roll like any other class -- an NPC generator that cannot
    // produce a commoner is missing the most common person in the world.
    token: 'npc',
    label: 'NPC classes',
    classes: ['Adept', 'Aristocrat', 'Commoner', 'Expert', 'Warrior'],
  },
];

export const CLASS_ITEM_ORDER = [
  'Alchemist', 'Antipaladin', 'Arcanist', 'Barbarian', 'Barbarian (Unchained)', 'Bard',
  'Bloodrager', 'Brawler', 'Cavalier', 'Cleric', 'Druid', 'Fighter', 'Gunslinger', 'Hunter',
  'Inquisitor', 'Kineticist', 'Magus', 'Medium', 'Mesmerist', 'Monk', 'Monk (Unchained)', 'Ninja',
  'Occultist', 'Oracle', 'Paladin', 'Psychic', 'Ranger', 'Rogue', 'Rogue (Unchained)', 'Samurai',
  'Skald', 'Slayer', 'Sorcerer', 'Spiritualist', 'Summoner', 'Summoner (Unchained)', 'Vigilante',
  'Witch', 'Wizard', 'Warpriest', 'Investigator', 'Shifter', 'Shaman', 'Swashbuckler',
  // Path of War (spliced by Backend/scripts/build_every_class.mjs)
  'Harbinger', 'Medic', 'Mystic', 'Warder', 'Warlord',
  // Psionics (same splice)
  'Aegis', 'Cryptic', 'Dread', 'Highlord', 'Marksman', 'Psion', 'Psychic Warrior', 'Soulknife',
  'Tactician', 'Vitalist', 'Voyager', 'Wilder',
  // NPC classes (same splice, 2026-08-04)
  'Adept', 'Aristocrat', 'Commoner', 'Expert', 'Warrior',
  // pf-content's pf-collab-content, not pf1.classes -- see build_every_class.mjs
  'Omdura', 'Vampire Hunter',
];

/** Every roster name, flat, in display order. */
export const ALL_CLASSES = CLASS_GROUPS.flatMap(group => group.classes);

/** The dropdown's slug form, and the backend's un-slug rule's input: "Psychic Warrior" -> "psychic-warrior". */
export const classSlug = (name) => name.toLowerCase().replace(/\s/g, '-');

/**
 * Classes whose spellcasting is DIVINE, which decides two things on a pf1 spellbook: `kind`, and
 * whether arcane spell failure applies.
 *
 * Here rather than with either of its two readers because it has two: the core-attributes stage
 * configures the legacy single spellbook from it, and the spells stage configures the per-class
 * books from it. It is a roster, so it lives with the rosters.
 *
 * Not derived from `CLASS_GROUPS`: the families there are display groupings and several divine
 * casters sit outside any "divine" one.
 */
export const DIVINE_CASTERS = ["Cleric", "Druid", "Oracle", "Paladin", "Ranger", "Summoner", "Warpriest"];
