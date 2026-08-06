/**
 * Equipment and ammo — the weapon, the armor, every worn slot item, and the ammo the weapon needs.
 *
 * Two exported stages that were two sections of the closure, in one module because they share state:
 * `addEquipment` records the built weapon and `addAmmo` reads it back to learn the ammo type. That
 * hand-off used to be a `localStorage` round trip (`collectedWeapons` written out and read straight
 * back in); splitting these across two modules would mean putting it on the build context for no
 * reason other than the file boundary.
 *
 * **Everything conditional runs after this stage** (hazard 2 on the strangler-split map). The attack
 * toggles, weapon finishing and the sphere talents all find their target through `findMainWeapon`,
 * and they warn-and-return when there is none — so ordering this stage later fails silently, with a
 * sheet that looks entirely plausible and has no toggles on it.
 *
 * **`select_random_ammo` is the only consumer of `ctx.rng` in the whole build.** It picks WHICH ammo
 * item lands on the sheet, which is a content choice, not an identity one — that is the reason the
 * randomness is injected rather than normalised away by the harness's id mint. Nothing here should be
 * rewritten to derive from the mint.
 *
 * Exported for the stages that follow: `appendEnhancementsToDescription`, which weapon finishing
 * reuses to rebuild the attack twin's stripped description, and `appendQualityDescription`, which the
 * enhancement-effects toggle caller writes per-quality rules text with.
 */
import { appendJsonToTemplate, applyBuffData } from './items.js';
import { capitalizeWords } from '../shared/text.js';

// One-line special-abilities summary on the item description. Also reused to rebuild the rollable
// attack twin's stripped description (createScalingAttackItem): pf1 bakes an item's description
// into its attack chat card, so the twin carries ONLY this line while the inventory weapon keeps
// the full per-quality rules text from addEnhancementEffects().
export async function appendEnhancementsToDescription(item, enhancements) {
  const names = (Array.isArray(enhancements) ? enhancements : []).filter(Boolean);
  if (!names.length || !item?.system?.description) return;
  const message = `<p><strong>Special abilities:</strong> ${names.join(', ')}</p>`;
  // Add enhancements only once
  if (!item.system.description.value.includes(message)) {
    item.system.description.value += message;
  }
}

// Per-quality rules text (enhancement_effects_dict entries ship a `description` pulled from the
// scraped qualities lists) rendered as a titled block under the item. Idempotent per quality.
// Weapon/armor/shield inventory items are never rolled (the attack twin is), so this text never
// reaches a chat card.
export function appendQualityDescription(item, qualityName, descriptionText) {
  if (!item?.system?.description || !descriptionText) return;
  const marker = `<h3>${qualityName}</h3>`;
  if (item.system.description.value.includes(marker)) return;
  item.system.description.value += `${marker}<p>${descriptionText}</p>`;
}

// Backend slot names (items_best.json sections) -> pf1 equipmentSlots.wondrous ids
const WONDROUS_SLOT_IDS = {
  belts: 'belt', body: 'body', chest: 'chest', eyes: 'eyes', feet: 'feet',
  hands: 'hands', head: 'head', headband: 'headband', neck: 'neck',
  shoulders: 'shoulders', wrist: 'wrists', wrists: 'wrists', rings: 'ring', ring: 'ring',
};

// Minimal pf1 equipment item for slot gear with no every_item.json match (name variants the
// compendium disambiguates, homebrew, ...). No _id — Foundry assigns one on actor.update.
function synthesizeEquipmentItem(name, descriptionText, slot) {
  return {
    name, type: "equipment", img: "icons/svg/item-bag.svg",
    system: {
      description: { value: descriptionText ? `<p>${descriptionText}</p>` : "" },
      subType: "wondrous", slot: WONDROUS_SLOT_IDS[slot] || "slotless",
      quantity: 1, equipped: true, carried: true, identified: true, proficient: true,
      changes: [], contextNotes: [], actions: [], attackNotes: [], effectNotes: [],
      links: { children: [], charges: [] }, tags: [], flags: {}, scriptCalls: [],
    },
    effects: [], flags: {},
  };
}

/**
 * The item `processItem` last built, by item type ("Weapon", "Armor", ...), per build.
 *
 * This replaces a `localStorage` round trip: `processItem` used to write each built item out under
 * `collected<Type>s` and `check_ammo()` read `collectedWeapons` straight back to find the weapon's
 * ammo type. It was the second of the two load-bearing storage writes in the build (the other was
 * `collectedSkills`); every other one was an unread breadcrumb. A live reference is equivalent to the
 * JSON snapshot it replaces because nothing in the build ever writes `system.ammo`.
 *
 * Keyed by the build context rather than held module-level: this module now outlives a single build,
 * and a shared record would hand one character's weapon to the next character's ammo pick.
 */
const collected = new WeakMap();
const collectedByType = (ctx) => {
  let byType = collected.get(ctx);
  if (!byType) { byType = {}; collected.set(ctx, byType); }
  return byType;
};

