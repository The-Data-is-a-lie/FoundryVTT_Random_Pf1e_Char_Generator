/**
 * FOUNDRY GM MACRO — not a Node script. Paste into a script macro in your world and run it once.
 *
 * Dumps the third-party compendium packs `modify-abilities.js` reads into JSON files the golden
 * harness can serve, then offers them as downloads. Drop the downloaded files into
 * `tools/fixtures/packs/` and commit them.
 *
 * WHY THIS EXISTS. Foundry stores compendia as LevelDB directories. Bare `node` cannot read those,
 * and a native LevelDB dependency was rejected for a repo whose whole premise is no build step
 * (ticket 11). Without these dumps the harness has to report pf1spheres / pf1-pow / pf1-psionics as
 * INACTIVE, which is a real code path but leaves the *active* branches — the Spheres talent walk,
 * processPathOfWar, the psionic power walk — with no golden at all. Ticket 06 rewrites code on
 * exactly those paths.
 *
 * WHAT IT COSTS, said plainly: these dumps are a snapshot. When pf1spheres or pf1-pow or
 * pf1-psionics updates, they go stale and nothing in the suite can tell on its own. The harness
 * compares the recorded module version against the installed one and WARNS, which is the whole of
 * the safety net. Re-run this macro after updating any of those three modules.
 *
 * Documents are dumped WHOLE (`toObject()`), deliberately. The build clones a matched doc straight
 * onto the sheet, so anything trimmed here would show up as a difference between the harness and a
 * real Foundry run — which is the one thing a golden must never have.
 */
(async () => {
  const WANTED = [
    { module: 'pf1spheres',    packId: 'pf1spheres.magic-talents' },
    { module: 'pf1spheres',    packId: 'pf1spheres.combat-talents' },
    { module: 'pf1-pow',       packId: 'pf1-pow.disciplines' },
    { module: 'pf1-psionics',  packId: 'pf1-psionics.powers' },
  ];

  const report = [];
  for (const { module: moduleId, packId } of WANTED) {
    const mod = game.modules.get(moduleId);
    if (!mod?.active) {
      report.push(`SKIPPED ${packId} — ${moduleId} is not active in this world.`);
      continue;
    }
    const pack = game.packs.get(packId);
    if (!pack) {
      report.push(`SKIPPED ${packId} — pack not found (module active but the pack id has moved?).`);
      continue;
    }

    const docs = await pack.getDocuments();
    const payload = {
      _source: {
        module: moduleId,
        version: String(mod.version ?? mod.data?.version ?? 'unknown'),
        packId,
        // No timestamp: it would make every re-dump a diff even when nothing changed.
        documentCount: docs.length,
      },
      documents: docs.map((d) => d.toObject()),
    };

    const text = JSON.stringify(payload, null, 0);
    saveDataToFile(text, 'application/json', `${packId}.json`);
    report.push(`DUMPED  ${packId} — ${docs.length} documents, ${(text.length / 1048576).toFixed(1)} MB `
      + `(${moduleId} v${payload._source.version})`);
  }

  // The language map the harness needs for normalizeLanguages(). Taken from the LIVE config so it is
  // localised exactly as a real run sees it, rather than guessed from the system's lang file.
  const config = {
    _source: { system: game.system.id, version: String(game.system.version) },
    languages: foundry.utils.deepClone(pf1.config.languages),
  };
  saveDataToFile(JSON.stringify(config, null, 2), 'application/json', 'pf1-config.json');
  report.push(`DUMPED  pf1-config.json — ${Object.keys(config.languages).length} languages `
    + `(${config._source.system} v${config._source.version})`);

  const summary = report.join('\n');
  console.log(summary);
  ui.notifications.info('Pack dump complete — see the console. Move the downloaded files into tools/fixtures/packs/ (pf1-config.json goes in tools/fixtures/).');
  ChatMessage.create({ content: `<pre>${summary}</pre>`, whisper: [game.user.id] });
})();
