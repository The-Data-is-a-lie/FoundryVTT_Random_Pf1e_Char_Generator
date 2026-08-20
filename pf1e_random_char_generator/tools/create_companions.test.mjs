/**
 * Headless regression for `scripts/createCompanions.js`.
 *
 *   npm test                                          # with the rest of the suite
 *   node tools/create_companions.test.mjs             # on its own, against the committed fixture
 *   node tools/create_companions.test.mjs <payload>   # against some other recorded payload
 *
 * Stubs the parts of Foundry and pf1 the renderer touches and replays a real generated payload
 * through it. It exists to answer one question no console can, without a live world:
 *
 *   Does the sheet pf1 derives end up on the backend's HP, BAB, saves and AC?
 *
 * That was claim 3 of the companion-sheets map's ticket 02, and it was originally the sharper
 * question of whether driving the class item at the HD COUNT reproduced them with NO correction.
 * The class item now sits at the master's effective level instead (ruled 2026-08-19, so a level-10
 * summoner's eidolon reads "Eidolon 10"), which pf1 reads as a count of hit dice -- so the
 * no-correction claim survives only where level and HD coincide, and is gated on that below. The
 * outcome claim is asserted for every creature either way: a total that disagrees with the payload
 * fails loudly here instead of reaching a sheet.
 *
 * THE pf1 STUB IS DELIBERATELY SMALL and is not a second implementation of the system: it derives
 * only what `createCompanions.js` reads back (saves, HP, BAB, AC) and does it the way
 * `base-character.mjs` does -- class progressions plus ability modifiers, health maximised per the
 * world's house config. If pf1's real derivation ever diverges from these four lines, the live
 * import is what catches it; this harness catches the far more likely case of OUR data moving.
 *
 * This file used to stage `scripts/*.js` into a temp dir renamed `.mjs`, because node will not import
 * `.js` as ESM without a package.json declaring `"type": "module"`. Ticket 11 added that package.json
 * as dev-only tooling (excluded from the release zip), so the staging hack is gone and the sources
 * are imported where they live. The payload now defaults to the committed fixture rather than
 * requiring argv, because a test runner does not supply one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.join(HERE, '..', 'scripts');

const payloadPath = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : path.join(HERE, 'fixtures', 'payloads', 'companion.json');
const payload = JSON.parse(readFileSync(payloadPath, 'utf-8'));

// ---- template files, served to the module's own fetch ------------------------------------------
// The parity sections clone three template files. Reading them off disk here (rather than stubbing
// their contents) is deliberate: it makes the harness fail when someone edits custom_buffs.json into
// a shape the section builder cannot read, which is the only way that break would ever be noticed.
const TEMPLATES = path.join(HERE, '..', 'templates', 'character_sheet_folder');
globalThis.fetch = async (url) => {
  const file = String(url).split('/').pop();
  try {
    const body = readFileSync(path.join(TEMPLATES, file), 'utf-8');
    return { ok: true, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => null };
  }
};

// ---- console capture ---------------------------------------------------------------------------
const captured = { warn: [], error: [], info: [] };
const real = { log: console.log, warn: console.warn, error: console.error };
console.log = (...a) => captured.info.push(a.join(' '));
console.warn = (...a) => captured.warn.push(a.join(' '));
console.error = (...a) => captured.error.push(a.join(' '));
globalThis.ui = {
  notifications: { info: (m) => captured.info.push(`NOTIFY ${m}`), warn: (m) => captured.warn.push(`NOTIFY ${m}`) },
};

// ---- a pf-content stand-in ---------------------------------------------------------------------
// The real Wolf's shape, which the pack census showed is universal: one `Animal Companion` class
// item and exactly two change-bearing feats, which the renderer must delete.
const BODY = {
  name: 'Bird',
  type: 'character',
  system: {
    abilities: { str: { value: 10 }, dex: { value: 15 }, con: { value: 12 }, int: { value: 2 }, wis: { value: 14 }, cha: { value: 6 } },
    attributes: { naturalAC: 1, savingThrows: { fort: { base: 0 }, ref: { base: 0 }, will: { base: 0 } }, hp: {}, speed: {} },
    traits: { size: 'sm' }, skills: {}, details: {},
  },
  items: [
    { name: 'STR/DEX Bonus', type: 'feat', system: { changes: [{ target: 'str', formula: 'floor(@class.level / 3)' }] } },
    { name: 'Natural Armor Bonus', type: 'feat', system: { changes: [{ target: 'nac', formula: 'floor(@class.level / 3) * 2' }] } },
    { name: 'Link', type: 'feat', system: {} },
    {
      name: 'Animal Companion', type: 'class',
      system: {
        subType: 'base', level: 1, hd: 8, hp: 8, bab: 'med',
        // The six the real pack declares on all 205 bodies. PF1e's animal companion has nine, so
        // the module has to merge -- and must not clobber these while doing it.
        classSkills: { acr: true, clm: true, fly: true, per: true, ste: true, swm: true },
        savingThrows: { fort: { value: 'high' }, ref: { value: 'high' }, will: { value: 'low' } },
      },
    },
    { name: 'Bite', type: 'attack', system: {} },
  ],
};

// The eidolon's stand-in body. Deliberately NOT the wolf's shape: a `pf-eidolon-forms` actor carries
// no STR/DEX or Natural Armor feat, because pf1 has no eidolon progression to drive them from --
// every number on an eidolon comes off `eidolon_table.json` and lands through `reconcile()`.
const EIDOLON_BODY = {
  name: 'Biped Baseform',
  type: 'character',
  system: {
    abilities: { str: { value: 16 }, dex: { value: 12 }, con: { value: 13 }, int: { value: 7 }, wis: { value: 10 }, cha: { value: 11 } },
    attributes: { naturalAC: 2, savingThrows: { fort: { base: 0 }, ref: { base: 0 }, will: { base: 0 } }, hp: {}, speed: {} },
    traits: { size: 'med' }, skills: {}, details: {},
  },
  items: [
    {
      name: 'Eidolon', type: 'class',
      system: {
        subType: 'base', level: 1, hd: 10, hp: 10, bab: 'high',
        // The six the real body declares; the other four are the player's pick, which is half of
        // what "Requires Manual Setup" below is asking for.
        classSkills: { blf: true, crf: true, kpl: true, per: true, sen: true, ste: true },
        savingThrows: { fort: { value: 'high' }, ref: { value: 'high' }, will: { value: 'low' } },
      },
    },
    // The three items the pack ships for a human to sort out. Exactly one pool applies; the note
    // goes once both halves are answered.
    { name: 'Requires Manual Setup', type: 'feat', system: {} },
    { name: 'Evolution Pool (Chained)', type: 'feat', system: {} },
    { name: 'Evolution Pool (Unchained)', type: 'feat', system: {} },
  ],
};

// What each stub body declares before the module touches it, read off the bodies themselves so the
// two cannot drift. The merge check below asserts none of it is lost.
const classItemOf = (body) => body.items.find((item) => item.type === 'class').system.classSkills;
const BODY_CLASS_SKILLS = {
  companion: classItemOf(BODY), mount: classItemOf(BODY), familiar: classItemOf(BODY),
  eidolon: classItemOf(EIDOLON_BODY),
};

let nextId = 1;
const mod = (score) => Math.floor((Number(score) - 10) / 2);
const SIZE_AC = { fine: 8, dim: 4, tiny: 2, sm: 1, med: 0, lg: -1, huge: -2, grg: -4, col: -8 };

function setPath(actor, key, value) {
  const parts = key.replace(/^system\./, '').split('.');
  let node = actor.system;
  while (parts.length > 1) {
    const step = parts.shift();
    node[step] = node[step] ?? {};
    node = node[step];
  }
  node[parts[0]] = value;
}

class FakeActor {
  constructor(data) {
    this.id = `actor${nextId++}`;
    this.name = data.name;
    this.type = data.type;
    this.folder = data.folder;
    this.system = structuredClone(data.system ?? {});
    this.system.attributes ??= {};
    this.items = (data.items ?? []).map((raw) => this._item(raw));
    this.prepare();
  }
  _item(raw) {
    const owner = this;
    return {
      id: `item${nextId++}`, name: raw.name, type: raw.type, system: structuredClone(raw.system ?? {}),
      async update(patch) {
        for (const [key, value] of Object.entries(patch)) {
          const parts = key.replace(/^system\./, '').split('.');
          let node = this.system;
          while (parts.length > 1) { const step = parts.shift(); node[step] = node[step] ?? {}; node = node[step]; }
          node[parts[0]] = value;
        }
        owner.prepare();
      },
    };
  }
  get itemTypes() {
    return new Proxy({}, { get: (_t, type) => this.items.filter((item) => item.type === type) });
  }
  /** Only what the renderer reads back, derived the way base-character.mjs derives it. */
  prepare() {
    const attributes = this.system.attributes;
    const cls = this.items.find((item) => item.type === 'class' && item.system?.bab);
    const level = Number(cls?.system?.level) || 0;
    const die = Number(cls?.system?.hd) || 0;
    const abil = (key) => mod(this.system.abilities?.[key]?.value ?? 10);
    const progression = { high: (l) => 2 + Math.floor(l / 2), low: (l) => Math.floor(l / 3), '': () => 0 };
    const babRate = { high: 1, med: 0.75, low: 0.5 }[cls?.system?.bab] ?? 0;

    attributes.savingThrows ??= {};
    for (const [save, ability] of [['fort', 'con'], ['ref', 'dex'], ['will', 'wis']]) {
      const row = (attributes.savingThrows[save] ??= { base: 0 });
      const kind = cls?.system?.savingThrows?.[save]?.value ?? '';
      row.total = (Number(row.base) || 0) + progression[kind](level) + abil(ability);
    }
    attributes.hp ??= {};
    attributes.hp.max = (Number(attributes.hp.base) || 0) + level * die + abil('con') * level;
    attributes.bab ??= {};
    attributes.bab.total = (Number(attributes.bab.value) || 0) + Math.floor(level * babRate);
    // AC, the one number pf1 derives entirely from changes with no seed to write into. Only `ac`
    // changes are summed: `nac` reaches AC through `naturalAC` above, which is already the post-fold
    // figure, and counting it here as well would double it. Buffs are skipped unless active, which
    // is what makes shipping them inactive safe.
    //
    // Summing is a simplification pf1 does not make -- it stacks dodge bonuses but takes the highest
    // of same-typed others. Companions carry one or two AC feats, so a sum is exact for every case
    // this harness sees; if that stops being true the assertion below is what will say so.
    const acFromChanges = this.items
      .filter((item) => item.type !== 'buff' || item.system?.active)
      .flatMap((item) => item.system?.changes ?? [])
      .filter((change) => change?.target === 'ac')
      .reduce((sum, change) => sum + (Number(change.formula) || 0), 0);
    attributes.ac = {
      normal: {
        total: 10 + (Number(attributes.naturalAC) || 0) + abil('dex')
          + (SIZE_AC[this.system.traits?.size] ?? 0) + acFromChanges,
      },
    };
  }
  async update(patch) {
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'folder') { this.folder = value; continue; }
      setPath(this, key, value);
    }
    this.prepare();
  }
  async deleteEmbeddedDocuments(_type, ids) {
    this.items = this.items.filter((item) => !ids.includes(item.id));
    this.prepare();
  }
  async createEmbeddedDocuments(_type, docs) {
    for (const doc of docs) this.items.push(this._item(doc));
    this.prepare();
  }
}

