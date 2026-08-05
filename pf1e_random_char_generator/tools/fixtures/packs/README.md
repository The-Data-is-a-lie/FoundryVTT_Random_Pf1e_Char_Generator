# Compendium dumps

This directory is **empty on purpose right now**, and that is a known coverage hole.

Foundry stores compendium packs as LevelDB directories, which bare `node` cannot read. A native
LevelDB dependency was rejected for a repo whose whole premise is no build step (ticket 11), so the
packs the build reads are dumped to JSON by a Foundry GM macro instead:

    tools/dump_packs.macro.js

Run it once in your world, then move the downloaded files here:

    pf1spheres.magic-talents.json
    pf1spheres.combat-talents.json
    pf1-pow.disciplines.json
    pf1-psionics.powers.json

(`pf1-config.json` from the same run goes one level up, in `tools/fixtures/`.)

**Until those files exist**, `tools/foundry-stubs.mjs` reports pf1spheres, pf1-pow and pf1-psionics
as *inactive*. That is a real code path — plenty of users do not have those modules — but it means
the **active** branches (the Spheres talent walk, `processPathOfWar`, the psionic power walk) are
recorded only in their fallback form. The harness prints a NOTE on every run saying so, and the
goldens will change when the dumps land. That re-bless is expected; do it with

    node tools/generate_character.test.mjs --update

**These dumps go stale.** When pf1spheres, pf1-pow or pf1-psionics updates, nothing here notices on
its own except one check: each dump records the module version it came from, and the harness warns
when the installed version has moved. Re-run the macro when it does.
