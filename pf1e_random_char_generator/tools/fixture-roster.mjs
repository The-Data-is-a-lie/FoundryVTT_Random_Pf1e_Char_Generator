/**
 * The fixture roster, shared by every harness that drives the main character path.
 *
 * This lived inside `generate_character.test.mjs` until `bench.mjs` needed the same list. Copying it
 * would have meant a benchmark that silently stops covering a fixture the suite still tests, so the
 * list moved here and both import it. Nothing else belongs in this file — it is data, not behaviour.
 */

/**
 * The roster ticket 01 settled. Seven payloads recorded by the backend, copied into this repo rather
 * than read out of a sibling checkout so the suite stands on its own.
 *
 * `modded` is a FLAG, not another fixture: the modded sheet swaps six template files for their
 * `_MODS` twins and is otherwise the same code, so it costs one fixture to cover rather than seven.
 *
 * `sop` is the one HAND-AUTHORED payload, and it closes the gap ticket 01 recorded: every payload the
 * backend gave us has `might` (combat) Spheres content only, so `magic_talent_items` was empty in all
 * seven and the Spheres-of-POWER half of the build had no golden at all — including the synthesized
 * Destructive Blast attack item and the branch that decides, per talent, whether a conditional rides
 * the blast or the main weapon. Ticket 06 merges that branch into the shared engine, so it had to be
 * recorded first. It is `rogue.json` plus six real talents (names checked against the dumped
 * pf1spheres.magic-talents pack and against magic_talent_conditionals.json), deliberately
 * interleaved Destruction / not-Destruction so a refactor that groups by target action and reorders
 * either list shows up as a diff. Replace it with a real backend payload when one exists.
 */
export const FIXTURE_ROSTER = [
  { name: 'martial',    payload: 'martial.json',    modded: 'n', buffs: 'n', covers: 'fighter 16 — the plain path: no casting, no subsystem' },
  { name: 'rogue',      payload: 'rogue.json',      modded: 'n', buffs: 'y', covers: 'rogue 18 — skills-heavy, custom buffs on' },
  { name: 'caster',     payload: 'caster.json',     modded: 'n', buffs: 'n', covers: 'summoner/cleric 9 — prepared AND spontaneous spellbooks in one run' },
  { name: 'initiator',  payload: 'initiator.json',  modded: 'n', buffs: 'n', covers: 'warlord 10 — Path of War maneuvers, stances, disciplines' },
  { name: 'manifester', payload: 'manifester.json', modded: 'n', buffs: 'n', covers: 'psion 5 — psionic powers and manifester books' },
  { name: 'mentor',     payload: 'mentor.json',     modded: 'n', buffs: 'n', covers: 'fighter 15 — trainers/professions and Spheres of Might talents' },
  { name: 'companion',  payload: 'companion.json',  modded: 'y', buffs: 'y', covers: 'druid 4 — THE MODDED BRANCH (_MODS templates) + bonded creatures in the payload' },
  { name: 'sop',        payload: 'sop.json',        modded: 'n', buffs: 'y', covers: 'rogue 18 + Spheres of POWER — magic talents, the Destructive Blast item, blast-vs-weapon conditional targets' },
  // Backend seed 41, `mythic: 7`. Chosen for tradition RICHNESS: 3 drawbacks, 2 boons, a quality,
  // a boon-with-grant (the granted option's rules text folded inside its boon's entry) and
  // +1 mythic power — every tag branch of the Mythic band in one payload, plus the mythic path
  // class item (Champion, tier 7) from mythic_paths.json.
  { name: 'mythic',     payload: 'mythic.json',     modded: 'n', buffs: 'n', covers: 'aegis 10 + MYTHIC tier 7 — the Champion class item, the Mythic band, all five feature tags' },
];

/** The packs the build reads, and the module whose active-check gates each one. */
export const WANTED_PACKS = [
  { module: 'pf1spheres',   packId: 'pf1spheres.magic-talents' },
  { module: 'pf1spheres',   packId: 'pf1spheres.combat-talents' },
  { module: 'pf1-pow',      packId: 'pf1-pow.disciplines' },
  { module: 'pf1-psionics', packId: 'pf1-psionics.powers' },
];
