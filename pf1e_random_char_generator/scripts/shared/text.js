/**
 * Pure string helpers shared across the build.
 *
 * Everything here takes its input as an argument and returns a value -- no closure state, no
 * Foundry globals, no template data. That is the entry requirement for this file: a helper that
 * needs the build context belongs on the context, and a helper only one stage uses belongs in that
 * stage's module.
 *
 * `capitalizeWords` lived here twice before this file existed -- byte-identical in
 * `modify-abilities.js` and `createCharacter.js` -- and `sphereNorm`/`powNorm` are each read by
 * their own stage AND by the conditional engine, which is why the normalizers sit here rather than
 * with the code that owns the rules they normalize for.
 */

/** Title-case a string, leaving small joining words lowercase and Roman numerals fully upper. */
export function capitalizeWords(str) {
  // Ensure str is a string before attempting to split
  if (typeof str !== 'string') {
    console.error('Expected a string, but received:', str);
    return str; // Return the value unchanged if it's not a string
  }

  const ignoreWords = ['of', 'the', 'and', 'in', 'on', 'at', 'to', 'with', 'from'];

  // List of specific Roman numerals to capitalize
  const romanNumerals = ['ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];

  return str
    .split(' ') // Split the string into an array of words
    .map((word, index) => {
      // Lowercase the word for comparison
      const lowerWord = word.toLowerCase();

      // Capitalize Roman numerals
      if (romanNumerals.includes(lowerWord)) {
        return word.toUpperCase();
      }

      // Capitalize the first letter if it's the first word or not in ignoreWords
      if (index === 0 || !ignoreWords.includes(lowerWord)) {
        return word
          .split('-') // Handle hyphenated words
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join('-');
      } else {
        // Keep the word in lowercase if it's in the ignore list and not the first word
        return word.toLowerCase();
      }
    })
    .join(' '); // Join all words together
}

/** Upper-case the first character only, leaving the rest of the string untouched. */
export function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

/** Upper-case the first character of every word, leaving the rest of each word untouched. */
export function toTitleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Stringify preserving the original key order.
 *
 * `JSON.stringify` is already insertion-ordered for string keys, but this walks the object itself
 * so the ordering is a property of this function rather than of the engine -- these strings end up
 * inside item descriptions on the sheet, and a reordered dump would be a visible diff.
 */
export function stableStringify(obj) {
  if (Array.isArray(obj)) {
    return `[${obj.map(stableStringify).join(',')}]`;
  } else if (obj && typeof obj === 'object') {
    const keys = Object.keys(obj); // preserve original key order
    const keyValuePairs = keys.map(key => `"${key}":${stableStringify(obj[key])}`);
    return `{${keyValuePairs.join(',')}}`;
  } else {
    return JSON.stringify(obj);
  }
}

/** Render an arbitrary feature-data object as a titled HTML list for an item description. */
export function convertToStringSimple(key, featureData) {
  if (!featureData || typeof featureData !== "object") {
      return "<p>No feature data available.</p>";
  }

  // A nested plain object becomes its OWN sub-heading and list rather than a JSON blob. Sections
  // that carry several kinds of thing (the E-Kat Exchange: your reserve, the feats you took, the
  // actions you can spend on) read as one undifferentiated twenty-row wall otherwise -- and a
  // stringified object in a description was never useful to anyone. Flat sections are untouched:
  // same markup as before, byte for byte.
  const isGroup = v => v && typeof v === "object" && !Array.isArray(v);
  const row = (k, v) =>
    `<li><strong>${k}:</strong> ${typeof v === "object" ? stableStringify(v, null, 2) : v}</li>`;

  const entries = Object.entries(featureData);
  const flat = entries.filter(([, v]) => !isGroup(v));
  const groups = entries.filter(([, v]) => isGroup(v));

  let htmlString = `<p><strong>${key}</strong></p>`;
  if (flat.length) htmlString += `<ul>${flat.map(([k, v]) => row(k, v)).join("")}</ul>`;
  for (const [groupName, groupValue] of groups) {
    htmlString += `<p><strong>${groupName}:</strong></p><ul>`
      + Object.entries(groupValue).map(([k, v]) => row(k, v)).join("")
      + "</ul>";
  }
  return htmlString;
}

/**
 * Normalize a sphere talent name for compendium matching: drop a trailing " (variant)" and any
 * " [source]" tag (the backend sends e.g. "Ragdoll Swing (impale)" / "... [apoc]"; the pf1spheres
 * compendium name is just "Ragdoll Swing"), then lowercase / strip apostrophes / collapse spaces.
 */
export function sphereNorm(s) {
  return String(s).split(' (')[0].replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .toLowerCase().replace(/['’`]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Apostrophe-/case-/whitespace-insensitive key for matching backend scrape names (which often
 * lose apostrophes, e.g. "Pit Fighters Stance") against pf1-pow compendium names.
 */
export function powNorm(s) {
  return String(s)
    // pf1-pow ships 12 of its 1,067 documents with a DOUBLE-ENCODED apostrophe in the name --
    // "Turtle Knightâ€™s Stance", "Donâ€™t Die On Me" -- the UTF-8 bytes of U+2019 stored as three
    // Windows-1252 characters. The other 76 apostrophe-bearing names in the same pack are fine, and
    // the other three packs have none, so this is that module's data and not an encoding fault on
    // our side. Stripped before the apostrophe fold below, which only knows about real quote marks:
    // without this every one of those twelve misses its compendium match and arrives as a
    // synthesized feat item with no automation, no (Strike)/(Stance) type prefix, and -- for the
    // four stances -- no stance buff. Found by the golden harness, which recorded the miss.
    .replace(/â€™/g, '')
    .toLowerCase().replace(/['’`]/g, '').replace(/\s+/g, ' ').trim();
}