const created = [];
globalThis.Actor = { create: async (data) => { const actor = new FakeActor(data); created.push(actor); return actor; } };

const pack = (bodies) => ({
  async getIndex() { return Object.entries(bodies).map(([id, body]) => ({ _id: id, name: body.name })); },
  async getDocument(id) { return { toObject: () => structuredClone(bodies[id]) }; },
});
// A stand-in feat compendium. `Toughness` carries automation so the harness can prove the D14 strip
// actually happens, and the armour proficiencies use FOUNDRY'S comma spelling so the two-sided name
// match is exercised rather than assumed -- that inversion is the whole reason those three feats do
// not silently arrive as bare items.
const FEAT_BODIES = {};
for (const name of ['Toughness', 'Dodge', 'Iron Will', 'Weapon Focus', 'Run', 'Acrobatic',
                    'Improved Initiative', 'Lightning Reflexes', 'Blind-Fight', 'Agile Maneuvers',
                    'Endurance', 'Great Fortitude', 'Improved Natural Armor', 'Weapon Finesse',
                    'Skill Focus', 'Stealthy', 'Athletic', 'Combat Reflexes', 'Power Attack',
                    'Mobility', 'Spring Attack', 'Diehard', 'Intimidating Prowess',
                    'Improved Natural Attack', 'Improved Bull Rush', 'Improved Overrun',
                    'Armor Proficiency, Light', 'Armor Proficiency, Medium', 'Armor Proficiency, Heavy']) {
  FEAT_BODIES[name] = {
    name, type: 'feat',
    system: {
      subType: 'feat',
      description: { value: `<p>${name} rules text.</p>` },
      changes: [{ target: 'mhp', formula: '3' }],
    },
  };
}
// Three feats carry their REAL automation, copied verbatim from `every_feat.json` (itself an export
// of the same `pf1.feats` compendium the resolver reads). They are here because the generic
// `mhp` body above cannot exercise the rule that AC changes survive the D14 strip while `nac` ones do
// not -- and getting that backwards is precisely how a companion's AC came to render a point low.
FEAT_BODIES.Dodge.system.changes =
  [{ formula: '1', target: 'ac', type: 'dodge', operator: 'add', priority: 0, value: 0 }];
