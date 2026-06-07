Unreleased

- Added: Class bonus feats now display as "(Class) (level): Feat" (e.g. "Fighter 1: Weapon Focus"), using the backend's class_feat_labels field.
- Fixed: Skill ranks now populate on generated character sheets (they were silently dropped because the backend's skill_ranks string was never parsed).
- Fixed: Craft, Perform, and Profession ranks are now written as pf1e subskills (crf/prf/pro -> subSkills) instead of the ignored container rank; the Profession subskill is named after the character's chosen profession.

Version 1.00

Intial release