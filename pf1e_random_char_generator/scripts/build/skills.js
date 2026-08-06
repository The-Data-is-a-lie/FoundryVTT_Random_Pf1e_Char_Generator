/**
 * Skills — rank assignment onto the pf1 skill block.
 *
 * The backend names skills its own way and hands over a flat `skill_ranks` map; this renames them to
 * pf1 ids (`skillsDict`, in shared/skills-dict.js — see that file for why the table is load-bearing)
 * and writes the ranks into a copy of the base skill block, which becomes `system.skills`.
 *
 * Two things in here look like accidents and are not:
 *
 *   - **The template is cloned before use.** `createUpdatedSkills` writes this character's ranks and
 *     subskills straight into the skill entries it is handed, so without the clone the next character
 *     built in the same Foundry session starts from these ranks. That is exactly what the harness's
 *     cross-payload fixture exists to catch.
 *   - **Craft / Perform / Profession are CONTAINER skills.** Their ranks live under `.subSkills`,
 *     never on the container's own `rank`, and professions run on a homebrew rank pool the backend
 *     has already distributed — this stage assigns what it is given and must not redistribute it.
 *
 * `overwriteData` used to be here as its own function, reading back what `createUpdatedSkills` had
 * just written out to `localStorage`. Prep reduced the round trip to a one-line assignment, and that
 * line is now inlined at the bottom of this stage rather than kept as a function that only forwards.
 */
import { skillsDict } from '../shared/skills-dict.js';

async function convertSkillNames(characterData, skillsDict) {
  // The backend sends skill_ranks as a JSON string; parse it if it hasn't been already.
  const characterDataParsed = typeof characterData === 'string' ? JSON.parse(characterData) : characterData;

  // Change skill_rank names -> foundry names
  const newCharacterData = {};

  for (const skill in characterDataParsed) {
    // Check if the skill name exists in the skillsDict
    if (skillsDict[skill]) {
      // Map the original skill name to the new name from the dictionary
      newCharacterData[skillsDict[skill]] = characterDataParsed[skill];
    } else {
      // If the skill isn't in the dictionary, keep the original name
      newCharacterData[skill] = characterDataParsed[skill];
    }
  }

  return newCharacterData;
}

async function createUpdatedSkills(updatedCharacterData, baseSkillPathData, professions, craftType, professionRanks) {
  // Craft/Perform/Profession are pf1e "container" skills: their ranks must live under
  // .subSkills (e.g. crf.subSkills.crf1.rank), not on the container's own rank.
  const CONTAINERS = { crf: "Craft", prf: "Perform", pro: "Profession" };

  for (let skill in updatedCharacterData) {
    const rank = updatedCharacterData[skill];
    const parent = baseSkillPathData[skill];
    if (!parent) {
      // Unmapped skill -> its ranks would vanish off the sheet. Shout, don't swallow.
      if (rank > 0) console.warn(`pf1e_random_char_generator: dropping ${rank} rank(s) in unmapped skill "${skill}"`);
      continue;
    }

    if (CONTAINERS[skill]) {
      parent.rank = 0; // ranks live on the subskill, not the container

      if (skill === "pro" && Array.isArray(professions) && professions.length) {
        // One subskill per chosen profession ("Profession: <name>"). Ranks come from the backend's
        // profession_ranks payload -- professions run on their own homebrew rank pool
        // (5 + level + 10 per Multi Talented feat, capped 10 each / 15 for True Calling), which the
        // backend has already distributed and reconciled with any Always Improving ranks.
        // This used to split the ORDINARY Profession skill rank evenly across the professions, which
        // rendered a 45-rank pool as 1/0/0/0.
        parent.subSkills = parent.subSkills || {};
        const n = professions.length;
        for (let i = 0; i < n; i++) {
          const entry = Array.isArray(professionRanks) ? professionRanks[i] : null;
          parent.subSkills["pro" + (i + 1)] = {
            name: "Profession: " + professions[i],
            ability: parent.ability,
            rt: parent.rt,
            acp: parent.acp,
            rank: entry ? (Number(entry.ranks) || 0) : 0
          };
        }
        if (!Array.isArray(professionRanks) || !professionRanks.length) {
          console.warn("pf1e_random_char_generator: no profession_ranks in payload; Profession subskills set to 0 rank (backend needs redeploying)");
        }
      } else if (rank > 0) {
        parent.subSkills = parent.subSkills || {};
        // Craft shows its specialization ("Craft: Pottery"); fall back to "Craft" when the
        // backend hasn't been redeployed with craft_type. Perform stays "Perform".
        let name = CONTAINERS[skill];
        if (skill === "crf") name = craftType ? ("Craft: " + craftType) : "Craft";
        parent.subSkills[skill + "1"] = {
          name,
          ability: parent.ability,
          rt: parent.rt,
          acp: parent.acp,
          rank
        };
      }
    } else {
      parent.rank = rank; // normal flat skills: unchanged behavior
    }
  }

  return baseSkillPathData;
}

export async function addSkills(ctx) {
  const characterData = ctx.characterData;
  // Load the collected skills into an accessible object
  try {
    const updatedCharacterData = await convertSkillNames(characterData.skill_ranks, skillsDict);
    // Chosen professions name the Profession subskill (otherwise this field is bio-only).
    let professions = characterData.professions;
    if (typeof professions === 'string') {
      try { professions = JSON.parse(professions); } catch (e) { professions = [professions]; }
    }
    // Per-profession rank data ([{name, skill_label, ranks, cap, ...}]), parallel to `professions`.
    let professionRanks = characterData.profession_ranks;
    if (typeof professionRanks === 'string') {
      try { professionRanks = JSON.parse(professionRanks); } catch (e) { professionRanks = []; }
    }
    // Clone: createUpdatedSkills() writes this character's ranks and subSkills straight into the
    // template's skill entries, so the next character would start from these ranks instead of 0.
    const baseSkillTemplate = structuredClone(ctx.templates.baseSkill);
    // Now we have a JSON object with the proper names and ranks -> need to update the skills
    const collectedSkills = await createUpdatedSkills(
      updatedCharacterData, baseSkillTemplate, professions, characterData.craft_type, professionRanks);
    ctx.exportTemplate.system.skills = collectedSkills;
  } catch (error) {
    console.error("Error in skills processing:", error);
    console.log("characterData.skill_ranks:", characterData.skill_ranks);
    console.log("skillsDict:", skillsDict);
    console.log("baseSkill template:", ctx.templates.baseSkill);
  }
}