FEAT_BODIES['Improved Natural Armor'].system.changes =
  [{ formula: '1', target: 'nac', type: 'untyped', operator: 'add', priority: 0, value: 0 }];
FEAT_BODIES['Iron Will'].system.changes =
  [{ formula: '2', target: 'will', type: 'untyped', operator: 'add', priority: 0, value: 0 }];
const packs = new Map([
  ['pf-content.pf-companions', pack({ bird: BODY })],
  ['pf-content.pf-familiars', pack({})],
  // Keyed by its REAL pack name, not by the species slug: an eidolon's species is `biped` and its
  // actor is "Biped Baseform", which is the whole reason `findSource` reads `entry.pf_content`.
  ['pf-content.pf-eidolon-forms', pack({ biped: EIDOLON_BODY })],
  ['pf1.feats', pack(FEAT_BODIES)],
]);
globalThis.game = { packs: { get: (id) => packs.get(id) } };

// ---- run ---------------------------------------------------------------------------------------
const { createBondedCreatures } = await import(pathToFileURL(path.join(SCRIPTS, 'createCompanions.js')).href);
// The renderer's own name -> pf1 skill id table, so the class-skill assertion below reads the same
// mapping the code under test does instead of a second copy of it.
const { skillsDict } = await import(pathToFileURL(path.join(SCRIPTS, 'shared', 'skills-dict.js')).href);

