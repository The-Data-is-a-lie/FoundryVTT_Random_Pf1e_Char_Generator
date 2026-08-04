/**
 * Headless regression for `scripts/createCompanions.js`.
 *
 *   node tools/test_create_companions.mjs <payload.json>
 *   node tools/test_create_companions.mjs ../../../Documents/GitHub/Pathfinder_Char_Creator/Backend/scripts/golden/companion.json
 *
 * Stubs the parts of Foundry and pf1 the renderer touches and replays a real generated payload
 * through it. It exists to answer one question no console can, without a live world:
 *
 *   Does driving the cloned body's class item at the creature's HD COUNT reproduce the backend's
 *   HP, BAB, saves and AC *with no correction*?
 *
 * That is claim 3 of the companion-sheets map's ticket 02. If `reconcile()` ever has to fix
 * something on the golden companion, either the chassis table or pf1's progressions moved, and the
 * `assert` below fails loudly instead of the mismatch reaching a sheet.
 *
 * THE pf1 STUB IS DELIBERATELY SMALL and is not a second implementation of the system: it derives
 * only what `createCompanions.js` reads back (saves, HP, BAB, AC) and does it the way
 * `base-character.mjs` does -- class progressions plus ability modifiers, health maximised per the
 * world's house config. If pf1's real derivation ever diverges from these four lines, the live
 * import is what catches it; this harness catches the far more likely case of OUR data moving.
 *
 * Node cannot import the module's `.js` files as ESM (no package.json `type: module`, and adding
 * one for a Foundry module would be noise), so the sources are staged into the temp dir as `.mjs`
 * first. That is a build detail, not a copy: the files are read from `scripts/` every run.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.join(HERE, '..', 'scripts');

const payloadPath = process.argv[2];
if (!payloadPath) {
  console.error('usage: node tools/test_create_companions.mjs <payload.json>');
  process.exit(2);
}
const payload = JSON.parse(readFileSync(payloadPath, 'utf-8'));

// ---- stage the sources as ESM ------------------------------------------------------------------
const staging = mkdtempSync(path.join(tmpdir(), 'companion-harness-'));
writeFileSync(path.join(staging, 'skills-dict.mjs'), readFileSync(path.join(SCRIPTS, 'skills-dict.js'), 'utf-8'));
writeFileSync(path.join(staging, 'companion-sections.mjs'),
  readFileSync(path.join(SCRIPTS, 'companion-sections.js'), 'utf-8'));
writeFileSync(
  path.join(staging, 'createCompanions.mjs'),
  readFileSync(path.join(SCRIPTS, 'createCompanions.js'), 'utf-8')
    .replace("'./skills-dict.js'", "'./skills-dict.mjs'")
    .replace("'./companion-sections.js'", "'./companion-sections.mjs'")
);

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
        savingThrows: { fort: { value: 'high' }, ref: { value: 'high' }, will: { value: 'low' } },
      },
    },
    { name: 'Bite', type: 'attack', system: {} },
  ],
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
    attributes.ac = {
      normal: { total: 10 + (Number(attributes.naturalAC) || 0) + abil('dex') + (SIZE_AC[this.system.traits?.size] ?? 0) },
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
const packs = new Map([
  ['pf-content.pf-companions', pack({ bird: BODY })],
  ['pf-content.pf-familiars', pack({})],
  ['pf-content.pf-eidolon-forms', pack({})],
  ['pf1.feats', pack(FEAT_BODIES)],
]);
globalThis.game = { packs: { get: (id) => packs.get(id) } };

// ---- run ---------------------------------------------------------------------------------------
const { createBondedCreatures } = await import(pathToFileURL(path.join(staging, 'createCompanions.mjs')).href);

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
  check(`${where} drives the class item at HD, not effective level`,
    Number(cls?.system?.level) === Number(stats.hd),
    `class level ${cls?.system?.level} vs ${stats.hd} HD (effective ${entry.effective_level})`);

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

  for (const save of ['fort', 'ref', 'will']) {
    check(`${where} ${save} save matches the payload`,
      attributes.savingThrows[save].total === stats.saves[save],
      `${attributes.savingThrows[save].total} vs ${stats.saves[save]}`);
    check(`${where} ${save} seed is exactly what the fold added`,
      (Number(attributes.savingThrows[save].base) || 0) === folded(save),
      `seed ${attributes.savingThrows[save].base}, folded ${folded(save)}`);
  }
  check(`${where} HP matches the payload`, attributes.hp.max === stats.hp, `${attributes.hp.max} vs ${stats.hp}`);
  check(`${where} HP seed is exactly what the fold added`,
    (Number(attributes.hp.base) || 0) === folded('mhp'),
    `seed ${attributes.hp.base}, folded ${folded('mhp')}`);
  check(`${where} BAB matches the payload`, attributes.bab.total === stats.bab, `${attributes.bab.total} vs ${stats.bab}`);
  check(`${where} BAB needed no correction`, !attributes.bab.value, `seed ${attributes.bab.value}`);
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

  for (const [label, pattern] of [
    ['Variable Modifiers', /_Variable Modifiers_/],
    ['Natural AC', /_Natural AC_/],
    ['Death HP', /_Death HP_/],
    ['Class Features (Animal Companion)', /_Class Features \(Animal Companion\)_/],
    ['Background', /_ Background _/],
  ]) {
    check(`${where} has the ${label} divider`, named(pattern).length === 1,
      `${named(pattern).length} found`);
  }

  // The species abilities used to be prose in the Actor description; they must be real items now.
  const featureBand = actor.items.filter((item) => item.system?.subType === 'classFeat'
    && !String(item.name).startsWith('__'));
  check(`${where} promoted its species abilities into items`, featureBand.length > 0);

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
  // number `companion_stats.py` already folded into the payload.
  const stripped = actor.items.filter((item) =>
    (item.system?.subType === 'feat' || item.system?.subType === 'trait')
    && (item.system?.changes ?? []).length);
  check(`${where} strips changes off every feat and flaw item`, stripped.length === 0,
    stripped.map((item) => item.name).join(', '));

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

if (failures.length) {
  console.error(`\nFAIL — ${failures.length} check(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('\nPASS — every number came from the payload, and every seed pf1 needed was exactly what the fold added.');
