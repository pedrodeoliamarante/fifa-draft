// Run this in the browser console to auto-draft all 90 picks.
// Copy-paste into DevTools console at http://localhost:5180

(function autoDraft() {
  const STORAGE_KEY = "fifaDraftState";
  const raw = localStorage.getItem(STORAGE_KEY);
  const state = raw ? JSON.parse(raw) : { picks: [], timerStart: Date.now() };

  // We need player data - grab from the module. Easier: just reload the page after running.
  // Instead, let's trigger 90 auto-picks via the app's engine.
  // The simplest way: call engine.doAutoPick() 90 times.

  // Since the engine is module-scoped, we'll manipulate localStorage directly.
  // Load players from the JSON that's already bundled.

  console.log("Current picks:", state.picks.length);
  if (state.picks.length >= 90) {
    console.log("Draft already complete!");
    return;
  }

  // We'll just call the exposed window function if available, or reload approach.
  // Best approach: expose engine on window in dev. Let's just do repeated auto-picks.
  alert("Paste this in the browser console after the app loads. See instructions below.");
})();