const granted = (payload.bonded_creatures ?? []).filter((entry) => entry?.species && entry?.stats);
const summary = await createBondedCreatures(payload, 'folder-under-test');

// Restore ALL THREE. Leaving console.error captured once swallowed this harness's own failure
// report, so a red run printed its numbers and exited 1 with no reason attached.
Object.assign(console, real);

const failures = [];
const check = (label, condition, detail = '') => {
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
};

check('every granted creature produced an Actor', created.length === granted.length,
  `${created.length} actor(s) for ${granted.length} granted entr(y/ies)`);
check('nothing failed', summary.failed === 0, `${summary.failed} failure(s)`);
check('absences were counted, not created',
  summary.absent === (payload.bonded_creatures ?? []).length - granted.length);

for (const [index, actor] of created.entries()) {
  const entry = granted[index];
  const stats = entry.stats;
  const attributes = actor.system.attributes;
  const where = `"${actor.name}"`;

  check(`${where} deletes the two table items`,
    !actor.items.some((item) => /^(str\/dex bonus|natural armor bonus)$/i.test(item.name)));

  const cls = actor.items.find((item) => item.type === 'class' && item.system?.bab);
  check(`${where} drives the class item at the master's effective level, not at HD`,
    Number(cls?.system?.level) === Number(entry.effective_level),
    `class level ${cls?.system?.level} vs effective ${entry.effective_level} (${stats.hd} HD)`);

  // Every skill the backend put a rank in was given the +3 class-skill bonus when its total was
  // computed, so pf1 has to be told the same or the sheet reads 3 low on each one. The +3 itself is
  // pf1's arithmetic and is deliberately not reimplemented here; what is asserted is the flag.
  const classSkills = cls?.system?.classSkills ?? {};
  const rankedIds = Object.entries(stats.skills ?? {})
    .filter(([, spend]) => Number(spend?.ranks) > 0)
    .map(([skill]) => skillsDict[skill]).filter(Boolean);
  const unflagged = rankedIds.filter((id) => !classSkills[id]);
  check(`${where} flags every ranked skill as a class skill`, unflagged.length === 0,
    `${unflagged.length} of ${rankedIds.length} unflagged: ${unflagged.join(', ')}`);

  // A degrade has no pack list to preserve and no pack furniture to clear, so the two claims below
  // are about the CLONED path only. Whether this creature took it is read off the renderer's own
  // warning rather than guessed at from the items, which is the same signal a live import gives.
  const cloned = !captured.warn.some((line) => line.includes(`named "${entry.pf_content ?? entry.species}"`));
  const byName = (name) => actor.items.some((item) => String(item.name).toLowerCase() === name);
  if (cloned) {
    const packList = Object.keys(BODY_CLASS_SKILLS[entry.type] ?? {});
    check(`${where} merged into the body's class skills rather than replacing them`,
      packList.every((id) => classSkills[id]),
      `pack list ${packList.join(',')}, merged ${Object.keys(classSkills).sort().join(',')}`);

    // The pack's own to-do list, answered rather than passed on to the player.
    check(`${where} removed the "Requires Manual Setup" note`, !byName('requires manual setup'));
    if (entry.type === 'eidolon') {
      const unchained = (entry.flags ?? []).includes('unchained_degraded');
      const keep = `evolution pool (${unchained ? 'unchained' : 'chained'})`;
      const drop = `evolution pool (${unchained ? 'chained' : 'unchained'})`;
      check(`${where} kept only the pool tracker that applies`, byName(keep) && !byName(drop),
        `chained ${byName('evolution pool (chained)')}, unchained ${byName('evolution pool (unchained)')}`);
    }
  }

  // The claim this harness exists for.
  //
  // "Needed no correction" was the original assertion, and it was right while the payload was pure
  // chassis: pf1's own progressions ARE the animal-companion table, so at the right HD they land on
  // the payload's numbers exactly. D14 changed what the payload contains, not that guarantee -- the
  // backend now folds feats and flaws on top, and the module strips those items' changes so pf1
  // cannot re-apply them. The seed pf1 needs is therefore precisely the folded amount, which is a
  // sharper claim than "zero": it fails if the fold and the reconcile ever disagree by a point.
  const folded = (target) => (stats.applied_changes ?? [])
    .filter((record) => record.target === target)
    .reduce((sum, record) => sum + Number(record.value ?? 0), 0);

  // The "no correction" half of that claim now holds only where pf1 CAN agree, which is narrower
  // than it was, for two separate reasons:
  //
  //   - an eidolon was always exempt: pf1 ships an Animal Companion progression that IS the
  //     animal-companion table, and ships nothing at all for `eidolon_table.json`;
  //   - and since the class item moved to the master's effective level (2026-08-19), pf1 reads that
  //     level as a count of hit dice, so on any creature whose HD lag behind its level it derives
  //     too much and `reconcile()` seeds the difference out. That is the ruling, not a defect.
  //
  // Where level and HD coincide -- every companion up to 5th, which is what `companion.json` is --
  // the original exact-seed claim still runs and still bites. Everywhere else the outcome is what
  // is asserted: every total equals the payload, which is checked for all of them.
  const isEidolon = entry.type === 'eidolon';
  const lags = Number(entry.effective_level) !== Number(stats.hd);
  const derivable = !isEidolon && !lags;

  for (const save of ['fort', 'ref', 'will']) {
    check(`${where} ${save} save matches the payload`,
      attributes.savingThrows[save].total === stats.saves[save],
      `${attributes.savingThrows[save].total} vs ${stats.saves[save]}`);
    if (!derivable) continue;
    check(`${where} ${save} seed is exactly what the fold added`,
      (Number(attributes.savingThrows[save].base) || 0) === folded(save),
      `seed ${attributes.savingThrows[save].base}, folded ${folded(save)}`);
  }
  check(`${where} HP matches the payload`, attributes.hp.max === stats.hp, `${attributes.hp.max} vs ${stats.hp}`);
  if (derivable) {
    check(`${where} HP seed is exactly what the fold added`,
      (Number(attributes.hp.base) || 0) === folded('mhp'),
      `seed ${attributes.hp.base}, folded ${folded('mhp')}`);
  }
  check(`${where} BAB matches the payload`, attributes.bab.total === stats.bab, `${attributes.bab.total} vs ${stats.bab}`);
  if (derivable) {
    check(`${where} BAB needed no correction`, !attributes.bab.value, `seed ${attributes.bab.value}`);
  }
  // A lagging creature is the case the exact-seed claims cannot cover, so pin the direction instead:
  // pf1 reads the class level as hit dice, so it must have derived MORE BAB than PF1e grants and the
  // seed must be pulling back. A zero seed here would mean the level never moved.
  if (lags && !isEidolon) {
    check(`${where} BAB was seeded back down off the master's level`,
      Number(attributes.bab.value) < 0,
      `seed ${attributes.bab.value} at level ${entry.effective_level} for ${stats.hd} HD`);
  }
  check(`${where} AC matches the payload`, attributes.ac.normal.total === stats.ac,
    `${attributes.ac.normal.total} vs ${stats.ac}`);

  // Initiative has no class-item route, so the misc seed must carry exactly the non-Dex remainder.
  const dexMod = Math.floor(((Number(stats.abilities?.dex) || 10) - 10) / 2);
  check(`${where} seeds the non-Dex half of initiative`,
    (Number(actor.system.attributes.init?.value) || 0) === Number(stats.initiative) - dexMod,
    `seed ${actor.system.attributes.init?.value}, payload ${stats.initiative}, dex mod ${dexMod}`);

  check(`${where} carries the master's name and the creature's`,
    actor.name.includes(entry.name) && actor.name.includes(payload.character_full_name));
  check(`${where} lands in the folder`, actor.folder === 'folder-under-test');
  check(`${where} took the payload's ability scores`,
    Object.entries(stats.abilities).every(([k, v]) => Number(actor.system.abilities[k].value) === Number(v)));
  check(`${where} spent every skill rank`,
    Object.values(actor.system.skills ?? {}).reduce((sum, s) => sum + (Number(s.rank) || 0), 0)
      === Object.values(stats.skills ?? {}).reduce((sum, s) => sum + (Number(s.ranks) || 0), 0));

  // ---- parity sections (§8 D14/D15/D16) --------------------------------------------------------
  const named = (pattern) => actor.items.filter((item) => pattern.test(String(item.name)));

  // The band names the creature type, so the expected divider follows `entry.type` -- reading
  // "(Animal Companion)" over an eidolon's own table specials was simply wrong.
  const bandLabel = { companion: 'Animal Companion', mount: 'Mount', familiar: 'Familiar', eidolon: 'Eidolon' }[entry.type]
    ?? 'Animal Companion';
  for (const [label, pattern] of [
    ['Variable Modifiers', /_Variable Modifiers_/],
    ['Natural AC', /_Natural AC_/],
    ['Death HP', /_Death HP_/],
    [`Class Features (${bandLabel})`, new RegExp(`_Class Features \\(${bandLabel}\\)_`)],
    ['Background', /_ Background _/],
  ]) {
    check(`${where} has the ${label} divider`, named(pattern).length === 1,
      `${named(pattern).length} found`);
  }
  check(`${where} has an Evolutions divider only if it is an eidolon`,
    named(/_Evolutions_/).length === (isEidolon ? 1 : 0),
    `${named(/_Evolutions_/).length} found on a ${entry.type}`);

  // The species abilities used to be prose in the Actor description; they must be real items now.
  const featureBand = actor.items.filter((item) => item.system?.subType === 'classFeat'
    && !String(item.name).startsWith('__'));
  check(`${where} promoted its species abilities into items`, featureBand.length > 0);

  // ---- the Evolutions band (spec §8 "Eidolon (v1.1)") ------------------------------------------
  //
  // The eidolon is BUILT rather than picked, and until this band existed not one of the choices it
  // was built from reached a sheet. Every claim below is about a key no other creature type has.
  if (isEidolon) {
    const titleCase = (t) => String(t).replace(/\b\w/g, (c) => c.toUpperCase());
    const groups = new Map();
    for (const pick of entry.evolutions ?? []) {
      const shown = pick.choice ? `${pick.name} (${titleCase(pick.choice)})` : String(pick.name);
      groups.set(shown, { pick, count: (groups.get(shown)?.count ?? 0) + 1 });
    }
    const heldBack = new Set((stats.unapplied ?? [])
      .map((line) => String(line).slice(0, String(line).indexOf(': '))));

    check(`${where} carries its evolution pool line`,
      !!actor.items.find((i) => String(i.name) === `Evolution Pool — ${entry.ep?.pool} EP`),
      `ep ${JSON.stringify(entry.ep)}`);
    check(`${where} names the base form's free evolutions`,
      !Object.keys(entry.free_evolutions ?? {}).length
        || actor.items.some((i) => String(i.name).startsWith('Free Evolutions —')));

    for (const [shown, { pick, count }] of groups) {
      // The `×N` suffix is not cosmetic: `attachSections` dedupes creations by normalised name, so
      // an evolution bought twice as two identically named items would silently collapse to one.
      const expected = `${shown} (${pick.cost} EP)${count > 1 ? ` ×${count}` : ''}`;
      const item = actor.items.find((i) => String(i.name) === expected);
      check(`${where} carries evolution "${expected}"`, !!item,
        `evolution items: ${actor.items.filter((i) => / \(\d+ EP\)/.test(i.name)).map((i) => i.name).join(' | ') || 'none'}`);
      if (!item) continue;

      // D12's discipline, on the face of the item: 73 of the 81 evolutions cannot be expressed as a
      // number, and one that says "Folded" when the block never counted it would be a lie the reader
      // has no way to catch.
      const rawShown = pick.choice ? `${pick.name} (${pick.choice})` : String(pick.name);
      const text = String(item.system?.description?.value ?? '');
      const shouldHold = heldBack.has(rawShown) || heldBack.has(shown);
      check(`${where} "${expected}" states the right provenance`,
        text.includes(shouldHold ? 'Not folded into this stat block' : 'Folded into this stat block'),
        shouldHold ? 'on stats.unapplied but the item claims it was folded'
                   : 'folded into the numbers but the item claims it was not');
      check(`${where} "${expected}" carries its rules text`, text.includes(String(pick.benefit ?? '').slice(0, 40)));
    }
  }

  // D15: every rolled feat is on the sheet, named `Animal Companion <level>: <feat>`.
  for (const [index, feat] of (entry.feats ?? []).entries()) {
    const label = entry.feat_labels?.[index];
    const hit = actor.items.find((item) => String(item.name).startsWith(`${label}: ${feat}`));
    check(`${where} carries "${label}: ${feat}"`, !!hit,
      `named feats: ${actor.items.filter((i) => /^(Animal Companion|Mount) \d+:/.test(i.name))
        .map((i) => i.name).join(' | ') || 'none'}`);
    // Feat tax bundles onto the primary rather than arriving as its own entry -- it cost no slot.
    const children = entry.feat_tax_dict?.[feat] ?? [];
    if (children.length) {
      check(`${where} bundles ${feat}'s tax children onto it`,
        String(hit?.name ?? '').includes(` > ${children[0]}`), hit?.name);
    }
  }
  for (const [index, feat] of (entry.flaw_feats ?? []).entries()) {
    check(`${where} carries flaw feat "(Flaw ${index + 1}) ${feat}"`,
      actor.items.some((item) => String(item.name).startsWith(`(Flaw ${index + 1}) ${feat}`)));
  }

  // D14, the load-bearing one: a feat or flaw item that kept its changes would double-apply every
  // number `companion_stats.py` already folded into the payload -- because every one of those
  // numbers has a seed on the actor that `reconcile()` writes the difference into.
  //
  // Except AC, which has no seed at all, so stripping it dropped the point rather than relocating
  // it. `ac` changes therefore survive and everything else must not, which is two assertions, not
  // one: a blanket "no changes anywhere" check is what let the AC bug sit here going green.
  const leaked = actor.items.filter((item) =>
    (item.system?.subType === 'feat' || item.system?.subType === 'trait')
    && (item.system?.changes ?? []).some((change) => change?.target !== 'ac'));
  check(`${where} strips every non-AC change off its feat and flaw items`, leaked.length === 0,
    leaked.map((item) => item.name).join(', '));

  // The other half: an `ac` change the payload folded must still be ON the sheet. Without this the
  // filter above could be replaced by the old blanket strip and nothing would notice.
  const foldedAc = (stats.applied_changes ?? [])
    .filter((record) => record.target === 'ac')
    .reduce((sum, record) => sum + Number(record.value ?? 0), 0);
  if (foldedAc) {
    // Feat and flaw items only. The sheet carries plenty of other `ac` changes -- the Charge buff's
    // -2, Combat Expertise, the natural-armour-damage tracker -- and none of them are D14's business:
    // they are situational and inactive, or formula-driven off resources. Summing those in was the
    // first version of this check, and it reported -1 for a companion whose fold was +1.
    const carried = actor.items
      .filter((item) => item.system?.subType === 'feat' || item.system?.subType === 'trait')
      .flatMap((item) => item.system?.changes ?? [])
      .filter((change) => change?.target === 'ac')
      .reduce((sum, change) => sum + (Number(change.formula) || 0), 0);
    check(`${where} keeps the AC the fold counted (pf1 has no AC seed to put it in)`,
      carried === foldedAc, `sheet carries ${carried}, payload folded ${foldedAc}`);
  }

  // D16: flaws on the Traits tab, with their situational notes intact.
  for (const flaw of Object.keys(entry.flaw_effects ?? {})) {
    check(`${where} carries flaw "${flaw}"`,
      actor.items.some((item) => String(item.name).includes(flaw)));
  }
  if (Object.keys(entry.flaw_effects ?? {}).length) {
    check(`${where} has the Flaws divider`, named(/_ Flaws_/).length === 1);
  }

  // D16: all eleven basic buffs, and the opposite rule from feats -- they KEEP their changes,
  // because they are inactive and therefore contribute nothing until a player asks.
  const buffs = actor.items.filter((item) => item.type === 'buff');
  check(`${where} carries all eleven basic buffs`, buffs.length === 11, `${buffs.length} found`);
  const wronglyActive = buffs.filter((item) => item.system?.active
    && !['Professions', 'Skill Synergies', 'Acrobatics Speed'].includes(item.name));
  check(`${where} ships every combat buff inactive`, wronglyActive.length === 0,
    wronglyActive.map((item) => item.name).join(', '));
  check(`${where} leaves buff changes intact`,
    buffs.some((item) => (item.system?.changes ?? []).length > 0));

  // The house trackers, cloned from house_features.json + sizefordamage_feature.json.
  check(`${where} carries the natural-armour trackers`,
    actor.items.some((item) => /natural\s*a(c|rmor)/i.test(String(item.name))));
}

