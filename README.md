**Release info + Downloads:**
[View Releases: ](https://gitlab.com/pathfinder_1e_randomized_character_generator/FoundryVTT_Random_Pf1e_Char_Generator/-/releases)

                                                    
**Detailed instructions:**
[GitLab Documentation: ](https://gitlab.com/pathfinder_1e_randomized_character_generator/FoundryVTT_Random_Pf1e_Char_Generator/-/wikis/home)

## The two-step table workflow

Getting a fully-armed NPC onto the table is deliberately two steps:

1. **Generate + inject.** Open the module's dialog in Foundry (the *Random Character
   Generator* button), pick your inputs (region, race, class, level range, …) and submit.
   The backend generates the character and the module builds the Actor: sheet numbers,
   classes, feats, gear, spellbooks, Path of War maneuvers, Spheres talents, buffs.

   **Where that button lives is up to you.** The module's settings offer four locations,
   independently — the original draggable button that floats over the canvas (on by
   default), a tool in the **Token scene controls**, an entry at the bottom of the
   **sidebar tab bar**, and a button inside Foundry's own **Create Actor dialog**. They are
   per-machine settings, so each person at the table chooses their own, and toggling one
   takes effect without a reload.

   The Create Actor one is worth knowing about: it picks up the **Name** and **Folder** you
   typed in that dialog, so the NPC arrives named and filed where you meant it (bonded
   creatures follow it). Leave either field alone and you get the old behaviour — the
   generated name, in the auto-created *Random Characters* folder.

2. **Run the Apply Conditionals macro** (the companion `pf1-conditional-applier` repo,
   `README.md` there). Select the new token and run the macro: it scans the actor and
   offers every curated weapon toggle it can match — class features (Smite Evil, Sneak
   Attack, Stunning Fist, Judgment, …), active-feat toggles (Power Attack), weapon
   qualities, PoW maneuvers/stances, Spheres talents and spell riders — in a per-weapon
   review dialog before attaching anything.

Step 2 exists because generation only wires the main weapon and new conditionals keep
being curated: the macro is an idempotent *sync* — re-running it picks up new curation
and newly learned abilities, drops lost ones, and never touches hand-authored rows. There
is no creation-time equivalent, by design; re-run the macro instead.
