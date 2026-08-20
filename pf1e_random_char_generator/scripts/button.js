import { runGenerator, openGeneratorDialog } from './generator-launch.js';
import { FLOATING_BUTTON_ID, syncFloatingButtonVisibility } from './button-locations.js';

/** Breathing room between the button and the player list it sits above. */
const BUTTON_GAP_PX = 8;
/** Never sit lower than this fraction of the viewport — the original hardcoded `bottom: 10%`. */
const BUTTON_MIN_BOTTOM = 0.10;

/**
 * Park the button just above Foundry's player list.
 *
 * The button is `position: fixed` in the bottom-left, which is exactly where Foundry puts the player
 * list — so on a table with enough players the list grows tall enough to cover the button completely
 * and there is no way to click it at all. That was the whole bug: not that the button was too low,
 * but that its height was a constant while the thing underneath it is not.
 *
 * So measure rather than guess. A taller constant would only be right for one table size, and would
 * be wrong again the day someone else logs in. Reading `#players` live also handles the cases a
 * constant cannot: the list being collapsed, and Foundry moving it between versions (this module
 * supports v10 through v13) — if the element is missing entirely we simply keep the old 10%.
 */
function positionButton(button) {
  const viewport = window.innerHeight;
  let bottom = viewport * BUTTON_MIN_BOTTOM;

  const players = document.getElementById('players');
  if (players) {
    const rect = players.getBoundingClientRect();
    // `viewport - rect.top` is the distance from the bottom of the screen to the TOP of the list,
    // which is the shortest `bottom` that still clears it.
    if (rect.height > 0) bottom = Math.max(bottom, viewport - rect.top + BUTTON_GAP_PX);
  }

  // A list tall enough to fill the screen must not push the button off the top of it.
  const maxBottom = Math.max(viewport - button.offsetHeight - BUTTON_GAP_PX, 0);
  button.style.bottom = `${Math.min(bottom, maxBottom)}px`;
}

// Function to create the persistent button
// need export so we can import in main.js
export async function createPersistentButton() {
  const button = document.createElement('button');
  button.textContent = "Character Generator";
  button.id = FLOATING_BUTTON_ID;

  // Button Style options
  button.style.position = 'fixed';
  button.style.left = '2%';
  button.style.width = '125px';
  button.style.height = '75px';
  button.style.border = '1px solid #ccc';
  button.style.borderRadius = '5px';
  button.style.backgroundColor = '#333';
  button.style.color = 'white';
  button.style.fontSize = '12px';
  button.style.cursor = 'pointer';
  button.style.textAlign = 'center';
  button.style.lineHeight = '50px';

  // Add event listener to show the dialog when clicked
  // clicking the persistent button should only show the dialog
  //
  // Deliberately un-awaited and side by side: the dialog edits the inputs for the NEXT run while
  // the generation below builds a character from the ones already saved. That is what this button
  // has always done, and the extraction into generator-launch.js does not change it.
  button.addEventListener('click', async () => {
    openGeneratorDialog();
    await runGenerator();
  });

  // Add dragging functionality
  let isDragging = false;
  let offsetX, offsetY;
  // Once the user has placed the button by hand, stop moving it for them. Dragging sets `top`,
  // which wins over `bottom` on an over-constrained fixed element, so auto-positioning would not
  // visibly fight the drag -- it would just silently stop working, which is worse than not running.
  let hasBeenDragged = false;

  button.addEventListener('mousedown', (event) => {
      isDragging = true;
      offsetX = event.clientX - button.getBoundingClientRect().left;
      offsetY = event.clientY - button.getBoundingClientRect().top;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
  });

  function onMouseMove(event) {
      if (!isDragging) return;
      const newX = event.clientX - offsetX;
      const newY = event.clientY - offsetY;
      hasBeenDragged = true;
      button.style.bottom = '';        // hand `top` an unambiguous element to position
      button.style.left = `${newX}px`;
      button.style.top = `${newY}px`;
  }

  function onMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
  }

  // Hidden until proven wanted. This runs at module load — before "init", so before the settings
  // exist — and a button that flashes on screen for a second before the setting hides it is worse
  // than one that appears a moment late. `ready` below is the first point the answer is knowable.
  button.hidden = true;
  document.body.appendChild(button);

  // Place it now, then again whenever the thing it sits above can have changed size: the player
  // list re-renders on every join, leave and connection change, and a window resize moves the floor
  // under both of them. `renderPlayerList` fires after Foundry has drawn the list, so the
  // measurement reads the new height rather than the one being replaced.
  const reposition = () => { if (!hasBeenDragged) positionButton(button); };
  reposition();
  Hooks.on('renderPlayerList', reposition);
  window.addEventListener('resize', reposition);

  Hooks.once('ready', () => {
    syncFloatingButtonVisibility();
    reposition();
  });
}
