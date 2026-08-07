/**
 * The module's debug channel.
 *
 * ## Why this is not just `console.log`
 *
 * The build narrated itself through 100 `console.log` calls and there was no way to turn them off
 * short of editing the files. Two costs, and the second is the one that matters:
 *
 *   - Volume. A single generation emits ~150-220 lines, which buries anything else on the console.
 *   - RETENTION. Chrome's devtools keeps a live reference to every object it was handed, so logging
 *     an item object means that object cannot be collected for as long as the console holds it. A
 *     run that logs hundreds of them pins hundreds, for the session.
 *
 * Silent by default fixes both, and costs nothing when off: `log.debug` returns before touching its
 * arguments, so nothing is formatted, serialised or retained.
 *
 * **Pass objects, not `JSON.stringify(obj, null, 2)`.** Arguments are evaluated before the call, so
 * a stringify inside a silenced `log.debug` still runs and still builds the string — the one cost
 * this module cannot avoid for you. Handing the object over is also strictly better when logging IS
 * on, because devtools renders it as an inspectable tree instead of flat text.
 *
 * ## What stays on `console`
 *
 * `console.warn` and `console.error` are deliberately NOT routed through here. They are diagnostics
 * a GM needs to see when something is wrong -- a feat that did not resolve, a template that failed
 * to load -- and silencing those by default would hide real failures. The golden harness also
 * records both in its snapshots, so they are part of the tested surface rather than chatter.
 */

let enabled = false;

/** Turn the debug channel on or off. Returns the new state. */
export function setLogging(on) {
  enabled = !!on;
  return enabled;
}

/** Whether the debug channel is currently on. */
export function loggingEnabled() {
  return enabled;
}

export const log = {
  /** Build narration. Silent unless the Verbose logging setting (or api.setLogging) turned it on. */
  debug: (...args) => {
    if (enabled) console.log(...args);
  },
};
