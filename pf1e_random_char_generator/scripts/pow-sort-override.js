// Re-registers pf1-pow's `sortManeuvers` Handlebars helper so the Path of War tab lists each
// level block's maneuvers grouped by discipline and, within a discipline, ordered
// Strike -> Boost -> Counter -> Stance (then name). pf1-pow's own helper
// (pf1-pow/scripts/hooks/setup.mjs) sorts discipline -> level only, interleaving the types.
//
// NOTE: the tab's outer structure is per-class -> per-LEVEL sections (pf1-pow.hbs loops
// filteredLevelsArray and filters `item.system.level == lvl` AROUND this helper), so level
// headers stay the top-level grouping no matter how this helper sorts — the override controls
// ordering inside each level section only.
//
// Registered on `ready`, which strictly follows pf1-pow's `setup` registration regardless of
// module load order. Handlebars helpers are global and last-write-wins, and templates resolve
// them by name at render time, so this wins without touching pf1-pow files. Filter semantics
// must stay identical to pf1-pow's helper: the template feeds the full actor.items map through
// it and slices by class/level around it.
Hooks.once('ready', () => {
  if (!game.modules.get('pf1-pow')?.active) return;
  const TYPE_ORDER = { Strike: 0, Boost: 1, Counter: 2, Stance: 3 };
  Handlebars.registerHelper('sortManeuvers', function (maneuvers) {
    if (Map.prototype.isPrototypeOf(maneuvers)) maneuvers = Array.from(maneuvers.values());
    maneuvers = maneuvers.filter(m => m.type === 'pf1-pow.maneuver');
    maneuvers.sort((a, b) => {
      const da = (a.system.discipline || '').trim().toLowerCase();
      const db = (b.system.discipline || '').trim().toLowerCase();
      return da.localeCompare(db)
        || (TYPE_ORDER[a.system.maneuverType] ?? 9) - (TYPE_ORDER[b.system.maneuverType] ?? 9)
        || (a.system.level || 0) - (b.system.level || 0)
        || a.name.localeCompare(b.name);
    });
    return maneuvers;
  });
  console.log('pf1e_random_char_generator | sortManeuvers override registered (discipline -> type -> level).');

  // Re-registers pf1-pow's `filteredLevelsArray` so the Path of War tab renders a level section
  // for EVERY maneuver level actually present on the actor, not just up to pf1-pow's computed
  // max. For Martial Training characters the backend grants maneuvers by FEAT TIER (MT III ->
  // level 3, MT VI -> level 6), but pf1-pow's ARCHETYPE max-maneuver-level formula
  // (ceil(initLevel/3) below class level 7, floor((initLevel-1)/2) above) is lower at many class
  // levels, which would hide the top tier(s) — e.g. a Fighter 7-8 would not see its level-4
  // maneuvers. pf1-pow's original returns [1..9].filter(l => l <= maxLevel); we widen `maxLevel`
  // to also cover the highest maneuver-item level on the actor. SAFE for normal actors: their
  // maneuvers never exceed their own max, so the result is identical; only over-cap maneuvers
  // (ours) add sections, and an empty section just renders empty.
  Handlebars.registerHelper('filteredLevelsArray', function (maxLevel, options) {
    let cap = Number(maxLevel) || 0;
    let items = options?.data?.root?.actor?.items;
    if (items && Map.prototype.isPrototypeOf(items)) items = Array.from(items.values());
    for (const it of (items || [])) {
      if (it.type === 'pf1-pow.maneuver') cap = Math.max(cap, Number(it.system?.level) || 0);
    }
    cap = Math.min(cap, 9);
    return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(lvl => lvl <= cap);
  });
  console.log('pf1e_random_char_generator | filteredLevelsArray override registered (show all granted maneuver levels).');
});