async function processItem(ctx, itemType, templateName, itemName, enhancementList, defaultItemName, defaultItemNameFlag = 0, opts = {}) {
  const characterData = ctx.characterData;
  const exportTemplate = ctx.exportTemplate;
  try {
    // If itemName is empty or undefined, use defaultItemName
    if (!itemName && defaultItemNameFlag === 0) {
      itemName = defaultItemName;
      defaultItemNameFlag = 1;  // Set the flag to 1 if defaultItemName is used
    }

    // If item can't be found and defaultItemNameFlag is set to 1, skip this time
    if (!itemName && defaultItemNameFlag === 1) {
      return defaultItemNameFlag;  // Ensure the flag is returned
    }

    itemName = capitalizeWords(itemName);

    // Ensure the item name is not empty or undefined
    if (!itemName) {
      console.error(`Character class ${characterData.c_class} does not have any selected ${itemType}.`);
      return defaultItemNameFlag;  // Ensure the flag is returned
    }

    // Backend buff overlay is keyed by the backend's item name, lowercased
    const buffKeyLc = String(itemName).toLowerCase();

    // Retrieve the items data by template name
    const items = ctx.templates[templateName];

    // Check if the items data is an array
    if (!Array.isArray(items)) {
      console.error(`${itemType} data is not an array or is undefined:`, items);
      return defaultItemNameFlag;  // Ensure the flag is returned
    }

    console.log(`${itemType} data structure`, JSON.stringify(itemName, null, 2));

    // Find the matching item from the items data: exact case-insensitive first, then ignoring a
    // parenthesised compendium suffix ("Belt of Physical Might +2 (Str & Dex)") the backend's
    // item data doesn't encode.
    const itemNameLc = itemName.toLowerCase();
    let matchedItem = items.find(r => r.name.toLowerCase() === itemNameLc);
    if (!matchedItem) {
      matchedItem = items.find(r => r.name.split(' (')[0].toLowerCase() === itemNameLc);
      if (matchedItem) console.log(`${itemType} "${itemName}" matched compendium variant "${matchedItem.name}".`);
    }
    // Clone the ONE matched row rather than the bundle: every_item.json is 25 MB and this runs
    // once per worn item. Everything below stamps proficiency, enhancements and buff overlays onto
    // this object and then appends it to the sheet by reference.
    if (matchedItem) matchedItem = structuredClone(matchedItem);

    if (!matchedItem) {
      // Slot equipment: build the item from backend data (name + description + parsed buffs)
      // instead of substituting an unrelated default — a synthesized row keeps the real item.
      if (opts.synthesizeOnMiss) {
        console.warn(`${itemType} "${itemName}" not in compendium — synthesizing from backend data.`);
        const details = opts.detailsByName?.[buffKeyLc] || {};
        const synthesized = synthesizeEquipmentItem(itemName, details.description, details.slot);
        applyBuffData(ctx, synthesized, ctx.itemChangesMap[buffKeyLc]);
        collectedByType(ctx)[itemType] = [synthesized];
        appendJsonToTemplate([synthesized], exportTemplate, itemType);
        return defaultItemNameFlag;
      }

      console.warn(`${itemType} "${itemName}" not found, using default item.`);
      // Try to use the default item if the selected one is not found
      const found = items.find(r => r.name === defaultItemName);
      const defaultMatchedItem = found ? structuredClone(found) : undefined;   // same reason as above
      if (defaultMatchedItem) {
        if (defaultItemNameFlag === 0) {
          // Set the proficient section to true
          defaultMatchedItem.system.proficient = true;
          // Weapons stay inventory-only (pf1 v11 filters the Combat tab on system.showInCombat):
          // the rollable entry is the attack-type twin from createScalingAttackItem(), whose
          // stripped description keeps the roll card clean while the weapon keeps the full rules
          // text. Explicit false — compendium extracts may bake true.
          if (itemType === "Weapon") defaultMatchedItem.system.showInCombat = false;

          appendEnhancementsToDescription(defaultMatchedItem, enhancementList);
          collectedByType(ctx)[itemType] = [defaultMatchedItem];
          appendJsonToTemplate([defaultMatchedItem], exportTemplate, itemType);
          console.log(`Successfully added default ${itemType} data to the export template.`);

          // Set the flag to 1 to avoid adding default again
          return 1; // Set flag here to indicate the default item has been added
        }
      } else {
        console.error(`Default ${itemType} "${defaultItemName}" also not found.`);
      }
      return defaultItemNameFlag;  // Ensure the flag is returned
    }

    // Set the proficient section to true
    matchedItem.system.proficient = true;
    // Weapons stay inventory-only (pf1 v11 filters the Combat tab on system.showInCombat): the
    // rollable entry is the attack-type twin from createScalingAttackItem(), whose stripped
    // description keeps the roll card clean while the weapon keeps the full rules text.
    // Explicit false — compendium extracts may bake true.
    if (itemType === "Weapon") matchedItem.system.showInCombat = false;

    // Append enhancements to the item (only once)
    console.log(matchedItem);
    appendEnhancementsToDescription(matchedItem, enhancementList);

    // Overlay backend-parsed changes/context notes (deduped against what the compendium item
    // already automates, so e.g. Circlet of Persuasion's official change never double-applies).
    applyBuffData(ctx, matchedItem, ctx.itemChangesMap[buffKeyLc]);

    collectedByType(ctx)[itemType] = [matchedItem];

    // Append the matched item to the exportTemplate
    appendJsonToTemplate([matchedItem], exportTemplate, itemType);


    console.log(`Successfully added ${itemType} data to the export template.`);
    return defaultItemNameFlag;  // Ensure the flag is returned

  } catch (error) {
    console.error(`Error reading or processing the ${itemType} Section:`, error);
    return defaultItemNameFlag;  // Ensure the flag is returned
  }
}