// ---- the degraded unchained eidolon, against the pure builder ----------------------------------
//
// It cannot ride the loop above: an unchained summoner's entry has `stats: null` by ruling, so the
// `granted` filter drops it before an Actor is ever built. `evolutionItems` is pure by design, which
// is exactly what lets the branch be exercised without one. What matters is that the band still
// SHIPS and says why it is empty -- a feature that is merely absent reads identically to a bug.
{
  const { evolutionItems } = await import(pathToFileURL(path.join(SCRIPTS, 'companion-sections.js')).href);
  const holdback = 'The unchained eidolon\'s subtype-granted evolutions are not sourced.';
  const items = evolutionItems({
    type: 'eidolon', flags: ['unchained_degraded'], holdback, stats: null,
  });
  check('the degraded unchained eidolon still gets an Evolutions divider',
    items.some((item) => /_Evolutions_/.test(String(item.name))));
  const note = items.find((item) => String(item.name) === 'Evolutions — not modelled');
  check('the degraded unchained eidolon names its debt on the band', !!note);
  check('the debt is the backend\'s own holdback sentence, not invented here',
    String(note?.system?.description?.value ?? '').includes(holdback));
  check('a non-eidolon gets no Evolutions band at all',
    evolutionItems({ type: 'companion', stats: {} }).length === 0);
}

