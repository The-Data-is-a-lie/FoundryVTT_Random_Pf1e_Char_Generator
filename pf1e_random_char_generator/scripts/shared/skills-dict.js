/**
 * Backend skill name -> pf1 skill id.
 *
 * Must stay in lockstep with the backend's canonical `data.skills` / `data.SKILL_IDS`. Anything the
 * backend sends that isn't here (or isn't in base_skill.json) is DROPPED -- which is how "gather
 * information", "lore" and "knowledge martial" used to eat a character's skill ranks. Both were
 * removed from the backend pool; "artistry" went with them because pf1 treats art/lor as container
 * skills whose ranks must live in subSkills, so ranks on the container are unusable.
 *
 * Extracted so the companion renderer (`createCompanions.js`) spends a bonded creature's ranks
 * through the same table the character does. `modify-abilities.js` declared an identical copy
 * inline until that half-finished extraction was closed; this is now the module's only copy, and
 * it must stay that way — two tables that must agree and are edited separately are the drift bug
 * the paragraph above is a scar from.
 */
export const skillsDict = {
  // "Pull_name": "Foundry_name"
  acrobatics: "acr",
  appraise: "apr",
  bluff: "blf",
  climb: "clm",
  craft: "crf",
  diplomacy: "dip",
  "disable device": "dev",
  disguise: "dis",
  "escape artist": "esc",
  fly: "fly",
  "handle animal": "han",
  heal: "hea",
  intimidate: "int",
  "knowledge arcana": "kar",
  "knowledge dungeoneering": "kdu",
  "knowledge engineering": "ken",
  "knowledge geography": "kge",
  "knowledge history": "khi",
  "knowledge local": "klo",
  "knowledge nature": "kna",
  "knowledge nobility": "kno",
  "knowledge planes": "kpl",
  "knowledge religion": "kre",
  linguistics: "lin",
  perception: "per",
  perform: "prf",
  profession: "pro",
  ride: "rid",
  "sense motive": "sen",
  "sleight of hand": "slt",
  spellcraft: "spl",
  stealth: "ste",
  survival: "sur",
  swim: "swm",
  "use magic device": "umd",
};