// Slot equipment. Every name in equipment_list becomes an actor item: compendium match when the
// name resolves (exact or parenthesised-variant), otherwise synthesized from the backend's own
// name/description/slot (equip_descrip) — never a substituted default, and a miss never aborts
// the rest of the list.
async function processEquipment(ctx) {
  const characterData = ctx.characterData;
  // Check if equipment_list exists and is an array
  if (!Array.isArray(characterData.equipment_list)) {
    console.error('equipment_list is not an array or is missing');
    return;
  }

  // equip_descrip: {slot: {item_name, description}} -> lowercase name -> {slot, description}
  const detailsByName = {};
  for (const [slot, details] of Object.entries(characterData.equip_descrip || {})) {
    if (details && details.item_name) {
      detailsByName[String(details.item_name).toLowerCase()] = {
        slot,
        description: typeof details.description === 'string' ? details.description.trim() : '',
      };
    }
  }

  for (const item of characterData.equipment_list) {
    await processItem(ctx, "WondrousItem", 'everyItem', item, '', "", 1,
                      { synthesizeOnMiss: true, detailsByName });
  }
}

export async function addEquipment(ctx) {
  const characterData = ctx.characterData;

  //Weapon with default fallback to "Longsword"
  await processItem(ctx, "Weapon", 'everyWeapon', characterData.weapon_name, characterData.weapon_enhancement_chosen_list, "Longsword", 0);

  //Armor with default fallback to "Leather Armor"
  await processItem(ctx, "Armor", 'everyArmor', characterData.armor_name, characterData.armor_enhancement_chosen_list, "Leather Armor", 0);

  await processEquipment(ctx);
}

// ----- Ammo ----- //
async function select_random_ammo(ctx, ammo_type) {
  // Retrieve the weapons data by template name
  const weapons = ctx.templates.everyWeapon;

  // Check if weapons is an array
  if (!Array.isArray(weapons)) {
    console.error('Weapons data is not an array or is undefined:', weapons);
    return;
  }

  // Filter weapons where subType is "ammo" and extraType matches ammo_type
  const filteredAmmo = weapons.filter(
    weapon => weapon.system.subType === "ammo" && weapon.system.extraType === ammo_type
  );

  // Check if any matching ammo was found
  if (filteredAmmo.length === 0) {
    console.warn(`No ammo found with subType "ammo" and extraType "${ammo_type}".`);
    return;
  }

  // Select a random ammo from the filtered list.
  // The ONLY semantic use of randomness in this file: it changes what is on the sheet, not just an
  // id, so the golden harness has to seed it rather than normalise it away. See main()'s deps block.
  // Cloned before it goes on the sheet: nothing here writes to it, but the trait-shape
  // normalization pass at the end of the build rewrites system fields on every item in
  // exportTemplate.items -- which would reach back into the loaded weapon table.
  const randomAmmo = structuredClone(filteredAmmo[Math.floor(ctx.rng() * filteredAmmo.length)]);

  // Log the selected ammo
  console.log("Selected random ammo:", randomAmmo);

  // Perform any additional actions with the selected ammo
  appendJsonToTemplate([randomAmmo], ctx.exportTemplate, "Ammo");
}

export async function addAmmo(ctx) {
  const collectedWeapons = collectedByType(ctx).Weapon;

    console.log("collectedWeapons:", collectedWeapons[0].system.ammo.type);
  // Check if collectedWeapons, its system property, and ammo exist
  if (!collectedWeapons[0] || !collectedWeapons[0].system || !collectedWeapons[0].system.ammo || !collectedWeapons[0].system.ammo.type) {
    console.log("No ammo found or ammo type is missing. Ending function.");
    return; // End the function
  }

  // Access the ammo type
  const ammo_type = collectedWeapons[0].system.ammo.type;
  console.log("Ammo type:", ammo_type);

  // Continue with the rest of the function
  select_random_ammo(ctx, ammo_type);
}