console.log(`${created.length} actor(s) built from ${payloadPath}`);
for (const actor of created) {
  const a = actor.system.attributes;
  console.log(`  ${actor.name}: hp ${a.hp.max}, bab ${a.bab.total}, ` +
    `saves ${['fort', 'ref', 'will'].map((s) => a.savingThrows[s].total).join('/')}, ac ${a.ac.normal.total}`);
  const by = (test) => actor.items.filter(test).length;
  console.log(`    items: ${actor.items.length} total — ` +
    `${by((i) => /^_+/.test(i.name))} dividers, ` +
    `${by((i) => i.system?.subType === 'classFeat' && !/^_+/.test(i.name))} class features, ` +
    `${by((i) => i.system?.subType === 'feat' && !/^_+/.test(i.name))} feats, ` +
    `${by((i) => i.system?.subType === 'trait' && !/^_+/.test(i.name))} flaws, ` +
    `${by((i) => i.type === 'buff')} buffs`);
  for (const item of actor.items.filter((i) => /^(Animal Companion|Mount) \d+:|^\(Flaw/.test(i.name))) {
    console.log(`      ${item.name}`);
  }
}
if (captured.warn.length) console.log('warnings:', captured.warn);

// The body above runs at import time and collects into `failures`; this reports it to the runner.
// Keeping the checks as a collected list rather than throwing on the first one is deliberate and
// predates the runner: a companion that gets three numbers wrong should say so in one run.
test(`createCompanions — every number came from the payload (${path.basename(payloadPath)})`, () => {
  assert.deepEqual(failures, [],
    `${failures.length} check(s) failed:\n  - ${failures.join('\n  - ')}`);
});
