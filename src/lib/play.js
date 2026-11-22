// Shared play gate. Idea pages wait on the template Start button.
// Peek and stills run immediately (muted / posed).
// Homepage tiles (live peek iframes and captured stills) never show
// in-game score / hits / best / counters — keep that HUD off in preview.

export function isLive() {
  const b = document.body
  return (
    b.classList.contains('is-live') ||
    b.classList.contains('is-peek') ||
    b.classList.contains('is-still')
  )
}

export function showScoreHud({ peek, still, preview } = {}) {
  return !peek && !still && !preview
}
